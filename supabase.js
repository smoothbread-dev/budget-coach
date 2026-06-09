// supabase.js

// ─────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────
const SUPABASE_URL = 'SUPABASE_URL_PLACEHOLDER';
const SUPABASE_KEY = 'SUPABASE_KEY_PLACEHOLDER';

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

startKeepAlive();

// ─────────────────────────────────────────
// AUTH STATE
// ─────────────────────────────────────────
let currentUser      = null;
let isSignUp         = false;
let appInitialised   = false;

// ─────────────────────────────────────────
// KEEP ALIVE — prevents Supabase free tier pausing
// Pings the DB every 4 days
// ─────────────────────────────────────────
function startKeepAlive() {
  const FOUR_DAYS_MS = 4 * 24 * 60 * 60 * 1000;

  setInterval(async () => {
    try {
      await sb.from('user_defaults').select('user_id').limit(1);
      console.log('[KeepAlive] Supabase pinged successfully');
    } catch (err) {
      console.warn('[KeepAlive] Ping failed:', err.message);
    }
  }, FOUR_DAYS_MS);
}

/**
 * Listens for Supabase auth state changes.
 * Routes to the app on login and back to the auth screen on logout.
 */
document.addEventListener('DOMContentLoaded', () => {

  sb.auth.onAuthStateChange(async (event, session) => {
    // Guard against ghost events with no user
    if (event === 'INITIAL_SESSION' && !session?.user) {
      showAuth();
      return;
    }

    if (session?.user) {
      currentUser = session.user;

      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        showApp();

        // Wait for DOM injection to complete before wiring up UI
        await new Promise(resolve => setTimeout(resolve, 0)); // 👈 yields to browser
        
        initUserMenu();
        setUserAvatar(currentUser.email);
        await initApp();
      }

    } else {
      currentUser = null;
      appInitialised = false;
      showAuth();
      clearUserAvatar();
    }
  });
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
  app.appendChild(template.content.cloneNode(true));
}

/** Call this once after showApp() renders the header */
function initUserMenu() {
  const avatarBtn = document.getElementById('user-avatar-btn');
  if (!avatarBtn) {
    console.warn('initUserMenu: avatar btn not found, retrying...');
    setTimeout(initUserMenu, 100);
    return;
  }

  // Remove old listeners cleanly by cloning
  const freshBtn = avatarBtn.cloneNode(true);
  avatarBtn.replaceWith(freshBtn);

  const dropdown = document.getElementById('user-dropdown'); // 👈 target the dropdown directly

  freshBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown?.classList.toggle('open'); // 👈 toggle on dropdown, not user-menu
  });

  // Use { once: true } so this doesn't stack on re-calls
  // Re-add each time initUserMenu runs (safe since freshBtn is new)
  document.addEventListener('click', () => {
    dropdown?.classList.remove('open');
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
  document.getElementById('auth-title').textContent      = 'Welcome Back';
  document.getElementById('auth-submit-btn').textContent = 'Sign In';
  document.getElementById('auth-toggle-btn').textContent = "Don't have an account? Sign Up";
  document.getElementById('auth-error').style.display    = 'none';

  document.getElementById('auth-info').style.display = 'none';
  document.getElementById('resend-btn').classList.add('bc-hidden');

  resetPasswordToggle();
  
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
  const isSignIn = document.getElementById('auth-submit-btn').textContent.trim() === 'Sign In';
  const forgotWrap = document.getElementById('forgot-password-wrap');

  if (isSignIn) {
    // Switching to Sign Up
    forgotWrap.classList.add('bc-hidden');
  } else {
    // Switching to Sign In
    forgotWrap.classList.remove('bc-hidden');
  }
  
  isSignUp = !isSignUp;

  document.getElementById('auth-title').textContent      = isSignUp ? 'Create Your Account' : 'Welcome Back';
  document.getElementById('auth-submit-btn').textContent = isSignUp ? 'Sign Up' : 'Sign In';
  document.getElementById('auth-toggle-btn').textContent = isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up";
  document.getElementById('auth-error').style.display    = 'none';

  // NEW: clear info box on mode switch
  document.getElementById('auth-info').style.display = 'none';
  document.getElementById('resend-btn').classList.add('bc-hidden');

  document.getElementById('auth-email').value    = '';
  document.getElementById('auth-password').value = '';

  resetPasswordToggle();
});

// ─────────────────────────────────────────
// AUTH SUBMIT
// ─────────────────────────────────────────

/** Handles Sign In and Sign Up form submission. Auth state changes are handled by onAuthStateChange. */
document.getElementById('auth-submit-btn').addEventListener('click', async () => {
  const email     = document.getElementById('auth-email').value.trim();
  const password  = document.getElementById('auth-password').value.trim();
  const errorEl   = document.getElementById('auth-error');
  const infoEl    = document.getElementById('auth-info');
  const infoText  = document.getElementById('auth-info-text');
  const resendBtn = document.getElementById('resend-btn');
  const submitBtn = document.getElementById('auth-submit-btn');

  // Clear previous messages
  errorEl.style.display = 'none';
  infoEl.style.display  = 'none';
  resendBtn.classList.add('bc-hidden');

  if (!email || !password) {
    errorEl.textContent   = 'Please enter both email and password.';
    errorEl.style.display = 'block';
    return;
  }

  // ── LOADING STATE ON ──
  submitBtn.disabled    = true;
  submitBtn.textContent = isSignUp ? '⏳ Creating account…' : '⏳ Signing in…';

  document.getElementById('auth-email').disabled = true; 
  document.getElementById('auth-password').disabled = true;  
  document.getElementById('toggle-password').disabled = true;

  if (isSignUp) {
    // ── SIGN UP ──
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: 'https://smoothbread-dev.github.io/budget-coach/'
      }
    });

    if (error) {
      errorEl.textContent   = error.message;
      errorEl.style.display = 'block';
    } else if (data?.user?.identities?.length === 0) {
      errorEl.textContent   = 'An account with this email already exists. Please sign in instead.';
      errorEl.style.display = 'block';
    } else {
      document.getElementById('auth-email').value    = '';
      document.getElementById('auth-password').value = '';
      infoText.textContent = '✅ Account created! Please check your inbox and confirm your email address before signing in.';
      infoEl.style.display = 'block';
      resendBtn.classList.remove('bc-hidden');
      resendBtn.dataset.email = email;
    }

  } else {
    // ── SIGN IN ──
    const { error } = await sb.auth.signInWithPassword({ email, password });

    if (error) {
      const isUnverified =
        error.message.toLowerCase().includes('email not confirmed') ||
        error.message.toLowerCase().includes('not confirmed');

      if (isUnverified) {
        infoText.textContent = '📬 Your email address hasn\'t been verified yet. Please check your inbox (or spam folder) and click the confirmation link before signing in.';
        infoEl.style.display = 'block';
        resendBtn.classList.remove('bc-hidden');
        resendBtn.dataset.email = email;
      } else {
        errorEl.textContent   = error.message;
        errorEl.style.display = 'block';
      }
    } else {
      infoEl.style.display = 'none';
    }
  }

  // ── LOADING STATE OFF ──
  submitBtn.disabled    = false;
  submitBtn.textContent = isSignUp ? 'Sign Up' : 'Sign In';
});

// ─────────────────────────────────────────
// RESEND CONFIRMATION EMAIL
// ─────────────────────────────────────────

/** Resends the confirmation email and gives the user feedback on the button itself. */
document.addEventListener('click', async (e) => {
  if (e.target.id !== 'resend-btn') return;

  const btn   = e.target;
  const email = btn.dataset.email;
  if (!email) return;

  btn.disabled     = true;
  btn.textContent  = '⏳ Sending…';

  const { error } = await sb.auth.resend({ type: 'signup', email });

  if (error) {
    btn.textContent = '⚠️ Failed to resend. Try again.';
    btn.disabled    = false;
  } else {
    btn.textContent = '✅ Email sent! Check your inbox.';
    // Re-enable after 30s to allow another resend attempt
    setTimeout(() => {
      btn.disabled    = false;
      btn.textContent = '📧 Resend confirmation email';
    }, 30000);
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
    const btn = e.target;

    // ── LOADING STATE ON ──
    btn.disabled    = true;
    btn.textContent = '⏳ Signing out…';

    await sb.auth.signOut();

    // ── LOADING STATE OFF (in case sign out fails) ──
    btn.disabled    = false;
    btn.textContent = 'Sign Out';
    document.getElementById('auth-email').disabled = false; 
    document.getElementById('auth-password').disabled = false;  
    document.getElementById('toggle-password').disabled = false;
  }
});

// ─────────────────────────────────────────
// USER AVATAR & DROPDOWN
// ─────────────────────────────────────────

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

// ─────────────────────────────────────────
// FORGOT PASSWORD
// ─────────────────────────────────────────

document.getElementById('forgot-password-btn').addEventListener('click', async () => {
  const email = document.getElementById('auth-email').value.trim();

  // Clear previous messages
  const errorEl = document.getElementById('auth-error');
  const infoEl  = document.getElementById('auth-info');
  const infoText = document.getElementById('auth-info-text');
  errorEl.classList.add('bc-hidden');
  infoEl.classList.add('bc-hidden');

  if (!email) {
    errorEl.textContent = 'Please enter your email address first.';
    errorEl.classList.remove('bc-hidden');
    return;
  }

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin  // adjust if you have a dedicated reset page
    });

    if (error) {
      errorEl.textContent = error.message || 'Failed to send reset email. Please try again.';
      errorEl.classList.remove('bc-hidden');
      return;
    }

    // Show success using existing auth-info box
    infoText.textContent = `📧 Password reset email sent to ${email}. Check your inbox and follow the link to reset your password.`;
    infoEl.classList.remove('bc-hidden');

  } catch (err) {
    errorEl.textContent = 'An unexpected error occurred. Please try again.';
    errorEl.classList.remove('bc-hidden');
    console.error('Forgot password error:', err);
  }
});
