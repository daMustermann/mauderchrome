// js/accounts/localSync.js
// Local storage backed sync manager mimicking PocketBase subset used by the app.

const LOCAL_USERS_PREFIX = 'monochrome-local-user-';
const SINGLE_STORE_KEY = 'monochrome-single-user-data-v1';
const INSTANCE_USER_NAME_KEY = 'monochrome-instance-username';

function _keyFor(username) {
    return LOCAL_USERS_PREFIX + username;
}

function _singleUsername() {
    return localStorage.getItem(INSTANCE_USER_NAME_KEY) || localStorage.getItem('monochrome-local-current-user') || 'owner';
}

function _load(username) {
    try {
        const single = localStorage.getItem(SINGLE_STORE_KEY);
        if (single) {
            return JSON.parse(single);
        }
        const raw = localStorage.getItem(_keyFor(username));
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function _save(username, obj) {
    localStorage.setItem(SINGLE_STORE_KEY, JSON.stringify(obj));
    localStorage.setItem(_keyFor(username), JSON.stringify(obj));
}

export const localSyncManager = {
    // Return profile object by username (used by profile.loadProfile)
    async getProfile(username) {
        const currentUsername = _singleUsername();
        if (!username) username = currentUsername;
        if (username !== currentUsername) return null;

        const data = _load(currentUsername);
        if (!data) return null;
        return data.profile || {
            username: currentUsername,
            display_name: currentUsername,
            avatar_url: '/assets/appicon.png',
            banner: null,
            status: null,
            about: null,
            website: null,
            privacy: { playlists: 'public', lastfm: 'public' },
            favorite_albums: [],
        };
    },

    async getUserData(_username) {
        const currentUsername = _singleUsername();
        const data = _load(currentUsername) || {};
        return {
            library: data.library || {},
            history: data.history || [],
            userPlaylists: data.user_playlists || {},
            userFolders: data.user_folders || {},
            profile: data.profile || { username: currentUsername, display_name: currentUsername },
        };
    },

    async _updateUserJSON(username, field, data) {
        if (!username) return;
        const stored = _load(username) || {};
        stored[field] = data;
        _save(username, stored);
    },

    async syncLibraryItem(type, item, added) {
        const username = _singleUsername();
        const stored = _load(username) || {};
        const library = stored.library || {};
        const pluralType = type === 'mix' ? 'mixes' : `${type}s`;
        const key = type === 'playlist' ? item.uuid : item.id;
        if (!library[pluralType]) library[pluralType] = {};
        if (added) library[pluralType][key] = item;
        else delete library[pluralType][key];
        stored.library = library;
        _save(username, stored);
    },

    async syncHistoryItem(historyEntry) {
        const username = _singleUsername();
        const stored = _load(username) || {};
        const history = stored.history || [];
        stored.history = [historyEntry, ...history].slice(0, 100);
        _save(username, stored);
    },

    async clearHistory() {
        const username = _singleUsername();
        const stored = _load(username) || {};
        stored.history = [];
        _save(username, stored);
    },

    async syncUserPlaylist(playlist, action) {
        const username = _singleUsername();
        const stored = _load(username) || {};
        const userPlaylists = stored.user_playlists || {};
        if (action === 'delete') delete userPlaylists[playlist.id];
        else
            userPlaylists[playlist.id] = {
                id: playlist.id,
                name: playlist.name,
                cover: playlist.cover || null,
                tracks: playlist.tracks || [],
                createdAt: playlist.createdAt || Date.now(),
                updatedAt: playlist.updatedAt || Date.now(),
                numberOfTracks: playlist.tracks ? playlist.tracks.length : 0,
                images: playlist.images || [],
                isPublic: playlist.isPublic || false,
            };
        stored.user_playlists = userPlaylists;
        _save(username, stored);
    },

    async syncUserFolder(folder, action) {
        const username = _singleUsername();
        const stored = _load(username) || {};
        const userFolders = stored.user_folders || {};
        if (action === 'delete') delete userFolders[folder.id];
        else
            userFolders[folder.id] = {
                id: folder.id,
                name: folder.name,
                cover: folder.cover || null,
                playlists: folder.playlists || [],
                createdAt: folder.createdAt || Date.now(),
                updatedAt: folder.updatedAt || Date.now(),
            };
        stored.user_folders = userFolders;
        _save(username, stored);
    },

    async replaceServerDataWithLocalData() {
        // Local mode has no separate server backend.
        return true;
    },

    async clearServerData() {
        // Local mode has no separate server backend.
        return true;
    },

    async getPublicPlaylist(_uuid) {
        // Local mode does not support public playlist publishing - return null
        return null;
    },

    // Mirror PocketBase sync manager API: respond to auth state changes.
    // In local mode we don't need to sync from remote; keep as noop to
    // satisfy callers that bind this method.
    async onAuthStateChanged(_user) {
        // user is either null or an object with $id for the current user
        // No-op: local data is already in localStorage and will be read on demand.
        return;
    },
};

export default localSyncManager;
