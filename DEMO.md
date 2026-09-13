# Demo script — 2:00

## Before you record

**Clean the test data** so nothing on screen looks like debris:

- Linear: delete `BAR-10`, `BAR-23`, and everything tagged `[temporal demo]`. Ideally
  empty the project so issues appear on camera against a blank board.
- Slack: delete the two connection-test messages in `#all-barathbee`.
- Cal.com: cancel the 28 Sep and 29 Sep test bookings.
- Temporal: leave the completed workflow — you want history in the UI.

**Windows to have open**, so no fumbling mid-take:

| | |
|---|---|
| 1 | Neuva — `localhost:3000` (browser zoom at 100%, `Cmd+0`) |
| 2 | Linear — the Multiapp-Project board |
| 3 | Slack — `#all-barathbee` |
| 4 | Cal.com — bookings |
| 5 | Temporal — `localhost:8233` |
| 6 | Terminal — cleared, sitting on `pnpm eval` ready to run |

**Running processes:** `pnpm dev`, `pnpm temporal`, `pnpm worker`.

---

## The script

### 0:00–0:12 — the problem

> *Screen: the Notion meeting page.*

"Every team has this meeting. Six things get committed to, two get decided, one gets
parked — and by Thursday nobody remembers which was which."

### 0:12–0:30 — import

> *Screen: Neuva. Click **Import from Notion** → pick the meeting → text fills the box.*

"Neuva reads the meeting straight out of Notion. No copy-paste."

*Let the page picker be visible for a beat — it shows a real integration, not a textarea.*

### 0:30–0:55 — extraction

> *Click **Extract tickets**. Let tickets stream in. Do not cut this — the streaming is
> the proof it's live.*

"It reads the meeting twice. First it enumerates every commitment, then it writes one
ticket per commitment — so it can't reason for thirty seconds and hand you two tickets."

*Point at a priority chip:* "Priorities come from how people actually talked. 'Drop
everything' became urgent. 'Low priority' stayed low."

### 0:55–1:20 — **the moment**

> *Scroll to the Postgres line. Expand `source ↓` on the follow-up card.*

"This is the part I'd judge it on. Someone asked about upgrading Postgres 17, and the
answer was *'not now, park it, we'll revisit after the auth work lands.'*"

"So it did three different things with one sentence. **No ticket** — it was parked.
**A decision** — recorded as context. And **a meeting booked** for after the auth work,
because 'revisit' means a conversation, not a task."

"An agent that made eight tickets out of this meeting would create more cleanup than it
saves. Knowing what *not* to file is the product."

### 1:20–1:45 — approve, three apps

> *Click **Approve & run**. Cut between windows as each lands.*

"One approval. Nothing was written until now."

- *Linear* — "Issues, assigned, with the blocker linked."
- *Cal.com* — "The follow-up, booked against real availability — the model proposed a
  date, the calendar picked the slot."
- *Slack* — "And the team gets told, with the decisions that didn't become tickets."

### 1:45–1:58 — reliability

> *Screen: Temporal UI, the workflow history. Then cut to terminal with eval output.*

"The filing runs as a Temporal workflow, so a crash resumes instead of leaving you
half-filed."

"And it's evaluated — thirty-eight structural checks, including verifying every quoted
sentence actually appears in the notes. Plus a local model scoring ticket quality
independently."

### 1:58–2:00 — close

"Neuva. Meeting in, work out."

---

## Notes

- **Record at 1440p or higher.** Ticket text is small; judges may watch on a laptop.
- **Do not speed up the extraction.** Watching it stream is the evidence it's real.
- **If a take goes wrong after approval**, reset the test data before the next one —
  duplicate issues on screen look sloppy.
- **Fallback if an API is down mid-recording:** the header shows each connection's
  status, so record an honest run and say which stage is offline. A visibly degraded
  run beats a fake one.

## If you have 30 extra seconds

Kill the Slack token mid-run and show Temporal retrying the activity with backoff in
the history view, then restore it and watch the same workflow complete — without
re-creating the Linear issues, because those activities already completed and are
checkpointed. That is durability you can *see* rather than claim.
