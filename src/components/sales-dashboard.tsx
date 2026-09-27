"use client";

import { useEffect, useState } from "react";
import { formatCents, formatCount, formatQuantity } from "@/lib/format";
import { formatChicagoTime, formatFestivalDay, snapshotNeedsRefresh } from "@/lib/time";
import type { CardId, MoneyCard, PublicSnapshot, TicketBoard } from "@/lib/types";

const CARD_LABELS: Record<CardId, string> = {
  beer: "Beer",
  merch: "Merch",
  food: "Food",
};

const POLL_MS = 60_000;

const LOGO = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
  </svg>
);

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
    <article className="rounded-sm border border-white/10 bg-card p-5">
      <p className="font-label text-[10px] text-white/55">{label}</p>
      <p className={`font-display text-3xl font-bold tabular-nums ${money && !unavailable ? "text-mark" : "text-white"}`}>
        {value}
      </p>
      <p className={`mt-1 text-xs ${unavailable ? "text-white/45" : "text-white/55"}`}>{subtitle}</p>
    </article>
  );
}

function TicketStats({ tickets, scanDay }: { tickets: TicketBoard; scanDay: string }) {
  const countMissing = tickets.salesTodayCount === null;
  const centsMissing = tickets.salesTodayCents === null;
  const scansMissing = tickets.scannedToday === null;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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

function DayRows({ tickets }: { tickets: TicketBoard }) {
  const max = largestDayCount(tickets.days);
  const hasDays = tickets.days.length > 0;
  const showWeekend = hasDays || (tickets.weekendPasses !== null && tickets.weekendPasses > 0);
  const showUnrecorded = tickets.dayNotRecorded !== null && tickets.dayNotRecorded > 0;
  return (
    <section className="rounded-sm border border-white/10 bg-card p-5">
      <h2 className="mb-4 font-label text-xs text-white/55">Sold for remaining days</h2>
      {hasDays ? (
        <div className="space-y-4">
          {tickets.days.map((day) => {
            const width = dayBarPercent(day.count, max);
            return (
              <div key={day.date}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-white/70">{day.label}</span>
                  <span className="tabular-nums text-white">{formatCount(day.count)}</span>
                </div>
                <div className="h-2 rounded-full bg-white/10" aria-hidden="true">
                  <div className="h-2 rounded-full bg-mark" style={{ width: `${width}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-white/45">No day sales yet.</p>
      )}
      {showWeekend || showUnrecorded ? (
        <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
          {showWeekend ? (
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-white/70">Weekend passes</span>
              <span className="tabular-nums text-white">{formatCount(tickets.weekendPasses)}</span>
            </div>
          ) : null}
          {showUnrecorded ? (
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-white/70">Day not recorded</span>
              <span className="tabular-nums text-white">{formatCount(tickets.dayNotRecorded)}</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function posSubtitle(card: MoneyCard): { text: string; quiet: boolean } | null {
  if (card.cents === null) return { text: "Unavailable", quiet: true };
  if (card.cents === 0) return { text: "No sales yet.", quiet: true };
  if (card.quantity === null) return null;
  const quantity = formatQuantity(card.quantity);
  if (quantity === null) return null;
  const noun = card.quantity === 1 ? "item" : "items";
  return { text: `${quantity} ${noun}`, quiet: false };
}

function PosCard({ id, card }: { id: CardId; card: MoneyCard }) {
  const subtitle = posSubtitle(card);
  const unavailable = card.cents === null;
  return (
    <article className="rounded-sm border border-white/10 bg-card p-5">
      <p className="font-label text-[10px] text-white/55">{CARD_LABELS[id]}</p>
      <p className={`font-display text-3xl font-bold tabular-nums ${unavailable ? "text-white" : "text-mark"}`}>
        {formatCents(card.cents)}
      </p>
      {subtitle ? (
        <p className={`mt-1 text-xs ${subtitle.quiet ? "text-white/45" : "text-white/55"}`}>{subtitle.text}</p>
      ) : null}
    </article>
  );
}

function sectionStale(cards: MoneyCard[]): boolean {
  return cards.some((card) => card.status === "stale");
}

export function SalesDashboard({ initial, sample }: { initial: PublicSnapshot; sample: boolean }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [pollError, setPollError] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const poll = setInterval(() => {
      void (async () => {
        try {
          const response = await fetch("/api/snapshot", { cache: "no-store" });
          if (!response.ok) throw new Error(`Snapshot request failed (${response.status})`);
          const body = (await response.json()) as { snapshot: PublicSnapshot };
          setSnapshot(body.snapshot);
          setPollError(false);
        } catch (error) {
          console.error(error);
          setPollError(true);
        } finally {
          setNow(new Date());
        }
      })();
    }, POLL_MS);
    return () => clearInterval(poll);
  }, []);

  const headerStale = pollError || snapshotNeedsRefresh(snapshot.generatedAt, now);
  const ticketsStale = snapshot.tickets.status === "stale";
  const posStale = sectionStale([snapshot.beer, snapshot.merch, snapshot.food]);
  const scanDay = formatFestivalDay(snapshot.tickets.asOf ?? snapshot.generatedAt);

  return (
    <div className="min-h-screen bg-page text-white">
      <header className="border-b border-white/10 bg-header px-6 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-mark text-mark-ink">
              {LOGO}
            </div>
            <div className="min-w-0">
              <p className="font-label text-[10px] leading-none text-mark">Nashville Oktoberfest 2026</p>
              <p className="font-display text-base font-bold leading-tight text-white">Sales</p>
            </div>
          </div>
          <p className="text-sm text-white/65">
            {sample ? <span className="font-label mr-3 text-[10px] text-mark">Sample</span> : null}
            {headerStale ? <span className="font-label mr-2 text-[10px] text-mark">Stale</span> : null}
            As of {formatChicagoTime(snapshot.generatedAt)}
          </p>
        </div>
      </header>
      <main className="space-y-6 p-6">
        <section className="space-y-4">
          <h2 className="font-label text-xs text-white/55">
            Tickets
            {ticketsStale ? <span className="text-mark"> · Stale</span> : <span> · Refreshes every 60s</span>}
          </h2>
          <TicketStats tickets={snapshot.tickets} scanDay={scanDay} />
        </section>
        <DayRows tickets={snapshot.tickets} />
        <section className="space-y-4">
          <h2 className="font-label text-xs text-white/55">
            On-site sales
            {posStale ? <span className="text-mark"> · Stale</span> : null}
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <PosCard id="beer" card={snapshot.beer} />
            <PosCard id="merch" card={snapshot.merch} />
            <PosCard id="food" card={snapshot.food} />
          </div>
        </section>
      </main>
    </div>
  );
}
