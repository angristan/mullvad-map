import { Box, Drawer, Loader, Stack, Text } from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { relayQueryOptions } from "./api/relays";
import { FilterControls } from "./components/FilterControls";
import { LocationDetails } from "./components/LocationDetails";
import { Sidebar } from "./components/Sidebar";
import { useLatencyProbe } from "./hooks/use-latency-probe";
import { filterLocations, hasActiveFilters, summarizeLocations } from "./lib/filter-relays";
import { createLatencyScale } from "./lib/latency";
import {
  DEFAULT_FILTERS,
  parseAppUrlState,
  serializeAppUrlState,
} from "./lib/url-state";
import type { FilterState } from "./shared/relay";
import classes from "./App.module.css";

const RelayMap = lazy(() => import("./components/RelayMap"));

export function App() {
  const query = useQuery(relayQueryOptions());
  const isMobile = useMediaQuery("(max-width: 43.75em)", false, {
    getInitialValueInEffect: false,
  });
  const isWide = useMediaQuery("(min-width: 80em)", false, {
    getInitialValueInEffect: false,
  });
  const layoutMode = isMobile ? "mobile" : isWide ? "wide" : "intermediate";
  const compact = layoutMode !== "wide";
  const initialUrlState = useMemo(() => parseAppUrlState(window.location.search), []);
  const [filters, setFilters] = useState<FilterState>(initialUrlState.filters);
  const [selectedKey, setSelectedKey] = useState<string | null>(initialUrlState.selectedKey);
  const [filtersOpened, { open: openMobileFilters, close: closeMobileFilters }] = useDisclosure(false);

  const locations = query.data?.data.locations ?? [];
  const filteredLocations = useMemo(
    () => filterLocations(locations, filters),
    [filters, locations],
  );
  const summary = useMemo(() => summarizeLocations(filteredLocations), [filteredLocations]);
  const latency = useLatencyProbe(filteredLocations);
  const bestLatency = useMemo(
    () =>
      [...latency.results.values()].sort(
        (left, right) => left.estimatedMs - right.estimatedMs,
      )[0] ?? null,
    [latency.results],
  );
  const latencyScale = useMemo(
    () => createLatencyScale([...latency.results.values()].map((result) => result.estimatedMs)),
    [latency.results],
  );
  const selectedLocation = useMemo(
    () => filteredLocations.find((location) => location.key === selectedKey) ?? null,
    [filteredLocations, selectedKey],
  );

  const writeUrlState = useCallback(
    (nextFilters: FilterState, nextSelectedKey: string | null, mode: "push" | "replace") => {
      const search = serializeAppUrlState(window.location.search, {
        filters: nextFilters,
        selectedKey: nextSelectedKey,
      });
      window.history[mode === "push" ? "pushState" : "replaceState"](
        null,
        "",
        `${window.location.pathname}${search}${window.location.hash}`,
      );
    },
    [],
  );

  const selectLocation = useCallback(
    (key: string) => {
      setSelectedKey(key);
      writeUrlState(filters, key, "push");
    },
    [filters, writeUrlState],
  );

  const closeLocation = useCallback(() => {
    setSelectedKey(null);
    writeUrlState(filters, null, "push");
  }, [filters, writeUrlState]);

  const changeFilters = useCallback(
    (nextFilters: FilterState) => {
      const onlyQueryChanged =
        nextFilters.query !== filters.query &&
        nextFilters.status === filters.status &&
        nextFilters.type === filters.type &&
        nextFilters.ownership === filters.ownership &&
        nextFilters.daitaOnly === filters.daitaOnly;
      setFilters(nextFilters);
      writeUrlState(nextFilters, selectedKey, onlyQueryChanged ? "replace" : "push");
    },
    [filters, selectedKey, writeUrlState],
  );

  const resetFilters = useCallback(() => changeFilters(DEFAULT_FILTERS), [changeFilters]);

  useEffect(() => {
    const restoreUrlState = () => {
      const restored = parseAppUrlState(window.location.search);
      setFilters(restored.filters);
      setSelectedKey(restored.selectedKey);
    };
    window.addEventListener("popstate", restoreUrlState);
    return () => window.removeEventListener("popstate", restoreUrlState);
  }, []);

  useEffect(() => {
    if (query.isSuccess && selectedKey !== null && selectedLocation === null) {
      setSelectedKey(null);
      writeUrlState(filters, null, "replace");
    }
  }, [filters, query.isSuccess, selectedKey, selectedLocation, writeUrlState]);

  useEffect(() => {
    if (!compact && filtersOpened) closeMobileFilters();
  }, [closeMobileFilters, compact, filtersOpened]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "/" && document.activeElement?.tagName !== "INPUT") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('[aria-label="Search relays"]')?.focus();
      }
      if (event.key === "Escape" && selectedKey === null && filters.query) {
        changeFilters({ ...filters, query: "" });
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [changeFilters, filters, selectedKey]);

  return (
    <Box className={classes.root}>
      <a className={classes.skipLink} href="#relay-map">
        Skip to map
      </a>

      <Sidebar
        locations={filteredLocations}
        selectedKey={selectedKey}
        summary={summary}
        filters={filters}
        onFiltersChange={changeFilters}
        onResetFilters={resetFilters}
        onSelect={selectLocation}
        onOpenMobileFilters={openMobileFilters}
        compact={compact}
        loading={query.isPending}
        fetching={query.isFetching}
        error={query.error instanceof Error ? query.error : null}
        onRetry={() => void query.refetch()}
        response={query.data}
        latencyStatus={latency.status}
        latencyResults={latency.results}
        latencyScale={latencyScale}
        latencyCompleted={latency.completed}
        latencyTotal={latency.total}
        latencyError={latency.error}
        onTestLatency={() => void latency.start()}
        onStopLatency={latency.stop}
      />

      <Suspense fallback={<MapFallback />}>
        <RelayMap
          locations={filteredLocations}
          selectedKey={selectedKey}
          detailsOpen={selectedLocation !== null}
          bestLatencyKey={bestLatency?.locationKey ?? null}
          latencyResults={latency.results}
          latencyScale={latencyScale}
          latencyStatus={latency.status}
          onSelect={selectLocation}
        />
      </Suspense>

      <LocationDetails
        location={selectedLocation}
        opened={selectedLocation !== null}
        onClose={closeLocation}
        layoutMode={layoutMode}
        latency={selectedKey ? (latency.results.get(selectedKey) ?? null) : null}
      />

      <Drawer
        opened={filtersOpened && compact}
        onClose={closeMobileFilters}
        position="bottom"
        size={330}
        offset={8}
        radius="lg"
        title="Filter relays"
        closeButtonProps={{ "aria-label": "Close relay filters" }}
        overlayProps={{ backgroundOpacity: 0.32, blur: 2 }}
        classNames={{
          content: classes.filterDrawer,
          header: classes.filterDrawerHeader,
          title: classes.filterDrawerTitle,
          body: classes.filterDrawerBody,
        }}
      >
        <FilterControls
          filters={filters}
          onChange={changeFilters}
          onReset={resetFilters}
          showReset={hasActiveFilters(filters)}
        />
      </Drawer>
    </Box>
  );
}

function MapFallback() {
  return (
    <Box className={classes.mapFallback}>
      <Stack align="center" gap="xs">
        <Loader size="sm" />
        <Text size="sm" c="var(--ds-muted)" fw={650}>
          Loading map…
        </Text>
      </Stack>
    </Box>
  );
}
