"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatCents, formatCount, formatQuantity } from "@/lib/format";
import { formatChicagoTime, formatFestivalDay, SNAPSHOT_MAX_AGE_MS, snapshotNeedsRefresh } from "@/lib/time";
import type { DisplayCard, PublicSnapshot, TicketBoard } from "@/lib/types";

const LOGO = (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
  </svg>
);

const tileClass =
  "sales-tile @container flex h-full min-h-0 flex-col justify-center overflow-hidden rounded-sm border border-white/10 bg-card px-5 py-3 lg:px-6 lg:py-4";
const tileLabelClass = "font-label text-[clamp(1.35rem,4.2cqi,2rem)] leading-none text-white/80";
const tileMetaClass = "mt-2 min-h-[2.2em] text-[clamp(0.95rem,2.4cqi,1.3rem)] leading-snug";

/** Four festival days stay on one row. Fewer days keep the wider columns. */
export function dayColumnClass(count: number): string {
  if (count <= 1) return "grid-cols-1";
  if (count === 2) return "grid-cols-1 sm:grid-cols-2";
  if (count === 3) return "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3";
  return "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4";
}

/** Eight booth cards are two rows of four, so they do not stack on top of each other. */
export function posColumnClass(count: number): string {
  if (count <= 1) return "grid-cols-1";
  if (count === 2) return "grid-cols-1 sm:grid-cols-2";
  if (count === 3) return "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3";
  return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";
}

export function dayBarPercent(count: number | null, max: number): number {
  if (count === null || count <= 0 || max <= 0) return 0;
  return Math.min(100, (count / max) * 100);
}

function largestDayCount(days: TicketBoard["days"]): number {
  let max = 0;
  for (const day of days) {
    if (day.count !== null && day.count > max) max = day.count;
  }
  return max;
}

function StatCard({
  label,
  value,
  money,
  subtitle,
  unavailable,
}: {
  label: string;
  value: string;
  money?: boolean;
  subtitle: string;
  unavailable: boolean;
}) {
  return (
    <article className={tileClass}>
      <p className={tileLabelClass}>{label}</p>
      <p className={`font-display text-figure mt-3 font-bold tabular-nums whitespace-nowrap ${money && !unavailable ? "text-mark" : "text-white"}`}>
        {value}
      </p>
      <p className={`${tileMetaClass} ${unavailable ? "text-white/55" : "text-white/65"}`}>{subtitle}</p>
    </article>
  );
}

function TicketStats({ tickets, scanDay }: { tickets: TicketBoard; scanDay: string }) {
  const countMissing = tickets.salesTodayCount === null;
  const centsMissing = tickets.salesTodayCents === null;
  const scansMissing = tickets.scannedToday === null;
  return (
    <div className="grid h-full min-h-0 flex-1 auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <StatCard
        label="Tickets sold today"
        value={formatCount(tickets.salesTodayCount)}
        subtitle={countMissing ? "Unavailable" : "Paid, including comps"}
        unavailable={countMissing}
      />
      <StatCard
        label="Ticket sales today"
        value={formatCents(tickets.salesTodayCents)}
        money
        subtitle={centsMissing ? "Unavailable" : "Excludes comps, fees, and insurance"}
        unavailable={centsMissing}
      />
      <StatCard
        label="Scanned today"
        value={formatCount(tickets.scannedToday)}
        subtitle={scansMissing ? "Unavailable" : `Unique tickets for ${scanDay}`}
        unavailable={scansMissing}
      />
    </div>
  );
}

function DayRows({ tickets, stale }: { tickets: TicketBoard; stale: boolean }) {
  const max = largestDayCount(tickets.days);
  const hasDays = tickets.days.length > 0;
  const showWeekend = hasDays || (tickets.weekendPasses !== null && tickets.weekendPasses > 0);
  const showUnrecorded = tickets.dayNotRecorded !== null && tickets.dayNotRecorded > 0;
  return (
    <section className="shrink-0 rounded-sm border border-white/10 bg-card px-5 py-3 lg:px-7 lg:py-4">
      <h2 className="mb-3 font-label text-xl text-white/70 lg:text-2xl">
        Sold for remaining days
        {stale ? <span className="text-mark"> · Stale</span> : <span className="text-white/55"> · Refreshes every {SNAPSHOT_MAX_AGE_MS / 1000}s</span>}
      </h2>
      {hasDays ? (
        <div className={`grid gap-x-6 gap-y-4 ${dayColumnClass(tickets.days.length)}`}>
          {tickets.days.map((day) => {
            const width = dayBarPercent(day.count, max);
            return (
              <div key={day.date} className="@container min-w-0">
                <p className="font-label text-[clamp(1.35rem,4.8cqi,1.85rem)] leading-none text-white/70">{day.label}</p>
                <p className="font-display text-day-figure mt-3 font-bold tabular-nums whitespace-nowrap text-white">
                  {formatCount(day.count)}
                </p>
                <div className="mt-3 h-3 rounded-full bg-white/10" aria-hidden="true">
                  <div className="h-3 rounded-full bg-mark" style={{ width: `${width}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-2xl text-white/50">No day sales yet.</p>
      )}
      {showWeekend || showUnrecorded ? (
        <div className="mt-3 flex flex-wrap gap-x-10 gap-y-2 border-t border-white/10 pt-3">
          {showWeekend ? (
            <div className="flex items-baseline gap-3">
              <span className="font-label text-lg text-white/70 lg:text-xl">Weekend passes</span>
              <span className="font-display text-3xl font-bold tabular-nums text-white lg:text-4xl">{formatCount(tickets.weekendPasses)}</span>
            </div>
          ) : null}
          {showUnrecorded ? (
            <div className="flex items-baseline gap-3">
              <span className="font-label text-lg text-white/70 lg:text-xl">Day not recorded</span>
              <span className="font-display text-3xl font-bold tabular-nums text-white lg:text-4xl">{formatCount(tickets.dayNotRecorded)}</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function countNoun(card: DisplayCard): string {
  const label = card.quantityLabel?.trim();
  if (label) return label;
  return card.quantity === 1 ? "item" : "items";
}

function posSubtitle(card: DisplayCard): { text: string; quiet: boolean } | null {
  if (card.cents === null) return { text: "Unavailable", quiet: true };
  if (card.quantity !== null) {
    const quantity = formatQuantity(card.quantity);
    if (quantity !== null) return { text: `${quantity} ${countNoun(card)}`, quiet: false };
  }
  if (card.cents === 0) return { text: "No sales yet.", quiet: true };
  return null;
}

function PosCard({ card }: { card: DisplayCard }) {
  const subtitle = posSubtitle(card);
  const unavailable = card.cents === null;
  return (
    <article className={tileClass}>
      <p className={tileLabelClass}>{card.label}</p>
      <p className={`font-display text-figure mt-3 font-bold tabular-nums whitespace-nowrap ${unavailable ? "text-white" : "text-mark"}`}>
        {formatCents(card.cents)}
      </p>
      <p className={`${tileMetaClass} ${subtitle?.quiet ? "text-white/55" : "text-white/65"}`}>
        {subtitle?.text ?? "\u00a0"}
      </p>
    </article>
  );
}

function sectionStale(cards: DisplayCard[]): boolean {
  return cards.some((card) => card.status === "stale");
}

export function SalesDashboard({ initial, sample }: { initial: PublicSnapshot; sample: boolean }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [pollError, setPollError] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let stopped = false;
    let inFlight = false;
    const poll = setInterval(() => {
      if (inFlight) return;
      inFlight = true;
      void (async () => {
        try {
          const response = await fetch("/api/snapshot", { cache: "no-store" });
          if (!response.ok) throw new Error(`Snapshot request failed (${response.status})`);
          const body = (await response.json()) as { snapshot: PublicSnapshot };
          if (stopped) return;
          setSnapshot(body.snapshot);
          setPollError(false);
        } catch (error) {
          console.error(error);
          if (!stopped) setPollError(true);
        } finally {
          inFlight = false;
          if (!stopped) setNow(new Date());
        }
      })();
    }, SNAPSHOT_MAX_AGE_MS);
    return () => {
      stopped = true;
      clearInterval(poll);
    };
  }, []);

  const headerStale = pollError || snapshotNeedsRefresh(snapshot.generatedAt, now);
  const ticketsStale = snapshot.tickets.status === "stale";
  const posStale = sectionStale(snapshot.cards);
  const manyCards = snapshot.cards.length > 3;
  const scanDay = formatFestivalDay(snapshot.tickets.asOf ?? snapshot.generatedAt);

  return (
    <div className="sales-screen flex flex-col bg-page text-white">
      <header className="shrink-0 border-b border-white/10 bg-header px-6 py-3 lg:px-8 lg:py-4">
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm bg-mark text-mark-ink">
              {LOGO}
            </div>
            <div className="min-w-0">
              <p className="font-label text-base leading-none text-mark lg:text-lg">Nashville Oktoberfest 2026</p>
              <p className="font-display text-3xl font-bold leading-tight text-white">Sales</p>
            </div>
          </div>
          <p className="text-lg text-white/75 lg:text-xl">
            <Link href="/setup" className="mr-5 text-base text-white/55 lg:text-lg">Card setup</Link>
            {sample ? <span className="font-label mr-4 text-base text-mark">Sample</span> : null}
            {headerStale ? <span className="font-label mr-4 text-base text-mark">Stale</span> : null}
            As of {formatChicagoTime(snapshot.generatedAt)}
          </p>
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col gap-3 p-4 lg:gap-4 lg:p-5">
        <section className={`flex min-h-0 flex-col gap-2 ${manyCards ? "flex-[0.85]" : "flex-1"}`}>
          <h2 className="shrink-0 font-label text-lg text-white/60 lg:text-xl">
            Tickets
            {ticketsStale ? <span className="text-mark"> · Stale</span> : <span> · Refreshes every {SNAPSHOT_MAX_AGE_MS / 1000}s</span>}
          </h2>
          {snapshot.tickets.error ? <p className="text-sm text-white/70">{snapshot.tickets.error}</p> : null}
          <TicketStats tickets={snapshot.tickets} scanDay={scanDay} />
        </section>
        <DayRows tickets={snapshot.tickets} stale={ticketsStale} />
        <section className={`flex min-h-0 flex-col gap-2 ${manyCards ? "flex-[1.7]" : "flex-1"}`}>
          <h2 className="shrink-0 font-label text-lg text-white/60 lg:text-xl">
            On-site sales
            {posStale ? <span className="text-mark"> · Stale</span> : null}
          </h2>
          <div className={`grid h-full min-h-0 flex-1 auto-rows-fr gap-3 ${posColumnClass(snapshot.cards.length)}`}>
            {snapshot.cards.map((card) => (
              <PosCard key={card.id} card={card} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
