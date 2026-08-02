import { Button, Group, SegmentedControl, Select, Stack, Switch, Text } from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";
import type { FilterState } from "../shared/relay";
import classes from "./FilterControls.module.css";

type FilterControlsProps = {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  onReset: () => void;
  showReset: boolean;
};

export function FilterControls({
  filters,
  onChange,
  onReset,
  showReset,
}: FilterControlsProps) {
  return (
    <Stack gap={7} aria-label="Relay filters">
      <FilterRow label="Status">
        <SegmentedControl
          fullWidth
          size="xs"
          value={filters.status}
          onChange={(status) =>
            onChange({ ...filters, status: status as FilterState["status"] })
          }
          data={[
            { value: "all", label: "All" },
            { value: "online", label: "Online" },
            { value: "offline", label: "Offline" },
          ]}
        />
      </FilterRow>

      <FilterRow label="Type">
        <SegmentedControl
          fullWidth
          size="xs"
          value={filters.type}
          onChange={(type) => onChange({ ...filters, type: type as FilterState["type"] })}
          data={[
            { value: "all", label: "All" },
            { value: "wireguard", label: "WireGuard" },
            { value: "bridge", label: "Bridge" },
          ]}
        />
      </FilterRow>

      <Group grow align="end" wrap="nowrap">
        <Select
          label="Ownership"
          size="xs"
          allowDeselect={false}
          value={filters.ownership}
          onChange={(ownership) =>
            onChange({
              ...filters,
              ownership: (ownership ?? "all") as FilterState["ownership"],
            })
          }
          data={[
            { value: "all", label: "All servers" },
            { value: "owned", label: "Mullvad owned" },
            { value: "rented", label: "Rented" },
          ]}
        />
        <Switch
          className={classes.switch}
          label="DAITA only"
          size="xs"
          checked={filters.daitaOnly}
          onChange={(event) =>
            onChange({ ...filters, daitaOnly: event.currentTarget.checked })
          }
        />
      </Group>

      {showReset && (
        <Button
          variant="subtle"
          size="compact-sm"
          leftSection={<IconRefresh size={13} />}
          onClick={onReset}
          className={classes.reset}
        >
          Reset all filters
        </Button>
      )}
    </Stack>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={classes.row}>
      <Text className={classes.label}>{label}</Text>
      {children}
    </div>
  );
}
