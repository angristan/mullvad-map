import { Schema } from "effect";

const CoordinateSchema = Schema.Struct({
  country: Schema.String,
  city: Schema.String,
  latitude: Schema.Number,
  longitude: Schema.Number,
});

export const CoordinatesResponseSchema = Schema.Struct({
  locations: Schema.Record(Schema.String, CoordinateSchema),
});

export const RawServerSchema = Schema.Struct({
  hostname: Schema.String,
  country_code: Schema.String,
  country_name: Schema.String,
  city_code: Schema.String,
  city_name: Schema.String,
  active: Schema.Boolean,
  owned: Schema.Boolean,
  provider: Schema.String,
  ipv4_addr_in: Schema.String,
  ipv6_addr_in: Schema.NullOr(Schema.String),
  network_port_speed: Schema.Number,
  stboot: Schema.Boolean,
  type: Schema.Literals(["wireguard", "bridge"]),
  status_messages: Schema.Array(Schema.Unknown),
  daita: Schema.optional(Schema.NullOr(Schema.Boolean)),
});

export const RawServersSchema = Schema.Array(RawServerSchema);

const RelayServerSchema = Schema.Struct({
  hostname: Schema.String,
  active: Schema.Boolean,
  owned: Schema.Boolean,
  provider: Schema.String,
  ipv4: Schema.String,
  ipv6: Schema.NullOr(Schema.String),
  speedGbps: Schema.Number,
  stboot: Schema.Boolean,
  type: Schema.Literals(["wireguard", "bridge"]),
  daita: Schema.Boolean,
  messages: Schema.Array(Schema.String),
});

const RelayLocationSchema = Schema.Struct({
  key: Schema.String,
  countryCode: Schema.String,
  country: Schema.String,
  cityCode: Schema.String,
  city: Schema.String,
  latitude: Schema.Number,
  longitude: Schema.Number,
  servers: Schema.Array(RelayServerSchema),
});

export const RelaySnapshotSchema = Schema.Struct({
  generatedAt: Schema.String,
  sourceUpdatedAt: Schema.String,
  locations: Schema.Array(RelayLocationSchema),
});

export const CachedRelayRecordSchema = Schema.Struct({
  expiresAt: Schema.Number,
  snapshot: RelaySnapshotSchema,
});

export type CoordinatesResponse = typeof CoordinatesResponseSchema.Type;
export type RawServer = typeof RawServerSchema.Type;
export type CachedRelayRecord = typeof CachedRelayRecordSchema.Type;
