// Authentication: sign in / sign up, password reset, change password, user menu.
import { sb } from '../supabaseClient.js';
import { AUTH_REDIRECT_URL, MIN_PASSWORD_LENGTH } from '../config.js';
import { $, show } from '../utils.js';
import { registerActions } from '../ui/actions.js';
import { openPanel, closePanel, showAlert } from '../ui/modals.js';
import { flush } from './sync.js';

const RESEND_COOLDOWN_MS = 60_000;

let isSignUp       = false;
let activeUserId   = null;
let recoveryPending = window.location.hash.includes('type=recovery');
let callbacks      = { onSignedIn: async () => {}, onSignedOut: () => {} };

// ─────────────────────────────────────────
// AUTH SCREEN HELPERS
// ─────────────────────────────────────────

function setAuthError(message = '') {
  $('auth-error').textContent = message;
  show('auth-error', !!message);
}

function setAuthInfo(message = '', resendEmail = null) {
  $('auth-info-text').textContent = message;
  show('auth-info', !!message);
  show('resend-btn', !!resendEmail);
  if (resendEmail) $('resend-btn').dataset.email = resendEmail;
}

function setFormBusy(busy, label) {
  ['auth-email', 'auth-password', 'toggle-password', 'auth-toggle-btn', 'forgot-password-btn']
    .forEach(id => { $(id).disabled = busy; });
  const submit = $('auth-submit-btn');
  submit.disabled    = busy;
  submit.textContent = busy ? label : (isSignUp ? 'Sign Up' : 'Sign In');
}

function setPasswordVisible(visible) {
  $('auth-password').type = visible ? 'text' : 'password';
  show('icon-eye-open', !visible);
  show('icon-eye-closed', visible);
  $('toggle-password').setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
  $('toggle-password').setAttribute('aria-pressed', String(visible));
}

function setMode(signUp) {
  isSignUp = signUp;
  $('auth-title').textContent      = signUp ? 'Create Your Account' : 'Welcome Back';
  $('auth-submit-btn').textContent = signUp ? 'Sign Up' : 'Sign In';
  $('auth-toggle-btn').textContent = signUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up";
  $('auth-password').autocomplete  = signUp ? 'new-password' : 'current-password';
  show('forgot-password-wrap', !signUp);
  show('password-hint', signUp);

  $('auth-email').value    = '';
  $('auth-password').value = '';
  setAuthError();
  setAuthInfo();
  setPasswordVisible(false);
}

export function showAuthScreen() {
  setMode(false);
  setFormBusy(false);
  show('auth-modal', true);
}

export function hideAuthScreen() {
  show('auth-modal', false);
}

// ─────────────────────────────────────────
// SIGN IN / SIGN UP
// ─────────────────────────────────────────

async function handleSubmit(event) {
  event.preventDefault();
  const email    = $('auth-email').value.trim();
  const password = $('auth-password').value;

  setAuthError();
  setAuthInfo();

  if (!email || !password) { setAuthError('Please enter both email and password.'); return; }
  if (isSignUp && password.length < MIN_PASSWORD_LENGTH) {
    setAuthError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    return;
  }

  setFormBusy(true, isSignUp ? '⏳ Creating account…' : '⏳ Signing in…');
  try {
    if (isSignUp) {
      const { error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: AUTH_REDIRECT_URL } });
      if (error) { setAuthError(error.message); return; }
      $('auth-password').value = '';
      // Same message whether or not the email is already registered, to avoid account enumeration.
      setAuthInfo('✅ Check your inbox for a confirmation link to finish creating your account. If you already have an account, sign in instead.', email);
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (!error) return;
      if (/not confirmed/i.test(error.message)) {
        setAuthInfo("📬 Your email address hasn't been verified yet. Please check your inbox (or spam folder) and click the confirmation link.", email);
      } else {
        setAuthError('Invalid email or password.');
      }
    }
  } catch (err) {
    console.error('Auth error:', err);
    setAuthError('Something went wrong. Please check your connection and try again.');
  } finally {
    setFormBusy(false);
  }
}

async function resendConfirmation(btn) {
  const email = btn.dataset.email;
  if (!email) return;

  btn.textContent = '⏳ Sending…';
  const { error } = await sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: AUTH_REDIRECT_URL } });

  if (error) {
    btn.textContent = '⚠️ Failed to resend. Try again.';
    return;
  }
  btn.textContent = '✅ Email sent! Check your inbox.';
  btn.dataset.cooldown = 'true';
  setTimeout(() => {
    delete btn.dataset.cooldown;
    btn.textContent = '📧 Resend confirmation email';
  }, RESEND_COOLDOWN_MS);
}

async function forgotPassword() {
  const email = $('auth-email').value.trim();
  setAuthError();
  setAuthInfo();

  if (!email) { setAuthError('Please enter your email address first.'); return; }

  const btn = $('forgot-password-btn');
  btn.textContent = '⏳ Sending reset email…';
  try {
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: AUTH_REDIRECT_URL });
    if (error) { setAuthError(error.message || 'Failed to send reset email. Please try again.'); return; }
    setAuthInfo(`📧 If an account exists for ${email}, a password reset link is on its way.`);
  } catch (err) {
    console.error('Forgot password error:', err);
    setAuthError('An unexpected error occurred. Please try again.');
  } finally {
    btn.textContent = 'Forgot password?';
  }
}

// ─────────────────────────────────────────
// SIGNED-IN USER MENU
// ─────────────────────────────────────────

export function setUserAvatar(email = '') {
  $('user-avatar-initial').textContent = email ? email.charAt(0).toUpperCase() : '?';
  $('user-dropdown-email').textContent = email;
}

function setMenuOpen(open) {
  $('user-dropdown')?.classList.toggle('open', open);
  $('user-avatar-btn')?.setAttribute('aria-expanded', String(open));
}

async function signOut(btn) {
  setMenuOpen(false);
  btn.textContent = '⏳ Signing out…';
  await flush();
  const { error } = await sb.auth.signOut();
  if (error) {
    btn.textContent = '🚪 Sign Out';
    showAlert('Could not sign out. Please try again.', 'error');
  }
}

// ─────────────────────────────────────────
// CHANGE PASSWORD
// ─────────────────────────────────────────

function openChangePassword() {
  setMenuOpen(false);
  $('cp-new-password').value     = '';
  $('cp-confirm-password').value = '';
  show('cp-error', false);
  openPanel('change-password-modal', 'cp-new-password');
}

async function submitChangePassword() {
  const newPass = $('cp-new-password').value;
  const confirm = $('cp-confirm-password').value;
  const errorEl = $('cp-error');
  const fail = (msg) => { errorEl.textContent = msg; show(errorEl, true); };

  show(errorEl, false);
  if (newPass.length < MIN_PASSWORD_LENGTH) return fail(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (newPass !== confirm)                  return fail('Passwords do not match.');

  const { error } = await sb.auth.updateUser({ password: newPass });
  if (error) return fail(error.message || 'Failed to update password.');

  closePanel('change-password-modal');
  showAlert('Your password has been updated successfully! 🎉', 'success');
}

// ─────────────────────────────────────────
// AUTH STATE
// ─────────────────────────────────────────

async function handleAuthEvent(event, session) {
  if (event === 'PASSWORD_RECOVERY') recoveryPending = true;
  const user = session?.user ?? null;

  if (!user) {
    activeUserId = null;
    callbacks.onSignedOut();
    return;
  }

  // Token refreshes and tab refocus re-emit SIGNED_IN; only initialise once per user.
  if (user.id !== activeUserId) {
    activeUserId = user.id;
    await callbacks.onSignedIn(user);
  }

  if (recoveryPending) {
    recoveryPending = false;
    history.replaceState(null, '', window.location.pathname);
    openChangePassword();
  }
}

/** callbacks: { onSignedIn(user): Promise, onSignedOut(): void } */
export function initAuth(cb) {
  callbacks = cb;

  $('auth-form').addEventListener('submit', handleSubmit);

  // Defer work out of the callback: awaiting Supabase calls inside it can deadlock the client.
  sb.auth.onAuthStateChange((event, session) => {
    setTimeout(() => handleAuthEvent(event, session), 0);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#user-menu')) setMenuOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setMenuOpen(false);
  });
}

registerActions({
  'toggle-auth-mode':       () => setMode(!isSignUp),
  'toggle-password':        () => setPasswordVisible($('auth-password').type === 'password'),
  'forgot-password':        forgotPassword,
  'resend-confirmation':    el => { if (!el.dataset.cooldown) return resendConfirmation(el); },
  'toggle-user-menu':       () => setMenuOpen(!$('user-dropdown').classList.contains('open')),
  'sign-out':               signOut,
  'open-change-password':   openChangePassword,
  'submit-change-password': submitChangePassword
});
