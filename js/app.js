/**
 * Main application entry point
 */

import { initDatabase } from "./db.js";
import { initNetwork, refreshNetwork, resetPositions } from "./network.js";
import {
  initUI,
  showContactDetails,
  showContextMenu,
  hideLoading,
} from "./ui.js";

/**
 * Initialize the application
 */
async function init() {
  try {
    // Initialize database
    await initDatabase();
    console.log("Database initialized");

    // Initialize UI
    initUI();
    console.log("UI initialized");

    // Initialize network visualization
    const container = document.getElementById("network-container");
    initNetwork(container, {
      onNodeClick: (nodeId) => {
        showContactDetails(nodeId);
      },
      onNodeRightClick: (nodeId, event) => {
        showContextMenu(nodeId, event);
      },
      onEdgeClick: (edgeId) => {
        // Could show edge details or edit modal
        console.log("Edge clicked:", edgeId);
      },
    });
    console.log("Network initialized");

    // Wire up reset layout button
    document
      .getElementById("btn-reset-layout")
      .addEventListener("click", async () => {
        if (
          confirm(
            "Reset the network layout? This will clear saved positions and re-run physics."
          )
        ) {
          await resetPositions();
        }
      });

    // Hide loading screen
    hideLoading();

    // Register service worker for PWA
    if ("serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        console.log("Service Worker registered:", registration.scope);
      } catch (error) {
        console.warn("Service Worker registration failed:", error);
      }
    }
  } catch (error) {
    console.error("Failed to initialize app:", error);
    document.getElementById("loading").innerHTML = `
      <div style="text-align: center; color: #e53e3e;">
        <h2>Failed to load</h2>
        <p>${error.message}</p>
        <button onclick="location.reload()" class="btn btn-primary" style="margin-top: 1rem;">
          Retry
        </button>
      </div>
    `;
  }
}

// Start the app when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
