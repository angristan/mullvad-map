import {
  Accordion,
  Badge,
  Box,
  Drawer,
  Group,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconBolt, IconServer } from "@tabler/icons-react";
import { countryFlag } from "../lib/country-flag";
import type { LatencyResult } from "../lib/latency";
import type { FilteredLocation, RelayServer } from "../shared/relay";
import classes from "./LocationDetails.module.css";

type LocationDetailsProps = {
  location: FilteredLocation | null;
  opened: boolean;
  onClose: () => void;
  isMobile: boolean;
  latency: LatencyResult | null;
};

export function LocationDetails({
  location,
  opened,
  onClose,
  isMobile,
  latency,
}: LocationDetailsProps) {
  if (!location) return null;

  const online = location.servers.filter((server) => server.active).length;
  const owned = location.servers.filter((server) => server.owned).length;
  const providers = new Set(location.servers.map((server) => server.provider)).size;

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position={isMobile ? "bottom" : "right"}
      size={isMobile ? "62%" : 440}
      offset={isMobile ? 8 : 12}
      radius="lg"
      withOverlay={false}
      trapFocus={false}
      lockScroll={false}
      closeOnClickOutside={false}
      returnFocus={false}
      title={
        <Group gap="sm" wrap="nowrap">
          <Text className={classes.flag} aria-hidden="true">
            {countryFlag(location.countryCode)}
          </Text>
          <div>
            <Text className={classes.country}>{location.country}</Text>
            <Title order={2} className={classes.city}>
              {location.city}
            </Title>
          </div>
        </Group>
      }
      classNames={{ content: classes.content, header: classes.header, body: classes.body }}
    >
      <Stack gap="md" h="100%">
        <SimpleGrid cols={4} spacing="xs" className={classes.summaryGrid}>
          <Summary value={location.servers.length} label="Relays" />
          <Summary value={online} label="Online" />
          <Summary value={owned} label="Owned" />
          <Summary value={providers} label={providers === 1 ? "Provider" : "Providers"} />
        </SimpleGrid>

        {latency && (
          <Paper className={classes.latencyCard} p="sm" radius="sm">
            <Group justify="space-between" wrap="nowrap">
              <Group gap="sm" wrap="nowrap">
                <IconBolt size={18} />
                <div>
                  <Text className={classes.latencyLabel}>Estimated latency</Text>
                  <Text size="13px" c="var(--ds-muted)" fw={600}>
                    Tested via {latency.serverHostname}
                  </Text>
                </div>
              </Group>
              <Text className={classes.latencyValue}>~{latency.estimatedMs} ms</Text>
            </Group>
          </Paper>
        )}

        <ScrollArea className={classes.scroll} scrollbarSize={6} type="hover">
          <Accordion variant="default" radius="sm">
            {location.servers.map((server) => (
              <ServerItem key={server.hostname} server={server} />
            ))}
          </Accordion>
        </ScrollArea>
      </Stack>
    </Drawer>
  );
}

function Summary({ value, label }: { value: number; label: string }) {
  return (
    <Box>
      <Text className={classes.summaryValue}>{value}</Text>
      <Text className={classes.summaryLabel}>{label}</Text>
    </Box>
  );
}

function ServerItem({ server }: { server: RelayServer }) {
  return (
    <Accordion.Item value={server.hostname} className={classes.serverItem}>
      <Accordion.Control
        icon={<span className={classes.status} data-online={server.active} aria-hidden="true" />}
        className={classes.serverControl}
      >
        <Group justify="space-between" gap="xs" wrap="nowrap">
          <Box className={classes.serverName}>
            <Text size="sm" fw={750} truncate>
              {server.hostname}
            </Text>
            <Text size="13px" c="var(--ds-muted)" fw={600} truncate>
              {server.provider}
            </Text>
          </Box>
          <Group gap={7} wrap="nowrap">
            <Text className={classes.statusText} data-online={server.active}>
              {server.active ? "Online" : "Offline"}
            </Text>
            <Text size="13px" c="var(--ds-muted)" fw={650} className={classes.speed}>
              {server.speedGbps} Gbps
            </Text>
          </Group>
        </Group>
      </Accordion.Control>
      <Accordion.Panel>
        <Stack gap="sm">
          <Group gap={5}>
            <Badge size="sm" variant="light">
              {server.type === "wireguard" ? "WireGuard" : "Bridge"}
            </Badge>
            <Badge size="sm" variant="light" color={server.owned ? "sage" : "gray"}>
              {server.owned ? "Owned" : "Rented"}
            </Badge>
            {server.daita && (
              <Badge size="sm" variant="light" color="teal">
                DAITA
              </Badge>
            )}
          </Group>

          <Stack gap={5}>
            <DataRow label="IPv4" value={server.ipv4} />
            {server.ipv6 && <DataRow label="IPv6" value={server.ipv6} />}
            <DataRow label="Boot" value={server.stboot ? "Verified STBoot" : "Standard"} />
          </Stack>

          {server.messages.map((message, index) => (
            <Group key={`${server.hostname}-${index}`} gap="xs" className={classes.notice}>
              <IconServer size={14} />
              <Text size="sm">{message}</Text>
            </Group>
          ))}
        </Stack>
      </Accordion.Panel>
    </Accordion.Item>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <Group gap="sm" wrap="nowrap">
      <Text className={classes.dataLabel}>{label}</Text>
      <Text className={classes.dataValue} truncate>
        {value}
      </Text>
    </Group>
  );
}
