/**
 * Network visualization module using vis.js
 */

import { getAllContacts, getContactImage } from "./contacts.js";
import { getUniqueConnections } from "./connections.js";
import {
  saveNodePositions,
  getNodePositions,
  clearNodePositions,
} from "./db.js";

let network = null;
let nodesDataSet = null;
let edgesDataSet = null;
let saveInterval = null;
const SAVE_INTERVAL_MS = 2000; // Save positions every 2 seconds while settling

// Color palette for nodes without images
const NODE_COLORS = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#3b82f6", // blue
];

/**
 * Generate a consistent color for a name
 */
function getColorForName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return NODE_COLORS[Math.abs(hash) % NODE_COLORS.length];
}

/**
 * Initialize the network graph
 */
export function initNetwork(
  container,
  { onNodeClick, onNodeRightClick, onEdgeClick }
) {
  nodesDataSet = new vis.DataSet([]);
  edgesDataSet = new vis.DataSet([]);

  const options = {
    nodes: {
      shape: "circularImage",
      size: 40,
      font: {
        size: 16,
        color: "#1a202c",
        face: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      },
      borderWidth: 3,
      borderWidthSelected: 4,
      color: {
        border: "#e2e8f0",
        highlight: {
          border: "#4a5568",
        },
      },
      shadow: {
        enabled: true,
        color: "rgba(0,0,0,0.1)",
        size: 10,
        x: 0,
        y: 2,
      },
    },
    edges: {
      width: 2,
      color: {
        color: "#a0aec0",
        highlight: "#4a5568",
      },
      font: {
        size: 14,
        color: "#718096",
        strokeWidth: 3,
        strokeColor: "#ffffff",
        face: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      },
      smooth: {
        type: "continuous",
        roundness: 0.5,
      },
      shadow: {
        enabled: true,
        color: "rgba(0,0,0,0.05)",
        size: 5,
      },
    },
    physics: {
      enabled: true,
      solver: "forceAtlas2Based",
      forceAtlas2Based: {
        // Stronger repulsion for better spacing
        gravitationalConstant: -200,
        centralGravity: 0.005,
        // Longer springs = more spacing
        springLength: 250,
        springConstant: 0.05,
        damping: 0.5,
        avoidOverlap: 0.8,
      },
      stabilization: {
        enabled: true,
        iterations: 500,
        updateInterval: 25,
        fit: true,
      },
      maxVelocity: 50,
      minVelocity: 0.75,
      timestep: 0.5,
    },
    interaction: {
      hover: true,
      hoverConnectedEdges: true,
      selectConnectedEdges: true,
      navigationButtons: false,
      keyboard: {
        enabled: true,
        bindToWindow: false,
      },
      zoomView: true,
    },
  };

  network = new vis.Network(
    container,
    { nodes: nodesDataSet, edges: edgesDataSet },
    options
  );

  // Event handlers
  network.on("click", (params) => {
    if (params.nodes.length > 0) {
      onNodeClick(params.nodes[0]);
    } else if (params.edges.length > 0) {
      onEdgeClick(params.edges[0]);
    }
  });

  network.on("oncontext", (params) => {
    params.event.preventDefault();

    const nodeId = network.getNodeAt(params.pointer.DOM);
    if (nodeId) {
      onNodeRightClick(nodeId, params.event);
    }
  });

  // Save positions when stabilization completes
  network.on("stabilizationIterationsDone", () => {
    console.log("Stabilization complete");
    saveCurrentPositions();
  });

  // Periodically save positions while physics is running
  startPeriodicSave();

  // Save positions after user drags a node
  network.on("dragEnd", (params) => {
    if (params.nodes.length > 0) {
      saveCurrentPositions();
    }
  });

  // Save before page unload
  window.addEventListener("beforeunload", () => {
    saveCurrentPositionsSync();
  });

  // Initial load
  refreshNetwork();

  return network;
}

/**
 * Start periodic position saving
 */
function startPeriodicSave() {
  if (saveInterval) clearInterval(saveInterval);
  saveInterval = setInterval(() => {
    saveCurrentPositions();
  }, SAVE_INTERVAL_MS);
}

/**
 * Save current node positions to database (async)
 */
async function saveCurrentPositions() {
  if (!network || !nodesDataSet) return;

  const positions = network.getPositions();
  const posArray = [];

  for (const nodeId of Object.keys(positions)) {
    posArray.push({
      id: nodeId,
      x: positions[nodeId].x,
      y: positions[nodeId].y,
      fixed: false,
    });
  }

  if (posArray.length > 0) {
    await saveNodePositions(posArray);
  }
}

/**
 * Save positions synchronously (for beforeunload)
 */
function saveCurrentPositionsSync() {
  if (!network || !nodesDataSet) return;

  const positions = network.getPositions();
  const posArray = [];

  for (const nodeId of Object.keys(positions)) {
    posArray.push({
      id: nodeId,
      x: positions[nodeId].x,
      y: positions[nodeId].y,
      fixed: false,
    });
  }

  if (posArray.length > 0) {
    // Fire and forget - best effort save on unload
    saveNodePositions(posArray);
  }
}

/**
 * Refresh the network with current data
 */
export function refreshNetwork(searchTerm = "") {
  const contacts = getAllContacts();
  const connections = getUniqueConnections();
  const savedPositions = getNodePositions();

  // Create a map of saved positions
  const positionMap = new Map();
  for (const pos of savedPositions) {
    positionMap.set(pos.id, { x: pos.x, y: pos.y, fixed: pos.fixed });
  }

  // Filter contacts if search term provided
  const filteredContacts = searchTerm
    ? contacts.filter((c) =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : contacts;

  const filteredContactIds = new Set(filteredContacts.map((c) => c.id));

  // Build nodes with saved positions if available
  const nodes = filteredContacts.map((contact) => {
    const savedPos = positionMap.get(contact.id);
    const hasImage = contact.image_blob || contact.image_url;

    const node = {
      id: contact.id,
      label: contact.name,
    };

    if (hasImage) {
      // Use circular image for contacts with photos
      node.shape = "circularImage";
      node.image = getContactImage(contact);
      node.brokenImage = "assets/placeholder.svg";
    } else {
      // Use rounded rectangle (box) for contacts without photos
      node.shape = "box";
      node.margin = 15;
      node.color = {
        background: "#ffffff",
        border: "#e2e8f0",
        highlight: {
          background: "#f7fafc",
          border: "#4a5568",
        },
      };
      node.font = {
        color: "#1a202c",
        size: 16,
        face: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      };
    }

    if (savedPos) {
      // Apply saved position - physics will continue from here
      node.x = savedPos.x;
      node.y = savedPos.y;
    }

    return node;
  });

  // Build edges (only for visible nodes)
  const edges = connections
    .filter(
      (conn) =>
        filteredContactIds.has(conn.contact1_id) &&
        filteredContactIds.has(conn.contact2_id)
    )
    .map((conn) => ({
      id: `${conn.contact1_id}-${conn.contact2_id}`,
      from: conn.contact1_id,
      to: conn.contact2_id,
      label: conn.label,
      data: {
        fromId: conn.contact1_id,
        toId: conn.contact2_id,
      },
    }));

  // Update datasets
  nodesDataSet.clear();
  edgesDataSet.clear();
  nodesDataSet.add(nodes);
  edgesDataSet.add(edges);

  // Physics is always enabled - let nodes settle naturally
  // Positions are saved periodically and on page unload
}

/**
 * Reset all node positions and restart physics
 */
export async function resetPositions() {
  await clearNodePositions();
  refreshNetwork();
}

/**
 * Focus on a specific node
 */
export function focusNode(nodeId) {
  if (network) {
    network.focus(nodeId, {
      scale: 0.8,
      animation: {
        duration: 500,
        easingFunction: "easeInOutQuad",
      },
    });
    network.selectNodes([nodeId]);
  }
}

/**
 * Get the network instance
 */
export function getNetwork() {
  return network;
}

/**
 * Check if network is empty
 */
export function isEmpty() {
  return nodesDataSet.length === 0;
}
