"use client";

import { useEffect, useState } from "react";
import { formatCents, formatCount, formatQuantity } from "@/lib/format";
import { formatChicagoDay, formatChicagoTime } from "@/lib/time";
import type { CardId, MoneyCard, PublicSnapshot, SourceStatus, TicketBoard } from "@/lib/types";

const CARD_LABELS: Record<CardId, string> = {
  beer: "Beer",
  merch: "Merch",
  food: "Food",
};

const POLL_MS = 60_000;

function statusLabel(status: SourceStatus): string | null {
  if (status === "stale") return "Stale";
  if (status === "error") return "Unavailable";
  if (status === "unconfigured") return "Not configured";
  return null;
}

function MoneyPanel({ id, card }: { id: CardId; card: MoneyCard }) {
  const label = statusLabel(card.status);
  const quantity = formatQuantity(card.quantity);
  if (card.status === "unconfigured") {
    return (
      <section className="flex min-h-52 flex-col rounded-3xl border border-line bg-card px-6 py-5">
        <h2 className="text-xl font-semibold tracking-tight">{CARD_LABELS[id]}</h2>
        <p className="mt-6 text-lg text-muted">Not configured</p>
        <p className="mt-2 text-sm text-muted">
          Add this card&apos;s Square location and catalog ids in config/pos-categories.yaml.
        </p>
      </section>
    );
  }
  return (
    <section className="flex min-h-52 flex-col justify-between rounded-3xl border border-line bg-card px-6 py-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{CARD_LABELS[id]}</h2>
        {label ? (
          <span className={card.status === "stale" ? "text-sm text-stale" : "text-sm text-muted"}>{label}</span>
        ) : (
          <span className="text-sm text-good">Live</span>
        )}
      </div>
      <p className="tabular text-5xl leading-none text-gold sm:text-6xl">{formatCents(card.cents)}</p>
      <div className="mt-4 flex items-end justify-between gap-3 text-sm text-muted">
        <p>{quantity === null ? "Quantity unavailable" : `${quantity} sold`}</p>
        {card.asOf ? <p>As of {formatChicagoTime(card.asOf)}</p> : null}
      </div>
      {card.error ? <p className="mt-3 text-sm text-danger">{card.error}</p> : null}
    </section>
  );
}

function TicketPanel({ tickets }: { tickets: TicketBoard }) {
  const label = statusLabel(tickets.status);
  return (
    <section className="rounded-3xl border border-line bg-card px-6 py-6">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Tickets</h2>
        {label ? (
          <span className={tickets.status === "stale" ? "text-sm text-stale" : "text-sm text-muted"}>{label}</span>
        ) : (
          <span className="text-sm text-good">Live</span>
        )}
      </div>
      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <p className="text-sm uppercase tracking-[0.16em] text-muted">Sold today</p>
          <p className="tabular mt-2 text-5xl leading-none sm:text-6xl">{formatCount(tickets.salesTodayCount)}</p>
          <p className="tabular mt-3 text-3xl text-gold">{formatCents(tickets.salesTodayCents)}</p>
          <p className="mt-2 text-sm text-muted">Paid tickets. Comps are counted, not added to dollars.</p>
        </div>
        <div>
          <p className="text-sm uppercase tracking-[0.16em] text-muted">Scanned today</p>
          <p className="tabular mt-2 text-5xl leading-none sm:text-6xl">{formatCount(tickets.scannedToday)}</p>
          <p className="mt-3 text-sm text-muted">Unique tickets checked in for today&apos;s festival date.</p>
        </div>
      </div>
      <dl className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {tickets.days.map((day) => (
          <div key={day.date} className="rounded-2xl border border-line px-4 py-3">
            <dt className="text-sm text-muted">{day.label}</dt>
            <dd className="tabular mt-1 text-3xl">{formatCount(day.count)}</dd>
          </div>
        ))}
        <div className="rounded-2xl border border-line px-4 py-3">
          <dt className="text-sm text-muted">Weekend passes</dt>
          <dd className="tabular mt-1 text-3xl">{formatCount(tickets.weekendPasses)}</dd>
        </div>
        <div className="rounded-2xl border border-line px-4 py-3">
          <dt className="text-sm text-muted">Day not recorded</dt>
          <dd className="tabular mt-1 text-3xl">{formatCount(tickets.dayNotRecorded)}</dd>
        </div>
      </dl>
      {tickets.error ? <p className="mt-4 text-sm text-danger">{tickets.error}</p> : null}
      {tickets.asOf ? <p className="mt-4 text-sm text-muted">As of {formatChicagoTime(tickets.asOf)}</p> : null}
    </section>
  );
}

export function SalesDashboard({ initial, sample }: { initial: PublicSnapshot; sample: boolean }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [pollError, setPollError] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), POLL_MS);
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
        }
      })();
    }, POLL_MS);
    return () => {
      clearInterval(clock);
      clearInterval(poll);
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-6 px-5 py-6 sm:px-8 sm:py-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-gold">Nashville Oktoberfest 2026</p>
          <h1 className="mt-1 text-4xl font-semibold tracking-tight sm:text-5xl">Sales</h1>
        </div>
        <div className="text-right">
          <p className="text-lg">{formatChicagoDay(now)}</p>
          <p className="text-sm text-muted">Checked {formatChicagoTime(snapshot.generatedAt)}</p>
        </div>
      </header>
      {sample ? (
        <p className="rounded-2xl border border-stale/50 bg-stale/10 px-4 py-3 text-sm text-stale">
          Sample data. Not live sales.
        </p>
      ) : null}
      {pollError ? (
        <p className="rounded-2xl border border-danger/40 px-4 py-3 text-sm text-danger">
          Couldn&apos;t refresh the screen. Showing the last snapshot.
        </p>
      ) : null}
      <TicketPanel tickets={snapshot.tickets} />
      <div className="grid gap-4 lg:grid-cols-3">
        <MoneyPanel id="beer" card={snapshot.beer} />
        <MoneyPanel id="merch" card={snapshot.merch} />
        <MoneyPanel id="food" card={snapshot.food} />
      </div>
      <p className="text-sm text-muted">Refreshes every 60 seconds. Times are America/Chicago.</p>
    </main>
  );
}
