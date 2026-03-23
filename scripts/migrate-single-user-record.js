import PocketBase from 'pocketbase';

const COLLECTION = 'DB_users';
const DEFAULT_TARGET_KEY = 'single-user-instance';
const MAX_HISTORY_ITEMS = 500;

function hasFlag(flag) {
    return process.argv.includes(flag);
}

function getEnv(name, fallback = '') {
    const value = process.env[name];
    return typeof value === 'string' ? value.trim() : fallback;
}

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function normalizeBackendKey(value) {
    const raw = String(value || DEFAULT_TARGET_KEY).toLowerCase();
    const cleaned = raw.replace(/[^a-z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
    return cleaned || DEFAULT_TARGET_KEY;
}

function toTimestamp(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const asNumber = Number(value);
        if (Number.isFinite(asNumber)) return asNumber;
        const asDate = Date.parse(value);
        if (!Number.isNaN(asDate)) return asDate;
    }
    return 0;
}

function safeParseJson(value, fallback) {
    if (value == null || value === '') return fallback;
    if (typeof value === 'object') return value;
    if (typeof value !== 'string') return fallback;

    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function ensureLibraryShape(library) {
    const fallback = {
        tracks: {},
        albums: {},
        artists: {},
        playlists: {},
        mixes: {},
    };
    const obj = safeParseJson(library, fallback);
    return {
        tracks: obj?.tracks && typeof obj.tracks === 'object' ? obj.tracks : {},
        albums: obj?.albums && typeof obj.albums === 'object' ? obj.albums : {},
        artists: obj?.artists && typeof obj.artists === 'object' ? obj.artists : {},
        playlists: obj?.playlists && typeof obj.playlists === 'object' ? obj.playlists : {},
        mixes: obj?.mixes && typeof obj.mixes === 'object' ? obj.mixes : {},
    };
}

function ensureObject(value) {
    const parsed = safeParseJson(value, {});
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

function ensureArray(value) {
    const parsed = safeParseJson(value, []);
    return Array.isArray(parsed) ? parsed : [];
}

function pickPreferredByUpdated(existing, incoming) {
    const existingTs = Math.max(toTimestamp(existing?.updatedAt), toTimestamp(existing?.addedAt), toTimestamp(existing?.timestamp));
    const incomingTs = Math.max(toTimestamp(incoming?.updatedAt), toTimestamp(incoming?.addedAt), toTimestamp(incoming?.timestamp));
    return incomingTs >= existingTs ? incoming : existing;
}

function mergeByKey(targetMap, incomingMap) {
    const keys = Object.keys(incomingMap || {});
    for (const key of keys) {
        const existing = targetMap[key];
        const incoming = incomingMap[key];
        if (!existing) {
            targetMap[key] = incoming;
            continue;
        }
        targetMap[key] = pickPreferredByUpdated(existing, incoming);
    }
}

function mergeHistory(targetHistory, incomingHistory) {
    const merged = [...targetHistory, ...incomingHistory];
    merged.sort((a, b) => toTimestamp(b?.timestamp) - toTimestamp(a?.timestamp));

    const seen = new Set();
    const out = [];
    for (const item of merged) {
        const key = item?.timestamp ? `ts:${item.timestamp}` : `id:${item?.id || 'unknown'}:${item?.title || ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(item);
        if (out.length >= MAX_HISTORY_ITEMS) break;
    }
    return out;
}

function mergeFavoriteAlbums(targetAlbums, incomingAlbums) {
    const map = new Map();
    for (const album of [...targetAlbums, ...incomingAlbums]) {
        if (!album || typeof album !== 'object') continue;
        const id = album.id || album.uuid || `${album.title || 'unknown'}:${album.artist || ''}`;
        if (!id) continue;
        const existing = map.get(id);
        if (!existing) {
            map.set(id, album);
            continue;
        }
        map.set(id, pickPreferredByUpdated(existing, album));
    }
    return Array.from(map.values());
}

function chooseFirstNonEmpty(records, fieldName, fallback = null) {
    for (const record of records) {
        const value = record[fieldName];
        if (isNonEmptyString(value)) return value.trim();
    }
    return fallback;
}

function buildMerged(records, targetBackendKey) {
    const library = {
        tracks: {},
        albums: {},
        artists: {},
        playlists: {},
        mixes: {},
    };
    let history = [];
    const userPlaylists = {};
    const userFolders = {};
    let favoriteAlbums = [];

    for (const record of records) {
        const parsedLibrary = ensureLibraryShape(record.library);
        mergeByKey(library.tracks, parsedLibrary.tracks);
        mergeByKey(library.albums, parsedLibrary.albums);
        mergeByKey(library.artists, parsedLibrary.artists);
        mergeByKey(library.playlists, parsedLibrary.playlists);
        mergeByKey(library.mixes, parsedLibrary.mixes);

        history = mergeHistory(history, ensureArray(record.history));
        mergeByKey(userPlaylists, ensureObject(record.user_playlists));
        mergeByKey(userFolders, ensureObject(record.user_folders));
        favoriteAlbums = mergeFavoriteAlbums(favoriteAlbums, ensureArray(record.favorite_albums));
    }

    const username = chooseFirstNonEmpty(records, 'username', 'owner');
    const displayName = chooseFirstNonEmpty(records, 'display_name', username);

    const privacyRecords = records
        .map((r) => ensureObject(r.privacy))
        .filter((p) => Object.keys(p).length > 0);
    const privacy = privacyRecords.length > 0 ? privacyRecords[0] : { playlists: 'public', lastfm: 'public' };

    return {
        firebase_id: targetBackendKey,
        username,
        display_name: displayName,
        avatar_url: chooseFirstNonEmpty(records, 'avatar_url', ''),
        banner: chooseFirstNonEmpty(records, 'banner', ''),
        status: chooseFirstNonEmpty(records, 'status', ''),
        about: chooseFirstNonEmpty(records, 'about', ''),
        website: chooseFirstNonEmpty(records, 'website', ''),
        lastfm_username: chooseFirstNonEmpty(records, 'lastfm_username', ''),
        privacy: JSON.stringify(privacy),
        library: JSON.stringify(library),
        history: JSON.stringify(history),
        user_playlists: JSON.stringify(userPlaylists),
        user_folders: JSON.stringify(userFolders),
        favorite_albums: JSON.stringify(favoriteAlbums),
    };
}

async function authAsAdmin(pb, email, password) {
    try {
        await pb.collection('_superusers').authWithPassword(email, password);
        return;
    } catch (error) {
        void error;
        // Fallback for older PocketBase SDK versions below.
    }

    if (pb.admins && typeof pb.admins.authWithPassword === 'function') {
        await pb.admins.authWithPassword(email, password);
        return;
    }

    throw new Error('Unable to authenticate as PocketBase superuser.');
}

async function main() {
    const pbUrl = getEnv('PB_URL', getEnv('POCKETBASE_URL', 'http://127.0.0.1:8090'));
    const pbEmail = getEnv('PB_ADMIN_EMAIL', getEnv('PB_SUPERUSER_EMAIL'));
    const pbPassword = getEnv('PB_ADMIN_PASSWORD', getEnv('PB_SUPERUSER_PASSWORD'));
    const targetBackendKey = normalizeBackendKey(
        getEnv('BACKEND_USER_KEY', getEnv('MONO_BACKEND_USER_KEY', DEFAULT_TARGET_KEY))
    );

    const apply = hasFlag('--apply');
    const deleteSources = hasFlag('--delete-sources');

    if (!pbEmail || !pbPassword) {
        console.error('Missing admin credentials. Set PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD.');
        process.exit(1);
    }

    const pb = new PocketBase(pbUrl);
    pb.autoCancellation(false);
    await authAsAdmin(pb, pbEmail, pbPassword);

    const records = await pb.collection(COLLECTION).getFullList({ sort: '-updated' });
    if (!records.length) {
        console.log(`[migrate] No records found in ${COLLECTION}.`);
        process.exit(0);
    }

    const targetCandidates = records.filter((r) => (r.firebase_id || '') === targetBackendKey);
    const targetRecord = targetCandidates[0] || null;
    const sourceRecords = targetRecord ? records.filter((r) => r.id !== targetRecord.id) : records.slice();
    const mergedPayload = buildMerged(records, targetBackendKey);

    const summary = {
        totalRecords: records.length,
        targetBackendKey,
        existingTargetRecordId: targetRecord?.id || null,
        sourceRecordCount: sourceRecords.length,
    };

    console.log('[migrate] Summary:', summary);
    console.log(`[migrate] Mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);
    if (!apply) {
        console.log('[migrate] No changes written. Re-run with --apply to persist.');
        return;
    }

    let savedTargetRecord = null;
    if (targetRecord) {
        savedTargetRecord = await pb.collection(COLLECTION).update(targetRecord.id, mergedPayload);
        console.log(`[migrate] Updated target record: ${targetRecord.id}`);
    } else {
        savedTargetRecord = await pb.collection(COLLECTION).create(mergedPayload);
        console.log(`[migrate] Created target record: ${savedTargetRecord.id}`);
    }

    if (deleteSources) {
        const deletionCandidates = records.filter((r) => r.id !== savedTargetRecord.id);
        for (const record of deletionCandidates) {
            await pb.collection(COLLECTION).delete(record.id);
            console.log(`[migrate] Deleted source record: ${record.id} (${record.firebase_id || 'no-firebase-id'})`);
        }
    } else {
        console.log('[migrate] Source records were kept. Use --delete-sources to remove them.');
    }

    console.log('[migrate] Done.');
}

main().catch((error) => {
    console.error('[migrate] Failed:', error);
    process.exit(1);
});
