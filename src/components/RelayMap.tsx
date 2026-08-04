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
  detailsOpen: boolean;
  bestLatencyKey: string | null;
  latencyResults: ReadonlyMap<string, LatencyResult>;
  latencyScale: LatencyScale | null;
  latencyStatus: "idle" | "probing" | "success" | "error";
  onSelect: (key: string) => void;
};

export default function RelayMap({
  locations,
  selectedKey,
  detailsOpen,
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
  const selectedKeyRef = useRef(selectedKey);
  const detailsOpenRef = useRef(detailsOpen);
  const [mapReady, setMapReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);

  latencyResultsRef.current = latencyResults;
  latencyScaleRef.current = latencyScale;
  latencyStatusRef.current = latencyStatus;
  bestLatencyKeyRef.current = bestLatencyKey;
  selectedKeyRef.current = selectedKey;
  detailsOpenRef.current = detailsOpen;

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

    const syncMapPadding = () => map.setPadding(getMapPadding(detailsOpenRef.current));
    syncMapPadding();
    window.addEventListener("resize", syncMapPadding);

    const timeout = window.setTimeout(() => setMapFailed(true), 12_000);
    let projectionConfigured = false;
    const onStyleData = () => {
      if (!map.getStyle().layers?.length) return;
      if (!projectionConfigured) {
        projectionConfigured = true;
        map.setProjection({ type: "globe" });
        if (map.getSource("ne2_shaded") && !map.getLayer("relay-natural-earth")) {
          const beforeLayer = map.getLayer("water") ? "water" : undefined;
          map.addLayer(
            {
              id: "relay-natural-earth",
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
            beforeLayer,
          );
        }
        map.setSky({
          "sky-color": "#13100f",
          "horizon-color": "#29413d",
          "fog-color": "#2b211d",
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
      window.removeEventListener("resize", syncMapPadding);
      map.off("styledata", onStyleData);
      map.off("error", onError);
      mapRef.current = null;
      map.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.setPadding(getMapPadding(detailsOpen));
  }, [detailsOpen, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const markers: Marker[] = [];
    const popup = new Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 20,
      maxWidth: "280px",
      className: "relay-popup",
    });

    const addMarkers = () => {
      markerElementsRef.current.clear();

      for (const location of locations) {
        const serverCount = location.servers.length;
        const offlineCount = location.servers.filter((server) => !server.active).length;
        const capacityGbps = activeListedCapacityGbps(location.servers);
        const element = document.createElement("button");
        const baseLabel = `${location.city}, ${location.country}: ${serverCount} relays, ${offlineCount} offline, ${capacityGbps} gigabits per second listed capacity`;
        element.type = "button";
        element.className = "relay-node";
        element.dataset.issues = String(offlineCount > 0);
        element.dataset.selected = String(location.key === selectedKeyRef.current);
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
          new Marker({
            element,
            opacityWhenCovered: 0,
            subpixelPositioning: true,
          })
            .setLngLat([location.longitude, location.latitude])
            .addTo(map),
        );
      }
    };

    const syncMarkerAccessibility = () => {
      const center = map.getCenter();
      for (const location of locations) {
        const element = markerElementsRef.current.get(location.key);
        if (!element) continue;
        const visible = isOnVisibleHemisphere(location, center);
        element.tabIndex = -1;
        element.setAttribute("aria-hidden", "true");
        element.style.visibility = visible ? "visible" : "hidden";
        if (document.activeElement === element) element.blur();
      }
    };

    addMarkers();
    syncMarkerAccessibility();
    map.on("moveend", syncMarkerAccessibility);

    return () => {
      map.off("moveend", syncMarkerAccessibility);
      popup.remove();
      markers.forEach((marker) => marker.remove());
      markerElementsRef.current.clear();
    };
  }, [locations, mapReady, onSelect]);

  useEffect(() => {
    for (const [key, element] of markerElementsRef.current) {
      element.dataset.selected = String(key === selectedKey);
    }
  }, [selectedKey]);

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

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    map.flyTo({
      center: [location.longitude, location.latitude],
      zoom: Math.max(map.getZoom(), 5.2),
      duration: reduceMotion ? 0 : 850,
      essential: false,
    });
  }, [locations, selectedKey]);

  const latencyMode = latencyStatus === "probing" || latencyScale !== null;

  return (
    <Box className={classes.root} data-details-open={detailsOpen}>
      <div
        id="relay-map"
        ref={containerRef}
        className={classes.map}
        tabIndex={-1}
        role="application"
        aria-label="Interactive globe of Mullvad relay locations. Use the location list to open relay details."
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
              <LegendItem color="var(--ds-sage)" label="All online" />
              <LegendItem color="var(--ds-accent)" label="Has offline relays" />
            </Group>
          )}
          <CapacityLegend />
        </Stack>
      </Paper>

      {mapFailed && (
        <Paper className={classes.error} radius="md" p="sm" withBorder role="alert">
          <Text size="xs" c="var(--ds-accent)">
            The base map could not load. Search and relay details are still available.
          </Text>
        </Paper>
      )}
    </Box>
  );
}

function getMapPadding(detailsOpen: boolean) {
  if (window.innerWidth >= 1_280) {
    return { top: 0, right: detailsOpen ? 432 : 0, bottom: 0, left: 432 };
  }

  if (window.innerWidth <= 700) {
    return {
      top: 170,
      right: 0,
      bottom: detailsOpen ? Math.min(320, Math.round(window.innerHeight * 0.46)) : 0,
      left: 0,
    };
  }

  return {
    top: 150,
    right: 0,
    bottom: detailsOpen ? Math.min(360, Math.round(window.innerHeight * 0.5)) : 0,
    left: 0,
  };
}

function CapacityLegend() {
  return (
    <Group className={classes.capacityLegend} gap={6} wrap="nowrap">
      <span className={classes.capacityDot} data-size="small" />
      <span className={classes.capacityDot} data-size="large" />
      <Text size="12px" c="var(--ds-muted)" fw={650}>
        Active listed capacity
      </Text>
    </Group>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <Group gap={5} wrap="nowrap">
      <span className={classes.legendDot} style={{ backgroundColor: color }} />
      <Text size="13px" c="var(--ds-muted)" fw={650}>
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
        <span className={classes.legendDot} style={{ backgroundColor: "var(--ds-subtle)" }} />
        <Text size="13px" c="var(--ds-muted)" fw={650}>
          Testing all locations…
        </Text>
      </Group>
    );
  }

  return (
    <Group gap="sm" wrap="nowrap">
      <div className={classes.gradientLegend}>
        <Text size="12px" c="var(--ds-muted)" fw={650}>
          Faster
        </Text>
        <span
          className={classes.gradientBar}
          style={{
            background: `linear-gradient(90deg, ${LATENCY_FAST_COLOR}, ${LATENCY_MID_COLOR}, ${LATENCY_SLOW_COLOR})`,
          }}
        />
        <Text size="12px" c="var(--ds-muted)" fw={650}>
          Slower
        </Text>
      </div>
      <LegendItem color="var(--ds-subtle)" label={testing ? "Pending" : "No result"} />
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
      latency && state.scale ? latencyColor(latency.estimatedMs, state.scale) : "var(--ds-subtle)",
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
      ? "var(--ds-subtle)"
      : offlineCount > 0
        ? "var(--ds-accent)"
        : "var(--ds-sage)";
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
  root.appendChild(header);
  root.appendChild(meta);
  return root;
}
