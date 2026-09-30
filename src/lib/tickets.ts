import type { DayLine, TicketNumbers } from "@/lib/types";

export const TICKETED_DATES: DayLine[] = [
  { date: "2026-10-01", label: "Thursday, Oct 1", count: 0 },
  { date: "2026-10-02", label: "Friday, Oct 2", count: 0 },
  { date: "2026-10-03", label: "Saturday, Oct 3", count: 0 },
  { date: "2026-10-04", label: "Sunday, Oct 4", count: 0 },
];

export const WEEKEND_SLUGS = ["ga-weekend", "vip-weekend", "weekend"] as const;
export const SINGLE_DAY_SLUGS = ["ga", "vip", "ga-comp", "vip-any-day"] as const;

export type SqlQuery = { text: string; values: unknown[] };

/**
 * Comps stay in the ticket count and drop out of dollars.
 * A comp has no payment provider, or no Square payment and a COMP: note.
 */
export function compDollarExclusion(orderAlias = "o"): string {
  return `(
    ${orderAlias}."paymentProvider" IS NULL
    OR (
      ${orderAlias}."squarePaymentId" IS NULL
      AND COALESCE(${orderAlias}.notes, '') LIKE 'COMP:%'
    )
  )`;
}

export function remainingTicketedDates(chicagoDay: string): DayLine[] {
  return TICKETED_DATES.filter((day) => day.date >= chicagoDay).map((day) => ({ ...day }));
}

export function salesTodayQuery(chicagoDay: string): SqlQuery {
  return {
    text: `
      SELECT
        COUNT(*)::int AS count,
        COALESCE(SUM(
          CASE WHEN ${compDollarExclusion("o")} THEN 0 ELSE t."priceInCents" END
        ), 0)::int AS cents
      FROM tickets t
      INNER JOIN orders o ON o.id = t."orderId"
      WHERE o.status = 'paid'
        AND t."revokedAt" IS NULL
        AND (o."createdAt" AT TIME ZONE 'America/Chicago')::date = $1::date
    `,
    values: [chicagoDay],
  };
}

export function scannedTodayQuery(chicagoDay: string): SqlQuery {
  return {
    text: `
      SELECT COUNT(*)::int AS count
      FROM ticket_check_ins
      WHERE "eventDate" = $1::date
    `,
    values: [chicagoDay],
  };
}

/**
 * Table owners see rows unless FORCE ROW LEVEL SECURITY is on. Other roles
 * with row security and no policy get zero rows and no error.
 */
export function ticketVisibilityQuery(): SqlQuery {
  return {
    text: `
      SELECT (
        r.rolsuper
        OR r.rolbypassrls
        OR (c.relowner = r.oid AND NOT c.relforcerowsecurity)
      ) AS sees
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_roles r ON r.rolname = current_user
      WHERE n.nspname = 'public'
        AND c.relname = 'tickets'
    `,
    values: [],
  };
}

export const HIDDEN_TICKETS_ERROR =
  "The festival database role cannot read ticket rows because row level security is on. Use the postgres session pooler URL for FESTIVAL_DATABASE_URL.";

export function soldBreakdownQuery(remainingDates: string[]): SqlQuery {
  const undatedSlugs = [...WEEKEND_SLUGS, ...SINGLE_DAY_SLUGS];
  return {
    text: `
      SELECT
        t."validDate"::text AS valid_date,
        tt.slug AS slug,
        COUNT(*)::int AS count
      FROM tickets t
      INNER JOIN orders o ON o.id = t."orderId"
      INNER JOIN ticket_types tt ON tt.id = t."ticketTypeId"
      WHERE o.status = 'paid'
        AND t."revokedAt" IS NULL
        AND (
          t."validDate" = ANY($1::date[])
          OR (
            t."validDate" IS NULL
            AND tt.slug = ANY($2::text[])
          )
        )
      GROUP BY t."validDate", tt.slug
    `,
    values: [remainingDates, undatedSlugs],
  };
}

export type SoldRow = {
  valid_date: string | null;
  slug: string;
  count: number;
};

export function shapeSoldLines(rows: SoldRow[], remaining: DayLine[]): Pick<
  TicketNumbers,
  "days" | "weekendPasses" | "dayNotRecorded"
> {
  const byDate = new Map<string, number>();
  let weekendPasses = 0;
  let dayNotRecorded = 0;

  for (const row of rows) {
    const count = Number(row.count);
    if (row.valid_date) {
      byDate.set(row.valid_date, (byDate.get(row.valid_date) ?? 0) + count);
      continue;
    }
    if ((WEEKEND_SLUGS as readonly string[]).includes(row.slug)) weekendPasses += count;
    else if ((SINGLE_DAY_SLUGS as readonly string[]).includes(row.slug)) dayNotRecorded += count;
  }

  return {
    days: remaining.map((day) => ({ ...day, count: byDate.get(day.date) ?? 0 })),
    weekendPasses,
    dayNotRecorded,
  };
}

export type Queryable = {
  query<T>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
};

function asInt(value: unknown, label: string): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number)) throw new Error(`Expected an integer ${label}`);
  return number;
}

function boardIsEmpty(numbers: TicketNumbers): boolean {
  return (
    numbers.salesTodayCount === 0 &&
    numbers.salesTodayCents === 0 &&
    numbers.scannedToday === 0 &&
    numbers.weekendPasses === 0 &&
    numbers.dayNotRecorded === 0 &&
    numbers.days.every((day) => day.count === 0)
  );
}

export async function loadTicketNumbers(db: Queryable, chicagoDay: string): Promise<TicketNumbers> {
  const remaining = remainingTicketedDates(chicagoDay);
  const salesQuery = salesTodayQuery(chicagoDay);
  const scannedQuery = scannedTodayQuery(chicagoDay);
  const soldQuery = soldBreakdownQuery(remaining.map((day) => day.date));

  const [sales, scanned, sold] = await Promise.all([
    db.query<{ count: number; cents: number }>(salesQuery.text, salesQuery.values),
    db.query<{ count: number }>(scannedQuery.text, scannedQuery.values),
    db.query<SoldRow>(soldQuery.text, soldQuery.values),
  ]);

  const salesRow = sales.rows[0];
  const scannedRow = scanned.rows[0];
  if (!salesRow || !scannedRow) throw new Error("Ticket aggregate returned no row");

  const numbers: TicketNumbers = {
    salesTodayCount: asInt(salesRow.count, "sales count"),
    salesTodayCents: asInt(salesRow.cents, "sales cents"),
    scannedToday: asInt(scannedRow.count, "scan count"),
    ...shapeSoldLines(sold.rows, remaining),
  };
  if (!boardIsEmpty(numbers)) return numbers;

  const visibility = ticketVisibilityQuery();
  const seen = await db.query<{ sees: boolean }>(visibility.text, visibility.values);
  const sees = seen.rows[0]?.sees;
  if (sees === undefined) throw new Error("The festival database has no public.tickets table.");
  if (!sees) throw new Error(HIDDEN_TICKETS_ERROR);
  return numbers;
}
