import { chicagoDate, chicagoDayBounds } from "@/lib/time";
import { cardReadiness, invalidCardMessage, type PosConfig } from "@/lib/pos-config";
import { CARD_IDS, type CardId, type SquareOrderContribution, type SquareState } from "@/lib/types";

const SQUARE_VERSION = "2026-08-19";
const PAGE_LIMIT = 40;

export type CardAttempt = {
  status: "ok" | "error" | "unconfigured";
  cents: number | null;
  quantity: number | null;
  error: string | null;
};

export type PosPull = {
  cards: Record<CardId, CardAttempt>;
  /** Null means the caller should keep the previous order cache. */
  state: SquareState | null;
};

type SquareMoney = { amount?: number; currency?: string };
type SquareLine = {
  catalog_object_id?: string;
  quantity?: string;
  total_money?: SquareMoney;
  gross_sales_money?: SquareMoney;
  base_price_money?: SquareMoney;
};
type SquareOrder = {
  id?: string;
  state?: string;
  closed_at?: string;
  updated_at?: string;
  line_items?: SquareLine[];
};
type CatalogObject = {
  id?: string;
  item_data?: { variations?: { id?: string }[] };
};

export function squareOrigin(environment: string): string {
  if (environment === "production") return "https://connect.squareup.com";
  if (environment === "sandbox") return "https://connect.squareupsandbox.com";
  throw new Error("SQUARE_ENVIRONMENT must be sandbox or production");
}

export function chunks<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

function unconfiguredCard(): CardAttempt {
  return { status: "unconfigured", cents: null, quantity: null, error: null };
}

function errorCard(error: string): CardAttempt {
  return { status: "error", cents: null, quantity: null, error };
}

export function expandedMembership(
  config: PosConfig,
  categoryObjects: Record<CardId, string[]>,
): {
  membership: Map<string, CardId>;
  failed: Set<CardId>;
} {
  const idsByCard = new Map<CardId, Set<string>>();
  for (const card of CARD_IDS) {
    idsByCard.set(
      card,
      new Set([...config[card].catalogObjectIds, ...categoryObjects[card]]),
    );
  }

  const owners = new Map<string, CardId[]>();
  for (const card of CARD_IDS) {
    for (const id of idsByCard.get(card) ?? []) {
      const list = owners.get(id) ?? [];
      list.push(card);
      owners.set(id, list);
    }
  }

  const failed = new Set<CardId>();
  const membership = new Map<string, CardId>();
  for (const [id, cards] of owners) {
    if (cards.length > 1) {
      for (const card of cards) failed.add(card);
      continue;
    }
    const [card] = cards;
    if (card) membership.set(id, card);
  }
  return { membership, failed };
}

function lineCents(line: SquareLine): number {
  const amount = line.total_money?.amount ?? line.gross_sales_money?.amount;
  if (typeof amount === "number") return Math.round(amount);
  const unit = line.base_price_money?.amount;
  const quantity = line.quantity === undefined ? Number.NaN : Number(line.quantity);
  if (typeof unit === "number" && Number.isFinite(quantity)) return Math.round(unit * quantity);
  return 0;
}

function lineQuantity(line: SquareLine): { quantity: number; known: boolean } {
  if (line.quantity === undefined || line.quantity === "") return { quantity: 0, known: false };
  const quantity = Number(line.quantity);
  if (!Number.isFinite(quantity)) return { quantity: 0, known: false };
  return { quantity, known: true };
}

export function contributionForOrder(
  order: SquareOrder,
  membership: Map<string, CardId>,
): SquareOrderContribution["cards"] {
  const cards: SquareOrderContribution["cards"] = {};
  for (const line of order.line_items ?? []) {
    const catalogId = line.catalog_object_id;
    if (!catalogId) continue;
    const card = membership.get(catalogId);
    if (!card) continue;
    const current = cards[card] ?? { cents: 0, quantity: 0, quantityKnown: true };
    const quantity = lineQuantity(line);
    current.cents += lineCents(line);
    current.quantity += quantity.quantity;
    current.quantityKnown = current.quantityKnown && quantity.known;
    cards[card] = current;
  }
  return cards;
}

export function closedInBounds(closedAt: string | undefined, bounds: { start: string; end: string }): boolean {
  if (!closedAt) return false;
  const time = new Date(closedAt).getTime();
  if (Number.isNaN(time)) return false;
  return time >= new Date(bounds.start).getTime() && time < new Date(bounds.end).getTime();
}

function laterTimestamp(current: string | null, candidate: string | undefined): string | null {
  if (!candidate) return current;
  if (!current) return candidate;
  return new Date(candidate).getTime() > new Date(current).getTime() ? candidate : current;
}

export function foldOrders(input: {
  previous: SquareState | null;
  incoming: SquareOrder[];
  day: string;
  bounds: { start: string; end: string };
  membership: Map<string, CardId>;
}): SquareState {
  const base: SquareState =
    input.previous?.chicagoDay === input.day
      ? {
          chicagoDay: input.day,
          updatedSince: input.previous.updatedSince,
          orders: { ...input.previous.orders },
        }
      : { chicagoDay: input.day, updatedSince: null, orders: {} };

  let updatedSince = base.updatedSince;
  for (const order of input.incoming) {
    if (!order.id) continue;
    updatedSince = laterTimestamp(updatedSince, order.updated_at);
    const countsToday = order.state === "COMPLETED" && closedInBounds(order.closed_at, input.bounds);
    if (!countsToday) {
      delete base.orders[order.id];
      continue;
    }
    base.orders[order.id] = {
      updatedAt: order.updated_at ?? updatedSince ?? input.bounds.start,
      cards: contributionForOrder(order, input.membership),
    };
  }
  base.updatedSince = updatedSince;
  return base;
}

export function totalsFromState(
  state: SquareState,
  failed: Set<CardId>,
): Record<CardId, { cents: number; quantity: number | null }> {
  const totals = {} as Record<CardId, { cents: number; quantity: number; known: boolean }>;
  for (const card of CARD_IDS) totals[card] = { cents: 0, quantity: 0, known: true };

  for (const order of Object.values(state.orders)) {
    for (const card of CARD_IDS) {
      const contribution = order.cards[card];
      if (!contribution || failed.has(card)) continue;
      const total = totals[card];
      total.cents += contribution.cents;
      total.quantity += contribution.quantity;
      total.known = total.known && contribution.quantityKnown;
    }
  }

  return {
    beer: { cents: totals.beer.cents, quantity: totals.beer.known ? totals.beer.quantity : null },
    merch: { cents: totals.merch.cents, quantity: totals.merch.known ? totals.merch.quantity : null },
    food: { cents: totals.food.cents, quantity: totals.food.known ? totals.food.quantity : null },
  };
}

type SquareClient = {
  searchOrders(body: Record<string, unknown>): Promise<{ orders?: SquareOrder[]; cursor?: string }>;
  searchCatalogItems(body: Record<string, unknown>): Promise<{
    items?: CatalogObject[];
    matched_variation_ids?: string[];
    cursor?: string;
  }>;
};

async function squareFetch<T>(
  fetchImpl: typeof fetch,
  origin: string,
  token: string,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetchImpl(`${origin}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Square-Version": SQUARE_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const payload = (await response.json()) as { errors?: { detail?: string }[] };
      detail = payload.errors?.[0]?.detail || detail;
    } catch {
      detail = response.statusText;
    }
    throw new Error(`Square ${path} failed (${response.status}): ${detail}`.slice(0, 300));
  }
  return (await response.json()) as T;
}

function clientFor(fetchImpl: typeof fetch, origin: string, token: string): SquareClient {
  return {
    searchOrders: (body) =>
      squareFetch(fetchImpl, origin, token, "/v2/orders/search", body),
    searchCatalogItems: (body) =>
      squareFetch(fetchImpl, origin, token, "/v2/catalog/search-catalog-items", body),
  };
}

async function expandCategory(client: SquareClient, categoryIds: string[]): Promise<string[]> {
  if (categoryIds.length === 0) return [];
  const ids = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < PAGE_LIMIT; page += 1) {
    const body: Record<string, unknown> = { category_ids: categoryIds, limit: 100 };
    if (cursor) body.cursor = cursor;
    const payload = await client.searchCatalogItems(body);
    for (const item of payload.items ?? []) {
      if (item.id) ids.add(item.id);
      for (const variation of item.item_data?.variations ?? []) {
        if (variation.id) ids.add(variation.id);
      }
    }
    for (const variationId of payload.matched_variation_ids ?? []) ids.add(variationId);
    if (!payload.cursor) return [...ids];
    cursor = payload.cursor;
  }
  throw new Error("Square catalog search exceeded the page limit");
}

async function searchOrders(
  client: SquareClient,
  locationIds: string[],
  bounds: { start: string; end: string },
  updatedSince: string | null,
): Promise<SquareOrder[]> {
  const orders: SquareOrder[] = [];
  // Square accepts one timestamp field per search, and the sort field has to match it.
  // A full day uses closed_at. Incremental runs use updated_at, then drop orders closed outside today.
  const dateTimeFilter = updatedSince
    ? { updated_at: { start_at: updatedSince } }
    : { closed_at: { start_at: bounds.start, end_at: bounds.end } };
  const sortField = updatedSince ? "UPDATED_AT" : "CLOSED_AT";

  for (const locations of chunks(locationIds, 10)) {
    let cursor: string | undefined;
    for (let page = 0; page < PAGE_LIMIT; page += 1) {
      const body: Record<string, unknown> = {
        location_ids: locations,
        limit: 500,
        query: {
          filter: {
            state_filter: { states: ["COMPLETED"] },
            date_time_filter: dateTimeFilter,
          },
          sort: { sort_field: sortField, sort_order: "ASC" },
        },
      };
      if (cursor) body.cursor = cursor;
      const payload = await client.searchOrders(body);
      orders.push(...(payload.orders ?? []));
      if (!payload.cursor) break;
      cursor = payload.cursor;
      if (page === PAGE_LIMIT - 1) throw new Error("Square order search exceeded the page limit");
    }
  }
  return orders;
}

function attemptsFrom(config: PosConfig, failed: Set<CardId>, totals: ReturnType<typeof totalsFromState> | null, error: string | null): Record<CardId, CardAttempt> {
  const readiness = cardReadiness(config);
  const cards = {} as Record<CardId, CardAttempt>;
  for (const card of CARD_IDS) {
    if (readiness[card] === "unconfigured") {
      cards[card] = unconfiguredCard();
      continue;
    }
    if (readiness[card] === "invalid") {
      cards[card] = errorCard(invalidCardMessage(config, card) ?? "POS card config is incomplete.");
      continue;
    }
    if (failed.has(card)) {
      cards[card] = errorCard("A catalog item on this card is also listed on another card.");
      continue;
    }
    if (!totals || error) {
      cards[card] = errorCard(error ?? "Square pull failed.");
      continue;
    }
    cards[card] = {
      status: "ok",
      cents: totals[card].cents,
      quantity: totals[card].quantity,
      error: null,
    };
  }
  return cards;
}

export async function pullPos(input: {
  config: PosConfig;
  state: SquareState | null;
  now: Date;
  token: string | null;
  environment: string | null;
  fetchImpl?: typeof fetch;
}): Promise<PosPull> {
  const readiness = cardReadiness(input.config);
  const ready = CARD_IDS.filter((card) => readiness[card] === "ready");
  if (ready.length === 0) {
    return { cards: attemptsFrom(input.config, new Set(), null, null), state: input.state };
  }
  if (!input.token) throw new Error("SQUARE_ACCESS_TOKEN is not set");
  if (!input.environment) throw new Error("SQUARE_ENVIRONMENT is not set");

  const fetchImpl = input.fetchImpl ?? fetch;
  const client = clientFor(fetchImpl, squareOrigin(input.environment), input.token);
  const day = chicagoDate(input.now);
  const bounds = chicagoDayBounds(day);
  const categoryObjects = {} as Record<CardId, string[]>;
  for (const card of CARD_IDS) {
    categoryObjects[card] =
      readiness[card] === "ready" ? await expandCategory(client, input.config[card].categoryIds) : [];
  }

  const { membership, failed } = expandedMembership(input.config, categoryObjects);
  const previous = input.state?.chicagoDay === day ? input.state : null;
  const locationIds = [...new Set(ready.flatMap((card) => input.config[card].locationIds))];
  const incoming = await searchOrders(client, locationIds, bounds, previous?.updatedSince ?? null);
  const state = foldOrders({ previous, incoming, day, bounds, membership });
  return {
    cards: attemptsFrom(input.config, failed, totalsFromState(state, failed), null),
    state,
  };
}
