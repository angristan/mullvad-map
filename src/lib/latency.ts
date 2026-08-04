import type { FilteredLocation, RelayServer } from "../shared/relay";

export const LATENCY_PROBE_COUNT = 3;
export const LATENCY_RTT_DIVISOR = 4;

export type LatencyTarget = {
  location: FilteredLocation;
  server: RelayServer;
};

export type LatencyResult = {
  locationKey: string;
  serverHostname: string;
  estimatedMs: number;
  rawMedianMs: number;
  samples: ReadonlyArray<number>;
};

export function selectLatencyTargets(
  locations: ReadonlyArray<FilteredLocation>,
  orderedKeys: ReadonlyArray<string>,
) {
  const locationsByKey = new Map(locations.map((location) => [location.key, location]));
  const targets: LatencyTarget[] = [];

  for (const key of orderedKeys) {
    const location = locationsByKey.get(key);
    if (!location) continue;
    const server = location.servers.find(
      (candidate) => candidate.active && candidate.type === "wireguard",
    );
    if (!server) continue;
    targets.push({ location, server });
  }

  return targets;
}

export const LATENCY_FAST_COLOR = "#69c1b5";
export const LATENCY_MID_COLOR = "#d98a62";
export const LATENCY_SLOW_COLOR = "#f08770";

export type LatencyScale = {
  low: number;
  high: number;
};

export function createLatencyScale(values: ReadonlyArray<number>): LatencyScale | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return {
    low: quantile(sorted, 0.1),
    high: quantile(sorted, 0.9),
  };
}

export function latencyColor(estimatedMs: number, scale: LatencyScale) {
  const low = Math.log1p(scale.low);
  const high = Math.log1p(scale.high);
  const range = high - low;
  const position = range > 0 ? clamp((Math.log1p(estimatedMs) - low) / range) : 0;
  if (position <= 0.5) {
    return mixColor([105, 193, 181], [217, 138, 98], position * 2);
  }
  return mixColor([217, 138, 98], [240, 135, 112], (position - 0.5) * 2);
}

function quantile(sorted: ReadonlyArray<number>, percentile: number) {
  const position = (sorted.length - 1) * percentile;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sorted[lowerIndex] ?? 0;
  const upper = sorted[upperIndex] ?? lower;
  return lower + (upper - lower) * (position - lowerIndex);
}

function mixColor(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  amount: number,
) {
  const channels = from.map((channel, index) =>
    Math.round(channel + ((to[index] ?? channel) - channel) * amount),
  );
  return `rgb(${channels.join(" ")})`;
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function estimateLatency(samples: ReadonlyArray<number>) {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
      : (sorted[middle] ?? 0);

  return {
    estimatedMs: Math.max(1, Math.round(median / LATENCY_RTT_DIVISOR)),
    rawMedianMs: median,
  };
}
