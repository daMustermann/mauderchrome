// js/accounts/localAuth.js
// Minimal local-only auth for self-hosted deployments.
// Username-only accounts stored in localStorage. No passwords.

const USERS_KEY = 'monochrome-local-users';
const CURRENT_KEY = 'monochrome-local-current-user';

function _loadUsers() {
    try {
        const raw = localStorage.getItem(USERS_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function _saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export const localAuth = {
    // Create a session by user id (username)
    async createSession(userId /*ignored secret*/) {
        const users = _loadUsers();
        if (!userId) throw new Error('Missing user id');
        if (!users[userId]) {
            // create a minimal profile
            users[userId] = {
                username: userId,
                display_name: userId,
                avatar_url: '/assets/appicon.png',
            };
            _saveUsers(users);
        }
        localStorage.setItem(CURRENT_KEY, userId);
        return { $id: userId, ...users[userId] };
    },

    // OAuth stub - redirect not used for local mode
    createOAuth2Session(provider, redirect, failure) {
        // For local mode we simply prompt for a username when invoked by authManager
        window.location.href = redirect || window.location.href;
    },

    // Treat email as username for compatibility
    async createEmailPasswordSession(email /*username*/, _password) {
        return this.createSession(email);
    },

    // Create user record
    async create(_idExpr, username /*ignored password*/) {
        const users = _loadUsers();
        if (!username) throw new Error('Missing username');
        if (!users[username]) {
            users[username] = { username, display_name: username, avatar_url: '/assets/appicon.png' };
            _saveUsers(users);
        }
        return { $id: username, ...users[username] };
    },

    async createRecovery(_email, _url) {
        // No-op for local mode
        return true;
    },

    // Return currently signed-in user object or throw
    async get() {
        const id = localStorage.getItem(CURRENT_KEY);
        if (!id) throw new Error('Not signed in');
        const users = _loadUsers();
        return { $id: id, ...(users[id] || { username: id, display_name: id }) };
    },

    // Sign out
    async deleteSession(_id) {
        localStorage.removeItem(CURRENT_KEY);
        return true;
    },
};

export default localAuth;
