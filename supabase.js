// supabase.js

// ─────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────
const SUPABASE_URL = 'SUPABASE_URL_PLACEHOLDER';
const SUPABASE_KEY = 'SUPABASE_KEY_PLACEHOLDER';

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─────────────────────────────────────────
// AUTH STATE
// ─────────────────────────────────────────
let currentUser      = null;
let isSignUp         = false;
let appInitialised   = false;

/**
 * Listens for Supabase auth state changes.
 * Routes to the app on login and back to the auth screen on logout.
 */
sb.auth.onAuthStateChange(async (event, session) => {
  console.log('Auth event:', event, '| User:', session?.user?.email);

  if (session?.user) {
    currentUser = session.user;

    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
      showApp();          // ← only handles DOM/template (runs once)
      initUserMenu();
      setUserAvatar(currentUser.email);
      await initApp();   // ← always runs on every valid auth event
    }

  } else {
    currentUser = null;
    appInitialised = false;
    showAuth();
    clearUserAvatar();
  }
});

// ─────────────────────────────────────────
// SHOW APP
// ─────────────────────────────────────────

/**
 * Reveals the main app, injects the app template, and initialises the app.
 * The appInitialised flag prevents re-initialisation on repeated auth events
 * (e.g. token refresh), which would wipe in-progress state.
 */
function showApp() {
  document.getElementById('auth-modal').style.display = 'none';

  const app = document.getElementById('app');
  app.style.display = 'block';

  // Only inject template once, ever
  if (appInitialised) return;
  appInitialised = true;

  const template = document.getElementById('app-template');
  console.log('Template found:', template);
  console.log('App element:', app);

  app.appendChild(template.content.cloneNode(true));
}

/** Call this once after showApp() renders the header */
function initUserMenu() {
  const avatarBtn = document.getElementById('user-avatar-btn');
  if (!avatarBtn) return;

  // Remove old listener to avoid duplicates on re-login
  avatarBtn.replaceWith(avatarBtn.cloneNode(true));

  document.getElementById('user-avatar-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('user-menu')?.classList.toggle('open');
  });
}

// ─────────────────────────────────────────
// SHOW AUTH
// ─────────────────────────────────────────

/**
 * Reveals the auth screen and fully resets its state.
 * Clears the app content so no previous user's data remains in the DOM.
 */
function showAuth() {
  document.getElementById('auth-modal').style.display = 'flex';

  document.getElementById('auth-email').value    = '';
  document.getElementById('auth-password').value = '';

  isSignUp = false;
  document.getElementById('auth-title').textContent     = 'Welcome Back';
  document.getElementById('auth-submit-btn').textContent = 'Sign In';
  document.getElementById('auth-toggle-btn').textContent = "Don't have an account? Sign Up";
  document.getElementById('auth-error').style.display   = 'none';

  const app = document.getElementById('app');
  app.style.display = 'none';
  app.innerHTML     = '';
  appInitialised    = false;
}

// ─────────────────────────────────────────
// AUTH TOGGLE
// ─────────────────────────────────────────

/** Toggles the auth form between Sign In and Sign Up mode, clearing fields on each switch. */
document.getElementById('auth-toggle-btn').addEventListener('click', () => {
  isSignUp = !isSignUp;

  document.getElementById('auth-title').textContent     = isSignUp ? 'Create Your Account' : 'Welcome Back';
  document.getElementById('auth-submit-btn').textContent = isSignUp ? 'Sign Up' : 'Sign In';
  document.getElementById('auth-toggle-btn').textContent = isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up";
  document.getElementById('auth-error').style.display   = 'none';

  document.getElementById('auth-email').value    = '';
  document.getElementById('auth-password').value = '';
});

// ─────────────────────────────────────────
// AUTH SUBMIT
// ─────────────────────────────────────────

/** Handles Sign In and Sign Up form submission. Auth state changes are handled by onAuthStateChange. */
document.getElementById('auth-submit-btn').addEventListener('click', async () => {
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value.trim();
  const errorEl  = document.getElementById('auth-error');

  if (!email || !password) {
    errorEl.textContent   = 'Please enter both email and password.';
    errorEl.style.display = 'block';
    return;
  }

  const result = isSignUp
    ? await sb.auth.signUp({ email, password })
    : await sb.auth.signInWithPassword({ email, password });

  if (result.error) {
    errorEl.textContent   = result.error.message;
    errorEl.style.display = 'block';
  } else {
    errorEl.style.display = 'none';
  }
});

// ─────────────────────────────────────────
// SIGN OUT
// ─────────────────────────────────────────

/**
 * Listens for logout button clicks via event delegation on the document.
 * Delegation is used because the logout button is injected dynamically
 * from the app template and does not exist in the DOM at script load time.
 */
document.addEventListener('click', async (e) => {
  if (e.target.id === 'logout-btn') {
    await sb.auth.signOut();
  }
});

// ─────────────────────────────────────────
// USER AVATAR & DROPDOWN
// ─────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

  /** Toggles the dropdown open/closed */
  document.getElementById('user-avatar-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('user-menu').classList.toggle('open');
  });

  /** Closes the dropdown when clicking anywhere outside */
  document.addEventListener('click', () => {
    document.getElementById('user-menu')?.classList.remove('open');
  });

});

/** Populates the avatar circle initial and dropdown email */
function setUserAvatar(email) {
  const initial = email ? email.charAt(0).toUpperCase() : '?';
  const avatarEl = document.getElementById('user-avatar-initial');
  const emailEl  = document.getElementById('user-dropdown-email');
  if (avatarEl) avatarEl.textContent = initial;
  if (emailEl)  emailEl.textContent  = email || '';
}

/** Clears the avatar on logout */
function clearUserAvatar() {
  const avatarEl = document.getElementById('user-avatar-initial');
  const emailEl  = document.getElementById('user-dropdown-email');
  if (avatarEl) avatarEl.textContent = '?';
  if (emailEl)  emailEl.textContent  = '';
}
