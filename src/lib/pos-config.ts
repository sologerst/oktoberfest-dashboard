import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import type { CardId } from "@/lib/types";

export type PosCardConfig = {
  id: CardId;
  label: string;
  locationIds: string[];
  catalogObjectIds: string[];
  categoryIds: string[];
  /**
   * Ids that turn on the count under the dollars. Empty means dollars only.
   * An item id also counts that item's variations. Other category items stay in the dollars.
   */
  countItemIds: string[];
  /** Word after that count, such as "beers". Empty uses item/items. */
  countLabel: string;
  /** Other card ids whose totals are added into this card. */
  rollsUp: CardId[];
};

export type PosConfig = {
  cards: PosCardConfig[];
};

export type CardReadiness = "ready" | "unconfigured" | "invalid" | "rollup";

const LEGACY_LABELS: Record<string, string> = {
  beer: "Beer",
  merch: "Merch",
  food: "Food",
};

function stringList(value: unknown, label: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new Error(`${label} must be a list of non-empty strings`);
  }
  return value.map((item) => item.trim());
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}

function optionalCountLabel(value: unknown, label: string): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") throw new Error(`${label} must be text.`);
  const trimmed = value.trim();
  if (trimmed.length > 32) throw new Error(`${label} must be 32 characters or fewer.`);
  return trimmed;
}

function parseCard(value: unknown, id: string, label: string): PosCardConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${id} must be a mapping`);
  }
  const record = value as Record<string, unknown>;
  const cardLabel = typeof record.label === "string" && record.label.trim() ? record.label.trim() : label;
  return {
    id,
    label: cardLabel,
    locationIds: stringList(record.locationIds, `${id}.locationIds`),
    catalogObjectIds: stringList(record.catalogObjectIds, `${id}.catalogObjectIds`),
    categoryIds: stringList(record.categoryIds, `${id}.categoryIds`),
    countItemIds: unique(stringList(record.countItemIds, `${id}.countItemIds`)),
    countLabel: optionalCountLabel(record.countLabel, `${id}.countLabel`),
    rollsUp: stringList(record.rollsUp, `${id}.rollsUp`),
  };
}

function parseLegacy(record: Record<string, unknown>): PosConfig {
  return {
    cards: (["beer", "merch", "food"] as const).map((id) => parseCard(record[id], id, LEGACY_LABELS[id] ?? id)),
  };
}

export function parsePosConfig(raw: string): PosConfig {
  const parsed = parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("POS config must be a mapping of beer, merch, and food");
  }
  const record = parsed as Record<string, unknown>;
  if (Array.isArray(record.cards)) return validatePosConfig(record.cards);
  return parseLegacy(record);
}

export function loadPosConfig(path = join(process.cwd(), "config/pos-categories.yaml")): PosConfig {
  return parsePosConfig(readFileSync(path, "utf8"));
}

export function cardReadiness(config: PosConfig): Record<CardId, CardReadiness> {
  const readiness = {} as Record<CardId, CardReadiness>;
  for (const card of config.cards) {
    if (card.rollsUp.length > 0) {
      readiness[card.id] = "rollup";
      continue;
    }
    const hasLocations = card.locationIds.length > 0;
    const hasCatalog = card.catalogObjectIds.length > 0 || card.categoryIds.length > 0;
    if (!hasLocations && !hasCatalog) readiness[card.id] = "unconfigured";
    else if (!hasLocations || !hasCatalog) readiness[card.id] = "invalid";
    else readiness[card.id] = "ready";
  }
  return readiness;
}

export function invalidCardMessage(config: PosConfig, cardId: CardId): string | null {
  const card = config.cards.find((entry) => entry.id === cardId);
  if (!card || card.rollsUp.length > 0) return null;
  const hasLocations = card.locationIds.length > 0;
  const hasCatalog = card.catalogObjectIds.length > 0 || card.categoryIds.length > 0;
  if (hasLocations && !hasCatalog) return "Add catalog or category ids for this card.";
  if (!hasLocations && hasCatalog) return "Add Square location ids for this card.";
  return null;
}

function slugId(label: string, used: Set<string>): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "card";
  let id = base;
  let n = 2;
  while (used.has(id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  return id;
}

/** Accepts the setup form payload and returns a config, or throws a message. */
export function validatePosConfig(value: unknown): PosConfig {
  if (!Array.isArray(value)) throw new Error("Cards must be a list.");
  if (value.length > 24) throw new Error("Use 24 cards or fewer.");
  const used = new Set<string>();
  const cards: PosCardConfig[] = value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Card ${index + 1} is incomplete.`);
    }
    const record = entry as Record<string, unknown>;
    const label = typeof record.label === "string" ? record.label.trim() : "";
    if (!label) throw new Error(`Card ${index + 1} needs a name.`);
    const requested = typeof record.id === "string" ? record.id.trim() : "";
    const id = requested && /^[a-z0-9][a-z0-9-]{0,40}$/.test(requested) && !used.has(requested)
      ? requested
      : slugId(label, used);
    used.add(id);
    const rollsUp = stringList(record.rollsUp, `${label} totals`);
    return {
      id,
      label,
      locationIds: rollsUp.length > 0 ? [] : stringList(record.locationIds, `${label} locations`),
      catalogObjectIds: rollsUp.length > 0 ? [] : stringList(record.catalogObjectIds, `${label} items`),
      categoryIds: rollsUp.length > 0 ? [] : stringList(record.categoryIds, `${label} categories`),
      countItemIds: rollsUp.length > 0 ? [] : unique(stringList(record.countItemIds, `${label} counted items`)),
      countLabel: optionalCountLabel(record.countLabel, `${label} count name`),
      rollsUp,
    };
  });

  const ids = new Set(cards.map((card) => card.id));
  for (const card of cards) {
    if (card.rollsUp.length === 0) continue;
    for (const source of card.rollsUp) {
      if (source === card.id) throw new Error(`${card.label} cannot include itself.`);
      if (!ids.has(source)) throw new Error(`${card.label} totals a card that does not exist.`);
    }
  }
  rejectSharedAtLocation(cards, "Item", (card) => card.catalogObjectIds);
  rejectSharedAtLocation(cards, "Category", (card) => card.categoryIds);

  for (const card of cards) {
    if (card.rollsUp.length > 0 || card.categoryIds.length > 0) continue;
    const allowed = new Set(card.catalogObjectIds);
    for (const id of card.countItemIds) {
      if (!allowed.has(id)) {
        throw new Error(`${card.label} counts ${id}, but that item is not in its item ids.`);
      }
    }
  }
  rejectSharedAtLocation(cards, "Counted item", (card) => card.countItemIds);
  if (hasRollupCycle(cards)) throw new Error("Card totals cannot loop. A total cannot include itself through other totals.");
  const duplicated = duplicatedRollup(cards);
  if (duplicated) throw new Error(duplicated);

  const readiness = cardReadiness({ cards });
  for (const card of cards) {
    if (readiness[card.id] === "invalid") {
      throw new Error(`${card.label} needs a location id and at least one item or category id.`);
    }
  }
  return { cards };
}

function rejectSharedAtLocation(
  cards: PosCardConfig[],
  kind: "Item" | "Category" | "Counted item",
  idsOf: (card: PosCardConfig) => string[],
) {
  const owners = new Map<string, PosCardConfig[]>();
  for (const card of cards) {
    if (card.rollsUp.length > 0) continue;
    for (const id of new Set(idsOf(card))) {
      const list = owners.get(id) ?? [];
      list.push(card);
      owners.set(id, list);
    }
  }
  for (const [id, group] of owners) {
    const byLocation = new Map<string, string[]>();
    for (const card of group) {
      for (const locationId of card.locationIds) {
        const labels = byLocation.get(locationId) ?? [];
        labels.push(card.label);
        byLocation.set(locationId, labels);
      }
    }
    for (const [locationId, labels] of byLocation) {
      if (labels.length > 1) {
        throw new Error(
          `${kind} ${id} is on ${labels.join(" and ")} for location ${locationId}. Each location can count it on one card.`,
        );
      }
    }
  }
}

/** A total that includes both a booth and another total of that booth would count the booth twice. */
function duplicatedRollup(cards: PosCardConfig[]): string | null {
  const byId = new Map(cards.map((card) => [card.id, card]));
  function leaves(id: string, stack: string[]): string[] {
    const card = byId.get(id);
    if (!card || card.rollsUp.length === 0) return [id];
    if (stack.includes(id)) return [];
    return card.rollsUp.flatMap((source) => leaves(source, [...stack, id]));
  }
  for (const card of cards) {
    if (card.rollsUp.length === 0) continue;
    const seen = new Map<string, number>();
    for (const leaf of leaves(card.id, [])) {
      seen.set(leaf, (seen.get(leaf) ?? 0) + 1);
    }
    for (const [leaf, count] of seen) {
      if (count > 1) {
        const name = byId.get(leaf)?.label ?? leaf;
        return `${card.label} counts ${name} more than once. Leave it off this total if another checked card already includes it.`;
      }
    }
  }
  return null;
}

function hasRollupCycle(cards: PosCardConfig[]): boolean {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function walk(id: string): boolean {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const source of byId.get(id)?.rollsUp ?? []) {
      if (walk(source)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }
  return cards.some((card) => walk(card.id));
}

/** Busts the Square order cache when locations, items, or count rules change. */
export function posFingerprint(config: PosConfig): string {
  return JSON.stringify({
    attribution: "location",
    countMatch: "listed-item",
    cards: config.cards.map((card) => ({
      id: card.id,
      locationIds: [...card.locationIds].sort(),
      catalogObjectIds: [...card.catalogObjectIds].sort(),
      categoryIds: [...card.categoryIds].sort(),
      countItemIds: [...card.countItemIds].sort(),
      rollsUp: [...card.rollsUp].sort(),
    })),
  });
}
