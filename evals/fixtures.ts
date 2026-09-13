/**
 * Each fixture is a meeting plus what a correct reading of it must and must
 * not produce. Assertions are structural rather than exact-match: the model
 * will phrase a title differently every run, but it must always cover the same
 * commitments, refuse the same non-commitments, and classify them the same way.
 */
export type Fixture = {
  name: string;
  notes: string;
  /** Each entry must be matched by at least one ticket title or description. */
  mustTicket: { label: string; keywords: string[] }[];
  /** Ticket titles must never contain any of these — the work was not committed. */
  mustNotTicket: string[];
  /** Expected ticket count range, inclusive. */
  ticketRange: [number, number];
  /** Expected follow-up meeting count range. */
  followUpRange: [number, number];
  /** Priorities that must be assigned to the ticket matching these keywords. */
  priorities?: { keywords: string[]; expected: string }[];
  /** Names that may legitimately appear as assignees. Anything else is invented. */
  validAssignees: string[];
  /** At least one ticket must declare a blocker. */
  expectsBlocking?: boolean;
};

export const FIXTURES: Fixture[] = [
  {
    name: 'platform-sync',
    notes: `Platform sync — Tuesday 10:00

MAYA: Auth first. We agreed last week we're moving off session cookies onto OIDC
and nothing has moved. Priya, you were scoping it.

PRIYA: Scoped. It's bigger than we thought — the mobile clients hardcode the
cookie name in three places. I'd split it: server-side OIDC first, then mobile
separately. I'll take the server half this sprint.

MAYA: Do it. Who owns mobile?

DEV: I'll take mobile, but I can't start until Priya's endpoints exist.

MAYA: Fine, it waits on hers. Second thing — Friday's incident. Forty minutes
down because nobody could find the runbook.

DEV: There is no runbook. That's the actual problem.

MAYA: Then that's on you, Dev. Write it, put it in the repo next to the deploy
config so it's version controlled.

PRIYA: Can we settle the rate limiter? Three weeks of going back and forth.

MAYA: Decision: token bucket. We stop discussing it.

MAYA: I'll write up the decision so nobody reopens it.

DEV: Staging database has been full for a week and everyone's ignoring it.

MAYA: Ticket it, low priority, but I want it tracked so it stops being invisible.

DEV: Also — should we upgrade to Postgres 17?

MAYA: Not now. Park it, we'll revisit after the auth work lands.

MAYA: Last thing, this is urgent — the billing webhook is retrying forever and
saturating the pool. Sam, cap it at 5 retries today. Drop everything else.`,
    mustTicket: [
      { label: 'server-side OIDC', keywords: ['oidc', 'server'] },
      { label: 'mobile migration', keywords: ['mobile'] },
      { label: 'runbook', keywords: ['runbook'] },
      { label: 'rate limiter writeup', keywords: ['rate limit', 'token bucket'] },
      { label: 'staging database', keywords: ['staging'] },
      { label: 'webhook retries', keywords: ['webhook', 'retr'] },
    ],
    // Explicitly parked. Ticketing it is the headline failure mode.
    mustNotTicket: ['postgres'],
    ticketRange: [5, 8],
    followUpRange: [1, 2],
    priorities: [
      { keywords: ['webhook', 'retr'], expected: 'urgent' },
      { keywords: ['staging'], expected: 'low' },
    ],
    validAssignees: ['maya', 'priya', 'dev', 'sam'],
    expectsBlocking: true,
  },

  {
    name: 'no-commitments',
    notes: `Coffee catch-up — Thursday

SAM: How was the trip?

LENA: Good. Long flights. The hotel wifi was terrible.

SAM: Did you see the new espresso machine? Someone finally cleaned it.

LENA: About time. I heard the office is getting new chairs at some point.

SAM: Someone mentioned that months ago. I'll believe it when I sit in one.

LENA: Anyway, I should get back to it.`,
    mustTicket: [],
    mustNotTicket: ['chair', 'espresso', 'wifi', 'hotel'],
    ticketRange: [0, 0],
    followUpRange: [0, 0],
    validAssignees: ['sam', 'lena'],
  },

  {
    name: 'everything-deferred',
    notes: `Roadmap review — Monday

RAJ: Three proposals on the table. First, rewriting the billing service.

KIM: Not this quarter. We revisit in January when we know the headcount.

RAJ: Second, the design system refresh.

KIM: Same answer. Park it, bring it back after the billing decision.

RAJ: Third, moving to a monorepo.

KIM: I'm not saying no, but nobody is doing that before Q2. Let's book time in
March to look at it properly.

RAJ: So nothing today.

KIM: Nothing today. That's fine — deciding not to decide is still a decision.`,
    mustTicket: [],
    // Every item was explicitly deferred; none is committed work.
    mustNotTicket: ['rewrite billing', 'design system', 'monorepo migration'],
    ticketRange: [0, 1],
    followUpRange: [1, 3],
    validAssignees: ['raj', 'kim'],
  },

  {
    name: 'urgency-signals',
    notes: `Incident review — Wednesday

NINA: Production is degraded right now. Tom, roll back the deploy immediately,
everything else waits.

TOM: Rolling back now.

NINA: Once that's done, we need a post-incident writeup. Not urgent, but this
week.

TOM: I'll do it Friday.

NINA: And at some point, whenever you get to it, the alerting thresholds are
too noisy. Low priority, just log it so we don't forget.`,
    mustTicket: [
      { label: 'rollback', keywords: ['roll back', 'rollback'] },
      { label: 'postmortem', keywords: ['writeup', 'post-incident', 'postmortem'] },
      { label: 'alert thresholds', keywords: ['alert', 'threshold', 'nois'] },
    ],
    mustNotTicket: [],
    ticketRange: [3, 4],
    followUpRange: [0, 1],
    priorities: [
      { keywords: ['roll back', 'rollback'], expected: 'urgent' },
      { keywords: ['alert', 'threshold'], expected: 'low' },
    ],
    validAssignees: ['nina', 'tom'],
  },

  {
    name: 'status-only',
    notes: `Standup — Friday

ALEX: Yesterday I finished the search indexing work. It's merged and deployed.

JO: I'm still working through the migration backlog, about halfway. No blockers.

ALEX: The cache hit rate went up after Tuesday's change, which is nice.

JO: I reviewed two PRs and they're both merged.

ALEX: Nothing blocking on my side either.`,
    mustTicket: [],
    // Pure status. Restating finished work as new tickets is a real failure.
    mustNotTicket: ['search indexing', 'cache hit', 'review pr'],
    ticketRange: [0, 1],
    followUpRange: [0, 0],
    validAssignees: ['alex', 'jo'],
  },
];
