# Sales dashboard handoff

Build a **separate** real-time sales dashboard for Nashville Oktoberfest 2026. Do not add it to the public festival site (`Oktoberfest Site`). That app’s database is the checkout and gate-scanning path. This dashboard reads it. It does not deploy with it, share its process, or write to it.

Refresh every **30 seconds**. Timezone for every “today” and festival day is **America/Chicago**.

## What the screen shows

1. **Tickets**
   - Sales today: ticket count and ticket dollars.
   - Scanned today: unique tickets checked in for today’s festival date.
   - Sold for each remaining ticketed day (Fri Oct 2, Sat Oct 3, Sun Oct 4, 2026), plus weekend passes as their own line. Weekend passes are not a sale for one day.
2. **Beer** card, **merch** card, **food** card. Each is the sum of several Square catalog items, in dollars. A card also shows a count when its setup lists which of those items to count.

## Where each number comes from

| Number | Source | Why |
|---|---|---|
| Beer, merch, food | Square Orders / catalog only | On-site POS. These sales are not in the festival database. |
| Tickets sold today (count and dollars) | Festival database only | Website checkout charges Square one lump `CreatePayment`. No Square order, no catalog line, no day, no quantity. The note is the buyer email. Comps never touch Square. |
| Scanned today | Festival database only | Gate scans write `ticket_check_ins`. Square is never told. |
| Sold per remaining day | Festival database, **after** the prerequisite below | The day the buyer picked is not stored yet. Square does not have it either. |

Do not derive ticket counts, ticket dollars, or scans from Square payments. Square website charges mix tickets, fees, insurance, and charity into one amount.

## Prerequisite (do this in the festival repo first)

The ticket page lets a buyer pick a day, then drops it.

- UI day ids: `fri`, `sat`, `sun` (Thursday `thu` is filtered out). They map to `FESTIVAL_DATES` in `src/lib/festivalDates.ts`: `2026-10-02`, `2026-10-03`, `2026-10-04`. Thursday Oct 1 is a free Community Day and is not a ticketed day.
- `buildCart()` in `src/screens/Tickets.tsx` puts `dayId` on each cart line.
- `createPaymentIntent` / `confirmOrder` in `server/ticketingRouter.ts` accept only `{ ticketTypeId, quantity, attendees }`. `dayId` is not sent.
- `finalizeTicketOrder` in `server/db.ts` inserts `tickets` rows with no `validDate`. The column exists (`tickets.validDate`, nullable date). Null means valid any festival day (weekend / bundle passes).

Until checkout persists the day:

- Single-day types `ga` and `vip` must store `validDate` as the ISO date for `fri` / `sat` / `sun`. Reject a missing day or Thursday on those slugs.
- Bundle slugs `ga-weekend`, `vip-weekend`, and legacy `weekend` stay `validDate = null` (`dayId: "all"`).
- One ticket row per seat, each with that line’s date. Two Friday GA and two Saturday GA must not collapse into four undated GA tickets.
- Orders already placed have `validDate` null. Do not backfill by guessing. The dashboard shows those as **day not recorded**, separate from weekend passes and from dated tickets.

Ticket types (from `TICKET_PRICING_2026` in `server/db.ts`):

| Slug | Meaning | Day |
|---|---|---|
| `ga` | General Admission, $10 online | one day, buyer picks Fri/Sat/Sun |
| `vip` | VIP Experience, $197 | one day, buyer picks Fri/Sat/Sun |
| `ga-weekend` | GA Weekend Pass pre-sale, $15 | all ticketed days, `validDate` null |
| `vip-weekend` | VIP Weekend Fri–Sun, $347 | all ticketed days, `validDate` null |

## Festival database reads

Read-only. A SQL role with `SELECT` on the tables below is enough. Run the aggregates from this dashboard’s cron, not from the festival Next.js app. Every 30 seconds is cheap. Do not add tables, mirrors, or write traffic to this database.

Connection: `DATABASE_URL` on the festival app (Drizzle + Postgres). Do not point the dashboard at the festival app’s server code. Query the tables.

Count a ticket as sold only when:

- parent `orders.status = 'paid'` (comps are `paid` with no Square payment; include them in **counts**, exclude them from **dollars**),
- `tickets.revokedAt` is null,
- order is not `refunded` or `cancelled`.

**Sales today**

- Count: paid, non-revoked tickets whose order `createdAt` falls on today in America/Chicago.
- Dollars: sum of those tickets’ `priceInCents`, excluding comps (orders with no `squarePaymentId` and notes starting with `COMP:`, or `paymentProvider` null). Fees, insurance, and charity are not ticket sales. Prefer `tickets.priceInCents` over the Square charge amount.

**Scanned today**

- `COUNT(*)` from `ticket_check_ins` where `eventDate` is today’s festival date in America/Chicago.
- The unique key is `(ticketId, eventDate)`, so the count is unique tickets in today, not raw scan attempts.
- A weekend pass checked in today counts. A Friday-only ticket scanned on Saturday does not, because the gate rejects it before insert when `validDate` does not match.

**Sold for each remaining day**

- Remaining ticketed dates are Fri/Sat/Sun on or after today in America/Chicago. Omit dates that have already passed.
- For each date: count of sold tickets with `validDate` equal to that date.
- Separate lines, not folded into a day:
  - Weekend / bundle passes (`validDate` null and slug in `ga-weekend`, `vip-weekend`, `weekend`).
  - Undated single-day tickets (`validDate` null and slug in `ga`, `vip`). These are the historical gap. Label them “day not recorded”.

Useful columns:

- `orders`: `status`, `createdAt`, `totalInCents`, `squarePaymentId`, `paymentProvider`, `notes`
- `tickets`: `orderId`, `ticketTypeId`, `priceInCents`, `validDate`, `revokedAt`, `createdAt`
- `ticket_types`: `slug`, `name`
- `ticket_check_ins`: `ticketId`, `eventDate`, `checkedInAt`

## Square reads (beer, merch, food)

Use a Square access token that can search orders and read the catalog for the **POS locations**. The festival site’s `SQUARE_LOCATION_ID` is the website checkout location. Beer, food, and merch are other locations. Discover locations and catalog items first. Do not guess names.

Config (committed, ids not hardcoded in components):

```yaml
# example shape — fill with real Square ids after listing the catalog
beer:
  locationIds: []
  catalogObjectIds: []   # or category ids
merch:
  locationIds: []
  catalogObjectIds: []
food:
  locationIds: []
  catalogObjectIds: []
```

Each minute:

- Search completed Square orders updated since the last successful cursor, for those locations, closed today in America/Chicago.
- Sum line items whose catalog object (or category) is in that card’s list.
- Money is integer cents. Display dollars.
- An item in two lists is a config bug. Fail the card rather than double-count.
- Website ticket payments are `CreatePayment` with no line items. Ignore payments that are not POS orders when building these three cards.

Cache the Square result in **this** project (its own database, KV, or a snapshot row). The page reads the snapshot. Refetching Square on every browser load will hit rate limits once a TV and a laptop are both open.

Env:

- `SQUARE_ACCESS_TOKEN`
- `SQUARE_ENVIRONMENT` (`sandbox` or `production`)
- POS location ids in the config above, not necessarily `SQUARE_LOCATION_ID` from the festival app

## App shape

- New repo, new Vercel project, own subdomain. No shared deploy with the festival site.
- One cron per minute: Square pull, then the ticket SQL, then write one snapshot.
- The page polls that snapshot every 30 seconds. Show “as of {timestamp}”.
- If Square fails, keep the last good beer/merch/food numbers and show them stale. Do not fail the ticket section.
- If the database read fails, keep the last good ticket numbers and show them stale. Do not fail the Square cards.
- No auth baked into the public festival site. Protect this page (basic auth or an allowlist). It is an internal TV / office screen.

## Out of scope

- Do not rebuild gate scanning, checkout, or the existing admin Live Scans tab.
- Do not copy festival orders into a second system of record. Square is the source for POS. The festival database is the source for tickets and scans.
- Do not show Thursday as a ticketed sales day.
