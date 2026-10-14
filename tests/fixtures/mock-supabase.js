// In-memory stand-in for the Supabase UMD bundle (window.supabase.createClient).
// Configure before the app loads via window.__MOCK_CONFIG__ = { signedIn, seed }.
// Tests control it at runtime through window.__mock (db, calls, fail()).
(() => {
  const TABLES = ['user_defaults', 'recurring_items', 'month_plans', 'savings_categories', 'savings_adjustments', 'plan_savings'];
  const USER = { id: 'user-1', email: 'tester@example.com' };

  const config = window.__MOCK_CONFIG__ || {};
  const db = Object.fromEntries(TABLES.map(t => [t, structuredClone(config.seed?.[t] || [])]));
  const failures = [];
  const calls = [];
  let session = config.signedIn ? { user: USER, access_token: 'test-token' } : null;
  let seq = 1000;

  window.__mock = {
    db,
    calls,
    user: USER,
    /** Makes the next `times` matching operations fail. op: select|insert|update|upsert|delete|auth:* */
    fail(table, op, times = 1) { failures.push({ table, op, times }); }
  };

  function takeFailure(table, op) {
    const f = failures.find(x => (x.table === table || x.table === '*') && (x.op === op || x.op === '*') && x.times > 0);
    if (!f) return null;
    f.times -= 1;
    return { message: `Simulated ${op} failure on ${table}`, code: 'MOCK' };
  }

  function query(table) {
    if (!TABLES.includes(table)) throw new Error(`Mock: unknown table ${table}`);
    let op = 'select', payload = null, single = false, maybe = false, options = {};
    const filters = [];

    const matches = row => filters.every(([k, v]) => String(row[k]) === String(v));

    function run() {
      calls.push({ table, op, filters: [...filters], payload: structuredClone(payload) });
      const error = takeFailure(table, op);
      if (error) return { data: null, error };

      const rows = db[table];
      switch (op) {
        case 'select': {
          const out = rows.filter(matches);
          return { data: single || maybe ? (out[0] ?? null) : structuredClone(out), error: null };
        }
        case 'insert': {
          const inserted = payload.map(p => ({ id: `${table}-${seq++}`, created_at: new Date().toISOString(), ...p }));
          rows.push(...inserted);
          return { data: single ? structuredClone(inserted[0]) : structuredClone(inserted), error: null };
        }
        case 'update':
          rows.filter(matches).forEach(r => Object.assign(r, payload));
          return { data: null, error: null };
        case 'delete': {
          const keep = rows.filter(r => !matches(r));
          rows.splice(0, rows.length, ...keep);
          return { data: null, error: null };
        }
        case 'upsert': {
          const keys = (options.onConflict || 'id').split(',');
          const existing = rows.find(r => keys.every(k => r[k] === payload[k]));
          if (existing) Object.assign(existing, payload);
          else rows.push({ id: `${table}-${seq++}`, ...payload });
          return { data: null, error: null };
        }
      }
    }

    const builder = {
      select()        { return builder; },
      order()         { return builder; },
      limit()         { return builder; },
      eq(k, v)        { filters.push([k, v]); return builder; },
      insert(p)       { op = 'insert'; payload = Array.isArray(p) ? p : [p]; return builder; },
      update(p)       { op = 'update'; payload = p; return builder; },
      upsert(p, o)    { op = 'upsert'; payload = p; options = o || {}; return builder; },
      delete()        { op = 'delete'; return builder; },
      single()        { single = true; return builder; },
      maybeSingle()   { maybe = true; return builder; },
      then(resolve, reject) { return Promise.resolve().then(run).then(resolve, reject); }
    };
    return builder;
  }

  const listeners = [];
  const emit = (event) => listeners.forEach(cb => cb(event, session));
  const authResult = (op, ok) => {
    const error = takeFailure('auth', op);
    return error ? { data: null, error } : ok();
  };

  const auth = {
    onAuthStateChange(cb) {
      listeners.push(cb);
      setTimeout(() => cb('INITIAL_SESSION', session), 0);
      return { data: { subscription: { unsubscribe() {} } } };
    },
    async signInWithPassword({ email, password }) {
      calls.push({ table: 'auth', op: 'signIn', payload: { email } });
      if (email.startsWith('unconfirmed')) return { data: null, error: { message: 'Email not confirmed' } };
      if (password === 'wrong-password')   return { data: null, error: { message: 'Invalid login credentials' } };
      return authResult('signIn', () => {
        session = { user: { ...USER, email }, access_token: 'test-token' };
        emit('SIGNED_IN');
        return { data: { session }, error: null };
      });
    },
    async signUp({ email, options }) {
      calls.push({ table: 'auth', op: 'signUp', payload: { email, options } });
      return authResult('signUp', () => ({ data: { user: { identities: [] } }, error: null }));
    },
    async signOut() {
      calls.push({ table: 'auth', op: 'signOut' });
      session = null;
      emit('SIGNED_OUT');
      return { error: null };
    },
    async getSession()              { return { data: { session } }; },
    async resend(args)              { calls.push({ table: 'auth', op: 'resend', payload: args }); return authResult('resend', () => ({ error: null })); },
    async resetPasswordForEmail(email, options) {
      calls.push({ table: 'auth', op: 'resetPassword', payload: { email, options } });
      return authResult('resetPassword', () => ({ error: null }));
    },
    async updateUser(args)          { calls.push({ table: 'auth', op: 'updateUser', payload: { hasPassword: !!args.password } }); return authResult('updateUser', () => ({ error: null })); }
  };

  window.supabase = { createClient: () => ({ from: query, auth }) };
})();
