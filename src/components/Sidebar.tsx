import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Drawer,
  Group,
  Loader,
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
  IconSearch,
  IconWorldPin,
} from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { countryFlag } from "../lib/country-flag";
import { hasActiveFilters } from "../lib/filter-relays";
import {
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
  isMobile: boolean;
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
  isMobile,
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
}: SidebarProps) {
  const hasLatency = latencyResults.size > 0;
  const [sortKey, setSortKey] = useState<LocationSortKey>("relays");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [mobileLocationsOpened, setMobileLocationsOpened] = useState(false);
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

  useEffect(() => {
    if (!isMobile) setMobileLocationsOpened(false);
  }, [isMobile]);

  const changeSort = (key: LocationSortKey) => {
    if (key === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection(key === "name" || key === "latency" ? "asc" : "desc");
  };

  const testLatency = () => {
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
        />

        <Group className={classes.searchToolbar} gap="sm" mt="md" wrap="nowrap">
          <TextInput
            className={classes.search}
            label="Search relays"
            aria-label="Search relays"
            placeholder={isMobile ? "Search relays…" : "City, country, provider, hostname…"}
            leftSection={<IconSearch size={16} />}
            rightSection={!isMobile ? <Text className={classes.hotkey}>/</Text> : undefined}
            value={filters.query}
            onChange={(event) => onFiltersChange({ ...filters, query: event.currentTarget.value })}
          />
          {isMobile && (
            <>
              <ActionIcon
                size={40}
                variant="default"
                color="sage"
                aria-label={`Browse ${locations.length} location${locations.length === 1 ? "" : "s"}`}
                title="Browse locations"
                disabled={loading}
                onClick={() => setMobileLocationsOpened(true)}
              >
                <IconList size={18} />
              </ActionIcon>
              <LatencyProbeControl
                isMobile
                status={latencyStatus}
                hasLatency={hasLatency}
                loading={loading}
                onStart={testLatency}
              />
              <LatencyInfo isMobile />
              <ActionIcon
                size={40}
                variant="default"
                aria-label="Open relay filters"
                onClick={onOpenMobileFilters}
              >
                <IconAdjustmentsHorizontal size={18} />
              </ActionIcon>
            </>
          )}
        </Group>

        {!isMobile && (
          <Box mt="sm">
            <FilterControls
              filters={filters}
              onChange={onFiltersChange}
              onReset={onResetFilters}
              showReset={hasActiveFilters(filters)}
            />
          </Box>
        )}

        {isMobile && bestLocation && bestLatency && (
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
          <Text className={classes.latencyError} mt={isMobile ? 6 : 8}>
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

        {!isMobile && (
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
                    loading={loading}
                    onStart={testLatency}
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

      {isMobile && (
        <Drawer
          opened={mobileLocationsOpened}
          onClose={() => setMobileLocationsOpened(false)}
          position="bottom"
          size="80%"
          offset={8}
          radius="lg"
          title={`Locations · ${locations.length}`}
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
    </Paper>
  );
}

function LatencyProbeControl({
  isMobile = false,
  status,
  hasLatency,
  loading,
  onStart,
}: {
  isMobile?: boolean;
  status: SidebarProps["latencyStatus"];
  hasLatency: boolean;
  loading: boolean;
  onStart: () => void;
}) {
  const probing = status === "probing";
  const label = hasLatency ? "Retest latency" : "Test latency";

  return isMobile ? (
    <Button
      className={classes.mobileLatencyButton}
      h={40}
      variant="light"
      color="sage"
      px={7}
      leftSection={probing ? <Loader size={14} /> : <IconBolt size={16} />}
      aria-label={probing ? "Testing relay latency" : label}
      title={probing ? "Testing relay latency" : label}
      disabled={loading || probing}
      onClick={onStart}
    >
      {probing ? "Testing" : hasLatency ? "Retest" : "Test"}
    </Button>
  ) : (
    <Button
      className={classes.latencyTestButton}
      size="compact-sm"
      variant="default"
      px={9}
      leftSection={
        probing ? <Loader size={11} /> : <IconBolt size={13} color="var(--ds-sage)" />
      }
      disabled={loading || probing}
      onClick={onStart}
    >
      {probing ? "Testing" : label}
    </Button>
  );
}

function LatencyInfo({ isMobile = false }: { isMobile?: boolean }) {
  return (
    <Popover
      width={300}
      position={isMobile ? "bottom-end" : "right-start"}
      radius="lg"
      shadow="none"
      transitionProps={{ duration: 100 }}
      withArrow={false}
    >
      <Popover.Target>
        <ActionIcon
          size={isMobile ? 40 : 26}
          variant={isMobile ? "subtle" : "default"}
          color="sky"
          aria-label="How estimated latency is computed"
          title="How estimated latency is computed"
        >
          <IconInfoCircle size={isMobile ? 18 : 14} />
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
}: {
  summary: SidebarProps["summary"];
  loading: boolean;
  updatedAt: string | undefined;
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
      <Text className={classes.updatedAt}>Updated {formatDate(updatedAt)}</Text>
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

