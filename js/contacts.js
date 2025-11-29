/**
 * Contacts module - CRUD operations for contacts
 */

import { query, execute, generateId, saveToIndexedDB } from "./db.js";

/**
 * Get all contacts
 */
export function getAllContacts() {
  return query("SELECT * FROM contacts ORDER BY name ASC");
}

/**
 * Get a contact by ID
 */
export function getContactById(id) {
  const results = query("SELECT * FROM contacts WHERE id = ?", [id]);
  return results[0] || null;
}

/**
 * Search contacts by name
 */
export function searchContacts(searchTerm) {
  const term = `%${searchTerm.toLowerCase()}%`;
  return query(
    "SELECT * FROM contacts WHERE LOWER(name) LIKE ? ORDER BY name ASC",
    [term]
  );
}

/**
 * Create a new contact
 */
export async function createContact({ name, imageUrl, imageBlob, notes }) {
  const id = generateId();

  execute(
    `INSERT INTO contacts (id, name, image_url, image_blob, notes) 
     VALUES (?, ?, ?, ?, ?)`,
    [id, name, imageUrl || null, imageBlob || null, notes || null]
  );

  await saveToIndexedDB();
  return getContactById(id);
}

/**
 * Update an existing contact
 */
export async function updateContact(id, { name, imageUrl, imageBlob, notes }) {
  execute(
    `UPDATE contacts 
     SET name = ?, image_url = ?, image_blob = ?, notes = ?
     WHERE id = ?`,
    [name, imageUrl || null, imageBlob || null, notes || null, id]
  );

  await saveToIndexedDB();
  return getContactById(id);
}

/**
 * Delete a contact and all its connections
 */
export async function deleteContact(id) {
  // Delete connections first
  execute(
    "DELETE FROM connections WHERE from_contact_id = ? OR to_contact_id = ?",
    [id, id]
  );

  // Delete contact
  execute("DELETE FROM contacts WHERE id = ?", [id]);

  await saveToIndexedDB();
}

/**
 * Get the image source for a contact (URL or blob)
 */
export function getContactImage(contact) {
  if (contact.image_blob) {
    return contact.image_blob;
  }
  if (contact.image_url) {
    return contact.image_url;
  }
  return "assets/placeholder.svg";
}

/**
 * Convert a file to base64 data URL
 */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
