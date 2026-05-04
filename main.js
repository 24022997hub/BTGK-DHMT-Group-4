import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

// ═══════════════════════════════════════════════════════════
//  AUDIO SYSTEM
//  !! Đặt file .ogg vào cùng thư mục với main.js
//  !! Đổi tên file tại đây ↓
// ═══════════════════════════════════════════════════════════
// BASE_URL từ Vite — tự động đúng dù chạy localhost hay deploy lên subdirectory
const _BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const AUDIO_FILES = {
  bgMenu:      `${_BASE}/audio/bg_menu.ogg`,
  bgCredit:    `${_BASE}/audio/bg_credit.ogg`,
  click:       `${_BASE}/audio/click.ogg`,
  loadMap1:    `${_BASE}/audio/load_map1.ogg`,
  loadMap2:    `${_BASE}/audio/load_map2.ogg`,
  death:       `${_BASE}/audio/death.ogg`,
  deathScreen: `${_BASE}/audio/death_screen.ogg`,
  respawn:     `${_BASE}/audio/respawn.ogg`,
  portal:      `${_BASE}/audio/portal.ogg`,
  portalAppear:`${_BASE}/audio/portal_appear.ogg`,
  chestOpen:   `${_BASE}/audio/chest_open.ogg`,
  chestClose:  `${_BASE}/audio/chest_close.ogg`,
  loot:        `${_BASE}/audio/loot.ogg`,
  footstep:    `${_BASE}/audio/footstep.ogg`,
  torch:       `${_BASE}/audio/torch.ogg`,
  platformMove: `${_BASE}/audio/platform_move.ogg`,
  swoosh:      `${_BASE}/audio/swoosh.ogg`,
  wallRise:    `${_BASE}/audio/wall_rise.ogg`,
  spiderHiss:  `${_BASE}/audio/spider_hiss.ogg`,
  spiderAttack: `${_BASE}/audio/spider_attack.ogg`,
  lavaDeath:    `${_BASE}/audio/lava_death.ogg`,
  sawBlade1: `${_BASE}/audio/saw_blade_1.ogg`,
  sawBlade2: `${_BASE}/audio/saw_blade_2.ogg`,
};

const _audio = {};        // Cache thẻ Audio (chỉ dùng cho Nhạc nền BGM)
const _sfxBuffers = {};   // Cache AudioBuffer (Dùng cho tiếng động SFX - Độ trễ 0ms)
let _audioCtx = null;     // AudioContext
let _currentLoadingSFX = null; // <--- THÊM DÒNG NÀY VÀO ĐÂY ĐỂ CỨU TIẾNG LOAD MAP!

function _initAudioCtx() {
  if (_audioCtx) return;
  _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

// Giải mã file âm thanh ném thẳng vào RAM để gọi là kêu luôn
async function _preloadSFX(key) {
  if (!AUDIO_FILES[key] || _sfxBuffers[key]) return;
  try {
    const res = await fetch(AUDIO_FILES[key]);
    const arrayBuffer = await res.arrayBuffer();
    _initAudioCtx();
    const buffer = await _audioCtx.decodeAudioData(arrayBuffer);
    _sfxBuffers[key] = buffer;
  } catch (err) { console.error('[Audio] Lỗi load SFX:', key, err); }
}

function _getAudio(key) {
  if (!AUDIO_FILES[key]) return null;
  if (!_audio[key]) {
    const a = new Audio(AUDIO_FILES[key]);
    a.preload = 'auto';
    _audio[key] = a;
  }
  return _audio[key];
}

function preloadAudio() {
  Object.keys(AUDIO_FILES).forEach(k => {
    // Nhạc nền dài xài Audio thường, tiếng động ngắn xài Buffer 0ms
    if (k.startsWith('bg')) _getAudio(k);
    else _preloadSFX(k);
  });
}

// Phát SFX bằng Web Audio API (Thêm tham số loop + ngắt âm mềm)
function playSFX(key, volume = 1.0, speed = 1.0, loop = false) { 
  _initAudioCtx();
  if (_audioCtx.state === 'suspended') _audioCtx.resume();

  const buffer = _sfxBuffers[key];
  if (!buffer) {
    const a = new Audio(AUDIO_FILES[key]);
    a.volume = Math.max(0, Math.min(1, volume));
    a.playbackRate = speed; 
    a.loop = loop;
    a.play().catch(() => {});
    
    return { 
      pause: () => { 
        // Fade-out mềm cho Audio thường
        let v = a.volume;
        const fade = setInterval(() => {
          v -= 0.1;
          if (v <= 0) { a.pause(); clearInterval(fade); }
          else { a.volume = v; }
        }, 10);
      }, 
      setVolume: (v) => { a.volume = Math.max(0, Math.min(1, v)); },
      currentTime: 0 
    };
  }

  const source = _audioCtx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = speed; 
  source.loop = loop;
  
  const gainNode = _audioCtx.createGain();
  gainNode.gain.value = Math.max(0, Math.min(1, volume));

  source.connect(gainNode);
  gainNode.connect(_audioCtx.destination);
  source.start(0); 

  return {
    pause: () => { 
      try { 
        // Fade-out mềm cho Web Audio trong 50ms để triệt tiêu tiếng rè/tạch
        gainNode.gain.setTargetAtTime(0, _audioCtx.currentTime, 0.015);
        setTimeout(() => { try { source.stop(); } catch(e){} }, 50);
      } catch(e){} 
    },
    setVolume: (v) => { gainNode.gain.value = Math.max(0, Math.min(1, v)); },
    currentTime: 0
  };
}
// Phát nhạc nền (loop)
let _currentBG = null;
let _currentBGKey = null;
function playBGM(key, volume = 0.4, fadeDuration = 1.0) {
  if (_currentBGKey === key) return; // đang phát rồi
  _initAudioCtx();

  // Fade out nhạc cũ
  if (_currentBG) {
    const old = _currentBG;
    const startVol = old.volume;
    const startTime = performance.now();
    function fadeOut() {
      const t = (performance.now() - startTime) / (fadeDuration * 1000);
      if (t < 1) {
        old.volume = startVol * (1 - t);
        requestAnimationFrame(fadeOut);
      } else {
        old.pause();
        old.currentTime = 0;
      }
    }
    fadeOut();
  }

  if (!key) { _currentBG = null; _currentBGKey = null; return; }

  const a = _getAudio(key);
  if (!a) return;
  a.loop   = true;
  a.volume = 0;
  a.currentTime = 0;
  a.play().catch(() => {});
  _currentBG    = a;
  _currentBGKey = key;

  // Fade in
  const startTime = performance.now();
  function fadeIn() {
    const t = (performance.now() - startTime) / (fadeDuration * 1000);
    if (t < 1) {
      a.volume = volume * t;
      requestAnimationFrame(fadeIn);
    } else {
      a.volume = volume;
    }
  }
  fadeIn();
}

function stopBGM() { playBGM(null); }

// Tiếng bước chân — Cắt đuôi tiếng cũ để không bị lèm nhèm
let _footstepDist = 0;
let _lastFootstepAudio = null;
const FOOTSTEP_INTERVAL = 3.5; 

// THÊM BIẾN isRunning VÀO ĐÂY ↓
function updateFootstep(movedDist, onGround, isRunning) {
  if (!onGround || movedDist <= 0) return;
  _footstepDist += movedDist;
  
  if (_footstepDist >= FOOTSTEP_INTERVAL) {
    _footstepDist %= FOOTSTEP_INTERVAL;
    
    // Ép tắt luôn tiếng bước chân trước đó
    if (_lastFootstepAudio) {
      _lastFootstepAudio.pause();
    }
    
    // NẾU ĐANG CHẠY THÌ VOLUME = 0.7, ĐI BỘ THÌ 0.3 (M CÓ THỂ TỰ CHỈNH 2 SỐ NÀY)
    const vol = isRunning ? 0.5 : 0.3;
    _lastFootstepAudio = playSFX('footstep', vol);
  }
}

// ═══════════════════════════════════════════════════════════
//  TRAP ADVENTURE — main.js
// ═══════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────────────────
const SPEED         = 7;
const RUN_SPEED     = 12;
const JUMP_FORCE    = 13;
const GRAVITY       = -25;
const PLAYER_H      = 5;
const PLAYER_RADIUS = 0.35;

// Rơi xuống dưới mức này → chết
// Chỉnh thấp hơn đáy hố sâu nhất trong map của bạn
const DEATH_Y = -1000;

// Điểm spawn — đổi x,y,z cho đúng điểm đầu map
const SPAWN_X = 0;
const SPAWN_Y = PLAYER_H;
const SPAWN_Z = 0;

// ─────────────────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────────────────
let renderer, scene, camera, clock, composer;
let yawObject, pitchObject;
let keys        = {};
let yaw         = 0;
let pitch       = 0;
let playerVY    = 0;
let isOnGround  = false;
let paused      = false;
let gameRunning = false;
let isDead      = false;
let devMode     = false;
let mouseReady  = false;
let mapLoaded   = false;
let isTeleporting = false; // <--- THÊM BIẾN NÀY ĐỂ BÁO HIỆU ĐANG VẬN CÔNG DỊCH CHUYỂN

// ── INVENTORY & KEY-PORTAL ──
const inventory = {};          // { 'key_001': true, ... }
const portalMeshes      = {};  // { '001': mesh, ... }
const portalLightMeshes = [];  // Portal_light meshes, ẩn lúc đầu
const lootMeshes   = [];       // tất cả loot mesh từ Blender
let   lootPrompt   = null;
const LOOT_PICKUP_DIST    = 11.0;
const PORTAL_TELEPORT_DIST = 0.6; // <--- SỬA TỪ 3.0 THÀNH 0.6m
let   portalCooldown = 0;
// !! TODO: đổi toạ độ hoặc loadBlenderMap khi có map mới
const PORTAL_DEST = { x: 0, y: 2, z: -10 };

let collisionMeshes = [];
let trapMeshes      = [];

const rc = new THREE.Raycaster();

const _qY    = new THREE.Quaternion();
const _qX    = new THREE.Quaternion();
const _axisY = new THREE.Vector3(0, 1, 0);
const _axisX = new THREE.Vector3(1, 0, 0);


// ═══════════════════════════════════════════════════════════
//  TORCH FIRE SYSTEM
//  Nhận diện Torch_flame_xxx → PointLight + sprite lửa
// ═══════════════════════════════════════════════════════════
const torches = [];
const FLAME_Y_OFFSET   = 0.5;
const TORCH_SHOW_DIST  = 30;   // hiện sprite khi gần
const TORCH_LIGHT_DIST = 30;   // bật light

function makeFlameTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  // Gradient lửa to hơn, rõ hơn
  const g = ctx.createRadialGradient(64, 80, 4, 64, 72, 60);
  g.addColorStop(0,    'rgba(255,255,220,1)');
  g.addColorStop(0.15, 'rgba(255,200, 50,0.95)');
  g.addColorStop(0.35, 'rgba(255,100,  0,0.7)');
  g.addColorStop(0.6,  'rgba(200, 40,  0,0.3)');
  g.addColorStop(0.85, 'rgba(120, 10,  0,0.08)');
  g.addColorStop(1,    'rgba( 80,  0,  0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const _flameTex = makeFlameTex();

function initTorch(mesh) {
  // Mỗi đuốc có 2 mesh con (_1 và _2) — chỉ xử lý mesh đầu tiên (_1 hoặc không có suffix)
  const n = mesh.name.toLowerCase();
  if (n.endsWith('_2')) return; // bỏ qua mesh con thứ 2

  const wp = new THREE.Vector3();
  const obj = mesh.parent && mesh.parent.type !== 'Scene' ? mesh.parent : mesh;
  obj.updateWorldMatrix(true, false);
  wp.x = obj.matrixWorld.elements[12];
  wp.y = obj.matrixWorld.elements[13];
  wp.z = obj.matrixWorld.elements[14];

  console.log('[Torch] Init:', mesh.name, '| pos:', wp.x.toFixed(1), wp.y.toFixed(1), wp.z.toFixed(1));

  const fx = wp.x;
  const fy = wp.y + FLAME_Y_OFFSET;
  const fz = wp.z;

  // Không tạo light riêng — dùng shared lights trong updateTorches
  const sprites = [];
  const sizes   = [0.6];
  const offY    = [0.1];

  for (let i = 0; i < sizes.length; i++) {
    const mat = new THREE.SpriteMaterial({
      map:         _flameTex,
      transparent: true,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending,
      opacity:     0.9,
    });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(sizes[i], sizes[i] * 1.6, 1);
    sp.position.set(fx, fy + offY[i], fz);
    sp.visible = false;
    sp.renderOrder = 999; // KHẮC PHỤC LỖI Z-SORTING: Đảm bảo hạt lửa vẽ sau cùng
    sp.frustumCulled = false;
    scene.add(sp);
    sprites.push({
      sprite:   sp,
      baseX: fx, baseY: fy + offY[i], baseZ: fz,
      phase:    Math.random() * Math.PI * 2,
      baseSize: sizes[i],
      baseOp:   0.9,
    });
  }

  torches.push({
    sprites,
    basePos: new THREE.Vector3(fx, fy, fz),
    timer:   Math.random() * 10,
    visible: false,
  });
}

// Shared lights — chỉ 2 light dùng chung cho tất cả đuốc
// GPU chỉ tính 2 light thay vì 20
let _sharedLights = null;
const MAX_ACTIVE_LIGHTS = 2;

function getSharedLights() {
  if (_sharedLights) return _sharedLights;
  _sharedLights = [];
  for (let i = 0; i < MAX_ACTIVE_LIGHTS; i++) {
    const l = new THREE.PointLight(0xff8800, 0, 30);
    l.castShadow = false;
    scene.add(l);
    _sharedLights.push(l);
  }
  return _sharedLights;
}

// Khai báo biến bấm giờ (Nằm NGAY TRÊN hàm updateTorches)
let _lastTorchIgniteTime = 0;

function updateTorches(dt) {
  if (!yawObject) return;
  const camPos = yawObject.position;
  const lights = getSharedLights();

  if (lights.length < MAX_ACTIVE_LIGHTS) {
    console.warn('[Torch] Shared lights thiếu:', lights.length);
  }

  torches.forEach(t => { 
    t.timer += dt; 
    t._isLitNow = false; 
  });

  const nearby = torches
    .map(t => ({ t, dist: camPos.distanceTo(t.basePos) }))
    .filter(x => x.dist < TORCH_LIGHT_DIST)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, MAX_ACTIVE_LIGHTS);

  const _t = performance.now() / 1000;
  const sharedFlicker =
    1.0
    + Math.sin(_t * 7.3)  * 0.15
    + Math.sin(_t * 13.1) * 0.1
    + Math.sin(_t * 23.7) * 0.05;

  // Lấy thời gian thực của hệ thống (tính bằng mili-giây)
  const now = performance.now();

  for (let i = 0; i < lights.length; i++) {
    const light = lights[i];
    const entry = nearby[i];
    
    if (!entry) {
      light.intensity = 0;
      continue;
    }
    
    const t = entry.t;
    t._isLitNow = true;

    if (!t._wasLitLastFrame) {
      // 🔴 LUẬT THÉP: Lần kêu trước phải cách đây ít nhất 500ms (0.5 giây) thì mới được kêu tiếp!
      if (now - _lastTorchIgniteTime > 500) {
        let vol = 1.0 - (entry.dist / TORCH_LIGHT_DIST);
        let finalVol = Math.max(0.4, Math.min(1.0, vol + 0.2)); 
        playSFX('torch', finalVol); 
        
        _lastTorchIgniteTime = now; // Lưu lại thời khắc vừa phát âm thanh
      }
    }

    light.intensity = 30.0 * sharedFlicker;
    light.position.set(t.basePos.x, t.basePos.y + 0.3, t.basePos.z);
    light.distance = 40;
  }

  torches.forEach(t => { t._wasLitLastFrame = t._isLitNow; });

  torches.forEach(t => {
    const dist = camPos.distanceTo(t.basePos);
    const near = dist < TORCH_SHOW_DIST;

    if (near !== t.visible) {
      t.visible = near;
      t.sprites.forEach(s => { s.sprite.visible = near; });
    }

    if (!near) return;

    t.sprites.forEach((s, i) => {
      const wX = Math.sin(t.timer * 4.5 + s.phase)           * 0.07;
      const wY = Math.abs(Math.sin(t.timer * 3.2 + s.phase)) * 0.09;
      s.sprite.position.set(s.baseX + wX, s.baseY + wY, s.baseZ);
      const sc = s.baseSize * (0.9 + Math.sin(t.timer * 6.5 + s.phase + i) * 0.1);
      s.sprite.scale.set(sc, sc * 1.6, 1);
      s.sprite.material.opacity = s.baseOp + Math.sin(t.timer * 10.0 + s.phase) * 0.08;
    });
  });
}

// Dọn torches khi switch map
function resetTorches() {
  torches.forEach(t => {
    t.sprites.forEach(s => { scene.remove(s.sprite); s.sprite.material.dispose(); });
    // Không xóa light của từng đuốc vì giờ dùng shared lights
  });
  torches.length = 0;
  // Reset shared lights
  if (_sharedLights) {
    _sharedLights.forEach(l => { l.intensity = 0; });
  }
}


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
//  MOVING TRAP (Trap_004 — di chuyển theo trục Z âm)
//  Đặt tên object trong Blender: Trap_004
//
//  Cơ chế: Khi người chơi đi qua Z = MOVING_TRAP_TRIGGER_Z
//  thì bẫy bắt đầu di chuyển về phía Z âm với tốc độ MOVING_TRAP_SPEED
// ═══════════════════════════════════════════════════════════
let movingTrapMeshes    = [];    // tất cả mesh của Trap_004
let movingTrapActive    = false; // đang di chuyển chưa
let movingTrapTriggered = false; // đã trigger chưa
let movingTrapDistMoved = 0;     // khoảng cách đã di chuyển (m)
let trap4HideTimer      = null;  // timer ẩn Trap4
let movingTrapSwooshPlayed = false;

// ── Chỉnh các giá trị này ──
const MOVING_TRAP_TRIGGER_Z = -51.0;  // người chơi qua Z này → bẫy bắt đầu chạy
const MOVING_TRAP_SPEED     =  30.0;   // tốc độ di chuyển (m/s)
const MOVING_TRAP_TRAVEL    = 102.0;  // tổng quãng đường (m): từ -143 đến -41

function initMovingTrap(mesh) {
  mesh.userData.originZ = mesh.position.z;
  movingTrapMeshes.push(mesh);

  // Debug: hiện wireframe box
  // const box = new THREE.Box3().setFromObject(mesh);
  // const size = new THREE.Vector3();
  // const center = new THREE.Vector3();
  // box.getSize(size);
  // box.getCenter(center);
  // const helper = new THREE.Mesh(
  //   new THREE.BoxGeometry(size.x, size.y, size.z),
  //   new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true, depthTest: false })
  // );
  // helper.position.copy(center);
  // scene.add(helper);
  // mesh.userData.debugBox = helper;

  console.log('[MovingTrap] Init:', mesh.name, 'tại Z =', mesh.position.z);
}

function updateMovingTrap(dt) {
  if (movingTrapMeshes.length === 0 || !movingTrapActive) return;
  // CHECK KHOẢNG CÁCH CHO TRAP 004:
  if (!movingTrapSwooshPlayed && movingTrapMeshes.length > 0) {
    const dist = yawObject.position.distanceTo(movingTrapMeshes[0].position);
    if (dist <= 20.0) { // Cách 30m (đúng 1s trước va chạm) -> Hú lên!
      playSFX('swoosh', 1.0);
      movingTrapSwooshPlayed = true;
    }
  }

  const remaining = MOVING_TRAP_TRAVEL - movingTrapDistMoved;
  const step = Math.min(MOVING_TRAP_SPEED * dt, remaining);
  movingTrapDistMoved += step;

  movingTrapMeshes.forEach(mesh => {
    mesh.position.z += step;
    mesh.updateWorldMatrix(true, false);
    // Update debug box
    if (mesh.userData.debugBox) {
      mesh.userData.debugBox.position.z += step;
    }
  });

  if (movingTrapDistMoved >= MOVING_TRAP_TRAVEL) {
    movingTrapActive = false;
    // Lưu timer để có thể hủy khi respawn
    trap4HideTimer = setTimeout(() => {
      trap4HideTimer = null;
      movingTrapMeshes.forEach(mesh => { mesh.visible = false; });
      trapMeshes = trapMeshes.filter(m => !movingTrapMeshes.includes(m));
      console.log('[MovingTrap] Bẫy biến mất + tắt collision');
      if (!isDead) activateTrap5();
    }, 1000);
    console.log('[MovingTrap] Dừng sau', MOVING_TRAP_TRAVEL, 'm');
  }
}

function checkMovingTrapTrigger() {
  if (movingTrapMeshes.length === 0 || movingTrapTriggered || isDead || !mapLoaded) return;

  // Trigger khi người chơi đi qua Z = MOVING_TRAP_TRIGGER_Z
  if (yawObject.position.z <= MOVING_TRAP_TRIGGER_Z) {
    movingTrapTriggered = true;
    movingTrapActive    = true;
    console.log('[MovingTrap] Triggered! Người chơi tại Z =', yawObject.position.z.toFixed(2));
  }
}

function resetMovingTrap() {
  // Hủy timer ẩn bẫy → ngăn Trap5 kích hoạt sau respawn
  if (trap4HideTimer) {
    clearTimeout(trap4HideTimer);
    trap4HideTimer = null;
  }
  movingTrapMeshes.forEach(mesh => {
    mesh.position.z  = mesh.userData.originZ;
    mesh.visible     = true;
    mesh.updateWorldMatrix(true, false);
  });
  // Thêm lại vào trapMeshes nếu đã bị xóa
  movingTrapMeshes.forEach(mesh => {
    if (!trapMeshes.includes(mesh)) trapMeshes.push(mesh);
  });
  movingTrapActive    = false;
  movingTrapTriggered = false;
  movingTrapSwooshPlayed = false;
  movingTrapDistMoved = 0;
}


// ═══════════════════════════════════════════════════════════
//  TRAP_005 — di chuyển theo Z âm, ngược Trap_004
//  Kích hoạt khi Trap_004 biến mất
//  Vị trí đầu: Z = 3.45 → dừng ở Z = -160
//  Quãng đường: 3.45 - (-160) = 163.45m
// ═══════════════════════════════════════════════════════════
let trap5Meshes    = [];
let trap5Active    = false;
let trap5DistMoved = 0;
let trap5SwooshPlayed = false;

const TRAP5_SPEED  = 13.5;    // tốc độ (m/s)
const TRAP5_TRAVEL = 164;  // tổng quãng đường (m)

function initTrap5(mesh) {
  mesh.userData.originZ = mesh.position.z;
  trap5Meshes.push(mesh);
  console.log('[Trap5] Init:', mesh.name, 'tại Z =', mesh.position.z);
}

function activateTrap5() {
  if (trap5Meshes.length === 0 || trap5Active) return;
  trap5Active = true;
  console.log('[Trap5] Kích hoạt!');
}

function updateTrap5(dt) {
  if (trap5Meshes.length === 0 || !trap5Active) return;

  // CHECK KHOẢNG CÁCH CHO TRAP 005:
  if (!trap5SwooshPlayed && trap5Meshes.length > 0) {
    const dist = yawObject.position.distanceTo(trap5Meshes[0].position);
    if (dist <= 15.0) { // Cách 15m -> Hú lên!
      playSFX('swoosh', 1.0);
      trap5SwooshPlayed = true;
    }
  }

  const remaining = TRAP5_TRAVEL - trap5DistMoved;
  const step = Math.min(TRAP5_SPEED * dt, remaining);
  trap5DistMoved += step;

  // Di chuyển về Z âm (ngược Trap_004)
  trap5Meshes.forEach(mesh => {
    mesh.position.z -= step;
    mesh.updateWorldMatrix(true, false);
  });

  if (trap5DistMoved >= TRAP5_TRAVEL) {
    trap5Active = false;
    console.log('[Trap5] Đã đến Z = -160');
  }
}

function resetTrap5() {
  trap5Meshes.forEach(mesh => {
    mesh.position.z = mesh.userData.originZ;
    mesh.visible    = true;
    mesh.updateWorldMatrix(true, false);
  });
  trap5Active    = false;
  trap5SwooshPlayed = false;
  trap5DistMoved = 0;
  // Thêm lại vào trapMeshes nếu đã bị xóa
  trap5Meshes.forEach(mesh => {
    if (!trapMeshes.includes(mesh)) trapMeshes.push(mesh);
  });
}

// ═══════════════════════════════════════════════════════════
//  CHEST TRAP
//  Mesh: Chest_box_1..5 (thân) + Chest_lid_1..5 (nắp)
//  Nhìn vào chest → hiện [F] Mo → bấm F → nắp xoay, hehe, đẩy X
// ═══════════════════════════════════════════════════════════
let chestLidMeshes     = [];    // tất cả mesh lid
let chestBoxMeshes     = [];    // tất cả mesh box (dùng detect nhìn)
let chestOpened        = false;
let chestOpening       = false;
let chestClosing       = false;
let chestLidAngle      = 0;
let chestPromptVisible = false;
let chestKnockbackVX   = 0;
let chestKnockbackDir  = 0;

const CHEST_INTERACT_DIST   = 5.0;  // khoảng cách hiện [F]
const CHEST_KNOCKBACK_SPEED = 90.0;  // lực đẩy ban đầu (m/s)

function initChest(mesh) {
  const n = (mesh.name || '').toLowerCase();
  // Check cả tên parent vì Ctrl+J có thể tạo tên như Chest_box_push_1, _2...
  const parentN = (mesh.parent?.name || '').toLowerCase();
  const hasPush = n.includes('push') || parentN.includes('push');

  if (n.startsWith('chest_lid')) {
    mesh.userData.originRotX = mesh.rotation.x;
    mesh.userData.originRotY = mesh.rotation.y;
    mesh.userData.originRotZ = mesh.rotation.z;
    mesh.userData.hasPush    = hasPush;
    chestLidMeshes.push(mesh);
    console.log('[Chest] Lid:', mesh.name, '| push:', hasPush);
  }
  if (n.startsWith('chest_box')) {
    mesh.userData.hasPush = hasPush;
    chestBoxMeshes.push(mesh);
    console.log('[Chest] Box:', mesh.name, '| push:', hasPush);
  }
}

function showChestPrompt(show) {
  chestPromptVisible = show;
  let el = document.getElementById('chest-prompt');
  if (show) {
    const action = chestOpened ? 'Đóng' : 'Mở';
    if (!el) {
      el = document.createElement('div');
      el.id = 'chest-prompt';
      el.style.cssText = `
        position:fixed;bottom:30%;left:50%;transform:translateX(-50%);
        display:flex;align-items:center;gap:12px;
        background:rgba(0,0,0,0.82);
        border:1px solid rgba(255,255,255,0.18);
        border-top:1px solid rgba(255,255,255,0.35);
        border-radius:12px;padding:12px 24px;pointer-events:none;z-index:50;
        backdrop-filter:blur(12px);
        box-shadow:0 8px 32px rgba(0,0,0,0.5);
        font-family:'Segoe UI',sans-serif;
      `;
      document.body.appendChild(el);
    }
    el.innerHTML = `
      <span style="
        background:linear-gradient(135deg,#ffffff22,#ffffff08);
        border:1.5px solid rgba(255,255,255,0.55);
        border-bottom:3px solid rgba(255,255,255,0.15);
        border-radius:7px;padding:3px 12px;font-weight:800;
        font-size:14px;letter-spacing:1px;color:#fff;
        text-shadow:0 1px 4px rgba(0,0,0,0.8);
      ">F</span>
      <span style="font-size:13px;letter-spacing:2px;color:rgba(255,255,255,0.85);">
        ${action} Rương
      </span>
    `;
    el.style.display = 'flex';
  } else if (!show && el) {
    el.remove();
  }
}

function showHeheImage() {
  let el = document.getElementById('hehe-overlay');
  if (el) return;
  el = document.createElement('div');
  el.id = 'hehe-overlay';
  el.innerHTML = '<div class="hehe-text">hehe :))</div>';
  document.body.appendChild(el);
  setTimeout(function() { if (el && el.parentNode) el.remove(); }, 2000);
}

function openChest() {
  playSFX('chestOpen', 0.8, 2);
  if (chestOpened || chestOpening || chestClosing || chestLidMeshes.length === 0) return;
  chestOpening = true;
  // showHeheImage(); // đã bỏ
  const hasPush = chestBoxMeshes.some(m => m.userData.hasPush) ||
                  chestLidMeshes.some(m => m.userData.hasPush);
  if (hasPush) {
    chestKnockbackDir = Math.sin(yaw) > 0 ? -1 : 1;
    chestKnockbackVX  = CHEST_KNOCKBACK_SPEED;
    console.log('[Chest] Mở! Đẩy =', chestKnockbackDir);
  } else {
    chestKnockbackVX = 0;
    console.log('[Chest] Mở (không đẩy)');
  }
}

function closeChest() {
  playSFX('chestClose', 0.7, 2);
  if (!chestOpened || chestOpening || chestClosing) return;
  chestClosing = true;
  chestOpened  = false;
  console.log('[Chest] Dong!');
}

function toggleChest() {
  if (chestOpened) closeChest();
  else openChest();
}

function checkChestLook() {
  if (chestBoxMeshes.length === 0 || chestOpening || chestClosing || !mapLoaded) return;

  const allChestMeshes = [...chestBoxMeshes, ...chestLidMeshes];

  // Tìm mesh gần nhất (box hoặc lid)
  let nearest = null;
  let nearDist = Infinity;
  allChestMeshes.forEach(mesh => {
    mesh.updateWorldMatrix(true, false);
    const wp = new THREE.Vector3();
    mesh.getWorldPosition(wp);
    const dx = yawObject.position.x - wp.x;
    const dz = yawObject.position.z - wp.z;
    const d  = Math.sqrt(dx*dx + dz*dz);
    if (d < nearDist) { nearDist = d; nearest = mesh; }
  });

  if (!nearest || nearDist > CHEST_INTERACT_DIST) {
    showChestPrompt(false);
    return;
  }

  // Raycaster check có đang nhìn vào không (cả box lẫn lid)
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  rc.set(yawObject.position, dir);
  rc.far = CHEST_INTERACT_DIST;
  const hits = rc.intersectObjects(allChestMeshes, false);
  showChestPrompt(hits.length > 0);
}

function updateChest(dt) {
  // Xoay nắp
  if (chestOpening && chestLidMeshes.length > 0) {
    chestLidAngle += dt * 3.0;
    if (chestLidAngle >= Math.PI / 2) {
      chestLidAngle = Math.PI / 2;
      chestOpening  = false;
      chestOpened   = true;
      spawnLootFromChest();
    }
    chestLidMeshes.forEach(m => { m.rotation.x = (m.userData.originRotX || 0) + chestLidAngle; });
  }
  if (chestClosing && chestLidMeshes.length > 0) {
    chestLidAngle -= dt * 3.0;
    if (chestLidAngle <= 0) {
      chestLidAngle = 0;
      chestClosing  = false;
    }
    chestLidMeshes.forEach(m => { m.rotation.x = (m.userData.originRotX || 0) + chestLidAngle; });
  }
  // Knockback giảm dần
  if (Math.abs(chestKnockbackVX) > 0.01) {
    yawObject.position.z += chestKnockbackDir * chestKnockbackVX * dt;
    chestKnockbackVX  *= 0.85;
    if (Math.abs(chestKnockbackVX) < 0.01) chestKnockbackVX = 0;
  }
}

function resetChest() {
  chestLidMeshes.forEach(m => { m.rotation.x = m.userData.originRotX || 0; });
  chestOpened   = false;
  chestOpening  = false;
  chestClosing  = false;
  chestLidAngle = 0;
  chestKnockbackVX = 0;
  // Ẩn loot lại
  lootMeshes.forEach(m => { m.visible = false; });
  showChestPrompt(false);
  showLootPrompt(null);
  lootPrompt = null;
  const el = document.getElementById('hehe-overlay');
  if (el) el.remove();
}

function fullResetChest() {
  resetChest();
  chestLidMeshes.length = 0;
  chestBoxMeshes.length = 0;
  lootMeshes.length     = 0;
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

const WALL_RISE_AMOUNT = 20.0;  // nâng lên bao nhiêu đơn vị Y
const WALL_RISE_SPEED  =  5.0;  // tốc độ nâng (m/s)

// wall_001: nâng khi X >= 8.5
// wall_002: nâng khi Z <= -163.5
const WALL_CONFIGS = {
  'animate_wall_001': { checkX: true,  triggerXMin: 8.5,   checkZ: false, triggerZ: 9999,   smokeAxis: 'Z', smokeFlip: false  },
  'animate_wall_002': { checkX: false, triggerXMin: -9999, checkZ: true,  triggerZ: -163.5, smokeAxis: 'X', smokeFlip: true },
};

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
//  TRAP SPIDER
//  Blender: Trap_spider hoặc Trap_spider_*
//  Nhân vật đến gần → nhện xoay góc bay rồi lao về phía nhân vật
// ═══════════════════════════════════════════════════════════
let spiderMeshes    = [];
let spiderState     = 'idle'; // idle | flying | onwall | returning | done
let spiderTargetZ   = 0;      // Z nhân vật lúc qua X=100 → nhện bay về chỗ đó
let spiderHissPlayed = false; //

const SPIDER_TRIGGER_DIST   = 80.0;
const SPIDER_FLY_SPEED      = 100.0;
const SPIDER_STOP_X         = 10;
const SPIDER_RETURN_TRIG_X  = 100.0;  // nhân vật qua X này → nhện bay về
// Góc bay lần 1: (0, 90°, 0)
const SPIDER_FLY_ROT  = { x: 0, y:  Math.PI / 2, z: 0 };
// Góc chạm tường
const SPIDER_HIT_ROT  = { x: Math.PI / 2, y: 0, z: -Math.PI / 2 };
// Góc bay về: (0, -90°, 0)
const SPIDER_BACK_ROT = { x: 0, y: -Math.PI / 2, z: 0 };

function initSpider(mesh) {
  mesh.userData.originPos = mesh.position.clone();
  mesh.userData.originRot = { x: mesh.rotation.x, y: mesh.rotation.y, z: mesh.rotation.z };
  spiderMeshes.push(mesh);
  console.log('[Spider] Init:', mesh.name);
}

function getSpiderCenter() {
  if (spiderMeshes.length === 0) return new THREE.Vector3();
  const c = new THREE.Vector3();
  spiderMeshes.forEach(m => {
    const wp = new THREE.Vector3();
    m.getWorldPosition(wp);
    c.add(wp);
  });
  return c.divideScalar(spiderMeshes.length);
}

function checkSpiderTrigger() {
  if (!mapLoaded || spiderMeshes.length === 0) return;

  // Trigger lần 1: đến gần → bay đến tường
  if (spiderState === 'idle') {
    const center = getSpiderCenter();
    const dx = yawObject.position.x - center.x;
    const dz = yawObject.position.z - center.z;
    if (Math.sqrt(dx*dx + dz*dz) <= SPIDER_TRIGGER_DIST) {
      spiderState = 'flying';
      spiderMeshes.forEach(m => {
        m.rotation.x = SPIDER_FLY_ROT.x;
        m.rotation.y = SPIDER_FLY_ROT.y;
        m.rotation.z = SPIDER_FLY_ROT.z;
      });
      console.log('[Spider] Bay lần 1!');
    }
  }

  // Trigger lần 2: nhân vật qua X >= 100 → nhện bay về chỗ nhân vật
  if (spiderState === 'onwall' && yawObject.position.x >= SPIDER_RETURN_TRIG_X) {
    // Lưu Z nhân vật tại thời điểm này làm mục tiêu
    spiderTargetZ = yawObject.position.z;
    // Dịch nhện về đúng Z đó ngay lập tức (chỉ thay Z, giữ X ở tường)
    spiderMeshes.forEach(m => {
      m.position.z  = spiderTargetZ;
      m.rotation.x  = SPIDER_BACK_ROT.x;
      m.rotation.y  = SPIDER_BACK_ROT.y;
      m.rotation.z  = SPIDER_BACK_ROT.z;
      m.updateWorldMatrix(true, false);
    });
    spiderState = 'returning';
    console.log('[Spider] Bay về! Target Z =', spiderTargetZ.toFixed(2));
  }
}

function updateSpider(dt) {
  if (spiderMeshes.length === 0) return;
  // Chỉ đo khi nhện đang bay (lần 1) hoặc đang lao về (lần 2)
  if (spiderState === 'flying' || spiderState === 'returning') {
    if (!spiderHissPlayed) {
      const sp = spiderMeshes[0].position;
      const px = yawObject.position.x;
      const py = yawObject.position.y;
      const pz = yawObject.position.z;
      // Tính khoảng cách 3D từ nhện đến người chơi
      const dist = Math.sqrt((px-sp.x)**2 + (py-sp.y)**2 + (pz-sp.z)**2);
      
      // Khoảng cách kích hoạt: 25 mét (Tốc độ 100m/s -> 0.25s là tới nơi)
      if (dist <= 25.0) {
        if (spiderState === 'flying') {
          playSFX('spiderHiss', 1.0);   // Pha 1: Bay ngang -> Khè
        } else if (spiderState === 'returning') {
          playSFX('spiderAttack', 1.2); // Pha 2: Lao vào mặt -> Gầm to hơn tí (vol 1.2)
        }
        spiderHissPlayed = true; // Kêu rồi thì khóa mõm lại
      }
    }
  }
  if (spiderState === 'flying') {
    const step = SPIDER_FLY_SPEED * dt;
    spiderMeshes.forEach(m => {
      m.position.x -= step;
      m.position.y  = m.userData.originPos.y - 10;
      m.updateWorldMatrix(true, false);
    });

    // Chạm nhân vật → chết
    const center = getSpiderCenter();
    const dx = yawObject.position.x - center.x;
    const dy = yawObject.position.y - center.y;
    const dz = yawObject.position.z - center.z;
    if (Math.sqrt(dx*dx + dy*dy + dz*dz) < 1.5) {
      spiderState = 'idle';
      triggerDeath('spider');
      return;
    }

    // Chạm tường → dừng, xoay HIT_ROT, chờ nhân vật qua X
    if (spiderMeshes[0].position.x <= SPIDER_STOP_X) {
      spiderMeshes.forEach(m => {
        m.position.x = SPIDER_STOP_X;
        m.position.y = m.userData.originPos.y;
        m.rotation.x = SPIDER_HIT_ROT.x;
        m.rotation.y = SPIDER_HIT_ROT.y;
        m.rotation.z = SPIDER_HIT_ROT.z;
        m.updateWorldMatrix(true, false);
      });
      spiderState = 'onwall';
      spiderHissPlayed = false;
      console.log('[Spider] Chạm tường — chờ nhân vật qua X =', SPIDER_RETURN_TRIG_X);
    }

  } else if (spiderState === 'returning') {
    const step    = SPIDER_FLY_SPEED * dt;
    const originX = spiderMeshes[0].userData.originPos.x;

    spiderMeshes.forEach(m => {
      m.position.x += step;
      m.position.y  = m.userData.originPos.y - 10;
      m.position.z  = spiderTargetZ;  // bay đến Z nhân vật đứng lúc trigger
      m.updateWorldMatrix(true, false);
    });

    // Chạm nhân vật khi bay về → chết
    const sp = spiderMeshes[0].position;
    const dx = yawObject.position.x - sp.x;
    const dy = yawObject.position.y - sp.y;
    const dz = yawObject.position.z - sp.z;
    if (Math.sqrt(dx*dx + dy*dy + dz*dz) < 3.0) {
      spiderState = 'done';
      triggerDeath('spider');
      return;
    }

    if (spiderMeshes[0].position.x >= originX) {
      spiderMeshes.forEach(m => {
        m.position.copy(m.userData.originPos);
        m.rotation.x = m.userData.originRot.x;
        m.rotation.y = m.userData.originRot.y;
        m.rotation.z = m.userData.originRot.z;
        m.updateWorldMatrix(true, false);
      });
      spiderState = 'done';
      console.log('[Spider] Về vị trí ban đầu — kết thúc');
    }
  }
}

function resetSpider() {
  spiderMeshes.forEach(m => {
    m.position.copy(m.userData.originPos);
    m.rotation.x = m.userData.originRot.x;
    m.rotation.y = m.userData.originRot.y;
    m.rotation.z = m.userData.originRot.z;
    m.updateWorldMatrix(true, false);
  });
  spiderState = 'idle';
  spiderHissPlayed = false;
}







// ═══════════════════════════════════════════════════════════
//  MOVING PLATFORM (fake hint trap)
//  Đặt tên object trong Blender: Platform_fake
//
//  Cơ chế 3 lần:
//  Lần 1: plate dịch PHẢI 3m → người chơi rơi → chết
//  Lần 2: plate về chỗ cũ, HIỆN VIỀN gợi ý ở vị trí lần 1
//          nhưng thật ra plate dịch XA HƠN (6m) → chết lần 2
//  Lần 3: plate dịch vào đúng vị trí lần 2 (6m) → an toàn
// ═══════════════════════════════════════════════════════════
let fakePlatform      = null;   // THREE.Mesh của plate
let fakePlatformOriginX = 0;    // X gốc của plate
let fakePlatformAttempt = 0;    // số lần đã kích hoạt (0,1,2,3)
let fakePlatformMoving  = false;
let fakePlatformTargetX = 0;
let hintOutline         = null; // viền gợi ý (LineSegments)
let wasOnPlatform       = false;
let wasJumping          = false;
let wasInTriggerBox     = false;  // frame trước có trong trigger box không

// Khoảng cách tối đa từ nhân vật đến plate để trigger (mét)
// Trigger zone: vùng box trước plate — người chơi bước vào + nhảy → trigger
// Chỉnh các giá trị này cho khớp với vị trí plate trong map của bạn:
// TRIGGER_MIN/MAX là offset so với vị trí gốc của plate (fakePlatformOriginX)
// Ví dụ plate ở X=3, người chơi đứng phía X âm để nhảy vào:
//   TRIGGER_X_MIN = -5  (từ X=3-5 = -2)
//   TRIGGER_X_MAX =  0  (đến X=3+0 = 3, tức là ngay mép plate)
//   TRIGGER_Z_MIN/MAX bao phủ chiều rộng đường đi
const TRIGGER_X_MIN = -1.0;  // bao X từ 1.5 đến 9.5
const TRIGGER_X_MAX =  5.0;
const TRIGGER_Z_MIN = -1.0;  // phía sau plate
const TRIGGER_Z_MAX =  2.0;  // phía người chơi đứng nhảy
const TRIGGER_Y_MAX =  10.0;

// ── Cơ chế 3 lần ──
// Lần 1: nhảy → plate dịch 2m → chết
// Lần 2: respawn → viền xuất hiện ở +2m → nhảy vào → plate dịch 3m → chết
// Lần 3: respawn → viền vẫn ở +2m → nhảy vào → plate dịch 2m → an toàn
// Lần 4+: reset lại từ lần 1
const PLATFORM_HINT_OFFSET = 2.0;  // viền luôn cố định ở +2m
const PLATFORM_SHIFT_1     = 2.0;  // lần 1: dịch 2m → chết
const PLATFORM_SHIFT_2     = 4.0;  // lần 2: dịch 3m → chết (bẫy)
const PLATFORM_SHIFT_3     = 4.0;  // lần 3: dịch 2m → an toàn
const PLATFORM_SPEED       = 50.0;  // tốc độ di chuyển (m/s)

let triggerBoxHelper = null;

function initFakePlatform(mesh) {
  fakePlatform        = mesh;
  fakePlatformOriginX = mesh.position.x;
  fakePlatformAttempt = 0;
  fakePlatformMoving  = false;
  console.log('[FakePlatform] Init tại X =', fakePlatformOriginX);
}

function createHintOutline(targetX) {
  if (hintOutline) { scene.remove(hintOutline); hintOutline = null; }
  if (!fakePlatform) return;

  const box  = new THREE.Box3().setFromObject(fakePlatform);
  const size = new THREE.Vector3();
  box.getSize(size);

  const geo = new THREE.EdgesGeometry(
    new THREE.BoxGeometry(size.x, size.y + 0.05, size.z)
  );
  const mat = new THREE.LineBasicMaterial({
    color: 0x00ffff, linewidth: 2, transparent: true, opacity: 0.8
  });
  hintOutline = new THREE.LineSegments(geo, mat);
  hintOutline.position.set(
    targetX,
    fakePlatform.position.y,
    fakePlatform.position.z
  );
  scene.add(hintOutline);
  console.log('[FakePlatform] Hint ở X =', targetX);
}

function removeHintOutline() {
  if (hintOutline) { scene.remove(hintOutline); hintOutline = null; }
}

function triggerFakePlatform() {
  if (fakePlatformMoving || !fakePlatform) return;

  fakePlatformAttempt++;
  
  // 🔴 TỪ LẦN 4 TRỞ ĐI: Bẫy bị "liệt" hoàn toàn (không dịch chuyển, KHÔNG kêu)
  if (fakePlatformAttempt >= 4) {
    return;
  }

  fakePlatformMoving = true;
  playSFX('platformMove', 1.0); 

  if (fakePlatformAttempt === 1) {
    fakePlatformTargetX = fakePlatformOriginX + PLATFORM_SHIFT_1;
    console.log('[FakePlatform] Lần 1 → dịch', PLATFORM_SHIFT_1, 'm');

  } else if (fakePlatformAttempt === 2) {
    fakePlatformTargetX = fakePlatformOriginX + PLATFORM_SHIFT_2;
    console.log('[FakePlatform] Lần 2 → dịch', PLATFORM_SHIFT_2, 'm (bẫy)');

  } else if (fakePlatformAttempt === 3) {
    fakePlatformTargetX = fakePlatformOriginX + PLATFORM_SHIFT_3;
    console.log('[FakePlatform] Lần 3 → dịch', PLATFORM_SHIFT_3, 'm (an toàn)');
  } 
}

function resetFakePlatform() {
  if (!fakePlatform) return;
  fakePlatform.position.x = fakePlatformOriginX;
  fakePlatformMoving      = false;
  fakePlatformTargetX     = fakePlatformOriginX;
  fakePlatform.updateWorldMatrix(true, false);

  removeHintOutline();
  
  // 🔴 MẤT TỪ LẦN 5: Tức là chỉ vẽ viền xanh nếu số lần dẫm bẫy là 1, 2, 3, hoặc 4
  if (fakePlatformAttempt >= 1 && fakePlatformAttempt <= 4) {
    createHintOutline(fakePlatformOriginX + PLATFORM_HINT_OFFSET);
  }
}
function updateFakePlatform(dt) {
  if (!fakePlatform || !fakePlatformMoving) return;

  const dx      = fakePlatformTargetX - fakePlatform.position.x;
  const maxStep = Math.sign(dx) * PLATFORM_SPEED * dt;
  // Clamp để không overshoot → không giật dù speed cao
  const step    = Math.abs(maxStep) >= Math.abs(dx) ? dx : maxStep;

  fakePlatform.position.x += step;
  fakePlatform.updateWorldMatrix(true, false);

  if (wasOnPlatform) yawObject.position.x += step;

  if (Math.abs(fakePlatformTargetX - fakePlatform.position.x) < 0.001) {
    fakePlatform.position.x = fakePlatformTargetX;
    fakePlatformMoving = false;
    fakePlatform.updateWorldMatrix(true, false);
  }
}

function checkNearPlatform() {
  if (!fakePlatform) return false;

  const ox = fakePlatformOriginX;
  const oy = fakePlatform.position.y;
  const oz = fakePlatform.position.z;

  const px = yawObject.position.x;
  const py = yawObject.position.y;
  const pz = yawObject.position.z;

  return px >= ox + TRIGGER_X_MIN && px <= ox + TRIGGER_X_MAX
      && pz >= oz + TRIGGER_Z_MIN && pz <= oz + TRIGGER_Z_MAX
      && py <= oy + TRIGGER_Y_MAX;
}

// Gọi mỗi frame — trigger khi người chơi VỪA BƯỚC VÀO box
// Không cần bấm Space, không cần isOnGround
function checkTriggerBoxEnter() {
  if (!fakePlatform || fakePlatformMoving || isDead || paused) return;
  const inBox = checkNearPlatform();
  if (inBox && !wasInTriggerBox) {
    // Vừa bước vào box → trigger plate
    triggerFakePlatform();
  }
  wasInTriggerBox = inBox;
}

function checkIfOnPlatform() {
  if (!fakePlatform) return false;
  fakePlatform.updateWorldMatrix(true, false);
  const origin = yawObject.position.clone();
  rc.set(origin, new THREE.Vector3(0, -1, 0));
  rc.far = PLAYER_H + 0.3;
  const hits = rc.intersectObject(fakePlatform, false);
  return hits.length > 0 && hits[0].distance <= PLAYER_H + 0.08;
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


// ═══════════════════════════════════════════════════════════
//  THREE.JS INIT
// ═══════════════════════════════════════════════════════════
function initRenderer() {
  const canvas = document.getElementById('gameCanvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x111118);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x111118, 15, 100);

  camera = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, 0.1, 300);

  // FPS camera chuẩn: yawObject xoay Y, pitchObject xoay X
  // Tránh hoàn toàn Gimbal Lock
  pitchObject = new THREE.Object3D();
  pitchObject.add(camera);

  yawObject = new THREE.Object3D();
  yawObject.add(pitchObject);
  yawObject.position.set(SPAWN_X, SPAWN_Y, SPAWN_Z);
  scene.add(yawObject);

  clock = new THREE.Clock();

  // Bloom post-processing — threshold cao để chỉ emission mạnh mới bloom
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(innerWidth, innerHeight),
    0.8,   // strength
    0.4,   // radius
    0.85   // threshold
  );
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(bloomPass);

  // Debug
  window._scene           = scene;
  window._camera          = camera;
  window._composer        = composer;
  window._bloom           = bloomPass;
  window._yawObject       = yawObject;
  window._collisionMeshes = collisionMeshes;
  window.THREE            = THREE;
}




// ═══════════════════════════════════════════════════════════
//  LIGHTS
// ═══════════════════════════════════════════════════════════
function setupLights() {
  scene.add(new THREE.AmbientLight(0xffffff, 0.2));
  scene.add(new THREE.HemisphereLight(0xffe8c0, 0x222230, 0.2));
 
  const sun = new THREE.DirectionalLight(0xfff0dd, 0.1);
  sun.position.set(20, 100, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near   = 0.5;
  sun.shadow.camera.far    = 300;
  sun.shadow.camera.left   = sun.shadow.camera.bottom = -80;
  sun.shadow.camera.right  = sun.shadow.camera.top   =  80;
  sun.shadow.bias          = -0.001;
  sun.shadow.normalBias    =  0.04;
  scene.add(sun);
}


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
function respawn() {
  if (_currentDeathSFX) {
    _currentDeathSFX.pause();
    _currentDeathSFX = null;
  }
  yawObject.position.set(SPAWN_X, SPAWN_Y, SPAWN_Z);
  yaw = 0; pitch = 0;
  playerVY        = 0;
  isOnGround      = false;
  isDead          = false;
  wasOnPlatform   = false;
  wasJumping      = false;
  wasInTriggerBox = false;
  // Reset map hiện tại (không reset nếu đang switch map)
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
  if (isDead || !mapLoaded || trapMeshes.length === 0) return;

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
//  INPUT
// ═══════════════════════════════════════════════════════════
document.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Escape' && gameRunning) togglePause();

  // F3: bật/tắt chế độ nhà phát triển
  if (e.code === 'F3' && gameRunning) {
    e.preventDefault();
    devMode = !devMode;
    playerVY = 0;
    const el = document.getElementById('dev-badge');
    if (devMode) {
      if (!el) {
        const badge = document.createElement('div');
        badge.id = 'dev-badge';
        badge.setAttribute('style', [
          'position:fixed','top:50px','left:50%',
          'transform:translateX(-50%)',
          'background:rgba(0,200,0,0.25)',
          'border:1.5px solid #00ff00',
          'color:#00ff00','font-size:13px',
          'padding:4px 16px','border-radius:4px',
          'pointer-events:none','z-index:99',
          'letter-spacing:2px','font-family:monospace'
        ].join(';'));
        badge.textContent = 'DEV MODE — WASD + Space(len) + C(xuong) + Shift(nhanh) | F4=Map2 F5=Map1';
        document.body.appendChild(badge);
      }
      console.log('[Dev] Bay tu do — W/A/S/D + Space len + C xuong');
    } else {
      if (el) el.remove();
      isOnGround = false;
      keys['Space'] = false;
      playerVY = 0;
      console.log('[Dev] Tat dev mode');
    }
  }

  // F4: load map2 (chỉ trong devMode)
  if (e.code === 'F4' && gameRunning && devMode) {
    e.preventDefault();
    console.log('[Dev] Load Map 2...');
    loadMap(MAP_2);
  }

  // F5: load map1 (chỉ trong devMode)
  if (e.code === 'F5' && gameRunning && devMode) {
    e.preventDefault();
    console.log('[Dev] Load Map 1...');
    loadMap(MAP_1);
  }

  // Trigger plate được xử lý bởi checkTriggerBoxEnter() mỗi frame

  // Mo chest
  if (e.code === 'KeyF' && gameRunning && !paused && chestPromptVisible) {
    toggleChest();
  }
  if (e.code === 'KeyC' && gameRunning && !paused && !isDead && lootPrompt) {
    pickupLoot(lootPrompt);
  }
});
document.addEventListener('keyup', e => { keys[e.code] = false; });

// Tích lũy mouse delta giữa các frame — tránh giật do event rate != frame rate
let _mouseDX = 0;
let _mouseDY = 0;

document.addEventListener('mousemove', e => {
  if (!gameRunning || paused || isDead || !mouseReady) return;
  // Clamp từng event — browser đôi khi trả về spike lớn bất thường
  // khi tab refocus, pointer lock mới acquire, hoặc di chuột quá nhanh
  _mouseDX += Math.max(-40, Math.min(40, e.movementX));
  _mouseDY += Math.max(-40, Math.min(40, e.movementY));
});

window.addEventListener('resize', () => {
  if (!renderer) return;
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  if (composer) composer.setSize(innerWidth, innerHeight);
});


// ═══════════════════════════════════════════════════════════
//  PLAYER UPDATE
// ═══════════════════════════════════════════════════════════
let _prevOnGround = false;

function updatePlayer(dt) {
  // KHÓA DI CHUYỂN & TRỌNG LỰC KHI ĐANG CHỜ 3 GIÂY LOAD PORTAL
  if (paused || isDead || isTeleporting) return;
  const speed   = (keys['ShiftLeft'] || keys['ShiftRight']) ? RUN_SPEED : SPEED;
  // THÊM DÒNG NÀY ĐỂ LƯU TRẠNG THÁI CHẠY:
  const isRunning = keys['ShiftLeft'] || keys['ShiftRight'];
  const dir     = new THREE.Vector3();
  const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right   = new THREE.Vector3( Math.cos(yaw), 0, -Math.sin(yaw));

  // ── CHẾ ĐỘ NHÀ PHÁT TRIỂN ──
  if (devMode) {
    const devSpeed = (keys['ShiftLeft'] || keys['ShiftRight']) ? 30 : 15;
    const devDir   = new THREE.Vector3();
    const fwd3D    = new THREE.Vector3();
    camera.getWorldDirection(fwd3D);

    if (keys['KeyW']) devDir.add(fwd3D);
    if (keys['KeyS']) devDir.sub(fwd3D);
    if (keys['KeyA']) devDir.sub(right);
    if (keys['KeyD']) devDir.add(right);
    if (keys['Space'])   devDir.y += 1;
    if (keys['KeyC'])    devDir.y -= 1;

    if (devDir.length() > 0) {
      devDir.normalize().multiplyScalar(devSpeed * dt);
      yawObject.position.add(devDir);
    }
    return;
  }

  // ── Di chuyển bình thường ──
  if (keys['KeyW']) dir.add(forward);
  if (keys['KeyS']) dir.sub(forward);
  if (isOnGround) {
    if (keys['KeyA']) dir.sub(right);
    if (keys['KeyD']) dir.add(right);
  }

  if (dir.length() > 0) {
    dir.normalize().multiplyScalar(speed * dt);

    // CCD cho tường — sweep ray theo hướng di chuyển từ 3 độ cao
    const moveDir = dir.clone().normalize();
    const moveDist = dir.length();
    const checkHeights = [
      yawObject.position.y - PLAYER_H * 0.8,
      yawObject.position.y - PLAYER_H * 0.4,
      yawObject.position.y - PLAYER_H * 0.05,
    ];

    for (const hy of checkHeights) {
      const sweepOrig = new THREE.Vector3(yawObject.position.x, hy, yawObject.position.z);
      const rcWall = new THREE.Raycaster(sweepOrig, moveDir, 0, moveDist + PLAYER_RADIUS);
      const wHits = rcWall.intersectObjects(collisionMeshes, false);
      if (wHits.length > 0 && wHits[0].face) {
        const n = wHits[0].face.normal.clone()
          .transformDirection(wHits[0].object.matrixWorld);
        n.y = 0; n.normalize();
        const dot = dir.dot(n);
        if (dot < 0) dir.addScaledVector(n, -dot);
      }
    }

    checkWallCollision(dir);
    yawObject.position.add(dir);
    // Tiếng bước chân (TRUYỀN THÊM BIẾN isRunning VÀO CUỐI NHƯ NÀY ↓)
    updateFootstep(dir.length(), isOnGround, isRunning);
  }

  // ── Nhảy ──
  const onPlatformNow = checkIfOnPlatform();
  const justJumped    = isOnGround && keys['Space'] && !wasJumping;

  if (justJumped) {
    playerVY   = JUMP_FORCE;
    isOnGround = false;
  }
  wasJumping    = keys['Space'];
  wasOnPlatform = onPlatformNow;

  // ── Trọng lực — CCD (Continuous Collision Detection) ──
  if (mapLoaded) {
    playerVY += GRAVITY * dt;

    const dy        = playerVY * dt;
    const prevY     = yawObject.position.y;
    const nextY     = prevY + dy;

    // Wall CCD khi rơi — sweep theo Y ở rìa player
    // Tránh xuyên tường dọc khi trượt xuống
    if (dy < 0 && !isOnGround) {
      const offsets = [
        new THREE.Vector3( PLAYER_RADIUS, 0, 0),
        new THREE.Vector3(-PLAYER_RADIUS, 0, 0),
        new THREE.Vector3(0, 0,  PLAYER_RADIUS),
        new THREE.Vector3(0, 0, -PLAYER_RADIUS),
      ];
      const downDir = new THREE.Vector3(0, -1, 0);
      for (const off of offsets) {
        const orig = new THREE.Vector3(
          yawObject.position.x + off.x,
          prevY,
          yawObject.position.z + off.z
        );
        const rcV = new THREE.Raycaster(orig, downDir, 0, Math.abs(dy) + 0.5);
        const vHits = rcV.intersectObjects(collisionMeshes, false);
        if (vHits.length > 0) {
          const hitSurfaceNormal = vHits[0].face.normal.clone()
            .transformDirection(vHits[0].object.matrixWorld);
          // Nếu mặt hit là tường dọc (normal gần nằm ngang)
          if (Math.abs(hitSurfaceNormal.y) < 0.5) {
            // Đẩy player ra khỏi tường
            hitSurfaceNormal.y = 0;
            hitSurfaceNormal.normalize();
            const pen = (PLAYER_RADIUS - vHits[0].distance + 0.05);
            if (pen > 0) {
              yawObject.position.x += hitSurfaceNormal.x * pen;
              yawObject.position.z += hitSurfaceNormal.z * pen;
            }
          }
        }
      }
    }

    if (dy < 0) {
      // Cast từ prevY (chân trước) đến nextY (chân sau)
      const sweepOrigin = new THREE.Vector3(
        yawObject.position.x,
        prevY,                  // bắt đầu từ vị trí hiện tại
        yawObject.position.z
      );
      const sweepDist = Math.abs(dy) + PLAYER_H + 0.2;
      const _rcCCD = new THREE.Raycaster(
        sweepOrigin,
        new THREE.Vector3(0, -1, 0),
        0,
        sweepDist
      );
      // CCD sweep cả collision lẫn trap
      const allMeshes = [...collisionMeshes, ...trapMeshes];
      const hits = _rcCCD.intersectObjects(allMeshes, false);

      if (hits.length > 0) {
        const hitObj = hits[0].object;
        // Nếu hit vào trap → chết ngay
        if (trapMeshes.includes(hitObj)) {
          triggerDeath('trap: ' + hitObj.name);
          return;
        }
        const floorY = hits[0].point.y + PLAYER_H;
        if (floorY >= nextY) {
          yawObject.position.y = floorY;
          playerVY = 0;
          isOnGround = true;
        } else {
          yawObject.position.y = nextY;
          isOnGround = false;
        }
      } else {
        yawObject.position.y = nextY;
        isOnGround = false;
      }
    } else {
      // Bay lên — check va chạm trần
      yawObject.position.y = nextY;
      isOnGround = false;
    }

    // Wall collision sau khi update Y
    const wDir = new THREE.Vector3();
    checkWallCollision(wDir);
    checkFloor(); // fallback check sàn thường
    checkTraps();
    if (yawObject.position.y < DEATH_Y) triggerDeath('fell into pit');
  }
  if (!_prevOnGround && isOnGround) {
    // Khoảnh khắc vừa rơi trúng đất -> dập chân
    if (_lastFootstepAudio) _lastFootstepAudio.pause();
    _lastFootstepAudio = playSFX('footstep', 1); 
    _footstepDist = 0; // Reset lại nhịp đếm chân
  }
  _prevOnGround = isOnGround; // Chốt sổ trạng thái cho frame sau
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
  yaw   -= _mouseDX * 0.002;
  pitch -= _mouseDY * 0.002;
  pitch  = Math.max(-1.2, Math.min(1.2, pitch));
  yawObject.rotation.y   = yaw;
  pitchObject.rotation.x = pitch;
  _mouseDX = 0;
  _mouseDY = 0;

  updatePlayer(dt);          // physics, collision, trap death — CHUNG cho mọi map
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
  glbPath: './map1.glb',

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
    updateFakePlatform(dt);
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
// ═══════════════════════════════════════════════════════════
//  MAP2 TRAP SYSTEM
//  Trap_001: di chuyển theo Y, 29m, trigger khi đứng trên Map_floor.002
//  Trap_002: di chuyển theo Y, 36m, trigger khi đứng trên Map_floor.003
//  Đi nhanh (14 m/s), về chậm (5 m/s), lặp lại
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
//  MAP2 TRAP — đơn giản
//  Trap_001: chạm Map_floor_002 → đi 5.3m → về → kết thúc
//  Trap_002: chạm Map_floor_003 → đi 6.4m → về → kết thúc
// ═══════════════════════════════════════════════════════════

// state: null | 'idle' | 'going' | 'back' | 'done'
const m2t = {
  t1: { meshes: [], floor: null, originY: 0, dist: 0, travel: 5.3, speedGo: 8, speedBack: 1, phase: 'idle' },
  t2: { meshes: [], floor: null, originY: 0, dist: 0, travel: 6.4, speedGo: 8, speedBack: 1, phase: 'idle' },
};

function initMap2Trap(mesh) {
  const n = (mesh.name || '').toLowerCase();
  let t = null;
  if (n.startsWith('trap_001')) t = m2t.t1;
  else if (n.startsWith('trap_002')) t = m2t.t2;
  else return false;

  if (t.meshes.length === 0) t.originY = mesh.position.y;
  t.meshes.push(mesh);
  if (!trapMeshes.includes(mesh)) trapMeshes.push(mesh);
  console.log('[M2Trap] Init:', mesh.name, '| originY:', t.originY.toFixed(2));
  return true;
}

function initMap2Floor(mesh) {
  const n = (mesh.name || '').toLowerCase();
  if (!n.includes('floor')) return;
  mesh.updateWorldMatrix(true, false);
  mesh.userData.boundingBox = new THREE.Box3().setFromObject(mesh);
  if (n.includes('002') || n.includes('.002')) {
    m2t.t1.floor = mesh;
    console.log('[M2Floor] floor→Trap_001:', mesh.name);
  } else if (n.includes('003') || n.includes('.003')) {
    m2t.t2.floor = mesh;
    console.log('[M2Floor] floor→Trap_002:', mesh.name);
  } else if (n.includes('004') || n.includes('.004')) {
    m2cua.floor = mesh;
    console.log('[M2Floor] floor→Trap_cua_001:', mesh.name);
  }
}

function updateMap2Traps(dt) {
  if (!mapLoaded) return;
  const pp = yawObject.position;

  for (const t of [m2t.t1, m2t.t2]) {
    // Trigger khi player đứng trên floor
    if (t.phase === 'idle' && t.floor && t.meshes.length > 0) {
      const fb = t.floor.userData.boundingBox.clone();
      fb.max.y += PLAYER_H + 1;
      fb.expandByScalar(0.5);
      const pb = new THREE.Box3().setFromCenterAndSize(
        pp, new THREE.Vector3(PLAYER_RADIUS * 2, PLAYER_H, PLAYER_RADIUS * 2)
      );
      if (fb.intersectsBox(pb)) {
        t.phase = 'going';
        playSFX('swoosh', 1.0); // Phát ngay tắp lự khi bẫy sập xuống!
        console.log('[M2Trap] START:', t === m2t.t1 ? 'Trap_001' : 'Trap_002');
      }
    }

    if (t.phase === 'going') {
      t.dist += t.speedGo * dt;
      if (t.dist >= t.travel) { t.dist = t.travel; t.phase = 'back'; }
    } else if (t.phase === 'back') {
      t.dist -= t.speedBack * dt;
      if (t.dist <= 0) { t.dist = 0; t.phase = 'done'; }
    } else {
      continue;
    }

    const y = t.originY + t.dist;
    t.meshes.forEach(m => { m.position.y = y; m.updateWorldMatrix(true, false); });
  }
}

function resetMap2Traps() {
  for (const t of [m2t.t1, m2t.t2]) {
    if (t.meshes.length > 0) {
      t.meshes.forEach(m => {
        m.position.y = t.originY;
        m.updateWorldMatrix(true, false);
      });
    }
    t.dist  = 0;
    t.phase = 'idle';
  }
}

function fullResetMap2Traps() {
  for (const t of [m2t.t1, m2t.t2]) {
    t.meshes = []; t.floor = null; t.originY = 0; t.dist = 0; t.phase = 'idle';
  }
}

// ── Trap_cua_001: quay local Y + di chuyển world X đối xứng ──
const m2cua = {
  meshes:     [],
  floor:      null,   
  triggered:  false,
  finished:   false,
  rotSpeed:   1000,   
  moveSpeed:  30,
  logTimer:   0,
  sfx:        null,  // Lưu công tắc âm thanh
};

function initMap2Cua(mesh) {
  mesh.updateWorldMatrix(true, false);
  const wx = mesh.matrixWorld.elements[12]; // Lấy chuẩn World X
  
  mesh.userData.originWorldX = wx;
  mesh.userData.targetWorldX = -wx;
  mesh.userData.dir = mesh.userData.targetWorldX > mesh.userData.originWorldX ? 1 : -1;
  
  m2cua.meshes.push(mesh);
  if (!trapMeshes.includes(mesh)) trapMeshes.push(mesh);
  console.log('[Cua] Init:', mesh.name, '| WORLD Gốc:', wx.toFixed(2), '→ WORLD Đích:', (-wx).toFixed(2));
}

function updateMap2Cua(dt) {
  if (m2cua.meshes.length === 0 || m2cua.finished) return; // CHẶN NGAY TỪ ĐẦU NẾU ĐÃ KHOÁ
  const pp = yawObject.position;

  // LOGIC TỰ TẮT:
  if (m2cua.triggered) {
    m2cua.meshes[0].updateWorldMatrix(true, false);
    const trapZ = m2cua.meshes[0].matrixWorld.elements[14];
    
    if (pp.z < trapZ - CUA_RESET_DIST) {
      // Ép về vị trí setup
      m2cua.meshes.forEach(m => {
        m.updateWorldMatrix(true, false);
        const worldPos = new THREE.Vector3();
        m.getWorldPosition(worldPos);
        worldPos.x = m.userData.originWorldX; 
        if (m.parent) { m.parent.worldToLocal(worldPos); }
        m.position.copy(worldPos);
        m.updateWorldMatrix(true, false);
      });

      if (m2cua.sfx) { m2cua.sfx.pause(); m2cua.sfx = null; }
      m2cua.finished = true; // 🔴 KHOÁ VĨNH VIỄN CƯA 1
      return; 
    }
  }

  if (!m2cua.triggered) {
    if (!m2cua.floor) return;
    const fb = m2cua.floor.userData.boundingBox.clone();
    fb.max.y += PLAYER_H + 1;
    fb.expandByScalar(0.5);
    const pb = new THREE.Box3().setFromCenterAndSize(
      pp, new THREE.Vector3(PLAYER_RADIUS * 2, PLAYER_H, PLAYER_RADIUS * 2)
    );
    if (!fb.intersectsBox(pb)) return;
    m2cua.triggered = true;
    m2cua.sfx = playSFX('sawBlade1', 0.3, 1.0, true);
    console.log('[Cua] Triggered! Bắt đầu càn quét...');
  }

  m2cua.logTimer += dt;
  const shouldLog = m2cua.logTimer >= 0.5;
  if (shouldLog) m2cua.logTimer = 0;

  m2cua.meshes.forEach((mesh, index) => {
    const data = mesh.userData;
    mesh.updateWorldMatrix(true, false);
    const worldPos = new THREE.Vector3();
    mesh.getWorldPosition(worldPos);

    const step = m2cua.moveSpeed * dt * data.dir;
    worldPos.x += step;

    const minX = Math.min(data.originWorldX, data.targetWorldX);
    const maxX = Math.max(data.originWorldX, data.targetWorldX);

    // Xóa cái đoạn check tắt âm thanh dính líu đến Cưa 2 đi, chỉ giữ lại đảo chiều
    if (data.dir > 0 && worldPos.x >= maxX) {
      worldPos.x = maxX;
      data.dir = -1;
    } else if (data.dir < 0 && worldPos.x <= minX) {
      worldPos.x = minX;
      data.dir = 1;
    }

    const currentWorldX = worldPos.x;
    if (mesh.parent) { mesh.parent.worldToLocal(worldPos); }
    mesh.position.copy(worldPos);

    mesh.rotateY(THREE.MathUtils.degToRad(m2cua.rotSpeed * dt));
    mesh.updateWorldMatrix(true, false);
  });
}

function resetMap2Cua() {
  if (m2cua.sfx) { m2cua.sfx.pause(); m2cua.sfx = null; }
  m2cua.meshes.forEach(m => {
    m.updateWorldMatrix(true, false);
    const worldPos = new THREE.Vector3();
    m.getWorldPosition(worldPos);
    
    worldPos.x = m.userData.originWorldX; // Kéo về đúng vị trí setup
    
    if (m.parent) { m.parent.worldToLocal(worldPos); }
    m.position.copy(worldPos);

    m.userData.dir = m.userData.targetWorldX > m.userData.originWorldX ? 1 : -1;
    m.updateWorldMatrix(true, false);
  });
  m2cua.triggered = false;
  m2cua.logTimer = 0;
  m2cua.finished = false;
}

function fullResetMap2Cua() {
  m2cua.meshes     = [];
  m2cua.floor      = null;
  m2cua.triggered  = false;
  m2cua.logTimer   = 0;
}

// ── Trap_cua_002..006: quay local Y + nâng Y khi player đến gần ──
// !! Chỉnh 2 thông số tại đây ↓
const CUA2_ROT_SPEED    = 2000; // độ/giây (dương = thuận chiều, âm = ngược chiều)
const CUA2_TRIGGER_DIST =  10;  // player cách trap bao nhiêu mét theo Z thì nâng lên
const CUA2_RISE_DIST    =  3.0; // nâng lên bao nhiêu mét theo Y
const CUA_RESET_DIST    = 5.0;

const CUA2_RISE_SPEED  = 5;    // tốc độ nâng 002..006 (m/s)

// !! Trap_cua_007: hạ xuống thay vì nâng lên
const CUA7_FALL_DIST   = 8.0; // !! hạ xuống bao nhiêu mét — chỉnh ở đây
const CUA7_FALL_SPEED  = 10.0; // !! tốc độ hạ xuống (m/s) — chỉnh ở đây
const CUA7_WARN_DIST   = 20.0; // !! hiện tam giác khi player cách bao nhiêu mét — chỉnh ở đây

const m2cua2 = { traps: [] };
// Mỗi phần tử trong traps: { mesh, originY, triggered, riseProgress }

function initMap2Cua2(mesh) {
  mesh.updateWorldMatrix(true, false);
  const target = (mesh.parent && mesh.parent.type !== 'Scene') ? mesh.parent : mesh;
  target.updateWorldMatrix(true, false);

  // Lưu world XZ và size ngay lúc init (mesh chưa xoay nhiều)
  const initBox = new THREE.Box3().setFromObject(target);
  const initSize   = new THREE.Vector3();
  const initCenter = new THREE.Vector3();
  initBox.getSize(initSize);
  initBox.getCenter(initCenter);

  const isCua7 = (mesh.name || '').toLowerCase().startsWith('trap_cua_007');
  m2cua2.traps.push({
    mesh,
    target,
    originY:      target.position.y,
    triggered:    false,
    finished:     false,
    riseProgress: 0,
    killedBy:     false,
    warningBox:   null,
    isCua7,
    initSize,
    initCenterX: initCenter.x,
    initCenterY: initCenter.y,
    initCenterZ: initCenter.z,
  });
  if (!trapMeshes.includes(mesh)) trapMeshes.push(mesh);
  console.log('[Cua2] Init:', mesh.name, '| target:', target.name);
}

function createCua2WarningBox(t) {
  if (t.warningBox) return;

  // Lấy Y mặt sàn
  let floorY = t.initCenterY;
  if (m2cua.floor) {
    m2cua.floor.updateWorldMatrix(true, false);
    const fb = new THREE.Box3().setFromObject(m2cua.floor);
    floorY = fb.max.y + 0.05;
  }

  const cx = t.initCenterX;
  const cz = t.initCenterZ;

  // Chiều cao tam giác = chiều rộng Trap (initSize.x)
  // !! Chỉnh size ở đây ↓
  const triH = t.initSize.z;   // chiều cao tam giác (= chiều rộng trap)
  const triW = triH;            // tam giác đều: width ≈ height

  // ── Vẽ canvas ──
  const C  = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = C;
  const ctx = cv.getContext('2d');

  // Tam giác bo góc
  const br  = C * 0.05; // !! bán kính bo góc — tăng/giảm ở đây
  const top = C * 0.06, bot = C * 0.94, mid = C * 0.5;
  const lft = C * 0.06, rgt = C * 0.94;
  const pts = [
    { x: mid, y: top },
    { x: rgt, y: bot },
    { x: lft, y: bot },
  ];

  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const prev = pts[(i + 2) % 3];
    const cur  = pts[i];
    const next = pts[(i + 1) % 3];
    const d0 = Math.hypot(prev.x - cur.x, prev.y - cur.y);
    const d1 = Math.hypot(next.x - cur.x, next.y - cur.y);
    const p0x = cur.x + br * (prev.x - cur.x) / d0;
    const p0y = cur.y + br * (prev.y - cur.y) / d0;
    const p1x = cur.x + br * (next.x - cur.x) / d1;
    const p1y = cur.y + br * (next.y - cur.y) / d1;
    if (i === 0) ctx.moveTo(p0x, p0y);
    else         ctx.lineTo(p0x, p0y);
    ctx.quadraticCurveTo(cur.x, cur.y, p1x, p1y);
  }
  ctx.closePath();

  // Fill đỏ mờ
  // !! Chỉnh độ mờ ở đây ↓ (rgba alpha: 0=trong suốt, 1=đục)
  ctx.fillStyle = 'rgba(220, 30, 10, 0.15)';
  ctx.fill();

  // Viền đỏ đậm hơn
  ctx.strokeStyle = 'rgba(255, 60, 20, 0.85)';
  ctx.lineWidth = 14;
  ctx.stroke();

  // Dấu ! màu vàng ở giữa
  ctx.fillStyle = '#FFE030';
  ctx.font = `bold ${Math.round(C * 0.52)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('!', mid, mid + C * 0.06);

  const tex = new THREE.CanvasTexture(cv);

  // Plane nằm ngang trên sàn, kích thước = triW x triH
  const geo = new THREE.PlaneGeometry(triW, triH);
  geo.rotateX(-Math.PI / 2);

  const mat = new THREE.MeshBasicMaterial({
    map:         tex,
    transparent: true,
    depthWrite:  false,
    side:        THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(cx, floorY, cz);
  mesh.renderOrder = 999;
  scene.add(mesh);
  t.warningBox = mesh;
  console.log('[Cua2] Warning sign:', t.mesh.name, '| triH:', triH.toFixed(2));
}

function updateMap2Cua2(dt) {
  if (m2cua2.traps.length === 0) return;
  const pp  = yawObject.position;
  const rad = THREE.MathUtils.degToRad(CUA2_ROT_SPEED * dt);

  m2cua2.traps.forEach(t => {
    if (t.finished) return; // 🔴 NẾU ĐÃ KHOÁ THÌ BỎ QUA KHÔNG CHẠY LOGIC NỮA

    const mesh = t.mesh;
    mesh.updateWorldMatrix(true, false);
    const trapWorldZ = mesh.matrixWorld.elements[14];

    // 🔴 1. TỰ ĐỘNG THU BẪY & KHOÁ VĨNH VIỄN KHI ĐI QUA XA
    if (t.triggered && pp.z < trapWorldZ - CUA_RESET_DIST) {
      t.target.position.y = t.originY;
      t.target.updateWorldMatrix(true, true);
      t.riseProgress = 0;
      t.finished = true; // 🔴 ĐÁNH DẤU LÀ ĐÃ XONG NHIỆM VỤ, KHÔNG BẬT LẠI NỮA
      
      if (t.sfx) {
        t.sfx.pause();
        t.sfx = null;
      }
      if (t.warningBox) t.warningBox.visible = false;
      return; 
    }

    if (t.isCua7) {
      if (!t.warningBox) {
        createCua2WarningBox(t);
        t.warningBox.visible = false; 
      }
      if (Math.abs(pp.z - trapWorldZ) <= CUA7_WARN_DIST) {
        t.warningBox.visible = true; 
      }
    }

    // 2. BẬT BẪY 
    if (!t.triggered && pp.z <= trapWorldZ + CUA2_TRIGGER_DIST && pp.z >= trapWorldZ - CUA_RESET_DIST) {
      t.triggered = true;
      
      const trapName = mesh.name.toLowerCase();
      const numMatch = trapName.match(/trap_cua_00(\d)/);
      if (numMatch) {
        const num = parseInt(numMatch[1]); 
        
        // 🔴 ĐỔI DÒNG NÀY: Ép tất cả (từ số 2 đến 7) xài chung cái 'sawBlade2'
        t.sfx = playSFX('sawBlade2', 0.3, 1.0, true); 

        // 🔴 ĐOẠN TÌM VÀ TẮT CƯA TRƯỚC VẪN GIỮ NGUYÊN:
        if (num === 2) {
           m2cua.stopRequested = true; 
        } else if (num > 2) {
           const prevTarget = `trap_cua_00${num - 1}`;
           const prevTrap = m2cua2.traps.find(x => x.mesh.name.toLowerCase().includes(prevTarget));
           if (prevTrap && prevTrap.sfx) {
               prevTrap.sfx.pause();
               prevTrap.sfx = null;
           }
        }
      }
      console.log('[Cua2] Triggered:', mesh.name, '| player Z:', pp.z.toFixed(2));
    }

    if (t.triggered && t.riseProgress < (t.isCua7 ? CUA7_FALL_DIST : CUA2_RISE_DIST)) {
      const maxDist = t.isCua7 ? CUA7_FALL_DIST : CUA2_RISE_DIST;
      const speed   = t.isCua7 ? CUA7_FALL_SPEED : CUA2_RISE_SPEED;
      const step = Math.min(speed * dt, maxDist - t.riseProgress);
      t.riseProgress += step;
      t.target.position.y = t.isCua7
        ? t.originY - t.riseProgress   // hạ xuống
        : t.originY + t.riseProgress;  // nâng lên
      t.target.updateWorldMatrix(true, true);
    }

    mesh.rotateY(rad);
    mesh.updateWorldMatrix(true, false);
  });
}

function resetMap2Cua2() {
  console.log('[Cua2] Reset', m2cua2.traps.length, 'traps');
  m2cua2.traps.forEach(t => {
    if (t.sfx) { t.sfx.pause(); t.sfx = null; }
    // 002..006: tạo warning box nếu đã chết bởi trap này
    if (!t.isCua7 && t.killedBy) createCua2WarningBox(t);
    // 007: xóa warning box khi reset (sẽ hiện lại khi đến gần)
    if (t.isCua7 && t.warningBox) {
      scene.remove(t.warningBox);
      t.warningBox.geometry.dispose();
      if (t.warningBox.material.map) t.warningBox.material.map.dispose();
      t.warningBox.material.dispose();
      t.warningBox = null;
    }

    t.target.position.y = t.originY;
    t.target.updateWorldMatrix(true, true);
    t.triggered    = false;
    t.finished = false;
    t.riseProgress = 0;
  });
}

function fullResetMap2Cua2() {
  m2cua2.traps.forEach(t => {
    if (t.warningBox) {
      scene.remove(t.warningBox);
      t.warningBox.geometry.dispose();
      if (t.warningBox.material.map) t.warningBox.material.map.dispose();
      t.warningBox.material.dispose();
      t.warningBox = null;
    }
    t.killedBy = false;
  });
  resetMap2Cua2();
  m2cua2.traps = [];
}

const MAP_2 = {
  glbPath: './map2.glb',

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

    gameRunning = true;
    clock.start();

    const canvas = document.getElementById('gameCanvas');
    (canvas.requestPointerLock || canvas.mozRequestPointerLock).call(canvas);

    _currentLoadingSFX = playSFX('loadMap1', 0.7);
    loadMap(MAP_1);
    
    gameLoop();
  }, 50); 
}
function togglePause() {
  paused = !paused;
  if (paused) {
    document.getElementById('pause-menu').classList.add('open');
    document.exitPointerLock();
  } else {
    document.getElementById('pause-menu').classList.remove('open');
    const canvas = document.getElementById('gameCanvas');
    (canvas.requestPointerLock || canvas.mozRequestPointerLock).call(canvas);
  }
}

function resumeGame() { if (paused) togglePause(); }

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