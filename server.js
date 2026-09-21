require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const UAParser = require('ua-parser-js');
const { customAlphabet } = require('nanoid');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 7);

app.use(express.json());

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    const originHost = origin.replace(/^https?:\/\//, '').split('/')[0];
    if (originHost !== req.headers.host) {
      return res.status(403).json({ error: 'Forbidden origin' });
    }
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

app.get('/index.html', (req, res) => res.redirect('/'));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

const isValidUrl = (string) => {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
};

const sanitizeUrl = (url) => {
  let clean = url.trim();
  if (!/^https?:\/\//i.test(clean)) {
    clean = 'https://' + clean;
  }
  return clean;
};

// ==================== Autentikasi & Private Mode ====================
const COOKIE_NAME = 'cslink_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getConfig(key) {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setConfig(key, value) {
  db.prepare('INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value);
}

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}

function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function uaLabel(name, version) {
  if (!name) return 'Unknown';
  const major = parseInt(String(version).split('.')[0], 10);
  return major ? `${name} ${major}` : String(name);
}

// Deteksi perayap / pengujian otomatis: jangan dicatat sebagai klik manusia & jangan disuguhi iklan
const BOT_UA_RE = /bot|crawl|spider|slurp|curl|wget|python|node-fetch|axios|okhttp|go-http-client|headlesschrome|phantom|selenium|puppeteer|playwright|facebookexternalhit|facebot|whatsapp|telegrambot|discordbot|slackbot|skypeuripreview|ahrefs|semrush|mj12bot|dotbot|baiduspider|yandex|bingbot|bingpreview|duckduckbot|googlebot|petalbot|applebot|amazonbot|uptimerobot|pingdom|postman|httpclient|wordpress|wpscan/i;

function isBotUA(ua) {
  if (!ua || typeof ua !== 'string') return true;
  return BOT_UA_RE.test(ua);
}

// Migrasi sekali: isi browser/os yang sebelumnya 'Unknown' dari user_agent mentah yang tersimpan
function backfillClickUA() {
  if (getConfig('ua_backfill_v1')) return;
  const rows = db.prepare(`SELECT id, user_agent FROM clicks WHERE browser = 'Unknown' OR os = 'Unknown'`).all();
  const upd = db.prepare('UPDATE clicks SET browser = ?, os = ? WHERE id = ?');
  let changed = 0;
  for (const r of rows) {
    if (!r.user_agent) continue;
    const info = new UAParser(r.user_agent).getResult();
    const b = uaLabel(info.browser.name, info.browser.version);
    const o = uaLabel(info.os.name, info.os.version);
    if (b !== 'Unknown' || o !== 'Unknown') {
      upd.run(b, o, r.id);
      changed++;
    }
  }
  setConfig('ua_backfill_v1', String(changed));
  if (changed) console.log(`[ua] backfill ${changed} click rows dari user-agent tersimpan`);
}

// Geo-IP: cache per IP + antrean latar belakang (tidak memblokir redirect)
const GEO_API = process.env.GEO_API_BASE || 'https://ipwho.is';

function visitorIp(req) {
  const peer = String(req.ip || req.connection.remoteAddress || '');
  const fromProxy = peer === '127.0.0.1' || peer === '::1' || peer === '::ffff:127.0.0.1';
  if (fromProxy) {
    const fwd = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.headers['x-real-ip'];
    if (fwd) return String(fwd).split(',')[0].trim();
  }
  return peer;
}

function cachedIpInfo(ip) {
  return ip ? db.prepare('SELECT country, country_code FROM ip_info WHERE ip = ?').get(ip) : null;
}

const geoQueue = [];
let geoBusy = false;

async function lookupGeo(ip) {
  const ctrl = AbortSignal.timeout(4000);
  const res = await fetch(`${GEO_API}/${encodeURIComponent(ip)}`, { signal: ctrl });
  const j = await res.json();
  if (!j || j.success === false || !j.country) return null;
  return { country: String(j.country), country_code: String(j.country_code || '??').toLowerCase() };
}

function runGeoQueue() {
  if (geoBusy || !geoQueue.length) return;
  geoBusy = true;
  const ip = geoQueue.shift();
  lookupGeo(ip)
    .then(info => {
      if (info) {
        db.prepare('INSERT INTO ip_info (ip, country, country_code) VALUES (?, ?, ?) ON CONFLICT(ip) DO UPDATE SET country = excluded.country, country_code = excluded.country_code, fetched_at = CURRENT_TIMESTAMP')
          .run(ip, info.country, info.country_code);
        db.prepare("UPDATE clicks SET country = ?, country_code = ? WHERE ip_address = ? AND (country IS NULL OR country = '')")
          .run(info.country, info.country_code, ip);
      }
    })
    .catch(() => {})
    .finally(() => {
      geoBusy = false;
      if (geoQueue.length) setTimeout(runGeoQueue, 150);
    });
}

function trackGeo(ip) {
  if (!ip) return null;
  const cached = cachedIpInfo(ip);
  if (cached) return cached;
  geoQueue.push(ip);
  if (!geoBusy) setTimeout(runGeoQueue, 0);
  return null;
}

function setupRequired() {
  return !getConfig('admin_pass_hash');
}

function issueSession(res, username) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_TTL_MS).toISOString().slice(0, 19);
  db.prepare('INSERT INTO sessions (token, username, expires_at) VALUES (?, ?, ?)').run(token, username, expires);
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`);
  return token;
}

function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

function getSession(req) {
  const header = req.headers.cookie || '';
  const match = header.split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE_NAME + '='));
  if (!match) return null;
  const token = match.slice(COOKIE_NAME.length + 1);
  const row = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return row;
}

function requireAuth(req, res, next) {
  const apiKey = process.env.API_KEY || '';
  const provided = req.headers['x-api-key'] || '';
  if (apiKey !== '' && provided === apiKey) {
    req.user = 'api';
    return next();
  }
  const session = getSession(req);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.user = session.username;
  next();
}

app.get('/', (req, res) => {
  if (!getSession(req)) {
    if (process.env.PUBLIC_HOME === 'true') {
      return res.sendFile(path.join(__dirname, 'public', 'landing.html'));
    }
    return res.redirect('/login');
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Halaman akun publik
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'public', 'register.html')));
app.get('/member/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'member-login.html')));
app.get('/member', (req, res) => res.sendFile(path.join(__dirname, 'public', 'member.html')));
app.get('/premium', (req, res) => res.sendFile(path.join(__dirname, 'public', 'premium.html')));
app.get('/payment', (req, res) => res.sendFile(path.join(__dirname, 'public', 'payment.html')));
app.get('/fitur', (req, res) => res.sendFile(path.join(__dirname, 'public', 'fitur.html')));
app.get('/faq', (req, res) => res.sendFile(path.join(__dirname, 'public', 'faq.html')));

app.get('/api/auth/status', (req, res) => {
  const session = getSession(req);
  res.json({
    setup_required: setupRequired(),
    authenticated: !!session,
    username: session ? session.username : null
  });
});

app.post('/api/setup', (req, res) => {
  if (!setupRequired()) return res.status(403).json({ error: 'Setup sudah dilakukan' });
  const { username, password } = req.body || {};
  if (!username || !/^[a-zA-Z0-9_.-]{3,30}$/.test(username)) {
    return res.status(400).json({ error: 'Username 3-30 karakter (huruf, angka, ._-)' });
  }
  if (!password || String(password).length < 6) {
    return res.status(400).json({ error: 'Password minimal 6 karakter' });
  }
  const salt = crypto.randomBytes(16).toString('hex');
  setConfig('admin_user', username.trim());
  setConfig('admin_salt', salt);
  setConfig('admin_pass_hash', hashPassword(password, salt));
  issueSession(res, username.trim());
  res.json({ ok: true, username: username.trim() });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const storedUser = getConfig('admin_user');
  const salt = getConfig('admin_salt');
  const hash = getConfig('admin_pass_hash');
  if (!storedUser || !hash) {
    return res.status(400).json({ error: 'Setup admin belum dilakukan' });
  }
  const attempt = hashPassword(password || '', salt || '');
  const ok = username && username.trim() === storedUser && timingSafeEqualHex(attempt, hash);
  if (!ok) {
    return res.status(401).json({ error: 'Username atau password salah' });
  }
  issueSession(res, storedUser);
  res.json({ ok: true, username: storedUser });
});

app.post('/api/logout', (req, res) => {
  const session = getSession(req);
  if (session) db.prepare('DELETE FROM sessions WHERE token = ?').run(session.token);
  clearSession(res);
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ username: req.user });
});

app.post('/api/auth/change-password', requireAuth, (req, res) => {
  const { current, password } = req.body || {};
  const salt = getConfig('admin_salt');
  const hash = getConfig('admin_pass_hash');
  if (!hash || !salt) {
    return res.status(400).json({ error: 'Setup admin belum dilakukan' });
  }
  if (!current || !timingSafeEqualHex(hashPassword(current, salt), hash)) {
    return res.status(401).json({ error: 'Password saat ini salah' });
  }
  if (!password || String(password).length < 6) {
    return res.status(400).json({ error: 'Password baru minimal 6 karakter' });
  }
  const newSalt = crypto.randomBytes(16).toString('hex');
  setConfig('admin_salt', newSalt);
  setConfig('admin_pass_hash', hashPassword(password, newSalt));
  db.prepare('DELETE FROM sessions WHERE token != ?').run(getSession(req).token);
  res.json({ ok: true });
});

// ==================== CSNAP: Multi-platform Downloader (publik) ====

// ==================== CSNAP: Multi-platform Downloader (publik, via csnap-api.js) ====
// ==================== Member (akun publik) & Order/Premium ====================
require('./csnap-api')(app, { requireAuth, getSession, renderAdPage });
const MEMBER_AUTH = { db, getConfig, setConfig, hashPassword, timingSafeEqualHex, BASE_URL, requireAuth };
const memberApi = require('./member-api')(app, MEMBER_AUTH);
require('./order-api')(app, { ...MEMBER_AUTH, requireMember: memberApi.requireMember });

const FREE_ANON_LIMIT = 5;
const ANON_COOKIE = 'cslink_anon';

function getAnonCount(req) {
  const c = req.headers.cookie || '';
  const m = c.split(';').map(s => s.trim()).find(s => s.startsWith(ANON_COOKIE + '='));
  if (!m) return 0;
  const v = parseInt(m.slice(ANON_COOKIE.length + 1), 10);
  return isNaN(v) ? 0 : v;
}

function setAnonCount(res, n) {
  res.setHeader('Set-Cookie', `${ANON_COOKIE}=${n}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 24 * 60 * 60}`);
}


// Semua API pengelolaan wajib login admin, kecuali jalur member/order (& shorten publik)
app.use('/api', (req, res, next) => {
  const p = req.path;
  if (p === '/member' || p.startsWith('/member/') || p === '/order' || p.startsWith('/order/')) return next();
  if (p === '/shorten' && req.method === 'POST') return next();
  return requireAuth(req, res, next);
});

// Shorten URL — admin/API penuh; member via memberApi; anonim kuota 5
app.post('/api/shorten', (req, res) => {
  try {
    const memberSes = memberApi.getMemberSession(req);
    if (memberSes) {
      return memberApi.requireMember(req, res, () => memberApi.createUrl(req.member, req.body || {}, res));
    }

    let { url, customCode, title, expiresIn } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    url = sanitizeUrl(url);

    if (!isValidUrl(url)) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    if (getSession(req)) {
      let shortCode;
      if (customCode) {
        customCode = customCode.trim();
        if (!/^[a-zA-Z0-9_-]+$/.test(customCode) || customCode.length < 3 || customCode.length > 20) {
          return res.status(400).json({ error: 'Custom code must be 3-20 characters (letters, numbers, -, _)' });
        }

        const existing = db.prepare('SELECT id FROM urls WHERE short_code = ?').get(customCode);
        if (existing) {
          return res.status(409).json({ error: 'Custom code already in use' });
        }
        shortCode = customCode;
      } else {
        shortCode = nanoid();
      }

      let expiresAt = null;
      if (expiresIn) {
        const now = new Date();
        switch (expiresIn) {
          case '1h': expiresAt = new Date(now.getTime() + 60 * 60 * 1000); break;
          case '24h': expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); break;
          case '7d': expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); break;
          case '30d': expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); break;
        }
      }

      const stmt = db.prepare('INSERT INTO urls (original_url, short_code, title, expires_at, created_by) VALUES (?, ?, ?, ?, ?)');
      const result = stmt.run(url, shortCode, title || null, expiresAt ? expiresAt.toISOString() : null, 'admin');

      return res.json({
        id: result.lastInsertRowid,
        original_url: url,
        short_code: shortCode,
        short_url: `${BASE_URL}/${shortCode}`,
        title: title || null,
        expires_at: expiresAt ? expiresAt.toISOString() : null,
        created_at: new Date().toISOString(),
        plan: 'admin'
      });
    }

    // Anonim: hanya 5 link gratis, tanpa custom code / kedaluwarsa
    const anonCount = getAnonCount(req);
    if (customCode) return res.status(403).json({ error: 'Kode kustom khusus Premium (daftar akun gratis)' });
    if (expiresIn) return res.status(403).json({ error: 'Fitur kedaluwarsa khusus Premium (daftar akun gratis)' });
    if (anonCount >= FREE_ANON_LIMIT) {
      return res.status(403).json({ error: `Batas ${FREE_ANON_LIMIT} link gratis tercapai. Daftar akun gratis untuk menggeser batas, atau Upgrade Premium.` });
    }
    const anonToken = crypto.randomBytes(8).toString('hex');
    const shortCode = nanoid();
    const stmt = db.prepare('INSERT INTO urls (original_url, short_code, title, expires_at) VALUES (?, ?, ?, ?)');
    const result = stmt.run(url, shortCode, title || null, null);
    setAnonCount(res, anonCount + 1);
    res.json({
      id: result.lastInsertRowid,
      original_url: url,
      short_code: shortCode,
      short_url: `${BASE_URL}/${shortCode}`,
      title: title || null,
      expires_at: null,
      created_at: new Date().toISOString(),
      plan: 'anon',
      remaining: FREE_ANON_LIMIT - (anonCount + 1)
    });
  } catch (error) {
    console.error('Error shortening URL:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Redirect short URL
app.get('/:code', (req, res) => {
  try {
    const { code } = req.params;

    if (code === 'api' || code === 'analytics' || code.includes('.')) {
      return res.status(404).redirect('/');
    }

    const url = db.prepare('SELECT * FROM urls WHERE short_code = ? AND is_active = 1').get(code);

    if (!url) {
      return res.status(404).redirect('/');
    }

    if (url.expires_at && new Date(url.expires_at) < new Date()) {
      db.prepare('UPDATE urls SET is_active = 0 WHERE id = ?').run(url.id);
      return res.status(410).json({ error: 'This link has expired' });
    }

    // Bot/perayap: redirect langsung tanpa mencatat klik (pola FB, curl tes, dsb.)
    if (isBotUA(req.headers['user-agent'])) {
      return res.redirect(url.original_url);
    }

    const parser = new UAParser(req.headers['user-agent']);
    const ua = parser.getResult();
    const ip = visitorIp(req);
    const geo = trackGeo(ip);

    db.prepare(`
      INSERT INTO clicks (url_id, ip_address, user_agent, referer, browser, os, device, country, country_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      url.id,
      ip,
      req.headers['user-agent'] || null,
      req.headers['referer'] || null,
      uaLabel(ua.browser.name, ua.browser.version),
      uaLabel(ua.os.name, ua.os.version),
      req.headers['user-agent'] ? (ua.device.type || 'desktop') : 'Unknown',
      geo ? geo.country : '',
      geo ? geo.country_code : ''
    );

    // Bebas iklan: link milik akun premium, pemilik link, pengunjung premium, atau admin
    let skipAd = false;
    if (url.created_by && url.created_by.startsWith('user:')) {
      const ownerId = url.created_by.slice(5);
      const owner = db.prepare('SELECT premium_until FROM users WHERE id = ?').get(ownerId);
      if (owner && owner.premium_until && new Date(owner.premium_until).getTime() >= Date.now()) skipAd = true;
      const viewerSes = memberApi.getMemberSession(req);
      if (viewerSes && String(viewerSes.user_id) === ownerId) skipAd = true;
    }
    if (!skipAd) {
      const viewerSes = memberApi.getMemberSession(req);
      if (viewerSes) {
        const viewer = db.prepare('SELECT premium_until, role FROM users WHERE id = ?').get(viewerSes.user_id);
        if (viewer && viewer.role !== 'user') skipAd = true;
        if (viewer && viewer.premium_until && new Date(viewer.premium_until).getTime() >= Date.now()) skipAd = true;
      }
      if (getSession(req)) skipAd = true;
    }
    if (skipAd) return res.redirect(url.original_url);

    // Link buatan super admin: iklan penuh 5 detik + auto lanjut
    const adminAd = url.created_by === 'admin';
    res.type('html').send(renderAdPage(url.original_url, adminAd ? { seconds: 5, auto: true } : { seconds: 10, auto: false }));
  } catch (error) {
    console.error('Error redirecting:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get URL info
app.get('/api/url/:code', (req, res) => {
  try {
    const { code } = req.params;
    const url = db.prepare('SELECT * FROM urls WHERE short_code = ?').get(code);

    if (!url) {
      return res.status(404).json({ error: 'URL not found' });
    }

    const clickCount = db.prepare('SELECT COUNT(*) as count FROM clicks WHERE url_id = ?').get(url.id);

    res.json({
      ...url,
      click_count: clickCount.count,
      short_url: `${BASE_URL}/${url.short_code}`
    });
  } catch (error) {
    console.error('Error fetching URL:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all URLs
app.get('/api/urls', (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    let urls, total;

    if (search) {
      urls = db.prepare(`
        SELECT u.*, 
          (SELECT COUNT(*) FROM clicks WHERE url_id = u.id) as click_count
        FROM urls u
        WHERE u.original_url LIKE ? OR u.short_code LIKE ? OR u.title LIKE ?
        ORDER BY u.created_at DESC
        LIMIT ? OFFSET ?
      `).all(`%${search}%`, `%${search}%`, `%${search}%`, limit, offset);

      total = db.prepare(`
        SELECT COUNT(*) as count FROM urls
        WHERE original_url LIKE ? OR short_code LIKE ? OR title LIKE ?
      `).get(`%${search}%`, `%${search}%`, `%${search}%`);
    } else {
      urls = db.prepare(`
        SELECT u.*, 
          (SELECT COUNT(*) FROM clicks WHERE url_id = u.id) as click_count
        FROM urls u
        ORDER BY u.created_at DESC
        LIMIT ? OFFSET ?
      `).all(limit, offset);

      total = db.prepare('SELECT COUNT(*) as count FROM urls').get();
    }

    res.json({
      urls: urls.map(u => ({ ...u, short_url: `${BASE_URL}/${u.short_code}` })),
      pagination: {
        page,
        limit,
        total: total.count,
        pages: Math.ceil(total.count / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching URLs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete URL
app.delete('/api/url/:code', (req, res) => {
  try {
    const { code } = req.params;
    const url = db.prepare('SELECT id FROM urls WHERE short_code = ?').get(code);

    if (!url) {
      return res.status(404).json({ error: 'URL not found' });
    }

    db.prepare('DELETE FROM urls WHERE id = ?').run(url.id);
    res.json({ message: 'URL deleted successfully' });
  } catch (error) {
    console.error('Error deleting URL:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Toggle URL status
app.patch('/api/url/:code/toggle', (req, res) => {
  try {
    const { code } = req.params;
    const url = db.prepare('SELECT * FROM urls WHERE short_code = ?').get(code);

    if (!url) {
      return res.status(404).json({ error: 'URL not found' });
    }

    const newStatus = url.is_active ? 0 : 1;
    db.prepare('UPDATE urls SET is_active = ? WHERE id = ?').run(newStatus, url.id);

    res.json({ message: 'URL status updated', is_active: newStatus });
  } catch (error) {
    console.error('Error toggling URL:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Analytics summary — all links with device breakdown
app.get('/api/analytics/summary', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        u.id, u.short_code, u.original_url, u.title, u.created_at, u.is_active,
        COUNT(c.id) AS total_clicks,
        SUM(CASE WHEN c.device = 'mobile'  THEN 1 ELSE 0 END) AS mobile_clicks,
        SUM(CASE WHEN c.device = 'desktop' THEN 1 ELSE 0 END) AS desktop_clicks,
        SUM(CASE WHEN c.device = 'tablet'  THEN 1 ELSE 0 END) AS tablet_clicks
      FROM urls u
      LEFT JOIN clicks c ON u.id = c.url_id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `).all();

    res.json({
      urls: rows.map(r => ({
        short_code: r.short_code,
        original_url: r.original_url,
        title: r.title,
        created_at: r.created_at,
        is_active: r.is_active,
        total_clicks: r.total_clicks,
        mobile: r.mobile_clicks,
        desktop: r.desktop_clicks,
        tablet: r.tablet_clicks
      }))
    });
  } catch (error) {
    console.error('Error analytics summary:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Grafik klik per tanggal (dashboard) — default 30 hari, isi hari tanpa klik dengan 0
app.get('/api/analytics/daily', (req, res) => {
  try {
    const days = Math.max(1, Math.min(parseInt(req.query.days, 10) || 30, 90));
    const offset = days - 1;
    const rows = db.prepare(`
      WITH RECURSIVE dates(d) AS (
        SELECT date('now', ?)
        UNION ALL
        SELECT date(d, '+1 day') FROM dates WHERE d < date('now')
      )
      SELECT dates.d AS date, COUNT(clicks.id) AS count
      FROM dates
      LEFT JOIN clicks ON date(clicks.clicked_at) = dates.d
      GROUP BY dates.d
      ORDER BY dates.d
    `).all(`-${offset} days`);
    res.json({ days, data: rows });
  } catch (error) {
    console.error('Error analytics daily:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get analytics for a URL
app.get('/api/analytics/:code', (req, res) => {
  try {
    const { code } = req.params;
    const url = db.prepare('SELECT * FROM urls WHERE short_code = ?').get(code);

    if (!url) {
      return res.status(404).json({ error: 'URL not found' });
    }

    const totalClicks = db.prepare('SELECT COUNT(*) as count FROM clicks WHERE url_id = ?').get(url.id);

    const clicksByDay = db.prepare(`
      SELECT DATE(clicked_at) as date, COUNT(*) as count
      FROM clicks WHERE url_id = ?
      GROUP BY DATE(clicked_at)
      ORDER BY date DESC
      LIMIT 30
    `).all(url.id);

    const clicksByBrowser = db.prepare(`
      SELECT browser, COUNT(*) as count
      FROM clicks WHERE url_id = ?
      GROUP BY browser
      ORDER BY count DESC
      LIMIT 10
    `).all(url.id);

    const clicksByOS = db.prepare(`
      SELECT os, COUNT(*) as count
      FROM clicks WHERE url_id = ?
      GROUP BY os
      ORDER BY count DESC
      LIMIT 10
    `).all(url.id);

    const clicksByDevice = db.prepare(`
      SELECT device, COUNT(*) as count
      FROM clicks WHERE url_id = ?
      GROUP BY device
      ORDER BY count DESC
    `).all(url.id);

    const clicksByCountry = db.prepare(`
      SELECT
        CASE WHEN country IS NULL OR country = '' THEN 'Unknown' ELSE country END as country,
        CASE WHEN country IS NULL OR country = '' THEN '' ELSE LOWER(COALESCE(country_code, '')) END as country_code,
        COUNT(*) as count
      FROM clicks WHERE url_id = ?
      GROUP BY country, country_code
      ORDER BY count DESC
      LIMIT 15
    `).all(url.id);

    const recentClicks = db.prepare(`
      SELECT * FROM clicks WHERE url_id = ?
      ORDER BY clicked_at DESC
      LIMIT 50
    `).all(url.id);

    res.json({
      url: { ...url, short_url: `${BASE_URL}/${url.short_code}` },
      analytics: {
        total_clicks: totalClicks.count,
        clicks_by_day: clicksByDay,
        clicks_by_browser: clicksByBrowser,
        clicks_by_os: clicksByOS,
        clicks_by_device: clicksByDevice,
        clicks_by_country: clicksByCountry,
        recent_clicks: recentClicks
      }
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Generate QR Code
app.get('/api/qr/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const url = db.prepare('SELECT * FROM urls WHERE short_code = ?').get(code);

    if (!url) {
      return res.status(404).json({ error: 'URL not found' });
    }

    const shortUrl = `${BASE_URL}/${url.short_code}`;

    // Parse customization options from query string
    let size = parseInt(req.query.size) || 300;
    size = Math.min(Math.max(size, 100), 1000);

    const format = (req.query.format || 'png').toLowerCase();
    const dark = /^#[0-9a-fA-F]{3,8}$/.test(req.query.dark || '') ? req.query.dark : '#1a1a2e';
    const light = /^#[0-9a-fA-F]{3,8}$/.test(req.query.light || '') ? req.query.light : '#ffffff';

    if (format === 'svg') {
      const svg = await QRCode.toString(shortUrl, {
        type: 'svg',
        width: size,
        margin: 2,
        color: { dark, light }
      });
      return res.json({ format: 'svg', svg, url: shortUrl });
    }

    const qrDataUrl = await QRCode.toDataURL(shortUrl, {
      width: size,
      margin: 2,
      color: { dark, light }
    });

    res.json({ format: 'png', qr: qrDataUrl, url: shortUrl, size });
  } catch (error) {
    console.error('Error generating QR:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Dashboard stats
app.get('/api/stats', (req, res) => {
  try {
    const totalUrls = db.prepare('SELECT COUNT(*) as count FROM urls').get();
    const activeUrls = db.prepare('SELECT COUNT(*) as count FROM urls WHERE is_active = 1').get();
    const totalClicks = db.prepare('SELECT COUNT(*) as count FROM clicks').get();

    const todayClicks = db.prepare(`
      SELECT COUNT(*) as count FROM clicks
      WHERE DATE(clicked_at) = DATE('now')
    `).get();

    const topUrls = db.prepare(`
      SELECT u.*, COUNT(c.id) as click_count
      FROM urls u
      LEFT JOIN clicks c ON u.id = c.url_id
      GROUP BY u.id
      ORDER BY click_count DESC
      LIMIT 5
    `).all().map(u => ({ ...u, short_url: `${BASE_URL}/${u.short_code}` }));

    res.json({
      total_urls: totalUrls.count,
      active_urls: activeUrls.count,
      total_clicks: totalClicks.count,
      today_clicks: todayClicks.count,
      top_urls: topUrls
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

db.init()
  .then(() => {
    backfillClickUA();
    app.listen(PORT, () => {
      console.log(`
  ╔══════════════════════════════════════╗
  ║     URL Shortener is running!        ║
  ║     http://localhost:${PORT}            ║
  ╚══════════════════════════════════════╝
  `);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });

const AD_PAGE = fs.readFileSync(path.join(__dirname, 'public', 'ad.html'), 'utf8');
function renderAdPage(dest, opts = {}) {
  const seconds = typeof opts.seconds === 'number' ? opts.seconds : 5;
  const auto = opts.auto !== undefined ? !!opts.auto : true;
  return AD_PAGE
    .replace('__AD_DEST__', JSON.stringify(dest))
    .replace('__AD_SECONDS__', String(seconds))
    .replace('__AD_AUTO__', auto ? 'true' : 'false');
}

module.exports = { app, requireAuth, getSession, renderAdPage, db, getConfig, setConfig, hashPassword, timingSafeEqualHex, BASE_URL };
