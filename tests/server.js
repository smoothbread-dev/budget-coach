// Zero-dependency static server for tests. Serves the repo and swaps the Supabase CDN
// script in index.html for the in-memory mock, so tests never touch a real project.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || '127.0.0.1';
// MOCK=0 serves the real app, injecting SUPABASE_URL / SUPABASE_KEY from .env.local into js/config.js.
const USE_MOCK = process.env.MOCK !== '0';

function loadEnvFile() {
  try {
    const text = readFileSync(join(ROOT, '.env.local'), 'utf8');
    return Object.fromEntries(text.split(/\r?\n/)
      .map(line => line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/))
      .filter(Boolean)
      .map(([, k, v]) => [k, v.replace(/^(['"])(.*)\1$/, '$2')]));
  } catch {
    return {};
  }
}

const ENV = USE_MOCK ? {} : loadEnvFile();
if (!USE_MOCK && !(ENV.SUPABASE_URL && ENV.SUPABASE_KEY)) {
  console.error('Missing SUPABASE_URL / SUPABASE_KEY. Copy .env.example to .env.local and fill them in.');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.svg':  'image/svg+xml',
  '.json': 'application/json'
};

const SUPABASE_CDN_TAG = /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase[\s\S]*?<\/script>/;

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';

    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }

    let body = await readFile(file);
    if (path === '/index.html' && USE_MOCK) {
      const html = body.toString('utf8');
      if (!SUPABASE_CDN_TAG.test(html)) throw new Error('Supabase CDN <script> not found in index.html');
      body = html.replace(SUPABASE_CDN_TAG, '<script src="/tests/fixtures/mock-supabase.js"></script>');
    }

    if (path === '/js/config.js' && !USE_MOCK) {
      body = body.toString('utf8')
        .replace('SUPABASE_URL_PLACEHOLDER', ENV.SUPABASE_URL)
        .replace('SUPABASE_KEY_PLACEHOLDER', ENV.SUPABASE_KEY);
    }

    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch (err) {
    res.writeHead(err.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain' });
    res.end(String(err.message));
  }
}).listen(PORT, HOST, () =>
  console.log(`Budget Coach on http://${HOST}:${PORT} (${USE_MOCK ? 'mock backend' : 'real Supabase'})`));
