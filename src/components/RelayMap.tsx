import { Box, Group, Paper, Stack, Text } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  Popup,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { isOnVisibleHemisphere } from "../lib/globe";
import {
  activeListedCapacityGbps,
  capacityNodeDiameter,
} from "../lib/relay-capacity";
import {
  LATENCY_FAST_COLOR,
  LATENCY_MID_COLOR,
  LATENCY_SLOW_COLOR,
  latencyColor,
  type LatencyResult,
  type LatencyScale,
} from "../lib/latency";
import type { FilteredLocation } from "../shared/relay";
import classes from "./RelayMap.module.css";

const MAP_STYLE = "https://tiles.openfreemap.org/styles/fiord";

type RelayMapProps = {
  locations: ReadonlyArray<FilteredLocation>;
  selectedKey: string | null;
  bestLatencyKey: string | null;
  latencyResults: ReadonlyMap<string, LatencyResult>;
  latencyScale: LatencyScale | null;
  latencyStatus: "idle" | "probing" | "success" | "error";
  onSelect: (key: string) => void;
};

export default function RelayMap({
  locations,
  selectedKey,
  bestLatencyKey,
  latencyResults,
  latencyScale,
  latencyStatus,
  onSelect,
}: RelayMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerElementsRef = useRef(new Map<string, HTMLButtonElement>());
  const latencyResultsRef = useRef(latencyResults);
  const latencyScaleRef = useRef(latencyScale);
  const latencyStatusRef = useRef(latencyStatus);
  const bestLatencyKeyRef = useRef(bestLatencyKey);
  const [mapReady, setMapReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);

  latencyResultsRef.current = latencyResults;
  latencyScaleRef.current = latencyScale;
  latencyStatusRef.current = latencyStatus;
  bestLatencyKeyRef.current = bestLatencyKey;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = new MapLibreMap({
      container,
      style: MAP_STYLE,
      center: [10, 22],
      zoom: 1.2,
      minZoom: 0,
      maxZoom: 12,
      maxPitch: 0,
      renderWorldCopies: false,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");

    const timeout = window.setTimeout(() => setMapFailed(true), 12_000);
    let projectionConfigured = false;
    const onStyleData = () => {
      if (!map.getStyle().layers?.length) return;
      if (!projectionConfigured) {
        projectionConfigured = true;
        map.setProjection({ type: "globe" });
        map.addLayer(
          {
            id: "atlas-natural-earth",
            type: "raster",
            source: "ne2_shaded",
            maxzoom: 7,
            paint: {
              "raster-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.82, 6, 0.12],
              "raster-saturation": -0.72,
              "raster-contrast": 0.18,
              "raster-brightness-min": 0.06,
              "raster-brightness-max": 0.58,
            },
          },
          "water",
        );
        map.setSky({
          "sky-color": "#02070d",
          "horizon-color": "#173047",
          "fog-color": "#101f35",
          "fog-ground-blend": 0.72,
          "horizon-fog-blend": 0.55,
          "sky-horizon-blend": 0.68,
          "atmosphere-blend": 0.82,
        });
      }
      window.clearTimeout(timeout);
      setMapFailed(false);
      setMapReady(true);
    };
    const onError = (event: { error: Error }) => {
      console.error("[relay-map]", event.error);
    };

    map.on("styledata", onStyleData);
    map.on("error", onError);

    return () => {
      window.clearTimeout(timeout);
      setMapReady(false);
      mapRef.current = null;
      map.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    let markers: Marker[] = [];
    const popup = new Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 20,
      maxWidth: "280px",
      className: "relay-popup",
    });

    const renderMarkers = () => {
      popup.remove();
      markers.forEach((marker) => marker.remove());
      markers = [];
      markerElementsRef.current.clear();

      const center = map.getCenter();
      const visibleLocations = locations.filter((location) =>
        isOnVisibleHemisphere(location, center),
      );

      for (const location of visibleLocations) {
        const serverCount = location.servers.length;
        const offlineCount = location.servers.filter((server) => !server.active).length;
        const capacityGbps = activeListedCapacityGbps(location.servers);
        const element = document.createElement("button");
        const baseLabel = `${location.city}, ${location.country}: ${serverCount} relays, ${offlineCount} offline, ${capacityGbps} gigabits per second listed capacity`;
        element.type = "button";
        element.className = "relay-node";
        element.dataset.issues = String(offlineCount > 0);
        element.dataset.selected = String(location.key === selectedKey);
        element.dataset.baseLabel = baseLabel;
        element.style.setProperty(
          "--node-size",
          `${capacityNodeDiameter(capacityGbps)}px`,
        );
        element.setAttribute("aria-label", baseLabel);
        applyLatencyNodeStyle(element, location.key, {
          bestLatencyKey: bestLatencyKeyRef.current,
          results: latencyResultsRef.current,
          scale: latencyScaleRef.current,
          status: latencyStatusRef.current,
        });
        element.addEventListener("click", (event) => {
          event.stopPropagation();
          onSelect(location.key);
        });
        const showPopup = () => {
          const latency = latencyResultsRef.current.get(location.key);
          popup
            .setLngLat([location.longitude, location.latitude])
            .setDOMContent(
              makePopupContent({
                title: `${location.city}, ${location.country}`,
                serverCount,
                offlineCount,
                capacityGbps,
                latency,
                scale: latencyScaleRef.current,
                testing: latencyStatusRef.current === "probing" && !latency,
              }),
            )
            .addTo(map);
        };
        element.addEventListener("mouseenter", showPopup);
        element.addEventListener("focus", showPopup);
        element.addEventListener("mouseleave", () => popup.remove());
        element.addEventListener("blur", () => popup.remove());
        markerElementsRef.current.set(location.key, element);
        markers.push(
          new Marker({ element, opacityWhenCovered: 0 })
            .setLngLat([location.longitude, location.latitude])
            .addTo(map),
        );
      }
    };

    renderMarkers();
    map.on("moveend", renderMarkers);

    return () => {
      map.off("moveend", renderMarkers);
      popup.remove();
      markers.forEach((marker) => marker.remove());
      markerElementsRef.current.clear();
    };
  }, [locations, mapReady, onSelect, selectedKey]);

  useEffect(() => {
    const visualState = {
      bestLatencyKey,
      results: latencyResults,
      scale: latencyScale,
      status: latencyStatus,
    } as const;
    for (const [key, element] of markerElementsRef.current) {
      applyLatencyNodeStyle(element, key, visualState);
    }
  }, [bestLatencyKey, latencyResults, latencyScale, latencyStatus]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedKey) return;
    const location = locations.find((item) => item.key === selectedKey);
    if (!location) return;

    map.flyTo({
      center: [location.longitude, location.latitude],
      zoom: Math.max(map.getZoom(), 5.2),
      duration: 850,
      essential: true,
    });
  }, [locations, selectedKey]);

  const latencyMode = latencyStatus === "probing" || latencyScale !== null;

  return (
    <Box className={classes.root}>
      <div
        ref={containerRef}
        className={classes.map}
        role="application"
        aria-label="Interactive globe of Mullvad relay locations"
      />

      <Paper className={classes.legend} radius="md" px="sm" py={7} withBorder>
        <Stack gap={5}>
          {latencyMode ? (
            <LatencyGradientLegend
              hasScale={latencyScale !== null}
              testing={latencyStatus === "probing"}
            />
          ) : (
            <Group gap="sm">
              <LegendItem color="#57e389" label="All online" />
              <LegendItem color="#ffb347" label="Has offline relays" />
            </Group>
          )}
          <CapacityLegend />
        </Stack>
      </Paper>

      {mapFailed && (
        <Paper className={classes.error} radius="md" p="sm" withBorder role="alert">
          <Text size="xs" c="yellow.2">
            The base map could not load. Search and relay details are still available.
          </Text>
        </Paper>
      )}
    </Box>
  );
}

function CapacityLegend() {
  return (
    <Group className={classes.capacityLegend} gap={6} wrap="nowrap">
      <span className={classes.capacityDot} data-size="small" />
      <span className={classes.capacityDot} data-size="large" />
      <Text size="10px" c="gray.4">
        Active listed capacity
      </Text>
    </Group>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <Group gap={5} wrap="nowrap">
      <span className={classes.legendDot} style={{ backgroundColor: color }} />
      <Text size="13px" c="gray.4">
        {label}
      </Text>
    </Group>
  );
}

function LatencyGradientLegend({
  hasScale,
  testing,
}: {
  hasScale: boolean;
  testing: boolean;
}) {
  if (!hasScale) {
    return (
      <Group gap={7} wrap="nowrap">
        <span className={classes.legendDot} style={{ backgroundColor: "#64748b" }} />
        <Text size="13px" c="gray.4">
          Testing all locations…
        </Text>
      </Group>
    );
  }

  return (
    <Group gap="sm" wrap="nowrap">
      <div className={classes.gradientLegend}>
        <Text size="10px" c="gray.4">
          Faster
        </Text>
        <span
          className={classes.gradientBar}
          style={{
            background: `linear-gradient(90deg, ${LATENCY_FAST_COLOR}, ${LATENCY_MID_COLOR}, ${LATENCY_SLOW_COLOR})`,
          }}
        />
        <Text size="10px" c="gray.4">
          Slower
        </Text>
      </div>
      <LegendItem color="#64748b" label={testing ? "Pending" : "No result"} />
    </Group>
  );
}

type LatencyVisualState = {
  bestLatencyKey: string | null;
  results: ReadonlyMap<string, LatencyResult>;
  scale: LatencyScale | null;
  status: "idle" | "probing" | "success" | "error";
};

function applyLatencyNodeStyle(
  element: HTMLButtonElement,
  locationKey: string,
  state: LatencyVisualState,
) {
  const latency = state.results.get(locationKey);
  const latencyMode = state.status === "probing" || state.scale !== null;
  if (latencyMode) {
    element.style.setProperty(
      "--node-color",
      latency && state.scale ? latencyColor(latency.estimatedMs, state.scale) : "#64748b",
    );
  } else {
    element.style.removeProperty("--node-color");
  }

  element.dataset.best = String(locationKey === state.bestLatencyKey);
  element.dataset.testing = String(state.status === "probing" && !latency);
  const baseLabel = element.dataset.baseLabel ?? "Relay location";
  element.setAttribute(
    "aria-label",
    latency
      ? `${baseLabel}, approximately ${latency.estimatedMs} milliseconds`
      : state.status === "probing"
        ? `${baseLabel}, latency test pending`
        : baseLabel,
  );
}

function makePopupContent({
  title,
  serverCount,
  offlineCount,
  capacityGbps,
  latency,
  scale,
  testing,
}: {
  title: string;
  serverCount: number;
  offlineCount: number;
  capacityGbps: number;
  latency: LatencyResult | undefined;
  scale: LatencyScale | null;
  testing: boolean;
}) {
  const color = latency && scale
    ? latencyColor(latency.estimatedMs, scale)
    : testing
      ? "#64748b"
      : offlineCount > 0
        ? "#ffb347"
        : "#57e389";
  const root = document.createElement("div");
  root.className = "relay-popup-card";
  root.style.setProperty("--popup-color", color);

  const header = document.createElement("div");
  header.className = "relay-popup-header";
  const dot = document.createElement("span");
  dot.className = "relay-popup-dot";
  const heading = document.createElement("strong");
  heading.className = "relay-popup-title";
  heading.textContent = title;
  header.appendChild(dot);
  header.appendChild(heading);

  if (latency || testing) {
    const badge = document.createElement("span");
    badge.className = "relay-popup-latency";
    badge.textContent = latency ? `~${latency.estimatedMs} ms` : "Testing…";
    header.appendChild(badge);
  }

  const meta = document.createElement("p");
  meta.className = "relay-popup-meta";
  meta.textContent = `${serverCount} relay${serverCount === 1 ? "" : "s"} · ${
    offlineCount > 0 ? `${offlineCount} offline` : "all online"
  } · ${capacityGbps.toLocaleString()} Gbps listed`;
  const hint = document.createElement("p");
  hint.className = "relay-popup-hint";
  hint.textContent = "Select for relay details";
  root.appendChild(header);
  root.appendChild(meta);
  root.appendChild(hint);
  return root;
}
