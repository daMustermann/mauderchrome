/* global Bun */
/**
 * Minimal realtime sync server for Mauderchrome clients.
 *
 * Run:
 *   bun server/sync-server.js
 *
 * Optional env:
 *   SYNC_PORT=8787
 */

const port = Number(process.env.SYNC_PORT || 8787);
const MAX_EVENTS_PER_USER = 500;

/** @type {Map<string, { events: any[] }>} */
const userEventStore = new Map();

function getUserBucket(userId) {
    if (!userEventStore.has(userId)) {
        userEventStore.set(userId, { events: [] });
    }
    return userEventStore.get(userId);
}

function safeJsonParse(value) {
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

function appendEvent(userId, event) {
    const bucket = getUserBucket(userId);
    bucket.events.push(event);
    if (bucket.events.length > MAX_EVENTS_PER_USER) {
        bucket.events.splice(0, bucket.events.length - MAX_EVENTS_PER_USER);
    }
}

function buildSnapshot(userId) {
    const bucket = getUserBucket(userId);
    return {
        type: 'snapshot',
        userId,
        protocolVersion: 1,
        events: bucket.events,
        generatedAt: Date.now(),
    };
}

const server = Bun.serve({
    port,
    fetch(req, srv) {
        const url = new URL(req.url);

        if (url.pathname === '/health') {
            return new Response(JSON.stringify({ ok: true, protocolVersion: 1 }), {
                headers: { 'content-type': 'application/json' },
            });
        }

        if (url.pathname === '/ws') {
            const upgraded = srv.upgrade(req, {
                data: {
                    userId: null,
                    deviceId: null,
                },
            });
            if (upgraded) {
                return;
            }
            return new Response('WebSocket upgrade failed', { status: 400 });
        }

        return new Response('Not found', { status: 404 });
    },
    websocket: {
        open(ws) {
            ws.send(
                JSON.stringify({
                    type: 'welcome',
                    protocolVersion: 1,
                    message: 'Send a hello message to join a user channel.',
                })
            );
        },
        message(ws, rawMessage) {
            const message = safeJsonParse(typeof rawMessage === 'string' ? rawMessage : rawMessage.toString());
            if (!message || typeof message !== 'object') return;

            if (message.type === 'hello') {
                const userId = String(message.userId || 'default');
                const deviceId = String(message.deviceId || 'unknown');
                ws.data.userId = userId;
                ws.data.deviceId = deviceId;
                ws.subscribe(`user:${userId}`);
                ws.send(JSON.stringify(buildSnapshot(userId)));
                return;
            }

            if (message.type !== 'event') return;
            if (!ws.data.userId) return;

            const event = {
                type: 'event',
                userId: ws.data.userId,
                deviceId: message.deviceId || ws.data.deviceId || 'unknown',
                eventId: message.eventId || crypto.randomUUID(),
                eventType: message.eventType,
                payload: message.payload,
                timestamp: Number(message.timestamp || Date.now()),
                protocolVersion: 1,
            };

            appendEvent(ws.data.userId, event);
            server.publish(`user:${ws.data.userId}`, JSON.stringify(event));
        },
        close() {},
    },
});

console.log(`[sync-server] listening on ws://localhost:${server.port}/ws`);
