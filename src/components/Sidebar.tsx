import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Drawer,
  Group,
  Loader,
  Modal,
  Paper,
  Popover,
  ScrollArea,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from "@mantine/core";
import {
  IconAdjustmentsHorizontal,
  IconAlertCircle,
  IconBolt,
  IconBrandGithub,
  IconChevronRight,
  IconInfoCircle,
  IconList,
  IconPlayerStop,
  IconSearch,
  IconWorldPin,
} from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { countryFlag } from "../lib/country-flag";
import { hasActiveFilters } from "../lib/filter-relays";
import {
  estimateLatencyProbeScope,
  latencyColor,
  type LatencyResult,
  type LatencyScale,
} from "../lib/latency";
import { activeListedCapacityGbps } from "../lib/relay-capacity";
import {
  sortLocations,
  type LocationSortKey,
  type SortDirection,
} from "../lib/sort-locations";
import type { RelayApiResponse, FilterState, FilteredLocation } from "../shared/relay";
import { FilterControls } from "./FilterControls";
import classes from "./Sidebar.module.css";

type SidebarProps = {
  locations: ReadonlyArray<FilteredLocation>;
  selectedKey: string | null;
  summary: { total: number; online: number; locations: number; countries: number };
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  onResetFilters: () => void;
  onSelect: (key: string) => void;
  onOpenMobileFilters: () => void;
  compact: boolean;
  loading: boolean;
  fetching: boolean;
  error: Error | null;
  onRetry: () => void;
  response: RelayApiResponse | undefined;
  latencyStatus: "idle" | "probing" | "success" | "error";
  latencyResults: ReadonlyMap<string, LatencyResult>;
  latencyScale: LatencyScale | null;
  latencyCompleted: number;
  latencyTotal: number;
  latencyError: string | null;
  onTestLatency: () => void;
  onStopLatency: () => void;
};

export function Sidebar({
  locations,
  selectedKey,
  summary,
  filters,
  onFiltersChange,
  onResetFilters,
  onSelect,
  onOpenMobileFilters,
  compact,
  loading,
  fetching,
  error,
  onRetry,
  response,
  latencyStatus,
  latencyResults,
  latencyScale,
  latencyCompleted,
  latencyTotal,
  latencyError,
  onTestLatency,
  onStopLatency,
}: SidebarProps) {
  const hasLatency = latencyResults.size > 0;
  const [sortKey, setSortKey] = useState<LocationSortKey>("relays");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [mobileLocationsOpened, setMobileLocationsOpened] = useState(false);
  const [latencyConfirmOpened, setLatencyConfirmOpened] = useState(false);
  const sorted = useMemo(
    () => sortLocations(locations, sortKey, sortDirection, latencyResults),
    [latencyResults, locations, sortDirection, sortKey],
  );
  const bestLatency = useMemo(
    () =>
      [...latencyResults.values()].sort(
        (left, right) => left.estimatedMs - right.estimatedMs,
      )[0],
    [latencyResults],
  );
  const bestLocation = bestLatency
    ? locations.find((location) => location.key === bestLatency.locationKey)
    : undefined;
  const latencyProbeScope = useMemo(() => estimateLatencyProbeScope(locations), [locations]);
  const activeFilterCount =
    Number(filters.status !== "all") +
    Number(filters.type !== "all") +
    Number(filters.ownership !== "all") +
    Number(filters.daitaOnly);

  useEffect(() => {
    if (!compact) setMobileLocationsOpened(false);
  }, [compact]);

  const changeSort = (key: LocationSortKey) => {
    if (key === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection(key === "name" || key === "latency" ? "asc" : "desc");
  };

  const confirmLatencyTest = () => {
    setLatencyConfirmOpened(false);
    setSortKey("latency");
    setSortDirection("asc");
    onTestLatency();
  };

  return (
    <Paper component="aside" className={classes.panel} radius="xl" p={20}>
      <Stack gap={0} h="100%">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <IconWorldPin className={classes.brandMark} size={24} aria-hidden="true" />
            <Title order={1} className={classes.title}>
              Mullvad Relay Map
            </Title>
          </Group>
          <Group gap={4} wrap="nowrap">
            {fetching && !loading && <Loader size="xs" aria-label="Refreshing relay data" />}
            <ActionIcon
              component="a"
              href="https://github.com/angristan/mullvad-map"
              target="_blank"
              rel="noreferrer"
              size={36}
              variant="default"
              aria-label="View source code on GitHub"
              title="View source code on GitHub"
            >
              <IconBrandGithub size={19} />
            </ActionIcon>
          </Group>
        </Group>

        <RelaySummary
          summary={summary}
          loading={loading}
          updatedAt={response?.data.sourceUpdatedAt}
          cacheMeta={response?.meta}
        />

        <Group className={classes.searchToolbar} gap="sm" mt="md" wrap="nowrap">
          <TextInput
            className={classes.search}
            label="Search relays"
            aria-label="Search relays"
            placeholder={compact ? "Search relays…" : "City, country, provider, hostname…"}
            leftSection={<IconSearch size={16} />}
            rightSection={!compact ? <Text className={classes.hotkey}>/</Text> : undefined}
            value={filters.query}
            onChange={(event) => onFiltersChange({ ...filters, query: event.currentTarget.value })}
          />
          {compact && (
            <>
              <Button
                className={classes.mobileLocationsButton}
                h={40}
                variant="filled"
                color="sage"
                leftSection={<IconList size={17} />}
                aria-label={`Browse ${locations.length} location${locations.length === 1 ? "" : "s"}`}
                disabled={loading}
                onClick={() => setMobileLocationsOpened(true)}
              >
                Locations
              </Button>
              <LatencyProbeControl
                compact
                status={latencyStatus}
                hasLatency={hasLatency}
                loading={loading || latencyProbeScope.connections === 0}
                onStart={() => setLatencyConfirmOpened(true)}
                onStop={onStopLatency}
              />
              <ActionIcon
                className={classes.mobileFilterButton}
                data-active={activeFilterCount > 0}
                size={40}
                variant="default"
                aria-label={`Open relay filters${activeFilterCount > 0 ? `, ${activeFilterCount} active` : ""}`}
                onClick={onOpenMobileFilters}
              >
                <IconAdjustmentsHorizontal size={18} />
                {activeFilterCount > 0 && (
                  <span className={classes.mobileFilterCount} aria-hidden="true">
                    {activeFilterCount}
                  </span>
                )}
              </ActionIcon>
            </>
          )}
        </Group>

        {!compact && (
          <Box mt="sm">
            <FilterControls
              filters={filters}
              onChange={onFiltersChange}
              onReset={onResetFilters}
              showReset={hasActiveFilters(filters)}
            />
          </Box>
        )}

        {compact && bestLocation && bestLatency && (
          <UnstyledButton
            className={classes.bestLatency}
            onClick={() => onSelect(bestLocation.key)}
          >
            <IconBolt size={16} />
            <Text size="14px" fw={750} truncate>
              Best tested: {bestLocation.city}
            </Text>
            <Badge size="sm" color="sage" variant="light">
              ~{bestLatency.estimatedMs} ms
            </Badge>
            <IconChevronRight size={14} />
          </UnstyledButton>
        )}

        {latencyError && (
          <Text className={classes.latencyError} mt={compact ? 6 : 8}>
            {latencyError}
          </Text>
        )}

        {error && !response && (
          <Alert
            mt="md"
            color="red"
            variant="light"
            icon={<IconAlertCircle size={17} />}
            title="Relay data unavailable"
          >
            <Stack gap="xs">
              <Text size="xs">{error.message}</Text>
              <UnstyledButton className={classes.retry} onClick={onRetry}>
                Try again
              </UnstyledButton>
            </Stack>
          </Alert>
        )}

        {!compact && (
          <Stack className={classes.locations} gap={0} mt="md">
            <Group className={classes.locationsHeader} justify="space-between" wrap="nowrap">
              <Text className={classes.sectionTitle}>Locations</Text>
              <Group gap="sm" wrap="nowrap">
                <Text size="12px" c="var(--ds-subtle)" fw={650}>
                  {latencyStatus === "probing"
                    ? `${latencyCompleted}/${latencyTotal || "…"}`
                    : `${locations.length}`}
                </Text>
                <Group gap={4} wrap="nowrap">
                  <LatencyProbeControl
                    status={latencyStatus}
                    hasLatency={hasLatency}
                    loading={loading || latencyProbeScope.connections === 0}
                    onStart={() => setLatencyConfirmOpened(true)}
                    onStop={onStopLatency}
                  />
                  <LatencyInfo />
                </Group>
              </Group>
            </Group>
            <LocationTableHeader
              sortKey={sortKey}
              sortDirection={sortDirection}
              latencyAvailable={hasLatency || latencyStatus === "probing"}
              onSort={changeSort}
            />
            <ScrollArea className={classes.locationScroll} scrollbarSize={5} type="hover">
              <LocationRows
                locations={sorted}
                selectedKey={selectedKey}
                loading={loading}
                latencyResults={latencyResults}
                latencyScale={latencyScale}
                onSelect={onSelect}
              />
            </ScrollArea>
          </Stack>
        )}

        <Group className={classes.footer} justify="space-between" mt="auto">
          <Text
            component="a"
            href="https://mullvad.net/en/servers"
            target="_blank"
            rel="noreferrer"
            size="13px"
            fw={600}
          >
            Data by Mullvad
          </Text>
          <Text
            component="a"
            href="https://openfreemap.org"
            target="_blank"
            rel="noreferrer"
            size="13px"
            fw={600}
          >
            Map by OpenFreeMap
          </Text>
        </Group>
      </Stack>

      {compact && (
        <Drawer
          opened={mobileLocationsOpened}
          onClose={() => setMobileLocationsOpened(false)}
          position="bottom"
          size="80%"
          offset={8}
          radius="lg"
          title={`Locations · ${locations.length}`}
          closeButtonProps={{ "aria-label": "Close locations" }}
          overlayProps={{ backgroundOpacity: 0.32, blur: 2 }}
          classNames={{
            content: classes.mobileLocationsContent,
            header: classes.mobileLocationsDrawerHeader,
            title: classes.mobileLocationsDrawerTitle,
            body: classes.mobileLocationsDrawerBody,
          }}
        >
          <Stack gap={0} h="100%">
            <TextInput
              className={classes.mobileLocationsSearch}
              aria-label="Search locations"
              placeholder="City, country, provider, hostname…"
              leftSection={<IconSearch size={16} />}
              value={filters.query}
              onChange={(event) =>
                onFiltersChange({ ...filters, query: event.currentTarget.value })
              }
            />
            <LocationTableHeader
              sortKey={sortKey}
              sortDirection={sortDirection}
              latencyAvailable={hasLatency || latencyStatus === "probing"}
              onSort={changeSort}
            />
            <ScrollArea
              className={classes.mobileLocationsScroll}
              scrollbarSize={5}
              type="hover"
            >
              <LocationRows
                locations={sorted}
                selectedKey={selectedKey}
                loading={loading}
                latencyResults={latencyResults}
                latencyScale={latencyScale}
                onSelect={(key) => {
                  setMobileLocationsOpened(false);
                  onSelect(key);
                }}
              />
            </ScrollArea>
          </Stack>
        </Drawer>
      )}

      <Modal
        opened={latencyConfirmOpened}
        onClose={() => setLatencyConfirmOpened(false)}
        centered
        size="sm"
        radius="lg"
        title="Test relay latency?"
        closeButtonProps={{ "aria-label": "Close latency test confirmation" }}
        overlayProps={{ backgroundOpacity: 0.42, blur: 3 }}
        classNames={{
          content: classes.latencyConfirmContent,
          header: classes.latencyConfirmHeader,
          body: classes.latencyConfirmBody,
        }}
      >
        <Stack gap="md">
          <Alert color="sky" icon={<IconInfoCircle size={18} />} title="Privacy consequence">
            Mullvad relays can observe your network egress IP and the timing of these attempts.
          </Alert>
          <Text size="sm" c="var(--ds-muted)">
            This test will make up to {latencyProbeScope.connections.toLocaleString()} direct TLS
            connection {latencyProbeScope.connections === 1 ? "attempt" : "attempts"} across{" "}
            {latencyProbeScope.locations.toLocaleString()} matching WireGuard{" "}
            {latencyProbeScope.locations === 1 ? "location" : "locations"}. It tests six locations
            at a time and may take several seconds.
          </Text>
          <Text size="xs" c="var(--ds-subtle)">
            The result ranks locations. It is not a ping or a VPN tunnel performance test.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setLatencyConfirmOpened(false)}>
              Cancel
            </Button>
            <Button
              variant="filled"
              color="sage"
              disabled={latencyProbeScope.connections === 0}
              onClick={confirmLatencyTest}
            >
              Start {latencyProbeScope.connections.toLocaleString()} connections
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Paper>
  );
}

function LatencyProbeControl({
  compact = false,
  status,
  hasLatency,
  loading,
  onStart,
  onStop,
}: {
  compact?: boolean;
  status: SidebarProps["latencyStatus"];
  hasLatency: boolean;
  loading: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  const probing = status === "probing";
  const label = hasLatency ? "Retest latency" : "Test latency";

  if (compact && !probing) {
    return (
      <ActionIcon
        className={classes.mobileLatencyButton}
        size={40}
        variant="default"
        color="sage"
        aria-label={label}
        title={label}
        disabled={loading}
        onClick={onStart}
      >
        <IconBolt size={17} />
      </ActionIcon>
    );
  }

  return (
    <Button
      className={compact ? classes.mobileLatencyButton : classes.latencyTestButton}
      h={compact ? 40 : undefined}
      size={compact ? undefined : "compact-sm"}
      variant={probing ? "light" : "default"}
      color={probing ? "rust" : undefined}
      px={compact ? 8 : 9}
      leftSection={
        probing ? (
          <IconPlayerStop size={compact ? 16 : 13} />
        ) : (
          <IconBolt size={13} color="var(--ds-sage)" />
        )
      }
      disabled={!probing && loading}
      onClick={probing ? onStop : onStart}
    >
      {probing ? "Stop test" : label}
    </Button>
  );
}

function LatencyInfo() {
  return (
    <Popover
      width={300}
      position="right-start"
      radius="lg"
      shadow="none"
      transitionProps={{ duration: 100 }}
      withArrow={false}
    >
      <Popover.Target>
        <ActionIcon
          size={26}
          variant="default"
          color="sky"
          aria-label="How estimated latency is computed"
          title="How estimated latency is computed"
        >
          <IconInfoCircle size={14} />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown className={classes.latencyInfo}>
        <Text size="14px" fw={750}>
          Experimental latency estimate
        </Text>
        <Text size="xs" mt={5}>
          The browser makes three direct TLS connection attempts to one relay per matching
          location, six locations at a time. Relays can observe your network egress IP and timing.
        </Text>
        <Text component="code" className={classes.latencyFormula}>
          estimated RTT = median duration ÷ 4
        </Text>
        <Text size="xs" c="var(--ds-muted)" mt={6}>
          This ranks locations; it is not ICMP ping or VPN tunnel performance. TLS currently fails
          before HTTP, but browser and Mullvad port behavior can change.
        </Text>
      </Popover.Dropdown>
    </Popover>
  );
}

function RelaySummary({
  summary,
  loading,
  updatedAt,
  cacheMeta,
}: {
  summary: SidebarProps["summary"];
  loading: boolean;
  updatedAt: string | undefined;
  cacheMeta: RelayApiResponse["meta"] | undefined;
}) {
  if (loading) return <Skeleton className={classes.summarySkeleton} height={30} />;
  if (!updatedAt) return null;

  return (
    <div className={classes.summary}>
      <Text className={classes.summaryLine}>
        <span className={classes.onlineDot} aria-hidden="true" />
        <strong>{summary.online.toLocaleString()}</strong> online of {summary.total.toLocaleString()}
        {" · "}{summary.locations} locations{" · "}{summary.countries} countries
      </Text>
      <div className={classes.summaryMeta}>
        <Text className={classes.updatedAt}>Updated {formatDate(updatedAt)}</Text>
        {cacheMeta?.cache === "stale" && (
          <Text className={classes.staleCache} role="status">
            Cached data · {formatAge(cacheMeta.ageSeconds)} old
          </Text>
        )}
      </div>
    </div>
  );
}

function LocationRows({
  locations,
  selectedKey,
  loading,
  latencyResults,
  latencyScale,
  onSelect,
}: {
  locations: ReadonlyArray<FilteredLocation>;
  selectedKey: string | null;
  loading: boolean;
  latencyResults: ReadonlyMap<string, LatencyResult>;
  latencyScale: LatencyScale | null;
  onSelect: (key: string) => void;
}) {
  if (loading) {
    return (
      <Stack gap={6}>
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} height={48} radius="md" />
        ))}
      </Stack>
    );
  }

  if (locations.length === 0) {
    return (
      <Box className={classes.empty}>
        <Text size="sm" fw={650}>
          No relays found
        </Text>
        <Text size="xs" c="var(--ds-muted)">
          Try a broader search or reset the filters.
        </Text>
      </Box>
    );
  }

  return locations.map((location) => (
    <LocationRow
      key={location.key}
      location={location}
      selected={location.key === selectedKey}
      latency={latencyResults.get(location.key)}
      latencyScale={latencyScale}
      onSelect={onSelect}
    />
  ));
}

function LocationTableHeader({
  sortKey,
  sortDirection,
  latencyAvailable,
  onSort,
}: {
  sortKey: LocationSortKey;
  sortDirection: SortDirection;
  latencyAvailable: boolean;
  onSort: (key: LocationSortKey) => void;
}) {
  const columns: ReadonlyArray<{
    key: LocationSortKey;
    label: string;
    disabled?: boolean;
  }> = [
    { key: "name", label: "Location" },
    { key: "relays", label: "Relays" },
    { key: "capacity", label: "Gbps" },
    { key: "latency", label: "ms", disabled: !latencyAvailable },
  ];

  return (
    <div className={classes.locationTableHeader}>
      <span aria-hidden="true" />
      {columns.map((column) => {
        const active = sortKey === column.key;
        return (
          <UnstyledButton
            key={column.key}
            className={classes.sortButton}
            data-active={active}
            disabled={column.disabled}
            aria-pressed={active}
            aria-label={`Sort by ${column.label}${
              active ? `, ${sortDirection === "asc" ? "ascending" : "descending"}` : ""
            }`}
            onClick={() => onSort(column.key)}
          >
            {column.label}
            {active && <span aria-hidden="true">{sortDirection === "asc" ? "↑" : "↓"}</span>}
          </UnstyledButton>
        );
      })}
    </div>
  );
}

function LocationRow({
  location,
  selected,
  latency,
  latencyScale,
  onSelect,
}: {
  location: FilteredLocation;
  selected: boolean;
  latency?: LatencyResult;
  latencyScale: LatencyScale | null;
  onSelect: (key: string) => void;
}) {
  const capacityGbps = activeListedCapacityGbps(location.servers);
  return (
    <UnstyledButton
      className={classes.locationRow}
      data-selected={selected}
      aria-current={selected ? "true" : undefined}
      aria-label={`${location.city}, ${location.country}: ${location.servers.length} relays, ${capacityGbps} Gbps listed capacity${
        latency ? `, approximately ${latency.estimatedMs} milliseconds` : ""
      }`}
      onClick={() => onSelect(location.key)}
    >
      <Text className={classes.flag} aria-hidden="true">
        {countryFlag(location.countryCode)}
      </Text>
      <Box className={classes.locationName}>
        <Text className={classes.locationCity} truncate>
          {location.city}
        </Text>
        <Text className={classes.locationCountry} truncate>
          {location.country}
        </Text>
      </Box>
      <Text className={classes.locationMetric}>{location.servers.length}</Text>
      <Text
        className={classes.locationMetric}
        title={`${capacityGbps.toLocaleString()} Gbps active listed capacity`}
      >
        {formatCapacity(capacityGbps)}
      </Text>
      <Text
        className={classes.locationMetric}
        style={
          latency && latencyScale
            ? { color: latencyColor(latency.estimatedMs, latencyScale) }
            : undefined
        }
      >
        {latency ? `~${latency.estimatedMs}` : "—"}
      </Text>
    </UnstyledButton>
  );
}


function formatCapacity(capacityGbps: number) {
  if (capacityGbps < 1_000) return `${capacityGbps}G`;
  const terabits = capacityGbps / 1_000;
  return `${terabits >= 10 ? Math.round(terabits) : terabits.toFixed(1)}T`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatAge(ageSeconds: number) {
  if (ageSeconds < 60) return "less than a minute";
  if (ageSeconds < 3_600) return `${Math.floor(ageSeconds / 60)}m`;
  if (ageSeconds < 86_400) return `${Math.floor(ageSeconds / 3_600)}h`;
  return `${Math.floor(ageSeconds / 86_400)}d`;
}

