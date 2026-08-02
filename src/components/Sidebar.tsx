import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Loader,
  Paper,
  Popover,
  ScrollArea,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
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
  IconSearch,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";
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
    <Paper component="aside" className={classes.panel} radius="md" p="md">
      <Stack gap={0} h="100%">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <ThemeIcon className={classes.brandMark} size={36} radius="sm">
              M
            </ThemeIcon>
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
              size={32}
              variant="subtle"
              color="gray"
              aria-label="View source code on GitHub"
              title="View source code on GitHub"
            >
              <IconBrandGithub size={19} />
            </ActionIcon>
          </Group>
        </Group>

        <Box className={classes.hero}>
          {loading ? (
            <Skeleton height={13} width="70%" mt={5} />
          ) : response ? (
            <Group gap={6} mt={4}>
              <Text size="xs" c="dark.2">
                {summary.total.toLocaleString()} relays · updated {formatDate(response.data.sourceUpdatedAt)}
              </Text>
            </Group>
          ) : null}
        </Box>

        <Divider opacity={0.55} />
        <SimpleGrid cols={3} spacing={0} className={classes.stats}>
          <Stat value={summary.online} label="Online" online loading={loading} />
          <Stat value={summary.locations} label="Locations" loading={loading} />
          <Stat value={summary.countries} label="Countries" loading={loading} />
        </SimpleGrid>
        <Divider opacity={0.55} />

        <Group gap="xs" mt="sm" wrap="nowrap">
          <TextInput
            className={classes.search}
            aria-label="Search relays"
            placeholder={isMobile ? "Search relays…" : "City, country, provider, hostname…"}
            leftSection={<IconSearch size={16} />}
            rightSection={!isMobile ? <Text className={classes.hotkey}>/</Text> : undefined}
            value={filters.query}
            onChange={(event) => onFiltersChange({ ...filters, query: event.currentTarget.value })}
          />
          {isMobile && (
            <>
              <LatencyProbeControl
                isMobile
                status={latencyStatus}
                hasLatency={hasLatency}
                loading={loading}
                onStart={testLatency}
              />
              <LatencyInfo isMobile />
              <ActionIcon
                size={36}
                variant="light"
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
            <Badge size="sm" color="relay" variant="light">
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
          <Stack className={classes.locations} gap={0} mt="sm">
            <Group className={classes.locationsHeader} justify="space-between" wrap="nowrap">
              <Text className={classes.sectionTitle}>Locations</Text>
              <Group gap="sm" wrap="nowrap">
                <Text size="12px" c="gray.5" fw={650}>
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
              {loading ? (
                <Stack gap={6}>
                  {Array.from({ length: 5 }, (_, index) => (
                    <Skeleton key={index} height={48} radius="md" />
                  ))}
                </Stack>
              ) : sorted.length > 0 ? (
                sorted.map((location) => (
                  <LocationRow
                    key={location.key}
                    location={location}
                    latency={latencyResults.get(location.key)}
                    latencyScale={latencyScale}
                    onSelect={onSelect}
                  />
                ))
              ) : (
                <Paper p="md" radius="md" className={classes.empty}>
                  <Text size="sm" fw={650}>
                    No relays found
                  </Text>
                  <Text size="xs" c="dark.2">
                    Try a broader search or reset the filters.
                  </Text>
                </Paper>
              )}
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
    <ActionIcon
      size={36}
      variant="light"
      color="relay"
      aria-label={probing ? "Testing relay latency" : label}
      title={probing ? "Testing relay latency" : label}
      disabled={loading || probing}
      onClick={onStart}
    >
      {probing ? <Loader size={15} /> : <IconBolt size={18} />}
    </ActionIcon>
  ) : (
    <Button
      className={classes.latencyTestButton}
      size="compact-sm"
      variant="default"
      px={9}
      leftSection={
        probing ? <Loader size={11} /> : <IconBolt size={13} color="#57e389" />
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
      radius="sm"
      shadow="none"
      transitionProps={{ duration: 100 }}
      withArrow={false}
    >
      <Popover.Target>
        <ActionIcon
          size={isMobile ? 36 : 24}
          variant={isMobile ? "light" : "subtle"}
          color="gray"
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
        <Text size="xs" c="dark.2" mt={6}>
          This ranks locations; it is not ICMP ping or VPN tunnel performance. TLS currently fails
          before HTTP, but browser and Mullvad port behavior can change.
        </Text>
      </Popover.Dropdown>
    </Popover>
  );
}

function Stat({
  value,
  label,
  online = false,
  loading,
}: {
  value: number;
  label: string;
  online?: boolean;
  loading: boolean;
}) {
  return (
    <Box className={classes.stat}>
      {loading ? <Skeleton height={26} width={54} /> : <Text className={classes.statValue}>{value}</Text>}
      <Group gap={5} wrap="nowrap">
        {online && <span className={classes.onlineDot} />}
        <Text className={classes.statLabel}>{label}</Text>
      </Group>
    </Box>
  );
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
  latency,
  latencyScale,
  onSelect,
}: {
  location: FilteredLocation;
  latency?: LatencyResult;
  latencyScale: LatencyScale | null;
  onSelect: (key: string) => void;
}) {
  const capacityGbps = activeListedCapacityGbps(location.servers);
  return (
    <UnstyledButton
      className={classes.locationRow}
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

