import { chicagoDate, chicagoDayBounds } from "@/lib/time";
import { cardReadiness, invalidCardMessage, posFingerprint, type PosConfig } from "@/lib/pos-config";
import type { CardId, SquareOrderContribution, SquareState } from "@/lib/types";

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
  location_id?: string;
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

export type CardForCatalog = (locationId: string | undefined, catalogId: string) => CardId | null;

/**
 * A catalog item can sit on several cards. The sale counts on the card whose
 * locations include the order's Square location. Two cards that share both a
 * location and an item are failed so the sale is not counted twice.
 */
export function locationMembership(
  config: PosConfig,
  categoryObjects: Record<CardId, string[]>,
): {
  cardFor: CardForCatalog;
  failed: Set<CardId>;
} {
  const placements = config.cards
    .filter((card) => card.rollsUp.length === 0)
    .map((card) => ({
      id: card.id,
      locations: card.locationIds,
      catalogIds: new Set([...card.catalogObjectIds, ...(categoryObjects[card.id] ?? [])]),
    }));

  const owner = new Map<string, CardId>();
  const blocked = new Set<string>();
  const failed = new Set<CardId>();
  for (const card of placements) {
    for (const locationId of card.locations) {
      for (const catalogId of card.catalogIds) {
        const key = `${locationId}\0${catalogId}`;
        if (blocked.has(key)) {
          failed.add(card.id);
          continue;
        }
        const existing = owner.get(key);
        if (existing && existing !== card.id) {
          failed.add(existing);
          failed.add(card.id);
          owner.delete(key);
          blocked.add(key);
        } else {
          owner.set(key, card.id);
        }
      }
    }
  }
  for (const [key, cardId] of owner) {
    if (failed.has(cardId)) owner.delete(key);
  }

  return {
    failed,
    cardFor(locationId, catalogId) {
      if (!locationId) return null;
      const cardId = owner.get(`${locationId}\0${catalogId}`);
      if (!cardId || failed.has(cardId)) return null;
      return cardId;
    },
  };
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
  cardFor: CardForCatalog,
  countIdsByCard: ReadonlyMap<CardId, ReadonlySet<string>>,
): SquareOrderContribution["cards"] {
  const cards: SquareOrderContribution["cards"] = {};
  for (const line of order.line_items ?? []) {
    const catalogId = line.catalog_object_id;
    if (!catalogId) continue;
    const card = cardFor(order.location_id, catalogId);
    if (!card) continue;
    const current = cards[card] ?? { cents: 0, quantity: 0, quantityKnown: true };
    current.cents += lineCents(line);
    if (countIdsByCard.get(card)?.has(catalogId)) {
      const quantity = lineQuantity(line);
      current.quantity += quantity.quantity;
      current.quantityKnown = current.quantityKnown && quantity.known;
    }
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
  cardFor: CardForCatalog;
  countIdsByCard: ReadonlyMap<CardId, ReadonlySet<string>>;
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
      cards: contributionForOrder(order, input.cardFor, input.countIdsByCard),
    };
  }
  base.updatedSince = updatedSince;
  return base;
}

export function totalsFromState(
  state: SquareState,
  cardIds: CardId[],
  failed: Set<CardId>,
  counting: ReadonlySet<CardId>,
): Record<CardId, { cents: number; quantity: number | null }> {
  const totals = {} as Record<CardId, { cents: number; quantity: number; known: boolean }>;
  for (const card of cardIds) totals[card] = { cents: 0, quantity: 0, known: true };

  for (const order of Object.values(state.orders)) {
    for (const card of cardIds) {
      const contribution = order.cards[card];
      if (!contribution || failed.has(card)) continue;
      const total = totals[card];
      if (!total) continue;
      total.cents += contribution.cents;
      total.quantity += contribution.quantity;
      total.known = total.known && contribution.quantityKnown;
    }
  }

  const result = {} as Record<CardId, { cents: number; quantity: number | null }>;
  for (const card of cardIds) {
    const total = totals[card];
    const counted = counting.has(card);
    result[card] = {
      cents: total?.cents ?? 0,
      quantity: counted && total?.known ? total.quantity : null,
    };
  }
  return result;
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

function squareCards(config: PosConfig): CardId[] {
  return config.cards.filter((card) => card.rollsUp.length === 0).map((card) => card.id);
}

function attemptsFrom(config: PosConfig, failed: Set<CardId>, totals: ReturnType<typeof totalsFromState> | null, error: string | null): Record<CardId, CardAttempt> {
  const readiness = cardReadiness(config);
  const cards = {} as Record<CardId, CardAttempt>;
  for (const card of squareCards(config)) {
    if (readiness[card] === "unconfigured") {
      cards[card] = unconfiguredCard();
      continue;
    }
    if (readiness[card] === "invalid") {
      cards[card] = errorCard(invalidCardMessage(config, card) ?? "POS card config is incomplete.");
      continue;
    }
    if (failed.has(card)) {
      cards[card] = errorCard("An item on this card is also on another card for the same location.");
      continue;
    }
    if (!totals || error) {
      cards[card] = errorCard(error ?? "Square pull failed.");
      continue;
    }
    cards[card] = {
      status: "ok",
      cents: totals[card]?.cents ?? 0,
      quantity: totals[card]?.quantity ?? null,
      error: null,
    };
  }
  return cards;
}

/**
 * Order lines carry variation ids. A category card that asks for a count is
 * counting that category, so every variation already included in the dollars
 * counts, not only the single id pasted into card setup.
 */
export function countIdsForCard(card: PosConfig["cards"][number], categoryObjectIds: readonly string[]): Set<string> {
  const ids = new Set(card.countItemIds);
  if (card.countItemIds.length > 0 && card.categoryIds.length > 0 && card.catalogObjectIds.length === 0) {
    for (const id of categoryObjectIds) ids.add(id);
  }
  return ids;
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
  const squareIds = squareCards(input.config);
  const ready = input.config.cards.filter((card) => readiness[card.id] === "ready");
  if (ready.length === 0) {
    return { cards: attemptsFrom(input.config, new Set(), null, null), state: input.state };
  }
  if (!input.token) throw new Error("SQUARE_ACCESS_TOKEN is not set");
  if (!input.environment) throw new Error("SQUARE_ENVIRONMENT is not set");

  const fetchImpl = input.fetchImpl ?? fetch;
  const client = clientFor(fetchImpl, squareOrigin(input.environment), input.token);
  const day = chicagoDate(input.now);
  const bounds = chicagoDayBounds(day);
  const fingerprint = posFingerprint(input.config);
  const categoryObjects = {} as Record<CardId, string[]>;
  for (const card of input.config.cards) {
    categoryObjects[card.id] =
      readiness[card.id] === "ready" ? await expandCategory(client, card.categoryIds) : [];
  }

  const { cardFor, failed } = locationMembership(input.config, categoryObjects);
  const countIdsByCard = new Map(
    input.config.cards.map((card) => [card.id, countIdsForCard(card, categoryObjects[card.id] ?? [])]),
  );
  const counting = new Set(input.config.cards.filter((card) => card.countItemIds.length > 0).map((card) => card.id));
  const sameConfig = input.state?.configFingerprint === fingerprint;
  const previous = input.state?.chicagoDay === day && sameConfig ? input.state : null;
  const locationIds = [...new Set(ready.flatMap((card) => card.locationIds))];
  const incoming = await searchOrders(client, locationIds, bounds, previous?.updatedSince ?? null);
  const state = foldOrders({ previous, incoming, day, bounds, cardFor, countIdsByCard });
  state.configFingerprint = fingerprint;
  return {
    cards: attemptsFrom(input.config, failed, totalsFromState(state, squareIds, failed, counting), null),
    state,
  };
}
