# Sales dashboard design

Visual spec for the screen defined in `SALES-DASHBOARD-HANDOFF.md`. Numbers, sources, and the per-day ticket gap stay in that file. This file is how the page should look.

Match the festival **admin panel**, not the public marketing site. The admin is a dark walnut tool. The public site is cream, forest green, and photography. Do not bring those into this screen.

Source of the look: `src/screens/Admin.tsx`, `src/screens/admin/DashboardTab.tsx`, `src/screens/admin/LiveScansTab.tsx`, and `src/screens/admin/RevenueTab.tsx` in the festival repo, with tokens in `src/index.css`.

## What this screen is

One page. A TV or a laptop in the office. No admin sidebar, no breadcrumb, no 24 tabs. The admin shell is the reference for color, type, and cards. It is not the layout to copy.

Designed first for 1920×1080 with no page scroll. Below that, the same blocks stack. Do not shrink type under the sizes below to force a fit.

## Type

Load the same faces the festival site loads:

`Fraunces` (opsz 9..144, weights 300 and 700), `DM Sans` (300, 400, 500, 600), `Bebas Neue`.

https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,700;0,9..144,900;1,9..144,300;1,9..144,700&family=DM+Sans:wght@300;400;500;600&family=Bebas+Neue&display=swap

| Role | Face | Use |
|---|---|---|
| Display | Fraunces, bold, optical sizing on | Page title and every big number |
| Label | Bebas Neue, `letter-spacing: 0.08em`, uppercase | Kickers, card labels, section titles |
| Body | DM Sans | Subtitles, row labels, empty states |

## Color

All colors are the admin's. Amber is `oklch(0.72 0.16 65)`.

| Token | Value | Where |
|---|---|---|
| Page | `oklch(0.11 0.04 60)` | Full viewport |
| Header | `oklch(0.14 0.04 60)` | Top bar |
| Card | `oklch(0.16 0.04 60)` | Every stat and section card |
| Mark | `oklch(0.72 0.16 65)` | Logo square, money figures, bar fills |
| Mark ink | `oklch(0.14 0.04 60)` | Icon inside the logo square |
| Hairline | `border-white/10` | Header bottom, every card |
| Label text | `text-white/55` | Bebas labels |
| Body text | `text-white/70` | Row names |
| Quiet text | `text-white/55` | Subtitles under numbers |
| Empty text | `text-white/45` | "No sales yet." |
| Track | `bg-white/10` | Bar background |

Money is amber. Counts are white. Do not color a day bar red. The admin turns a capacity bar red above 90% sold. These bars compare days to each other. They are not capacity.

## Header

Height comes from `px-6 py-3`, bottom border `border-white/10`.

Left, in a row with `gap-3`:

- A `32×32` square, `rounded-sm`, amber fill. Centered mark is the same stacked-layers icon the admin uses, filled with the header color, 16×16.
- Two lines. Top: `NASHVILLE OKTOBERFEST 2026` in amber Bebas, 10px, tracking widest, tight line-height. Bottom: `Sales` in white Fraunces bold, 16px.

Right, DM Sans 14px, `text-white/65`: `As of 2:14 PM CT`. When the snapshot is stale, add an amber Bebas label `STALE` in front of that time. Keep the last numbers on screen.

## Page stack

Content is `p-6` with `space-y-6` between blocks. This is the admin content padding.

### Tickets

A Bebas line, `text-white/55`, `text-xs`, tracking widest:

`TICKETS · REFRESHES EVERY 60S`

Then a row of three stat cards. Grid is 1 column, then 3 columns from `md` up. `gap-4`.

Each card: `rounded-sm`, `border border-white/10`, `p-5`, card background. Inside, top to bottom:

1. Bebas label, `text-white/55`, 10px, tracking widest.
2. Fraunces bold white (or amber for money), `text-3xl`.
3. Optional DM Sans subtitle, `text-white/55`, `text-xs`, margin-top 4px.

| Card | Label | Value | Subtitle |
|---|---|---|---|
| 1 | `TICKETS SOLD TODAY` | count, white | `Paid, including comps` |
| 2 | `TICKET SALES TODAY` | dollars, amber | `Excludes comps, fees, and insurance` |
| 3 | `SCANNED TODAY` | count, white | `Unique tickets for {weekday}` |

`{weekday}` is the festival day of the scan count, in America/Chicago (for example `Friday, Oct 2`).

### Remaining days

One full-width card, same chrome as the stat cards, `p-5`.

Title: `SOLD FOR REMAINING DAYS`, Bebas, `text-white/55`, `text-xs`, tracking widest, margin-bottom 16px.

One row per remaining ticketed day (Friday Oct 2, Saturday Oct 3, Sunday Oct 4, 2026, skipping days already past). Match the admin capacity rows:

- Left: day name in DM Sans, `text-white/70`, `text-sm`. Example: `Friday, Oct 2`.
- Right: count in white, `text-sm`.
- Under the text: a track `h-2`, `bg-white/10`, `rounded-full`. Fill is amber, width is that day's count divided by the largest remaining day. A day with zero is an empty track, not a hidden row.

Under the day rows, a `border-t border-white/10` and two plain rows. No bars. These are not days:

- `Weekend passes` and its count.
- `Day not recorded` and its count. Render this row only when the count is greater than zero.

Empty days list (festival over, or no dated tickets yet): DM Sans `text-white/45` `text-sm`, `No day sales yet.` The weekend and unrecorded rows still show when their counts are non-zero.

### Beer, merch, food

A Bebas line, same style as the tickets kicker: `ON-SITE SALES`.

Three cards, `gap-4`, one column then three from `md` up. Same card chrome, `p-5`.

Each card:

1. Label `BEER`, `MERCH`, or `FOOD`. Bebas, `text-white/55`, 10px, tracking widest.
2. Today's dollars, Fraunces bold, amber, `text-3xl`.
3. Subtitle in DM Sans, `text-white/55`, `text-xs`: item quantity when Square sent one (`128 items`). If there is no quantity, omit the subtitle. Do not invent one.

A card with no sales today still renders. Value is `$0.00`. Subtitle is `No sales yet.` in `text-white/45`.

Do not list the Square catalog ids on the card.

## Formatting

- Dollars: USD, `en-US`, always two fraction digits. `$1,234.56`.
- Counts: `en-US` grouping. `1284` displays as `1,284`.
- Times: America/Chicago, with a `CT` suffix.

## States

| State | What to show |
|---|---|
| First load, no snapshot yet | Centered spinner on the page background. `40×40` ring, 2px amber border, top edge transparent, spinning. Same spinner as the admin. No skeleton cards. |
| Refresh failed, previous snapshot exists | Keep every number. Header shows `STALE` plus the time of the last good snapshot. |
| Tickets failed, Square did not | Ticket cards and the day card show their last good numbers with `STALE` on that section kicker. Beer, merch, and food stay live. |
| Square failed, tickets did not | The three POS cards keep last good numbers. Their section kicker reads `ON-SITE SALES · STALE`. Ticket cards stay live. |
| A section has never loaded | That section's cards show `—` for the value and `Unavailable` in `text-white/45`. Do not show `$0.00` for a failed read. `$0.00` means a successful read of nothing. |

## Do not add

- The admin sidebar, user avatar, or "Festival Site" link.
- Charts, sparklines, or a map.
- Ticket-type inventory bars from the admin Dashboard tab. This screen is today and remaining days, not all-time capacity.
- Public-site cream backgrounds, forest green, or photo heroes.
