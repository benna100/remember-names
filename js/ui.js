/**
 * UI module - Modal, form, and interaction handling
 */

import {
  getAllContacts,
  getContactById,
  createContact,
  updateContact,
  deleteContact,
  getContactImage,
  fileToBase64,
} from "./contacts.js";

import {
  getConnectionsForContact,
  createConnection,
  deleteConnection,
} from "./connections.js";

import { exportData, importData } from "./db.js";
import { refreshNetwork, focusNode } from "./network.js";

let selectedImageBlob = null;
let selectedSearchIndex = -1;

/**
 * Initialize UI event listeners
 */
export function initUI() {
  // Modal close buttons
  document.querySelectorAll(".modal-close, [data-modal]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const modalId = e.target.dataset.modal;
      if (modalId) {
        closeModal(modalId);
      }
    });
  });

  // Close modal on backdrop click
  document.querySelectorAll(".modal").forEach((modal) => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.add("hidden");
      }
    });
  });

  // Add contact button
  document.getElementById("btn-add-contact").addEventListener("click", () => {
    openContactModal();
  });

  // Contact form submission
  document
    .getElementById("form-contact")
    .addEventListener("submit", handleContactSubmit);

  // Connection form submission
  document
    .getElementById("form-connection")
    .addEventListener("submit", handleConnectionSubmit);

  // Image input tabs
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const tab = e.target.dataset.tab;
      document
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("active"));
      document
        .querySelectorAll(".tab-content")
        .forEach((c) => c.classList.remove("active"));
      e.target.classList.add("active");
      document.getElementById(`tab-${tab}`).classList.add("active");
    });
  });

  // Image file preview
  document
    .getElementById("contact-image-file")
    .addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (file) {
        selectedImageBlob = await fileToBase64(file);
        const preview = document.getElementById("image-preview");
        preview.innerHTML = `<img src="${selectedImageBlob}" alt="Preview">`;
      }
    });

  // Search input with dropdown
  const searchInput = document.getElementById("search-input");
  const searchDropdown = document.getElementById("search-dropdown");

  searchInput.addEventListener("input", (e) => {
    const query = e.target.value.trim();
    updateSearchDropdown(query);
  });

  searchInput.addEventListener("focus", (e) => {
    const query = e.target.value.trim();
    if (query) {
      updateSearchDropdown(query);
    }
  });

  searchInput.addEventListener("keydown", (e) => {
    const items = searchDropdown.querySelectorAll(".search-item");
    if (items.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedSearchIndex = Math.min(selectedSearchIndex + 1, items.length - 1);
      updateSearchSelection(items);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedSearchIndex = Math.max(selectedSearchIndex - 1, 0);
      updateSearchSelection(items);
    } else if (e.key === "Enter" && selectedSearchIndex >= 0) {
      e.preventDefault();
      const selectedItem = items[selectedSearchIndex];
      if (selectedItem) {
        selectSearchResult(selectedItem.dataset.contactId);
      }
    } else if (e.key === "Escape") {
      searchDropdown.classList.add("hidden");
      selectedSearchIndex = -1;
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-container")) {
      document.querySelectorAll(".search-dropdown").forEach((dropdown) => {
        dropdown.classList.add("hidden");
      });
      selectedSearchIndex = -1;
    }
  });

  // Connection "From" search input
  setupContactSearchInput(
    "connection-from",
    "connection-from-dropdown",
    "connection-from-id"
  );

  // Connection "To" search input
  setupContactSearchInput(
    "connection-to",
    "connection-to-dropdown",
    "connection-to-id"
  );

  // Import/Export button
  document.getElementById("btn-import-export").addEventListener("click", () => {
    openModal("modal-import-export");
  });

  // Export button
  document.getElementById("btn-export").addEventListener("click", handleExport);

  // Import file selection
  document.getElementById("import-file").addEventListener("change", (e) => {
    document.getElementById("btn-import").disabled = !e.target.files[0];
  });

  // Import button
  document.getElementById("btn-import").addEventListener("click", handleImport);

  // Sidebar close
  document
    .getElementById("sidebar-close")
    .addEventListener("click", closeSidebar);

  // Context menu items
  document
    .getElementById("ctx-edit")
    .addEventListener("click", handleContextEdit);
  document
    .getElementById("ctx-add-connection")
    .addEventListener("click", handleContextAddConnection);
  document
    .getElementById("ctx-delete")
    .addEventListener("click", handleContextDelete);

  // Close context menu on click elsewhere
  document.addEventListener("click", () => {
    document.getElementById("context-menu").classList.add("hidden");
  });

  // Close sidebar on escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeSidebar();
      document
        .querySelectorAll(".modal")
        .forEach((m) => m.classList.add("hidden"));
      document.getElementById("context-menu").classList.add("hidden");
    }
  });
}

/**
 * Open a modal
 */
export function openModal(modalId) {
  document.getElementById(modalId).classList.remove("hidden");
}

/**
 * Close a modal
 */
export function closeModal(modalId) {
  document.getElementById(modalId).classList.add("hidden");
}

/**
 * Open contact modal for add/edit
 */
export function openContactModal(contact = null) {
  const modal = document.getElementById("modal-contact");
  const title = document.getElementById("modal-contact-title");
  const form = document.getElementById("form-contact");

  // Reset form
  form.reset();
  selectedImageBlob = null;
  document.getElementById("image-preview").innerHTML = "";
  document
    .querySelectorAll(".tab-btn")
    .forEach((b) => b.classList.remove("active"));
  document
    .querySelectorAll(".tab-content")
    .forEach((c) => c.classList.remove("active"));
  document.querySelector('.tab-btn[data-tab="url"]').classList.add("active");
  document.getElementById("tab-url").classList.add("active");

  if (contact) {
    title.textContent = "Edit Contact";
    document.getElementById("contact-id").value = contact.id;
    document.getElementById("contact-name").value = contact.name;
    document.getElementById("contact-image-url").value =
      contact.image_url || "";
    document.getElementById("contact-notes").value = contact.notes || "";

    if (contact.image_blob) {
      selectedImageBlob = contact.image_blob;
      document
        .querySelector('.tab-btn[data-tab="file"]')
        .classList.add("active");
      document
        .querySelector('.tab-btn[data-tab="url"]')
        .classList.remove("active");
      document.getElementById("tab-file").classList.add("active");
      document.getElementById("tab-url").classList.remove("active");
      document.getElementById(
        "image-preview"
      ).innerHTML = `<img src="${contact.image_blob}" alt="Preview">`;
    }
  } else {
    title.textContent = "Add Contact";
    document.getElementById("contact-id").value = "";
  }

  modal.classList.remove("hidden");
  document.getElementById("contact-name").focus();
}

/**
 * Handle contact form submission
 */
async function handleContactSubmit(e) {
  e.preventDefault();

  const id = document.getElementById("contact-id").value;
  const name = document.getElementById("contact-name").value.trim();
  const imageUrl = document.getElementById("contact-image-url").value.trim();
  const notes = document.getElementById("contact-notes").value.trim();

  const contactData = {
    name,
    imageUrl: imageUrl || null,
    imageBlob: selectedImageBlob || null,
    notes: notes || null,
  };

  try {
    if (id) {
      await updateContact(id, contactData);
    } else {
      await createContact(contactData);
    }

    closeModal("modal-contact");
    refreshNetwork();
  } catch (error) {
    alert("Error saving contact: " + error.message);
  }
}

/**
 * Open connection modal
 */
export function openConnectionModal(preselectedFromId = null) {
  const modal = document.getElementById("modal-connection");
  const form = document.getElementById("form-connection");
  const fromInput = document.getElementById("connection-from");
  const toInput = document.getElementById("connection-to");

  form.reset();
  document.getElementById("connection-id").value = "";
  document.getElementById("connection-from-id").value = "";
  document.getElementById("connection-to-id").value = "";

  if (preselectedFromId) {
    const contact = getContactById(preselectedFromId);
    if (contact) {
      fromInput.value = contact.name;
      document.getElementById("connection-from-id").value = preselectedFromId;
    }
  }

  modal.classList.remove("hidden");
}

/**
 * Handle connection form submission
 */
async function handleConnectionSubmit(e) {
  e.preventDefault();

  const fromContactId = document.getElementById("connection-from-id").value;
  const toContactId = document.getElementById("connection-to-id").value;
  const label = document.getElementById("connection-label").value.trim();

  if (!fromContactId || !toContactId) {
    alert("Please select both contacts from the dropdown suggestions.");
    return;
  }

  try {
    await createConnection({ fromContactId, toContactId, label });
    closeModal("modal-connection");
    refreshNetwork();
  } catch (error) {
    alert("Error saving connection: " + error.message);
  }
}

/**
 * Show contact details in sidebar
 */
export function showContactDetails(contactId) {
  const contact = getContactById(contactId);
  if (!contact) return;

  const connections = getConnectionsForContact(contactId);
  const sidebar = document.getElementById("sidebar");
  const content = document.getElementById("sidebar-content");

  const connectionsHtml =
    connections.length > 0
      ? connections
          .map(
            (conn) => `
        <div class="connection-item" data-contact-id="${conn.other_contact_id}">
          <img class="connection-item-image" 
               src="${
                 conn.other_contact_image_blob ||
                 conn.other_contact_image_url ||
                 "assets/placeholder.svg"
               }" 
               alt="${conn.other_contact_name}"
               onerror="this.src='assets/placeholder.svg'">
          <div class="connection-item-info">
            <div class="connection-item-name">${conn.other_contact_name}</div>
            <div class="connection-item-label">${conn.label}</div>
          </div>
        </div>
      `
          )
          .join("")
      : '<p style="color: var(--color-text-secondary); font-size: 0.875rem;">No connections yet</p>';

  content.innerHTML = `
    <div class="contact-detail">
      <img class="contact-detail-image" 
           src="${getContactImage(contact)}" 
           alt="${contact.name}"
           onerror="this.src='assets/placeholder.svg'">
      <h3 class="contact-detail-name">${contact.name}</h3>
      ${
        contact.notes
          ? `<div class="contact-detail-notes">${contact.notes}</div>`
          : ""
      }
      
      <div class="sidebar-actions">
        <button class="btn btn-secondary" onclick="window.appUI.openContactModal(window.appUI.getContactById('${
          contact.id
        }'))">Edit</button>
        <button class="btn btn-secondary" onclick="window.appUI.openConnectionModal('${
          contact.id
        }')">Add Connection</button>
        <button class="btn btn-danger" onclick="window.appUI.confirmDeleteContact('${
          contact.id
        }')">Delete</button>
      </div>
      
      <div class="contact-connections">
        <h4>Connections</h4>
        ${connectionsHtml}
      </div>
    </div>
  `;

  // Add click handlers for connection items
  content.querySelectorAll(".connection-item").forEach((item) => {
    item.addEventListener("click", () => {
      const id = item.dataset.contactId;
      focusNode(id);
      showContactDetails(id);
    });
  });

  sidebar.classList.remove("hidden");
}

/**
 * Close sidebar
 */
export function closeSidebar() {
  document.getElementById("sidebar").classList.add("hidden");
}

/**
 * Confirm and delete a contact
 */
export async function confirmDeleteContact(contactId) {
  const contact = getContactById(contactId);
  if (!contact) return;

  if (
    confirm(
      `Are you sure you want to delete "${contact.name}"? This will also remove all their connections.`
    )
  ) {
    await deleteContact(contactId);
    closeSidebar();
    refreshNetwork();
  }
}

// Context menu state
let contextMenuContactId = null;

/**
 * Show context menu for a node
 */
export function showContextMenu(contactId, event) {
  contextMenuContactId = contactId;
  const menu = document.getElementById("context-menu");

  menu.style.left = `${event.clientX}px`;
  menu.style.top = `${event.clientY}px`;
  menu.classList.remove("hidden");
}

function handleContextEdit() {
  if (contextMenuContactId) {
    const contact = getContactById(contextMenuContactId);
    openContactModal(contact);
  }
}

function handleContextAddConnection() {
  if (contextMenuContactId) {
    openConnectionModal(contextMenuContactId);
  }
}

function handleContextDelete() {
  if (contextMenuContactId) {
    confirmDeleteContact(contextMenuContactId);
  }
}

/**
 * Handle export
 */
function handleExport() {
  const data = exportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `remember-names-backup-${
    new Date().toISOString().split("T")[0]
  }.json`;
  a.click();

  URL.revokeObjectURL(url);
}

/**
 * Handle import
 */
async function handleImport() {
  const fileInput = document.getElementById("import-file");
  const file = fileInput.files[0];

  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);
    await importData(data);
    closeModal("modal-import-export");
    refreshNetwork();
    alert("Data imported successfully!");
  } catch (error) {
    alert("Error importing data: " + error.message);
  }
}

/**
 * Hide loading indicator
 */
export function hideLoading() {
  document.getElementById("loading").classList.add("hidden");
}

/**
 * Update search dropdown with matching contacts
 */
function updateSearchDropdown(query) {
  const dropdown = document.getElementById("search-dropdown");
  selectedSearchIndex = -1;

  if (!query) {
    dropdown.classList.add("hidden");
    return;
  }

  const contacts = getAllContacts();
  const matches = contacts
    .filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 10); // Limit to 10 results

  if (matches.length === 0) {
    dropdown.innerHTML =
      '<div class="search-no-results">No contacts found</div>';
  } else {
    dropdown.innerHTML = matches
      .map((contact) => {
        const image = getContactImage(contact);
        const hasImage = contact.image_blob || contact.image_url;
        return `
        <div class="search-item" data-contact-id="${contact.id}">
          ${
            hasImage
              ? `<img class="search-item-image" src="${image}" alt="">`
              : `<div class="search-item-image" style="display:flex;align-items:center;justify-content:center;font-size:12px;color:#718096;">${getInitials(
                  contact.name
                )}</div>`
          }
          <span class="search-item-name">${contact.name}</span>
        </div>
      `;
      })
      .join("");

    // Add click handlers
    dropdown.querySelectorAll(".search-item").forEach((item) => {
      item.addEventListener("click", () => {
        selectSearchResult(item.dataset.contactId);
      });
    });
  }

  dropdown.classList.remove("hidden");
}

/**
 * Update visual selection in search dropdown
 */
function updateSearchSelection(items) {
  items.forEach((item, index) => {
    item.classList.toggle("selected", index === selectedSearchIndex);
  });
}

/**
 * Select a search result - focus and zoom to the contact
 */
function selectSearchResult(contactId) {
  const searchInput = document.getElementById("search-input");
  const dropdown = document.getElementById("search-dropdown");

  // Clear search and hide dropdown
  searchInput.value = "";
  dropdown.classList.add("hidden");
  selectedSearchIndex = -1;

  // Focus on the node
  focusNode(contactId);
}

/**
 * Get initials from a name
 */
function getInitials(name) {
  return name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Setup a contact search input with dropdown
 */
function setupContactSearchInput(inputId, dropdownId, hiddenInputId) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  const hiddenInput = document.getElementById(hiddenInputId);
  let localSelectedIndex = -1;

  input.addEventListener("input", (e) => {
    const query = e.target.value.trim();
    // Clear the hidden input when user types (they need to select from dropdown)
    hiddenInput.value = "";
    updateContactDropdown(query, dropdown, inputId, hiddenInputId);
    localSelectedIndex = -1;
  });

  input.addEventListener("focus", (e) => {
    const query = e.target.value.trim();
    updateContactDropdown(query, dropdown, inputId, hiddenInputId);
  });

  input.addEventListener("keydown", (e) => {
    const items = dropdown.querySelectorAll(".search-item");
    if (items.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      localSelectedIndex = Math.min(localSelectedIndex + 1, items.length - 1);
      items.forEach((item, index) => {
        item.classList.toggle("selected", index === localSelectedIndex);
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      localSelectedIndex = Math.max(localSelectedIndex - 1, 0);
      items.forEach((item, index) => {
        item.classList.toggle("selected", index === localSelectedIndex);
      });
    } else if (e.key === "Enter" && localSelectedIndex >= 0) {
      e.preventDefault();
      const selectedItem = items[localSelectedIndex];
      if (selectedItem) {
        selectContactForInput(
          selectedItem.dataset.contactId,
          inputId,
          dropdownId,
          hiddenInputId
        );
      }
    } else if (e.key === "Escape") {
      dropdown.classList.add("hidden");
      localSelectedIndex = -1;
    }
  });
}

/**
 * Update contact dropdown for connection inputs
 */
function updateContactDropdown(query, dropdown, inputId, hiddenInputId) {
  const contacts = getAllContacts();
  const matches = query
    ? contacts.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
    : contacts;
  const limited = matches.slice(0, 10);

  if (limited.length === 0) {
    dropdown.innerHTML =
      '<div class="search-no-results">No contacts found</div>';
  } else {
    dropdown.innerHTML = limited
      .map((contact) => {
        const image = getContactImage(contact);
        const hasImage = contact.image_blob || contact.image_url;
        return `
        <div class="search-item" data-contact-id="${contact.id}">
          ${
            hasImage
              ? `<img class="search-item-image" src="${image}" alt="">`
              : `<div class="search-item-image" style="display:flex;align-items:center;justify-content:center;font-size:12px;color:#718096;">${getInitials(
                  contact.name
                )}</div>`
          }
          <span class="search-item-name">${contact.name}</span>
        </div>
      `;
      })
      .join("");

    // Add click handlers
    dropdown.querySelectorAll(".search-item").forEach((item) => {
      item.addEventListener("click", () => {
        selectContactForInput(
          item.dataset.contactId,
          inputId,
          dropdown.id,
          hiddenInputId
        );
      });
    });
  }

  dropdown.classList.remove("hidden");
}

/**
 * Select a contact for a connection input
 */
function selectContactForInput(contactId, inputId, dropdownId, hiddenInputId) {
  const contact = getContactById(contactId);
  if (!contact) return;

  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  const hiddenInput = document.getElementById(hiddenInputId);

  input.value = contact.name;
  hiddenInput.value = contactId;
  dropdown.classList.add("hidden");
}

// Expose functions to window for inline handlers
window.appUI = {
  openContactModal,
  openConnectionModal,
  getContactById,
  confirmDeleteContact,
};
