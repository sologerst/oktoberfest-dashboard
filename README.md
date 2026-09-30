# Oktoberfest sales dashboard

Internal sales screen for Nashville Oktoberfest 2026. It is a separate app from the public festival site. The festival database is read-only here. Beer, merch, and food come from Square POS orders.

The screen polls a snapshot every 60 seconds. When that snapshot is older than a minute, the poll refreshes it once for every open screen: Square and ticket SQL run together, then one write to this app's own database. If Square fails, the last good POS numbers for the same Chicago day stay up and are marked stale. If the ticket read fails, the POS cards still update.

## What the screen shows

- Tickets sold today (count and dollars) and unique scans for today's festival date.
- Sold tickets for each remaining festival day: Thursday Oct 1 (complimentary Community Day), Friday Oct 2, Saturday Oct 3, and Sunday Oct 4, 2026. Days already past drop off.
- Weekend passes on their own line. Undated `ga`, `vip`, `ga-comp`, and `vip-any-day` tickets show as **day not recorded**. Dated complimentary tickets stay on the day stored in `tickets.validDate`. They are not guessed back into a date.
- Beer, merch, and food dollars, plus quantity when the Square line items have it.

Times use America/Chicago.

## Setup

Copy `.env.example` to `.env.local`.

| Variable | Purpose |
|---|---|
| `FESTIVAL_DATABASE_URL` | Festival Postgres. The festival site's `DATABASE_URL` is fine, including the transaction pooler on port 6543. This app connects in session mode and sets the session read-only. A direct `db.<ref>.supabase.co` host is rewritten to the festival IPv4 pooler (`aws-1-us-east-1` by default, then the other us-east-1 prefix if that tenant is missing). |
| `DASHBOARD_DATABASE_URL` | This app's Postgres. Snapshot rows and card setup are stored here. Must be a different database from the festival app. A direct `db.<project>.supabase.co` host is IPv6-only and times out on Vercel; the app connects through the IPv4 session pooler instead. |
| `SQUARE_ACCESS_TOKEN` | Token that can search orders and read the catalog for the POS locations. |
| `SQUARE_ENVIRONMENT` | `production` or `sandbox`. |
| `DASHBOARD_BASIC_AUTH_USER` / `DASHBOARD_BASIC_AUTH_PASSWORD` | Gate for the TV and office screen. Production stays locked until both are set. |
| `CRON_SECRET` | Vercel sends `Authorization: Bearer <CRON_SECRET>` to `/api/cron/refresh`. |

Open **Card setup** on the signed-in sales screen to map Square. Each card takes a location id plus item or category ids, or it adds other cards together. Use one card per alcohol booth, then an Alcohol card that checks those booths. The same location can be on more than one card. An item listed on two cards stops those cards instead of counting the sale twice. `config/pos-categories.yaml` is only the fallback before the first save.

`npm run dev` serves the waiting screen with no credentials. `DASHBOARD_SAMPLE=1` shows sample numbers locally and is ignored in production.

`vercel.json` pins the Next.js framework and clears a static output directory. These Vercel projects were created when the repo was only the handoff markdown, so a static preset looks for a `public` folder this app does not have and fails the deployment before `next build`. The same file schedules a backup refresh once a day (`0 17 * * *`, noon America/Chicago during daylight time). Hobby plans reject a cron that runs more often, and that rejection fails the deployment. While the screen is open it still refreshes a snapshot older than 60 seconds. On a Pro plan, change the schedule to `* * * * *`.

## Checks

```bash
npm test
npm run lint
npm run build
```

Per-day lines read `tickets.validDate`. Undated `ga` and `vip` stay on **day not recorded**. This dashboard only reads that column.
