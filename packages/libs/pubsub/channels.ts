// packages/libs/pubsub/channels.ts
// Central list of pubsub channel names used across services.
// Use these constants to keep publisher/subscriber channel names consistent.
export const CHANNEL_WORKER = 'worker' as const;
export const CHANNEL_WEBSOCKET = 'web_socket' as const;

// Strongly-typed union of allowed channel names. Use `PubSubChannel` in
// method signatures to ensure callers pass one of the known channels.
export type PubSubChannel = typeof CHANNEL_WORKER | typeof CHANNEL_WEBSOCKET;

// Add more channels here as needed in the future and extend `PubSubChannel`.
