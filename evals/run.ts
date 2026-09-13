/**
 * Evaluates the extraction agent.
 *
 *   pnpm eval                 one trial per fixture
 *   pnpm eval --trials 3      three trials, to measure run-to-run variance
 *   pnpm eval --only platform-sync
 *
 * Writes evals/results.json alongside the console report.
 */

import { writeFileSync } from 'node:fs';
import { extractTickets } from '../lib/extract';
import { ExtractionSchema, type Extraction } from '../lib/types';
import { checkExtraction, type Check } from './checks';
import { FIXTURES } from './fixtures';
import { judgeTicket, ollamaAvailable, summarise, JUDGE_MODEL, type Verdict } from './judge';

const arg = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const TRIALS = Number(arg('--trials') ?? 1) || 1;
const ONLY = arg('--only');
const NO_JUDGE = process.argv.includes('--no-judge');

const G = '\x1b[32m', R = '\x1b[31m', D = '\x1b[2m', B = '\x1b[1m', O = '\x1b[0m';

async function extractOnce(notes: string): Promise<Extraction> {
  const { partialOutputStream } = extractTickets(notes);
  let last: unknown = null;
  for await (const partial of partialOutputStream) last = partial;

  const parsed = ExtractionSchema.safeParse(last);
  if (!parsed.success) throw new Error(`invalid extraction: ${parsed.error.message}`);
  return parsed.data;
}

type TrialResult = {
  fixture: string;
  trial: number;
  checks: Check[];
  verdicts?: Verdict[];
  error?: string;
};

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set.');
    process.exit(1);
  }

  const fixtures = ONLY ? FIXTURES.filter((f) => f.name === ONLY) : FIXTURES;
  if (fixtures.length === 0) {
    console.error(`No fixture named "${ONLY}".`);
    process.exit(1);
  }

  console.log(`${B}Neuva — extraction eval${O}`);
  console.log(`${D}${fixtures.length} fixtures × ${TRIALS} trial${TRIALS > 1 ? 's' : ''}${O}\n`);

  const judging = !NO_JUDGE && (await ollamaAvailable());
  if (judging) {
    console.log(`${D}LLM judge: ${JUDGE_MODEL} via Ollama${O}\n`);
  } else if (!NO_JUDGE) {
    console.log(`${D}LLM judge skipped — Ollama or ${JUDGE_MODEL} unavailable${O}\n`);
  }

  const started = Date.now();
  const results: TrialResult[] = [];

  // Fixtures run in parallel; trials within a fixture stay sequential so a
  // rate limit degrades one fixture rather than corrupting the whole run.
  await Promise.all(
    fixtures.map(async (fx) => {
      for (let trial = 1; trial <= TRIALS; trial++) {
        try {
          const extraction = await extractOnce(fx.notes);
          const checks = checkExtraction(fx, extraction);

          // Judged sequentially: a local model has one GPU and parallel
          // requests just queue while making timeouts more likely.
          let verdicts: Verdict[] | undefined;
          if (judging) {
            verdicts = [];
            for (const ticket of extraction.tickets ?? []) {
              const v = await judgeTicket(ticket, fx.notes);
              if (v) verdicts.push(v);
            }
          }

          results.push({ fixture: fx.name, trial, checks, verdicts });
        } catch (err) {
          results.push({
            fixture: fx.name,
            trial,
            checks: [],
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }),
  );

  let passed = 0;
  let total = 0;

  for (const fx of fixtures) {
    const runs = results.filter((r) => r.fixture === fx.name).sort((a, b) => a.trial - b.trial);
    const fxPassed = runs.flatMap((r) => r.checks).filter((c) => c.passed).length;
    const fxTotal = runs.flatMap((r) => r.checks).length;
    passed += fxPassed;
    total += fxTotal;

    console.log(`${B}${fx.name}${O}  ${fxPassed}/${fxTotal}`);

    for (const run of runs) {
      if (run.error) {
        console.log(`  ${R}ERROR${O} trial ${run.trial}: ${run.error}`);
        continue;
      }
      const prefix = TRIALS > 1 ? `  ${D}trial ${run.trial}${O}` : '';
      if (prefix) console.log(prefix);
      for (const c of run.checks) {
        console.log(
          `    ${c.passed ? `${G}PASS${O}` : `${R}FAIL${O}`}  ${c.name.padEnd(24)} ${D}${c.detail}${O}`,
        );
      }
    }
    console.log('');
  }

  const pct = total ? ((passed / total) * 100).toFixed(1) : '0.0';
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`${B}Total ${passed}/${total} (${pct}%)${O} in ${seconds}s`);

  // Checks that failed at least once are the useful summary — a check that is
  // flaky across trials matters more than one that failed in isolation.
  const byCheck = new Map<string, { pass: number; fail: number }>();
  for (const r of results) {
    for (const c of r.checks) {
      const e = byCheck.get(c.name) ?? { pass: 0, fail: 0 };
      c.passed ? e.pass++ : e.fail++;
      byCheck.set(c.name, e);
    }
  }
  const flaky = [...byCheck.entries()].filter(([, v]) => v.fail > 0);
  if (flaky.length) {
    console.log(`\n${B}Checks that failed at least once${O}`);
    for (const [name, v] of flaky) {
      console.log(`  ${name.padEnd(24)} ${v.pass}/${v.pass + v.fail}`);
    }
  }

  // Judge report. Quality scores, not pass/fail — a small local model is a
  // second opinion, not an oracle, so low scores are shown for a human to read.
  const allVerdicts = results.flatMap((r) => r.verdicts ?? []);
  const judgeSummary = summarise(allVerdicts);

  if (judgeSummary) {
    console.log(`\n${B}LLM judge${O} ${D}(${JUDGE_MODEL}, ${judgeSummary.judged} tickets)${O}`);
    const bar = (v: number) => '█'.repeat(Math.round(v)) + '░'.repeat(5 - Math.round(v));
    console.log(`  faithfulness  ${bar(judgeSummary.faithfulness)}  ${judgeSummary.faithfulness}/5`);
    console.log(`  specificity   ${bar(judgeSummary.specificity)}  ${judgeSummary.specificity}/5`);
    console.log(`  usefulness    ${bar(judgeSummary.usefulness)}  ${judgeSummary.usefulness}/5`);

    if (judgeSummary.concerns.length) {
      console.log(`\n  ${D}flagged for review:${O}`);
      for (const c of judgeSummary.concerns.slice(0, 6)) {
        console.log(
          `    ${D}f${c.faithfulness} s${c.specificity} u${c.usefulness}${O}  ${c.title.slice(0, 54)}`,
        );
        console.log(`      ${D}${c.comment}${O}`);
      }
    }
  }

  writeFileSync(
    new URL('./results.json', import.meta.url),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        model: process.env.PLANNER_MODEL ?? 'claude-sonnet-5',
        trials: TRIALS,
        durationSeconds: Number(seconds),
        total: { passed, total, percent: Number(pct) },
        byCheck: Object.fromEntries(byCheck),
        judge: judgeSummary ? { model: JUDGE_MODEL, ...judgeSummary } : null,
        results,
      },
      null,
      2,
    ),
  );
  console.log(`\n${D}Wrote evals/results.json${O}`);

  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
