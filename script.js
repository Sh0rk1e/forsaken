import './firebase.js';

import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { GLTFLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";
import { byId, addListener, addListenerToElement } from "./modules/domSafe.js";
import { createInitialPlayerPayload, createPlayerTickPayload, normalizeRemotePlayerData } from "./modules/playerSchema.js";
import { loadRemoteAnimationSet } from "./modules/remotePlayerAssets.js";

const hud=byId('hud');
const settingsOverlay=byId('settingsOverlay');
const baseHudMessage='Right-click + drag to rotate camera | Mouse wheel to zoom | WASD to move | Hold Shift to sprint | H toggle hitboxes | ESC for menu | M for menu | O for settings | T for chat | F1 for help';
const hudState={gamepad:false};
let fpsCounter=0, fpsDisplay=0;
let isSprinting=false;
let chatVisible=true;

// ---------- UI State ----------
let gamePaused = false;

// Health & Stamina
let playerHealth = 100;
let playerStamina = 100;
const maxHealth = 100;
const maxStamina = 100;
let staminaRecoveryTimer = 0; // Timer for recovery delay when stamina reaches 0
let sprintBlockTimer = 0; // Timer that blocks sprinting after stamina depletion

// ---------- Settings ----------
// Detect mobile device
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;

const settings = {
  mouseSensitivity: 1,
  gamepadDeadzone: 0.1,
  gamepadSensitivity: 1,
  graphicsQuality: isMobile ? 'low' : 'medium'
};

function updateHud(){
  if(hud){
    const fpsText = `FPS: ${fpsDisplay} | `;
    const statusText = `Gamepad: ${hudState.gamepad?'✓':'✗'} | Sprint: ${isSprinting?'On':'Off'}`;
    hud.textContent = fpsText + baseHudMessage + ' | ' + statusText;
  }
}

function updateStatsUI(){
  const healthFill = document.getElementById('healthFill');
  const staminaFill = document.getElementById('staminaFill');
  const healthLabel = document.querySelector('#healthBar .stat-label');
  const staminaLabel = document.querySelector('#staminaBar .stat-label');

  if (healthFill && healthLabel) {
    const healthPercent = (playerHealth / maxHealth) * 100;
    healthFill.style.width = healthPercent + '%';
    healthLabel.textContent = `Health: ${Math.round(playerHealth)}/${maxHealth}`;

    // Add/remove low health class
    if (playerHealth < 30) {
      healthFill.classList.add('low');
    } else {
      healthFill.classList.remove('low');
    }
  }

  if (staminaFill && staminaLabel) {
    const staminaPercent = (playerStamina / maxStamina) * 100;
    staminaFill.style.width = staminaPercent + '%';
    staminaLabel.textContent = `Stamina: ${Math.round(playerStamina)}/${maxStamina}`;

    // Add/remove low stamina class
    if (playerStamina < 25) {
      staminaFill.classList.add('low');
    } else {
      staminaFill.classList.remove('low');
    }
  }
}

function updateSettingsUI(){
  const mouseSensitivity = byId('mouseSensitivity');
  const gamepadDeadzone = byId('gamepadDeadzone');
  const gamepadSensitivity = byId('gamepadSensitivity');
  const graphicsQuality = byId('graphicsQuality');
  if (mouseSensitivity) mouseSensitivity.value = settings.mouseSensitivity;
  if (gamepadDeadzone) gamepadDeadzone.value = settings.gamepadDeadzone;
  if (gamepadSensitivity) gamepadSensitivity.value = settings.gamepadSensitivity;
  if (graphicsQuality) graphicsQuality.value = settings.graphicsQuality;
}

addListener('mouseSensitivity', 'change', e=>{ settings.mouseSensitivity=parseFloat(e.target.value); cameraController.setSensitivity(settings.mouseSensitivity); });
addListener('gamepadDeadzone', 'change', e=>{ settings.gamepadDeadzone=parseFloat(e.target.value); });
addListener('gamepadSensitivity', 'change', e=>{ settings.gamepadSensitivity=parseFloat(e.target.value); });
addListener('graphicsQuality', 'change', e=>{ settings.graphicsQuality=e.target.value; });

addListener('settingsClose', 'click', ()=>settingsOverlay?.classList.remove('visible'));

// Chat toggle functionality
addListener('chatToggleBtn', 'click', toggleChat);

addListenerToElement(settingsOverlay, 'click', e=>{
  if(e.target===settingsOverlay) settingsOverlay.classList.remove('visible');
});

// ---------- Main Menu System ----------
addListener('mainMenuBtn', 'click', () => {
  byId('mainMenuOverlay')?.classList.add('visible');
  gamePaused = true;
  showNotification('Game Paused', 'info');
});

addListener('resumeGame', 'click', () => {
  byId('mainMenuOverlay')?.classList.remove('visible');
  gamePaused = false;
  showNotification('Game Resumed', 'success');
});

addListener('openSettings', 'click', () => {
  byId('mainMenuOverlay')?.classList.remove('visible');
  byId('settingsOverlay')?.classList.add('visible');
});

addListener('openMaps', 'click', () => {
  byId('mainMenuOverlay')?.classList.remove('visible');
  byId('mapsOverlay')?.classList.add('visible');
});

addListener('openHelp', 'click', () => {
  byId('mainMenuOverlay')?.classList.remove('visible');
  byId('helpOverlay')?.classList.add('visible');
});

addListener('openCredits', 'click', () => {
  byId('mainMenuOverlay')?.classList.remove('visible');
  byId('creditsOverlay')?.classList.add('visible');
});

addListener('quitGame', 'click', () => {
  if (confirm('Are you sure you want to quit to main menu? All unsaved progress will be lost.')) {
    // Reset game state
    playerHealth = maxHealth;
    playerStamina = maxStamina;
    playerState.pos.set(0, 0, 0);
    playerState.rot = 0;
    playerState.velocityY = 0;
    playerState.grounded = true;
    if (model) {
      model.position.copy(playerState.pos);
      model.rotation.y = playerState.rot;
    }
    byId('mainMenuOverlay')?.classList.remove('visible');
    gamePaused = false;
    showNotification('Game Reset', 'info');
  }
});

// Main menu overlay click to close
addListener('mainMenuOverlay', 'click', e => {
  const overlay = byId('mainMenuOverlay');
  if (overlay && e.target === overlay) {
    overlay.classList.remove('visible');
    gamePaused = false;
    showNotification('Game Resumed', 'success');
  }
});

// ---------- Help Menu ----------
addListener('helpClose', 'click', () => {
  byId('helpOverlay')?.classList.remove('visible');
  byId('mainMenuOverlay')?.classList.add('visible');
});

addListener('helpOverlay', 'click', e => {
  const overlay = byId('helpOverlay');
  if (overlay && e.target === overlay) {
    overlay.classList.remove('visible');
    byId('mainMenuOverlay')?.classList.add('visible');
  }
});

// ---------- Credits Menu ----------
addListener('creditsClose', 'click', () => {
  byId('creditsOverlay')?.classList.remove('visible');
  byId('mainMenuOverlay')?.classList.add('visible');
});

addListener('creditsOverlay', 'click', e => {
  const overlay = byId('creditsOverlay');
  if (overlay && e.target === overlay) {
    overlay.classList.remove('visible');
    byId('mainMenuOverlay')?.classList.add('visible');
  }
});

// ---------- Maps Menu ----------
const CUSTOM_MAP_STORAGE_KEY = "forsaken.customMaps.v1";
let lastCustomMapsRaw = "";

addListener('mapsClose', 'click', () => {
  byId('mapsOverlay')?.classList.remove('visible');
  byId('mainMenuOverlay')?.classList.add('visible');
});

addListener('mapsOverlay', 'click', e => {
  const overlay = byId('mapsOverlay');
  if (overlay && e.target === overlay) {
    overlay.classList.remove('visible');
    byId('mainMenuOverlay')?.classList.add('visible');
  }
});

addListener('openMapTool', 'click', () => {
  window.open('./map-tool.html', '_blank');
});

addListener('importMapFile', 'click', () => {
  byId('mapJsonFile')?.click();
});

addListener('importMapJson', 'click', () => {
  const jsonInput = byId('mapJsonInput');
  if (!jsonInput) return;
  importCustomMapJson(jsonInput.value);
});

addListener('mapJsonFile', 'change', async (event) => {
  const target = event.target;
  const file = target?.files?.[0];
  if (!file) return;
  const text = await file.text();
  importCustomMapJson(text);
  target.value = "";
});

addListener('openMaps', 'click', () => {
  syncCustomMapsFromStorage();
});

// ---------- Notification System ----------
function showNotification(message, type = 'info', duration = 3000) {
  const container = byId('notificationContainer');
  if (!container) return;
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;

  container.appendChild(notification);

  // Auto-remove after duration
  setTimeout(() => {
    notification.classList.add('fade-out');
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 500);
  }, duration);
}

// ---------- Keyboard Shortcuts ----------
window.addEventListener('keydown', (e) => {
  const mainMenuOverlay = byId('mainMenuOverlay');
  const mapsOverlay = byId('mapsOverlay');
  const helpOverlay = byId('helpOverlay');
  const settingsOverlayEl = byId('settingsOverlay');
  const chatField = byId('chatField');

  // ESC key for main menu
  if (e.key === 'Escape') {
    e.preventDefault();
    if (mapsOverlay?.classList.contains('visible')) {
      mapsOverlay.classList.remove('visible');
      mainMenuOverlay?.classList.add('visible');
      return;
    }
    if (mainMenuOverlay?.classList.contains('visible')) {
      mainMenuOverlay.classList.remove('visible');
      gamePaused = false;
      showNotification('Game Resumed', 'success');
    } else {
      mainMenuOverlay?.classList.add('visible');
      gamePaused = true;
      showNotification('Game Paused', 'info');
    }
  }

  // F1 for help
  if (e.key === 'F1') {
    e.preventDefault();
    helpOverlay?.classList.add('visible');
  }

  // H for hitbox overlay (works even when menu is open)
  if (e.key.toLowerCase() === 'h' && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    setHitboxDebugEnabled(!hitboxDebugEnabled);
  }

  // Prevent shortcuts when menus are open
  if (gamePaused) {
    return;
  }

  // M for main menu
  if (e.key.toLowerCase() === 'm' && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    mainMenuOverlay?.classList.add('visible');
    gamePaused = true;
    showNotification('Game Paused', 'info');
  }

  // O for settings
  if (e.key.toLowerCase() === 'o' && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    settingsOverlayEl?.classList.add('visible');
  }

  // T for chat toggle
  if (e.key.toLowerCase() === 't' && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    toggleChat();
  }

  // Enter for chat focus
  if (e.key === 'Enter' && !e.ctrlKey && !e.altKey) {
    if (chatField && document.activeElement !== chatField) {
      e.preventDefault();
      chatField.focus();
    }
  }
});

// Chat toggle function
function toggleChat() {
  const chatBox = byId('chatBox');
  const chatToggleBtn = byId('chatToggleBtn');
  if (!chatBox || !chatToggleBtn) return;

  chatVisible = !chatVisible;

  if (chatVisible) {
    chatBox.style.display = 'flex';
    chatToggleBtn.classList.add('active');
  } else {
    chatBox.style.display = 'none';
    chatToggleBtn.classList.remove('active');
  }
}

updateSettingsUI();
updateHud();

// ---------- Hide joystick on PC ----------
if (!('ontouchstart' in window)) {
  const leftJoy = byId('leftJoy');
  const touchHint = byId('touch-hint');
  const sprintButton = byId('sprintBtn');
  if (leftJoy) leftJoy.style.display = 'none';
  if (touchHint) touchHint.style.display = 'none';
  if (sprintButton) sprintButton.style.display = 'none';
}

// ---------- Three.js ----------
// Performance optimization: Reduce pixel ratio and disable antialiasing on mobile
const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: !isMobile, // Disable antialiasing on mobile for better performance
  powerPreference: "high-performance"
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1d22);
const camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight,0.1,500);

scene.add(new THREE.HemisphereLight(0xffffff,0x444444,1));
const light = new THREE.DirectionalLight(0xffffff,1.4);
light.position.set(5,10,7);
scene.add(light);

const mapRoot = new THREE.Group();
scene.add(mapRoot);
const maps = new Map();
let activeMapId = null;
let activeColliders = [];
let activeWalkSurfaces = [];
let hitboxDebugEnabled = false;
const hitboxDebugHelpers = [];
let playerHitboxHelper = null;
const playerCollider = { radius: 0.45, height: 1.8 };
const movementCollision = {
  maxSlopeAngleDeg: 62,
  maxStepUp: 0.95,
  maxSnapDown: 2.0
};
const rampCollision = {
  topContactTolerance: 0.12,
  topEdgeInset: 0.18
};
const playerPhysics = {
  gravity: 20,
  terminalVelocity: 30
};
const _tmpV1 = new THREE.Vector3();
const _tmpV2 = new THREE.Vector3();
const _tmpV3 = new THREE.Vector3();
const _tmpMat = new THREE.Matrix4();
const _tmpMat3 = new THREE.Matrix3();
const _walkableRaycaster = new THREE.Raycaster();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const WORLD_DOWN = new THREE.Vector3(0, -1, 0);

function clearHitboxDebugHelpers() {
  while (hitboxDebugHelpers.length > 0) {
    const helper = hitboxDebugHelpers.pop();
    if (helper.parent) helper.parent.remove(helper);
    if (helper.geometry) helper.geometry.dispose();
    if (helper.material) helper.material.dispose();
  }
}

function ensurePlayerHitboxHelper() {
  if (playerHitboxHelper) return playerHitboxHelper;

  const r = playerCollider.radius;
  const bodyHeight = Math.max(0.05, playerCollider.height - 2 * r);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffa000,
    wireframe: true,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
    depthWrite: false
  });

  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, bodyHeight, 16, 1), mat.clone());
  body.position.y = r + bodyHeight * 0.5;
  const capBottom = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat.clone());
  capBottom.position.y = r;
  const capTop = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat.clone());
  capTop.position.y = playerCollider.height - r;
  group.add(body, capBottom, capTop);
  group.visible = false;
  group.renderOrder = 1000;
  group.position.set(0, 0, 0);
  scene.add(group);
  playerHitboxHelper = group;
  return playerHitboxHelper;
}

function rebuildHitboxDebugHelpers() {
  clearHitboxDebugHelpers();

  for (const collider of activeColliders) {
    const obj = collider?.object;
    if (!obj?.geometry) continue;

    const helper = new THREE.LineSegments(
      new THREE.EdgesGeometry(obj.geometry),
      new THREE.LineBasicMaterial({
        color: collider.type === "cylinder" ? 0x00d1ff : 0x00ff88,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
        depthWrite: false
      })
    );

    helper.renderOrder = 999;
    helper.visible = hitboxDebugEnabled;
    obj.add(helper);
    hitboxDebugHelpers.push(helper);
  }
}

function setHitboxDebugEnabled(enabled, silent = false) {
  hitboxDebugEnabled = !!enabled;
  const playerHelper = ensurePlayerHitboxHelper();
  playerHelper.visible = hitboxDebugEnabled;
  if (!hitboxDebugHelpers.length && hitboxDebugEnabled) {
    rebuildHitboxDebugHelpers();
  }
  for (const helper of hitboxDebugHelpers) {
    helper.visible = hitboxDebugEnabled;
  }
  if (!silent) {
    showNotification(`Hitboxes ${hitboxDebugEnabled ? "enabled" : "disabled"}`, "info");
  }
}

function buildRuinsMap() {
  const group = new THREE.Group();
  const collisionObjects = [];

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100),
    new THREE.MeshStandardMaterial({ color: 0x202226 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.userData.isGround = true;
  group.add(ground);
  collisionObjects.push(ground);

  const rockGeometry = new THREE.BoxGeometry(8, 3, 8);
  const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x3a3d42 });

  const rock1 = new THREE.Mesh(rockGeometry, rockMaterial);
  rock1.position.set(15, 1.5, 20);
  const rock2 = new THREE.Mesh(rockGeometry, rockMaterial);
  rock2.position.set(-20, 1.5, 15);
  const rock3 = new THREE.Mesh(rockGeometry, rockMaterial);
  rock3.position.set(0, 1.5, -25);

  const pillarGeometry = new THREE.CylinderGeometry(2, 2, 5, 8);
  const pillarMaterial = new THREE.MeshStandardMaterial({ color: 0x4a5563 });
  const pillar1 = new THREE.Mesh(pillarGeometry, pillarMaterial);
  pillar1.position.set(-15, 2.5, -15);
  pillar1.userData.colliderType = "cylinder";
  const pillar2 = new THREE.Mesh(pillarGeometry, pillarMaterial);
  pillar2.position.set(25, 2.5, 0);
  pillar2.userData.colliderType = "cylinder";

  const platformGeometry = new THREE.BoxGeometry(12, 0.5, 12);
  const platformMaterial = new THREE.MeshStandardMaterial({ color: 0x5a6370 });
  const platform = new THREE.Mesh(platformGeometry, platformMaterial);
  platform.position.set(-35, 2, 30);

  const wallGeometry = new THREE.BoxGeometry(20, 4, 1);
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x454a52 });
  const wall1 = new THREE.Mesh(wallGeometry, wallMaterial);
  wall1.position.set(30, 2, -30);
  const wall2 = new THREE.Mesh(wallGeometry, wallMaterial);
  wall2.position.set(-30, 2, 30);
  wall2.rotation.y = Math.PI / 2;

  const props = [rock1, rock2, rock3, pillar1, pillar2, platform, wall1, wall2];
  props.forEach((mesh) => {
    group.add(mesh);
    collisionObjects.push(mesh);
  });

  return { name: "Ruins Arena", group, collisionObjects, background: 0x1a1d22 };
}

function buildMesaMap() {
  const group = new THREE.Group();
  const collisionObjects = [];

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(140, 140),
    new THREE.MeshStandardMaterial({ color: 0x3b2b24 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.userData.isGround = true;
  group.add(ground);
  collisionObjects.push(ground);

  const mesaMaterial = new THREE.MeshStandardMaterial({ color: 0x8b5a3c });
  const cliffMaterial = new THREE.MeshStandardMaterial({ color: 0x6d4731 });

  const mesa1 = new THREE.Mesh(new THREE.BoxGeometry(16, 5, 16), mesaMaterial);
  mesa1.position.set(26, 2.5, 20);
  const mesa2 = new THREE.Mesh(new THREE.BoxGeometry(12, 7, 12), mesaMaterial);
  mesa2.position.set(-24, 3.5, -18);
  const mesa3 = new THREE.Mesh(new THREE.BoxGeometry(20, 4, 10), mesaMaterial);
  mesa3.position.set(0, 2, 34);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(26, 1, 4), cliffMaterial);
  bridge.position.set(-2, 5.6, 2);
  const cliff1 = new THREE.Mesh(new THREE.BoxGeometry(30, 6, 3), cliffMaterial);
  cliff1.position.set(34, 3, -20);
  const cliff2 = new THREE.Mesh(new THREE.BoxGeometry(3, 6, 30), cliffMaterial);
  cliff2.position.set(-34, 3, 24);

  const props = [mesa1, mesa2, mesa3, bridge, cliff1, cliff2];
  props.forEach((mesh) => {
    group.add(mesh);
    collisionObjects.push(mesh);
  });

  return { name: "Mesa Outpost", group, collisionObjects, background: 0x2a1f1a };
}

function registerMap(id, builder) {
  if (maps.has(id)) {
    const oldMap = maps.get(id);
    if (oldMap?.group) mapRoot.remove(oldMap.group);
  }
  const map = builder();
  map.group.visible = false;
  mapRoot.add(map.group);
  maps.set(id, map);
}

registerMap("ruins", buildRuinsMap);
registerMap("mesa", buildMesaMap);

function setActiveMap(id, silent = false) {
  const map = maps.get(id);
  if (!map) return;

  if (activeMapId && maps.has(activeMapId) && activeMapId !== id) {
    maps.get(activeMapId).group.visible = false;
  }

  map.group.visible = true;
  activeMapId = id;
  scene.background = new THREE.Color(map.background);
  cameraController?.setCollisionObjects(map.collisionObjects);
  activeWalkSurfaces = (map.collisionObjects || []).filter(Boolean);
  activeColliders = (map.collisionObjects || [])
    .filter((obj) => !obj?.userData?.isGround)
    .map((obj) => {
      obj.updateMatrixWorld(true);
      const inverseMatrixWorld = _tmpMat.copy(obj.matrixWorld).invert().clone();
      if (obj?.userData?.colliderType === "cylinder") {
        const params = obj.geometry?.parameters || {};
        const baseRadius = Math.max(Number(params.radiusTop) || 0, Number(params.radiusBottom) || 0, 0.2);
        const baseHeight = Math.max(Number(params.height) || 0, 0.2);
        return {
          type: "cylinder",
          object: obj,
          inverseMatrixWorld,
          radius: baseRadius * Math.max(Math.abs(obj.scale.x), Math.abs(obj.scale.z)),
          halfHeight: (baseHeight * Math.abs(obj.scale.y)) * 0.5
        };
      }
      const params = obj.geometry?.parameters || {};
      const halfSize = new THREE.Vector3(
        Math.max((Number(params.width) || 1) * Math.abs(obj.scale.x) * 0.5, 0.1),
        Math.max((Number(params.height) || 1) * Math.abs(obj.scale.y) * 0.5, 0.1),
        Math.max((Number(params.depth) || 1) * Math.abs(obj.scale.z) * 0.5, 0.1)
      );
      return {
        type: "box",
        object: obj,
        inverseMatrixWorld,
        halfSize,
        isRamp: !!obj?.userData?.isRamp
      };
    });
  rebuildHitboxDebugHelpers();

  if (!silent) {
    showNotification(`Map switched to ${map.name}`, "success");
  }
}

function getPlayerSampleCenters(position) {
  const r = playerCollider.radius;
  const h = playerCollider.height;
  return [
    new THREE.Vector3(position.x, position.y + r, position.z),
    new THREE.Vector3(position.x, position.y + h * 0.5, position.z),
    new THREE.Vector3(position.x, position.y + h - r, position.z)
  ];
}

function sphereIntersectsBoxCollider(collider, center, radius) {
  _tmpV1.copy(center).applyMatrix4(collider.inverseMatrixWorld);
  const hs = collider.halfSize;
  const clampedX = Math.max(-hs.x, Math.min(_tmpV1.x, hs.x));
  const clampedY = Math.max(-hs.y, Math.min(_tmpV1.y, hs.y));
  const clampedZ = Math.max(-hs.z, Math.min(_tmpV1.z, hs.z));
  const dx = _tmpV1.x - clampedX;
  const dy = _tmpV1.y - clampedY;
  const dz = _tmpV1.z - clampedZ;
  return (dx * dx + dy * dy + dz * dz) < (radius * radius);
}

function isWalkableRampTopContact(collider, center, radius) {
  if (!collider?.isRamp || collider.type !== "box") return false;
  _tmpV1.copy(center).applyMatrix4(collider.inverseMatrixWorld);
  const hs = collider.halfSize;
  const edgeInset = Math.min(
    rampCollision.topEdgeInset + radius * 0.15,
    Math.max(0.05, Math.min(hs.x, hs.z) * 0.45)
  );
  if (Math.abs(_tmpV1.x) > (hs.x - edgeInset)) return false;
  if (Math.abs(_tmpV1.z) > (hs.z - edgeInset)) return false;
  return _tmpV1.y >= (hs.y - rampCollision.topContactTolerance);
}

function sphereIntersectsCylinderCollider(collider, center, radius) {
  _tmpV1.copy(center).applyMatrix4(collider.inverseMatrixWorld);
  const halfH = collider.halfHeight;

  const radial = Math.sqrt(_tmpV1.x * _tmpV1.x + _tmpV1.z * _tmpV1.z);
  const radialExcess = Math.max(0, radial - collider.radius);
  const verticalExcess = Math.max(0, Math.abs(_tmpV1.y) - halfH);
  return (radialExcess * radialExcess + verticalExcess * verticalExcess) < (radius * radius);
}

function collidesAtPosition(position) {
  const samples = getPlayerSampleCenters(position);
  const radius = playerCollider.radius;

  for (const collider of activeColliders) {
    if (!collider) continue;
    for (const center of samples) {
      if (collider.type === "cylinder") {
        if (sphereIntersectsCylinderCollider(collider, center, radius)) return true;
      } else {
        if (sphereIntersectsBoxCollider(collider, center, radius)) {
          if (isWalkableRampTopContact(collider, center, radius)) continue;
          return true;
        }
      }
    }
  }
  return false;
}

function resolvePlayerCollision(currentPos, desiredPos) {
  if (!collidesAtPosition(desiredPos)) return desiredPos;

  const slideX = new THREE.Vector3(desiredPos.x, currentPos.y, currentPos.z);
  const slideZ = new THREE.Vector3(currentPos.x, currentPos.y, desiredPos.z);
  const canX = !collidesAtPosition(slideX);
  const canZ = !collidesAtPosition(slideZ);

  if (canX && canZ) {
    const combined = new THREE.Vector3(slideX.x, currentPos.y, slideZ.z);
    if (!collidesAtPosition(combined)) return combined;
  }
  if (canX) return slideX;
  if (canZ) return slideZ;
  return currentPos.clone();
}

function depenetratePlayerPosition(position) {
  const pos = position.clone();
  const radius = playerCollider.radius;

  for (let iter = 0; iter < 4; iter++) {
    let hadPenetration = false;
    const samples = getPlayerSampleCenters(pos);

    for (const center of samples) {
      for (const collider of activeColliders) {
        if (!collider) continue;

        if (collider.type === "box") {
          _tmpV1.copy(center).applyMatrix4(collider.inverseMatrixWorld);
          const hs = collider.halfSize;
          if (isWalkableRampTopContact(collider, center, radius)) continue;
          const clampedX = Math.max(-hs.x, Math.min(_tmpV1.x, hs.x));
          const clampedY = Math.max(-hs.y, Math.min(_tmpV1.y, hs.y));
          const clampedZ = Math.max(-hs.z, Math.min(_tmpV1.z, hs.z));
          _tmpV2.set(_tmpV1.x - clampedX, _tmpV1.y - clampedY, _tmpV1.z - clampedZ);
          let distSq = _tmpV2.lengthSq();
          if (distSq >= radius * radius) continue;
          hadPenetration = true;

          if (distSq < 1e-8) {
            const overlapX = hs.x - Math.abs(_tmpV1.x);
            const overlapY = hs.y - Math.abs(_tmpV1.y);
            const overlapZ = hs.z - Math.abs(_tmpV1.z);
            if (overlapX <= overlapY && overlapX <= overlapZ) _tmpV2.set(Math.sign(_tmpV1.x) || 1, 0, 0);
            else if (overlapZ <= overlapY && overlapZ <= overlapX) _tmpV2.set(0, 0, Math.sign(_tmpV1.z) || 1);
            else _tmpV2.set(0, Math.sign(_tmpV1.y) || 1, 0);
            distSq = 1;
          }

          const dist = Math.sqrt(distSq);
          const penetration = radius - dist + 0.001;
          _tmpV2.divideScalar(dist);
          _tmpV3.copy(_tmpV2).transformDirection(collider.object.matrixWorld);
          _tmpV3.y = 0; // Horizontal push only for player controller
          if (_tmpV3.lengthSq() < 1e-8) continue;
          _tmpV3.normalize().multiplyScalar(penetration);
          pos.add(_tmpV3);
          continue;
        }

        // Cylinder collider in local space (axis is local Y).
        _tmpV1.copy(center).applyMatrix4(collider.inverseMatrixWorld);
        const radial = Math.sqrt(_tmpV1.x * _tmpV1.x + _tmpV1.z * _tmpV1.z);
        const radialExcess = Math.max(0, radial - collider.radius);
        const verticalExcess = Math.max(0, Math.abs(_tmpV1.y) - collider.halfHeight);
        const distSq = radialExcess * radialExcess + verticalExcess * verticalExcess;
        if (distSq >= radius * radius) continue;
        hadPenetration = true;

        const dirX = radial > 1e-8 ? (_tmpV1.x / radial) : 1;
        const dirZ = radial > 1e-8 ? (_tmpV1.z / radial) : 0;
        const dist = Math.sqrt(Math.max(distSq, 1e-8));
        const penetration = radius - dist + 0.001;
        _tmpV3.set(dirX, 0, dirZ).transformDirection(collider.object.matrixWorld);
        _tmpV3.y = 0;
        if (_tmpV3.lengthSq() < 1e-8) continue;
        _tmpV3.normalize().multiplyScalar(penetration);
        pos.add(_tmpV3);
      }
    }

    if (!hadPenetration) break;
  }

  return pos;
}

function getWalkableSurfaceHit(x, z, referenceY) {
  if (!activeWalkSurfaces.length) return null;

  const maxSlopeCos = Math.cos(THREE.MathUtils.degToRad(movementCollision.maxSlopeAngleDeg));
  const rayStartY = referenceY + playerCollider.height + movementCollision.maxStepUp + 0.5;
  const rayMaxDistance =
    playerCollider.height +
    movementCollision.maxStepUp +
    movementCollision.maxSnapDown +
    1.0;

  _walkableRaycaster.set(_tmpV1.set(x, rayStartY, z), WORLD_DOWN);
  _walkableRaycaster.far = rayMaxDistance;
  const hits = _walkableRaycaster.intersectObjects(activeWalkSurfaces, true);
  if (!hits.length) return null;

  for (const hit of hits) {
    if (!hit.face) continue;

    _tmpV2.copy(hit.face.normal);
    _tmpMat3.getNormalMatrix(hit.object.matrixWorld);
    _tmpV2.applyMatrix3(_tmpMat3).normalize();
    if (_tmpV2.dot(WORLD_UP) < maxSlopeCos) continue;

    const targetY = hit.point.y;
    const deltaY = targetY - referenceY;
    if (deltaY > movementCollision.maxStepUp) continue;
    if (deltaY < -movementCollision.maxSnapDown) continue;
    return {
      y: targetY,
      normalY: _tmpV2.dot(WORLD_UP)
    };
  }

  return null;
}

function snapPlayerToWalkableSurface(position, referenceY) {
  const surfaceHit = getWalkableSurfaceHit(position.x, position.z, referenceY);
  if (!surfaceHit) return position;

  // For slopes, vertical placement must account for the contact normal,
  // otherwise the spherical feet remain slightly inside the ramp.
  const normalY = Math.max(0.1, Math.min(1, surfaceHit.normalY));
  const slopeLift = playerCollider.radius * (1 / normalY - 1);
  const skin = 0.02;
  const snapped = position.clone();
  snapped.y = surfaceHit.y + slopeLift + skin;
  if (collidesAtPosition(snapped)) {
    const lifted = snapped.clone();
    lifted.y += 0.08;
    if (!collidesAtPosition(lifted)) return lifted;
    return position;
  }
  return snapped;
}

function applyVerticalPhysics(position, dt) {
  const current = position.clone();
  const surfaceHit = getWalkableSurfaceHit(current.x, current.z, current.y);

  if (surfaceHit) {
    const normalY = Math.max(0.1, Math.min(1, surfaceHit.normalY));
    const slopeLift = playerCollider.radius * (1 / normalY - 1);
    const skin = 0.02;
    const groundY = surfaceHit.y + slopeLift + skin;

    if (playerState.velocityY <= 0 && current.y <= groundY + 0.05) {
      current.y = groundY;
      playerState.velocityY = 0;
      playerState.grounded = true;
      return current;
    }
  }

  playerState.grounded = false;
  playerState.velocityY = Math.max(
    -playerPhysics.terminalVelocity,
    playerState.velocityY - playerPhysics.gravity * dt
  );
  current.y += playerState.velocityY * dt;

  if (surfaceHit) {
    const normalY = Math.max(0.1, Math.min(1, surfaceHit.normalY));
    const slopeLift = playerCollider.radius * (1 / normalY - 1);
    const skin = 0.02;
    const groundY = surfaceHit.y + slopeLift + skin;
    if (current.y <= groundY) {
      current.y = groundY;
      playerState.velocityY = 0;
      playerState.grounded = true;
    }
  }

  return current;
}

function movePlayerWithCollision(currentPos, moveDelta) {
  const totalDist = Math.sqrt(moveDelta.x * moveDelta.x + moveDelta.z * moveDelta.z);
  if (totalDist <= 1e-6) {
    const depenetrated = depenetratePlayerPosition(currentPos);
    return snapPlayerToWalkableSurface(depenetrated, currentPos.y);
  }

  const stepSize = 0.2;
  const steps = Math.max(1, Math.ceil(totalDist / stepSize));
  const stepDelta = moveDelta.clone().multiplyScalar(1 / steps);

  let pos = depenetratePlayerPosition(currentPos);
  pos = snapPlayerToWalkableSurface(pos, currentPos.y);
  for (let i = 0; i < steps; i++) {
    const desired = pos.clone().add(stepDelta);
    let next = resolvePlayerCollision(pos, desired);

    // If horizontal motion is fully blocked, try stepping up a small amount.
    if (next.distanceToSquared(pos) < 1e-10) {
      const stepped = desired.clone();
      stepped.y += movementCollision.maxStepUp;
      if (!collidesAtPosition(stepped)) {
        next = stepped;
      }
    }

    next = depenetratePlayerPosition(next);
    next = snapPlayerToWalkableSurface(next, pos.y);
    pos = next;
  }
  return snapPlayerToWalkableSurface(pos, currentPos.y);
}

function sanitizeMapId(idOrName) {
  return String(idOrName || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function colorToHexInt(value, fallback = 0x1a1d22) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  try {
    return new THREE.Color(value).getHex();
  } catch {
    return fallback;
  }
}

function normalizeMapDefinition(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Map JSON must be an object.");
  }

  const id = sanitizeMapId(raw.id || raw.name || `custom_${Date.now()}`);
  const name = String(raw.name || "Custom Map");
  const description = String(raw.description || "Imported custom map.");
  const background = colorToHexInt(raw.background, 0x1a1d22);

  const groundSize = Array.isArray(raw?.ground?.size) ? raw.ground.size : [120, 120];
  const groundX = Math.max(30, Number(groundSize[0]) || 120);
  const groundZ = Math.max(30, Number(groundSize[1]) || 120);
  const groundColor = colorToHexInt(raw?.ground?.color, 0x2a2d32);

  const props = Array.isArray(raw.props) ? raw.props : [];
  const normalizedProps = props.map((prop) => {
    const type = prop?.type === "cylinder" ? "cylinder" : "box";
    const position = Array.isArray(prop?.position) ? prop.position : [0, 1, 0];
    const rotation = Array.isArray(prop?.rotation) ? prop.rotation : [0, 0, 0];
    const color = colorToHexInt(prop?.color, 0x8b8f98);
    const size = Array.isArray(prop?.size) ? prop.size : type === "box" ? [8, 3, 8] : [2, 2, 5, 10];
    return {
      type,
      position: [Number(position[0]) || 0, Number(position[1]) || 0, Number(position[2]) || 0],
      rotation: [Number(rotation[0]) || 0, Number(rotation[1]) || 0, Number(rotation[2]) || 0],
      color,
      size: size.map((v) => Number(v) || 0)
    };
  });

  return {
    id,
    name,
    description,
    background,
    ground: {
      size: [groundX, groundZ],
      color: groundColor
    },
    props: normalizedProps
  };
}

function buildMapFromDefinition(definition) {
  const def = normalizeMapDefinition(definition);
  const group = new THREE.Group();
  const collisionObjects = [];

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(def.ground.size[0], def.ground.size[1]),
    new THREE.MeshStandardMaterial({ color: def.ground.color })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.userData.isGround = true;
  group.add(ground);
  collisionObjects.push(ground);

  def.props.forEach((prop) => {
    let mesh = null;
    if (prop.type === "cylinder") {
      const rt = Math.max(0.2, prop.size[0] || 2);
      const rb = Math.max(0.2, prop.size[1] || 2);
      const h = Math.max(0.2, prop.size[2] || 5);
      const seg = Math.max(3, Math.floor(prop.size[3] || 10));
      mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(rt, rb, h, seg),
        new THREE.MeshStandardMaterial({ color: prop.color })
      );
      mesh.userData.colliderType = "cylinder";
    } else {
      const sx = Math.max(0.2, prop.size[0] || 8);
      const sy = Math.max(0.2, prop.size[1] || 3);
      const sz = Math.max(0.2, prop.size[2] || 8);
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(sx, sy, sz),
        new THREE.MeshStandardMaterial({ color: prop.color })
      );
    }

    mesh.position.set(prop.position[0], prop.position[1], prop.position[2]);
    mesh.rotation.set(
      prop.rotation[0] * Math.PI / 180,
      prop.rotation[1] * Math.PI / 180,
      prop.rotation[2] * Math.PI / 180
    );
    const isTiltedRamp = Math.abs(mesh.rotation.x) > 0.001 || Math.abs(mesh.rotation.z) > 0.001;
    if (isTiltedRamp) mesh.userData.isRamp = true;
    group.add(mesh);
    collisionObjects.push(mesh);
  });

  return {
    id: def.id,
    name: def.name,
    description: def.description,
    group,
    collisionObjects,
    background: def.background
  };
}

function bindMapCard(card) {
  if (!card || card.dataset.bound === "1") return;
  card.dataset.bound = "1";
  card.addEventListener('click', () => {
    const mapId = card.getAttribute('data-map');
    if (!mapId) return;
    setActiveMap(mapId);
    byId('mapsOverlay')?.classList.remove('visible');
    byId('mainMenuOverlay')?.classList.remove('visible');
    gamePaused = false;
  });
}

function ensureMapCard(mapId, title, description) {
  const mapGrid = byId("mapGrid");
  if (!mapGrid) return;

  const existing = mapGrid.querySelector(`.map-card[data-map="${mapId}"]`);
  if (existing) {
    const titleEl = existing.querySelector(".map-title");
    const descEl = existing.querySelector(".map-desc");
    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.textContent = description;
    bindMapCard(existing);
    return;
  }

  const card = document.createElement("button");
  card.className = "map-card";
  card.type = "button";
  card.setAttribute("data-map", mapId);
  card.innerHTML = `<span class="map-title"></span><span class="map-desc"></span>`;
  const titleEl = card.querySelector(".map-title");
  const descEl = card.querySelector(".map-desc");
  if (titleEl) titleEl.textContent = title;
  if (descEl) descEl.textContent = description;
  mapGrid.appendChild(card);
  bindMapCard(card);
}

function persistCustomMap(definition) {
  const normalized = normalizeMapDefinition(definition);
  const saved = JSON.parse(localStorage.getItem(CUSTOM_MAP_STORAGE_KEY) || "[]");
  const idx = saved.findIndex((entry) => entry.id === normalized.id);
  const payload = { id: normalized.id, definition: normalized };
  if (idx >= 0) saved[idx] = payload;
  else saved.push(payload);
  localStorage.setItem(CUSTOM_MAP_STORAGE_KEY, JSON.stringify(saved));
}

function registerCustomMapFromDefinition(rawDefinition, shouldPersist = true) {
  const definition = normalizeMapDefinition(rawDefinition);
  registerMap(definition.id, () => buildMapFromDefinition(definition));
  ensureMapCard(definition.id, definition.name, definition.description);
  if (shouldPersist) persistCustomMap(definition);
  return definition.id;
}

function importCustomMapJson(jsonText) {
  try {
    const parsed = JSON.parse(jsonText);
    const mapId = registerCustomMapFromDefinition(parsed, true);
    showNotification(`Imported map: ${mapId}`, "success");
  } catch (error) {
    console.error(error);
    showNotification("Invalid map JSON", "error");
  }
}

function syncCustomMapsFromStorage() {
  const raw = localStorage.getItem(CUSTOM_MAP_STORAGE_KEY) || "[]";
  if (raw === lastCustomMapsRaw) return;
  lastCustomMapsRaw = raw;

  try {
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved)) return;
    saved.forEach((entry) => {
      if (!entry?.definition) return;
      registerCustomMapFromDefinition(entry.definition, false);
    });
  } catch (error) {
    console.error("Failed to load custom maps from storage:", error);
  }
}

document.querySelectorAll('.map-card').forEach(bindMapCard);
syncCustomMapsFromStorage();

// ---------- Particle Systems ----------
// Performance optimization: Reduce particle counts on mobile
const dustCount = isMobile ? 100 : 400;
const sparkleCount = isMobile ? 10 : 20;

// ---------- NEW DUST PARTICLE SYSTEM (From Scratch) ----------
// Dust particles - completely rewritten for more dynamic behavior
const dustGeometry = new THREE.BufferGeometry();
const dustPositions = new Float32Array(dustCount * 3);
const dustVelocities = [];
const dustProperties = []; // New property system for enhanced behavior
const dustLifetimes = [];

// Initialize dust particles with new behavior system
for (let i = 0; i < dustCount; i++) {
  // Scatter particles more naturally around the environment
  const angle = Math.random() * Math.PI * 2;
  const distance = Math.random() * 60 + 10; // 10-70 units from center
  dustPositions[i * 3] = Math.cos(angle) * distance;
  dustPositions[i * 3 + 1] = Math.random() * 6 + 0.5; // 0.5-6.5 height
  dustPositions[i * 3 + 2] = Math.sin(angle) * distance;

  // Initialize velocities with more variation
  dustVelocities.push(new THREE.Vector3(
    (Math.random() - 0.5) * 0.05, // -0.025 to 0.025
    Math.random() * 0.02 - 0.01,  // -0.01 to 0.01
    (Math.random() - 0.5) * 0.05   // -0.025 to 0.025
  ));

  // New property system for enhanced behavior
  dustProperties.push({
    baseY: dustPositions[i * 3 + 1], // Store original height
    buoyancy: Math.random() * 0.8 + 0.2, // 0.2-1.0 (floating tendency)
    turbulence: Math.random() * 0.5 + 0.1, // 0.1-0.6 (movement intensity)
    phaseX: Math.random() * Math.PI * 2, // Phase for horizontal oscillation
    phaseY: Math.random() * Math.PI * 2, // Phase for vertical oscillation
    windSensitivity: Math.random() * 0.7 + 0.3, // 0.3-1.0 (how much wind affects it)
    size: Math.random() * 0.06 + 0.04, // 0.04-0.1 particle size variation
    isTrail: false // Flag for sprint trail particles
  });

  dustLifetimes.push(Math.random() * 20 + 15); // 15-35 second lifetimes
}

dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));

// Enhanced material with size variation
const dustMaterial = new THREE.PointsMaterial({
  color: 0xf5f5f5,
  size: 0.08,
  transparent: true,
  opacity: 0.4,
  vertexColors: true,
  sizeAttenuation: true
});

// Add size attribute for variation
const dustSizes = new Float32Array(dustCount);
const dustColors = new Float32Array(dustCount * 3);
for (let i = 0; i < dustCount; i++) {
  dustSizes[i] = dustProperties[i].size;
  // Natural dust colors with slight variations
  const baseBrightness = 0.85 + Math.random() * 0.15; // 0.85-1.0
  const warmth = Math.random() * 0.1; // Slight warmth variation
  dustColors[i * 3] = baseBrightness + warmth * 0.2; // R
  dustColors[i * 3 + 1] = baseBrightness + warmth * 0.1; // G
  dustColors[i * 3 + 2] = baseBrightness; // B
}
dustGeometry.setAttribute('size', new THREE.BufferAttribute(dustSizes, 1));
dustGeometry.setAttribute('color', new THREE.BufferAttribute(dustColors, 3));

const dustParticles = new THREE.Points(dustGeometry, dustMaterial);
scene.add(dustParticles);

// Sparkle particles
const sparkleGeometry = new THREE.BufferGeometry();
const sparklePositions = new Float32Array(sparkleCount * 3);
const sparkleVelocities = [];
const sparkleLifetimes = [];
for (let i = 0; i < sparkleCount; i++) {
  sparklePositions[i * 3] = 0;
  sparklePositions[i * 3 + 1] = 0;
  sparklePositions[i * 3 + 2] = 0;
  sparkleVelocities.push(new THREE.Vector3((Math.random() - 0.5) * 1, Math.random() * 0.5 + 0.5, (Math.random() - 0.5) * 1));
  sparkleLifetimes.push(0);
}
sparkleGeometry.setAttribute('position', new THREE.BufferAttribute(sparklePositions, 3));
const sparkleMaterial = new THREE.PointsMaterial({ color: 0xffff00, size: 0.5, transparent: true, opacity: 0.9 });
const sparkleParticles = new THREE.Points(sparkleGeometry, sparkleMaterial);
scene.add(sparkleParticles);





// ---------- Firebase Multiplayer Setup ----------
const myPlayerId = 'player_' + Math.random().toString(36).substr(2, 9);
const otherPlayers = new Map();
const UPDATE_INTERVAL = isMobile ? 100 : 75; // Reduce frequency on mobile for better performance
let multiplayerReady = false;
let myPlayerRef = null;
let multiplayerInitStarted = false;
let multiplayerTickIntervalId = null;
const db = window.firebaseDB;

// ---------- Player ----------
let model, mixer, idleAction, walkAction, runAction, idleSpecialAction, emoteWaveAction, emoteLaughAction, emotePointAction;
const loader = new GLTFLoader();
const playerState = { pos:new THREE.Vector3(0,0,0), rot:0, moving:false, velocityY:0, grounded:true };
let currentAnim = 'idle';
let idleTimer = 0;
let nextIdleSpecialTime = Math.random() * 15 + 5;

// Optimized player loading: Load all models in parallel
function loadPlayer() {
  const animations = {
    idle: "./model/idle.glb",
    walk: "./model/walk.glb",
    run: "./model/run.glb",
    idleSpecial: "./model/idle_special1.glb",
    emoteWave: "./model/emote_wave.glb",
    emoteLaugh: "./model/emote_laugh.glb",
    emotePoint: "./model/emote_point.glb"
  };

  const loadedAnimations = {};
  let loadedCount = 0;
  const totalCount = Object.keys(animations).length;

  function onAnimationLoaded(name, glb) {
    loadedAnimations[name] = glb;
    loadedCount++;

    if (loadedCount === totalCount) {
      setupPlayerModel(loadedAnimations);
    }
  }

  function setupPlayerModel(animations) {
    // Setup idle model first
    if (animations.idle) {
      model = animations.idle.scene;
      model.scale.set(0.35, 0.35, 0.35);
      model.rotation.y = Math.PI;
      scene.add(model);
      mixer = new THREE.AnimationMixer(model);
      idleAction = mixer.clipAction(animations.idle.animations[0]);
      idleAction.play();
    }

    // Setup other animations
    if (animations.walk) {
      walkAction = mixer.clipAction(animations.walk.animations[0]);
      walkAction.timeScale = 2;
    }

    if (animations.run) {
      runAction = mixer.clipAction(animations.run.animations[0]);
      runAction.timeScale = 3;
    }

    if (animations.idleSpecial) {
      idleSpecialAction = mixer.clipAction(animations.idleSpecial.animations[0]);
      idleSpecialAction.loop = THREE.LoopOnce;
      idleSpecialAction.clampWhenFinished = true;
    }

    if (animations.emoteWave) {
      emoteWaveAction = mixer.clipAction(animations.emoteWave.animations[0]);
      emoteWaveAction.loop = THREE.LoopOnce;
      emoteWaveAction.clampWhenFinished = true;
    }

    if (animations.emoteLaugh) {
      emoteLaughAction = mixer.clipAction(animations.emoteLaugh.animations[0]);
      emoteLaughAction.loop = THREE.LoopOnce;
      emoteLaughAction.clampWhenFinished = true;
    }

    if (animations.emotePoint) {
      emotePointAction = mixer.clipAction(animations.emotePoint.animations[0]);
      emotePointAction.loop = THREE.LoopOnce;
      emotePointAction.clampWhenFinished = true;
    }

    const loadingEl = byId("loading");
    if (loadingEl) loadingEl.style.display = "none";
    initMultiplayer();
  }

  // Load all animations in parallel
  Object.entries(animations).forEach(([name, path]) => {
    loader.load(path, (glb) => onAnimationLoaded(name, glb), undefined, (err) => {
      console.log(`${name} animation missing, skipping.`);
      onAnimationLoaded(name, null);
    });
  });
}
loadPlayer();

// ---------- Firebase Multiplayer Functions ----------
function initMultiplayer() {
  if (multiplayerInitStarted) return;

  if (!window.firebaseDB || !window.firebaseRef) {
    console.error("Firebase not initialized yet");
    setTimeout(initMultiplayer, 500);
    return;
  }
  multiplayerInitStarted = true;

  const ref = window.firebaseRef;
  const set = window.firebaseSet;
  const onValue = window.firebaseOnValue;
  const onDisconnect = window.firebaseOnDisconnect;
  const update = window.firebaseUpdate;

  myPlayerRef = ref(db, `players/${myPlayerId}`);
  const playersRef = ref(db, 'players');

  onDisconnect(myPlayerRef).remove().catch(err => console.error("Disconnect handler error:", err));

  set(myPlayerRef, createInitialPlayerPayload(myPlayerId, playerState, currentAnim, playerHealth, playerStamina)).then(() => {
    console.log("Player registered:", myPlayerId);
    multiplayerReady = true;
  }).catch(err => console.error("Error registering player:", err));

  onValue(playersRef, (snapshot) => {
    const players = snapshot.val() || {};
    updatePlayerListUI(players);

    otherPlayers.forEach((playerData, playerId) => {
      if (!players[playerId]) {
        if (playerData.mesh) scene.remove(playerData.mesh);
        if (playerData.nameLabel) scene.remove(playerData.nameLabel);
        otherPlayers.delete(playerId);
      }
    });

    Object.keys(players).forEach(playerId => {
      if (playerId !== myPlayerId) {
        const playerData = players[playerId];
        updateOtherPlayer(playerId, playerData);
      }
    });
  }, err => console.error("Error listening to players:", err));

  if (multiplayerTickIntervalId) clearInterval(multiplayerTickIntervalId);
  multiplayerTickIntervalId = setInterval(() => {
    if (model && multiplayerReady && myPlayerRef) {
      update(myPlayerRef, createPlayerTickPayload(playerState, currentAnim, playerHealth, playerStamina))
        .catch(err => console.error("Update error:", err));
    }
  }, UPDATE_INTERVAL);
}

function updateOtherPlayer(playerId, data) {
  const remoteData = normalizeRemotePlayerData(data);
  if (!otherPlayers.has(playerId)) {
    const playerData = {
      mesh: null,
      model: null,
      mixer: null,
      idleAction: null,
      walkAction: null,
      runAction: null,
      idleSpecialAction: null,
      emoteWaveAction: null,
      emoteLaughAction: null,
      emotePointAction: null,
      currentAnim: 'idle',
      animation: remoteData.animation,
      nameLabel: null,
      targetPos: new THREE.Vector3(remoteData.x, remoteData.y, remoteData.z),
      targetRot: remoteData.rotation,
      moving: remoteData.moving,
      health: remoteData.health,
      stamina: remoteData.stamina
    };

    otherPlayers.set(playerId, playerData);
    createOtherPlayerModel(playerId, playerData).catch((err) => {
      console.error("Failed to build remote player model:", err);
    });
  } else {
    const playerData = otherPlayers.get(playerId);
    if (playerData) {
      playerData.targetPos.set(remoteData.x, remoteData.y, remoteData.z);
      playerData.targetRot = remoteData.rotation;
      playerData.moving = remoteData.moving;
      playerData.animation = remoteData.animation;
      playerData.health = remoteData.health;
      playerData.stamina = remoteData.stamina;
    }
  }
}

async function createOtherPlayerModel(playerId, playerData) {
  const animationSet = await loadRemoteAnimationSet();
  const idleGLB = animationSet.idle;

  if (idleGLB?.scene) {
    const playerModel = idleGLB.scene.clone(true);
    playerModel.scale.set(0.35, 0.35, 0.35);
    playerModel.rotation.y = playerData.targetRot;
    playerModel.position.set(playerData.targetPos.x, playerData.targetPos.y, playerData.targetPos.z);

    scene.add(playerModel);
    playerData.model = playerModel;
    playerData.mesh = playerModel;

    const playerMixer = new THREE.AnimationMixer(playerModel);
    playerData.mixer = playerMixer;

    const bindAction = (glb, key, options = {}) => {
      if (!glb?.animations?.[0]) {
        playerData[key] = null;
        return null;
      }
      const action = playerMixer.clipAction(glb.animations[0]);
      if (options.timeScale) action.timeScale = options.timeScale;
      if (options.loopOnce) {
        action.loop = THREE.LoopOnce;
        action.clampWhenFinished = true;
      }
      playerData[key] = action;
      return action;
    };

    const idleActionBound = bindAction(animationSet.idle, "idleAction");
    if (idleActionBound) idleActionBound.play();

    bindAction(animationSet.walk, "walkAction", { timeScale: 2 });
    bindAction(animationSet.run, "runAction", { timeScale: 3 });
    bindAction(animationSet.idleSpecial, "idleSpecialAction", { loopOnce: true });
    bindAction(animationSet.emoteWave, "emoteWaveAction", { loopOnce: true });
    bindAction(animationSet.emoteLaugh, "emoteLaughAction", { loopOnce: true });
    bindAction(animationSet.emotePoint, "emotePointAction", { loopOnce: true });

    // Keep remote players functional even if some clips failed to load.
    playerData.walkAction = playerData.walkAction || playerData.idleAction;
    playerData.runAction = playerData.runAction || playerData.walkAction || playerData.idleAction;
    createPlayerNameLabel(playerId, playerData);
    return;
  }

  const geometry = new THREE.CapsuleGeometry(0.4, 1, 4, 8);
  const material = new THREE.MeshStandardMaterial({ color: 0x77c0ff });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(playerData.targetPos.x, playerData.targetPos.y, playerData.targetPos.z);
  scene.add(mesh);
  playerData.mesh = mesh;
  playerData.model = mesh;
  createPlayerNameLabel(playerId, playerData);
}

function createPlayerNameLabel(playerId, playerData) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.width = 256;
  canvas.height = 64;
  context.fillStyle = 'rgba(0, 0, 0, 0.7)';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.font = 'bold 24px Arial';
  context.fillStyle = '#77c0ff';
  context.textAlign = 'center';
  context.fillText(playerId.substring(7, 12), 128, 40);

  const texture = new THREE.CanvasTexture(canvas);
  const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
  const nameLabel = new THREE.Sprite(spriteMaterial);
  nameLabel.scale.set(2, 0.5, 1);
  scene.add(nameLabel);
  playerData.nameLabel = nameLabel;
}

function updatePlayerListUI(players) {
  const listContent = byId('playerListContent');
  if (!listContent) return;
  const playerCount = Object.keys(players).length;

  let html = '';
  Object.keys(players).forEach(playerId => {
    const isMe = playerId === myPlayerId;
    html += `
      <div class="player-item ${isMe ? 'you' : ''}">
        <div class="player-indicator"></div>
        <span>${isMe ? 'You' : playerId.substring(7, 12)}</span>
      </div>
    `;
  });

  listContent.innerHTML = html || '<div style="color:#666;padding:8px;">No players</div>';
  const playerListHeader = document.querySelector('#playerList h3');
  if (playerListHeader) playerListHeader.textContent = `Players Online (${playerCount})`;
}

setTimeout(() => initMultiplayer(), 1500);

// ---------- Chat System ----------
const MAX_CHAT_MESSAGES = 50;
const chatMessages = [];

function addChatMessage(username, message) {
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const msgId = Date.now() + Math.random();
  chatMessages.push({ username, message, timestamp, id: msgId });
  if (chatMessages.length > MAX_CHAT_MESSAGES) chatMessages.shift();
  updateChatUI();

  // Fade out after 10 seconds
  setTimeout(() => {
    const msgElement = document.querySelector(`[data-msg-id="${msgId}"]`);
    if (msgElement) msgElement.classList.add('faded');
  }, 10000);
}

function getUsernameColor(username) {
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'];
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function updateChatUI() {
  const chatDiv = byId('chatMessages');
  if (!chatDiv) return;
  chatDiv.innerHTML = chatMessages.map(msg => {
    const color = getUsernameColor(msg.username);
    return `<div class="chat-msg" data-msg-id="${msg.id}"><strong style="color: ${color};">${msg.username}:</strong> ${msg.message}</div>`;
  }).join('');
  chatDiv.scrollTop = chatDiv.scrollHeight;
}

function sendChatMessage() {
  const input = byId('chatField');
  if (!input) return;
  const message = input.value.trim();
  if (!message || !multiplayerReady) return;

  const ref = window.firebaseRef;
  const push = window.firebasePush;
  if (!push) {
    console.error("Firebase push not available");
    return;
  }

  const chatRef = ref(db, 'chat');
  push(chatRef, {
    username: myPlayerId.substring(7, 12),
    message: message,
    timestamp: Date.now()
  }).catch(err => console.error("Chat error:", err));

  input.value = '';
}

function initChatListeners() {
  if (!db || !window.firebaseOnValue) return;
  const ref = window.firebaseRef;
  const onValue = window.firebaseOnValue;
  const chatRef = ref(db, 'chat');

  onValue(chatRef, (snapshot) => {
    const messages = snapshot.val() || {};
    Object.keys(messages).forEach(key => {
      const msg = messages[key];
      if (!chatMessages.find(m => m.timestamp === msg.timestamp && m.username === msg.username)) {
        addChatMessage(msg.username, msg.message);
      }
    });
  }, err => console.error("Chat listener error:", err));
}

addListener('chatSend', 'click', sendChatMessage);
addListener('chatField', 'keypress', (e) => {
  if (e.key === 'Enter') sendChatMessage();
});

setTimeout(() => initChatListeners(), 2000);

// ---------- Emotes System ----------
function playEmote(emoteName) {
  if (!multiplayerReady) return;

  // Emit sparkles
  const headPos = new THREE.Vector3(playerState.pos.x, playerState.pos.y + 1.5, playerState.pos.z);
  for (let i = 0; i < sparkleCount; i++) {
    if (sparkleLifetimes[i] <= 0) {
      sparklePositions[i * 3] = headPos.x + (Math.random() - 0.5) * 0.5;
      sparklePositions[i * 3 + 1] = headPos.y + (Math.random() - 0.5) * 0.5;
      sparklePositions[i * 3 + 2] = headPos.z + (Math.random() - 0.5) * 0.5;
      sparkleVelocities[i].set((Math.random() - 0.5) * 1, Math.random() * 0.5 + 0.5, (Math.random() - 0.5) * 1);
      sparkleLifetimes[i] = 1.5;
    }
  }

  // Play 3D animation if available
  if (emoteName === 'wave' && emoteWaveAction) {
    setAnim('emote_wave');
  } else if (emoteName === 'laugh' && emoteLaughAction) {
    setAnim('emote_laugh');
  } else if (emoteName === 'point' && emotePointAction) {
    setAnim('emote_point');
  }
}

document.querySelectorAll('.emote-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const emote = btn.dataset.emote;
    playEmote(emote);
  });
});

// ---------- Camera ----------
class CameraController {
  constructor() {
    this.yaw = 0;
    this.pitch = -0.35;
    this.distance = 8;
    this.height = 2;
    this.sensitivity = settings.mouseSensitivity * 0.002;
    this.minDistance = 1;
    this.maxDistance = 15;
    this.minPitch = -1.4;
    this.maxPitch = 0.4;
    this.targetPosition = new THREE.Vector3();
    this.currentPosition = new THREE.Vector3();
    this.smoothSpeed = 0.1;
    this.raycaster = new THREE.Raycaster();
    this.collisionObjects = [];
  }

  setSensitivity(value) {
    this.sensitivity = value * 0.002;
  }

  addCollisionObject(object) {
    this.collisionObjects.push(object);
  }

  setCollisionObjects(objects) {
    this.collisionObjects = Array.isArray(objects) ? [...objects] : [];
  }

  updateMouse(deltaX, deltaY) {
    this.yaw -= deltaX * this.sensitivity;
    this.pitch += deltaY * this.sensitivity;
    this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch));
  }

  zoom(delta) {
    this.distance += delta * 0.5;
    this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance));
  }

  update(playerPosition) {
    // Calculate desired camera position
    const offsetX = Math.sin(this.yaw) * this.distance;
    const offsetZ = Math.cos(this.yaw) * this.distance;
    const offsetY = this.height + Math.sin(this.pitch) * this.distance;

    const desiredPosition = new THREE.Vector3(
      playerPosition.x - offsetX,
      playerPosition.y + offsetY,
      playerPosition.z - offsetZ
    );

    // Prevent camera from going below ground level
    const minCameraY = playerPosition.y + 0.5; // Camera should be at least 0.5 units above player
    if (desiredPosition.y < minCameraY) {
      desiredPosition.y = minCameraY;
    }

    // Check for collisions with objects
    const direction = new THREE.Vector3().subVectors(desiredPosition, playerPosition).normalize();
    const distance = playerPosition.distanceTo(desiredPosition);

    this.raycaster.set(playerPosition, direction);

    let closestIntersection = null;
    let minDistance = distance;

    // Check intersections with all collision objects
    for (const object of this.collisionObjects) {
      const intersections = this.raycaster.intersectObject(object, true);
      for (const intersection of intersections) {
        if (intersection.distance < minDistance && intersection.distance > 0.5) { // Don't collide too close to player
          minDistance = intersection.distance;
          closestIntersection = intersection;
        }
      }
    }

    // If we found a collision, adjust camera position
    if (closestIntersection) {
      // Position camera just before the intersection point
      this.targetPosition.copy(direction).multiplyScalar(minDistance - 0.2).add(playerPosition);
    } else {
      this.targetPosition.copy(desiredPosition);
    }

    // Ensure camera doesn't go below minimum height
    if (this.targetPosition.y < minCameraY) {
      this.targetPosition.y = minCameraY;
    }

    // Smooth camera movement
    this.currentPosition.lerp(this.targetPosition, this.smoothSpeed);

    // Update camera
    camera.position.copy(this.currentPosition);
    camera.lookAt(playerPosition.x, playerPosition.y + 2, playerPosition.z);
  }
}

const cameraController = new CameraController();
let lastMouseX = 0, lastMouseY = 0;

setActiveMap("ruins", true);

// ---------- Input ----------
const keys = {KeyW:false, KeyA:false, KeyS:false, KeyD:false, ShiftLeft:false, ShiftRight:false};
window.addEventListener("keydown",e=>{ if(keys[e.code]!==undefined) keys[e.code]=true; });
window.addEventListener("keyup",e=>{ if(keys[e.code]!==undefined) keys[e.code]=false; });

// Mouse look
let dragging = false;
document.addEventListener("contextmenu", e => e.preventDefault());
document.addEventListener("mousedown", e => {
  if (e.button === 2) {
    dragging = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  }
});
document.addEventListener("mouseup", () => dragging = false);
document.addEventListener("mousemove", e => {
  if (!dragging) return;
  const deltaX = e.clientX - lastMouseX;
  const deltaY = e.clientY - lastMouseY;
  cameraController.updateMouse(deltaX, deltaY);
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
});

// Mouse wheel zoom
document.addEventListener("wheel", e => {
  e.preventDefault();
  cameraController.zoom(e.deltaY * 0.01);
}, { passive: false });

// ---------- Gamepad ----------
const gamepad={active:null};
function updateGamepadInput(){
  const pads=navigator.getGamepads();
  if(!pads[0]){gamepad.active=null; return;}
  gamepad.active=pads[0];
}
window.addEventListener("gamepadconnected", e=>console.log("Gamepad:",e.gamepad.id));
window.addEventListener("gamepaddisconnected", e=>{ if(gamepad.active?.index===e.gamepad.index) gamepad.active=null; });

// ---------- Left Joystick ----------
const leftJoyEl=byId("leftJoy");
const leftStickEl=byId("leftStick");
const leftJoy={active:false, id:null, x:0, y:0, max:40};

function updateLeftStick(x,y){
  if (!leftStickEl) return;
  leftStickEl.style.left=`${35+x}px`;
  leftStickEl.style.top=`${35+y}px`;
}
function resetLeftStick(){ updateLeftStick(0,0); }

function getTouchOffset(touch){
  if (!leftJoyEl) return {x: 0, y: 0};
  const rect=leftJoyEl.getBoundingClientRect();
  const cx=rect.left+rect.width/2;
  const cy=rect.top+rect.height/2;
  let dx=touch.clientX-cx;
  let dy=touch.clientY-cy;
  const dist=Math.sqrt(dx*dx+dy*dy);
  if(dist>leftJoy.max){ const s=leftJoy.max/dist; dx*=s; dy*=s; }
  return {x:dx, y:dy};
}

addListenerToElement(leftJoyEl, "touchstart", e=>{
  e.preventDefault();
  for(const t of e.changedTouches){
    if(!leftJoy.active && t.clientX<window.innerWidth/2){
      leftJoy.active=true;
      leftJoy.id=t.identifier;
      leftJoyEl.classList.add('active');
      if (leftStickEl) leftStickEl.classList.add('active');
      const o=getTouchOffset(t);
      leftJoy.x=o.x; leftJoy.y=o.y;
      updateLeftStick(leftJoy.x,leftJoy.y);
    }
  }
},{passive:false});

addListenerToElement(leftJoyEl, "touchmove", e=>{
  e.preventDefault();
  for(const t of e.changedTouches){
    if(leftJoy.active && t.identifier===leftJoy.id){
      const o=getTouchOffset(t);
      leftJoy.x=o.x; leftJoy.y=o.y;
      updateLeftStick(leftJoy.x,leftJoy.y);
    }
  }
},{passive:false});

function endLeftTouch(e){
  e.preventDefault();
  for(const t of e.changedTouches){
    if(t.identifier===leftJoy.id){
      leftJoy.active=false; leftJoy.id=null; leftJoy.x=0; leftJoy.y=0;
      leftJoyEl.classList.remove('active');
      if (leftStickEl) leftStickEl.classList.remove('active');
      resetLeftStick();
    }
  }
}
addListenerToElement(leftJoyEl, "touchend", endLeftTouch, {passive:false});
addListenerToElement(leftJoyEl, "touchcancel", endLeftTouch, {passive:false});

// ---------- Right side touch look ----------
let touchLook={active:false, id:null, lastX:0, lastY:0};

document.addEventListener("touchstart", e=>{
  for(const t of e.changedTouches){
    if(t.clientX>=window.innerWidth/2 && !touchLook.active){
      touchLook.active=true;
      touchLook.id=t.identifier;
      touchLook.lastX=t.clientX;
      touchLook.lastY=t.clientY;
    }
  }
},{passive:false});

document.addEventListener("touchmove", e=>{
  for(const t of e.changedTouches){
    if(t.identifier===touchLook.id){
      const dx=t.clientX-touchLook.lastX;
      const dy=t.clientY-touchLook.lastY;
      cameraController.updateMouse(dx, dy);
      touchLook.lastX=t.clientX;
      touchLook.lastY=t.clientY;
    }
  }
},{passive:false});

document.addEventListener("touchend", e=>{
  for(const t of e.changedTouches){
    if(t.identifier===touchLook.id) touchLook.active=false;
  }
},{passive:false});
document.addEventListener("touchcancel", e=>{
  for(const t of e.changedTouches){
    if(t.identifier===touchLook.id) touchLook.active=false;
  }
},{passive:false});

// ---------- Mobile Sprint Button ----------
const sprintBtn=byId("sprintBtn");
let sprintTouch={active:false, id:null};

addListenerToElement(sprintBtn, "touchstart", e=>{
  e.preventDefault();
  const t=e.changedTouches[0];
  sprintTouch.active=true;
  sprintTouch.id=t.identifier;
  if (sprintBtn) sprintBtn.classList.add("active");
},{passive:false});

function endSprintTouch(e){
  for(const t of e.changedTouches){
    if(t.identifier===sprintTouch.id){
      sprintTouch.active=false;
      sprintTouch.id=null;
      if (sprintBtn) sprintBtn.classList.remove("active");
    }
  }
}

addListenerToElement(sprintBtn, "touchend", endSprintTouch, {passive:false});
addListenerToElement(sprintBtn, "touchcancel", endSprintTouch, {passive:false});

// ---------- Animations ----------
const clock=new THREE.Clock();
const moveSpeed=5;
const sprintSpeed=8;

function normalizeAngle(a){ return Math.atan2(Math.sin(a),Math.cos(a)); }

function setAnim(target){
  if(!idleAction||!walkAction||currentAnim===target) return;
  const outgoing = currentAnim==='idle'?idleAction:currentAnim==='idleSpecial'?idleSpecialAction:currentAnim==='walk'?walkAction:currentAnim==='run'?runAction:currentAnim==='emote_wave'?emoteWaveAction:currentAnim==='emote_laugh'?emoteLaughAction:currentAnim==='emote_point'?emotePointAction:idleAction;

  if(target==="run" && runAction){
    outgoing.fadeOut(0.2);
    runAction.reset().fadeIn(0.2).play();
    currentAnim="run";
    idleTimer=0;
  }
  else if(target==="walk"){
    outgoing.fadeOut(0.2);
    walkAction.reset().fadeIn(0.2).play();
    currentAnim="walk";
    idleTimer=0;
  }
  else if(target==="idle"){
    outgoing.fadeOut(0.2);
    idleAction.reset().fadeIn(0.2).play();
    currentAnim="idle";
    idleTimer=0;
  }
  else if(target==="idleSpecial" && idleSpecialAction){
    outgoing.fadeOut(0.1);
    idleSpecialAction.reset().fadeIn(1).play();
    currentAnim="idleSpecial";
  }
  else if(target==="emote_wave" && emoteWaveAction){
    outgoing.fadeOut(0.1);
    emoteWaveAction.reset().fadeIn(1).play();
    currentAnim="emote_wave";
  }
  else if(target==="emote_laugh" && emoteLaughAction){
    outgoing.fadeOut(0.1);
    emoteLaughAction.reset().fadeIn(1).play();
    currentAnim="emote_laugh";
  }
  else if(target==="emote_point" && emotePointAction){
    outgoing.fadeOut(0.1);
    emotePointAction.reset().fadeIn(1).play();
    currentAnim="emote_point";
  }
}

function setOtherAnim(playerData, target){
  if(!playerData.idleAction||!playerData.walkAction||playerData.currentAnim===target) return;
  const outgoing = playerData.currentAnim==='idle'?playerData.idleAction:playerData.currentAnim==='idleSpecial'?playerData.idleSpecialAction:playerData.currentAnim==='walk'?playerData.walkAction:playerData.currentAnim==='run'?playerData.runAction:playerData.currentAnim==='emote_wave'?playerData.emoteWaveAction:playerData.currentAnim==='emote_laugh'?playerData.emoteLaughAction:playerData.currentAnim==='emote_point'?playerData.emotePointAction:playerData.idleAction;

  if(target==="run" && playerData.runAction){
    outgoing.fadeOut(0.2);
    playerData.runAction.reset().fadeIn(0.05).play();
    playerData.currentAnim="run";
  }
  else if(target==="walk"){
    outgoing.fadeOut(0.2);
    playerData.walkAction.reset().fadeIn(0.2).play();
    playerData.currentAnim="walk";
  }
  else if(target==="idle"){
    outgoing.fadeOut(0.2);
    playerData.idleAction.reset().fadeIn(0.2).play();
    playerData.currentAnim="idle";
  }
  else if(target==="idleSpecial" && playerData.idleSpecialAction){
    outgoing.fadeOut(0.1);
    playerData.idleSpecialAction.reset().fadeIn(1).play();
    playerData.currentAnim="idleSpecial";
  }
  else if(target==="emote_wave" && playerData.emoteWaveAction){
    outgoing.fadeOut(0.1);
    playerData.emoteWaveAction.reset().fadeIn(1).play();
    playerData.currentAnim="emote_wave";
  }
  else if(target==="emote_laugh" && playerData.emoteLaughAction){
    outgoing.fadeOut(0.1);
    playerData.emoteLaughAction.reset().fadeIn(1).play();
    playerData.currentAnim="emote_laugh";
  }
  else if(target==="emote_point" && playerData.emotePointAction){
    outgoing.fadeOut(0.1);
    playerData.emotePointAction.reset().fadeIn(1).play();
    playerData.currentAnim="emote_point";
  }
}

// ---------- Main Loop ----------
function animate(){
  requestAnimationFrame(animate);
  const dt=clock.getDelta();
  if (playerHitboxHelper) {
    playerHitboxHelper.position.copy(playerState.pos);
  }
  if(mixer) mixer.update(dt);

  if(currentAnim==='idleSpecial' && idleSpecialAction && !idleSpecialAction.isRunning()){
    setAnim("idle");
  }
  if(currentAnim==='emote_wave' && emoteWaveAction && !emoteWaveAction.isRunning()){
    setAnim("idle");
  }
  if(currentAnim==='emote_laugh' && emoteLaughAction && !emoteLaughAction.isRunning()){
    setAnim("idle");
  }
  if(currentAnim==='emote_point' && emotePointAction && !emotePointAction.isRunning()){
    setAnim("idle");
  }

  updateGamepadInput();

  fpsCounter++;
  if(fpsCounter%10===0) fpsDisplay=Math.round(1/dt);

  // Get time for dust system and lighting
  const time = clock.getElapsedTime();

  if(model){
    let forward=(keys.KeyW?1:0)+(keys.KeyS?-1:0);
    let sideways=(keys.KeyD?1:0)+(keys.KeyA?-1:0);

    // Combine PC sprint, mobile sprint, gamepad sprint (can't sprint if stamina is 0 or sprint is blocked)
    isSprinting =
      (
        keys.ShiftLeft ||
        keys.ShiftRight ||
        sprintTouch.active
      ) &&
      (Math.abs(forward)>0 || Math.abs(sideways)>0) &&
      playerStamina > 0 &&
      sprintBlockTimer <= 0;

    // ---------- FIXED JOYSTICK SPRINT LOGIC ----------
    if (leftJoy.active) {
      // raw joystick input
      let rawForward = -leftJoy.y / leftJoy.max;
      let rawSideways = leftJoy.x / leftJoy.max;

      // detect joystick movement BEFORE deadzone
      const joyMoving = Math.abs(rawForward) > 0.01 || Math.abs(rawSideways) > 0.01;

      // apply deadzone AFTER sprint detection
      forward = Math.abs(rawForward) < 0.05 ? 0 : rawForward;
      sideways = Math.abs(rawSideways) < 0.05 ? 0 : rawSideways;

      // sprint only if joystick actually moves
      if (joyMoving) {
        isSprinting =
          (keys.ShiftLeft || keys.ShiftRight || sprintTouch.active) &&
          joyMoving;
      }
    }

    // Gamepad
    if(gamepad.active){
      const [lx,ly,rx,ry] = [...gamepad.active.axes];
      const dz=settings.gamepadDeadzone;

      const lmag=Math.sqrt(lx*lx+ly*ly);
      if(lmag>dz){
        const n=(lmag-dz)/(1-dz);
        forward=-ly/lmag*n;
        sideways=lx/lmag*n;
      }

      const rmag=Math.sqrt(rx*rx+ry*ry);
      if(rmag>dz){
        const n=(rmag-dz)/(1-dz);
        cameraController.updateMouse(rx*n*0.06*settings.gamepadSensitivity, ry*n*0.06*settings.gamepadSensitivity);
      }
    }

    const moving=Math.abs(forward)>0 || Math.abs(sideways)>0;
    if(moving){
      const camF=new THREE.Vector3(Math.sin(cameraController.yaw),0,Math.cos(cameraController.yaw));
      const camR=new THREE.Vector3(-Math.cos(cameraController.yaw),0,Math.sin(cameraController.yaw));
      let moveDir=new THREE.Vector3().addScaledVector(camF,forward).addScaledVector(camR,sideways);
      const mag=moveDir.length(); if(mag>1) moveDir.normalize();

      const targetRot=Math.atan2(moveDir.x, moveDir.z)+Math.PI;
      let rotDiff=normalizeAngle(targetRot-playerState.rot);
      playerState.rot+=rotDiff*0.2;
      playerState.rot=normalizeAngle(playerState.rot);
      model.rotation.y=playerState.rot;

      // Update camera with new controller
      cameraController.update(playerState.pos);

      const speed=isSprinting?sprintSpeed:moveSpeed;
      const moveDelta = moveDir.multiplyScalar(speed * dt);
      playerState.pos.copy(movePlayerWithCollision(playerState.pos, moveDelta));
      model.position.copy(playerState.pos);

      setAnim(isSprinting ? "run" : "walk");
      playerState.moving=true;

      // Stamina depletion when sprinting
      if(isSprinting && playerStamina > 0){
        const prevStamina = playerStamina;
        playerStamina = Math.max(0, playerStamina - 10 * dt);
        // Start timers when stamina reaches 0
        if (prevStamina > 0 && playerStamina === 0) {
          staminaRecoveryTimer = 1.0; // 1 second delay before recovery starts
          sprintBlockTimer = 1.0; // 1 second sprint block
        }
      }
    }
    else {
      idleTimer+=dt;
      if(idleTimer>=nextIdleSpecialTime && idleSpecialAction && currentAnim==='idle'){
        setAnim("idleSpecial");
        idleTimer=0;
        nextIdleSpecialTime=Math.random()*15+5;
      }
      else if(currentAnim!=='idle' && currentAnim!=='idleSpecial' && !currentAnim.includes('emote')){
        setAnim("idle");
      }
      playerState.moving=false;
      isSprinting=false;

      // Update camera even when not moving
      cameraController.update(playerState.pos);
    }

    // Update timers (always)
    if (staminaRecoveryTimer > 0) {
      staminaRecoveryTimer -= dt;
    }
    if (sprintBlockTimer > 0) {
      sprintBlockTimer -= dt;
    }

    // Stamina recovery when recovery timer is done (while walking or standing, but not sprinting)
    if(playerStamina < maxStamina && staminaRecoveryTimer <= 0 && !isSprinting){
      playerStamina = Math.min(maxStamina, playerStamina + 7.5 * dt); // 2x slower recovery
    }

    playerState.pos.copy(applyVerticalPhysics(playerState.pos, dt));
    model.position.copy(playerState.pos);
  }



  // Update other players (smooth interpolation)
  otherPlayers.forEach((playerData) => {
    if (!playerData.mesh) return;

    // Update animations
    if (playerData.mixer) {
      playerData.mixer.update(dt);

      // Switch animations based on synced animation state
      if (playerData.animation !== playerData.currentAnim) {
        setOtherAnim(playerData, playerData.animation);
      }

      // Reset finished one-shot animations to idle
      if (playerData.currentAnim === 'idleSpecial' && playerData.idleSpecialAction && !playerData.idleSpecialAction.isRunning()) {
        setOtherAnim(playerData, 'idle');
      }
      if (playerData.currentAnim === 'emote_wave' && playerData.emoteWaveAction && !playerData.emoteWaveAction.isRunning()) {
        setOtherAnim(playerData, 'idle');
      }
      if (playerData.currentAnim === 'emote_laugh' && playerData.emoteLaughAction && !playerData.emoteLaughAction.isRunning()) {
        setOtherAnim(playerData, 'idle');
      }
      if (playerData.currentAnim === 'emote_point' && playerData.emotePointAction && !playerData.emotePointAction.isRunning()) {
        setOtherAnim(playerData, 'idle');
      }
    }

    // Smooth position interpolation
    playerData.mesh.position.lerp(playerData.targetPos, 0.2);

    // Smooth rotation interpolation
    let rotDiff = normalizeAngle(playerData.targetRot - playerData.mesh.rotation.y);
    playerData.mesh.rotation.y += rotDiff * 0.2;

    // Update name label position
    if (playerData.nameLabel) {
      playerData.nameLabel.position.copy(playerData.mesh.position);
      playerData.nameLabel.position.y += 2.5;
    }
  });









  // ---------- NEW DUST PARTICLE SYSTEM (From Scratch) ----------
  // Update dust particles with completely new behavior system

  for (let i = 0; i < dustCount; i++) {
    const props = dustProperties[i];
    dustLifetimes[i] -= dt;

    // Respawn logic with new distribution
    if (dustLifetimes[i] <= 0 || dustPositions[i * 3 + 1] < -2) {
      // Create spiral distribution around the map
      const spiralAngle = Math.random() * Math.PI * 4; // Multiple spirals
      const spiralRadius = 15 + Math.random() * 45; // 15-60 units from center
      const heightVariation = Math.random() * 8 + 1; // 1-9 units height

      dustPositions[i * 3] = Math.cos(spiralAngle) * spiralRadius;
      dustPositions[i * 3 + 1] = heightVariation;
      dustPositions[i * 3 + 2] = Math.sin(spiralAngle) * spiralRadius;

      // Reset velocities with new system
      dustVelocities[i].set(
        (Math.random() - 0.5) * 0.03, // Gentle base movement
        (Math.random() - 0.5) * 0.02,
        (Math.random() - 0.5) * 0.03
      );

      dustLifetimes[i] = 25 + Math.random() * 20; // 25-45 second lifetimes
      props.isTrail = false; // Reset trail flag
    } else {
      // ===== NEW DUST BEHAVIOR SYSTEM =====

      // 1. Buoyancy-based floating (replaces gravity)
      const buoyancyForce = (props.buoyancy - 0.5) * 0.01 * dt;
      dustVelocities[i].y += buoyancyForce;

      // 2. Turbulent atmospheric movement
      const turbulenceX = Math.sin(time * 0.7 + props.phaseX) * props.turbulence * 0.02;
      const turbulenceZ = Math.cos(time * 0.5 + props.phaseX) * props.turbulence * 0.02;
      dustVelocities[i].x += turbulenceX * dt;
      dustVelocities[i].z += turbulenceZ * dt;

      // 3. Vertical oscillation (gentle floating effect)
      const verticalOscillation = Math.sin(time * 0.3 + props.phaseY) * 0.008 * props.buoyancy;
      dustPositions[i * 3 + 1] += verticalOscillation * dt;

      // 4. Player interaction (repulsion/attraction based on distance)
      const dx = dustPositions[i * 3] - playerState.pos.x;
      const dy = dustPositions[i * 3 + 1] - playerState.pos.y;
      const dz = dustPositions[i * 3 + 2] - playerState.pos.z;
      const distanceToPlayer = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (distanceToPlayer < 15) { // Increased range from 12 to 15 units
        const influence = 1 - (distanceToPlayer / 15); // Linear falloff for consistent strength

        if (!props.isTrail) {
          // Much stronger repulsion effect for ambient dust
          const repulsionStrength = influence * 2.0 * props.windSensitivity; // Increased to 2.0 for explosive horizontal repulsion
          const repulsionX = (dx / distanceToPlayer) * repulsionStrength;
          const repulsionZ = (dz / distanceToPlayer) * repulsionStrength;

          // Apply immediate velocity change (not multiplied by dt for instant response)
          dustVelocities[i].x += repulsionX; // Full strength horizontal repulsion
          dustVelocities[i].z += repulsionZ;
          dustVelocities[i].y += influence * 0.8; // Moderate upward lift (reduced from 0.3)

          // Add explosive random scatter
          dustVelocities[i].x += (Math.random() - 0.5) * influence * 0.5;
          dustVelocities[i].z += (Math.random() - 0.5) * influence * 0.5;
          dustVelocities[i].y += (Math.random() - 0.5) * influence * 0.2;

          // Temporarily reduce air resistance for explosive movement
          dustVelocities[i].x *= 0.7;
          dustVelocities[i].y *= 0.7;
          dustVelocities[i].z *= 0.7;
        }
      }

      // 5. Wind gusts (periodic strong winds)
      const windGust = Math.sin(time * 0.2) * Math.cos(time * 0.15);
      if (Math.abs(windGust) > 0.7) {
        const windDirection = Math.sin(time * 0.1) * Math.PI;
        const windStrength = (windGust - 0.7) * props.windSensitivity * 0.1;
        dustVelocities[i].x += Math.cos(windDirection) * windStrength * dt;
        dustVelocities[i].z += Math.sin(windDirection) * windStrength * dt;
      }

      // 6. Air resistance with size-based damping
      const airResistance = 0.95 - (props.size * 0.05); // Larger particles resist more
      dustVelocities[i].x *= airResistance;
      dustVelocities[i].y *= airResistance;
      dustVelocities[i].z *= airResistance;

      // 7. Apply velocities with slight randomization
      dustPositions[i * 3] += dustVelocities[i].x * dt + (Math.random() - 0.5) * 0.001;
      dustPositions[i * 3 + 1] += dustVelocities[i].y * dt + (Math.random() - 0.5) * 0.001;
      dustPositions[i * 3 + 2] += dustVelocities[i].z * dt + (Math.random() - 0.5) * 0.001;

      // 8. Ground interaction (soft landing instead of hard collision)
      if (dustPositions[i * 3 + 1] <= 0.1) {
        dustPositions[i * 3 + 1] = 0.1; // Hover just above ground
        dustVelocities[i].x *= 0.3; // Quick horizontal damping
        dustVelocities[i].y = Math.max(0, dustVelocities[i].y * 0.1); // Soft bounce
        dustVelocities[i].z *= 0.3;

        // Ground particles settle faster
        if (!props.isTrail) {
          dustLifetimes[i] = Math.min(dustLifetimes[i], 8);
        }
      }

      // 9. Boundary wrapping (instead of despawning)
      const boundaryRadius = 75;
      const particleRadius = Math.sqrt(
        dustPositions[i * 3] * dustPositions[i * 3] +
        dustPositions[i * 3 + 2] * dustPositions[i * 3 + 2]
      );

      if (particleRadius > boundaryRadius) {
        // Wrap around to opposite side
        const angle = Math.atan2(dustPositions[i * 3 + 2], dustPositions[i * 3]);
        dustPositions[i * 3] = Math.cos(angle) * (boundaryRadius - 5);
        dustPositions[i * 3 + 2] = Math.sin(angle) * (boundaryRadius - 5);
      }
    }
  }

  dustGeometry.attributes.position.needsUpdate = true;

  // Update sparkle particles
  for (let i = 0; i < sparkleCount; i++) {
    if (sparkleLifetimes[i] > 0) {
      sparklePositions[i * 3] += sparkleVelocities[i].x * dt;
      sparklePositions[i * 3 + 1] += sparkleVelocities[i].y * dt;
      sparklePositions[i * 3 + 2] += sparkleVelocities[i].z * dt;
      sparkleVelocities[i].y -= 9.8 * dt;
      sparkleLifetimes[i] -= dt;
    } else {
      sparklePositions[i * 3] = 0;
      sparklePositions[i * 3 + 1] = 0;
      sparklePositions[i * 3 + 2] = 0;
    }
  }
  sparkleGeometry.attributes.position.needsUpdate = true;





  // Animate lighting intensity for ambiance
  const lightIntensity = 1.4 + Math.sin(time * 0.5) * 0.2;
  light.intensity = lightIntensity;

  // Add screen shake effect when stamina is low
  if (playerStamina < 25) {
    const shakeIntensity = (25 - playerStamina) / 25 * 0.05;
    camera.position.x += (Math.random() - 0.5) * shakeIntensity;
    camera.position.y += (Math.random() - 0.5) * shakeIntensity;
    camera.position.z += (Math.random() - 0.5) * shakeIntensity;
  }

  // Add particle trail when sprinting (increased visibility)
  if (isSprinting && Math.random() < 0.8) { // Increased chance from 0.3 to 0.8
    for (let i = 0; i < dustCount; i++) {
      if (dustLifetimes[i] <= 0) {
        const trailOffset = new THREE.Vector3(
          (Math.random() - 0.5) * 0.3,
          Math.random() * 0.1 + 0.1, // Lower starting position
          (Math.random() - 0.5) * 0.3
        ).add(playerState.pos);
        dustPositions[i * 3] = trailOffset.x;
        dustPositions[i * 3 + 1] = trailOffset.y;
        dustPositions[i * 3 + 2] = trailOffset.z;
        dustVelocities[i].set(
          (Math.random() - 0.5) * 0.1,
          Math.random() * 0.2 + 0.3, // More upward velocity
          (Math.random() - 0.5) * 0.1
        );
        dustLifetimes[i] = 2.0; // Longer lifetime
        break;
      }
    }
  }



  renderer.render(scene, camera);
  hudState.gamepad=!!gamepad.active;
  updateHud();
  updateStatsUI();
}
animate();

// ---------- Resize ----------
window.addEventListener("resize", ()=>{
  renderer.setSize(window.innerWidth,window.innerHeight);
  camera.aspect=window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
});

updateLeftStick(0,0);
