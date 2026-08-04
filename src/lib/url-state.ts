import type { FilterState } from "../shared/relay";

export const DEFAULT_FILTERS: FilterState = {
  query: "",
  status: "all",
  type: "all",
  ownership: "all",
  daitaOnly: false,
};

type AppUrlState = {
  filters: FilterState;
  selectedKey: string | null;
};

const APP_QUERY_KEYS = ["q", "status", "type", "ownership", "daita", "location"] as const;

export function parseAppUrlState(search: string): AppUrlState {
  const params = new URLSearchParams(search);
  const status = params.get("status");
  const type = params.get("type");
  const ownership = params.get("ownership");
  const selectedKey = params.get("location")?.trim() || null;

  return {
    filters: {
      query: params.get("q") ?? DEFAULT_FILTERS.query,
      status: status === "online" || status === "offline" ? status : DEFAULT_FILTERS.status,
      type: type === "wireguard" || type === "bridge" ? type : DEFAULT_FILTERS.type,
      ownership:
        ownership === "owned" || ownership === "rented"
          ? ownership
          : DEFAULT_FILTERS.ownership,
      daitaOnly: params.get("daita") === "1",
    },
    selectedKey,
  };
}

export function serializeAppUrlState(search: string, state: AppUrlState) {
  const params = new URLSearchParams(search);
  for (const key of APP_QUERY_KEYS) params.delete(key);

  if (state.filters.query) params.set("q", state.filters.query);
  if (state.filters.status !== DEFAULT_FILTERS.status) {
    params.set("status", state.filters.status);
  }
  if (state.filters.type !== DEFAULT_FILTERS.type) params.set("type", state.filters.type);
  if (state.filters.ownership !== DEFAULT_FILTERS.ownership) {
    params.set("ownership", state.filters.ownership);
  }
  if (state.filters.daitaOnly) params.set("daita", "1");
  if (state.selectedKey) params.set("location", state.selectedKey);

  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}
