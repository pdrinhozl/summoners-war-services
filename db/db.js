const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'app.db');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON');

function migrate() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'client',
    seller_status TEXT NOT NULL DEFAULT 'none',
    seller_about TEXT DEFAULT '',
    seller_contact TEXT DEFAULT '',
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    icon TEXT DEFAULT '🔮',
    color TEXT DEFAULT '#7b5cff',
    sort INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    seller_id INTEGER,
    category_id INTEGER,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    short TEXT DEFAULT '',
    description TEXT DEFAULT '',
    price_from REAL DEFAULT 0,
    price_to REAL DEFAULT 0,
    delivery_min INTEGER DEFAULT 1,
    delivery_max INTEGER DEFAULT 1,
    image TEXT DEFAULT '/img/default-service.png',
    status TEXT NOT NULL DEFAULT 'pending',
    featured INTEGER DEFAULT 0,
    includes TEXT DEFAULT '[]',
    requirements TEXT DEFAULT '',
    approval_note TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    approved_at TEXT,
    FOREIGN KEY (seller_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS quotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER,
    service_id INTEGER,
    client_name TEXT NOT NULL,
    client_email TEXT DEFAULT '',
    client_whatsapp TEXT DEFAULT '',
    game_name TEXT DEFAULT '',
    game_level TEXT DEFAULT '',
    game_rank TEXT DEFAULT '',
    game_boxes TEXT DEFAULT '',
    message TEXT DEFAULT '',
    account_ready INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    admin_note TEXT DEFAULT '',
    offer_price REAL,
    reviewed_by TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES users(id),
    FOREIGN KEY (service_id) REFERENCES services(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    expires TEXT
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quote_id INTEGER,
    client_id INTEGER,
    seller_id INTEGER,
    service_id INTEGER,
    title TEXT NOT NULL,
    price REAL NOT NULL DEFAULT 0,
    commission_pct REAL NOT NULL DEFAULT 0,
    seller_amount REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending_payment',
    payment_method TEXT DEFAULT 'pix',
    payment_code TEXT,
    paid_at TEXT,
    started_at TEXT,
    delivered_at TEXT,
    completed_at TEXT,
    cancelled_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (quote_id) REFERENCES quotes(id),
    FOREIGN KEY (client_id) REFERENCES users(id),
    FOREIGN KEY (seller_id) REFERENCES users(id),
    FOREIGN KEY (service_id) REFERENCES services(id)
  );

  CREATE TABLE IF NOT EXISTS order_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    sender_id INTEGER,
    sender_role TEXT NOT NULL DEFAULT 'client',
    body TEXT NOT NULL,
    read_by_client INTEGER DEFAULT 0,
    read_by_seller INTEGER DEFAULT 0,
    read_by_admin INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (sender_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL UNIQUE,
    client_id INTEGER NOT NULL,
    seller_id INTEGER,
    service_id INTEGER,
    rating INTEGER NOT NULL,
    comment TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (client_id) REFERENCES users(id),
    FOREIGN KEY (seller_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    link TEXT DEFAULT '',
    read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'password',
    expires_at TEXT NOT NULL,
    used INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS payouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    seller_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    paid_at TEXT,
    FOREIGN KEY (seller_id) REFERENCES users(id)
  );
  `);

  const userColumns = [
    ['email_verified', "INTEGER DEFAULT 0"],
    ['twofa_secret', "TEXT DEFAULT ''"],
    ['twofa_enabled', "INTEGER DEFAULT 0"],
    ['seller_balance', "REAL DEFAULT 0"],
    ['seller_rating', "REAL DEFAULT 0"],
    ['seller_review_count', "INTEGER DEFAULT 0"],
  ];
  const has = db.prepare("SELECT name FROM pragma_table_info('users') WHERE name = ?");
  for (const [name, def] of userColumns) {
    if (!has.get(name)) {
      db.exec(`ALTER TABLE users ADD COLUMN ${name} ${def}`);
    }
  }
}

migrate();

function get(sql, params = []) {
  return db.prepare(sql).get(...params);
}
function all(sql, params = []) {
  return db.prepare(sql).all(...params);
}
function run(sql, params = []) {
  return db.prepare(sql).run(...params);
}

function slugify(text) {
  const base = String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return base || 'item';
}

function uniqueSlug(text, table = 'services') {
  const base = slugify(text);
  let slug = base;
  let n = 2;
  while (get(`SELECT id FROM ${table} WHERE slug = ?`, [slug])) {
    slug = `${base}-${n++}`;
  }
  return slug;
}

module.exports = { db, get, all, run, slugify, uniqueSlug, DATA_DIR, DB_PATH };