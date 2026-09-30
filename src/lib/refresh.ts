import { chicagoDate, sameChicagoDay } from "@/lib/time";
import { cardReadiness, posFingerprint, type PosConfig } from "@/lib/pos-config";
import type { CardAttempt } from "@/lib/square";
import { remainingTicketedDates } from "@/lib/tickets";
import type { CardId, DisplayCard, MoneyCard, PublicSnapshot, SquareState, StoredSnapshot, TicketBoard, TicketNumbers } from "@/lib/types";

export function emptyMoneyCard(status: MoneyCard["status"], error: string | null = null): MoneyCard {
  return { cents: null, quantity: null, asOf: null, status, error };
}

export function emptyTicketBoard(status: TicketBoard["status"], error: string | null, days: TicketBoard["days"]): TicketBoard {
  return {
    salesTodayCount: null,
    salesTodayCents: null,
    scannedToday: null,
    days,
    weekendPasses: null,
    dayNotRecorded: null,
    asOf: null,
    status,
    error,
  };
}

function freshTickets(numbers: TicketNumbers, now: Date): TicketBoard {
  return {
    ...numbers,
    asOf: now.toISOString(),
    status: "ok",
    error: null,
  };
}

function keepOrDropTickets(previous: TicketBoard | undefined, day: string, error: string): TicketBoard {
  if (
    previous &&
    previous.salesTodayCount !== null &&
    sameChicagoDay(previous.asOf, day)
  ) {
    return { ...previous, status: "stale", error };
  }
  return emptyTicketBoard(
    "error",
    error,
    remainingTicketedDates(day).map((entry) => ({ ...entry, count: null })),
  );
}

function mergeCard(previous: MoneyCard | undefined, next: CardAttempt, now: Date, day: string): MoneyCard {
  if (next.status === "unconfigured") return emptyMoneyCard("unconfigured");
  if (next.status === "ok") {
    return {
      cents: next.cents,
      quantity: next.quantity,
      asOf: now.toISOString(),
      status: "ok",
      error: null,
    };
  }
  if (previous && previous.cents !== null && sameChicagoDay(previous.asOf, day)) {
    return { ...previous, status: "stale", error: next.error };
  }
  return emptyMoneyCard("error", next.error);
}

function displayFrom(id: CardId, label: string, money: MoneyCard): DisplayCard {
  return { id, label, ...money };
}

function rollupOf(def: PosConfig["cards"][number], byId: Map<CardId, DisplayCard>, now: Date): DisplayCard {
  const sources = def.rollsUp.map((id) => byId.get(id));
  if (sources.some((source) => !source || source.cents === null)) {
    return displayFrom(def.id, def.label, emptyMoneyCard("error", "A card in this total is unavailable."));
  }
  const present = sources.filter((source): source is DisplayCard => Boolean(source));
  const quantityKnown = present.every((source) => source.quantity !== null);
  const stale = present.some((source) => source.status === "stale" || source.status === "error");
  return displayFrom(def.id, def.label, {
    cents: present.reduce((sum, source) => sum + (source.cents ?? 0), 0),
    quantity: quantityKnown ? present.reduce((sum, source) => sum + (source.quantity ?? 0), 0) : null,
    asOf: now.toISOString(),
    status: stale ? "stale" : "ok",
    error: stale ? "A card in this total is stale." : null,
  });
}

function assembleCards(
  config: PosConfig,
  square: Map<CardId, DisplayCard>,
  now: Date,
): DisplayCard[] {
  const byId = new Map(square);
  const pending = config.cards.filter((card) => card.rollsUp.length > 0);
  let guard = pending.length;
  while (pending.length > 0 && guard >= 0) {
    guard -= 1;
    const next = pending.findIndex((card) => card.rollsUp.every((id) => byId.has(id)));
    if (next < 0) break;
    const [def] = pending.splice(next, 1);
    if (def) byId.set(def.id, rollupOf(def, byId, now));
  }
  for (const def of pending) byId.set(def.id, rollupOf(def, byId, now));
  return config.cards.map((card) => byId.get(card.id) ?? displayFrom(card.id, card.label, emptyMoneyCard("error", "Card missing.")));
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Refresh failed";
}

export async function buildSnapshot(input: {
  now: Date;
  previous: StoredSnapshot | null;
  config: PosConfig;
  loadTickets: () => Promise<TicketNumbers>;
  loadSquare: (state: SquareState | null) => Promise<{ cards: Record<CardId, CardAttempt>; state: SquareState | null }>;
}): Promise<StoredSnapshot> {
  const day = chicagoDate(input.now);
  const generatedAt = input.now.toISOString();
  const readiness = cardReadiness(input.config);

  const previousById = new Map((input.previous?.public.cards ?? []).map((card) => [card.id, card]));

  const squareTask = (async () => {
    let squareState = input.previous?.squareState ?? null;
    const square = new Map<CardId, DisplayCard>();
    try {
      const pulled = await input.loadSquare(squareState);
      squareState = pulled.state;
      for (const card of input.config.cards) {
        if (card.rollsUp.length > 0) continue;
        const attempt = pulled.cards[card.id] ?? {
          status: "error" as const,
          cents: null,
          quantity: null,
          error: "Square did not return this card.",
        };
        square.set(card.id, displayFrom(card.id, card.label, mergeCard(previousById.get(card.id), attempt, input.now, day)));
      }
    } catch (error) {
      const text = messageOf(error);
      console.error("Square refresh failed", text);
      for (const card of input.config.cards) {
        if (card.rollsUp.length > 0) continue;
        if (readiness[card.id] === "unconfigured") {
          square.set(card.id, displayFrom(card.id, card.label, emptyMoneyCard("unconfigured")));
          continue;
        }
        square.set(
          card.id,
          displayFrom(
            card.id,
            card.label,
            mergeCard(
              previousById.get(card.id),
              { status: "error", cents: null, quantity: null, error: text },
              input.now,
              day,
            ),
          ),
        );
      }
    }
    return { squareState, square };
  })();

  const ticketTask = (async (): Promise<TicketBoard> => {
    try {
      return freshTickets(await input.loadTickets(), input.now);
    } catch (error) {
      const text = messageOf(error);
      console.error("Ticket refresh failed", text);
      return keepOrDropTickets(input.previous?.public.tickets, day, text);
    }
  })();

  const [{ squareState, square }, tickets] = await Promise.all([squareTask, ticketTask]);

  const snapshot: PublicSnapshot = {
    generatedAt,
    tickets,
    cards: assembleCards(input.config, square, input.now),
    configFingerprint: posFingerprint(input.config),
  };
  return { public: snapshot, squareState };
}
