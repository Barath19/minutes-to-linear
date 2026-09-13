# Minutes → Linear

An agent that reads raw meeting notes and turns them into reviewed, assigned, prioritised
Linear issues — with a human approval step in between.

The interesting part is not "LLM makes tickets." It is everything the agent decides **not**
to do: work that was explicitly parked, decisions with no action attached, and status chatter
all have to stay out, or the tool creates more cleanup than it saves.

---

## What it does

```
raw notes ──▶ enumerate action items ──▶ draft tickets ──▶ YOU REVIEW ──▶ Linear
                                                              │
                                            edit · reassign · reprioritise · exclude
```

Nothing reaches Linear until you approve it. Every ticket carries the verbatim sentence it
came from, so you can check the agent's work without re-reading the notes.

**Per ticket:** title, markdown description, assignee resolved against real workspace members,
priority inferred from language, labels matched to existing team labels, estimate, and
blocking relationships linked after creation.

---

## Why it gets the hard cases right

The extraction runs in two passes inside a single structured generation. The schema forces
`actionItems` to be produced **before** `tickets` — field order drives generation order, so
the model must enumerate exhaustively before it starts writing. Without this it reasons at
length and then emits two tickets.

Given the sample notes in `lib/sample.ts`, it produces:

| Ticket | Assignee | Priority | Note |
|---|---|---|---|
| Implement server-side OIDC authentication | Priya | medium | |
| Migrate mobile clients off session cookie | Dev | medium | **blocked by** the ticket above |
| Write incident response runbook | Dev | high | |
| Document the rate limiter decision | Maya | medium | |
| Free up the full staging database | — | low | "low priority" honoured |
| Cap billing webhook retries at 5 | Sam | **urgent** | "drop everything" honoured |

And critically — **the Postgres 17 upgrade is not ticketed.** It was raised and explicitly
parked ("Not now. Park it"), so it lands in *Decisions — noted, not ticketed* instead. So does
the token-bucket decision itself, separately from the ticket to write it up.

That distinction is the whole product. An agent that ticketed all eight would be worse than useless.

---

## Reliability

Failure modes that are handled rather than hoped away:

- **Silent truncation.** A reasoning model spends most of its output budget thinking before the
  first ticket appears; the default ceiling cuts the array mid-flight and returns a
  *valid-looking* short list. The route inspects `finishReason` and fails loudly instead of
  silently dropping tickets.
- **Streaming errors.** `streamText` surfaces provider failures as stream events rather than
  throwing, so an `onError` hook forwards them to the client. Otherwise a rejected API key is
  indistinguishable from "this meeting had no action items."
- **Invented assignees.** Names are matched against real workspace members (including first
  names, which is how people appear in notes). No match means unassigned — never a guess.
- **Partial batches.** Issues are created sequentially; one failure is reported inline against
  that ticket and the rest continue. Blocking relations are linked afterwards and are
  non-fatal, since a missing link is a smaller problem than aborting a completed batch.

---

## Setup

Node 20+, pnpm.

```bash
pnpm install
cp .env.example .env.local     # add ANTHROPIC_API_KEY and LINEAR_API_KEY
pnpm dev                       # http://localhost:3000
```

The header shows which Linear team is connected, or why it isn't. `LINEAR_TEAM_ID` is optional —
it defaults to the first team the key can see.

| Route | Purpose |
|---|---|
| `POST /api/extract` | Streams the extraction as NDJSON, ticket by ticket |
| `POST /api/create` | Creates approved tickets, streaming one event per issue |
| `GET /api/team` | Connection status, team name, member and label counts |

---

## Limitations

- **One external app.** This writes to Linear only. Archiving the notes and posting a summary
  elsewhere would be a small addition, but is not built.
- **Assignee matching is name-based.** Two people sharing a first name will resolve to whichever
  the workspace returns first.
- **Labels are matched, never created.** A label the agent suggests that does not exist on the
  team is dropped rather than added.
- **No deduplication against existing issues.** Running it twice on the same notes creates the
  tickets twice.

## Stack

Next.js 16 · React 19 · AI SDK v7 · `claude-sonnet-5` · Linear SDK · Tailwind v4 · Motion
