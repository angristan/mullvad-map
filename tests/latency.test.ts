import { describe, expect, it } from "vitest";
import {
  createLatencyScale,
  estimateLatency,
  estimateLatencyProbeScope,
  latencyColor,
  selectLatencyTargets,
} from "../src/lib/latency";
import type { FilteredLocation, RelayServer } from "../src/shared/relay";

const server = (overrides: Partial<RelayServer> = {}): RelayServer => ({
  hostname: "fr-par-wg-001",
  active: true,
  owned: true,
  provider: "31173",
  ipv4: "193.32.126.66",
  ipv6: null,
  speedGbps: 20,
  stboot: true,
  type: "wireguard",
  daita: false,
  messages: [],
  ...overrides,
});

const location = (key: string, servers: RelayServer[]): FilteredLocation => ({
  key,
  countryCode: key.slice(0, 2),
  country: "Country",
  cityCode: key.slice(3),
  city: key,
  latitude: 0,
  longitude: 0,
  servers,
});

describe("latency estimation", () => {
  it("converts the median four-round-trip failure into estimated RTT", () => {
    expect(estimateLatency([13, 11, 11])).toEqual({ estimatedMs: 3, rawMedianMs: 11 });
    expect(estimateLatency([793, 792, 794])).toEqual({
      estimatedMs: 198,
      rawMedianMs: 793,
    });
  });

  it("derives a continuous gradient from the result distribution", () => {
    const scale = createLatencyScale([10, 20, 30, 40, 50, 60]);
    expect(scale).toEqual({ low: 15, high: 55 });
    if (!scale) throw new Error("Expected a latency scale");
    const logarithmicMidpoint = Math.expm1(
      (Math.log1p(scale.low) + Math.log1p(scale.high)) / 2,
    );
    expect(latencyColor(15, scale)).toBe("rgb(105 193 181)");
    expect(latencyColor(logarithmicMidpoint, scale)).toBe("rgb(217 138 98)");
    expect(latencyColor(55, scale)).toBe("rgb(240 135 112)");
    expect(latencyColor(25, scale)).not.toBe(latencyColor(30, scale));
  });

  it("selects active WireGuard targets in edge-provided order", () => {
    const locations = [
      location("fr-par", [server()]),
      location("nl-ams", [server({ hostname: "nl-ams-wg-001" })]),
      location("gb-lon", [server({ active: false })]),
      location("us-nyc", [server({ type: "bridge" })]),
    ];

    expect(
      selectLatencyTargets(locations, ["nl-ams", "gb-lon", "fr-par", "us-nyc"]).map(
        (target) => target.location.key,
      ),
    ).toEqual(["nl-ams", "fr-par"]);
    expect(estimateLatencyProbeScope(locations)).toEqual({ locations: 2, connections: 6 });
  });
});
