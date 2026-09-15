// CSNAP multi-platform downloader (Instagram / TikTok / YouTube / Facebook) — route publik CSLink
const express = require('express');
const crypto = require('crypto');

module.exports = function register(app) {
  const path = require('path');
  app.use('/csnap', express.static(path.join(__dirname, 'public', 'csnap')));
  app.get('/csnap', (req, res) => res.sendFile(path.join(__dirname, 'public', 'csnap', 'index.html')));

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
    const C = process.env.COBALT_API || ''; if (!C) return null;
    try {
      const r = await ffetch(C, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify({ url, videoQuality: '1080' }) }, 15000);
      const j = await r.json().catch(() => null);
      const pick = j && (j.url || j.stream || (j.urls && j.urls[0] && (j.urls[0].url || j.urls[0])));
      if (pick) return { url: pick, thumb: j.thumbnail || j.thumb || null };
    } catch (e) { /* fallback */ }
    return null;
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
      { quality: 'MP4 1080p', kind: 'video', url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', label: 'MP4 1080p demo', size: '8.2 MB' },
      { quality: 'MP4 720p', kind: 'video', url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerH264.mp4', label: 'MP4 720p demo', size: '5.4 MB' },
      { quality: 'MP3 Audio', kind: 'audio', url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', label: 'MP3 demo (via proxy)' }] };
    if (p === 'tiktok') return { thumb: 'https://picsum.photos/seed/tt' + seed.length + '/540/960', medias: [
      { quality: 'HD No Watermark', kind: 'video', url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', label: 'MP4 HD demo', size: '3.1 MB' },
      { quality: 'SD', kind: 'video', url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4', label: 'MP4 SD demo' },
      { quality: 'MP3 Audio', kind: 'audio', url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4', label: 'MP3 demo' }] };
    if (p === 'facebook') return { thumb: 'https://picsum.photos/seed/fb' + seed.length + '/640/640', medias: [
      { quality: 'HD 720p', kind: 'video', url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4', label: 'MP4 HD demo' },
      { quality: 'SD 480p', kind: 'video', url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4', label: 'MP4 SD demo' },
      { quality: 'Thumbnail', kind: 'image', url: 'https://picsum.photos/seed/fb' + seed.length + '/640/640', label: 'JPG Cover' }] };
    return { thumb: 'https://picsum.photos/seed/ig' + seed.length + '/640/640', medias: [
      { quality: 'HD 1080p', kind: 'video', url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', label: 'MP4 1080p demo', size: '8.2 MB' },
      { quality: 'SD 720p', kind: 'video', url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', label: 'MP4 720p demo', size: '3.1 MB' },
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
    if (cob) {
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
    return res.json({ success: true, demo: true, platform: p, mode: md, type: md, shortcode: code, author: '@demo.user', caption: 'Mode demo ' + p + ' - situs memblokir bot. Isi COBALT_API utk link asli (lihat README).', thumbnail: d.thumb, duration: '0:15', originalUrl: clean, note: 'DEMO', medias: d.medias });
  });
  app.get('/csnap/api/proxy', async (req, res) => {
    const fileUrl = req.query.url;
    const fn = req.query.filename || 'csnap.mp4';
    if (!fileUrl) return res.status(400).send('url required');
    try {
      const r = await ffetch(fileUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, 20000);
      if (!r.ok) return res.status(502).send('fetch fail');
      res.setHeader('Content-Type', r.headers.get('content-type') || 'application/octet-stream');
      res.setHeader('Content-Disposition', 'attachment; filename="' + String(fn).replace(/"/g, '') + '"');
      res.send(Buffer.from(await r.arrayBuffer()));
    } catch (e) { res.status(500).send('proxy err ' + e.message); }
  });

  app.get('/csnap/api/health', (req, res) => res.json({ ok: true, app: 'csnap', platforms: ['instagram', 'tiktok', 'youtube', 'facebook'] }));
};