/**
 * Database module using sql.js with IndexedDB persistence
 */

const DB_NAME = "remember-names-db";
const DB_STORE = "sqlitedb";

let db = null;

/**
 * Initialize sql.js and load database from IndexedDB
 */
export async function initDatabase() {
  // Initialize SQL.js
  const SQL = await initSqlJs({
    locateFile: (file) =>
      `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}`,
  });

  // Try to load existing database from IndexedDB
  const savedData = await loadFromIndexedDB();

  if (savedData) {
    db = new SQL.Database(savedData);
    console.log("Database loaded from IndexedDB");
  } else {
    db = new SQL.Database();
    createSchema();
    console.log("New database created");
  }

  return db;
}

/**
 * Create database schema
 */
function createSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      image_url TEXT,
      image_blob TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS connections (
      id TEXT PRIMARY KEY,
      from_contact_id TEXT NOT NULL,
      to_contact_id TEXT NOT NULL,
      label TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (from_contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
      FOREIGN KEY (to_contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
      UNIQUE(from_contact_id, to_contact_id)
    )
  `);

  db.run(
    `CREATE INDEX IF NOT EXISTS idx_connections_from ON connections(from_contact_id)`
  );
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_connections_to ON connections(to_contact_id)`
  );

  // Table for storing node positions
  db.run(`
    CREATE TABLE IF NOT EXISTS node_positions (
      contact_id TEXT PRIMARY KEY,
      x REAL NOT NULL,
      y REAL NOT NULL,
      fixed INTEGER DEFAULT 1,
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
    )
  `);
}

/**
 * Ensure node_positions table exists (for migration from older schema)
 */
export function ensurePositionsTable() {
  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS node_positions (
        contact_id TEXT PRIMARY KEY,
        x REAL NOT NULL,
        y REAL NOT NULL,
        fixed INTEGER DEFAULT 1,
        FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
      )
    `);
  } catch (e) {
    // Table might already exist
  }
}

/**
 * Save database to IndexedDB
 */
export async function saveToIndexedDB() {
  const data = db.export();
  const buffer = new Uint8Array(data);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onerror = () => reject(request.error);

    request.onupgradeneeded = (event) => {
      const idb = event.target.result;
      if (!idb.objectStoreNames.contains(DB_STORE)) {
        idb.createObjectStore(DB_STORE);
      }
    };

    request.onsuccess = (event) => {
      const idb = event.target.result;
      const transaction = idb.transaction(DB_STORE, "readwrite");
      const store = transaction.objectStore(DB_STORE);

      store.put(buffer, "database");

      transaction.oncomplete = () => {
        console.log("Database saved to IndexedDB");
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    };
  });
}

/**
 * Load database from IndexedDB
 */
async function loadFromIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onerror = () => reject(request.error);

    request.onupgradeneeded = (event) => {
      const idb = event.target.result;
      if (!idb.objectStoreNames.contains(DB_STORE)) {
        idb.createObjectStore(DB_STORE);
      }
    };

    request.onsuccess = (event) => {
      const idb = event.target.result;
      const transaction = idb.transaction(DB_STORE, "readonly");
      const store = transaction.objectStore(DB_STORE);

      const getRequest = store.get("database");

      getRequest.onsuccess = () => {
        resolve(getRequest.result || null);
      };
      getRequest.onerror = () => reject(getRequest.error);
    };
  });
}

/**
 * Execute a SQL query and return results as array of objects
 */
export function query(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);

  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();

  return results;
}

/**
 * Execute a SQL statement (INSERT, UPDATE, DELETE)
 */
export function execute(sql, params = []) {
  db.run(sql, params);
  return db.getRowsModified();
}

/**
 * Generate a UUID
 */
export function generateId() {
  return crypto.randomUUID();
}

/**
 * Export all data as JSON
 */
export function exportData() {
  const contacts = query("SELECT * FROM contacts");
  const connections = query("SELECT * FROM connections");

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    contacts,
    connections,
  };
}

/**
 * Import data from JSON (merge with existing)
 */
export async function importData(data) {
  if (!data.contacts || !data.connections) {
    throw new Error("Invalid import data format");
  }

  // Import contacts
  for (const contact of data.contacts) {
    const existing = query("SELECT id FROM contacts WHERE id = ?", [
      contact.id,
    ]);
    if (existing.length === 0) {
      execute(
        `INSERT INTO contacts (id, name, image_url, image_blob, notes, created_at) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          contact.id,
          contact.name,
          contact.image_url,
          contact.image_blob,
          contact.notes,
          contact.created_at,
        ]
      );
    }
  }

  // Import connections
  for (const conn of data.connections) {
    const existing = query("SELECT id FROM connections WHERE id = ?", [
      conn.id,
    ]);
    if (existing.length === 0) {
      try {
        execute(
          `INSERT INTO connections (id, from_contact_id, to_contact_id, label, created_at) 
           VALUES (?, ?, ?, ?, ?)`,
          [
            conn.id,
            conn.from_contact_id,
            conn.to_contact_id,
            conn.label,
            conn.created_at,
          ]
        );
      } catch (e) {
        // Skip if foreign key constraint fails
        console.warn("Skipping connection due to missing contact:", conn);
      }
    }
  }

  await saveToIndexedDB();
}

/**
 * Get the raw database instance
 */
export function getDb() {
  return db;
}

/**
 * Save node positions to database
 */
export async function saveNodePositions(positions) {
  ensurePositionsTable();

  // Clear existing positions and insert new ones
  for (const pos of positions) {
    execute(
      `INSERT OR REPLACE INTO node_positions (contact_id, x, y, fixed) VALUES (?, ?, ?, ?)`,
      [pos.id, pos.x, pos.y, pos.fixed ? 1 : 0]
    );
  }

  await saveToIndexedDB();
}

/**
 * Get all saved node positions
 */
export function getNodePositions() {
  ensurePositionsTable();
  return query("SELECT contact_id as id, x, y, fixed FROM node_positions");
}

/**
 * Clear all node positions
 */
export async function clearNodePositions() {
  ensurePositionsTable();
  execute("DELETE FROM node_positions");
  await saveToIndexedDB();
}
