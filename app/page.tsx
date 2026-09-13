'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApprovalBar } from '@/components/ApprovalBar';
import { FollowUpCard } from '@/components/FollowUpCard';
import { NotionImport } from '@/components/NotionImport';
import { TicketCard, type TicketState } from '@/components/TicketCard';
import { readNdjson } from '@/lib/ndjson';
import { SAMPLE_NOTES } from '@/lib/sample';
import {
  hydrateTicket,
  type CreatedIssue,
  type CreateEvent,
  type Extraction,
  type BookingOutcome,
  type FollowUp,
  type SlackOutcome,
  type Ticket,
} from '@/lib/types';

type Phase = 'idle' | 'extracting' | 'review' | 'creating' | 'done';

type SlackInfo = { connected: boolean; team?: string; reason?: string };

type TeamInfo = {
  connected: boolean;
  slack?: SlackInfo;
  notion?: { connected: boolean; pageCount?: number; reason?: string };
  cal?: { connected: boolean; name?: string; eventTypes?: number; reason?: string };
  teamName?: string;
  projectName?: string;
  projectConfigured?: boolean;
  reason?: string;
};

export default function Page() {
  const [notes, setNotes] = useState(SAMPLE_NOTES);
  const [phase, setPhase] = useState<Phase>('idle');
  const [extraction, setExtraction] = useState<Partial<Extraction> | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [states, setStates] = useState<Record<string, TicketState>>({});
  const [results, setResults] = useState<Record<string, CreatedIssue>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [team, setTeam] = useState<TeamInfo | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [slack, setSlack] = useState<SlackOutcome | null>(null);
  const [slackPosting, setSlackPosting] = useState(false);
  const [bookings, setBookings] = useState<Record<string, BookingOutcome>>({});
  const [bookingPending, setBookingPending] = useState<string | null>(null);
  const [skippedFollowUps, setSkippedFollowUps] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/team')
      .then((r) => r.json())
      .then(setTeam)
      .catch(() => setTeam({ connected: false, reason: 'could not reach /api/team' }));
  }, []);

  // Tickets stream in field by field, so every partial is hydrated with safe
  // defaults before it reaches a component.
  const tickets = useMemo(
    () =>
      (extraction?.tickets ?? [])
        .map(hydrateTicket)
        .filter((t): t is Ticket => t !== null),
    [extraction],
  );

  const followUps = useMemo(
    () =>
      (extraction?.followUps ?? []).filter(
        (f): f is FollowUp => Boolean(f?.id && f?.title && f?.suggestedDate),
      ),
    [extraction],
  );

  const includedFollowUps = useMemo(
    () => followUps.filter((f) => !skippedFollowUps.has(f.id)),
    [followUps, skippedFollowUps],
  );

  const included = useMemo(
    () => tickets.filter((t) => !excluded.has(t.id)),
    [tickets, excluded],
  );

  const extract = useCallback(async () => {
    setPhase('extracting');
    setExtraction(null);
    setStates({});
    setResults({});
    setErrors({});
    setExcluded(new Set());
    setProblem(null);
    setSlack(null);
    setBookings({});
    setSkippedFollowUps(new Set());

    const res = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    });

    if (!res.ok) {
      const b = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      setProblem(b.error ?? 'extraction failed');
      setPhase('idle');
      return;
    }

    let failure: string | null = null;
    await readNdjson<{ type: string; extraction?: Partial<Extraction>; error?: string }>(
      res,
      (e) => {
        if (e.type === 'partial' && e.extraction) setExtraction(e.extraction);
        if (e.type === 'error') failure = e.error ?? 'unknown error';
      },
    );

    if (failure) {
      setProblem(failure);
      setPhase('idle');
      return;
    }
    setPhase('review');
  }, [notes]);

  const create = useCallback(async () => {
    if (included.length === 0) return;
    setPhase('creating');
    setProblem(null);
    setSlack(null);
    setBookings({});
    setSkippedFollowUps(new Set());

    const res = await fetch('/api/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickets: included,
        meetingTitle: extraction?.meetingTitle,
        summary: extraction?.summary,
        decisions: extraction?.decisions,
        followUps: includedFollowUps,
      }),
    });

    if (!res.ok) {
      const b = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      setProblem(b.error ?? 'creation failed');
      setPhase('review');
      return;
    }

    await readNdjson<CreateEvent>(res, (e) => {
      if (e.type === 'issue.start') setStates((s) => ({ ...s, [e.ticketId]: 'creating' }));
      if (e.type === 'issue.done') {
        setStates((s) => ({ ...s, [e.issue.ticketId]: 'created' }));
        setResults((r) => ({ ...r, [e.issue.ticketId]: e.issue }));
      }
      if (e.type === 'issue.error') {
        setStates((s) => ({ ...s, [e.ticketId]: 'error' }));
        setErrors((x) => ({ ...x, [e.ticketId]: e.error }));
      }
      if (e.type === 'booking.start') setBookingPending(e.followUpId);
      if (e.type === 'booking.done') {
        setBookingPending(null);
        setBookings((b) => ({ ...b, [e.result.followUpId]: e.result }));
      }
      if (e.type === 'slack.start') setSlackPosting(true);
      if (e.type === 'slack.done') {
        setSlackPosting(false);
        setSlack(e.result);
      }
      if (e.type === 'done') setPhase('done');
    });
  }, [included, includedFollowUps, extraction]);

  const reset = () => {
    setPhase('idle');
    setExtraction(null);
    setStates({});
    setResults({});
    setErrors({});
    setExcluded(new Set());
    setProblem(null);
    setSlack(null);
    setBookings({});
    setSkippedFollowUps(new Set());
  };

  const editTicket = (id: string, patch: Partial<Ticket>) =>
    setExtraction((ex) =>
      ex
        ? { ...ex, tickets: (ex.tickets ?? []).map((t) => (t?.id === id ? { ...t, ...patch } : t)) }
        : ex,
    );

  const createdCount = Object.keys(results).length;
  const busy = phase === 'extracting' || phase === 'creating';

  return (
    <main className="aura min-h-dvh overflow-x-hidden lg:h-dvh lg:overflow-hidden">
      {/*
        `min-w-0` on both columns is load-bearing: grid children default to
        min-width:auto, so long unbroken note text would otherwise widen the
        track and push the layout off screen.
      */}
      <div className="mx-auto grid min-h-dvh max-w-[1500px] grid-cols-1 gap-6 p-5 lg:h-dvh lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        {/* Notes */}
        <section className="flex min-h-0 min-w-0 flex-col gap-3">
          <header className="flex items-center gap-2.5">
            <div className="grid size-7 place-items-center rounded-md bg-brand text-[13px] font-semibold">
              N
            </div>
            <h1 className="text-[15px] font-semibold">
              Neuva <span className="text-dim">· notes that file themselves</span>
            </h1>
            <span
              className={`ml-auto flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] ${
                team?.connected
                  ? 'border-emerald-500/30 text-emerald-300'
                  : 'border-edge text-dim'
              }`}
              title={team?.reason}
            >
              <span
                className={`size-1.5 rounded-full ${team?.connected ? 'bg-emerald-400' : 'bg-dim'}`}
              />
              {team?.connected
                ? (team.projectName ?? team.teamName)
                : 'not connected'}
            </span>

            <span
              className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] ${
                team?.slack?.connected
                  ? 'border-emerald-500/30 text-emerald-300'
                  : 'border-edge text-dim'
              }`}
              title={team?.slack?.reason ?? 'Slack digest after issues are created'}
            >
              <span
                className={`size-1.5 rounded-full ${
                  team?.slack?.connected ? 'bg-emerald-400' : 'bg-dim'
                }`}
              />
              {team?.slack?.connected ? (team.slack.team ?? 'Slack') : 'no Slack'}
            </span>
          </header>

          <div className="flex items-center gap-2">
            <span className="text-[11px] tracking-wider text-dim uppercase">Meeting notes</span>
            {team?.notion?.connected && (
              <div className="ml-auto">
                <NotionImport
                  disabled={busy}
                  onImport={(text) => {
                    setNotes(text);
                    reset();
                  }}
                />
              </div>
            )}
          </div>

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={busy}
            spellCheck={false}
            placeholder="Paste your meeting notes…"
            className="min-h-[240px] flex-1 resize-none lg:min-h-0 rounded-lg border border-edge bg-surface p-4 font-mono text-[12px] leading-relaxed text-text/90 placeholder:text-dim/50 focus:border-brand disabled:opacity-60"
          />

          <div className="flex items-center gap-2">
            <button
              onClick={extract}
              disabled={busy || !notes.trim()}
              className="flex-1 rounded-lg bg-brand px-4 py-2.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-35"
            >
              {phase === 'extracting' ? 'Reading notes…' : 'Extract tickets'}
            </button>
            {phase !== 'idle' && (
              <button
                onClick={reset}
                disabled={busy}
                className="rounded-lg border border-edge px-3 py-2.5 text-[13px] text-dim transition-colors hover:text-text disabled:opacity-40"
              >
                Reset
              </button>
            )}
          </div>

          <AnimatePresence>
            {problem && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-lg border border-red-500/40 bg-red-500/10 p-2.5 text-[12px] text-red-300"
              >
                {problem}
              </motion.p>
            )}
          </AnimatePresence>
        </section>

        {/* Tickets */}
        <section className="flex min-h-0 min-w-0 flex-col gap-3">
          <div className="flex min-h-9 items-center gap-3">
            <h2 className="text-[13px] font-medium">
              {extraction?.meetingTitle ?? 'Tickets'}
            </h2>
            {tickets.length > 0 && (
              <span className="text-[12px] text-dim">
                {included.length} of {tickets.length} selected
              </span>
            )}
            {phase === 'done' && (
              <span className="text-[12px] text-emerald-300">
                {createdCount} created in Linear
              </span>
            )}

          </div>

          {extraction?.summary && (
            <p className="rounded-lg border border-edge bg-surface/60 p-3 text-[12.5px] leading-relaxed text-dim">
              {extraction.summary}
            </p>
          )}

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {tickets.length === 0 && (
              <div className="grid h-full min-h-64 place-items-center rounded-lg border border-dashed border-edge">
                <p className="max-w-xs text-center text-[13px] leading-relaxed text-dim">
                  {phase === 'extracting'
                    ? 'Reading the notes…'
                    : 'Tickets appear here for review. Nothing reaches Linear until you approve.'}
                </p>
              </div>
            )}

            <AnimatePresence mode="popLayout">
              {tickets.map((t) => (
                <TicketCard
                  key={t.id}
                  ticket={t}
                  state={states[t.id] ?? 'draft'}
                  identifier={results[t.id]?.identifier}
                  url={results[t.id]?.url}
                  error={errors[t.id]}
                  included={!excluded.has(t.id)}
                  onToggle={() =>
                    setExcluded((s) => {
                      const n = new Set(s);
                      if (n.has(t.id)) n.delete(t.id);
                      else n.add(t.id);
                      return n;
                    })
                  }
                  onEdit={(patch) => editTicket(t.id, patch)}
                  blockedTitles={(t.blockedBy ?? [])
                    .map((id) => tickets.find((x) => x.id === id)?.title)
                    .filter((x): x is string => Boolean(x))}
                />
              ))}
            </AnimatePresence>

            {/* Meetings the notes call for, booked against live availability. */}
            {followUps.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-[11px] tracking-wider text-dim uppercase">
                  Follow-up meetings
                </p>
                <div className="space-y-2">
                  {followUps.map((f) => (
                    <FollowUpCard
                      key={f.id}
                      followUp={f}
                      booking={bookings[f.id]}
                      pending={bookingPending === f.id}
                      included={!skippedFollowUps.has(f.id)}
                      onToggle={() =>
                        setSkippedFollowUps((s) => {
                          const n = new Set(s);
                          if (n.has(f.id)) n.delete(f.id);
                          else n.add(f.id);
                          return n;
                        })
                      }
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Decisions are recorded but deliberately not ticketed. */}
            {extraction?.decisions && extraction.decisions.length > 0 && (
              <div className="mt-4 rounded-lg border border-edge bg-surface/50 p-3.5">
                <p className="mb-2 text-[11px] tracking-wider text-dim uppercase">
                  Decisions — noted, not ticketed
                </p>
                <ul className="space-y-1.5">
                  {extraction.decisions.map((d, i) => (
                    <li key={i} className="text-[12.5px] leading-relaxed text-dim">
                      · {d}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* The approval gate. Nothing is written to Linear above this line. */}
          {(phase === 'review' || phase === 'creating' || phase === 'done') && (
            <ApprovalBar
              phase={phase}
              tickets={included}
              createdCount={createdCount}
              failedCount={Object.keys(errors).length}
              teamName={team?.projectName ?? team?.teamName}
              slack={slack}
              slackPosting={slackPosting}
              slackConfigured={Boolean(team?.slack?.connected)}
              meetingCount={includedFollowUps.length}
              onApprove={create}
              onReset={reset}
            />
          )}
        </section>
      </div>
    </main>
  );
}
