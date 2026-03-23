// js/accounts/auth.js
import { auth as remoteAuth } from './config.js';
import { localAuth } from './localAuth.js';

const useLocalAuth =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.protocol === 'file:' ||
    localStorage.getItem('monochrome-local-accounts') === '1' ||
    !!window.__LOCAL_ACCOUNTS__;

const auth = useLocalAuth ? localAuth : remoteAuth;

export class AuthManager {
    constructor() {
        this.user = null;
        this.authListeners = [];
        this.init();
    }

    async init() {
        const params = new URLSearchParams(window.location.search);
        const userId = params.get('userId');
        const secret = params.get('secret');
        const isOAuthRedirect = params.get('oauth') === '1';

        if (userId && secret && userId !== 'null' && secret !== 'null') {
            try {
                await auth.createSession(userId, secret);
                window.history.replaceState({}, '', window.location.pathname);
            } catch (error) {
                console.warn('OAuth session handoff failed:', error.message);
                window.history.replaceState({}, '', window.location.pathname);
            }
        } else if (isOAuthRedirect) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            window.history.replaceState({}, '', window.location.pathname);
        }

        try {
            this.user = await auth.get();
            this.updateUI(this.user);
            this.authListeners.forEach((listener) => listener(this.user));
        } catch {
            this.user = null;
            this.updateUI(null);
        }
    }

    onAuthStateChanged(callback) {
        this.authListeners.push(callback);
        // If we already have a user state, trigger immediately
        if (this.user !== null) {
            callback(this.user);
        }
    }

    async signInWithGoogle() {
        try {
            if (useLocalAuth) {
                // prompt for username in local mode
                const username = prompt('Enter a username to sign in (no password):');
                if (!username) return;
                await auth.createSession(username.trim());
                this.user = await auth.get();
                this.updateUI(this.user);
                this.authListeners.forEach((listener) => listener(this.user));
            } else {
                auth.createOAuth2Session(
                    'google',
                    window.location.origin + '/index.html?oauth=1',
                    window.location.origin + '/login.html'
                );
            }
        } catch (error) {
            console.error('Login failed:', error);
            alert(`Login failed: ${error.message}`);
        }
    }

    // Local username sign-in (used when email-connect UI is repurposed for local)
    async signInWithUsername() {
        try {
            const modalId = 'local-user-modal';
            if (document.getElementById(modalId)) {
                document.getElementById(modalId).querySelector('.template-input')?.focus();
                return null;
            }

            const usersRaw = localStorage.getItem('monochrome-local-users');
            const users = usersRaw ? JSON.parse(usersRaw) : {};

            const modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-overlay" tabindex="-1" aria-hidden="true"></div>
                <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="local-user-modal-title">
                    <div class="modal-header">
                        <div class="modal-title" id="local-user-modal-title">Who's listening?</div>
                        <button class="btn-secondary" id="local-user-close">✕</button>
                    </div>
                    <div class="modal-body">
                        <div id="local-user-list" style="display:flex;flex-direction:column;gap:0.5rem;max-height:220px;overflow:auto;"></div>

                        <label style="opacity:0.9">Create new username</label>
                        <div style="display:flex;gap:0.5rem;align-items:center">
                            <input id="local-user-new-input" class="template-input" placeholder="username" style="flex:1" />
                            <button id="local-user-create-btn" class="btn-primary">Create</button>
                        </div>

                        <label style="opacity:0.9">Admin password (required to create/delete)</label>
                        <input id="local-user-admin-password" type="password" class="template-input" placeholder="Admin password" />
                    </div>
                    <div class="modal-footer">
                        <button id="local-user-cancel" class="btn-secondary">Cancel</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            // Ensure modal is visible (some CSS hides .modal unless it has .active)
            modal.classList.add('active');
            // accessibility: focus management
            const content = modal.querySelector('.modal-content');
            const overlay = modal.querySelector('.modal-overlay');
            const listEl = modal.querySelector('#local-user-list');
            const inputEl = modal.querySelector('#local-user-new-input');
            const createBtn = modal.querySelector('#local-user-create-btn');
            const cancelBtn = modal.querySelector('#local-user-cancel');
            const adminPwInput = modal.querySelector('#local-user-admin-password');
            const closeBtn = modal.querySelector('#local-user-close');

            function closeModal() {
                try { modal.remove(); } catch (e) { /* ignore */ }
            }

            overlay.addEventListener('click', closeModal);
            closeBtn.addEventListener('click', closeModal);
            cancelBtn.addEventListener('click', closeModal);
            // close on Escape
            modal.addEventListener('keydown', (ev) => {
                if (ev.key === 'Escape') closeModal();
            });

            inputEl.focus();

            function renderList() {
                listEl.innerHTML = '';
                const keys = Object.keys(users || {});
                if (keys.length === 0) {
                    const p = document.createElement('div');
                    p.style.opacity = '0.8';
                    p.textContent = 'No local users yet. Create one above.';
                    listEl.appendChild(p);
                    return;
                }
                keys.forEach((u) => {
                    const row = document.createElement('div');
                    row.className = 'setting-item';
                    row.style.display = 'flex';
                    row.style.justifyContent = 'space-between';
                    row.style.alignItems = 'center';
                    row.style.padding = '0.4rem';
                    const name = document.createElement('div');
                    name.textContent = u;
                    name.style.cursor = 'pointer';
                    name.onclick = async () => {
                        await auth.createSession(u);
                        this.user = await auth.get();
                        this.updateUI(this.user);
                        this.authListeners.forEach((listener) => listener(this.user));
                        closeModal();
                    };

                    const actions = document.createElement('div');
                    actions.style.display = 'flex';
                    actions.style.gap = '0.25rem';
                    const del = document.createElement('button');
                    del.className = 'btn-secondary btn-danger';
                    del.textContent = 'Delete';
                    del.onclick = () => {
                        const confirmDel = confirm(`Delete user ${u}? This removes local data for them.`);
                        if (!confirmDel) return;
                        const pw = adminPwInput.value || '';
                        if (pw !== 'marauder88') {
                            alert('Invalid admin password');
                            return;
                        }
                        delete users[u];
                        localStorage.setItem('monochrome-local-users', JSON.stringify(users));
                        localStorage.removeItem('monochrome-local-user-' + u);
                        const current = localStorage.getItem('monochrome-local-current-user');
                        if (current === u) {
                            localStorage.removeItem('monochrome-local-current-user');
                            try {
                                if (window.authManager && typeof window.authManager.updateUI === 'function') {
                                    window.authManager.user = null;
                                    window.authManager.updateUI(null);
                                }
                            } catch (e) {}
                        }
                        renderList();
                    };
                    actions.appendChild(del);
                    row.appendChild(name);
                    row.appendChild(actions);
                    listEl.appendChild(row);
                });
            }

            createBtn.addEventListener('click', async () => {
                const val = inputEl.value && inputEl.value.trim();
                const pw = adminPwInput.value || '';
                if (!val) return alert('Enter a username');
                if (!pw) return alert('Enter admin password to create user');
                if (pw !== 'marauder88') return alert('Invalid admin password');
                if (users[val]) return alert('Username exists');
                users[val] = { username: val, display_name: val, avatar_url: '/assets/appicon.png' };
                localStorage.setItem('monochrome-local-users', JSON.stringify(users));
                await auth.createSession(val);
                this.user = await auth.get();
                this.updateUI(this.user);
                this.authListeners.forEach((listener) => listener(this.user));
                closeModal();
            });

            renderList();
            return null;
        } catch (error) {
            console.error('Sign in failed:', error);
            alert(`Sign in failed: ${error.message}`);
            throw error;
        }
    }

    async signInWithEmail(email, password) {
        try {
            await auth.createEmailPasswordSession(email, password);
            this.user = await auth.get();
            this.updateUI(this.user);
            this.authListeners.forEach((listener) => listener(this.user));
            return this.user;
        } catch (error) {
            console.error('Email Login failed:', error);
            alert(`Login failed: ${error.message}`);
            throw error;
        }
    }

    async signUpWithEmail(email, password) {
        try {
            await auth.create('unique()', email, password);
            await auth.createEmailPasswordSession(email, password);
            this.user = await auth.get();
            this.updateUI(this.user);
            this.authListeners.forEach((listener) => listener(this.user));
            return this.user;
        } catch (error) {
            console.error('Sign Up failed:', error);
            alert(`Sign Up failed: ${error.message}`);
            throw error;
        }
    }

    async sendPasswordReset(email) {
        try {
            await auth.createRecovery(email, window.location.origin + '/reset-password');
            alert(`Password reset email sent to ${email}`);
        } catch (error) {
            console.error('Password reset failed:', error);
            alert(`Failed to send reset email: ${error.message}`);
            throw error;
        }
    }

    async signOut() {
        try {
            await auth.deleteSession('current');
            this.user = null;
            this.updateUI(null);
            this.authListeners.forEach((listener) => listener(null));

            if (window.__AUTH_GATE__) {
                window.location.href = '/login';
            } else {
                window.location.reload();
            }
        } catch (error) {
            console.error('Logout failed:', error);
            throw error;
        }
    }

    updateUI(user) {
        const connectBtn = document.getElementById('auth-connect-btn');
        const clearDataBtn = document.getElementById('auth-clear-cloud-btn');
        const statusText = document.getElementById('auth-status');
        const emailContainer = document.getElementById('email-auth-container');
        const emailToggleBtn = document.getElementById('toggle-email-auth-btn');

        if (!connectBtn) return;

        if (window.__AUTH_GATE__) {
            connectBtn.textContent = 'Sign Out';
            connectBtn.classList.add('danger');
            connectBtn.onclick = () => this.signOut();
            if (clearDataBtn) clearDataBtn.style.display = 'none';
            if (emailContainer) emailContainer.style.display = 'none';
            if (emailToggleBtn) emailToggleBtn.style.display = 'none';
            if (statusText) statusText.textContent = user ? `Signed in as ${user.email}` : 'Signed in';

            const accountPage = document.getElementById('page-account');
            if (accountPage) {
                const title = accountPage.querySelector('.section-title');
                if (title) title.textContent = 'Account';
                accountPage.querySelectorAll('.account-content > p, .account-content > div').forEach((el) => {
                    if (el.id !== 'auth-status' && el.id !== 'auth-buttons-container') {
                        el.style.display = 'none';
                    }
                });
            }

            const customDbBtn = document.getElementById('custom-db-btn');
            if (customDbBtn) {
                const pbFromEnv = !!window.__POCKETBASE_URL__;
                if (pbFromEnv) {
                    const settingItem = customDbBtn.closest('.setting-item');
                    if (settingItem) settingItem.style.display = 'none';
                }
            }

            return;
        }

        if (useLocalAuth) {
            if (user) {
                connectBtn.textContent = 'Sign Out';
                connectBtn.classList.add('danger');
                connectBtn.onclick = () => this.signOut();
                if (statusText) statusText.textContent = `Signed in as ${user.username || user.$id}`;
            } else {
                connectBtn.textContent = 'Who is Listening?';
                connectBtn.classList.remove('danger');
                connectBtn.onclick = () => this.signInWithUsername();
                if (statusText) statusText.textContent = 'Local accounts enabled';
            }
            if (clearDataBtn) clearDataBtn.style.display = 'none';
            if (emailContainer) emailContainer.style.display = 'none';
            if (emailToggleBtn) emailToggleBtn.style.display = 'none';
        } else {
            if (user) {
                connectBtn.textContent = 'Sign Out';
                connectBtn.classList.add('danger');
                connectBtn.onclick = () => this.signOut();

                if (clearDataBtn) clearDataBtn.style.display = 'block';
                if (emailContainer) emailContainer.style.display = 'none';
                if (emailToggleBtn) emailToggleBtn.style.display = 'none';
                if (statusText) statusText.textContent = `Signed in as ${user.email}`;
            } else {
                connectBtn.textContent = 'Connect with Google';
                connectBtn.classList.remove('danger');
                connectBtn.onclick = () => this.signInWithGoogle();

                if (clearDataBtn) clearDataBtn.style.display = 'none';
                if (emailToggleBtn) emailToggleBtn.style.display = 'inline-block';
                if (statusText) statusText.textContent = 'Sync your library across devices';
            }
        }
    }
}

export const authManager = new AuthManager();
