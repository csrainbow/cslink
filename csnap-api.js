// CSNAP multi-platform downloader (Instagram / TikTok / YouTube / Facebook) — route publik CSLink
const express = require('express');
const crypto = require('crypto');

module.exports = function register(app, auth) {
  const db = require('./database');
  const { requireAuth, getSession, renderAdPage } = auth || {};
  const path = require('path');
  const SETTINGS_KEY = 'csnap_settings';
  app.use('/csnap', express.static(path.join(__dirname, 'public', 'csnap')));
  app.get('/csnap', (req, res) => res.sendFile(path.join(__dirname, 'public', 'csnap', 'index.html')));

  function defaultSettings() {
    return {
      adsenseClient: '',
      adsenseSlots: { desktop: '', mobile: '' },
      codes: { desktop: '', mobile: '' },
      banners: {
        desktop: { img: '', url: '', alt: 'Iklan' },
        mobile: { img: '', url: '', alt: 'Iklan' }
      }
    };
  }
  function cleanBanner(b) {
    const s = b || {};
    return { img: String(s.img || '').trim(), url: String(s.url || '').trim(), alt: String(s.alt || 'Iklan').trim() };
  }
  function cleanCode(c) {
    const s = String(c || '').trim();
    return s.length > 8000 ? s.slice(0, 8000) : s;
  }
  function getSettings() {
    try {
      const row = db.prepare('SELECT value FROM config WHERE key = ?').get(SETTINGS_KEY);
      if (!row) return defaultSettings();
      const raw = JSON.parse(row.value);
      const d = defaultSettings();
      return {
        adsenseClient: String(raw.adsenseClient || d.adsenseClient).trim(),
        adsenseSlots: {
          desktop: String((raw.adsenseSlots && raw.adsenseSlots.desktop) || '').trim(),
          mobile: String((raw.adsenseSlots && raw.adsenseSlots.mobile) || '').trim()
        },
        codes: {
          desktop: cleanCode(raw.codes && raw.codes.desktop),
          mobile: cleanCode(raw.codes && raw.codes.mobile)
        },
        banners: {
          desktop: cleanBanner(raw.banners && raw.banners.desktop),
          mobile: cleanBanner(raw.banners && raw.banners.mobile)
        }
      };
    } catch (e) { return defaultSettings(); }
  }
  function saveSettings(s) {
    db.prepare('INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(SETTINGS_KEY, JSON.stringify(s));
  }

  // Konfigurasi publik untuk runtime app (tampil di halaman, bukan rahasia)
  app.get('/csnap/api/config', (req, res) => res.json(getSettings()));

  // Pengaturan (hak admin / sesi login)
  app.get('/csnap/api/settings', requireAuth, (req, res) => res.json(getSettings()));
  app.put('/csnap/api/settings', requireAuth, (req, res) => {
    const b = req.body || {};
    const d = getSettings();
    const s = {
      adsenseClient: String(b.adsenseClient != null ? b.adsenseClient : d.adsenseClient).trim(),
      adsenseSlots: {
        desktop: String((b.adsenseSlots && b.adsenseSlots.desktop != null) ? b.adsenseSlots.desktop : (d.adsenseSlots && d.adsenseSlots.desktop)).trim(),
        mobile: String((b.adsenseSlots && b.adsenseSlots.mobile != null) ? b.adsenseSlots.mobile : (d.adsenseSlots && d.adsenseSlots.mobile)).trim()
      },
      codes: {
        desktop: cleanCode((b.codes && b.codes.desktop != null) ? b.codes.desktop : (d.codes && d.codes.desktop)),
        mobile: cleanCode((b.codes && b.codes.mobile != null) ? b.codes.mobile : (d.codes && d.codes.mobile))
      },
      banners: {
        desktop: cleanBanner((b.banners && b.banners.desktop) || d.banners.desktop),
        mobile: cleanBanner((b.banners && b.banners.mobile) || d.banners.mobile)
      }
    };
    saveSettings(s);
    res.json({ ok: true, settings: s });
  });

  // Halaman setting (wajib login; redirect ke /login bila belum)
  app.get('/csnap/setting', (req, res) => {
    if (getSession && !getSession(req)) return res.redirect('/login');
    res.sendFile(path.join(__dirname, 'public', 'csnap', 'setting.html'));
  });
  app.get('/csnap/settings', (req, res) => res.redirect('/csnap/setting'));

  // Interstitial iklan 5 detik sebelum unduhan (tujuan selalu ke proxy internal — aman dari open redirect)
  app.get('/csnap/api/ad', (req, res) => {
    const u = String(req.query.url || '').trim();
    if (!/^https?:\/\//i.test(u)) return res.status(400).json({ error: 'invalid url' });
    const fn = String(req.query.filename || 'csnap.mp4').trim();
    const dest = '/csnap/api/proxy?url=' + encodeURIComponent(u) + '&filename=' + encodeURIComponent(fn);
    if (renderAdPage) return res.type('html').send(renderAdPage(dest));
    res.redirect(302, dest);
  });

  function detect(url) {
    if (/instagram\.com|instagr\.am/i.test(url)) return 'instagram';
    if (/tiktok\.com|vt\.tiktok|vm\.tiktok/i.test(url)) return 'tiktok';
    if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube';
    if (/facebook\.com|fb\.watch|fb\.com/i.test(url)) return 'facebook';
    return null;
  }

  function shortId(p, url) {
    let m = null;
    if (p === 'youtube') { m = url.match(/[?&]v=([A-Za-z0-9_-]{6,})|youtu\.be\/([A-Za-z0-9_-]{6,})|shorts\/([A-Za-z0-9_-]{6,})/); if (m) return m[1] || m[2] || m[3]; }
    if (p === 'instagram') { m = url.match(/\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/); if (m) return m[2]; const s = url.match(/stories\/[^/]+\/(\d+)/); if (s) return s[1]; }
    if (p === 'tiktok') { m = url.match(/\/video\/(\d+)|(\d{10,})/); if (m) return m[1] || m[2]; }
    if (p === 'facebook') { m = url.match(/(\d{6,})/); if (m) return m[1]; }
    return crypto.createHash('md5').update(url).digest('hex').slice(0, 10);
  }

  function modeOf(p, url) {
    if (p === 'instagram') { if (/\/(reel|reels)\//i.test(url)) return 'reel'; if (/\/p\//i.test(url)) return 'photo'; if (/\/stories\//i.test(url)) return 'story'; if (/\/tv\//i.test(url)) return 'igtv'; return 'post'; }
    if (p === 'tiktok') { if (/\/photo\//i.test(url)) return 'slide'; return 'video'; }
    if (p === 'youtube') { if (/\/shorts\//i.test(url)) return 'shorts'; return 'video'; }
    if (p === 'facebook') { if (/\/reel\//i.test(url)) return 'reel'; if (/photo|posts\//i.test(url)) return 'photo'; return 'video'; }
    return 'video';
  }

  async function ffetch(url, opts, ms) {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms || 12000);
    try { return await fetch(url, Object.assign({}, opts, { signal: c.signal })); }
    finally { clearTimeout(t); }
  }

  async function oembed(p, url) {
    const eps = { tiktok: 'https://www.tiktok.com/oembed?url=', youtube: 'https://www.youtube.com/oembed?url=', facebook: 'https://www.facebook.com/plugins/post/oembed.json?url=' };
    const ep = eps[p]; if (!ep) return null;
    try { const r = await ffetch(ep + encodeURIComponent(url), { headers: { 'User-Agent': 'Mozilla/5.0' } }, 10000); if (!r.ok) return null; return await r.json(); } catch (e) { return null; }
  }

  async function cobalt(url) {
    const C = process.env.COBALT_API || '';
    if (!C) return { configured: false };
    try {
      const r = await ffetch(C, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify({ url, videoQuality: '1080' }) }, 15000);
      const j = await r.json().catch(() => null);
      const pick = j && (j.url || j.stream || (j.urls && j.urls[0] && (j.urls[0].url || j.urls[0])));
      if (pick) return { configured: true, url: pick, thumb: j.thumbnail || j.thumb || null };
    } catch (e) { /* fallback */ }
    return { configured: true };
  }

  function meta(html) {
    const get = (prop) => {
      const a = html.match(new RegExp('<meta[^>]+property=["\']' + prop + '["\'][^>]+content=["\']([^"\']+)["\']', 'i'));
      const b = html.match(new RegExp('<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']' + prop + '["\']', 'i'));
      return (a && a[1]) || (b && b[1]) || null;
    };
    const d = (s) => (s ? s.replace(/&amp;/g, '&') : s);
    return { title: d(get('og:title')), desc: d(get('og:description')), img: d(get('og:image')), vid: d(get('og:video') || get('og:video:secure_url')) };
  }

  function demoMedia(p, code) {
    const seed = String(code).slice(0, 12) || 'demo';
    if (p === 'youtube') return { thumb: 'https://i.ytimg.com/vi/' + seed + '/hqdefault.jpg', medias: [
      { quality: 'MP4 1080p', kind: 'video', url: 'https://media.w3.org/2010/05/sintel/trailer.mp4', label: 'MP4 1080p demo', size: '4.3 MB' },
      { quality: 'MP4 720p', kind: 'video', url: 'https://media.w3.org/2010/05/bunny/trailer.mp4', label: 'MP4 720p demo', size: '0.3 MB' },
      { quality: 'MP3 Audio', kind: 'audio', url: 'https://download.samplelib.com/mp3/sample-15s.mp3', label: 'MP3 demo (via proxy)' }] };
    if (p === 'tiktok') return { thumb: 'https://picsum.photos/seed/tt' + seed.length + '/540/960', medias: [
      { quality: 'HD No Watermark', kind: 'video', url: 'https://media.w3.org/2010/05/sintel/trailer.mp4', label: 'MP4 HD demo', size: '4.3 MB' },
      { quality: 'SD', kind: 'video', url: 'https://media.w3.org/2010/05/bunny/trailer.mp4', label: 'MP4 SD demo' },
      { quality: 'MP3 Audio', kind: 'audio', url: 'https://download.samplelib.com/mp3/sample-15s.mp3', label: 'MP3 demo' }] };
    if (p === 'facebook') return { thumb: 'https://picsum.photos/seed/fb' + seed.length + '/640/640', medias: [
      { quality: 'HD 720p', kind: 'video', url: 'https://media.w3.org/2010/05/sintel/trailer.mp4', label: 'MP4 HD demo' },
      { quality: 'SD 480p', kind: 'video', url: 'https://media.w3.org/2010/05/bunny/trailer.mp4', label: 'MP4 SD demo' },
      { quality: 'Thumbnail', kind: 'image', url: 'https://picsum.photos/seed/fb' + seed.length + '/640/640', label: 'JPG Cover' }] };
    return { thumb: 'https://picsum.photos/seed/ig' + seed.length + '/640/640', medias: [
      { quality: 'HD 1080p', kind: 'video', url: 'https://media.w3.org/2010/05/sintel/trailer.mp4', label: 'MP4 1080p demo', size: '4.3 MB' },
      { quality: 'SD 720p', kind: 'video', url: 'https://media.w3.org/2010/05/bunny/trailer.mp4', label: 'MP4 720p demo' },
      { quality: 'Thumbnail', kind: 'image', url: 'https://picsum.photos/seed/ig' + seed.length + '/640/640', label: 'JPG Cover' }] };
  }
  app.post('/csnap/api/fetch', async (req, res) => {
    const body = req.body || {};
    if (!body.url) return res.status(400).json({ error: 'URL wajib diisi' });
    const clean = String(body.url).trim();
    const p = body.platform || detect(clean);
    if (!p) return res.status(400).json({ error: 'Link tidak dikenali. Didukung: Instagram, TikTok, YouTube, Facebook.' });
    const code = shortId(p, clean);
    const md = body.mode || modeOf(p, clean);
    const cob = await cobalt(clean);
    if (cob && cob.url) {
      return res.json({ success: true, source: 'cobalt', platform: p, mode: md, type: md, shortcode: code, author: '@' + p + '_user', caption: p + ' media via Cobalt', thumbnail: cob.thumb, duration: null, originalUrl: clean, medias: [
        { quality: 'HD 1080p', kind: 'video', url: cob.url, label: 'MP4 HD via Cobalt' },
        { quality: 'SD 720p', kind: 'video', url: cob.url, label: 'MP4 SD' },
        { quality: 'MP3 Audio', kind: 'audio', url: cob.url, label: 'Audio (via proxy)' }] });
    }
    if (p === 'instagram') {
      let type = 'post';
      const m = clean.match(/\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
      if (m) type = m[1] === 'reels' ? 'reel' : (m[1] === 'p' ? 'post' : m[1]);
      const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36';
      const targets = ['https://www.instagram.com/' + type + '/' + code + '/embed/captioned/', clean.split('?')[0] + 'embed/captioned/'];
      for (const t of targets) {
        try {
          const r = await ffetch(t, { headers: { 'User-Agent': UA, 'Accept': 'text/html' } }, 12000);
          if (!r.ok) continue;
          const html = await r.text();
          const mt = meta(html);
          if (mt.img || mt.vid) {
            const medias = [];
            if (mt.vid) { medias.push({ quality: 'HD 1080p', kind: 'video', url: mt.vid, label: 'MP4 1080p' }); medias.push({ quality: 'SD 720p', kind: 'video', url: mt.vid, label: 'MP4 720p' }); medias.push({ quality: 'MP3 Audio', kind: 'audio', url: mt.vid, label: 'Audio (via proxy)' }); }
            medias.push({ quality: mt.vid ? 'Thumbnail' : 'HD Photo', kind: 'image', url: mt.img, label: mt.vid ? 'JPG Cover' : 'JPG Full HD' });
            return res.json({ success: true, platform: p, mode: md, type: md, shortcode: code, author: (mt.title || '@instagram_user').split(' on ')[0], caption: mt.title || mt.desc || 'Instagram media', thumbnail: mt.img, duration: null, medias: medias.filter((x) => x.url), originalUrl: clean, note: mt.vid ? null : 'Thumbnail OK. Video butuh Cobalt API bila IG memblokir bot.' });
          }
        } catch (e) { /* next target */ }
      }
    }
    if (p !== 'instagram') {
      const oe = await oembed(p, clean);
      if (oe && (oe.thumbnail_url || oe.title)) {
        const d = demoMedia(p, code);
        return res.json({ success: true, demo: false, platform: p, mode: md, type: md, shortcode: code, author: oe.author_name || ('@' + p + '_user'), caption: oe.title || ('Media ' + p), thumbnail: oe.thumbnail_url || d.thumb, duration: null, originalUrl: clean, note: 'Info asli (judul+thumbnail) terdeteksi. File video butuh Cobalt API utk link asli - pilihan demo di bawah utk uji alur.', medias: d.medias });
      }
    }
    const d = demoMedia(p, code);
    const demoTxt = cob && cob.configured
      ? 'Mode demo - server media ditolak oleh ' + p + ' utk link ini (blokir bot / butuh login). Coba link lain.'
      : 'Mode demo ' + p + ' - isi COBALT_API utk link asli (lihat README).';
    return res.json({ success: true, demo: true, platform: p, mode: md, type: md, shortcode: code, author: '@demo.user', caption: demoTxt, thumbnail: d.thumb, duration: '0:15', originalUrl: clean, note: 'DEMO', medias: d.medias });
  });
  app.get('/csnap/api/proxy', async (req, res) => {
    const fileUrl = req.query.url;
    const fn = req.query.filename || 'csnap.mp4';
    if (!fileUrl) return res.status(400).send('url required');
    try {
      const r = await ffetch(fileUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, 30000);
      if (!r.ok) return res.status(502).send('fetch fail');
      res.setHeader('Content-Type', r.headers.get('content-type') || 'application/octet-stream');
      res.setHeader('Content-Disposition', 'attachment; filename="' + String(fn).replace(/"/g, '') + '"');
      const { Readable } = require('stream');
      Readable.fromWeb(r.body).pipe(res);
    } catch (e) { res.status(500).send('proxy err ' + e.message); }
  });

  app.get('/csnap/api/health', (req, res) => res.json({ ok: true, app: 'csnap', platforms: ['instagram', 'tiktok', 'youtube', 'facebook'] }));
};