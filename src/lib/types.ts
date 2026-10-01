export type SourceStatus = "ok" | "stale" | "error" | "unconfigured";

export type CardId = string;

export type MoneyCard = {
  cents: number | null;
  quantity: number | null;
  asOf: string | null;
  status: SourceStatus;
  error: string | null;
};

export type DisplayCard = MoneyCard & {
  id: CardId;
  label: string;
  /** Word after the programmed item count. Blank uses item/items. Omitted on older snapshots. */
  quantityLabel?: string | null;
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
  cards: DisplayCard[];
  /** Which POS card mapping produced this snapshot. Omitted on older rows. */
  configFingerprint?: string;
};

/** Per-order POS contributions for the current Chicago day. Not sent to the browser. */
export type SquareOrderContribution = {
  updatedAt: string;
  /** `quantity` counts the variations programmed on the card. A category card counts every variation in that category. */
  cards: Partial<Record<CardId, { cents: number; quantity: number; quantityKnown: boolean }>>;
};

export type SquareState = {
  chicagoDay: string;
  updatedSince: string | null;
  orders: Record<string, SquareOrderContribution>;
  configFingerprint?: string;
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
