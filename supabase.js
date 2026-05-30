// supabase.js
const SUPABASE_URL = 'https://ovjoxowtubkzlbthnigw.supabase.co'
const SUPABASE_KEY = 'sb_publishable_gp9FtJKT8qIXxIzYqndXMw_IEhOdA3o'

const { createClient } = supabase
const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── Auth State ───────────────────────────────────────────
let currentUser = null
let isSignUp = false

// Check if user is already logged in on page load
sb.auth.onAuthStateChange((event, session) => {
  if (session?.user) {
    currentUser = session.user
    showApp()
  } else {
    currentUser = null
    showAuth()
  }
})

// ─── Show/Hide UI ─────────────────────────────────────────
function showApp() {
  document.getElementById('auth-modal').style.display = 'none'

  const app = document.getElementById('app')
  app.style.display = 'block'

  if (app.dataset.loaded) return
  app.dataset.loaded = 'true'

  const template = document.getElementById('app-template')
  app.appendChild(template.content.cloneNode(true))

  if (typeof initApp === 'function') initApp()
}

// ─── Show Auth (clears app content on logout) ─────────────
function showAuth() {
  document.getElementById('auth-modal').style.display = 'flex'

  // ✅ Clear auth fields so previous user's credentials are never shown
  document.getElementById('auth-email').value    = ''
  document.getElementById('auth-password').value = ''

  // ✅ Reset toggle state back to Sign In every time auth screen appears
  isSignUp = false
  document.getElementById('auth-title').textContent      = 'Welcome Back'
  document.getElementById('auth-submit-btn').textContent  = 'Sign In'
  document.getElementById('auth-toggle-btn').textContent  = "Don't have an account? Sign Up"
  document.getElementById('auth-error').style.display     = 'none'

  // Clear app content completely on logout
  const app = document.getElementById('app')
  app.style.display = 'none'
  app.innerHTML = ''
  delete app.dataset.loaded
}

// ─── Toggle Sign In / Sign Up ─────────────────────────────
document.getElementById('auth-toggle-btn').addEventListener('click', () => {
  isSignUp = !isSignUp
  document.getElementById('auth-title').textContent      = isSignUp ? 'Create Your Account' : 'Welcome Back'
  document.getElementById('auth-submit-btn').textContent  = isSignUp ? 'Sign Up' : 'Sign In'
  document.getElementById('auth-toggle-btn').textContent  = isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"
  document.getElementById('auth-error').style.display     = 'none'

  // ✅ Clear fields on every toggle
  document.getElementById('auth-email').value    = ''
  document.getElementById('auth-password').value = ''
})

// ─── Sign In / Sign Up Handler ────────────────────────────
document.getElementById('auth-submit-btn').addEventListener('click', async () => {
  const email    = document.getElementById('auth-email').value.trim()
  const password = document.getElementById('auth-password').value.trim()
  const errorEl  = document.getElementById('auth-error')

  if (!email || !password) {
    errorEl.textContent    = 'Please enter both email and password.'
    errorEl.style.display  = 'block'
    return
  }

  let result

  if (isSignUp) {
    result = await sb.auth.signUp({ email, password })
  } else {
    result = await sb.auth.signInWithPassword({ email, password })
  }

  if (result.error) {
    errorEl.textContent   = result.error.message
    errorEl.style.display = 'block'
  } else {
    errorEl.style.display = 'none'
  }
  // onAuthStateChange handles the rest automatically ✅
})

// ─── Sign Out ─────────────────────────────────────────────
document.addEventListener('click', async (e) => {
  if (e.target.id === 'logout-btn') {
    await sb.auth.signOut()
    // ✅ showAuth() is triggered automatically via onAuthStateChange,
    // which now handles field clearing and state reset ✅
  }
})
