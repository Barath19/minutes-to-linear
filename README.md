# Neuva

An agent that reads a meeting, works out what it committed you to, and files it — issues in
Linear, follow-up meetings on your calendar, and a digest to the team. With a human approval
step before anything is written.

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

---

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

## Reliability

Failure modes that are handled rather than hoped away:

- **Silent truncation.** A reasoning model spends most of its output budget thinking before the
  first ticket appears; the default ceiling cuts the array mid-flight and returns a
  *valid-looking* short list. The route inspects `finishReason` and fails loudly instead of
  silently dropping tickets.
- **Streaming errors.** `streamText` surfaces provider failures as stream events rather than
  throwing, so an `onError` hook forwards them. Otherwise a rejected API key is
  indistinguishable from "this meeting had no action items."
- **Half-built objects.** Tickets stream in field by field, so one can have a title while
  `labels` is still undefined. Every partial is hydrated with defaults before rendering —
  replaying a real extraction showed 140 of 275 frames would crash naive rendering.
- **Invisible Notion content.** Notion's AI meeting recorder wraps transcripts in an
  undocumented `transcription` block holding no text of its own. Traversal is independent of
  whether a block contributes text, so containers, columns and toggles are never skipped.
- **Invented assignees.** Names are matched against real workspace members, including first
  names. No match means unassigned — never a guess.
- **Ordering of side effects.** Linear first, then Cal.com, then Slack. Each later stage is
  non-fatal: a failed booking or digest is reported alongside the run rather than failing it,
  because the issues already exist and pretending otherwise would be a lie.

---

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
