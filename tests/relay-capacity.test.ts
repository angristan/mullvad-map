import { describe, expect, it } from "vitest";
import {
  activeListedCapacityGbps,
  capacityNodeDiameter,
} from "../src/lib/relay-capacity";
import type { RelayServer } from "../src/shared/relay";

const server = (speedGbps: number, active = true): RelayServer => ({
  hostname: `relay-${speedGbps}`,
  active,
  owned: true,
  provider: "provider",
  ipv4: "192.0.2.1",
  ipv6: null,
  speedGbps,
  stboot: true,
  type: "wireguard",
  daita: false,
  messages: [],
});

describe("relay capacity", () => {
  it("sums only active listed port capacity", () => {
    expect(activeListedCapacityGbps([server(20), server(10), server(20, false)])).toBe(30);
  });

  it("uses area-aware square-root scaling with bounded diameters", () => {
    expect(capacityNodeDiameter(0)).toBe(9);
    expect(capacityNodeDiameter(20)).toBeGreaterThan(capacityNodeDiameter(10));
    expect(capacityNodeDiameter(10_000)).toBe(24);
  });
});
