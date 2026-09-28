import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { messageFromSaveResponse } from "@/components/pos-setup";
import { cardReadiness, parsePosConfig, validatePosConfig } from "@/lib/pos-config";

describe("save response", () => {
  it("turns an empty or broken response into a refresh hint", () => {
    expect(messageFromSaveResponse(504, "")).toEqual({
      error: "Saving cards failed (504). Refresh this page. If your cards are still here, they were saved.",
    });
    const broken = messageFromSaveResponse(500, "<html></html>");
    expect("error" in broken ? broken.error : "").toMatch(/before the server finished/);
  });

  it("reads a saved response without waiting on the refresh", () => {
    expect(messageFromSaveResponse(200, JSON.stringify({ ok: true, refreshed: false }))).toEqual({
      message: "Saved. The next refresh will use these cards.",
    });
    expect(messageFromSaveResponse(400, JSON.stringify({ ok: false, error: "Item beer is on North and South." }))).toEqual({
      error: "Item beer is on North and South.",
    });
  });
});

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

  it("accepts a total of other cards and rejects a loop", () => {
    const config = validatePosConfig([
      { id: "north", label: "North tent", locationIds: ["L1"], catalogObjectIds: ["beer"], categoryIds: [], rollsUp: [] },
      { id: "south", label: "South tent", locationIds: ["L2"], catalogObjectIds: ["beer-2"], categoryIds: [], rollsUp: [] },
      { id: "alcohol", label: "Alcohol", locationIds: [], catalogObjectIds: [], categoryIds: [], rollsUp: ["north", "south"] },
    ]);
    expect(cardReadiness(config).alcohol).toBe("rollup");
    expect(() =>
      validatePosConfig([
        { id: "a", label: "A", rollsUp: ["b"] },
        { id: "b", label: "B", rollsUp: ["a"] },
      ]),
    ).toThrow(/loop/i);
  });

  it("rejects an item or category listed on two cards", () => {
    expect(() =>
      validatePosConfig([
        { id: "north", label: "North", locationIds: ["L1"], catalogObjectIds: ["beer"], categoryIds: [], rollsUp: [] },
        { id: "south", label: "South", locationIds: ["L2"], catalogObjectIds: ["beer"], categoryIds: [], rollsUp: [] },
      ]),
    ).toThrow(/Item beer is on North and South/);
    expect(() =>
      validatePosConfig([
        { id: "north", label: "North", locationIds: ["L1"], catalogObjectIds: [], categoryIds: ["CAT"], rollsUp: [] },
        { id: "south", label: "South", locationIds: ["L2"], catalogObjectIds: [], categoryIds: ["CAT"], rollsUp: [] },
      ]),
    ).toThrow(/Category CAT is on North and South/);
  });

  it("rejects a total that counts the same booth twice", () => {
    expect(() =>
      validatePosConfig([
        { id: "north", label: "North tent", locationIds: ["L1"], catalogObjectIds: ["a"], categoryIds: [], rollsUp: [] },
        { id: "south", label: "South tent", locationIds: ["L2"], catalogObjectIds: ["b"], categoryIds: [], rollsUp: [] },
        { id: "alcohol", label: "Alcohol", rollsUp: ["north", "south"] },
        { id: "all", label: "All alcohol", rollsUp: ["alcohol", "north"] },
      ]),
    ).toThrow(/All alcohol counts North tent more than once/);
  });
});
