const { createClient } = require("@libsql/client");

let _client = null;
function getClient() {
  if (!_client) {
    if (!process.env.TURSO_DATABASE_URL) {
      throw new Error("TURSO_DATABASE_URL ບໍ່ໄດ້ຖືກຕັ້ງຄ່າ (Environment Variable ຢູ່ Vercel)");
    }
    _client = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return _client;
}

let _schemaReady = null;
function ensureSchema() {
  if (_schemaReady) return _schemaReady;
  const db = getClient();
  const statements = [
    `CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canonical_name TEXT NOT NULL,
      category TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS product_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      alias_text TEXT NOT NULL,
      store_name TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(product_id, alias_text)
    )`,
    `CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_name TEXT,
      receipt_date TEXT,
      receipt_time TEXT,
      currency TEXT,
      grand_total REAL,
      raw_json TEXT,
      image_name TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS receipt_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_id INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id),
      raw_text TEXT,
      matched_name TEXT,
      quantity REAL,
      unit_price REAL,
      total_price REAL,
      confidence TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_alias_product ON product_aliases(product_id)`,
    `CREATE INDEX IF NOT EXISTS idx_items_receipt ON receipt_items(receipt_id)`,
  ];
  _schemaReady = (async () => {
    for (const sql of statements) {
      await db.execute(sql);
    }
  })();
  return _schemaReady;
}

// ---------- string similarity (Dice coefficient over character bigrams) ----------
function normalize(str) {
  return String(str || "").toLowerCase().replace(/\s+/g, " ").trim();
}
function bigrams(str) {
  const s = normalize(str);
  const grams = [];
  if (s.length < 2) {
    if (s.length === 1) grams.push(s);
    return grams;
  }
  for (let i = 0; i < s.length - 1; i++) grams.push(s.slice(i, i + 2));
  return grams;
}
function diceCoefficient(a, b) {
  const ga = bigrams(a);
  const gb = bigrams(b);
  if (ga.length === 0 || gb.length === 0) return normalize(a) === normalize(b) ? 1 : 0;
  const counts = new Map();
  for (const g of ga) counts.set(g, (counts.get(g) || 0) + 1);
  let matches = 0;
  for (const g of gb) {
    const c = counts.get(g) || 0;
    if (c > 0) { matches++; counts.set(g, c - 1); }
  }
  return (2 * matches) / (ga.length + gb.length);
}

// ---------- product helpers ----------

async function listProducts() {
  await ensureSchema();
  const db = getClient();
  const productsRes = await db.execute(`SELECT * FROM products ORDER BY canonical_name COLLATE NOCASE`);
  const out = [];
  for (const p of productsRes.rows) {
    const aliasRes = await db.execute({
      sql: `SELECT id, alias_text, store_name, created_at FROM product_aliases WHERE product_id = ? ORDER BY created_at`,
      args: [p.id],
    });
    out.push({ ...p, aliases: aliasRes.rows });
  }
  return out;
}

async function getProduct(id) {
  await ensureSchema();
  const db = getClient();
  const pRes = await db.execute({ sql: `SELECT * FROM products WHERE id = ?`, args: [id] });
  const p = pRes.rows[0];
  if (!p) return null;
  const aliasRes = await db.execute({
    sql: `SELECT id, alias_text, store_name, created_at FROM product_aliases WHERE product_id = ?`,
    args: [id],
  });
  return { ...p, aliases: aliasRes.rows };
}

async function suggestProducts(rawText, limit = 5) {
  const all = await listProducts();
  const scored = [];
  for (const p of all) {
    let best = diceCoefficient(rawText, p.canonical_name);
    for (const a of p.aliases) {
      const s = diceCoefficient(rawText, a.alias_text);
      if (s > best) best = s;
    }
    scored.push({ product: p, score: best });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

async function createProduct(canonicalName, category, firstAliasText, storeName) {
  await ensureSchema();
  const db = getClient();
  const info = await db.execute({
    sql: `INSERT INTO products (canonical_name, category) VALUES (?, ?)`,
    args: [canonicalName, category || null],
  });
  const productId = Number(info.lastInsertRowid);
  if (firstAliasText && normalize(firstAliasText) !== normalize(canonicalName)) {
    await addAlias(productId, firstAliasText, storeName);
  }
  return getProduct(productId);
}

async function addAlias(productId, aliasText, storeName) {
  const norm = normalize(aliasText);
  if (!norm) return;
  await ensureSchema();
  const db = getClient();
  const existing = await db.execute({
    sql: `SELECT id FROM product_aliases WHERE product_id = ? AND alias_text = ?`,
    args: [productId, aliasText],
  });
  if (existing.rows.length) return;
  await db.execute({
    sql: `INSERT INTO product_aliases (product_id, alias_text, store_name) VALUES (?, ?, ?)`,
    args: [productId, aliasText, storeName || null],
  });
}

async function saveReceipt({ store_name, receipt_date, receipt_time, currency, grand_total, raw_json, image_name, items }) {
  await ensureSchema();
  const db = getClient();
  const info = await db.execute({
    sql: `INSERT INTO receipts (store_name, receipt_date, receipt_time, currency, grand_total, raw_json, image_name)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      store_name || null,
      receipt_date || null,
      receipt_time || null,
      currency || null,
      grand_total ?? null,
      raw_json ? JSON.stringify(raw_json) : null,
      image_name || null,
    ],
  });
  const receiptId = Number(info.lastInsertRowid);

  for (const it of items || []) {
    await db.execute({
      sql: `INSERT INTO receipt_items (receipt_id, product_id, raw_text, matched_name, quantity, unit_price, total_price, confidence)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        receiptId,
        it.product_id || null,
        it.raw_text || null,
        it.matched_name || null,
        it.quantity ?? null,
        it.unit_price ?? null,
        it.total_price ?? null,
        it.confidence || null,
      ],
    });
  }

  return getReceipt(receiptId);
}

async function getReceipt(id) {
  await ensureSchema();
  const db = getClient();
  const rRes = await db.execute({ sql: `SELECT * FROM receipts WHERE id = ?`, args: [id] });
  const receipt = rRes.rows[0];
  if (!receipt) return null;
  const itemsRes = await db.execute({ sql: `SELECT * FROM receipt_items WHERE receipt_id = ?`, args: [id] });
  return { ...receipt, items: itemsRes.rows };
}

async function listReceipts(limit = 50) {
  await ensureSchema();
  const db = getClient();
  const res = await db.execute({ sql: `SELECT * FROM receipts ORDER BY created_at DESC LIMIT ?`, args: [limit] });
  return res.rows;
}

module.exports = {
  diceCoefficient,
  listProducts,
  getProduct,
  suggestProducts,
  createProduct,
  addAlias,
  saveReceipt,
  getReceipt,
  listReceipts,
};
