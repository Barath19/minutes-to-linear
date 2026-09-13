# Neuva
<img width="1110" height="439" alt="Screenshot 2026-09-14 at 01 10 51" src="https://github.com/user-attachments/assets/71c5b6c6-37f4-4dea-9e4e-107b52877630" />

**An agent that reads a meeting, works out what it committed you to, and files it** — issues in
Linear, follow-up meetings on your calendar, and a digest to the team. With a human approval
step before anything is written.

### 📺 [Two-minute demo](https://youtu.be/Co7SFZgiTnk) · 💻 [Repository](https://github.com/Barath19/neuva) (public)

---

## Submission checklist

| Requirement | Where |
|---|---|
| ✅ Project overview | [What it does](#what-it-does) · [Why it gets the hard cases right](#why-it-gets-the-hard-cases-right) |
| ✅ External apps used | [External applications](#external-applications) — Notion, Linear, Cal.com, Slack |
| ✅ Setup instructions | [Setup](#setup) — env table, plus the four traps that look like broken credentials |
| ✅ How reliability was tested | [Evaluation](#evaluation) — 114/114 structural checks + an independent local LLM judge |
| ✅ Two-minute demo | **https://youtu.be/Co7SFZgiTnk** |
| ✅ Judges can access the repo | Public, no credentials needed to clone |
| ✅ Multi-step across 3+ apps | One approval drives four apps: import from Notion, then write to Linear, Cal.com and Slack |

**Architecture:** [`docs/architecture.excalidraw`](docs/architecture.excalidraw) —
[open in Excalidraw](https://excalidraw.com/#json=zgc6EeuptA-23MxnWfsXG,4X_0lXJSR_jlhRWIQiv_bA)
<img width="908" height="704" alt="Screenshot 2026-09-14 at 01 12 06" src="https://github.com/user-attachments/assets/954f221b-098a-4b9c-82b7-c3f3dbf3c01e" />
<img width="1272" height="883" alt="Screenshot 2026-09-14 at 01 11 30" src="https://github.com/user-attachments/assets/7f49b49d-af91-432f-ba02-26a5fbdb5adb" />
<img width="789" height="497" alt="Screenshot 2026-09-14 at 01 19 18" src="https://github.com/user-attachments/assets/2b54ae07-19f7-4008-82af-a472fe4e4aa6" />

---

The interesting part is not "LLM makes tickets." It is everything the agent decides **not** to
do. Work that was explicitly parked, decisions with no action attached, and status chatter all
have to stay out, or the tool creates more cleanup than it saves.

---

## What it does

```
Notion page ──▶ enumerate ──▶ draft ──▶ YOU APPROVE ──▶ Linear issues
 or pasted        action       tickets        │      ──▶ Cal.com booking
 notes            items        + meetings     │      ──▶ Slack digest
                                              │
                        edit · reassign · reprioritise · exclude
```

Nothing reaches an external app until you approve. Every ticket carries the verbatim sentence
it came from, so you can check the agent's work without re-reading the notes.

## External applications

| App | Direction | What the agent does |
|---|---|---|
| **Notion** | import | Lists pages shared with the integration and pulls one in as plain text |
| **Anthropic** | reasoning | Two-pass structured extraction from unstructured notes |
| **Linear** | write | Creates issues in a project; resolves assignees and labels; links blockers |
| **Cal.com** | write | Books follow-up meetings against live availability |
| **Slack** | write | Posts a digest deep-linking every issue and booking |

Every integration is optional except Anthropic and Linear. Missing credentials disable that
stage and say so in the header — they never break a run.

---

## Why it gets the hard cases right

Extraction runs in two passes inside a single structured generation. The schema forces
`actionItems` to be produced **before** `tickets` — field order drives generation order, so the
model must enumerate exhaustively before it starts writing. Without this it reasons at length
and then emits two tickets.

The agent then makes a three-way split. From the sample notes:

| Ticket | Assignee | Priority | Note |
|---|---|---|---|
| Implement server-side OIDC endpoints | Priya | medium | |
| Migrate mobile clients off session cookies | Dev | medium | **blocked by** the ticket above |
| Write incident runbook and check it into the repo | Dev | high | |
| Document the rate limiter decision | Maya | medium | |
| Track staging database full issue | — | low | "low priority" honoured |
| Cap billing webhook retries at 5 | Sam | **urgent** | "drop everything" honoured |

And one line does all three jobs at once:

> *"Also — should we upgrade to Postgres 17?"* → *"Not now. Park it, we'll revisit after the
> auth work lands."*

- **No ticket.** It was explicitly parked.
- **A decision**, recorded as context.
- **A meeting booked** for 2026-09-27, because "revisit" means a conversation, scheduled after
  the work it depends on.

An agent that ticketed all eight items would be worse than useless. That distinction is the
whole product.

### Dates: proposed by the model, chosen by the calendar

The model only knows what the notes say, so it emits the *earliest sensible* date. Cal.com
knows real availability, so it picks the actual slot from the host's working hours. Dates in
the past clamp to now.

---

## Evaluation

```bash
pnpm eval                  # 5 fixtures, structural checks + local LLM judge
pnpm eval --trials 3       # measure run-to-run variance
pnpm eval --no-judge       # structural checks only
```

Two layers, because they catch different things.

### Layer 1 — structural checks (`evals/checks.ts`)

Nine properties per fixture, all decidable mechanically. The important ones:

| Check | What it catches |
|---|---|
| **source quotes grounded** | Every `sourceQuote` must appear *verbatim in the notes*. A fabricated quote is a hallucination with no judgment call involved. |
| **no invented work** | Parked, deferred and already-finished items must never become tickets |
| **coverage** | Every real commitment became a ticket |
| **no invented assignees** | Names must exist in the notes |
| **priority inferred** | "drop everything" → urgent, "low priority" → low |
| **blocking captured** | Stated dependencies become `blockedBy`, with no dangling refs |
| ticket / follow-up counts in range | Neither padded nor truncated |
| tickets well-formed | Every ticket is usable by the Linear stage |

Fixtures deliberately include three meetings that should produce **nothing**: pure
status updates, a coffee chat, and a roadmap review where every item was deferred.
Over-extraction is the failure mode that makes this category of tool useless.

**Latest run: 114/114 across 5 fixtures × 3 trials.** Every check passed on every
trial — no intermittent failures. Full output in [`evals/results.json`](evals/results.json).

| Check | Pass rate |
|---|---|
| coverage | 15/15 |
| no invented work | 15/15 |
| source quotes grounded | 15/15 |
| no invented assignees | 15/15 |
| ticket / follow-up counts in range | 15/15 |
| tickets well-formed | 15/15 |
| priority inferred | 6/6 |
| blocking captured | 3/3 |

> Read this carefully rather than generously. Stability across trials is the meaningful
> result — it shows the behaviour is repeatable, not that one lucky run happened. A
> uniform 100% still raises the question of whether the thresholds are demanding enough,
> which is why the judge below exists: it scores quality the pass/fail checks cannot see,
> and it does **not** return full marks.

### Layer 2 — LLM as judge (`evals/judge.ts`)

Structural checks cannot tell you whether a ticket is *good* — only whether it is
well-formed and grounded. A local **gemma3:4b** via Ollama scores each ticket 1-5 on
faithfulness, specificity and usefulness.

The judge is deliberately a **different model family from the one being graded**. A
model scoring its own output is not independent evidence and shares its blind spots.

```
LLM judge (gemma3:4b, 27 tickets)
  faithfulness  █████  4.74/5
  specificity   ████░  3.85/5
  usefulness    ████░  4.00/5

flagged for review:
  f5 s3 u1  Reduce noise in alerting thresholds
            accurately reflects the notes but lacks detail and context
  f3 s3 u4  Track and resolve staging database full-disk issue
            misses key details about urgency and the specific action required
```

**Specificity scores lowest, consistently across trials** — titles are faithful but
less concrete than they should be. Three of 27 tickets were flagged, and reading them
back, the judge is right: *"Reduce noise in alerting thresholds"* does not say which
thresholds or by how much.

That is a real weakness, found by the layer that returns a distribution rather than a
pass mark. It is the clearest argument for having both layers: the structural checks
score 100% on exactly the tickets the judge is unhappy with.

It is a signal, not an oracle: a 4B model is noisy, so scores are reported as a
distribution and low-scoring tickets are surfaced for a human rather than failing the
run. The eval passes with the judge offline.

---

## Reliability

Failure modes that are handled rather than hoped away:

- **Silent truncation.** A reasoning model spends most of its output budget thinking
  before the first ticket appears; the default ceiling cuts the array mid-flight and
  returns a *valid-looking* short list. The route inspects `finishReason` and fails
  loudly instead of silently dropping tickets.
- **Streaming errors.** `streamText` surfaces provider failures as stream events rather
  than throwing, so an `onError` hook forwards them. Otherwise a rejected API key is
  indistinguishable from "this meeting had no action items."
- **Half-built objects.** Tickets stream in field by field, so one can have a title
  while `labels` is still undefined. Every partial is hydrated before rendering —
  replaying a real extraction showed 140 of 275 frames would crash naive rendering.
- **Invisible Notion content.** Notion's AI meeting recorder wraps transcripts in an
  undocumented `transcription` block holding no text of its own. Traversal is
  independent of whether a block contributes text.
- **Invented assignees.** Names are matched against real workspace members. No match
  means unassigned — never a guess.

### Durable execution

The filing phase runs as a **Temporal** workflow, so a crash mid-run resumes rather
than restarts.

```bash
pnpm temporal    # dev server + UI on :8233
pnpm worker      # activity worker
```

Each external call is an activity with its own retry policy, because the services fail
differently: Linear rate-limits bursts and gets patient backoff, Cal.com can lose a
race for a slot and retries quickly, Slack fails fast as the last and least essential
step. The workflow is deterministic by construction — no I/O, clock reads or
randomness outside activities — which is what makes replay sound, and the workflow id
doubles as an idempotency key.

Without it, a crash left issues created, no booking, no digest, and no record of where
it stopped. The execution history is now inspectable in the Temporal UI rather than
inferred from logs.

## Setup

Node 20+, pnpm.

```bash
pnpm install
cp .env.example .env.local
pnpm dev                       # http://localhost:3000
```

The header shows every connection independently and explains any that are missing.

| Variable | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | Workspace-scoped. An org-level key also works with `ANTHROPIC_WORKSPACE_ID`. |
| `LINEAR_API_KEY` | yes | Personal API key. |
| `LINEAR_TEAM_ID` | no | Defaults to the first team the key can see. |
| `LINEAR_PROJECT_ID` | no | Files issues under one project instead of the team backlog. |
| `SLACK_BOT_TOKEN` | no | Needs `chat:write` and `chat:write.public`. |
| `SLACK_CHANNEL` | no | Channel name or id. |
| `CALCOM_API_KEY` | no | cal.com → Settings → Developer → API keys. |
| `NOTION_TOKEN` | no | Internal integration token. |

### Four traps that all look like broken credentials

> **`LINEAR_PROJECT_ID` is the project UUID**, not the short id in the project URL. A URL ending
> `…/multiapp-project-bd502c1a1457` does not contain the id the API accepts. Query
> `projects { nodes { id name } }` for the real one.

> **An unquoted `#` starts a comment in `.env` files.** `SLACK_CHANNEL=#team` silently parses as
> empty. Use `SLACK_CHANNEL="#team"`, or just `team` — the code normalises both.

> **Slack needs `chat:write.public`** to post to channels the bot has not been invited to.
> Newer workspaces also name the default channel `#all-<workspace>`, not `#general`.

> **A Notion integration sees nothing until a page is shared with it.** Open the page, then
> `⋯ → Connections → Add connection`. An empty picker means nothing is shared, not a bad token.

| Route | Purpose |
|---|---|
| `GET/POST /api/notion` | Lists shared pages; imports one as text |
| `POST /api/extract` | Streams the extraction as NDJSON, ticket by ticket |
| `POST /api/create` | Creates issues, books meetings, posts the digest |
| `GET /api/team` | Connection status for every integration |

---

## Limitations

- **Assignee matching is name-based.** Two people sharing a first name resolve to whichever the
  workspace returns first.
- **Labels are matched, never created.** A suggested label that does not exist is dropped.
- **No deduplication against existing issues.** Running it twice on the same notes creates the
  tickets twice.
- **Bookings use the host's own availability**, and invite the account holder rather than the
  people named in the notes — meeting notes give names, not email addresses.
- **Reliability is argued, not asserted.** Every behaviour above is implemented and was verified
  by hand against live APIs, but there is no automated test suite in this repo.

## Stack

Next.js 16 · React 19 · AI SDK v7 · `claude-sonnet-5` · Linear SDK · Slack Web API ·
Cal.com API v2 · Notion SDK · Tailwind v4 · Motion
