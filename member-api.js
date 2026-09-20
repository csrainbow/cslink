// API Akun Publik CSLINK — register, verifikasi email, login, kuota link, premium
const crypto = require('crypto');
const mail = require('./mail');

const MEMBER_COOKIE = 'cslink_member';
const MEMBER_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const FREE_LIMIT = 5;
const RENEW_REMIND_DAYS = 7;

function daysLeftUntil(until) {
  if (!until) return null;
  const t = new Date(until).getTime();
  if (isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / 86400000);
}

module.exports = function register(app, auth) {
  const { db, getConfig, setConfig, hashPassword, timingSafeEqualHex, BASE_URL, requireAuth } = auth;

  function nowISO() {
    return new Date().toISOString().slice(0, 19);
  }

  function getMemberSession(req) {
    const header = req.headers.cookie || '';
    const match = header.split(';').map(s => s.trim()).find(s => s.startsWith(MEMBER_COOKIE + '='));
    if (!match) return null;
    const token = match.slice(MEMBER_COOKIE.length + 1);
    const row = db.prepare('SELECT * FROM user_sessions WHERE token = ?').get(token);
    if (!row) return null;
    if (new Date(row.expires_at).getTime() < Date.now()) return null;
    return row;
  }

  function issueMemberSession(res, userId) {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + MEMBER_TTL_MS).toISOString().slice(0, 19);
    db.prepare('INSERT INTO user_sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expires);
    res.setHeader('Set-Cookie', `${MEMBER_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(MEMBER_TTL_MS / 1000)}`);
    return token;
  }

  function clearMemberSession(res) {
    res.setHeader('Set-Cookie', `${MEMBER_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  }

  function requireMember(req, res, next) {
    const s = getMemberSession(req);
    if (!s) return res.status(401).json({ error: 'Silakan masuk dulu' });
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(s.user_id);
    if (!user) return res.status(401).json({ error: 'Akun tidak ditemukan' });
    req.member = user;
    return next();
  }

  const isPremium = u => !!u && u.premium_until && new Date(u.premium_until).getTime() >= Date.now();

  const isFreeMember = u => !!u && u.verified === 1 && !isPremium(u);

  function nextFreeUser() {
    const row = db.prepare('SELECT COUNT(*) as c FROM users WHERE verified = 1').get();
    return (row.c || 0) + 1;
  }

  // ---------- Registrasi ----------
  app.post('/api/member/register', (req, res) => {
    const { name, email, phone, password } = req.body || {};
    if (!name || String(name).trim().length < 3) return res.status(400).json({ error: 'Nama minimal 3 karakter' });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Email tidak valid' });
    const phoneClean = String(phone || '').replace(/\D+/g, '');
    if (!phoneClean || phoneClean.length < 9) return res.status(400).json({ error: 'No. HP/WA tidak valid (minimal 9 digit)' });
    if (!password || String(password).length < 6) return res.status(400).json({ error: 'Password minimal 6 karakter' });

    const emailNorm = email.trim().toLowerCase();
    const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(emailNorm);
    if (exists) return res.status(409).json({ error: 'Email sudah terdaftar' });

    const salt = crypto.randomBytes(16).toString('hex');
    const code = String(crypto.randomInt(100000, 999999));
    const inserted = db.prepare(`INSERT INTO users (name, email, phone, password, salt, verify_code, verify_expires, verified) VALUES (?,?,?,?,?,?,?,1)`)
      .run(name.trim(), emailNorm, phoneClean, hashPassword(password, salt), salt, code, new Date(Date.now() + 10 * 60 * 1000).toISOString().slice(0, 19));

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(inserted.lastInsertRowid);
    issueMemberSession(res, user.id);
    mail.sendVerifyCode(emailNorm, code).then(m => {
      res.json({ ok: true, id: user.id, name: user.name, email: user.email, dev: m.dev === true });
    });
  });

  // ---------- Verifikasi email ----------
  app.post('/api/member/verify', requireMember, (req, res) => {
    const code = String((req.body || {}).code || '').trim();
    const user = req.member;
    if (!user.verify_code) return res.json({ ok: true, already: true });
    if (user.verify_expires && new Date(user.verify_expires).getTime() < Date.now()) {
      return res.status(400).json({ error: 'Kode kadaluarsa. Minta kode baru.' });
    }
    if (code !== user.verify_code) return res.status(400).json({ error: 'Kode salah' });
    db.prepare('UPDATE users SET verify_code = NULL, verify_expires = NULL, verified = 1 WHERE id = ?').run(user.id);
    const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    res.json({ ok: true, premium: isPremium(fresh), premium_until: fresh.premium_until });
  });

  // ---------- Kirim ulang kode ----------
  app.post('/api/member/verify/resend', requireMember, (req, res) => {
    const user = req.member;
    const code = String(crypto.randomInt(100000, 999999));
    db.prepare('UPDATE users SET verify_code = ?, verify_expires = ? WHERE id = ?')
      .run(code, new Date(Date.now() + 10 * 60 * 1000).toISOString().slice(0, 19), user.id);
    mail.sendVerifyCode(user.email, code).then(m => res.json({ ok: true, dev: m.dev === true }));
  });

  // ---------- Login ----------
  app.post('/api/member/login', (req, res) => {
    const { email, password } = req.body || {};
    const emailNorm = String(email || '').trim().toLowerCase();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(emailNorm);
    if (!user || !timingSafeEqualHex(hashPassword(password || '', user.salt), user.password)) {
      return res.status(401).json({ error: 'Email atau password salah' });
    }
    issueMemberSession(res, user.id);
    res.json({
      ok: true, id: user.id, name: user.name, email: user.email,
      verified: user.verified, premium: isPremium(user), premium_until: user.premium_until
    });
  });

  app.post('/api/member/logout', (req, res) => {
    clearMemberSession(res);
    res.json({ ok: true });
  });

  // ---------- Statistik member (admin) ----------
  app.get('/api/admin/member-count', requireAuth, (req, res) => {
    const m = db.prepare('SELECT COUNT(*) as c FROM users WHERE role = ?').get('user');
    const p = db.prepare(`SELECT COUNT(*) as c FROM users WHERE premium_until IS NOT NULL AND premium_until >= datetime('now')`).get();
    res.json({ members: m.c, premium: p.c });
  });

  // ---------- Profil ----------
  function planInfo(u) {
    const daysLeft = daysLeftUntil(u && u.premium_until);
    const premium = isPremium(u);
    return {
      premium,
      premium_until: u ? u.premium_until : null,
      days_left: daysLeft === null ? null : Math.max(0, daysLeft),
      renew_needed: !!u && !!u.premium_until && (daysLeft !== null) && (!premium || daysLeft <= RENEW_REMIND_DAYS)
    };
  }

  function maybeRemindRenew(u) {
    if (!u || !u.premium_until) return;
    const daysLeft = daysLeftUntil(u.premium_until);
    if (daysLeft === null || daysLeft > RENEW_REMIND_DAYS) return;
    const guard = `renew_note:${u.id}:${u.premium_until}`;
    if (getConfig(guard)) return;
    mail.sendRenewReminder(u.email, u.name, daysLeft, u.premium_until).then(() => {
      setConfig(guard, new Date().toISOString());
    });
  }

  app.get('/api/member/me', requireMember, (req, res) => {
    const u = req.member;
    const orderCount = db.prepare('SELECT COUNT(*) as c FROM orders WHERE user_id = ?').get(u.id);
    maybeRemindRenew(u);
    res.json({
      id: u.id, name: u.name, email: u.email, phone: u.phone,
      verified: u.verified, free_slots: nextFreeUser(), order_count: orderCount.c,
      ...planInfo(u)
    });
  });

  // ---------- URL member ----------
  const ownerBy = u => `user:${u.id}`;
  const canFull = u => isPremium(u) || u.role === 'admin';

  const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  function genCode(len) {
    let s = '';
    const bytes = crypto.randomBytes(len);
    for (let i = 0; i < len; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
    return s;
  }

  function sanitizeUrl(str) {
    let clean = String(str || '').trim();
    if (!/^https?:\/\//i.test(clean)) clean = 'https://' + clean;
    return clean;
  }

  function createUrl(user, input, res) {
    const { url, customCode, expiresIn } = input || {};
    let clean = sanitizeUrl(url);
    try { const u = new URL(clean); if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error(); } catch (e) { return res.status(400).json({ error: 'URL tidak valid' }); }
    if (!canFull(user) && customCode) return res.status(403).json({ error: 'Kode kustom khusus Premium' });
    if (!canFull(user) && expiresIn) return res.status(403).json({ error: 'Kedaluwarsa khusus Premium' });

    let shortCode = String(customCode || '').trim();
    if (!shortCode) { shortCode = genCode(7); }
    else if (!/^[a-zA-Z0-9_-]{3,20}$/.test(shortCode)) return res.status(400).json({ error: 'Kode kustom 3-20 karakter (huruf, angka, -, _)' });

    const taken = db.prepare('SELECT id FROM urls WHERE short_code = ?').get(shortCode);
    if (taken) return res.status(409).json({ error: 'Kode sudah dipakai' });

    let expiresAt = null;
    if (expiresIn) {
      const now = new Date();
      switch (expiresIn) {
        case '1h': expiresAt = new Date(now.getTime() + 60 * 60 * 1000); break;
        case '24h': expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); break;
        case '7d': expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); break;
        case '30d': expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); break;
      }
      if (!expiresAt) return res.status(400).json({ error: 'Nilai kedaluwarsa tidak valid' });
    }

    const row = db.prepare(`INSERT INTO urls (original_url, short_code, title, expires_at, created_by) VALUES (?,?,?,?,?)`)
      .run(clean, shortCode, null, expiresAt ? expiresAt.toISOString() : null, ownerBy(user));
    const link = db.prepare('SELECT * FROM urls WHERE id = ?').get(row.lastInsertRowid);
    res.json({ id: link.id, original_url: link.original_url, short_code: link.short_code, short_url: `${BASE_URL}/${link.short_code}`, plan: canFull(user) ? 'premium' : 'free' });
  }

  app.post('/api/member/shorten', requireMember, (req, res) => {
    try { createUrl(req.member, req.body || {}, res); }
    catch (e) { res.status(500).json({ error: 'Gagal membuat link' }); }
  });

  app.get('/api/member/urls', requireMember, (req, res) => {
    const links = db.prepare(`SELECT u.*, (SELECT COUNT(*) FROM clicks WHERE url_id = u.id) as click_count FROM urls u WHERE u.created_by = ? ORDER BY u.created_at DESC LIMIT 200`)
      .all(ownerBy(req.member));
    res.json({ urls: links.map(u => ({ ...u, short_url: `${BASE_URL}/${u.short_code}`, plan: canFull(req.member) ? 'premium' : 'free' })) });
  });

  app.patch('/api/member/url/:code/toggle', requireMember, (req, res) => {
    const link = db.prepare('SELECT * FROM urls WHERE short_code = ? AND created_by = ?').get(req.params.code, ownerBy(req.member));
    if (!link) return res.status(404).json({ error: 'Link tidak ditemukan' });
    const next = link.is_active ? 0 : 1;
    db.prepare('UPDATE urls SET is_active = ? WHERE id = ?').run(next, link.id);
    res.json({ ok: true, is_active: next, plan: canFull(req.member) ? 'premium' : 'free' });
  });

  app.delete('/api/member/url/:code', requireMember, (req, res) => {
    const link = db.prepare('SELECT * FROM urls WHERE short_code = ? AND created_by = ?').get(req.params.code, ownerBy(req.member));
    if (!link) return res.status(404).json({ error: 'Link tidak ditemukan' });
    db.prepare('DELETE FROM urls WHERE id = ?').run(link.id);
    db.prepare('DELETE FROM clicks WHERE url_id = ?').run(link.id);
    res.json({ ok: true, plan: canFull(req.member) ? 'premium' : 'free' });
  });

  return { getMemberSession, requireMember, isPremium, canFull, isFreeMember, ownerBy, createUrl, clearMemberSession };
};