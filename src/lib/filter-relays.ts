import type {
  FilteredLocation,
  FilterState,
  RelayLocation,
  RelayServer,
} from "../shared/relay";

export function filterLocations(
  locations: ReadonlyArray<RelayLocation>,
  filters: FilterState,
): ReadonlyArray<FilteredLocation> {
  const query = filters.query.trim().toLocaleLowerCase();

  return locations.flatMap((location) => {
    const locationMatches = [location.city, location.country, location.key]
      .join(" ")
      .toLocaleLowerCase()
      .includes(query);
    const servers = location.servers.filter(
      (server) => matchesServer(server, filters, query, locationMatches),
    );

    return servers.length > 0 ? [{ ...location, servers }] : [];
  });
}

export function summarizeLocations(locations: ReadonlyArray<FilteredLocation>) {
  const servers = locations.flatMap((location) => location.servers);
  return {
    total: servers.length,
    online: servers.filter((server) => server.active).length,
    locations: locations.length,
    countries: new Set(locations.map((location) => location.countryCode)).size,
  };
}

export function hasActiveFilters(filters: FilterState) {
  return Boolean(
    filters.query ||
      filters.status !== "all" ||
      filters.type !== "all" ||
      filters.ownership !== "all" ||
      filters.daitaOnly,
  );
}

function matchesServer(
  server: RelayServer,
  filters: FilterState,
  query: string,
  locationMatches: boolean,
) {
  if (filters.status === "online" && !server.active) return false;
  if (filters.status === "offline" && server.active) return false;
  if (filters.type !== "all" && server.type !== filters.type) return false;
  if (filters.ownership === "owned" && !server.owned) return false;
  if (filters.ownership === "rented" && server.owned) return false;
  if (filters.daitaOnly && !server.daita) return false;
  if (!query || locationMatches) return true;

  return [server.hostname, server.provider, server.ipv4, server.ipv6 ?? ""]
    .join(" ")
    .toLocaleLowerCase()
    .includes(query);
}
