import { useCallback, useEffect, useRef, useState } from "react";
import { fetchLatencyCandidates } from "../api/latency";
import {
  estimateLatency,
  LATENCY_PROBE_COUNT,
  selectLatencyTargets,
  type LatencyResult,
  type LatencyTarget,
} from "../lib/latency";
import type { FilteredLocation } from "../shared/relay";

const PROBE_TIMEOUT_MS = 2_500;
const PROBE_CONCURRENCY = 6;

type LatencyProbeState = {
  status: "idle" | "probing" | "success" | "error";
  results: ReadonlyMap<string, LatencyResult>;
  completed: number;
  total: number;
  error: string | null;
  basis: "edge" | "global" | null;
};

const INITIAL_STATE: LatencyProbeState = {
  status: "idle",
  results: new Map(),
  completed: 0,
  total: 0,
  error: null,
  basis: null,
};

export function useLatencyProbe(locations: ReadonlyArray<FilteredLocation>) {
  const [state, setState] = useState<LatencyProbeState>(INITIAL_STATE);
  const activeController = useRef<AbortController | null>(null);

  const start = useCallback(async () => {
    activeController.current?.abort();
    const controller = new AbortController();
    activeController.current = controller;
    setState({ ...INITIAL_STATE, status: "probing" });

    try {
      const candidates = await fetchLatencyCandidates(controller.signal);
      const targets = selectLatencyTargets(locations, candidates.locationKeys);
      if (targets.length === 0) {
        throw new Error("No active WireGuard relays match the current filters.");
      }

      setState((current) => ({
        ...current,
        total: targets.length,
        basis: candidates.basis,
      }));

      let nextTarget = 0;
      const collectedResults = new Map<string, LatencyResult>();
      const worker = async () => {
        while (!controller.signal.aborted) {
          const target = targets[nextTarget];
          nextTarget += 1;
          if (!target) return;

          const result = await probeTarget(target, controller.signal);
          if (controller.signal.aborted) return;
          if (result) collectedResults.set(result.locationKey, result);
          setState((current) => ({
            ...current,
            results: new Map(collectedResults),
            completed: current.completed + 1,
          }));
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(PROBE_CONCURRENCY, targets.length) }, () => worker()),
      );
      if (controller.signal.aborted) return;

      setState((current) => ({
        ...current,
        results: collectedResults,
        status: collectedResults.size > 0 ? "success" : "error",
        error: collectedResults.size > 0 ? null : "The relay probes timed out.",
      }));
    } catch (error) {
      if (controller.signal.aborted) return;
      setState((current) => ({
        ...current,
        status: "error",
        error: error instanceof Error ? error.message : "Latency testing failed.",
      }));
    }
  }, [locations]);

  useEffect(
    () => () => {
      activeController.current?.abort();
    },
    [],
  );

  return { ...state, start };
}

async function probeTarget(target: LatencyTarget, signal: AbortSignal) {
  const samples: number[] = [];
  for (let index = 0; index < LATENCY_PROBE_COUNT; index += 1) {
    const sample = await measureFailedTls(target.server.ipv4, signal);
    if (sample !== null) samples.push(sample);
    if (signal.aborted) return null;
  }

  const estimate = estimateLatency(samples);
  if (!estimate) return null;
  return {
    locationKey: target.location.key,
    serverHostname: target.server.hostname,
    samples,
    ...estimate,
  } satisfies LatencyResult;
}

async function measureFailedTls(ipv4: string, signal: AbortSignal) {
  if (!isIpv4Address(ipv4) || signal.aborted) return null;

  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, PROBE_TIMEOUT_MS);
  const startedAt = performance.now();

  try {
    await fetch(`https://${ipv4}/?atlas-probe=${crypto.randomUUID()}`, {
      signal: controller.signal,
      mode: "no-cors",
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  } catch {
    // Mullvad port 443 rejects TLS. The rejection duration is the measurement.
  } finally {
    window.clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }

  if (signal.aborted || timedOut) return null;
  return performance.now() - startedAt;
}

function isIpv4Address(value: string) {
  const parts = value.split(".");
  return (
    parts.length === 4 &&
    parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255)
  );
}
