import { chicagoDate, sameChicagoDay } from "@/lib/time";
import { cardReadiness, type PosConfig } from "@/lib/pos-config";
import type { CardAttempt } from "@/lib/square";
import { remainingTicketedDates } from "@/lib/tickets";
import { CARD_IDS, type CardId, type MoneyCard, type PublicSnapshot, type SquareState, type StoredSnapshot, type TicketBoard, type TicketNumbers } from "@/lib/types";

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

  let squareState = input.previous?.squareState ?? null;
  const cards = {} as Record<CardId, MoneyCard>;

  try {
    const pulled = await input.loadSquare(squareState);
    squareState = pulled.state;
    for (const card of CARD_IDS) {
      cards[card] = mergeCard(input.previous?.public[card], pulled.cards[card], input.now, day);
    }
  } catch (error) {
    const text = messageOf(error);
    console.error("Square refresh failed", text);
    for (const card of CARD_IDS) {
      if (readiness[card] === "unconfigured") {
        cards[card] = emptyMoneyCard("unconfigured");
        continue;
      }
      cards[card] = mergeCard(
        input.previous?.public[card],
        {
          status: "error",
          cents: null,
          quantity: null,
          error: text,
        },
        input.now,
        day,
      );
    }
  }

  let tickets: TicketBoard;
  try {
    tickets = freshTickets(await input.loadTickets(), input.now);
  } catch (error) {
    const text = messageOf(error);
    console.error("Ticket refresh failed", text);
    tickets = keepOrDropTickets(input.previous?.public.tickets, day, text);
  }

  const snapshot: PublicSnapshot = {
    generatedAt,
    tickets,
    beer: cards.beer,
    merch: cards.merch,
    food: cards.food,
  };
  return { public: snapshot, squareState };
}
