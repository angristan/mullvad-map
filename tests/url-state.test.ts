import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  parseAppUrlState,
  serializeAppUrlState,
} from "../src/lib/url-state";

describe("application URL state", () => {
  it("parses meaningful filters and the selected location", () => {
    expect(
      parseAppUrlState(
        "?q=Paris&status=online&type=wireguard&ownership=owned&daita=1&location=fr-par",
      ),
    ).toEqual({
      filters: {
        query: "Paris",
        status: "online",
        type: "wireguard",
        ownership: "owned",
        daitaOnly: true,
      },
      selectedKey: "fr-par",
    });
  });

  it("ignores invalid enum values", () => {
    expect(parseAppUrlState("?status=broken&type=other&ownership=mine&daita=true")).toEqual({
      filters: DEFAULT_FILTERS,
      selectedKey: null,
    });
  });

  it("omits defaults and preserves unrelated query parameters", () => {
    expect(
      serializeAppUrlState("?ref=shared&status=offline&location=old", {
        filters: { ...DEFAULT_FILTERS, type: "bridge", daitaOnly: true },
        selectedKey: "se-sto",
      }),
    ).toBe("?ref=shared&type=bridge&daita=1&location=se-sto");

    expect(
      serializeAppUrlState("?q=old&location=fr-par", {
        filters: DEFAULT_FILTERS,
        selectedKey: null,
      }),
    ).toBe("");
  });
});
