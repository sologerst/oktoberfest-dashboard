# Oktoberfest sales dashboard

Internal sales screen for Nashville Oktoberfest 2026. It is a separate app from the public festival site. The festival database is read-only here. Beer, merch, and food come from Square POS orders.

The screen polls a snapshot every 60 seconds. When that snapshot is older than a minute, the poll refreshes it once for every open screen: Square first, then ticket SQL, then one write to this app's own database. If Square fails, the last good POS numbers for the same Chicago day stay up and are marked stale. If the ticket read fails, the POS cards still update.

## What the screen shows

- Tickets sold today (count and dollars) and unique scans for today's festival date.
- Sold tickets for each remaining ticketed day: Friday Oct 2, Saturday Oct 3, Sunday Oct 4, 2026. Days already past drop off.
- Weekend passes on their own line. Undated `ga` and `vip` tickets show as **day not recorded**. Those are orders placed before checkout stored the selected day. They are not guessed back into a date.
- Beer, merch, and food dollars, plus quantity when the Square line items have it.

Times use America/Chicago.

## Setup

Copy `.env.example` to `.env.local`.

| Variable | Purpose |
|---|---|
| `FESTIVAL_DATABASE_URL` | Festival Postgres. The app forces `default_transaction_read_only`. Prefer a role with `SELECT` on `orders`, `tickets`, `ticket_types`, and `ticket_check_ins`. Use a session connection, not a transaction pooler. |
| `DASHBOARD_DATABASE_URL` | This app's Postgres. Snapshot rows are created here. Must be a different database from the festival app. |
| `SQUARE_ACCESS_TOKEN` | Token that can search orders and read the catalog for the POS locations. |
| `SQUARE_ENVIRONMENT` | `production` or `sandbox`. |
| `DASHBOARD_BASIC_AUTH_USER` / `DASHBOARD_BASIC_AUTH_PASSWORD` | Gate for the TV and office screen. Production stays locked until both are set. |
| `CRON_SECRET` | Vercel sends `Authorization: Bearer <CRON_SECRET>` to `/api/cron/refresh`. |

Fill `config/pos-categories.yaml` with Square location ids and catalog object ids or category ids. An item listed on two cards is a config error: those cards stop updating instead of double-counting. Leave a card empty until its ids are known.

`npm run dev` serves the waiting screen with no credentials. `DASHBOARD_SAMPLE=1` shows sample numbers locally and is ignored in production.

`vercel.json` schedules a backup refresh once a day (`0 17 * * *`, noon America/Chicago during daylight time). Hobby plans reject a cron that runs more often, and that rejection fails the deployment. While the screen is open it still refreshes a snapshot older than 60 seconds. On a Pro plan, change the schedule to `* * * * *`.

## Checks

```bash
npm test
npm run lint
npm run build
```

Per-day ticket lines stay incomplete until festival checkout stores `tickets.validDate` for `ga` and `vip`. This dashboard only reads that column.
