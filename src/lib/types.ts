export type SourceStatus = "ok" | "stale" | "error" | "unconfigured";

export type CardId = "beer" | "merch" | "food";

export const CARD_IDS: CardId[] = ["beer", "merch", "food"];

export type MoneyCard = {
  cents: number | null;
  quantity: number | null;
  asOf: string | null;
  status: SourceStatus;
  error: string | null;
};

export type DayLine = {
  date: string;
  label: string;
  count: number | null;
};

export type TicketBoard = {
  salesTodayCount: number | null;
  salesTodayCents: number | null;
  scannedToday: number | null;
  days: DayLine[];
  weekendPasses: number | null;
  dayNotRecorded: number | null;
  asOf: string | null;
  status: SourceStatus;
  error: string | null;
};

export type PublicSnapshot = {
  generatedAt: string;
  tickets: TicketBoard;
  beer: MoneyCard;
  merch: MoneyCard;
  food: MoneyCard;
};

/** Per-order POS contributions for the current Chicago day. Not sent to the browser. */
export type SquareOrderContribution = {
  updatedAt: string;
  cards: Partial<Record<CardId, { cents: number; quantity: number; quantityKnown: boolean }>>;
};

export type SquareState = {
  chicagoDay: string;
  updatedSince: string | null;
  orders: Record<string, SquareOrderContribution>;
};

export type StoredSnapshot = {
  public: PublicSnapshot;
  squareState: SquareState | null;
};

export type TicketNumbers = {
  salesTodayCount: number;
  salesTodayCents: number;
  scannedToday: number;
  days: DayLine[];
  weekendPasses: number;
  dayNotRecorded: number;
};
