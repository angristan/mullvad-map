import type { RelayServer } from "../shared/relay";

const MIN_NODE_DIAMETER = 9;
const MAX_NODE_DIAMETER = 24;
const CAPACITY_SCALE = 0.8;

export function activeListedCapacityGbps(servers: ReadonlyArray<RelayServer>) {
  return servers.reduce(
    (total, server) => total + (server.active ? server.speedGbps : 0),
    0,
  );
}

export function capacityNodeDiameter(capacityGbps: number) {
  const diameter = MIN_NODE_DIAMETER + Math.sqrt(Math.max(0, capacityGbps)) * CAPACITY_SCALE;
  return Math.min(MAX_NODE_DIAMETER, diameter);
}
