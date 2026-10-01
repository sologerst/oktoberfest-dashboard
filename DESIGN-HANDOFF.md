# Sales dashboard design

Visual spec for the screen defined in `SALES-DASHBOARD-HANDOFF.md`. Numbers, sources, and the per-day ticket gap stay in that file. This file is how the page should look.

Match the festival **admin panel**, not the public marketing site. The admin is a dark walnut tool. The public site is cream, forest green, and photography. Do not bring those into this screen.

Source of the look: `src/screens/Admin.tsx`, `src/screens/admin/DashboardTab.tsx`, `src/screens/admin/LiveScansTab.tsx`, and `src/screens/admin/RevenueTab.tsx` in the festival repo, with tokens in `src/index.css`.

## What this screen is

One page. A TV or a laptop in the office. No admin sidebar, no breadcrumb, no 24 tabs. The admin shell is the reference for color, type, and cards. It is not the layout to copy.

Designed first for a 1920×1080 TV read from across the room. The live board is three ticket totals, four remaining days, weekend passes, day not recorded, and the on-site cards (Beer, the booths, Merch, and Food). From 1280×800 up, that set fills the screen and does not scroll. Cards shrink into their row instead of painting over the next card. Numbers stay at least `3.25rem`. Shorter screens scroll. Below `lg`, the same blocks stack.

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
| Label text | `text-white/80` on cards, `text-white/70` on day names | Bebas labels, large enough to read across a room |
| Body text | `text-white/70` | Day names and the weekend lines |
| Quiet text | `text-white/65` | Subtitles under numbers |
| Empty text | `text-white/55` | "No sales yet." and "Unavailable" |
| Track | `bg-white/10` | Bar background |

Money is amber. Counts are white. Do not color a day bar red. The admin turns a capacity bar red above 90% sold. These bars compare days to each other. They are not capacity.

## Header

Height comes from `px-6 py-3` (`lg:px-8 lg:py-4`), bottom border `border-white/10`.

Left, in a row with `gap-4`:

- A `48×48` square, `rounded-sm`, amber fill. Centered mark is the same stacked-layers icon the admin uses, filled with the header color, 26×26.
- Two lines. Top: `NASHVILLE OKTOBERFEST 2026` in amber Bebas, 16px (`lg` 18px), tracking widest, tight line-height. Bottom: `Sales` in white Fraunces bold, 30px.

Right, DM Sans 18px (`lg` 20px), `text-white/75`: `As of 2:14 PM CT`. When the snapshot is stale, add an amber Bebas label `STALE` (16px) in front of that time. Keep the last numbers on screen.

## Page stack

Content is `p-5` (`lg:p-6`) with `gap-4` (`lg:gap-5`) between blocks. On a 1080p screen the two number rows grow to fill the viewport. From 1280px wide and 1000px tall, the screen is locked to `100dvh` so it does not scroll.

### Tickets

A Bebas line, `text-white/60`, `text-lg` (`lg:text-xl`), tracking widest:

`TICKETS · REFRESHES EVERY 60S`

Then a row of three stat cards. Grid is 1 column, 2 columns from `sm`, and 3 columns from `xl`. `gap-4`. Three columns start at `xl` so a dollar figure still fits. Extra cards wrap and share the row height.

Each card: `rounded-sm`, `border border-white/10`, `px-7 py-6` (`lg:px-8 lg:py-7`), card background, content vertically centered, at least 14rem tall. The card is an inline-size container. Inside, top to bottom:

1. Bebas label, `text-white/80`, `clamp(1.7rem, 5.4cqi, 2.15rem)`, tracking widest.
2. Fraunces bold white (or amber for money), `clamp(3.25rem, 18cqi, 8rem)`, tight line-height, nowrap, tabular nums.
3. DM Sans subtitle, `text-white/65` (or `text-white/55` when unavailable), `clamp(1.25rem, 3cqi, 1.55rem)`, margin-top 16px, at least two lines tall so figures in a row share a baseline. Keep that line when a POS card has no subtitle. Do not invent a quantity.

| Card | Label | Value | Subtitle |
|---|---|---|---|
| 1 | `TICKETS SOLD TODAY` | count, white | `Paid, including comps` |
| 2 | `TICKET SALES TODAY` | dollars, amber | `Excludes comps, fees, and insurance` |
| 3 | `SCANNED TODAY` | count, white | `Unique tickets for {weekday}` |

`{weekday}` is the festival day of the scan count, in America/Chicago (for example `Friday, Oct 2`).

### Remaining days

One full-width card, `px-7 py-5` (`lg:px-9 lg:py-6`), same border and background as the stat cards.

Title: `SOLD FOR REMAINING DAYS`, Bebas, `text-white/70`, `text-xl` (`lg:text-2xl`), tracking widest, margin-bottom 16px.

One column per remaining ticketed day (Thursday Oct 1 through Sunday Oct 4, 2026, skipping days already past). One day is a single column. Two days are two columns from `sm`. Three days are two columns from `sm` and three from `xl`. Four days are two columns from `sm` and four from `xl`, so Sunday stays on the same row.

- Day name in Bebas, `text-white/70`, `clamp(1.35rem, 4.8cqi, 1.85rem)`. Example: `FRIDAY, OCT 2`.
- Count under it, Fraunces bold white, `clamp(2.5rem, 11cqi, 4.25rem)`, tabular nums.
- Under the count: a track `h-3`, `bg-white/10`, `rounded-full`. Fill is amber, width is that day's count divided by the largest remaining day. A day with zero is an empty track, not a hidden row.

Under the day columns, a `border-t border-white/10` and the extra lines in a row. No bars. These are not days:

- `Weekend passes` in Bebas `text-xl`, count in Fraunces bold `text-4xl`.
- `Day not recorded` the same way. Render this line only when the count is greater than zero.

Empty days list (festival over, or no dated tickets yet): DM Sans `text-white/50` `text-2xl`, `No day sales yet.` The weekend and unrecorded lines still show when their counts are non-zero.

### Beer, merch, food

A Bebas line, same style as the tickets kicker: `ON-SITE SALES`.

Three on-site cards use one column, two from `sm`, and three from `xl`. Four or more cards use four columns from `lg`, so eight cards are two rows of four. Each card stays inside its grid cell.

Each card:

1. Label `BEER`, `MERCH`, or `FOOD`. Bebas, `text-white/80`, `clamp(1.7rem, 5.4cqi, 2.15rem)`, tracking widest.
2. Today's dollars, Fraunces bold, amber, `clamp(3.25rem, 18cqi, 8rem)`.
3. Subtitle in DM Sans, `text-white/65`, `clamp(1.25rem, 3cqi, 1.55rem)`, two lines tall: the programmed item count when card setup lists variation ids to count (`128 beers`, or `128 items` when no name is set). If that list is blank, or a counted line has no quantity, leave the subtitle line blank. Do not invent one.

A card with no sales today still renders. Value is `$0.00`. Subtitle is `No sales yet.` in `text-white/55`.

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
| A section has never loaded | That section's cards show `—` for the value and `Unavailable` in `text-white/55`. Do not show `$0.00` for a failed read. `$0.00` means a successful read of nothing. |

## Do not add

- The admin sidebar, user avatar, or "Festival Site" link.
- Charts, sparklines, or a map.
- Ticket-type inventory bars from the admin Dashboard tab. This screen is today and remaining days, not all-time capacity.
- Public-site cream backgrounds, forest green, or photo heroes.
