// js/accounts/auth.js
// Single-user auth model: exactly one local instance user, no passwords, no multi-user login.

const INSTANCE_USER_ID_KEY = 'monochrome-instance-user-id';
const INSTANCE_USER_NAME_KEY = 'monochrome-instance-username';
const LEGACY_LOCAL_CURRENT_USER_KEY = 'monochrome-local-current-user';
const LEGACY_LOCAL_USERS_KEY = 'monochrome-local-users';

function createCompactId(length = 15) {
    let out = '';
    while (out.length < length) {
        out += Math.random().toString(36).slice(2);
    }
    return out.slice(0, length);
}

function normalizeUsername(value) {
    const raw = String(value || '')
        .trim()
        .toLowerCase();
    const cleaned = raw.replace(/[^a-z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
    return cleaned || 'owner';
}

function getOrCreateInstanceIdentity() {
    let userId = localStorage.getItem(INSTANCE_USER_ID_KEY);
    if (!userId) {
        userId = createCompactId(15);
        localStorage.setItem(INSTANCE_USER_ID_KEY, userId);
    }

    const legacyCurrent = localStorage.getItem(LEGACY_LOCAL_CURRENT_USER_KEY);
    let username = localStorage.getItem(INSTANCE_USER_NAME_KEY) || legacyCurrent || 'owner';
    username = normalizeUsername(username);
    localStorage.setItem(INSTANCE_USER_NAME_KEY, username);
    localStorage.setItem(LEGACY_LOCAL_CURRENT_USER_KEY, username);

    // Keep legacy local-users object coherent for modules that still reference it.
    let legacyUsers = {};
    try {
        legacyUsers = JSON.parse(localStorage.getItem(LEGACY_LOCAL_USERS_KEY) || '{}') || {};
    } catch {
        legacyUsers = {};
    }
    legacyUsers = {
        [username]: {
            username,
            display_name: username,
            avatar_url: '/assets/appicon.png',
        },
    };
    localStorage.setItem(LEGACY_LOCAL_USERS_KEY, JSON.stringify(legacyUsers));

    return {
        $id: userId,
        username,
        email: `${username}@local.instance`,
        name: username,
    };
}

export class AuthManager {
    constructor() {
        this.user = null;
        this.authListeners = [];
        this.init();
    }

    async init() {
        this.user = getOrCreateInstanceIdentity();
        this.updateUI(this.user);
        this.notify();
    }

    notify() {
        this.authListeners.forEach((listener) => {
            try {
                listener(this.user);
            } catch (error) {
                console.warn('[Auth] Listener failed:', error);
            }
        });
    }

    onAuthStateChanged(callback) {
        this.authListeners.push(callback);
        if (this.user) {
            callback(this.user);
        }
    }

    async ensureInstanceUser(preferredUsername = null) {
        if (preferredUsername) {
            const normalized = normalizeUsername(preferredUsername);
            localStorage.setItem(INSTANCE_USER_NAME_KEY, normalized);
            localStorage.setItem(LEGACY_LOCAL_CURRENT_USER_KEY, normalized);
        }
        this.user = getOrCreateInstanceIdentity();
        this.updateUI(this.user);
        this.notify();
        return this.user;
    }

    async signInWithGoogle() {
        return this.ensureInstanceUser();
    }

    async signInWithUsername(username = null) {
        const value =
            username ||
            prompt('Set instance username (single-user mode):', localStorage.getItem(INSTANCE_USER_NAME_KEY) || 'owner');
        if (!value) return this.user;
        return this.ensureInstanceUser(value);
    }

    async signInWithEmail(email) {
        const username = String(email || '').split('@')[0];
        return this.ensureInstanceUser(username);
    }

    async signUpWithEmail(email) {
        const username = String(email || '').split('@')[0];
        return this.ensureInstanceUser(username);
    }

    async sendPasswordReset(_email) {
        alert('Password reset is disabled in single-user mode.');
    }

    async signOut() {
        alert('Single-user mode: sign out is disabled for this instance.');
        return this.user;
    }

    updateUI(user) {
        const connectBtn = document.getElementById('auth-connect-btn');
        const clearDataBtn = document.getElementById('auth-clear-server-btn');
        const statusText = document.getElementById('auth-status');
        const emailContainer = document.getElementById('email-auth-container');

        if (connectBtn) {
            connectBtn.textContent = 'Single-User Mode';
            connectBtn.classList.remove('danger');
            connectBtn.onclick = () => this.signInWithUsername();
        }
        if (clearDataBtn) clearDataBtn.style.display = 'none';
        if (emailContainer) emailContainer.style.display = 'none';
        if (statusText) {
            statusText.textContent = user
                ? `Single user active: ${user.username} (this instance only)`
                : 'Single-user mode active';
        }
    }
}

export const authManager = new AuthManager();
