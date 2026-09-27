import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cardReadiness, parsePosConfig } from "@/lib/pos-config";

describe("POS config", () => {
  it("parses the committed catalog file as unconfigured cards", () => {
    const raw = readFileSync(join(process.cwd(), "config/pos-categories.yaml"), "utf8");
    const config = parsePosConfig(raw);
    expect(cardReadiness(config)).toEqual({
      beer: "unconfigured",
      merch: "unconfigured",
      food: "unconfigured",
    });
  });

  it("rejects a card that names locations without catalog ids", () => {
    const config = parsePosConfig(`
      beer:
        locationIds: ["LOC"]
        catalogObjectIds: []
        categoryIds: []
      merch:
        locationIds: []
        catalogObjectIds: []
        categoryIds: []
      food:
        locationIds: []
        catalogObjectIds: []
        categoryIds: []
    `);
    expect(cardReadiness(config).beer).toBe("invalid");
  });
});
