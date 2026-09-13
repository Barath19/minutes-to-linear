/**
 * The example meeting.
 *
 * Deliberately contains one of each case the agent has to tell apart:
 * a commitment, a blocked commitment, a decision with no work attached, a
 * decision that does create work, something explicitly parked, an urgent
 * interrupt, a low-priority item, and status chatter that must be ignored.
 */
export const SAMPLE_NOTES = `Platform weekly — 14 Sept

RAY: Starting with auth, because it's been open three weeks. Nadia, where did
the OIDC migration land?

NADIA: Bigger than we scoped. The mobile clients read the cookie name directly
in three places, so it can't be one change. Server-side first, mobile after.
I'll take the server side this sprint.

RAY: Good. Who has mobile?

TOM: Me — but I can't start until Nadia's endpoints are live, so don't count it
this sprint.

RAY: Understood, it waits on hers. Next: Friday's outage.

TOM: Thirty-eight minutes, and most of that was us looking for a runbook that
doesn't exist.

RAY: Then write one, Tom. In the repo next to the deploy config so it's
reviewed like everything else.

NADIA: Can we close out the rate limiter? It's been reopened twice.

RAY: Token bucket. That's decided, we're not revisiting it.

NADIA: Half the team still thinks we went with sliding window.

RAY: Fair. I'll write the decision up so there's something to point at.

TOM: Small one — staging has been at 98% disk for a week and everyone's
stepped around it.

RAY: Log it. Low priority, but I want it visible instead of folklore.

NADIA: Quick status, nothing needed — the search reindex finished Tuesday and
the cache hit rate is up about nine points since.

RAY: Noted. Anything else?

TOM: Should we move to Postgres 17?

RAY: Not now. Park it — we'll revisit once the auth work is actually shipped.

RAY: Last thing, and this one's today: the billing webhook is retrying without
a ceiling and it's eating the connection pool. Sam, cap it at five and ship it
this afternoon. Everything else can wait.`;
