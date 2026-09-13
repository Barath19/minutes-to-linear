import type { FollowUp } from './types';

const API = 'https://api.cal.com/v2';

/**
 * Cal.com v2 pins each endpoint group to a dated contract via `cal-api-version`.
 * They are not interchangeable, so each call sends the version it was built for.
 * (v1 is decommissioned and returns a migration notice for every route.)
 */
const VERSION = {
  eventTypes: '2024-06-14',
  slots: '2024-09-04',
  bookings: '2024-08-13',
} as const;

export type CalEventType = { id: number; slug: string; title: string; minutes: number };

export type BookingResult = {
  followUpId: string;
  uid: string;
  title: string;
  start: string;
  url: string;
};

export function calcomConfigured(): boolean {
  return Boolean(process.env.CALCOM_API_KEY);
}

async function call(
  path: string,
  version: string,
  init: RequestInit = {},
): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.CALCOM_API_KEY}`,
      'cal-api-version': version,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || body.status === 'error') {
    const detail =
      (body.error as { message?: string })?.message ?? (body.message as string) ?? res.statusText;
    throw new Error(`Cal.com ${res.status}: ${detail}`);
  }
  return body;
}

export async function me(): Promise<{ name: string; email: string; timeZone: string; username: string }> {
  const body = await call('/me', VERSION.eventTypes);
  const d = body.data as Record<string, string>;
  return { name: d.name, email: d.email, timeZone: d.timeZone, username: d.username };
}

export async function listEventTypes(username: string): Promise<CalEventType[]> {
  const body = await call(
    `/event-types?username=${encodeURIComponent(username)}`,
    VERSION.eventTypes,
  );
  const groups = body.data as unknown;
  const raw = Array.isArray(groups)
    ? groups.flatMap((g) => (g as { eventTypes?: unknown[] }).eventTypes ?? [g])
    : [];
  return raw.map((e) => {
    const t = e as Record<string, unknown>;
    return {
      id: Number(t.id),
      slug: String(t.slug),
      title: String(t.title),
      minutes: Number(t.lengthInMinutes ?? t.length ?? 30),
    };
  });
}

/**
 * First bookable slot at or after `fromDate`.
 *
 * The model proposes a date from the notes ("revisit next week"), but only
 * Cal.com knows the host's real availability, so the date is treated as the
 * earliest acceptable time rather than the booking time itself.
 */
export async function findSlot(
  eventTypeId: number,
  fromDate: string,
  timeZone: string,
  searchDays = 21,
): Promise<string | null> {
  const start = new Date(`${fromDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return null;

  // Never schedule into the past, however the notes were phrased.
  const now = new Date();
  if (start < now) start.setTime(now.getTime());

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + searchDays);

  const body = await call(
    `/slots?eventTypeId=${eventTypeId}&start=${start.toISOString()}&end=${end.toISOString()}&timeZone=${encodeURIComponent(timeZone)}`,
    VERSION.slots,
  );

  const byDay = (body.data ?? {}) as Record<string, Array<{ start?: string } | string>>;
  for (const day of Object.keys(byDay).sort()) {
    const slot = byDay[day]?.[0];
    if (!slot) continue;
    const iso = typeof slot === 'string' ? slot : slot.start;
    if (iso) return new Date(iso).toISOString();
  }
  return null;
}

export async function createBooking(
  followUp: FollowUp,
  eventTypeId: number,
  startIso: string,
  attendee: { name: string; email: string; timeZone: string },
): Promise<BookingResult> {
  const body = await call('/bookings', VERSION.bookings, {
    method: 'POST',
    body: JSON.stringify({
      start: startIso,
      eventTypeId,
      attendee: { ...attendee, language: 'en' },
      bookingFieldsResponses: { title: followUp.title },
      metadata: { source: 'neuva' },
    }),
  });

  const d = body.data as Record<string, string>;
  return {
    followUpId: followUp.id,
    uid: d.uid,
    title: d.title,
    start: d.start,
    url: `https://app.cal.com/booking/${d.uid}`,
  };
}

export async function cancelBooking(uid: string, reason = 'cancelled via Neuva'): Promise<void> {
  await call(`/bookings/${uid}/cancel`, VERSION.bookings, {
    method: 'POST',
    body: JSON.stringify({ cancellationReason: reason }),
  });
}

/** Connection check for the status endpoint. */
export async function calcomStatus(): Promise<{
  connected: boolean;
  name?: string;
  eventTypes?: number;
  reason?: string;
}> {
  if (!calcomConfigured()) return { connected: false, reason: 'CALCOM_API_KEY is not set' };
  try {
    const user = await me();
    const types = await listEventTypes(user.username);
    return { connected: true, name: user.name, eventTypes: types.length };
  } catch (err) {
    return { connected: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/** Picks the event type closest to the requested duration. */
export function pickEventType(types: CalEventType[], minutes: number): CalEventType | null {
  if (types.length === 0) return null;
  return types.reduce((best, t) =>
    Math.abs(t.minutes - minutes) < Math.abs(best.minutes - minutes) ? t : best,
  );
}
