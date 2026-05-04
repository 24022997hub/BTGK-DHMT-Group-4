import { keys, initInput, consumeMouseDelta } from './managers/InputManager.js';
import { playerVY, isOnGround, updatePlayer, resetPlayer } from './entities/Player.js';
import { SPEED, RUN_SPEED, JUMP_FORCE, GRAVITY, PLAYER_H, PLAYER_RADIUS, DEATH_Y, SPAWN_X, SPAWN_Y, SPAWN_Z, FLAME_Y_OFFSET, TORCH_SHOW_DIST, TORCH_LIGHT_DIST, MAX_ACTIVE_LIGHTS, MOVING_TRAP_TRIGGER_Z, MOVING_TRAP_SPEED, MOVING_TRAP_TRAVEL, TRAP5_SPEED, TRAP5_TRAVEL, CHEST_INTERACT_DIST, CHEST_KNOCKBACK_SPEED, LOOT_PICKUP_DIST, PORTAL_TELEPORT_DIST, WALL_RISE_AMOUNT, WALL_RISE_SPEED, WALL_CONFIGS, SPIDER_TRIGGER_DIST, SPIDER_FLY_SPEED, SPIDER_STOP_X, SPIDER_RETURN_TRIG_X, SPIDER_FLY_ROT, SPIDER_HIT_ROT, SPIDER_BACK_ROT, TRIGGER_X_MIN, TRIGGER_X_MAX, TRIGGER_Z_MIN, TRIGGER_Z_MAX, TRIGGER_Y_MAX, PLATFORM_HINT_OFFSET, PLATFORM_SHIFT_1, PLATFORM_SHIFT_2, PLATFORM_SHIFT_3, PLATFORM_SPEED, CUA2_ROT_SPEED, CUA2_TRIGGER_DIST, CUA2_RISE_DIST, CUA_RESET_DIST, CUA2_RISE_SPEED, CUA7_FALL_DIST, CUA7_FALL_SPEED, CUA7_WARN_DIST, PORTAL_DEST, } from './utils/constants.js';
import { preloadAudio, playSFX, playBGM, stopBGM, updateFootstep, _initAudioCtx } from './managers/AudioManager.js';
import { renderer, scene, camera, clock, composer, yawObject, pitchObject, initRenderer, setupLights } from './core/Renderer.js';
import { rc, collisionMeshes, trapMeshes } from './physics/Collider.js';
import { initTorch, updateTorches, resetTorches } from './entities/Torch.js';
import { 
  setTrapState, trapConfig,
  initChest, toggleChest, checkChestLook, updateChest, resetChest, fullResetChest, chestPromptVisible, chestOpened,// <-- THÊM ĐOẠN RƯƠNG NÀY VÀO
  spiderMeshes, initSpider, checkSpiderTrigger, updateSpider, resetSpider,
  initFakePlatform, updateFakePlatform, checkTriggerBoxEnter, checkIfOnPlatform, resetFakePlatform,
  movingTrapMeshes, initMovingTrap, updateMovingTrap, checkMovingTrapTrigger, resetMovingTrap,
  trap5Meshes, initTrap5, activateTrap5, updateTrap5, resetTrap5,
  initMap2Trap, initMap2Floor, updateMap2Traps, resetMap2Traps, fullResetMap2Traps,
  initMap2Cua, updateMap2Cua, resetMap2Cua, fullResetMap2Cua,
  m2cua2, initMap2Cua2, updateMap2Cua2, resetMap2Cua2, fullResetMap2Cua2
} from './entities/Trap.js';

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';

// STATE
// ============================================================================
let yaw = 0;
let pitch = 0;
let gameRunning = false;
let paused = false;
let mapLoaded = false;
let mouseReady = false; 
let devMode = false;     
let isDead = false;
let wasOnPlatform = false;
let wasJumping = false;
let isTeleporting = false;    
let _currentLoadingSFX = null;


// ── INVENTORY & KEY-PORTAL ──
const inventory = {};          // { 'key_001': true, ... }
const portalMeshes      = {};  // { '001': mesh, ... }
const portalLightMeshes = [];  // Portal_light meshes, ẩn lúc đầu
const lootMeshes   = [];       // tất cả loot mesh từ Blender
let   lootPrompt   = null;
let   portalCooldown = 0;

const _qY    = new THREE.Quaternion();
const _qX    = new THREE.Quaternion();
const _axisY = new THREE.Vector3(0, 1, 0);
const _axisX = new THREE.Vector3(1, 0, 0);

// ═══════════════════════════════════════════════════════════
//  PORTAL DOOR — vertex displacement sóng tròn từ tâm
//  Giữ nguyên texture gốc từ Blender, chỉ thêm displacement
// ═══════════════════════════════════════════════════════════
let portalUniforms = null;

const PORTAL_VERT = `
uniform float uTime;
uniform float uSpeed;
uniform float uFreq;
uniform float uAmp;

varying vec2 vUv;

void main() {
  vUv = uv;

  // UV đã từ 0→1, đưa về -1→1 rồi tính dist từ tâm
  vec2 p = (uv - vec2(0.5)) * 2.0;
  float dist = length(p);

  float wave = sin(dist * uFreq - uTime * uSpeed);
  float disp = wave * uAmp;

  // Fade ở mép
  float edge = 1.0 - smoothstep(0.7, 1.0, dist);
  disp *= edge;

  vec3 pos = position + normal * disp;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const PORTAL_FRAG = `
uniform sampler2D map;
uniform bool hasMap;
uniform float uOpacity;

varying vec2 vUv;

void main() {
  vec4 col;
  if (hasMap) {
    col = texture2D(map, vUv);
  } else {
    float d = length(vUv - vec2(0.5));
    float w = sin(d * 10.0) * 0.5 + 0.5;
    col = vec4(mix(vec3(0.0, 0.05, 0.2), vec3(0.0, 0.8, 1.0), w), 1.0);
  }
  gl_FragColor = vec4(col.rgb, uOpacity);
}
`;

const allPortalUniforms = []; // mỗi portal có uniform riêng

function applyPortalShader(mesh) {
  const oldMat  = mesh.material;
  const map     = oldMat && oldMat.map ? oldMat.map : null;
  const opacity = (oldMat && oldMat.opacity != null) ? oldMat.opacity : 1.0;

  const uniforms = {
    uTime:    { value: 0 },
    uSpeed:   { value: 8.0 },
    uFreq:    { value: 20.0 },
    uAmp:     { value: 0.5 },
    map:      { value: map },
    hasMap:   { value: !!map },
    uOpacity: { value: opacity },
  };

  allPortalUniforms.push(uniforms);
  portalUniforms = uniforms; // backward compat

  mesh.material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader:   PORTAL_VERT,
    fragmentShader: PORTAL_FRAG,
    side:           THREE.DoubleSide,
    transparent:    opacity < 1.0,
    depthWrite:     opacity >= 1.0,
  });

  console.log('[Portal] Shader OK:', mesh.name, '| map:', !!map, '| opacity:', opacity);
}

function updatePortal(dt) {
  allPortalUniforms.forEach(u => { u.uTime.value += dt; });
}

// ═══════════════════════════════════════════════════════════
//  LOOT SYSTEM
//  Blender: Loot_key_001, Loot_coin_001, Loot_puzzle_001...
//  Ẩn lúc đầu → hiện khi chest mở → nhặt bằng C
// ═══════════════════════════════════════════════════════════

function initLoot(mesh) {
  const n = mesh.name.toLowerCase();
  let type = null;
  if      (n.includes('key'))     type = 'key';
  else if (n.includes('coin'))    type = 'coin';
  else if (n.includes('puzzle'))  type = 'puzzle';
  else if (n.includes('diamond')) type = 'diamond';
  if (!type) return;

  mesh.userData.type      = type;
  mesh.userData.lootId    = mesh.name.toLowerCase();
  mesh.userData.floatBase = mesh.position.y;
  mesh.userData.originY   = mesh.position.y; // lưu cố định, không bao giờ thay đổi
  mesh.visible = false;
  lootMeshes.push(mesh);
  console.log('[Loot] Init:', mesh.name);
}

function showLootItems() {
  lootMeshes.forEach((m, i) => {
    m.position.y = m.userData.originY;   // reset về đúng vị trí gốc trước khi float
    m.userData.floatBase  = m.userData.originY;
    m.userData._lootTimer = i * 0.3;
    m.visible = true;
  });
}

function updateLootItems(dt) {
  if (lootMeshes.length === 0) return;

  // Float + xoay
  lootMeshes.forEach(m => {
    if (!m.visible) return;
    m.userData._lootTimer = (m.userData._lootTimer || 0) + dt;
    m.position.y = m.userData.floatBase + Math.sin(m.userData._lootTimer * 2.0) * 0.15;
    m.rotation.y += dt * 0.6;
  });

  // Raycaster check nhìn vào item nào — chỉ khi chest đã mở
  const visibleMeshes = lootMeshes.filter(m => m.visible && chestOpened);
  if (visibleMeshes.length === 0) { showLootPrompt(null); lootPrompt = null; return; }

  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const rc2 = new THREE.Raycaster();
  rc2.set(yawObject.position, dir);
  rc2.far = LOOT_PICKUP_DIST;
  const hits = rc2.intersectObjects(visibleMeshes, false);

  lootPrompt = hits.length > 0 ? hits[0].object : null;
  showLootPrompt(lootPrompt ? lootPrompt.userData.type : null);
}

function pickupLoot(mesh) {
  playSFX('loot', 0.8);
  const type   = mesh.userData.type;
  const lootId = mesh.userData.lootId;
  inventory[lootId] = true;
  mesh.visible = false;

  if (type === 'key') {
    const num = lootId.match(/\d+$/)?.[0] || '001';
    const label = currentMap === MAP_2 ? 'PUZZLE' : 'KEY';
    updateKeyIcon(true, num, label);
    if (currentMap === MAP_2) {
      inventory['loot_key_' + num] = true;
    }
    // Đã gỡ lệnh mở cổng tự động ở đây
  } else if (type === 'puzzle' && currentMap === MAP_2) {
    const num = lootId.match(/\d+$/)?.[0] || '001';
    inventory['loot_key_' + num] = true;
    updateKeyIcon(true, num, 'PUZZLE');
    // Đã gỡ lệnh mở cổng tự động ở đây
  }

  showLootPrompt(null);
  lootPrompt = null;
  console.log('[Loot] Nhận:', lootId, '| inventory:', JSON.stringify(inventory));
}

// ── UI: prompt "C - Nhận" ──
function showLootPrompt(type) {
  let el = document.getElementById('loot-prompt');
  if (!type) { if (el) el.style.display = 'none'; return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'loot-prompt';
    el.style.cssText = `
      position:fixed;bottom:38%;left:50%;transform:translateX(-50%);
      display:flex;align-items:center;gap:12px;
      background:rgba(0,0,0,0.82);
      border:1px solid rgba(255,255,255,0.18);
      border-top:1px solid rgba(255,255,255,0.35);
      border-radius:12px;padding:12px 24px;pointer-events:none;z-index:50;
      backdrop-filter:blur(12px);color:#fff;font-family:'Segoe UI',sans-serif;
      box-shadow:0 8px 32px rgba(0,0,0,0.5);
    `;
    document.body.appendChild(el);
  }
  const labels = { coin:'Đồng Xu', key:'Chìa Khóa', puzzle:'Mảnh Ghép', diamond:'Kim Cương' };
  const icons  = { coin:'🪙', key:'🗝️', puzzle:'🧩', diamond:'💎' };
  el.innerHTML = `
    <span style="
      background:linear-gradient(135deg,#ffffff22,#ffffff08);
      border:1.5px solid rgba(255,255,255,0.55);
      border-bottom:3px solid rgba(255,255,255,0.15);
      border-radius:7px;padding:3px 12px;font-weight:800;
      font-size:14px;letter-spacing:1px;color:#fff;
      text-shadow:0 1px 4px rgba(0,0,0,0.8);
    ">C</span>
    <span style="font-size:18px;">${icons[type]||''}</span>
    <span style="font-size:13px;letter-spacing:2px;color:rgba(255,255,255,0.85);">
      Nhận — ${labels[type]||type}
    </span>
  `;
  el.style.display = 'flex';
}

// ── UI: Key icon góc trên trái ──
function updateKeyIcon(show, num = '001', label = 'KEY') {
  const id = 'key-icon-' + num;
  let el = document.getElementById(id);
  if (!show) { if (el) el.style.display = 'none'; return; }
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.style.cssText = `
      position:fixed;top:50px;left:${20 + (parseInt(num)-1)*130}px;z-index:50;
      background:rgba(0,0,0,0.6);border:1.5px solid #aaa;border-radius:8px;
      padding:8px 14px;display:flex;align-items:center;gap:8px;
      color:#e0e0e0;font-family:'Segoe UI',sans-serif;font-size:13px;letter-spacing:2px;
    `;
    document.body.appendChild(el);
  }
  const icon = label === 'PUZZLE' ? '🧩' : '🗝️';
  el.innerHTML = `<span style="font-size:18px;">${icon}</span><span>${label}</span>`;
  el.style.display = 'flex';
}

function showCredits() {
  document.exitPointerLock();
  const el = document.getElementById('credits-screen');
  if (el) el.style.display = 'flex';
  playBGM('bgCredit', 0.4);
}


// ── Spawn loot khi chest mở ──
function spawnLootFromChest() {
  showLootItems();
}
trapConfig.spawnLoot = spawnLootFromChest;
trapConfig.hideLoot = () => {
  lootMeshes.forEach(m => { m.visible = false; });
  showLootPrompt(null);
  lootPrompt = null;
};

// ═══════════════════════════════════════════════════════════
//  PORTAL TELEPORT
//  Loot_key_001 → Portal_door_001, key biến mất sau khi dùng
// ═══════════════════════════════════════════════════════════
function initPortalMesh(mesh) {
  const n   = mesh.name.toLowerCase();
  const num = n.match(/\d+$/)?.[0] || '001';
  portalMeshes[num] = mesh;
  
  mesh.userData.origScale = mesh.scale.clone(); 
  mesh.scale.set(0, 0, 0);                      
  mesh.userData.isRevealed = false; // <--- Cờ đánh dấu cổng chưa hiện
  
  console.log('[Portal] Đăng ký:', mesh.name, '→ cần key_' + num);
}

// HÀM MỚI: QUÉT XEM ĐÃ ĐỦ GẦN ĐỂ HIỆN CỔNG CHƯA (Tính theo khoảng cách 2D mặt đất)
function checkPortalReveal() {
  for (const [num, mesh] of Object.entries(portalMeshes)) {
    if (mesh.userData.isRevealed) continue; // Hiện rồi thì thôi bỏ qua

    const pp = new THREE.Vector3();
    mesh.getWorldPosition(pp);
    
    // ĐO KHOẢNG CÁCH 2D MẶT SÀN (BỎ QUA CHIỀU CAO TRỤC Y)
    const dx = yawObject.position.x - pp.x;
    const dz = yawObject.position.z - pp.z;
    const distXZ = Math.sqrt(dx*dx + dz*dz);

    const keyId = 'loot_key_' + num;
    
    // Có chìa khóa VÀ đứng cách cổng <= 3.0 mét thì cửa hiện ra!
    if (inventory[keyId] && distXZ <= 20.0) {
      mesh.userData.isRevealed = true; 
      mesh.scale.copy(mesh.userData.origScale); 

      // Bật đèn của cổng tương ứng
      portalLightMeshes.forEach(light => {
        const lightName = (light.name || '').toLowerCase();
        
        // Tự động mò số của đèn, nếu m không ghi số thì ngầm hiểu là đèn số 001
        const lightNum = lightName.match(/\d+$/)?.[0] || '001';
        
        // Trùng số với cổng thì bật sáng rực rỡ lên!
        if (lightNum === num) {
          light.intensity = light.userData.origIntensity || 5;
        }
      });

      // Bật tiếng
      playSFX('portalAppear', 0.9);
      console.log('[Portal] Đã xuất hiện portal_' + num);
    }
  }
}

function checkPortalTeleport() {
  // Chặn luôn nếu đang cooldown hoặc đang trong thời gian chờ dịch chuyển
  if (portalCooldown > 0 || isTeleporting) return;

  for (const [num, mesh] of Object.entries(portalMeshes)) {
    if (!mesh.userData.isRevealed) continue;

    const pp = new THREE.Vector3();
    mesh.getWorldPosition(pp);
    
    // ĐO KHOẢNG CÁCH 2D MẶT SÀN
    const dx = yawObject.position.x - pp.x;
    const dz = yawObject.position.z - pp.z;
    const distXZ = Math.sqrt(dx*dx + dz*dz);

    // Bước vào cách tâm cổng 0.8 mét mới bị hút
    if (distXZ > 0.6) continue;

    // Kiểm tra có key tương ứng không
    const keyId = 'loot_key_' + num;
    if (!inventory[keyId]) {
      console.log('[Portal] Cần', keyId, 'để vào portal này');
      continue;
    }

    // BẬT TRẠNG THÁI CHUẨN BỊ DỊCH CHUYỂN
    isTeleporting = true;

    // Có key → dùng key (biến mất)
    delete inventory[keyId];
    updateKeyIcon(false, num);

    // Ẩn key mesh
    const keyMesh = lootMeshes.find(m => m.userData.lootId === keyId);
    if (keyMesh) keyMesh.visible = false;

    // Phát tiếng portal xé rách không gian ngay khi chạm
    playSFX('portal', 0.9);
    console.log('[Portal] Đã kích hoạt! Đóng băng thời gian, đợi 3 giây...');

    // Hẹn giờ 3 giây (3000ms) sau mới Load Map
    setTimeout(() => {
      if (!gameRunning) {
        isTeleporting = false;
        return;
      }

      if (currentMap === MAP_2) {
        showCredits();
        console.log('[Portal] Credits!');
      } else {
        respawn();
        _currentLoadingSFX = playSFX('loadMap2', 0.7);
        loadMap(MAP_2);
        console.log('[Portal] Teleport qua Portal_door_' + num + '!');
      }
      
      isTeleporting = false; 
      portalCooldown = 2.5;
    }, 3000);

    break;
  }
}


//  Blender: Animate_wall_001, Animate_wall_002
//  Khi người chơi đi vào vùng trigger → tường nâng lên Y += 20
// ═══════════════════════════════════════════════════════════
let animWalls = [];

function initAnimWall(mesh) {
  const n   = (mesh.name || '').toLowerCase();
  const cfg = WALL_CONFIGS[n] || { checkX: false, triggerXMin: -9999, checkZ: false, triggerZ: 9999 };
  animWalls.push({
    mesh        : mesh,
    originY     : mesh.position.y,
    currentY    : mesh.position.y,
    triggered   : false,
    moving      : false,
    checkX      : cfg.checkX,
    triggerXMin : cfg.triggerXMin,
    checkZ      : cfg.checkZ,
    triggerZ    : cfg.triggerZ,
    smokeAxis   : cfg.smokeAxis || 'X',
    smokeFlip   : cfg.smokeFlip || false, // LỖI LÀ TẠI ĐÂY: Hàm cũ thiếu mất dòng đọc Config này!
  });
  console.log('[Wall] Init:', mesh.name,
    cfg.checkX ? '| X >=' + cfg.triggerXMin : '',
    cfg.checkZ ? '| Z <=' + cfg.triggerZ    : '');
}

function checkWallTriggers() {
  if (!mapLoaded) return;
  animWalls.forEach(w => {
    if (w.triggered) return;
    const px = yawObject.position.x;
    const pz = yawObject.position.z;
    const xOk = !w.checkX || px >= w.triggerXMin;
    const zOk = !w.checkZ || pz <= w.triggerZ;
    if (xOk && zOk) {
      w.triggered = true;
      w.moving    = true;
      w.dustTimer = 0;
      // Hiệu ứng động đất khi tường nâng
      triggerEarthquake(4.0, 0.3);  // 2 giây, intensity 0.15m
      // BẬT TIẾNG VÀ LƯU LẠI CÔNG TẮC VÀO BIẾN w.sfx
      w.sfx = playSFX('wallRise', 1.0);
      
      // Tính toán vị trí nổ khói chuẩn mặt
      const wpT = new THREE.Vector3();
      w.mesh.getWorldPosition(wpT);
      const bT = new THREE.Box3().setFromObject(w.mesh);
      const sT = new THREE.Vector3(); bT.getSize(sT);
      
      let spawnX = wpT.x;
      let spawnZ = wpT.z;
      if (w.smokeAxis === 'Z') {
        spawnX = w.smokeFlip ? bT.min.x : bT.max.x;
      } else {
        spawnZ = w.smokeFlip ? bT.min.z : bT.max.z;
      }
      
      for (let b = 0; b < 3; b++) spawnSmokePuff(spawnX, spawnZ, sT.x*0.8, sT.z*0.8, w.smokeAxis, w.smokeFlip);
      console.log('[Wall] Trigger:', w.mesh.name, 'X:', px.toFixed(2), 'Z:', pz.toFixed(2));
    }
  });
}

// ── Smoke billboard system ──
// ═══════════════════════════════════════════════════════════
//  SMOKE PARTICLE SYSTEM — animate_wall
//  Nhiều Sprite nhỏ bay lên tự nhiên
// ═══════════════════════════════════════════════════════════
const smokeEmitters = [];
const smokePuffs = smokeEmitters; // alias backward compat
let _smokeTex = null;

function getSmokeTex() {
  if (_smokeTex) return _smokeTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32,32,0, 32,32,32);
  g.addColorStop(0,   'rgba(200,180,150,1)');
  g.addColorStop(0.3, 'rgba(170,150,120,0.6)');
  g.addColorStop(0.6, 'rgba(140,120,95,0.25)');
  g.addColorStop(1,   'rgba(100,85,65,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0,0,64,64);
  _smokeTex = new THREE.CanvasTexture(c);
  return _smokeTex;
}

function spawnSmokePuff(wx, wz, wallW, wallD, axis, flip = false) {
  const COUNT    = 40;
  const tex      = getSmokeTex();
  const flipSign = flip ? -1 : 1;
  const particles = [];

  for (let i = 0; i < COUNT; i++) {
    const alongX = (Math.random()-0.5) * wallW * 3.0;
    const alongZ = (Math.random()-0.5) * wallD * 3.0;
    const outward = (0.0 + Math.random() * 3.0) * flipSign;
    const depth   = (Math.random()-0.5) * 3.0;

    const px = axis === 'X' ? wx + alongX + depth : wx + alongX + outward;
    const pz = axis === 'Z' ? wz + alongZ + depth : wz + alongZ + outward;
    const py = 0.05 + Math.random() * 1.5;
    const sz = 1.5 + Math.random() * 2.0;

    const mat = new THREE.SpriteMaterial({
      map:         tex,
      transparent: true,
      opacity:     0,
      depthWrite:  false,
      color:       0xc8b89a,
    });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(sz, sz, 1);
    sp.position.set(px, py, pz);
    sp.material.rotation = Math.random() * Math.PI * 2;
    sp.renderOrder = 999; // KHẮC PHỤC LỖI Z-SORTING: Đảm bảo hạt khói vẽ sau cùng
    sp.frustumCulled = false;
    // BỎ DÒNG NÀY: Việc đổi boundingSphere sẽ ảnh hưởng toàn bộ Sprite khác (vì Sprite xài chung 1 geometry)
    // sp.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 99999);
    scene.add(sp);

    const outV   = (1 + Math.random() * 3) * flipSign;
    const alongV = (Math.random()-0.5) * 8.0;
    particles.push({
      sp, sz,
      x: px, y: py, z: pz,
      vx: axis === 'X' ? alongV : outV * (0.5 + Math.random() * 0.5),
      vy: 0.5 + Math.random() * 1.2,
      vz: axis === 'Z' ? alongV : outV * (0.5 + Math.random() * 0.5),
      phase: Math.random() * Math.PI * 2,
    });
  }

  smokeEmitters.push({
    particles,
    life: 0,
    maxLife: 4.0 + Math.random() * 1.0,
    maxOp:   0.1 + Math.random() * 0.04,
  });
}

function updateSmokePuffs(dt) {
  for (let i = smokeEmitters.length-1; i >= 0; i--) {
    const e = smokeEmitters[i];
    e.life += dt;
    const t = Math.min(e.life / e.maxLife, 1);

    const op = t < 0.2
      ? e.maxOp * (t / 0.2)
      : e.maxOp * (1 - (t - 0.2) / 0.8);

    e.particles.forEach(p => {
      p.x += p.vx * dt + Math.sin(e.life * 1.5 + p.phase) * 0.02;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy = Math.max(0, p.vy - 0.3 * dt);
      p.sp.position.set(p.x, p.y, p.z);
      const sc = p.sz * (1 + t * 2.0);
      p.sp.scale.set(sc, sc, 1);
      p.sp.material.opacity = op;
      p.sp.material.rotation += dt * 0.2;
    });

    if (e.life >= e.maxLife) {
      e.particles.forEach(p => {
        scene.remove(p.sp);
        p.sp.material.dispose();
      });
      smokeEmitters.splice(i, 1);
    }
  }
}

function updateAnimWalls(dt) {
  animWalls.forEach(w => {
    if (!w.moving) return;
    const targetY   = w.originY + WALL_RISE_AMOUNT;
    const remaining = targetY - w.currentY;
// ĐOẠN 1: KHI TƯỜNG CHẠM ĐÍCH -> TẠO DƯ ÂM KÉO DÀI 1 GIÂY
    if (remaining <= 0.001) {
      w.currentY = targetY;
      w.mesh.position.y = targetY;
      w.moving    = false;
      w.dustTimer = 0;
      w.mesh.updateWorldMatrix(true, false);
      
      if (w.sfx) {
        // Tách cái âm thanh này ra khỏi bức tường để xử lý riêng
        const sfxTail = w.sfx;
        w.sfx = null; 
        
        let tailVol = 0.3; // Âm lượng tàn dư bắt đầu ở mức 30%
        
        // Tạo một vòng lặp nhỏ gọn chạy ngầm: Cứ 0.1 giây lại vặn nhỏ volume đi 1 tí
        const fadeOutTimer = setInterval(() => {
          tailVol -= 0.03; 
          
          if (tailVol <= 0) {
            sfxTail.setVolume(0);
            sfxTail.pause(); // Nhỏ hết cỡ rồi mới rút điện
            clearInterval(fadeOutTimer); // Tự hủy vòng lặp ngầm
          } else {
            sfxTail.setVolume(tailVol);
          }
        }, 100); 
      }
      return;
    }

    // ĐOẠN 2: LÚC ĐANG NÂNG LÊN GẦN TỚI ĐỈNH
    // T không cho nó giảm về 0 nữa, mà giảm từ 100% xuống 30% (0.3) để lấy đà làm dư âm
    if (remaining < 5.0 && w.sfx && w.sfx.setVolume) {
      const fadeVol = 0.3 + (remaining / 5.0) * 0.7; 
      w.sfx.setVolume(fadeVol);
    }
    const step = Math.min(WALL_RISE_SPEED * dt, remaining);
    w.currentY        += step;
    w.mesh.position.y  = w.currentY;
    w.mesh.updateWorldMatrix(true, false);

    if (w.dustTimer >= 0.15) {
      w.dustTimer = 0;
      const wp  = new THREE.Vector3();
      w.mesh.getWorldPosition(wp);
      const box = new THREE.Box3().setFromObject(w.mesh);
      const sz  = new THREE.Vector3();
      box.getSize(sz);
      
      // --- SỬA LẠI ĐOẠN NÀY ---
      // Tính toán đúng cạnh tường để xịt khói dựa theo trục của từng tường
      let spawnX = wp.x;
      let spawnZ = wp.z;
      
      if (w.smokeAxis === 'Z') {
        spawnX = w.smokeFlip ? box.min.x : box.max.x;
      } else {
        spawnZ = w.smokeFlip ? box.min.z : box.max.z;
      }
      
      spawnSmokePuff(spawnX, spawnZ, sz.x * 0.8, sz.z * 0.8, w.smokeAxis, w.smokeFlip);
      // ------------------------
    }
  });
}

function resetAnimWalls() {
  animWalls.forEach(w => {
    w.currentY        = w.originY;
    w.mesh.position.y = w.originY;
    w.triggered       = false;
    w.moving          = false;
    w.mesh.updateWorldMatrix(true, false);
    // DỌN DẸP TIẾNG KÊU NẾU CHẾT GIỮA CHỪNG
    if (w.sfx) {
      w.sfx.pause();
      w.sfx = null;
    }
  });
}


// ═══════════════════════════════════════════════════════════
//  PARTICLES (menu background)
// ═══════════════════════════════════════════════════════════
const pc  = document.getElementById('particles');
const ctx = pc.getContext('2d');
let pts   = [];

function resizeParticles() { pc.width = innerWidth; pc.height = innerHeight; }

function initParticles() {
  pts = [];
  for (let i = 0; i < 80; i++) pts.push({
    x: Math.random()*pc.width, y: Math.random()*pc.height,
    r: Math.random()*1.5+0.3,
    vx:(Math.random()-0.5)*0.3, vy:-Math.random()*0.4-0.1,
    a: Math.random()*0.6+0.1
  });
}

function animParticles() {
  if (document.getElementById('menu').style.display !== 'none') {
    ctx.clearRect(0,0,pc.width,pc.height);
    pts.forEach(p => {
      p.x+=p.vx; p.y+=p.vy;
      if(p.y<-5){p.y=pc.height+5; p.x=Math.random()*pc.width;}
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle=`rgba(180,100,255,${p.a})`; ctx.fill();
    });
  }
  requestAnimationFrame(animParticles);
}

window.addEventListener('resize', ()=>{resizeParticles(); initParticles();});
resizeParticles(); initParticles(); animParticles();


// ═══════════════════════════════════════════════════════════
//  MODAL
// ═══════════════════════════════════════════════════════════
function openIntro()  { document.getElementById('modal-overlay').classList.add('open'); }
function closeIntro() { document.getElementById('modal-overlay').classList.remove('open'); }
document.getElementById('modal-overlay').addEventListener('click', function(e){
  if(e.target===this) closeIntro();
});

function showLoadingScreen(show) {
  let el = document.getElementById('loading-screen');
  if (show) {
    if (!el) {
      el = document.createElement('div');
      el.id = 'loading-screen';
      el.innerHTML = `
        <div class="loading-inner">
          <div class="loading-game-title">TRAP ADVENTURE</div>
          <div class="loading-label">Đang tải bản đồ...</div>
          <div class="loading-bar-track">
            <div id="loading-bar-fill"></div>
          </div>
          <div id="loading-pct">0%</div>
          <div class="loading-quote">"Bẫy nằm ở nơi bạn ít ngờ tới nhất..."</div>
        </div>
      `;
      document.body.appendChild(el);
    }
    el.style.display = 'flex';
    el.style.opacity = '1';
    const bar = document.getElementById('loading-bar-fill');
    const pct = document.getElementById('loading-pct');
    if (bar) bar.style.width = '0%';
    if (pct) pct.textContent = '0%';
  } else {
    if (!el) return;
    el.style.opacity = '0';
    setTimeout(() => { if (el) el.remove(); }, 500);
  }
}

// ═══════════════════════════════════════════════════════════
//  LOAD MAP TỪ BLENDER
// ═══════════════════════════════════════════════════════════
function loadBlenderMap(path, onDone) {
  showLoadingScreen(true);
  const draco = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');

  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);

  loader.load(path,
    function(gltf) {
      const map = gltf.scene;

      map.traverse(child => {
        // Light từ Blender — bật castShadow nhẹ
        if (child.isLight) {
          const LIGHT_COLORS = {
            'Chest_Light':  0xFFFFFF,
            'Portal_light': 0x4488ff,
          };
          if (LIGHT_COLORS[child.name]) {
            child.color.set(LIGHT_COLORS[child.name]);
          }
          // Ẩn Portal_light lúc đầu, chờ unlock — không cast shadow để tránh lag
          if ((child.name || '').toLowerCase().includes('portal_light')) {
            // child.visible = false; // XÓA DÒNG NÀY
            child.userData.origIntensity = child.intensity; // THÊM: Lưu lại độ sáng cấu hình từ Blender
            child.intensity = 0;                            // THÊM: Tắt đèn (không tốn tài nguyên compile lại)
            child.castShadow = false;
            portalLightMeshes.push(child);
          return;
}
          child.castShadow = true;
          child.shadow.mapSize.set(256, 256);
          child.shadow.camera.near = 0.1;
          child.shadow.camera.far  = 20;
          child.shadow.bias        = -0.005;
          return;
        }

        if (!child.isMesh) return;
        child.castShadow    = true;
        child.receiveShadow = true;
        child.updateWorldMatrix(true, false);

        // ── Fix transparency — Three.js không tự bật transparent từ GLB ──
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach(m => {
          if (!m) return;
          // Nếu opacity < 1 → đúng là vật thể trong suốt (ví dụ kính, nước)
          if (m.opacity < 1.0) {
            m.transparent = true;
            m.depthWrite  = false;  // tránh z-fighting khi trong suốt
          }
          // KHẮC PHỤC LỖI TẠI ĐÂY:
          // Nếu có alphaMap hoặc ảnh định dạng RGBA (như lá cây, lưới, mặt sàn...)
          // KHÔNG dùng transparent = true vì sẽ gây lỗi Z-sorting làm mất khói khi xoay camera
          else if (m.alphaMap || (m.map && m.map.format === THREE.RGBAFormat)) {
            m.transparent = false;  // Tắt transparent
            m.alphaTest   = m.alphaTest > 0 ? m.alphaTest : 0.5; // Dùng alphaTest để cắt rỗng thay thế
            m.depthWrite  = true;   // Đảm bảo ghi depth bình thường
          }
          m.needsUpdate = true;
        });

        const name = (child.name || '').toLowerCase();

        // ── _nocol → chỉ render, KHÔNG collision ──
        // Đặt tên trong Blender có đuôi _nocol
        // Ví dụ: Torch_nocol, Grass_nocol, Deco_nocol
        const isNocol = name.includes('_nocol');

        // Torch_flame — tạo lửa + PointLight tại vị trí đuốc
        if (name.includes('torch_flame')) {
          initTorch(child);
          return;
        }

        // Loot_xxx — ẩn lúc đầu, hiện khi chest mở
        if (name.startsWith('loot_')) {
          initLoot(child);
          return;
        }

        // Portal_door — shader sóng + đăng ký portal
        if (name.includes('portal_door')) {
          applyPortalShader(child);
          child.material.transparent = true;
          child.material.depthWrite  = true;
          child.material.depthTest   = true;
          child.renderOrder          = 1;
          child.castShadow = false;
          child.receiveShadow = false;
          initPortalMesh(child);
          return;
        }

        // Portal_light — ẩn lúc đầu, hiện khi có key/puzzle
        if (name.includes('portal_light')) {
          child.visible = false;
          portalLightMeshes.push(child);
          return;
        }

        // Trap_004 là moving trap — xử lý riêng
        const isMovingTrap = !isNocol && name.startsWith('trap_004');
        const isTrap5      = !isNocol && name.startsWith('trap_005');
        // Map2: Trap_001/002 là ping-pong trap theo Y
        const isMap2PingPong = !isNocol && currentMap === MAP_2 &&
          (name.startsWith('trap_001') || name.startsWith('trap_002'));
        const isMap2Cua = !isNocol && currentMap === MAP_2 &&
          name.startsWith('trap_cua_001');
        const isMap2Cua2 = !isNocol && currentMap === MAP_2 &&
          (name.startsWith('trap_cua_002') || name.startsWith('trap_cua_003') ||
           name.startsWith('trap_cua_004') || name.startsWith('trap_cua_005') ||
           name.startsWith('trap_cua_006') || name.startsWith('trap_cua_007'));

        // Map2: floor trigger cho trap (Map_floor.002, Map_floor.003, 004, 005)
        const isMap2Floor = currentMap === MAP_2 && name.includes('floor') &&
          (name.includes('002') || name.includes('003') || name.includes('004') || name.includes('005') ||
           name.includes('.002') || name.includes('.003') || name.includes('.004') || name.includes('.005'));

        const isTrap =
          !isNocol && !isMovingTrap && !isMap2PingPong && !isMap2Cua && !isMap2Cua2 && (
            name.includes('trap')   || name.includes('bay')  ||
            name.includes('spike')  || name.includes('saw')  ||
            name.includes('fire')   || name.includes('kill') ||
            name.includes('danger')
          );

        // Nhận diện fake platform
        const isFakePlatform = name.includes('platform_fake');
        const isChest    = name.startsWith('chest_box') || name.startsWith('chest_lid');
        const isAnimWall = name.startsWith('animate_wall');
        const isSpider   = name.startsWith('trap_spider');

        if (isNocol) {
          // render only
        } else if (isMap2PingPong) {
          initMap2Trap(child);
        } else if (isMap2Cua) {
          initMap2Cua(child);
        } else if (isMap2Cua2) {
          initMap2Cua2(child);
        } else if (isMap2Floor) {
          initMap2Floor(child);
          collisionMeshes.push(child); // vẫn là sàn bình thường
        } else if (isMovingTrap) {
          child.castShadow = false;
          child.receiveShadow = false;
          trapMeshes.push(child);
          initMovingTrap(child);
        } else if (isTrap5) {
          child.castShadow = false;
          child.receiveShadow = false;
          trapMeshes.push(child);
          initTrap5(child);
        } else if (isFakePlatform) {
          collisionMeshes.push(child);
          initFakePlatform(child);
        } else if (isTrap) {
          child.castShadow = false;
          child.receiveShadow = false;
          trapMeshes.push(child);
          console.log('[Trap]', child.name);
        } else if (isSpider) {
          trapMeshes.push(child);
          initSpider(child);
        } else if (isAnimWall) {
          collisionMeshes.push(child);
          initAnimWall(child);
        } else if (isChest) {
          collisionMeshes.push(child);
          initChest(child);
        } else {
          collisionMeshes.push(child);
        }

        // Build BVH cho tất cả mesh → raycaster nhanh hơn
        if (child.geometry && child.geometry.computeBoundsTree) {
          child.geometry.computeBoundsTree();
        }
      });

      scene.add(map);

      // Nhận diện Spider Group (object cha, không phải Mesh)
      map.traverse(obj => {
        const n = (obj.name || '').toLowerCase();
        if (n.startsWith('trap_spider') && !obj.isMesh) {
          obj.userData.originPos = obj.position.clone();
          obj.userData.originRot = {
            x: obj.rotation.x,
            y: obj.rotation.y,
            z: obj.rotation.z
          };
          spiderMeshes.push(obj);
          console.log('[Spider] Init Group:', obj.name);
        }
      });

      // Tắt bloom cho Spider_nest
      map.traverse(obj => {
        if ((obj.name || '').toLowerCase().includes('spider_nest')) {
          if (obj.isMesh && obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach(m => {
              if (m.emissive) m.emissive.set(0x000000);
              m.emissiveIntensity = 0;
              m.toneMapped = true;
            });
          }
        }
      });

      console.log('[Map] Load xong:', path,
        '| solid:', collisionMeshes.length,
        '| trap:', trapMeshes.length);

      // ── BƯỚC 1: Ép tất cả vật thể hiện hình ──
      scene.traverse(obj => {
        obj.userData.wasVisible = obj.visible; // Lưu lại trạng thái gốc
        obj.visible = true;                    // Ép bật lên hết
      });

      // ── Warmup: compile toàn bộ shader variants trước khi cho chơi ──
      // Mục đích: tránh FPS drop 1-5s đầu do WebGL compile on-demand
      renderer.compile(scene, camera);

      const origYaw   = yaw;
      const origPitch = pitch;
      // Render nhiều góc để ép WebGL compile hết shader variants
      const warmupAngles = [
        0, Math.PI/4, Math.PI/2, 3*Math.PI/4,
        Math.PI, 5*Math.PI/4, 3*Math.PI/2, 7*Math.PI/4,
      ];
      for (const angle of warmupAngles) {
        yawObject.rotation.y   = angle;
        pitchObject.rotation.x = (angle * 0.2) % 0.8;
        if (composer) composer.render();
        else renderer.render(scene, camera);
      }
      // Thêm 1 pass nữa ở góc bình thường để flush
      yawObject.rotation.y   = origYaw;
      pitchObject.rotation.x = origPitch;
      if (composer) composer.render();
      else renderer.render(scene, camera);

      // ── BƯỚC 2: Trả vờ như chưa có gì xảy ra (ẩn lại như cũ) ──
      scene.traverse(obj => {
        if (obj.userData.wasVisible !== undefined) {
          obj.visible = obj.userData.wasVisible; // Trả lại trạng thái ẩn ban đầu
          delete obj.userData.wasVisible;
        }
      });

      yaw   = origYaw;
      pitch = origPitch;
      yawObject.rotation.y   = yaw;
      pitchObject.rotation.x = pitch;

      // Đặt mapLoaded = true để gameLoop bắt đầu render thực
      // Nhưng GIỮ loading screen cho đến khi FPS ổn định
      mapLoaded = true;

      // Cập nhật loading bar → "Đang khởi động..."
      const bar2 = document.getElementById('loading-bar-fill');
      const txt2 = document.getElementById('loading-pct');
      const lbl  = document.querySelector('.loading-label');
      if (bar2) bar2.style.width = '100%';
      if (txt2) txt2.textContent = '100%';
      if (lbl)  lbl.textContent  = 'Đang khởi động...';

      // Đo FPS thực, ẩn loading khi ổn định >= FPS_STABLE_TARGET trong FPS_STABLE_FRAMES frame liên tiếp
      const FPS_STABLE_TARGET = 50;
      const FPS_STABLE_FRAMES = 60;
      let stableCount = 0;
      let lastTs = performance.now();

      function checkStable(ts) {
        const frameDt = ts - lastTs;
        lastTs = ts;
        const fps = frameDt > 0 ? 1000 / frameDt : 0;

        if (fps >= FPS_STABLE_TARGET) {
          stableCount++;
        } else {
          stableCount = 0; // reset nếu có frame chậm
        }

        if (stableCount >= FPS_STABLE_FRAMES) {
          // FPS ổn định → ẩn loading và cho chơi
          showLoadingScreen(false);
          
          // TẮT NGAY TIẾNG LOAD MAP KHI ĐÃ VÀO GAME
          if (_currentLoadingSFX) {
            _currentLoadingSFX.pause();
            _currentLoadingSFX.currentTime = 0;
            _currentLoadingSFX = null;
          }

          setTimeout(() => { mouseReady = true; }, 100);
        } else {
          requestAnimationFrame(checkStable);
        }
      }
      requestAnimationFrame(checkStable);

      if (onDone) onDone(map);
    },
    p => {
      const pct = p.total ? Math.round(p.loaded/p.total*100) : 0;
      const bar = document.getElementById('loading-bar-fill');
      const txt = document.getElementById('loading-pct');
      if (bar) bar.style.width = pct + '%';
      if (txt) txt.textContent = pct + '%';
      console.log('[Map] Đang load...', pct + '%');
    },
    err => console.error('[Map] Lỗi:', err)
  );
}

function loadBlenderObject(path, x, y, z, scale=1, isTrap=false, onDone) {
  const loader = new GLTFLoader();
  loader.load(path, gltf => {
    const obj = gltf.scene;
    obj.position.set(x, y, z);
    obj.scale.setScalar(scale);
    obj.traverse(child => {
      if (!child.isMesh) return;
      child.castShadow = child.receiveShadow = false;
      child.updateWorldMatrix(true, false);
      if (isTrap) trapMeshes.push(child);
      else        collisionMeshes.push(child);
    });
    scene.add(obj);
    console.log('[Object] Load xong:', path);
    if (onDone) onDone(obj);
  }, null, err => console.error('[Object] Lỗi:', err));
}


// ═══════════════════════════════════════════════════════════
//  DEATH & RESPAWN
// ═══════════════════════════════════════════════════════════
// main.js

function respawn() {
  // Dọn dẹp âm thanh khi chết
  if (_currentDeathSFX) {
    _currentDeathSFX.pause();
    _currentDeathSFX = null;
  }

  // SỬA TẠI ĐÂY: Sử dụng hàm resetPlayer đã import để reset biến vật lý
  // Hàm này sẽ tự lo việc đặt lại playerVY, isOnGround và vị trí Spawn
  resetPlayer(); 

  // Reset các biến trạng thái thuộc quyền quản lý của main.js
  yaw = 0; 
  pitch = 0;
  isDead          = false;
  wasOnPlatform   = false;
  wasJumping      = false;

  // Reset bẫy theo từng map (giữ nguyên đoạn này)
  if (currentMap === MAP_1) {
    resetMovingTrap();
    resetTrap5();
    resetChest();
    resetAnimWalls();
    resetSpider();
    resetFakePlatform();
  } else if (currentMap === MAP_2) {
    resetMap2Traps();
    resetMap2Cua();
    resetMap2Cua2();
    resetChest();
  }
}

let _currentDeathSFX = null;

function triggerDeath(reason) {
  if (isDead) return;
  isDead = true;
  console.log('[Death]', reason || '');

  // Tiếng chết
  const r = (reason || '').toLowerCase();
  if (r.includes('lava')) {
    // 🔴 GÁN VÀO BIẾN THAY VÌ CHỈ GỌI HÀM KHÔNG:
    _currentDeathSFX = playSFX('lavaDeath', 1.0); 
  } else {
    _currentDeathSFX = playSFX('death', 0.8);     
  }

  // Flash đỏ trước
  const flash = document.createElement('div');
  flash.style.cssText = `
    position:fixed;inset:0;z-index:998;pointer-events:none;
    background:rgba(220,0,0,0.7);transition:opacity 0.3s ease;
  `;
  document.body.appendChild(flash);

  // Sau flash → hiện BẠN ĐÃ CHẾT
  setTimeout(() => {
    flash.style.opacity = '0';

    playSFX('deathScreen', 1.0);

    const overlay = document.createElement('div');
    overlay.id = 'death-overlay';
    overlay.className = 'death-overlay';
    overlay.innerHTML = `
      <div class="death-text-wrap">
        <div class="death-title">BẠN ĐÃ CHẾT</div>
        <div class="death-sub">Đang hồi sinh...</div>
      </div>
    `;
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      overlay.style.background = 'rgba(0,0,0,0.78)';
      const wrap = overlay.querySelector('.death-text-wrap');
      if (wrap) { wrap.style.opacity = '1'; wrap.style.transform = 'scale(1)'; }
    });

    setTimeout(() => {
      overlay.style.background = 'rgba(0,0,0,0)';
      const wrap = overlay.querySelector('.death-text-wrap');
      if (wrap) { wrap.style.opacity = '0'; wrap.style.transform = 'scale(0.7)'; }
      setTimeout(() => { flash.remove(); overlay.remove(); respawn(); playSFX('respawn', 0.7);}, 400);
    }, 1700);
  }, 180);
}


// ═══════════════════════════════════════════════════════════
//  COLLISION DETECTION
// ═══════════════════════════════════════════════════════════

// Va chạm tường ngang
function checkWallCollision(moveVec) {
  if (!mapLoaded || collisionMeshes.length === 0) return;

  const foot = yawObject.position.clone();
  foot.y -= PLAYER_H * 0.4;

  const angles = [0, Math.PI/4, Math.PI/2, 3*Math.PI/4,
                  Math.PI, 5*Math.PI/4, 3*Math.PI/2, 7*Math.PI/4];

  for (const angle of angles) {
    const d = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
    rc.set(foot, d);
    rc.far = PLAYER_RADIUS + 0.1;
    const hits = rc.intersectObjects(collisionMeshes, false);
    if (hits.length > 0 && hits[0].face) {
      const n = hits[0].face.normal.clone()
        .transformDirection(hits[0].object.matrixWorld);
      n.y = 0; n.normalize();
      const dot = moveVec.dot(n);
      if (dot < 0) moveVec.addScaledVector(n, -dot);
    }
  }
}

// Va chạm sàn
function checkFloor() {
  if (!mapLoaded || collisionMeshes.length === 0) return;

  const origin = yawObject.position.clone();
  rc.set(origin, new THREE.Vector3(0, -1, 0));
  rc.far = PLAYER_H + 0.5;

  const hits = rc.intersectObjects(collisionMeshes, false);
  if (hits.length > 0 && hits[0].distance <= PLAYER_H + 0.08) {
    yawObject.position.y = hits[0].point.y + PLAYER_H;
    if (playerVY < 0) { playerVY = 0; isOnGround = true; }
  } else {
    // Không có sàn → đang rơi
    if (playerVY >= 0) isOnGround = false;
  }
}

// Kiểm tra bẫy — dùng sphere overlap thay vì raycaster
function checkTraps() {
  if (isDead || devMode || !mapLoaded || trapMeshes.length === 0) return;

  // Cập nhật world matrix cho tất cả trap mesh
  trapMeshes.forEach(m => m.updateWorldMatrix(true, false));

  const playerPos = yawObject.position.clone();
  const playerBox = new THREE.Box3().setFromCenterAndSize(
    playerPos,
    new THREE.Vector3(PLAYER_RADIUS*2, PLAYER_H, PLAYER_RADIUS*2)
  );

  // Kiểm tra AABB overlap với từng bẫy
  for (const trap of trapMeshes) {
    const trapBox = new THREE.Box3().setFromObject(trap);
    if (playerBox.intersectsBox(trapBox)) {
      triggerDeath('trap: ' + trap.name);
      // Đánh dấu nếu chết do Trap_cua_002..006
      if (currentMap === MAP_2) {
        const tn = (trap.name || '').toLowerCase();
        if (tn.startsWith('trap_cua_00') && !tn.startsWith('trap_cua_001')) {
          const hit = m2cua2.traps.find(t => t.mesh === trap);
          if (hit) hit.killedBy = true;
        }
      }
      return;
    }
  }

  // Raycaster backup — 6 hướng + tia rơi
  const origin = yawObject.position.clone();
  const dirs = [
    new THREE.Vector3( 0,-1, 0),
    new THREE.Vector3( 0, 1, 0),
    new THREE.Vector3( 1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3( 0, 0, 1),
    new THREE.Vector3( 0, 0,-1),
  ];

  for (const d of dirs) {
    rc.set(origin, d);
    rc.far = PLAYER_RADIUS + 0.4;
    const hits = rc.intersectObjects(trapMeshes, false);
    if (hits.length > 0) {
      triggerDeath('trap: ' + hits[0].object.name);
      return;
    }
  }

  // Tia dài xuống khi đang rơi nhanh
  rc.set(origin, new THREE.Vector3(0, -1, 0));
  rc.far = Math.abs(playerVY) * 0.06 + 2.0;
  const falling = rc.intersectObjects(trapMeshes, false);
  if (falling.length > 0) {
    triggerDeath('trap (falling): ' + falling[0].object.name);
  }
}


// ═══════════════════════════════════════════════════════════
//  GAME LOOP
// ═══════════════════════════════════════════════════════════
// ── Earthquake effect khi tường nâng ──
let earthquakeTimer    = 0;
let earthquakeDuration = 0;
let earthquakeIntensity = 0;

function triggerEarthquake(duration, intensity) {
  earthquakeTimer    = duration;
  earthquakeDuration = duration;
  earthquakeIntensity = intensity;
}

let _eqOffX = 0, _eqOffY = 0;
let _eqNoiseX = 0, _eqNoiseY = 0; // smooth noise tránh Hz-dependent

function updateEarthquake(dt) {
  pitchObject.position.x -= _eqOffX;
  pitchObject.position.y -= _eqOffY;
  _eqOffX = 0;
  _eqOffY = 0;

  if (earthquakeTimer <= 0) return;

  earthquakeTimer -= dt;
  if (earthquakeTimer <= 0) {
    earthquakeTimer = 0;
    pitchObject.position.x = 0;
    pitchObject.position.y = 0;
    _eqNoiseX = 0;
    _eqNoiseY = 0;
    return;
  }

  const t   = earthquakeTimer / earthquakeDuration;
  const mag = earthquakeIntensity * t;

  // Lerp noise → tốc độ thay đổi tỉ lệ với dt, không phụ thuộc Hz màn hình
  const noiseSpeed = 18.0;
  _eqNoiseX += ((Math.random() - 0.5) * 2 - _eqNoiseX) * Math.min(noiseSpeed * dt, 1);
  _eqNoiseY += ((Math.random() - 0.5) * 2 - _eqNoiseY) * Math.min(noiseSpeed * dt, 1);

  _eqOffX = _eqNoiseX * mag;
  _eqOffY = _eqNoiseY * mag * 0.5;

  pitchObject.position.x += _eqOffX;
  pitchObject.position.y += _eqOffY;
}

// ── FPS counter ──
let _fpsFrames = 0, _fpsTime = 0, _fpsEl = null;
let _lastFrame = 0;
// Không cap FPS cứng — để browser tự sync với refresh rate màn hình
// dt được clamp 0.05s (20fps min) để game không bị ảnh hưởng dù Hz bao nhiêu
const FPS_CAP_MS = 0; // tắt cap cứng, dùng dt clamp thay thế

function updateFPS(dt) {
  _fpsFrames++;
  _fpsTime += dt;
  if (_fpsTime >= 0.5) {
    const fps = Math.round(_fpsFrames / _fpsTime);
    if (!_fpsEl) {
      _fpsEl = document.createElement('div');
      _fpsEl.style.cssText = `
        position:fixed;top:16px;left:20px;z-index:100;
        color:#0f0;font-family:monospace;font-size:13px;
        text-shadow:1px 1px 2px #000;pointer-events:none;
        background:rgba(0,0,0,0.4);padding:3px 8px;border-radius:4px;
      `;
      document.body.appendChild(_fpsEl);
    }
    _fpsEl.textContent = `FPS: ${fps}`;
    _fpsEl.style.color = fps < 30 ? '#f44' : fps < 50 ? '#fa0' : '#0f0';
    _fpsFrames = 0;
    _fpsTime   = 0;
  }
}

function gameLoop(ts = 0) {
  if (!gameRunning) return;
  requestAnimationFrame(gameLoop);
  setTrapState(isDead, paused, mapLoaded, triggerDeath);
  trapConfig.yaw = yaw;

  _lastFrame = ts;
  // dt clamp: tối đa 50ms (20fps) để game không bị glitch khi tab mất focus
  // Mọi Hz màn hình đều cho kết quả giống nhau vì mọi thứ nhân với dt
  const dt = Math.min(clock.getDelta(), 0.05);
  if (dt <= 0) return;
  updateFPS(dt);
  // Nếu màn hình Load chưa ẩn đi (!mouseReady), KHÔNG chạy bất kỳ logic, âm thanh hay bẫy nào hết, chỉ render tĩnh!
  if (!mouseReady) {
    composer ? composer.render() : renderer.render(scene, camera);
    return;
  }

  // Apply mouse delta 1 lần mỗi frame — luôn apply dù delta = 0
  const mDelta = consumeMouseDelta();
  yaw -= mDelta.x * 0.002;
  pitch -= mDelta.y * 0.002;
  pitch  = Math.max(-1.2, Math.min(1.2, pitch));
  yawObject.rotation.y   = yaw;
  pitchObject.rotation.x = pitch;

  const pState = updatePlayer(dt, keys, devMode, yaw, wasOnPlatform, wasJumping, mapLoaded, triggerDeath);
  wasOnPlatform = pState.wasOnPlatform;
  wasJumping = pState.wasJumping;

  checkTraps()
  updateTorches(dt);         // đuốc — CHUNG
  updateSmokePuffs(dt);      // khói — CHUNG
  updateEarthquake(dt);      // rung camera — CHUNG
  if (currentMap) currentMap.update(dt); // logic riêng từng map
  composer ? composer.render() : renderer.render(scene, camera);
}


// ═══════════════════════════════════════════════════════════
//  MAP SYSTEM
//  Mỗi map là 1 object: { init, update, reset, glbPath }
//  currentMap trỏ đến map đang chạy
// ═══════════════════════════════════════════════════════════
let currentMap = null;

// ── MAP 1 ──
const MAP_1 = {
  glbPath: '/model/map1.glb',

  init() {
    loadBlenderMap(this.glbPath);
  },

  update(dt) {
    // Logic riêng MAP 1
    updatePortal(dt);
    updateLootItems(dt);
    if (portalCooldown > 0) portalCooldown -= dt;
    checkPortalReveal();   // <--- THÊM VÀO ĐÂY
    checkPortalTeleport();
    updateFakePlatform(dt, wasOnPlatform);
    updateMovingTrap(dt);
    updateTrap5(dt);
    updateChest(dt);
    checkMovingTrapTrigger();
    checkWallTriggers();
    updateAnimWalls(dt);
    checkSpiderTrigger();
    updateSpider(dt);
    checkChestLook();
    checkTriggerBoxEnter();
  },

  reset() {
    resetMovingTrap();
    resetTrap5();
    resetAnimWalls();
    fullResetChest();
    resetFakePlatform();
    resetTorches();
    // Reset map-1 specific state
    collisionMeshes.length = 0;
    trapMeshes.length      = 0;
    animWalls.length       = 0;
    lootMeshes.length      = 0;
    smokePuffs.length      = 0;
    for (const k in portalMeshes) delete portalMeshes[k];
    portalLightMeshes.length = 0;
    for (const k in inventory)    delete inventory[k];
    allPortalUniforms.length = 0;
    portalUniforms = null;
    portalCooldown = 0;
    lootPrompt     = null;
    earthquakeTimer = 0;
    _eqOffX = 0; _eqOffY = 0;
    pitchObject.position.set(0, 0, 0);
  },
};

// ── MAP 2 (placeholder) ──

const MAP_2 = {
  glbPath: '/model/map2.glb',

  init() {
    loadBlenderMap(this.glbPath);
  },

  update(dt) {
    // Logic riêng MAP 2
    updatePortal(dt);
    updateChest(dt);
    checkChestLook();
    updateLootItems(dt);
    updateMap2Traps(dt);
    updateMap2Cua(dt);
    updateMap2Cua2(dt);
    if (portalCooldown > 0) portalCooldown -= dt;
    checkPortalReveal();   // <--- THÊM VÀO ĐÂY
    checkPortalTeleport();
  },

  reset() {
    collisionMeshes.length      = 0;
    trapMeshes.length           = 0;
    smokePuffs.length           = 0;
    portalLightMeshes.length    = 0;
    for (const k in portalMeshes) delete portalMeshes[k];
    resetTorches();
    fullResetMap2Traps();
    fullResetMap2Cua();
    fullResetMap2Cua2();
    fullResetChest();
    earthquakeTimer = 0;
    _eqOffX = 0; _eqOffY = 0;
    pitchObject.position.set(0, 0, 0);
  },
};

// ── Switch map ──
function loadMap(map) {
  if (currentMap) currentMap.reset();

  // Dọn scene — xóa object cũ trừ light và camera rig
  const toRemove = [];
  scene.traverse(obj => {
    if (obj === yawObject || obj === pitchObject || obj === camera) return;
    if (obj.isLight) return;
    if (obj.parent === scene) toRemove.push(obj);
  });
  toRemove.forEach(obj => scene.remove(obj));

  // Reset collision arrays — quan trọng để MAP_2 không dùng mesh cũ của MAP_1
  collisionMeshes.length = 0;
  trapMeshes.length      = 0;

  mapLoaded   = false;
  mouseReady  = false;
  currentMap  = map;
  map.init();
}
// main.js

function handleKeyDown(e) {
  if (!gameRunning) return;

  // ESC: Tạm dừng
  if (e.code === 'Escape') togglePause();

  // Key F: Mở rương
  if (e.code === 'KeyF' && !paused && chestPromptVisible) {
    toggleChest();
  }

  // Key C: Nhặt đồ
  if (e.code === 'KeyC' && !paused && !isDead && lootPrompt) {
    pickupLoot(lootPrompt);
  }

  // F3: Bật/Tắt Dev Mode
  if (e.code === 'F3') {
    e.preventDefault();
    devMode = !devMode;
    const el = document.getElementById('dev-badge');
    if (devMode) {
      if (!el) {
        const badge = document.createElement('div');
        badge.id = 'dev-badge';
        badge.style.cssText = `position:fixed;top:50px;left:50%;transform:translateX(-50%);background:rgba(0,200,0,0.5);color:#fff;padding:4px 12px;z-index:100;font-family:monospace;`;
        badge.textContent = "DEV MODE ON (F4: Map2, F5: Map1)";
        document.body.appendChild(badge);
      }
    } else if (el) el.remove();
  }

  // F4 & F5: Chuyển Map (Chỉ khi ở Dev Mode)[cite: 7]
  if (devMode) {
    if (e.code === 'F4') { e.preventDefault(); loadMap(MAP_2); }
    if (e.code === 'F5') { e.preventDefault(); loadMap(MAP_1); }
  }
}

function startGame() {
  // 1. CHỈ CẬP NHẬT GIAO DIỆN NHẸ NHÀNG (Đảm bảo tức thời)
  document.getElementById('menu').style.display       = 'none';
  document.getElementById('gameCanvas').style.display = 'block';
  document.getElementById('hud').style.display        = 'block';
  document.getElementById('particles').style.display  = 'none';
  showLoadingScreen(true); 

  // 2. KHỞI TẠO AUDIO (Cho tiếng click vang lên mượt mà)
  _initAudioCtx();
  preloadAudio();
  stopBGM();

  // 3. NÉM TOÀN BỘ PHẦN NẶNG VÀO TIMEOUT NGẮN (50ms)
  // 50ms là khoảng thời gian hoàn hảo để trình duyệt "thở", vẽ màn hình đen và xả tiếng click ra loa
  setTimeout(() => {
    // Bây giờ mới bắt đầu nặn ra WebGL và ánh sáng
    if (!renderer) {
      initRenderer();
      setupLights();
    }
    initInput(handleKeyDown);
    gameRunning = true;
    clock.start();

    const canvas = document.getElementById('gameCanvas');
    (canvas.requestPointerLock || canvas.mozRequestPointerLock).call(canvas);

    _currentLoadingSFX = playSFX('loadMap1', 0.7);
    loadMap(MAP_1);
    
    gameLoop();
  }, 50); 
}
// main.js

function togglePause() {
  // Hàm này chỉ làm nhiệm vụ "Bật/Tắt" biến trạng thái và giao diện
  paused = !paused;
  
  if (paused) {
    document.getElementById('pause-menu').classList.add('open');
    // KHÔNG gọi exitPointerLock ở đây vì trình duyệt đã tự làm khi bác bấm ESC rồi
  } else {
    resumeGame();
  }
}

function resumeGame() {
  paused = false;
  document.getElementById('pause-menu').classList.remove('open');
  
  // Chỉ khi người dùng chủ động nhấn "Tiếp tục" (một tương tác trực tiếp), 
  // trình duyệt mới cho phép khóa chuột trở lại.
  const canvas = document.getElementById('gameCanvas');
  if (canvas) {
    canvas.requestPointerLock(); 
  }
}

function backToMenu() {
  mouseReady = false;
  paused = gameRunning = false;
  document.getElementById('pause-menu').classList.remove('open');
  document.getElementById('gameCanvas').style.display = 'none';
  document.getElementById('hud').style.display        = 'none';
  document.getElementById('menu').style.display       = 'flex';
  document.getElementById('particles').style.display  = 'block';
  document.exitPointerLock();
  if (currentMap) { currentMap.reset(); currentMap = null; }
  respawn();
  playBGM('bgMenu', 0.4);
}


// ═══════════════════════════════════════════════════════════
//  EXPORT (bắt buộc vì dùng type="module")
// ═══════════════════════════════════════════════════════════
window.startGame    = startGame;
window.resumeGame   = resumeGame;
window.backToMenu   = backToMenu;
window.closeCredits = () => {
  const el = document.getElementById('credits-screen');
  if (el) el.style.display = 'none';
  backToMenu();
};
window.openIntro  = openIntro;
window.closeIntro = closeIntro;

// Gắn tiếng click cho tất cả button/a trong menu
document.addEventListener('click', e => {
  if (e.target.matches('button, a, [onclick], .menu-btn, .btn')) {
    playSFX('click', 0.6);
  }
});

// Nhạc menu khi trang load — cần interaction đầu tiên của user
document.addEventListener('pointerdown', function startMenuBGM() {
  playBGM('bgMenu', 0.4);
  document.removeEventListener('pointerdown', startMenuBGM);
}, { once: true });

document.addEventListener('pointerlockchange', () => {
  // Nếu chuột bị nhả ra (pointerLockElement === null) 
  // và game đang chạy, đồng thời chưa bị tạm dừng thì mới hiện Menu
  if (document.pointerLockElement === null && gameRunning && !isDead) {
    if (!paused) {
      paused = true;
      document.getElementById('pause-menu').classList.add('open');
      console.log('[System] Đã hiện Menu Pause do thoát Pointer Lock');
    }
  }
});