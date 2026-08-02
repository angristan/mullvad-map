export type ServerType = "wireguard" | "bridge";

export type RelayServer = {
  hostname: string;
  active: boolean;
  owned: boolean;
  provider: string;
  ipv4: string;
  ipv6: string | null;
  speedGbps: number;
  stboot: boolean;
  type: ServerType;
  daita: boolean;
  messages: ReadonlyArray<string>;
};

export type RelayLocation = {
  key: string;
  countryCode: string;
  country: string;
  cityCode: string;
  city: string;
  latitude: number;
  longitude: number;
  servers: ReadonlyArray<RelayServer>;
};

export type RelaySnapshot = {
  generatedAt: string;
  sourceUpdatedAt: string;
  locations: ReadonlyArray<RelayLocation>;
};

export type RelayApiResponse = {
  data: RelaySnapshot;
  meta: {
    cache: "hit" | "miss" | "stale";
    ageSeconds: number;
  };
};

export type LatencyCandidatesResponse = {
  locationKeys: ReadonlyArray<string>;
  basis: "edge" | "global";
};

export type ApiErrorResponse = {
  error: {
    code: "rate_limited" | "upstream_unavailable" | "internal_error";
    message: string;
  };
};

export type FilterState = {
  query: string;
  status: "all" | "online" | "offline";
  type: "all" | ServerType;
  ownership: "all" | "owned" | "rented";
  daitaOnly: boolean;
};

export type FilteredLocation = Omit<RelayLocation, "servers"> & {
  servers: ReadonlyArray<RelayServer>;
};
