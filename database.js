const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = process.env.DB_PATH || './data/urls.db';
const dbDir = path.dirname(dbPath);

let SQL = null;
let db = null;

function parseTime(str) {
  if (!str || typeof str !== 'string') return str;
  const isoReg = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/;
  if (isoReg.test(str)) {
    return str.replace(' ', 'T') + 'Z';
  }
  return str;
}

function rowToObject(row) {
  if (!row) return row;
  const obj = {};
  for (const key of Object.keys(row)) {
    let val = row[key];
    if (typeof val === 'string') {
      val = parseTime(val);
    }
    obj[key] = val;
  }
  return obj;
}

async function initDatabase() {
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  SQL = await initSqlJs();

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA journal_mode = WAL;');
  db.run(`
    CREATE TABLE IF NOT EXISTS urls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_url TEXT NOT NULL,
      short_code TEXT UNIQUE NOT NULL,
      title TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      is_active INTEGER DEFAULT 1,
      created_by TEXT DEFAULT 'anonymous'
    );

    CREATE TABLE IF NOT EXISTS clicks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url_id INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      referer TEXT,
      browser TEXT,
      os TEXT,
      device TEXT,
      country TEXT,
      clicked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (url_id) REFERENCES urls(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      password TEXT NOT NULL,
      salt TEXT NOT NULL,
      verify_code TEXT,
      verify_expires DATETIME,
      verified INTEGER DEFAULT 0,
      role TEXT DEFAULT 'user',
      premium_until DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      plan TEXT DEFAULT 'premium-1m',
      base_amount INTEGER NOT NULL,
      service_fee INTEGER NOT NULL DEFAULT 0,
      kode_unik INTEGER NOT NULL DEFAULT 0,
      amount INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      wa_sent INTEGER DEFAULT 0,
      activated_at DATETIME,
      activated_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  CREATE TABLE IF NOT EXISTS ip_info (
      ip TEXT PRIMARY KEY,
      country TEXT,
      country_code TEXT,
      fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_urls_short_code ON urls(short_code);');
  db.run('CREATE INDEX IF NOT EXISTS idx_clicks_url_id ON clicks(url_id);');
  db.run('CREATE INDEX IF NOT EXISTS idx_clicks_clicked_at ON clicks(clicked_at);');
  db.run('CREATE INDEX IF NOT EXISTS idx_clicks_country ON clicks(country);');
  db.run('CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);');
  db.run('CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);');

  // migrasi kolom country_code di clicks (tabel lama belum punya)
  const cols = db.exec("PRAGMA table_info(clicks)")[0];
  if (cols && !cols.values.some(v => v[1] === 'country_code')) {
    db.run('ALTER TABLE clicks ADD COLUMN country_code TEXT');
  }

  saveDatabase();
}

function saveDatabase() {
  if (db) {
    const fileBuffer = Buffer.from(db.export());
    fs.writeFileSync(dbPath, fileBuffer);
  }
}

class Statement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
  }

  run(...params) {
    const stmt = this.db.prepare(this.sql);
    try {
      stmt.bind(params);
      stmt.step();
      const result = { changes: this.db.getRowsModified(), lastInsertRowid: this.lastInsertId() };
      saveDatabase();
      return result;
    } finally {
      stmt.free();
    }
  }

  lastInsertId() {
    try {
      const stmt = this.db.prepare('SELECT last_insert_rowid() as id');
      stmt.step();
      const row = stmt.getAsObject();
      stmt.free();
      return row.id;
    } catch (e) {
      return 0;
    }
  }

  get(...params) {
    const stmt = this.db.prepare(this.sql);
    try {
      stmt.bind(params);
      if (stmt.step()) {
        return rowToObject(stmt.getAsObject());
      }
      return undefined;
    } finally {
      stmt.free();
    }
  }

  all(...params) {
    const stmt = this.db.prepare(this.sql);
    try {
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) {
        rows.push(rowToObject(stmt.getAsObject()));
      }
      return rows;
    } finally {
      stmt.free();
    }
  }
}

function prepare(sql) {
  return new Statement(db, sql);
}

function run(sql, ...params) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    stmt.step();
    return { changes: db.getRowsModified() };
  } finally {
    stmt.free();
    saveDatabase();
  }
}

function exec(sql) {
  db.run(sql);
}

const database = {
  init: initDatabase,
  save: saveDatabase,
  prepare,
  run,
  exec,
  getRaw: () => db
};

module.exports = database;
