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
import type { FilterState } from "./shared/relay";
import classes from "./App.module.css";

const RelayMap = lazy(() => import("./components/RelayMap"));

const DEFAULT_FILTERS: FilterState = {
  query: "",
  status: "all",
  type: "all",
  ownership: "all",
  daitaOnly: false,
};

export function App() {
  const query = useQuery(relayQueryOptions());
  const isMobile = useMediaQuery("(max-width: 48em)", false, {
    getInitialValueInEffect: false,
  });
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [detailsOpened, { open: openDetails, close: closeDetails }] = useDisclosure(false);
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

  const selectLocation = useCallback(
    (key: string) => {
      setSelectedKey(key);
      openDetails();
    },
    [openDetails],
  );

  const resetFilters = useCallback(() => setFilters(DEFAULT_FILTERS), []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "/" && document.activeElement?.tagName !== "INPUT") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('[aria-label="Search relays"]')?.focus();
      }
      if (event.key === "Escape" && !detailsOpened && filters.query) {
        setFilters((current) => ({ ...current, query: "" }));
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [detailsOpened, filters.query]);

  return (
    <Box className={classes.root}>
      <Suspense fallback={<MapFallback />}>
        <RelayMap
          locations={filteredLocations}
          selectedKey={selectedKey}
          bestLatencyKey={bestLatency?.locationKey ?? null}
          latencyResults={latency.results}
          latencyScale={latencyScale}
          latencyStatus={latency.status}
          onSelect={selectLocation}
        />
      </Suspense>

      <Sidebar
        locations={filteredLocations}
        summary={summary}
        filters={filters}
        onFiltersChange={setFilters}
        onResetFilters={resetFilters}
        onSelect={selectLocation}
        onOpenMobileFilters={openMobileFilters}
        isMobile={isMobile}
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
      />

      <LocationDetails
        location={selectedLocation}
        opened={detailsOpened && selectedLocation !== null}
        onClose={closeDetails}
        isMobile={isMobile}
        latency={selectedKey ? (latency.results.get(selectedKey) ?? null) : null}
      />

      <Drawer
        opened={filtersOpened && isMobile}
        onClose={closeMobileFilters}
        position="bottom"
        size={420}
        offset={8}
        radius="xl"
        title="Filter relays"
        classNames={{ content: classes.filterDrawer, body: classes.filterDrawerBody }}
      >
        <FilterControls
          filters={filters}
          onChange={setFilters}
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
        <Text size="sm" c="dark.3">
          Loading map…
        </Text>
      </Stack>
    </Box>
  );
}
