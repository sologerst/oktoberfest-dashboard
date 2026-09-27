import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { CARD_IDS, type CardId } from "@/lib/types";

export type PosCardConfig = {
  locationIds: string[];
  catalogObjectIds: string[];
  categoryIds: string[];
};

export type PosConfig = Record<CardId, PosCardConfig>;

export type CardReadiness = "ready" | "unconfigured" | "invalid";

function stringList(value: unknown, label: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new Error(`${label} must be a list of non-empty strings`);
  }
  return value;
}

function parseCard(value: unknown, card: CardId): PosCardConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${card} must be a mapping`);
  }
  const record = value as Record<string, unknown>;
  return {
    locationIds: stringList(record.locationIds, `${card}.locationIds`),
    catalogObjectIds: stringList(record.catalogObjectIds, `${card}.catalogObjectIds`),
    categoryIds: stringList(record.categoryIds, `${card}.categoryIds`),
  };
}

export function parsePosConfig(raw: string): PosConfig {
  const parsed = parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("POS config must be a mapping of beer, merch, and food");
  }
  const record = parsed as Record<string, unknown>;
  return {
    beer: parseCard(record.beer, "beer"),
    merch: parseCard(record.merch, "merch"),
    food: parseCard(record.food, "food"),
  };
}

export function loadPosConfig(path = join(process.cwd(), "config/pos-categories.yaml")): PosConfig {
  return parsePosConfig(readFileSync(path, "utf8"));
}

export function cardReadiness(config: PosConfig): Record<CardId, CardReadiness> {
  const readiness = {} as Record<CardId, CardReadiness>;
  for (const card of CARD_IDS) {
    const entry = config[card];
    const hasLocations = entry.locationIds.length > 0;
    const hasCatalog = entry.catalogObjectIds.length > 0 || entry.categoryIds.length > 0;
    if (!hasLocations && !hasCatalog) readiness[card] = "unconfigured";
    else if (!hasLocations || !hasCatalog) readiness[card] = "invalid";
    else readiness[card] = "ready";
  }
  return readiness;
}

export function invalidCardMessage(config: PosConfig, card: CardId): string | null {
  const entry = config[card];
  const hasLocations = entry.locationIds.length > 0;
  const hasCatalog = entry.catalogObjectIds.length > 0 || entry.categoryIds.length > 0;
  if (hasLocations && !hasCatalog) return "Add catalog or category ids for this card.";
  if (!hasLocations && hasCatalog) return "Add Square location ids for this card.";
  return null;
}
