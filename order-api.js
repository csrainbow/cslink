// Order & Premium CSLINK — QRIS statis + fee unik, konfirmasi WA via gateway kasir, super admin manual
const crypto = require('crypto');

module.exports = function register(app, auth) {
  const { db, getConfig, setConfig, hashPassword, timingSafeEqualHex, BASE_URL, requireAuth, requireMember } = auth;

  const cfg = {
    price() { return parseInt(getConfig('premium_price') || '250000', 10) || 250000; },
    feePct() { return parseFloat(getConfig('premium_service_fee_pct') || '0.7') || 0.7; },
    days() { return parseInt(getConfig('premium_days') || '30', 10) || 30; },
    qrisImage() { return getConfig('qris_image') || ''; },
    waAdmin() { return getConfig('wa_admin') || ''; },
    waBase() { return process.env.WA_GATEWAY_HOST || 'http://127.0.0.1:3001'; },
    waKey() { return process.env.WA_GATEWAY_KEY || ''; }
  };

  const rupiah = n => 'Rp ' + (n || 0).toLocaleString('id-ID');

  function planOf(user) {
    const premium = !!user && !!user.premium_until && new Date(user.premium_until).getTime() >= Date.now();
    return { premium, premium_until: user ? user.premium_until : null };
  }

  // hitung tagihan: base + fee 0,7% + kode unik (menjadikan total unik)
  function computeAmount() {
    const base = cfg.price();
    const fee = Math.round((base * cfg.feePct()) / 100);
    const sub = base + fee;
    const kode_unik = crypto.randomInt(1, 249);
    return { base, fee, sub, kode_unik, amount: sub + kode_unik };
  }

  async function sendWa(phone, message) {
    phone = String(phone || '').replace(/\D+/g, '');
    if (!phone) return { ok: false, error: 'nomor kosong' };
    let norm = phone;
    if (norm.startsWith('0')) norm = '62' + norm.slice(1);
    if (norm.startsWith('8') && !norm.startsWith('62')) norm = '62' + norm;
    try {
      const res = await fetch(cfg.waBase() + '/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': cfg.waKey() },
        body: JSON.stringify({ to: norm, message })
      });
      const j = await res.json().catch(() => ({}));
      return { ok: res.ok && j.ok !== false, error: j.error || ('http-' + res.status) };
    } catch (e) {
      return { ok: false, error: 'gateway tidak terjangkau' };
    }
  }

  function orderMessage(prefix, o, u) {
    const time = o.created_at ? o.created_at.replace('T', ' ').slice(0, 16) : '';
    return `${prefix} (CSLINK)
No. Pesanan: ${o.id}
Dari: ${u.name} | ${u.email} | WA ${u.phone}
Paket: CSLINK Premium 1 Bulan
Nominal: ${rupiah(o.amount)} = ${rupiah(o.base)} + fee ${rupiah(o.service_fee)} + kode unik ${o.kode_unik}
Waktu: ${time}
Saya sudah membayar via QRIS. Mohon verifikasi dan aktifkan premium.
- CSLINK Support`;
  }

  // ---------- Buat order (member) ----------
  app.post('/api/order/create', requireMember, (req, res) => {
    const u = req.member;
    const { base, fee, kode_unik, amount } = computeAmount();
    const row = db.prepare(`INSERT INTO orders (user_id, plan, base_amount, service_fee, kode_unik, amount, status) VALUES (?,?,?,?,?,?,?)`)
      .run(u.id, 'premium-1m', base, fee, kode_unik, amount, 'pending');
    const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(row.lastInsertRowid);
    res.json({
      ok: true, order_id: o.id, amount: o.amount, base: o.base_amount, fee: o.service_fee, kode_unik: o.kode_unik,
      price_label: rupiah(o.amount), qris_image: cfg.qrisImage(), status: o.status
    });
  });

  // ---------- Detail order (member) ----------
  app.get('/api/order/:id', requireMember, (req, res) => {
    const o = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, req.member.id);
    if (!o) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
    res.json({
      order_id: o.id, status: o.status, amount: o.amount, base: o.base_amount, fee: o.service_fee,
      kode_unik: o.kode_unik, price_label: rupiah(o.amount), created_at: o.created_at,
      qris_image: cfg.qrisImage(), wa_admin: cfg.waAdmin(), wa_base: cfg.waBase(), wa_message: orderMessage('INVOICE', o, req.member)
    });
  });

  // ---------- Kirim konfirmasi via WA gateway kasir (member) ----------
  app.post('/api/order/:id/confirm-wa', requireMember, async (req, res) => {
    const o = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, req.member.id);
    if (!o) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
    const adminPhone = cfg.waAdmin();
    const sent = await sendWa(adminPhone, orderMessage('KONFIRMASI PEMBAYARAN', o, req.member));
    if (sent.ok) db.prepare('UPDATE orders SET wa_sent = 1 WHERE id = ?').run(o.id);
    res.json({ ok: sent.ok, ...(sent.error ? { error: sent.error } : {}) });
  });

  // ---------- Config payment (admin) ----------
  app.get('/api/admin/payment-config', requireAuth, (req, res) => {
    res.json({
      qris_image: cfg.qrisImage(), wa_admin: cfg.waAdmin(),
      premium_price: cfg.price(), service_fee_pct: cfg.feePct(), premium_days: cfg.days()
    });
  });

  app.put('/api/admin/payment-config', requireAuth, (req, res) => {
    const b = req.body || {};
    if (b.qris_image !== undefined) {
      const img = String(b.qris_image || '').trim();
      if (img && !/^(https?:)?\/\//i.test(img)) return res.status(400).json({ error: 'URL QRIS tidak valid' });
      setConfig('qris_image', img);
    }
    if (b.wa_admin !== undefined) {
      const ph = String(b.wa_admin || '').replace(/\D+/g, '');
      setConfig('wa_admin', ph);
    }
    if (b.premium_price !== undefined) {
      const p = parseInt(b.premium_price, 10);
      if (!p || p < 1000) return res.status(400).json({ error: 'Harga premium tidak valid' });
      setConfig('premium_price', String(p));
    }
    if (b.service_fee_pct !== undefined) setConfig('premium_service_fee_pct', String(b.service_fee_pct));
    if (b.premium_days !== undefined) setConfig('premium_days', String(parseInt(b.premium_days, 10) || 30));
    res.json({ ok: true });
  });

  // ---------- Daftar order (admin) ----------
  app.get('/api/admin/orders', requireAuth, (req, res) => {
    const rows = db.prepare(`
      SELECT o.*, u.name, u.email, u.phone FROM orders o
      JOIN users u ON u.id = o.user_id
      ORDER BY o.id DESC LIMIT 300
    `).all();
    res.json({ orders: rows.map(r => ({ ...r, price_label: rupiah(r.amount) })) });
  });

  // ---------- Aktifkan premium (admin manual) ----------
  app.post('/api/admin/orders/:id/activate', requireAuth, async (req, res) => {
    const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!o) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
    if (o.status === 'paid') return res.json({ ok: true, already: true });
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(o.user_id);
    if (!u) return res.status(400).json({ error: 'Pengguna tidak ditemukan' });

    const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const until = new Date(Date.now() + cfg.days() * 24 * 60 * 60 * 1000);
    const untilStr = until.toISOString().slice(0, 19).replace('T', ' ');
    db.prepare('UPDATE orders SET status = ?, activated_at = ?, activated_by = ? WHERE id = ?')
      .run('paid', nowStr, req.user || 'admin', o.id);
    db.prepare('UPDATE users SET premium_until = ? WHERE id = ?').run(untilStr, o.user_id);

    const receipt = `PEMBAYARAN DITERIMA ✅ — CSLINK Premium 1 Bulan AKTIF.
Kode Pesanan: ${o.id}
Nama: ${u.name}
Aktif hingga: ${untilStr}
Nikmati link tanpa batas & tanpa iklan.
Terima kasih — Percetakan Rainbow.`;
    const sent = await sendWa(u.phone, receipt);

    res.json({ ok: true, premium_until: untilStr, wa_sent: sent.ok, wa_error: sent.ok ? undefined : sent.error });
  });

  // ---------- Status premium (untuk halaman member) ----------
  app.get('/api/member/plan', requireMember, (req, res) => {
    res.json(planOf(req.member));
  });

  void hashPassword; void timingSafeEqualHex; void BASE_URL;
};