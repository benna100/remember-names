/**
 * Connections module - CRUD operations for connections between contacts
 */

import { query, execute, generateId, saveToIndexedDB } from "./db.js";

/**
 * Get all connections
 */
export function getAllConnections() {
  return query(`
    SELECT 
      c.*,
      cf.name as from_name,
      cf.image_url as from_image_url,
      cf.image_blob as from_image_blob,
      ct.name as to_name,
      ct.image_url as to_image_url,
      ct.image_blob as to_image_blob
    FROM connections c
    JOIN contacts cf ON c.from_contact_id = cf.id
    JOIN contacts ct ON c.to_contact_id = ct.id
    ORDER BY c.created_at DESC
  `);
}

/**
 * Get all connections for a specific contact
 */
export function getConnectionsForContact(contactId) {
  return query(
    `
    SELECT 
      c.*,
      CASE 
        WHEN c.from_contact_id = ? THEN ct.id
        ELSE cf.id
      END as other_contact_id,
      CASE 
        WHEN c.from_contact_id = ? THEN ct.name
        ELSE cf.name
      END as other_contact_name,
      CASE 
        WHEN c.from_contact_id = ? THEN ct.image_url
        ELSE cf.image_url
      END as other_contact_image_url,
      CASE 
        WHEN c.from_contact_id = ? THEN ct.image_blob
        ELSE cf.image_blob
      END as other_contact_image_blob
    FROM connections c
    JOIN contacts cf ON c.from_contact_id = cf.id
    JOIN contacts ct ON c.to_contact_id = ct.id
    WHERE c.from_contact_id = ? OR c.to_contact_id = ?
    ORDER BY c.created_at DESC
  `,
    [contactId, contactId, contactId, contactId, contactId, contactId]
  );
}

/**
 * Check if a connection exists between two contacts
 */
export function connectionExists(fromId, toId) {
  const results = query(
    `
    SELECT id FROM connections 
    WHERE (from_contact_id = ? AND to_contact_id = ?)
       OR (from_contact_id = ? AND to_contact_id = ?)
  `,
    [fromId, toId, toId, fromId]
  );

  return results.length > 0;
}

/**
 * Create a new connection (bidirectional)
 * Creates two entries: A->B and B->A with the same label
 */
export async function createConnection({ fromContactId, toContactId, label }) {
  if (fromContactId === toContactId) {
    throw new Error("Cannot connect a contact to themselves");
  }

  if (connectionExists(fromContactId, toContactId)) {
    throw new Error("Connection already exists between these contacts");
  }

  const id1 = generateId();
  const id2 = generateId();

  // Create bidirectional connections
  execute(
    `INSERT INTO connections (id, from_contact_id, to_contact_id, label) 
     VALUES (?, ?, ?, ?)`,
    [id1, fromContactId, toContactId, label]
  );

  execute(
    `INSERT INTO connections (id, from_contact_id, to_contact_id, label) 
     VALUES (?, ?, ?, ?)`,
    [id2, toContactId, fromContactId, label]
  );

  await saveToIndexedDB();
  return { id: id1, fromContactId, toContactId, label };
}

/**
 * Update a connection label (updates both directions)
 */
export async function updateConnection(fromContactId, toContactId, { label }) {
  execute(
    `UPDATE connections SET label = ? 
     WHERE (from_contact_id = ? AND to_contact_id = ?)
        OR (from_contact_id = ? AND to_contact_id = ?)`,
    [label, fromContactId, toContactId, toContactId, fromContactId]
  );

  await saveToIndexedDB();
}

/**
 * Delete a connection (deletes both directions)
 */
export async function deleteConnection(fromContactId, toContactId) {
  execute(
    `DELETE FROM connections 
     WHERE (from_contact_id = ? AND to_contact_id = ?)
        OR (from_contact_id = ? AND to_contact_id = ?)`,
    [fromContactId, toContactId, toContactId, fromContactId]
  );

  await saveToIndexedDB();
}

/**
 * Get unique connections (no duplicates for bidirectional)
 */
export function getUniqueConnections() {
  return query(`
    SELECT DISTINCT
      MIN(c.id) as id,
      CASE WHEN c.from_contact_id < c.to_contact_id 
           THEN c.from_contact_id ELSE c.to_contact_id END as contact1_id,
      CASE WHEN c.from_contact_id < c.to_contact_id 
           THEN c.to_contact_id ELSE c.from_contact_id END as contact2_id,
      c.label
    FROM connections c
    GROUP BY 
      CASE WHEN c.from_contact_id < c.to_contact_id 
           THEN c.from_contact_id ELSE c.to_contact_id END,
      CASE WHEN c.from_contact_id < c.to_contact_id 
           THEN c.to_contact_id ELSE c.from_contact_id END
  `);
}
