require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const QRCode = require('qrcode');
const UAParser = require('ua-parser-js');
const { customAlphabet } = require('nanoid');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 7);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

// Shorten URL
app.post('/api/shorten', (req, res) => {
  try {
    let { url, customCode, title, expiresIn } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    url = sanitizeUrl(url);

    if (!isValidUrl(url)) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

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

    const stmt = db.prepare('INSERT INTO urls (original_url, short_code, title, expires_at) VALUES (?, ?, ?, ?)');
    const result = stmt.run(url, shortCode, title || null, expiresAt ? expiresAt.toISOString() : null);

    res.json({
      id: result.lastInsertRowid,
      original_url: url,
      short_code: shortCode,
      short_url: `${BASE_URL}/${shortCode}`,
      title: title || null,
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      created_at: new Date().toISOString()
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
      return res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
    }

    const url = db.prepare('SELECT * FROM urls WHERE short_code = ? AND is_active = 1').get(code);

    if (!url) {
      return res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
    }

    if (url.expires_at && new Date(url.expires_at) < new Date()) {
      db.prepare('UPDATE urls SET is_active = 0 WHERE id = ?').run(url.id);
      return res.status(410).json({ error: 'This link has expired' });
    }

    const parser = new UAParser(req.headers['user-agent']);
    const ua = parser.getResult();

    db.prepare(`
      INSERT INTO clicks (url_id, ip_address, user_agent, referer, browser, os, device)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      url.id,
      req.ip || req.connection.remoteAddress,
      req.headers['user-agent'] || null,
      req.headers['referer'] || null,
      ua.browser.name || 'Unknown',
      ua.os.name || 'Unknown',
      ua.device.type || 'desktop'
    );

    res.redirect(302, url.original_url);
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
