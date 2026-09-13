export const SAMPLE_NOTES = `Platform sync — Tuesday 10:00

MAYA: Auth first. We agreed last week we're moving off session cookies onto
OIDC and nothing has moved. Priya, you were scoping it.

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

PRIYA: Half the backend team thinks we picked sliding window.

MAYA: I'll write up the decision so nobody reopens it.

DEV: Staging database has been full for a week and everyone's ignoring it.

MAYA: Ticket it, low priority, but I want it tracked so it stops being invisible.

DEV: Also — should we upgrade to Postgres 17?

MAYA: Not now. Park it, we'll revisit after the auth work lands.

MAYA: Last thing, this is urgent — the billing webhook is retrying forever and
saturating the pool. Sam, cap it at 5 retries today. Drop everything else.`;
