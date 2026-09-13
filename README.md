# Neuva

An agent that reads raw meeting notes, turns them into reviewed Linear issues, and tells the
team what they picked up — with a human approval step before anything is written.

The interesting part is not "LLM makes tickets." It is everything the agent decides **not** to
do: work that was explicitly parked, decisions with no action attached, and status chatter all
have to stay out, or the tool creates more cleanup than it saves.

---

## What it does

```
raw notes ──▶ enumerate action items ──▶ draft tickets ──▶ YOU APPROVE ──▶ Linear ──▶ Slack
                                                               │
                                          edit · reassign · reprioritise · exclude
```

Nothing reaches an external app until you approve. Every ticket carries the verbatim sentence
it came from, so you can check the agent's work without re-reading the notes.

**Per ticket:** title, markdown description, assignee resolved against real workspace members,
priority inferred from language, labels matched to existing team labels, estimate, and blocking
relationships linked after creation.

**Then:** a Block Kit digest lands in Slack — every issue deep-linked, assignee named, priority
marked, and a separate section for the decisions that deliberately did *not* become tickets.

---

## External applications

| App | What the agent does | Auth |
|---|---|---|
| **Anthropic** | Two-pass structured extraction from unstructured notes | API key |
| **Linear** | Creates issues in a project; resolves assignees and labels; links blockers | API key |
| **Slack** | Posts the digest with deep links to every created issue | Bot token |

---

## Why it gets the hard cases right

Extraction runs in two passes inside a single structured generation. The schema forces
`actionItems` to be produced **before** `tickets` — field order drives generation order, so the
model must enumerate exhaustively before it starts writing. Without this it reasons at length
and then emits two tickets.

Given the sample notes in `lib/sample.ts`:

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
- **Half-built objects.** Tickets stream in field by field, so one can have a title while
  `labels` is still undefined. Every partial is hydrated with defaults before rendering —
  replaying a real extraction shows 140 of 275 frames would crash naive rendering.
- **Invented assignees.** Names are matched against real workspace members (including first
  names, which is how people appear in notes). No match means unassigned — never a guess.
- **Partial batches.** Issues are created sequentially; one failure is reported inline against
  that ticket and the rest continue. Blocking relations are linked afterwards and are
  non-fatal.
- **Notification failure never invalidates real work.** Slack is the last step. If the post
  fails, the run reports *"issues created, but the digest failed"* — because the issues exist.

---

## Setup

Node 20+, pnpm.

```bash
pnpm install
cp .env.example .env.local
pnpm dev                       # http://localhost:3000
```

The header shows both connections independently, and explains any that are missing.

| Variable | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | Workspace-scoped. An org-level key also works with `ANTHROPIC_WORKSPACE_ID`. |
| `LINEAR_API_KEY` | yes | Personal API key. |
| `LINEAR_TEAM_ID` | no | Defaults to the first team the key can see. |
| `LINEAR_PROJECT_ID` | no | Files issues under one project instead of the team backlog. |
| `SLACK_BOT_TOKEN` | no | Bot token with `chat:write` and `chat:write.public`. |
| `SLACK_CHANNEL` | no | Channel name or id. Slack is skipped entirely if unset. |

Two configuration traps worth knowing, both of which look like broken credentials:

> **`LINEAR_PROJECT_ID` is the project UUID**, not the short id in the project URL. A URL ending
> `…/multiapp-project-bd502c1a1457` does *not* contain the id the API accepts. Query
> `projects { nodes { id name } }` to find the real one.

> **An unquoted `#` starts a comment in `.env` files.** `SLACK_CHANNEL=#team` silently parses as
> empty. Use `SLACK_CHANNEL="#team"`, or just `team` — the code normalises both.

Without `chat:write.public`, the Slack bot can only post to channels it has been invited to.

| Route | Purpose |
|---|---|
| `POST /api/extract` | Streams the extraction as NDJSON, ticket by ticket |
| `POST /api/create` | Creates approved issues, then posts the digest |
| `GET /api/team` | Connection status for Linear and Slack |

---

## Limitations

- **Assignee matching is name-based.** Two people sharing a first name resolve to whichever the
  workspace returns first.
- **Labels are matched, never created.** A suggested label that does not exist is dropped.
- **No deduplication against existing issues.** Running it twice on the same notes creates the
  tickets twice.
- **Reliability is argued, not asserted.** The behaviours above are implemented and were
  verified by hand against live APIs, but there is no automated test suite in this repo.

## Stack

Next.js 16 · React 19 · AI SDK v7 · `claude-sonnet-5` · Linear SDK · Slack Web API ·
Tailwind v4 · Motion
