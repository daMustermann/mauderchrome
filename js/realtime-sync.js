import { db } from './db.js';

const SYNC_ENABLED_KEY = 'monochrome-sync-enabled';
const SYNC_WS_URL_KEY = 'monochrome-sync-ws-url';
const SYNC_USER_ID_KEY = 'monochrome-sync-user-id';
const SYNC_DEVICE_ID_KEY = 'monochrome-sync-device-id';

function getOrCreateDeviceId() {
    let id = localStorage.getItem(SYNC_DEVICE_ID_KEY);
    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem(SYNC_DEVICE_ID_KEY, id);
    }
    return id;
}

function clampNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

export function getRealtimeSyncConfig() {
    return {
        enabled: localStorage.getItem(SYNC_ENABLED_KEY) === 'true',
        wsUrl: (localStorage.getItem(SYNC_WS_URL_KEY) || '').trim(),
        userId: (localStorage.getItem(SYNC_USER_ID_KEY) || 'default').trim() || 'default',
    };
}

export class RealtimeSyncClient {
    constructor(player) {
        this.player = player;
        this.socket = null;
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.eventCounter = 0;
        this.lastStateSentAt = 0;
        this.lastLocalTimeBroadcastAt = 0;
        this.isApplyingRemote = false;
        this.deviceId = getOrCreateDeviceId();
        this.boundListeners = [];
        this.methodUnpatchers = [];
    }

    start() {
        const config = getRealtimeSyncConfig();
        if (!config.enabled || !config.wsUrl) {
            return;
        }

        this.config = config;
        this.connect();
        this.bindLocalEvents();
    }

    stop() {
        this.unbindLocalEvents();
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
    }

    connect() {
        if (!this.config?.wsUrl) return;
        if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
            return;
        }

        try {
            this.socket = new WebSocket(this.config.wsUrl);
        } catch (error) {
            console.error('[Sync] Failed to create websocket:', error);
            this.scheduleReconnect();
            return;
        }

        this.socket.addEventListener('open', () => {
            this.reconnectAttempts = 0;
            this.send({
                type: 'hello',
                userId: this.config.userId,
                deviceId: this.deviceId,
                protocolVersion: 1,
            });
            this.sendPlaybackState('initial-sync');
        });

        this.socket.addEventListener('message', (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleMessage(message);
            } catch (error) {
                console.warn('[Sync] Invalid message payload:', error);
            }
        });

        this.socket.addEventListener('close', () => {
            this.scheduleReconnect();
        });

        this.socket.addEventListener('error', (error) => {
            console.warn('[Sync] Socket error:', error);
        });
    }

    scheduleReconnect() {
        if (this.reconnectTimer) return;

        const backoffMs = Math.min(30000, 1000 * Math.pow(2, this.reconnectAttempts));
        this.reconnectAttempts += 1;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, backoffMs);
    }

    bindLocalEvents() {
        const el = this.player.activeElement;

        const onPlay = () => this.sendPlaybackState('play');
        const onPause = () => this.sendPlaybackState('pause');
        const onSeeked = () => this.sendPlaybackState('seeked');
        const onTimeUpdate = () => {
            if (this.isApplyingRemote) return;
            const now = Date.now();
            if (now - this.lastLocalTimeBroadcastAt < 1500) return;
            this.lastLocalTimeBroadcastAt = now;
            this.sendPlaybackState('tick');
        };

        el.addEventListener('play', onPlay);
        el.addEventListener('pause', onPause);
        el.addEventListener('seeked', onSeeked);
        el.addEventListener('timeupdate', onTimeUpdate);
        this.boundListeners.push([el, 'play', onPlay], [el, 'pause', onPause], [el, 'seeked', onSeeked], [el, 'timeupdate', onTimeUpdate]);

        const onFavoriteChanged = (event) => {
            if (this.isApplyingRemote) return;
            const detail = event.detail;
            if (!detail) return;
            this.sendEvent('favorite_change', detail);
        };
        const onHistoryChanged = (event) => {
            if (this.isApplyingRemote) return;
            const detail = event.detail;
            if (!detail) return;
            this.sendEvent('history_add', detail);
        };
        const onPlaylistChanged = (event) => {
            if (this.isApplyingRemote) return;
            const detail = event.detail;
            if (!detail) return;
            this.sendEvent('playlist_change', detail);
        };

        window.addEventListener('sync-favorite-change', onFavoriteChanged);
        window.addEventListener('sync-history-change', onHistoryChanged);
        window.addEventListener('sync-playlist-change', onPlaylistChanged);
        this.boundListeners.push(
            [window, 'sync-favorite-change', onFavoriteChanged],
            [window, 'sync-history-change', onHistoryChanged],
            [window, 'sync-playlist-change', onPlaylistChanged]
        );

        const methodsThatMutatePlayback = [
            'setQueue',
            'addToQueue',
            'addNextToQueue',
            'removeFromQueue',
            'clearQueue',
            'wipeQueue',
            'moveInQueue',
            'toggleShuffle',
            'toggleRepeat',
            'playNext',
            'playPrev',
            'playAtIndex',
        ];

        for (const methodName of methodsThatMutatePlayback) {
            const original = this.player[methodName];
            if (typeof original !== 'function') continue;

            const patched = (...args) => {
                const result = original.apply(this.player, args);
                Promise.resolve(result).finally(() => {
                    if (!this.isApplyingRemote) {
                        this.sendPlaybackState(`method:${methodName}`);
                    }
                });
                return result;
            };
            this.player[methodName] = patched;
            this.methodUnpatchers.push(() => {
                this.player[methodName] = original;
            });
        }
    }

    unbindLocalEvents() {
        for (const [target, eventName, handler] of this.boundListeners) {
            target.removeEventListener(eventName, handler);
        }
        this.boundListeners = [];

        for (const unpatch of this.methodUnpatchers) {
            unpatch();
        }
        this.methodUnpatchers = [];
    }

    buildPlaybackState() {
        const currentQueue = this.player.getCurrentQueue();
        const currentTrack = currentQueue[this.player.currentQueueIndex] || null;
        const activeElement = this.player.activeElement;

        return {
            queue: currentQueue,
            currentQueueIndex: this.player.currentQueueIndex,
            currentTrackId: currentTrack?.id || null,
            isPlaying: !activeElement.paused,
            positionSeconds: clampNumber(activeElement.currentTime, 0),
            updatedAt: Date.now(),
        };
    }

    sendPlaybackState(reason = 'unknown') {
        if (this.isApplyingRemote) return;
        const now = Date.now();
        if (reason === 'tick' && now - this.lastStateSentAt < 1200) return;
        this.lastStateSentAt = now;
        this.sendEvent('playback_state', this.buildPlaybackState());
    }

    sendEvent(eventType, payload) {
        this.send({
            type: 'event',
            eventId: `${this.deviceId}:${Date.now()}:${this.eventCounter++}`,
            eventType,
            payload,
            userId: this.config?.userId || 'default',
            deviceId: this.deviceId,
            timestamp: Date.now(),
        });
    }

    send(message) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
        this.socket.send(JSON.stringify(message));
    }

    async handleMessage(message) {
        if (!message || typeof message !== 'object') return;
        if (message.deviceId && message.deviceId === this.deviceId) return;

        if (message.type === 'snapshot') {
            const events = Array.isArray(message.events) ? message.events : [];
            for (const evt of events) {
                await this.applyRemoteEvent(evt);
            }
            return;
        }

        if (message.type === 'event') {
            await this.applyRemoteEvent(message);
        }
    }

    async applyRemoteEvent(event) {
        const eventType = event.eventType;
        const payload = event.payload;
        if (!eventType) return;

        this.isApplyingRemote = true;
        try {
            if (eventType === 'playback_state') {
                await this.applyRemotePlaybackState(payload);
                return;
            }
            if (eventType === 'favorite_change') {
                await this.applyRemoteFavorite(payload);
                return;
            }
            if (eventType === 'history_add') {
                await this.applyRemoteHistory(payload);
                return;
            }
            if (eventType === 'playlist_change') {
                await this.applyRemotePlaylist(payload);
            }
        } catch (error) {
            console.warn(`[Sync] Failed to apply event "${eventType}":`, error);
        } finally {
            this.isApplyingRemote = false;
        }
    }

    async applyRemotePlaybackState(state) {
        if (!state || !Array.isArray(state.queue)) return;
        if (state.queue.length === 0) return;

        const startIndex = clampNumber(state.currentQueueIndex, 0);
        this.player.setQueue(state.queue, startIndex, false);
        await this.player.playTrackFromQueue(clampNumber(state.positionSeconds, 0), 0);
        if (!state.isPlaying) {
            this.player.activeElement.pause();
        }
    }

    async applyRemoteFavorite(change) {
        if (!change || !change.type) return;
        const key = change.key || change.item?.id || change.item?.uuid;
        if (!key) return;

        const exists = await db.isFavorite(change.type, key);
        const wantsPresent = change.action === 'add';
        if (exists === wantsPresent) return;

        await db.toggleFavorite(change.type, change.item, { silentSync: true });
    }

    async applyRemoteHistory(change) {
        const track = change?.track;
        if (!track?.id) return;
        await db.addToHistory(track, { silentSync: true });
    }

    async applyRemotePlaylist(change) {
        const action = change?.action;
        const playlist = change?.playlist;
        if (!action || !playlist) return;
        await db.applySyncedPlaylistChange(action, playlist);
    }
}

