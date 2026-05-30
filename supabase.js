// supabase.js
const SUPABASE_URL = 'https://ovjoxowtubkzlbthnigw.supabase.co/rest/v1/'         // 👈 Project URL
const SUPABASE_KEY = 'sb_publishable_gp9FtJKT8qIXxIzYqndXMw_IEhOdA3o'            // 👈 Publishable key

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
  document.getElementById('app').style.display = 'block'
  console.log('✅ Logged in as:', currentUser.email)
}

function showAuth() {
  document.getElementById('auth-modal').style.display = 'flex'
  document.getElementById('app').style.display = 'none'
}

// ─── Toggle Sign In / Sign Up ─────────────────────────────
document.getElementById('auth-toggle-btn').addEventListener('click', () => {
  isSignUp = !isSignUp
  document.getElementById('auth-title').textContent = isSignUp
    ? 'Create Your Account'
    : 'Welcome Back'
  document.getElementById('auth-submit-btn').textContent = isSignUp
    ? 'Sign Up'
    : 'Sign In'
  document.getElementById('auth-toggle-btn').textContent = isSignUp
    ? 'Already have an account? Sign In'
    : "Don't have an account? Sign Up"
  document.getElementById('auth-error').style.display = 'none'
})

// ─── Sign In / Sign Up Handler ────────────────────────────
document.getElementById('auth-submit-btn').addEventListener('click', async () => {
  const email = document.getElementById('auth-email').value.trim()
  const password = document.getElementById('auth-password').value.trim()
  const errorEl = document.getElementById('auth-error')

  if (!email || !password) {
    errorEl.textContent = 'Please enter both email and password.'
    errorEl.style.display = 'block'
    return
  }

  let result

  if (isSignUp) {
    result = await sb.auth.signUp({ email, password })
  } else {
    result = await sb.auth.signInWithPassword({ email, password })
  }

  if (result.error) {
    errorEl.textContent = result.error.message
    errorEl.style.display = 'block'
  } else {
    errorEl.style.display = 'none'
  }
  // onAuthStateChange handles the rest automatically ✅
})

// ─── Sign Out ─────────────────────────────────────────────
document.getElementById('logout-btn').addEventListener('click', async () => {
  await sb.auth.signOut()
  // onAuthStateChange handles showing auth screen automatically ✅
})
