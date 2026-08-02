import { describe, expect, it } from "vitest";
import { filterLocations, summarizeLocations } from "../src/lib/filter-relays";
import type { FilterState, RelayLocation } from "../src/shared/relay";

const locations: RelayLocation[] = [
  {
    key: "fr-par",
    countryCode: "fr",
    country: "France",
    cityCode: "par",
    city: "Paris",
    latitude: 48.8566,
    longitude: 2.3522,
    servers: [
      {
        hostname: "fr-par-wg-001",
        active: true,
        owned: true,
        provider: "31173",
        ipv4: "1.1.1.1",
        ipv6: null,
        speedGbps: 20,
        stboot: true,
        type: "wireguard",
        daita: true,
        messages: [],
      },
      {
        hostname: "fr-par-br-001",
        active: false,
        owned: false,
        provider: "M247",
        ipv4: "2.2.2.2",
        ipv6: null,
        speedGbps: 10,
        stboot: true,
        type: "bridge",
        daita: false,
        messages: [],
      },
    ],
  },
];

const defaults: FilterState = {
  query: "",
  status: "all",
  type: "all",
  ownership: "all",
  daitaOnly: false,
};

describe("filterLocations", () => {
  it("keeps all matching servers when the location matches", () => {
    const result = filterLocations(locations, { ...defaults, query: "France" });
    expect(result[0]?.servers).toHaveLength(2);
  });

  it("narrows server-level searches and capability filters", () => {
    const byProvider = filterLocations(locations, { ...defaults, query: "M247" });
    expect(byProvider[0]?.servers.map((server) => server.hostname)).toEqual(["fr-par-br-001"]);

    const daita = filterLocations(locations, { ...defaults, daitaOnly: true });
    expect(daita[0]?.servers.map((server) => server.hostname)).toEqual(["fr-par-wg-001"]);
  });

  it("summarizes only filtered relays", () => {
    const offline = filterLocations(locations, { ...defaults, status: "offline" });
    expect(summarizeLocations(offline)).toEqual({
      total: 1,
      online: 0,
      locations: 1,
      countries: 1,
    });
  });
});
