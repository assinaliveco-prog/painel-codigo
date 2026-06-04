'use strict';

/**
 * Painel de Codigo - servidor HTTP puro (sem dependencias npm).
 *
 * Duas formas de receber o codigo:
 *   1) Leitor Graph (poller.js) le o Hotmail/Outlook direto e chama ingest().
 *   2) POST /ingest (Apps Script, Power Automate, etc.) tambem chama ingest().
 *
 * Rotas:
 *   POST /ingest                 -> { code } OU { subject, body/text } (Bearer token)
 *   GET  /p/<PANEL_SLUG>         -> pagina do painel
 *   GET  /p/<PANEL_SLUG>/latest  -> JSON com o ultimo codigo + recentes
 *   GET  /health                 -> { ok: true }
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT || '8080', 10);
const PANEL_SLUG = process.env.PANEL_SLUG || '';
const INGEST_TOKEN = process.env.INGEST_TOKEN || '';
const ACCOUNT_LABEL = process.env.ACCOUNT_LABEL || 'Conta Microsoft';
const MAX_CODES = parseInt(process.env.MAX_CODES || '50', 10);
const DATA_DIR = process.env.DATA_DIR || '/data';
const DATA_FILE = path.join(DATA_DIR, 'codes.json');

if (!PANEL_SLUG || PANEL_SLUG.length < 12) {
  console.error('FATAL: defina PANEL_SLUG (>=12 chars aleatorios) no .env');
  process.exit(1);
}
if (!INGEST_TOKEN || INGEST_TOKEN.length < 16) {
  console.error('FATAL: defina INGEST_TOKEN (>=16 chars aleatorios) no .env');
  process.exit(1);
}

// ---- armazenamento simples em arquivo JSON ----
let codes = [];
try {
  if (fs.existsSync(DATA_FILE)) codes = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) || [];
} catch (e) {
  console.error('aviso: nao consegui ler', DATA_FILE, e.message);
  codes = [];
}

function persist() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(codes.slice(0, MAX_CODES)), 'utf8');
  } catch (e) {
    console.error('erro salvando codigos:', e.message);
  }
}

// ---- helpers ----
function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function safeEqual(a, b) {
  const A = Buffer.from(String(a)), B = Buffer.from(String(b));
  if (A.length !== B.length) return false;
  try { return crypto.timingSafeEqual(A, B); } catch (e) { return false; }
}
function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req, cb) {
  let data = '', size = 0;
  req.on('data', function (ch) {
    size += ch.length;
    if (size > 100000) { req.destroy(); cb(new Error('payload muito grande')); return; }
    data += ch;
  });
  req.on('end', function () { cb(null, data); });
  req.on('error', function (e) { cb(e); });
}

// ---- extracao do codigo + filtro de troca de senha (fonte unica) ----
function stripHtml(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&');
}
const RESET_TERMS = [
  'redefin', 'recuper', 'reset your password', 'password reset',
  'alterar a senha', 'alterar sua senha', 'change your password'
];
function isPasswordReset(text) {
  const low = String(text || '').toLowerCase();
  return RESET_TERMS.some(function (t) { return low.indexOf(t) !== -1; });
}
function extractCode(text) {
  if (!text) return null;
  let m = text.match(/(?:c[oó]digo de seguran[cç]a|security code|c[oó]digo|code)[:\s]*([0-9]{4,8})/i);
  if (m) return m[1];
  m = text.match(/\b([0-9]{6,7})\b/);
  if (m) return m[1];
  return null;
}

/**
 * Recebe { code } OU { subject, body/text/bodyPreview/html }.
 * Aplica filtro de senha, extrai o codigo, guarda. So codigo de LOGIN passa.
 */
function ingest(data) {
  const rawText = [data.subject, data.text, data.bodyPreview, data.body, data.html]
    .filter(Boolean).map(String).join('\n');
  const clean = stripHtml(rawText);

  if (clean && isPasswordReset(clean)) return { ok: true, ignored: 'password_reset' };

  let code = (data.code == null ? '' : String(data.code)).trim();
  if (!/^\d{4,8}$/.test(code)) code = extractCode(clean) || '';
  if (!/^\d{4,8}$/.test(code)) return { ok: false, error: 'sem codigo' };

  let receivedAt;
  try { receivedAt = data.receivedAt ? new Date(data.receivedAt).toISOString() : new Date().toISOString(); }
  catch (e) { receivedAt = new Date().toISOString(); }

  const now = Date.now();
  const dup = codes.find(function (c) {
    return c.code === code && (now - new Date(c.receivedAt).getTime()) < 90000;
  });
  if (!dup) {
    codes.unshift({
      code: code,
      receivedAt: receivedAt,
      subject: String(data.subject || '').slice(0, 200),
      insertedAt: new Date().toISOString(),
    });
    codes = codes.slice(0, MAX_CODES);
    persist();
  }
  return { ok: true, duplicate: !!dup };
}

// ---- HTML do painel (carregado 1x, com o rotulo da conta injetado) ----
let PANEL_HTML = '<!doctype html><meta charset="utf-8"><h1>Painel</h1><p>panel.html nao encontrado.</p>';
try {
  PANEL_HTML = fs.readFileSync(path.join(__dirname, 'public', 'panel.html'), 'utf8')
    .replace(/{{ACCOUNT_LABEL}}/g, esc(ACCOUNT_LABEL));
} catch (e) {
  console.error('aviso: panel.html nao carregado:', e.message);
}

const PANEL_BASE = '/p/' + PANEL_SLUG;

const server = http.createServer(function (req, res) {
  let pathname;
  try { pathname = new URL(req.url, 'http://localhost').pathname; }
  catch (e) { res.writeHead(400); res.end('bad request'); return; }

  if (pathname === '/health') return json(res, 200, { ok: true });

  if (pathname === '/robots.txt') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('User-agent: *\nDisallow: /\n');
  }

  if (pathname === '/ingest' && req.method === 'POST') {
    const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
    if (!safeEqual(token, INGEST_TOKEN)) return json(res, 401, { error: 'unauthorized' });
    return readBody(req, function (err, body) {
      if (err) return json(res, 400, { error: 'bad body' });
      let data;
      try { data = JSON.parse(body || '{}'); } catch (e) { return json(res, 400, { error: 'invalid json' }); }
      const r = ingest(data);
      return json(res, r.ok ? 200 : 400, r);
    });
  }

  if (pathname === PANEL_BASE + '/latest') {
    return json(res, 200, {
      account: ACCOUNT_LABEL,
      latest: codes[0] || null,
      recent: codes.slice(0, 5),
      serverTime: new Date().toISOString(),
    });
  }

  if (pathname === PANEL_BASE || pathname === PANEL_BASE + '/') {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'no-referrer',
    });
    return res.end(PANEL_HTML);
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, function () {
  console.log('Painel de Codigo rodando na porta ' + PORT);
  console.log('Painel em:  /p/' + PANEL_SLUG);
  console.log('Ingest em:  POST /ingest');

  // liga o leitor do Hotmail (Microsoft Graph), se configurado
  try {
    require('./poller').startPoller({
      onCode: function (m) {
        const r = ingest(m);
        if (r.ok && r.duplicate === false && !r.ignored) console.log('[poller] codigo novo guardado.');
      },
    });
  } catch (e) {
    console.error('poller indisponivel:', e.message);
  }
});
