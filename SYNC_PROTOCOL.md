# Realtime Sync MVP (Web + Android)

This document defines the MVP protocol used by `js/realtime-sync.js` and `server/sync-server.js`.

## Goal

Keep clients in sync for:

- playback state (`play/pause/seek/current track/queue`)
- likes
- playlists
- listening history

## Transport

- WebSocket endpoint: `/ws`
- Health endpoint: `/health`
- Protocol version: `1`

## Client Config (current MVP)

The client reads localStorage keys:

- `monochrome-sync-enabled`: `"true"` to enable sync
- `monochrome-sync-ws-url`: e.g. `ws://192.168.1.10:8787/ws` or `wss://music.tailnet.ts.net/ws`
- `monochrome-sync-user-id`: shared user id across devices (default: `default`)

## Message Types

### `hello` (client -> server)

```json
{
  "type": "hello",
  "userId": "my-user",
  "deviceId": "uuid",
  "protocolVersion": 1
}
```

### `snapshot` (server -> client)

Server returns buffered recent events for this user after `hello`.

### `event` (bidirectional)

```json
{
  "type": "event",
  "eventId": "device:timestamp:counter",
  "eventType": "playback_state",
  "payload": {},
  "userId": "my-user",
  "deviceId": "uuid",
  "timestamp": 1710000000000
}
```

## Event Types

- `playback_state`
  - payload: `{ queue, currentQueueIndex, currentTrackId, isPlaying, positionSeconds, updatedAt }`
- `favorite_change`
  - payload: `{ action: "add" | "remove", type, key, item }`
- `playlist_change`
  - payload: `{ action: "create" | "update" | "delete", playlist }`
- `history_add`
  - payload: `{ action: "add", track }`

## Conflict Behavior (MVP)

- Playback: last event wins.
- Favorites: idempotent apply by checking current favorite state first.
- Playlist: upsert by playlist id, delete by id.
- History: append entries.

## Run the Sync Server

```bash
bun server/sync-server.js
```

Optional:

```bash
SYNC_PORT=8787 bun server/sync-server.js
```
