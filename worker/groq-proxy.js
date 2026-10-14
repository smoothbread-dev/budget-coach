// Cloudflare Worker: authenticated, rate-limited proxy between Budget Coach and the Groq API.
// Secrets (wrangler secret put …): GROQ_API_KEY, SUPABASE_URL, SUPABASE_KEY
// Vars (wrangler.toml): ALLOWED_ORIGINS
// Binding (wrangler.toml): AI_RATE_LIMITER

const GROQ_URL       = 'https://api.groq.com/openai/v1/chat/completions';
const ALLOWED_MODELS = ['openai/gpt-oss-20b'];
const MAX_TOKENS     = 3000;
const MAX_BODY_BYTES = 32_000;
const MAX_MESSAGES   = 4;

export default {
  async fetch(request, env) {
    const origin  = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const cors = allowed.includes(origin)
      ? {
          'Access-Control-Allow-Origin':  origin,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age':       '86400',
          'Vary':                         'Origin'
        }
      : null;

    const reply = (status, message) => new Response(
      JSON.stringify({ error: { message } }),
      { status, headers: { ...(cors || {}), 'Content-Type': 'application/json' } }
    );

    if (!cors) return reply(403, 'Origin not allowed');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST')    return reply(405, 'Method not allowed');

    // Origin headers can be spoofed outside browsers, so also require a valid Supabase session.
    const authHeader = request.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return reply(401, 'Sign in required');

    const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: authHeader, apikey: env.SUPABASE_KEY }
    });
    if (!userRes.ok) return reply(401, 'Invalid or expired session');
    const user = await userRes.json();

    if (env.AI_RATE_LIMITER) {
      const { success } = await env.AI_RATE_LIMITER.limit({ key: user.id });
      if (!success) return reply(429, 'Too many requests. Please wait a minute and try again.');
    }

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return reply(413, 'Request too large');

    let body;
    try { body = JSON.parse(raw); } catch { return reply(400, 'Invalid JSON'); }

    const messages = Array.isArray(body.messages) ? body.messages : [];
    const valid = messages.length > 0 && messages.length <= MAX_MESSAGES &&
      messages.every(m => ['user', 'system'].includes(m?.role) && typeof m.content === 'string');
    if (!valid) return reply(400, 'Invalid messages');

    const upstream = await fetch(GROQ_URL, {
      method:  'POST',
      headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        model:       ALLOWED_MODELS.includes(body.model) ? body.model : ALLOWED_MODELS[0],
        messages:    messages.map(({ role, content }) => ({ role, content })),
        temperature: Math.min(1, Math.max(0, Number(body.temperature) || 0.2)),
        max_tokens:  Math.min(MAX_TOKENS, Number(body.max_tokens) || MAX_TOKENS)
      })
    });

    return new Response(upstream.body, {
      status:  upstream.status,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
};
