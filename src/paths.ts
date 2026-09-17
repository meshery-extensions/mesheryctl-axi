/** Meshery Server API paths used by mesheryctl list commands (see mesheryctl list.go). */
export const API = {
  connections: "api/integrations/connections",
  designs: "api/pattern",
  models: "api/registry/models",
  components: "api/registry/components",
  /** Unauthenticated version probe used for structured system status. */
  version: "api/system/version",
} as const;
