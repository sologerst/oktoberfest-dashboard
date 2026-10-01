const CHICAGO = "America/Chicago";

/** Calendar date in America/Chicago as YYYY-MM-DD. */
export function chicagoDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CHICAGO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Offset of Chicago wall time versus UTC at `instant`, in milliseconds.
 * Negative when Chicago is behind UTC.
 */
function chicagoOffsetMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CHICAGO,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "0";
  const hour = get("hour") === "24" ? "0" : get("hour");
  const wallAsUtc = Date.UTC(
    Number(get("year")),
    Number(get("month")) - 1,
    Number(get("day")),
    Number(hour),
    Number(get("minute")),
    Number(get("second")),
  );
  return wallAsUtc - instant.getTime();
}

/** Inclusive start and exclusive end of a Chicago calendar day, as UTC ISO strings. */
export function chicagoDayBounds(day: string): { start: string; end: string } {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) {
    throw new Error(`Invalid Chicago day: ${day}`);
  }
  // Noon UTC sits safely inside the same Chicago date, including on DST edges.
  const sample = new Date(Date.UTC(year, month - 1, date, 12, 0, 0));
  const offset = chicagoOffsetMs(sample);
  const start = new Date(Date.UTC(year, month - 1, date, 0, 0, 0) - offset);
  const end = new Date(Date.UTC(year, month - 1, date + 1, 0, 0, 0) - offset);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** How long a snapshot can sit before the open screen refreshes it. */
export const SNAPSHOT_MAX_AGE_MS = 30_000;

export function snapshotNeedsRefresh(
  generatedAt: string | null | undefined,
  now: Date,
  maxAgeMs = SNAPSHOT_MAX_AGE_MS,
): boolean {
  if (!generatedAt) return true;
  const then = Date.parse(generatedAt);
  if (Number.isNaN(then)) return true;
  return now.getTime() - then >= maxAgeMs;
}

export function sameChicagoDay(iso: string | null, day: string): boolean {
  if (!iso) return false;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return false;
  return chicagoDate(parsed) === day;
}

/** Clock time in America/Chicago with a CT suffix, e.g. "2:14 PM CT". */
export function formatChicagoTime(iso: string): string {
  const clock = new Intl.DateTimeFormat("en-US", {
    timeZone: CHICAGO,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
  return `${clock} CT`;
}

/** Festival day label, e.g. "Friday, Oct 2". */
export function formatFestivalDay(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CHICAGO,
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

export function formatChicagoDay(now: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CHICAGO,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(now);
}
