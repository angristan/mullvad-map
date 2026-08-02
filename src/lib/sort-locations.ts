import type { LatencyResult } from "./latency";
import { activeListedCapacityGbps } from "./relay-capacity";
import type { FilteredLocation } from "../shared/relay";

export type LocationSortKey = "name" | "relays" | "capacity" | "latency";
export type SortDirection = "asc" | "desc";

export function sortLocations(
  locations: ReadonlyArray<FilteredLocation>,
  key: LocationSortKey,
  direction: SortDirection,
  latencyResults: ReadonlyMap<string, LatencyResult>,
) {
  const capacityByKey = new Map(
    locations.map((location) => [
      location.key,
      activeListedCapacityGbps(location.servers),
    ]),
  );

  return [...locations].sort((left, right) => {
    if (key === "latency") {
      const leftLatency = latencyResults.get(left.key)?.estimatedMs;
      const rightLatency = latencyResults.get(right.key)?.estimatedMs;
      if (leftLatency === undefined && rightLatency !== undefined) return 1;
      if (leftLatency !== undefined && rightLatency === undefined) return -1;
      if (leftLatency !== undefined && rightLatency !== undefined) {
        const comparison = leftLatency - rightLatency;
        if (comparison !== 0) return direction === "asc" ? comparison : -comparison;
      }
    } else if (key !== "name") {
      const leftValue =
        key === "relays" ? left.servers.length : (capacityByKey.get(left.key) ?? 0);
      const rightValue =
        key === "relays" ? right.servers.length : (capacityByKey.get(right.key) ?? 0);
      const comparison = leftValue - rightValue;
      if (comparison !== 0) return direction === "asc" ? comparison : -comparison;
    }

    return (
      left.city.localeCompare(right.city) ||
      left.country.localeCompare(right.country) ||
      left.key.localeCompare(right.key)
    );
  });
}
