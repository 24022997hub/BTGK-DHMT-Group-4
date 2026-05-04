// src/entities/Trap.js
import * as THREE from 'three';
import { triggerEarthquake, spawnSmokePuff } from '../effects/EffectManager.js';
import { 
  SPIDER_TRIGGER_DIST, SPIDER_FLY_SPEED, SPIDER_STOP_X, SPIDER_RETURN_TRIG_X, SPIDER_FLY_ROT, SPIDER_HIT_ROT, SPIDER_BACK_ROT,
  MOVING_TRAP_TRIGGER_Z, MOVING_TRAP_SPEED, MOVING_TRAP_TRAVEL, TRAP5_SPEED, TRAP5_TRAVEL,
  TRIGGER_X_MIN, TRIGGER_X_MAX, TRIGGER_Z_MIN, TRIGGER_Z_MAX, TRIGGER_Y_MAX, PLATFORM_HINT_OFFSET, PLATFORM_SHIFT_1, PLATFORM_SHIFT_2, PLATFORM_SHIFT_3, PLATFORM_SPEED,
  PLAYER_H, PLAYER_RADIUS,
  CUA2_ROT_SPEED, CUA2_TRIGGER_DIST, CUA2_RISE_DIST, CUA_RESET_DIST, CUA2_RISE_SPEED, CUA7_FALL_DIST, CUA7_FALL_SPEED, CUA7_WARN_DIST,
  CHEST_INTERACT_DIST, CHEST_KNOCKBACK_SPEED, WALL_CONFIGS, WALL_RISE_AMOUNT, WALL_RISE_SPEED
} from '../utils/constants.js';
import { scene, yawObject, camera } from '../core/Renderer.js';
import { playSFX } from '../managers/AudioManager.js';
import { trapMeshes, collisionMeshes, rc } from '../physics/Collider.js';

// Cầu nối giao tiếp với main.js
export const trapConfig = { 
  isDead: false, paused: false, mapLoaded: false, triggerDeath: () => {},
  yaw: 0, spawnLoot: () => {}, hideLoot: () => {} 
};
export function setTrapState(dead, pause, loaded, deathFn) {
    trapConfig.isDead = dead; trapConfig.paused = pause; trapConfig.mapLoaded = loaded;
    if (deathFn) trapConfig.triggerDeath = deathFn;
}

// ════════════ SPIDER ════════════
export const spiderMeshes = [];
export let spiderState = 'idle'; 
export let spiderTargetZ = 0;      
export let spiderHissPlayed = false; 

export function initSpider(mesh) {
  mesh.userData.originPos = mesh.position.clone();
  mesh.userData.originRot = { x: mesh.rotation.x, y: mesh.rotation.y, z: mesh.rotation.z };
  spiderMeshes.push(mesh);
}
function getSpiderCenter() {
  if (spiderMeshes.length === 0) return new THREE.Vector3();
  const c = new THREE.Vector3();
  spiderMeshes.forEach(m => { const wp = new THREE.Vector3(); m.getWorldPosition(wp); c.add(wp); });
  return c.divideScalar(spiderMeshes.length);
}
export function checkSpiderTrigger() {
  if (!trapConfig.mapLoaded || spiderMeshes.length === 0) return;
  if (spiderState === 'idle') {
    const center = getSpiderCenter();
    if (Math.sqrt((yawObject.position.x - center.x)**2 + (yawObject.position.z - center.z)**2) <= SPIDER_TRIGGER_DIST) {
      spiderState = 'flying';
      spiderMeshes.forEach(m => { m.rotation.x = SPIDER_FLY_ROT.x; m.rotation.y = SPIDER_FLY_ROT.y; m.rotation.z = SPIDER_FLY_ROT.z; });
    }
  }
  if (spiderState === 'onwall' && yawObject.position.x >= SPIDER_RETURN_TRIG_X) {
    spiderTargetZ = yawObject.position.z;
    spiderMeshes.forEach(m => {
      m.position.z = spiderTargetZ; m.rotation.x = SPIDER_BACK_ROT.x; m.rotation.y = SPIDER_BACK_ROT.y; m.rotation.z = SPIDER_BACK_ROT.z; m.updateWorldMatrix(true, false);
    });
    spiderState = 'returning';
  }
}
export function updateSpider(dt) {
  if (spiderMeshes.length === 0) return;
  if ((spiderState === 'flying' || spiderState === 'returning') && !spiderHissPlayed) {
    const sp = spiderMeshes[0].position;
    if (Math.sqrt((yawObject.position.x-sp.x)**2 + (yawObject.position.y-sp.y)**2 + (yawObject.position.z-sp.z)**2) <= 25.0) {
      playSFX(spiderState === 'flying' ? 'spiderHiss' : 'spiderAttack', spiderState === 'flying' ? 1.0 : 1.2);
      spiderHissPlayed = true; 
    }
  }
  if (spiderState === 'flying') {
    const step = SPIDER_FLY_SPEED * dt;
    spiderMeshes.forEach(m => { m.position.x -= step; m.position.y = m.userData.originPos.y - 10; m.updateWorldMatrix(true, false); });
    const center = getSpiderCenter();
    if (Math.sqrt((yawObject.position.x-center.x)**2 + (yawObject.position.y-center.y)**2 + (yawObject.position.z-center.z)**2) < 1.5) {
      spiderState = 'idle'; trapConfig.triggerDeath('spider'); return;
    }
    if (spiderMeshes[0].position.x <= SPIDER_STOP_X) {
      spiderMeshes.forEach(m => {
        m.position.x = SPIDER_STOP_X; m.position.y = m.userData.originPos.y; 
        m.rotation.x = SPIDER_HIT_ROT.x; m.rotation.y = SPIDER_HIT_ROT.y; m.rotation.z = SPIDER_HIT_ROT.z; m.updateWorldMatrix(true, false);
      });
      spiderState = 'onwall'; spiderHissPlayed = false;
    }
  } else if (spiderState === 'returning') {
    const step = SPIDER_FLY_SPEED * dt;
    const originX = spiderMeshes[0].userData.originPos.x;
    spiderMeshes.forEach(m => { m.position.x += step; m.position.y = m.userData.originPos.y - 10; m.position.z = spiderTargetZ; m.updateWorldMatrix(true, false); });
    const sp = spiderMeshes[0].position;
    if (Math.sqrt((yawObject.position.x-sp.x)**2 + (yawObject.position.y-sp.y)**2 + (yawObject.position.z-sp.z)**2) < 3.0) {
      spiderState = 'done'; trapConfig.triggerDeath('spider'); return;
    }
    if (spiderMeshes[0].position.x >= originX) {
      spiderMeshes.forEach(m => { m.position.copy(m.userData.originPos); m.rotation.x = m.userData.originRot.x; m.rotation.y = m.userData.originRot.y; m.rotation.z = m.userData.originRot.z; m.updateWorldMatrix(true, false); });
      spiderState = 'done';
    }
  }
}
export function resetSpider() {
  spiderMeshes.forEach(m => { m.position.copy(m.userData.originPos); m.rotation.x = m.userData.originRot.x; m.rotation.y = m.userData.originRot.y; m.rotation.z = m.userData.originRot.z; m.updateWorldMatrix(true, false); });
  spiderState = 'idle'; spiderHissPlayed = false;
}

// ════════════ MOVING TRAP 4 ════════════
export let movingTrapMeshes = [];
let movingTrapActive = false;
let movingTrapTriggered = false;
let movingTrapDistMoved = 0;
let trap4HideTimer = null;
let movingTrapSwooshPlayed = false;

export function initMovingTrap(mesh) { mesh.userData.originZ = mesh.position.z; movingTrapMeshes.push(mesh); }
export function checkMovingTrapTrigger() {
  if (movingTrapMeshes.length === 0 || movingTrapTriggered || trapConfig.isDead || !trapConfig.mapLoaded) return;
  if (yawObject.position.z <= MOVING_TRAP_TRIGGER_Z) { movingTrapTriggered = true; movingTrapActive = true; }
}
export function updateMovingTrap(dt) {
  if (movingTrapMeshes.length === 0 || !movingTrapActive) return;
  if (!movingTrapSwooshPlayed && yawObject.position.distanceTo(movingTrapMeshes[0].position) <= 20.0) {
    playSFX('swoosh', 1.0); movingTrapSwooshPlayed = true;
  }
  const step = Math.min(MOVING_TRAP_SPEED * dt, MOVING_TRAP_TRAVEL - movingTrapDistMoved);
  movingTrapDistMoved += step;
  movingTrapMeshes.forEach(mesh => { mesh.position.z += step; mesh.updateWorldMatrix(true, false); });

  if (movingTrapDistMoved >= MOVING_TRAP_TRAVEL) {
    movingTrapActive = false;
    trap4HideTimer = setTimeout(() => {
      trap4HideTimer = null;
      movingTrapMeshes.forEach(mesh => { 
          mesh.visible = false; 
          const idx = trapMeshes.indexOf(mesh);
          if (idx > -1) trapMeshes.splice(idx, 1); // Xóa an toàn không gây lỗi constant
      });
      if (!trapConfig.isDead) activateTrap5();
    }, 1000);
  }
}
export function resetMovingTrap() {
  if (trap4HideTimer) { clearTimeout(trap4HideTimer); trap4HideTimer = null; }
  movingTrapMeshes.forEach(mesh => { mesh.position.z = mesh.userData.originZ; mesh.visible = true; mesh.updateWorldMatrix(true, false); if (!trapMeshes.includes(mesh)) trapMeshes.push(mesh); });
  movingTrapActive = false; movingTrapTriggered = false; movingTrapSwooshPlayed = false; movingTrapDistMoved = 0;
}

// ════════════ TRAP 5 ════════════
export let trap5Meshes = [];
let trap5Active = false;
let trap5DistMoved = 0;
let trap5SwooshPlayed = false;

export function initTrap5(mesh) { mesh.userData.originZ = mesh.position.z; trap5Meshes.push(mesh); }
export function activateTrap5() { if (trap5Meshes.length > 0 && !trap5Active) trap5Active = true; }
export function updateTrap5(dt) {
  if (trap5Meshes.length === 0 || !trap5Active) return;
  if (!trap5SwooshPlayed && yawObject.position.distanceTo(trap5Meshes[0].position) <= 15.0) { playSFX('swoosh', 1.0); trap5SwooshPlayed = true; }
  const step = Math.min(TRAP5_SPEED * dt, TRAP5_TRAVEL - trap5DistMoved);
  trap5DistMoved += step;
  trap5Meshes.forEach(mesh => { mesh.position.z -= step; mesh.updateWorldMatrix(true, false); });
  if (trap5DistMoved >= TRAP5_TRAVEL) trap5Active = false;
}
export function resetTrap5() {
  trap5Meshes.forEach(mesh => { mesh.position.z = mesh.userData.originZ; mesh.visible = true; mesh.updateWorldMatrix(true, false); if (!trapMeshes.includes(mesh)) trapMeshes.push(mesh); });
  trap5Active = false; trap5SwooshPlayed = false; trap5DistMoved = 0;
}

// ════════════ FAKE PLATFORM ════════════
let fakePlatform = null;
let fakePlatformOriginX = 0;
let fakePlatformAttempt = 0;
let fakePlatformMoving = false;
let fakePlatformTargetX = 0;
let hintOutline = null;
let wasInTriggerBox = false;

export function initFakePlatform(mesh) { fakePlatform = mesh; fakePlatformOriginX = mesh.position.x; fakePlatformAttempt = 0; fakePlatformMoving = false; }
export function createHintOutline(targetX) {
  if (hintOutline) { scene.remove(hintOutline); hintOutline = null; }
  if (!fakePlatform) return;
  const box = new THREE.Box3().setFromObject(fakePlatform); const size = new THREE.Vector3(); box.getSize(size);
  const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y + 0.05, size.z));
  const mat = new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 2, transparent: true, opacity: 0.8 });
  hintOutline = new THREE.LineSegments(geo, mat); hintOutline.position.set(targetX, fakePlatform.position.y, fakePlatform.position.z); scene.add(hintOutline);
}
export function removeHintOutline() { if (hintOutline) { scene.remove(hintOutline); hintOutline = null; } }
export function triggerFakePlatform() {
  if (fakePlatformMoving || !fakePlatform) return;
  fakePlatformAttempt++;
  if (fakePlatformAttempt >= 4) return;
  fakePlatformMoving = true; playSFX('platformMove', 1.0); 
  if (fakePlatformAttempt === 1) fakePlatformTargetX = fakePlatformOriginX + PLATFORM_SHIFT_1;
  else if (fakePlatformAttempt === 2) fakePlatformTargetX = fakePlatformOriginX + PLATFORM_SHIFT_2;
  else if (fakePlatformAttempt === 3) fakePlatformTargetX = fakePlatformOriginX + PLATFORM_SHIFT_3;
}
export function resetFakePlatform() {
  if (!fakePlatform) return;
  fakePlatform.position.x = fakePlatformOriginX; fakePlatformMoving = false; fakePlatformTargetX = fakePlatformOriginX; fakePlatform.updateWorldMatrix(true, false);
  removeHintOutline();
  if (fakePlatformAttempt >= 1 && fakePlatformAttempt <= 4) createHintOutline(fakePlatformOriginX + PLATFORM_HINT_OFFSET);
}
export function updateFakePlatform(dt, wasOnPlatform) {
  if (!fakePlatform || !fakePlatformMoving) return;
  const dx = fakePlatformTargetX - fakePlatform.position.x;
  const maxStep = Math.sign(dx) * PLATFORM_SPEED * dt;
  const step = Math.abs(maxStep) >= Math.abs(dx) ? dx : maxStep;
  fakePlatform.position.x += step; fakePlatform.updateWorldMatrix(true, false);
  if (wasOnPlatform) yawObject.position.x += step;
  if (Math.abs(fakePlatformTargetX - fakePlatform.position.x) < 0.001) {
    fakePlatform.position.x = fakePlatformTargetX; fakePlatformMoving = false; fakePlatform.updateWorldMatrix(true, false);
  }
}
function checkNearPlatform() {
  if (!fakePlatform) return false;
  const px = yawObject.position.x, py = yawObject.position.y, pz = yawObject.position.z;
  const ox = fakePlatformOriginX, oy = fakePlatform.position.y, oz = fakePlatform.position.z;
  return px >= ox + TRIGGER_X_MIN && px <= ox + TRIGGER_X_MAX && pz >= oz + TRIGGER_Z_MIN && pz <= oz + TRIGGER_Z_MAX && py <= oy + TRIGGER_Y_MAX;
}
export function checkTriggerBoxEnter() {
  if (!fakePlatform || fakePlatformMoving || trapConfig.isDead || trapConfig.paused) return;
  const inBox = checkNearPlatform();
  if (inBox && !wasInTriggerBox) triggerFakePlatform();
  wasInTriggerBox = inBox;
}
export function checkIfOnPlatform() {
  if (!fakePlatform) return false;
  fakePlatform.updateWorldMatrix(true, false);
  rc.set(yawObject.position.clone(), new THREE.Vector3(0, -1, 0));
  rc.far = PLAYER_H + 0.3;
  const hits = rc.intersectObject(fakePlatform, false);
  return hits.length > 0 && hits[0].distance <= PLAYER_H + 0.08;
}

// ════════════ MAP 2 TRAPS ════════════
export const m2t = { t1: { meshes: [], floor: null, originY: 0, dist: 0, travel: 5.3, speedGo: 8, speedBack: 1, phase: 'idle' }, t2: { meshes: [], floor: null, originY: 0, dist: 0, travel: 6.4, speedGo: 8, speedBack: 1, phase: 'idle' } };
export function initMap2Trap(mesh) {
  const n = (mesh.name || '').toLowerCase(); let t = null;
  if (n.startsWith('trap_001')) t = m2t.t1; else if (n.startsWith('trap_002')) t = m2t.t2; else return false;
  if (t.meshes.length === 0) t.originY = mesh.position.y;
  t.meshes.push(mesh); if (!trapMeshes.includes(mesh)) trapMeshes.push(mesh);
  return true;
}
export function initMap2Floor(mesh) {
  const n = (mesh.name || '').toLowerCase(); if (!n.includes('floor')) return;
  mesh.updateWorldMatrix(true, false); mesh.userData.boundingBox = new THREE.Box3().setFromObject(mesh);
  if (n.includes('002') || n.includes('.002')) m2t.t1.floor = mesh;
  else if (n.includes('003') || n.includes('.003')) m2t.t2.floor = mesh;
  else if (n.includes('004') || n.includes('.004')) m2cua.floor = mesh;
}
export function updateMap2Traps(dt) {
  if (!trapConfig.mapLoaded) return;
  for (const t of [m2t.t1, m2t.t2]) {
    if (t.phase === 'idle' && t.floor && t.meshes.length > 0) {
      const fb = t.floor.userData.boundingBox.clone(); fb.max.y += PLAYER_H + 1; fb.expandByScalar(0.5);
      const pb = new THREE.Box3().setFromCenterAndSize(yawObject.position, new THREE.Vector3(PLAYER_RADIUS * 2, PLAYER_H, PLAYER_RADIUS * 2));
      if (fb.intersectsBox(pb)) { t.phase = 'going'; playSFX('swoosh', 1.0); }
    }
    if (t.phase === 'going') { t.dist += t.speedGo * dt; if (t.dist >= t.travel) { t.dist = t.travel; t.phase = 'back'; } }
    else if (t.phase === 'back') { t.dist -= t.speedBack * dt; if (t.dist <= 0) { t.dist = 0; t.phase = 'done'; } }
    else continue;
    const y = t.originY + t.dist; t.meshes.forEach(m => { m.position.y = y; m.updateWorldMatrix(true, false); });
  }
}
export function resetMap2Traps() { for (const t of [m2t.t1, m2t.t2]) { if (t.meshes.length > 0) { t.meshes.forEach(m => { m.position.y = t.originY; m.updateWorldMatrix(true, false); }); } t.dist = 0; t.phase = 'idle'; } }
export function fullResetMap2Traps() { for (const t of [m2t.t1, m2t.t2]) { t.meshes = []; t.floor = null; t.originY = 0; t.dist = 0; t.phase = 'idle'; } }

export const m2cua = { meshes: [], floor: null, triggered: false, finished: false, rotSpeed: 1000, moveSpeed: 30, logTimer: 0, sfx: null };
export function initMap2Cua(mesh) {
  mesh.updateWorldMatrix(true, false); const wx = mesh.matrixWorld.elements[12];
  mesh.userData.originWorldX = wx; mesh.userData.targetWorldX = -wx; mesh.userData.dir = mesh.userData.targetWorldX > mesh.userData.originWorldX ? 1 : -1;
  m2cua.meshes.push(mesh); if (!trapMeshes.includes(mesh)) trapMeshes.push(mesh);
}
export function updateMap2Cua(dt) {
  if (m2cua.meshes.length === 0 || m2cua.finished) return;
  const pp = yawObject.position;
  if (m2cua.triggered) {
    m2cua.meshes[0].updateWorldMatrix(true, false);
    if (pp.z < m2cua.meshes[0].matrixWorld.elements[14] - CUA_RESET_DIST) {
      m2cua.meshes.forEach(m => { m.updateWorldMatrix(true, false); const worldPos = new THREE.Vector3(); m.getWorldPosition(worldPos); worldPos.x = m.userData.originWorldX; if (m.parent) m.parent.worldToLocal(worldPos); m.position.copy(worldPos); m.updateWorldMatrix(true, false); });
      if (m2cua.sfx) { m2cua.sfx.pause(); m2cua.sfx = null; }
      m2cua.finished = true; return; 
    }
  }
  if (!m2cua.triggered) {
    if (!m2cua.floor) return;
    const fb = m2cua.floor.userData.boundingBox.clone(); fb.max.y += PLAYER_H + 1; fb.expandByScalar(0.5);
    if (!fb.intersectsBox(new THREE.Box3().setFromCenterAndSize(pp, new THREE.Vector3(PLAYER_RADIUS * 2, PLAYER_H, PLAYER_RADIUS * 2)))) return;
    m2cua.triggered = true; m2cua.sfx = playSFX('sawBlade1', 0.3, 1.0, true);
  }
  m2cua.meshes.forEach((mesh) => {
    const data = mesh.userData; mesh.updateWorldMatrix(true, false); const worldPos = new THREE.Vector3(); mesh.getWorldPosition(worldPos);
    worldPos.x += m2cua.moveSpeed * dt * data.dir;
    const minX = Math.min(data.originWorldX, data.targetWorldX), maxX = Math.max(data.originWorldX, data.targetWorldX);
    if (data.dir > 0 && worldPos.x >= maxX) { worldPos.x = maxX; data.dir = -1; }
    else if (data.dir < 0 && worldPos.x <= minX) { worldPos.x = minX; data.dir = 1; }
    if (mesh.parent) mesh.parent.worldToLocal(worldPos); mesh.position.copy(worldPos);
    mesh.rotateY(THREE.MathUtils.degToRad(m2cua.rotSpeed * dt)); mesh.updateWorldMatrix(true, false);
  });
}
export function resetMap2Cua() {
  if (m2cua.sfx) { m2cua.sfx.pause(); m2cua.sfx = null; }
  m2cua.meshes.forEach(m => {
    m.updateWorldMatrix(true, false); const worldPos = new THREE.Vector3(); m.getWorldPosition(worldPos);
    worldPos.x = m.userData.originWorldX; if (m.parent) m.parent.worldToLocal(worldPos); m.position.copy(worldPos);
    m.userData.dir = m.userData.targetWorldX > m.userData.originWorldX ? 1 : -1; m.updateWorldMatrix(true, false);
  });
  m2cua.triggered = false; m2cua.logTimer = 0; m2cua.finished = false;
}
export function fullResetMap2Cua() { m2cua.meshes = []; m2cua.floor = null; m2cua.triggered = false; m2cua.logTimer = 0; }

export const m2cua2 = { traps: [] };
export function initMap2Cua2(mesh) {
  mesh.updateWorldMatrix(true, false); const target = (mesh.parent && mesh.parent.type !== 'Scene') ? mesh.parent : mesh; target.updateWorldMatrix(true, false);
  const initBox = new THREE.Box3().setFromObject(target); const initSize = new THREE.Vector3(); const initCenter = new THREE.Vector3(); initBox.getSize(initSize); initBox.getCenter(initCenter);
  const isCua7 = (mesh.name || '').toLowerCase().startsWith('trap_cua_007');
  m2cua2.traps.push({ mesh, target, originY: target.position.y, triggered: false, finished: false, riseProgress: 0, killedBy: false, warningBox: null, isCua7, initSize, initCenterX: initCenter.x, initCenterY: initCenter.y, initCenterZ: initCenter.z });
  if (!trapMeshes.includes(mesh)) trapMeshes.push(mesh);
}
function createCua2WarningBox(t) {
  if (t.warningBox) return;
  let floorY = t.initCenterY; if (m2cua.floor) { m2cua.floor.updateWorldMatrix(true, false); floorY = new THREE.Box3().setFromObject(m2cua.floor).max.y + 0.05; }
  const triH = t.initSize.z; const C = 512; const cv = document.createElement('canvas'); cv.width = cv.height = C; const ctx = cv.getContext('2d');
  const br = C * 0.05, top = C * 0.06, bot = C * 0.94, mid = C * 0.5, lft = C * 0.06, rgt = C * 0.94;
  const pts = [{ x: mid, y: top }, { x: rgt, y: bot }, { x: lft, y: bot }];
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const prev = pts[(i+2)%3], cur = pts[i], next = pts[(i+1)%3];
    const d0 = Math.hypot(prev.x-cur.x, prev.y-cur.y), d1 = Math.hypot(next.x-cur.x, next.y-cur.y);
    const p0x = cur.x+br*(prev.x-cur.x)/d0, p0y = cur.y+br*(prev.y-cur.y)/d0, p1x = cur.x+br*(next.x-cur.x)/d1, p1y = cur.y+br*(next.y-cur.y)/d1;
    if (i===0) ctx.moveTo(p0x, p0y); else ctx.lineTo(p0x, p0y); ctx.quadraticCurveTo(cur.x, cur.y, p1x, p1y);
  }
  ctx.closePath(); ctx.fillStyle = 'rgba(220, 30, 10, 0.15)'; ctx.fill(); ctx.strokeStyle = 'rgba(255, 60, 20, 0.85)'; ctx.lineWidth = 14; ctx.stroke();
  ctx.fillStyle = '#FFE030'; ctx.font = `bold ${Math.round(C * 0.52)}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', mid, mid + C * 0.06);
  const tex = new THREE.CanvasTexture(cv); const geo = new THREE.PlaneGeometry(triH, triH); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat); mesh.position.set(t.initCenterX, floorY, t.initCenterZ); mesh.renderOrder = 999; scene.add(mesh); t.warningBox = mesh;
}
export function updateMap2Cua2(dt) {
  if (m2cua2.traps.length === 0) return;
  const pp = yawObject.position; const rad = THREE.MathUtils.degToRad(CUA2_ROT_SPEED * dt);
  m2cua2.traps.forEach(t => {
    if (t.finished) return;
    const trapWorldZ = t.mesh.matrixWorld.elements[14];
    if (t.triggered && pp.z < trapWorldZ - CUA_RESET_DIST) {
      t.target.position.y = t.originY; t.target.updateWorldMatrix(true, true); t.riseProgress = 0; t.finished = true;
      if (t.sfx) { t.sfx.pause(); t.sfx = null; }
      if (t.warningBox) t.warningBox.visible = false; return; 
    }
    if (t.isCua7) {
      if (!t.warningBox) { createCua2WarningBox(t); t.warningBox.visible = false; }
      if (Math.abs(pp.z - trapWorldZ) <= CUA7_WARN_DIST) t.warningBox.visible = true; 
    }
    if (!t.triggered && pp.z <= trapWorldZ + CUA2_TRIGGER_DIST && pp.z >= trapWorldZ - CUA_RESET_DIST) {
      t.triggered = true;
      const numMatch = t.mesh.name.toLowerCase().match(/trap_cua_00(\d)/);
      if (numMatch) {
        const num = parseInt(numMatch[1]); t.sfx = playSFX('sawBlade2', 0.3, 1.0, true); 
        if (num === 2) m2cua.stopRequested = true; 
        else if (num > 2) {
           const prevTrap = m2cua2.traps.find(x => x.mesh.name.toLowerCase().includes(`trap_cua_00${num - 1}`));
           if (prevTrap && prevTrap.sfx) { prevTrap.sfx.pause(); prevTrap.sfx = null; }
        }
      }
    }
    if (t.triggered && t.riseProgress < (t.isCua7 ? CUA7_FALL_DIST : CUA2_RISE_DIST)) {
      t.riseProgress += Math.min((t.isCua7 ? CUA7_FALL_SPEED : CUA2_RISE_SPEED) * dt, (t.isCua7 ? CUA7_FALL_DIST : CUA2_RISE_DIST) - t.riseProgress);
      t.target.position.y = t.isCua7 ? t.originY - t.riseProgress : t.originY + t.riseProgress;
      t.target.updateWorldMatrix(true, true);
    }
    t.mesh.rotateY(rad); t.mesh.updateWorldMatrix(true, false);
  });
}
export function resetMap2Cua2() {
  m2cua2.traps.forEach(t => {
    if (t.sfx) { t.sfx.pause(); t.sfx = null; }
    if (!t.isCua7 && t.killedBy) createCua2WarningBox(t);
    if (t.isCua7 && t.warningBox) { scene.remove(t.warningBox); t.warningBox.geometry.dispose(); if (t.warningBox.material.map) t.warningBox.material.map.dispose(); t.warningBox.material.dispose(); t.warningBox = null; }
    t.target.position.y = t.originY; t.target.updateWorldMatrix(true, true); t.triggered = false; t.finished = false; t.riseProgress = 0;
  });
}
export function fullResetMap2Cua2() {
  m2cua2.traps.forEach(t => { if (t.warningBox) { scene.remove(t.warningBox); t.warningBox.geometry.dispose(); if (t.warningBox.material.map) t.warningBox.material.map.dispose(); t.warningBox.material.dispose(); t.warningBox = null; } t.killedBy = false; });
  resetMap2Cua2(); m2cua2.traps = [];
}

// ════════════ CHEST TRAP ════════════
export let chestLidMeshes     = [];
export let chestBoxMeshes     = [];
export let chestOpened = false;
let chestOpening       = false;
let chestClosing       = false;
let chestLidAngle      = 0;
export let chestPromptVisible = false;
let chestKnockbackVX   = 0;
let chestKnockbackDir  = 0;

export function initChest(mesh) {
  const n = (mesh.name || '').toLowerCase();
  const parentN = (mesh.parent?.name || '').toLowerCase();
  const hasPush = n.includes('push') || parentN.includes('push');

  if (n.startsWith('chest_lid')) {
    mesh.userData.originRotX = mesh.rotation.x;
    mesh.userData.originRotY = mesh.rotation.y;
    mesh.userData.originRotZ = mesh.rotation.z;
    mesh.userData.hasPush    = hasPush;
    chestLidMeshes.push(mesh);
  }
  if (n.startsWith('chest_box')) {
    mesh.userData.hasPush = hasPush;
    chestBoxMeshes.push(mesh);
  }
}

export function showChestPrompt(show) {
  chestPromptVisible = show;
  let el = document.getElementById('chest-prompt');
  if (show) {
    const action = chestOpened ? 'Đóng' : 'Mở';
    if (!el) {
      el = document.createElement('div'); el.id = 'chest-prompt';
      el.style.cssText = `position:fixed;bottom:30%;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:12px;background:rgba(0,0,0,0.82);border:1px solid rgba(255,255,255,0.18);border-top:1px solid rgba(255,255,255,0.35);border-radius:12px;padding:12px 24px;pointer-events:none;z-index:50;backdrop-filter:blur(12px);box-shadow:0 8px 32px rgba(0,0,0,0.5);font-family:'Segoe UI',sans-serif;`;
      document.body.appendChild(el);
    }
    el.innerHTML = `<span style="background:linear-gradient(135deg,#ffffff22,#ffffff08);border:1.5px solid rgba(255,255,255,0.55);border-bottom:3px solid rgba(255,255,255,0.15);border-radius:7px;padding:3px 12px;font-weight:800;font-size:14px;letter-spacing:1px;color:#fff;text-shadow:0 1px 4px rgba(0,0,0,0.8);">F</span><span style="font-size:13px;letter-spacing:2px;color:rgba(255,255,255,0.85);">${action} Rương</span>`;
    el.style.display = 'flex';
  } else if (!show && el) { el.remove(); }
}

function openChest() {
  playSFX('chestOpen', 0.8, 2);
  if (chestOpened || chestOpening || chestClosing || chestLidMeshes.length === 0) return;
  chestOpening = true;
  const hasPush = chestBoxMeshes.some(m => m.userData.hasPush) || chestLidMeshes.some(m => m.userData.hasPush);
  if (hasPush) {
    chestKnockbackDir = Math.sin(trapConfig.yaw) > 0 ? -1 : 1;
    chestKnockbackVX  = CHEST_KNOCKBACK_SPEED;
  } else { chestKnockbackVX = 0; }
}

function closeChest() {
  playSFX('chestClose', 0.7, 2);
  if (!chestOpened || chestOpening || chestClosing) return;
  chestClosing = true; chestOpened  = false;
}

export function toggleChest() { if (chestOpened) closeChest(); else openChest(); }

export function checkChestLook() {
  if (chestBoxMeshes.length === 0 || chestOpening || chestClosing || !trapConfig.mapLoaded) return;
  const allChestMeshes = [...chestBoxMeshes, ...chestLidMeshes];
  let nearest = null; let nearDist = Infinity;
  allChestMeshes.forEach(mesh => {
    mesh.updateWorldMatrix(true, false);
    const wp = new THREE.Vector3(); mesh.getWorldPosition(wp);
    const d  = Math.sqrt((yawObject.position.x - wp.x)**2 + (yawObject.position.z - wp.z)**2);
    if (d < nearDist) { nearDist = d; nearest = mesh; }
  });
  if (!nearest || nearDist > CHEST_INTERACT_DIST) { showChestPrompt(false); return; }
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  rc.set(yawObject.position, dir); rc.far = CHEST_INTERACT_DIST;
  const hits = rc.intersectObjects(allChestMeshes, false);
  showChestPrompt(hits.length > 0);
}

export function updateChest(dt) {
  if (chestOpening && chestLidMeshes.length > 0) {
    chestLidAngle += dt * 3.0;
    if (chestLidAngle >= Math.PI / 2) {
      chestLidAngle = Math.PI / 2; chestOpening  = false; chestOpened   = true;
      if(trapConfig.spawnLoot) trapConfig.spawnLoot();
    }
    chestLidMeshes.forEach(m => { m.rotation.x = (m.userData.originRotX || 0) + chestLidAngle; });
  }
  if (chestClosing && chestLidMeshes.length > 0) {
    chestLidAngle -= dt * 3.0;
    if (chestLidAngle <= 0) { chestLidAngle = 0; chestClosing  = false; }
    chestLidMeshes.forEach(m => { m.rotation.x = (m.userData.originRotX || 0) + chestLidAngle; });
  }
  if (Math.abs(chestKnockbackVX) > 0.01) {
    yawObject.position.z += chestKnockbackDir * chestKnockbackVX * dt;
    chestKnockbackVX  *= 0.85;
    if (Math.abs(chestKnockbackVX) < 0.01) chestKnockbackVX = 0;
  }
}

export function resetChest() {
  chestLidMeshes.forEach(m => { m.rotation.x = m.userData.originRotX || 0; });
  chestOpened = false; chestOpening = false; chestClosing = false; chestLidAngle = 0; chestKnockbackVX = 0;
  if (trapConfig.hideLoot) trapConfig.hideLoot();
  showChestPrompt(false);
  const el = document.getElementById('hehe-overlay'); if (el) el.remove();
}

export function fullResetChest() { resetChest(); chestLidMeshes.length = 0; chestBoxMeshes.length = 0; }

// src/entities/Trap.js (Dán vào cuối file)

let animWalls = [];

export function initAnimWall(mesh) {
  const n = (mesh.name || '').toLowerCase();
  const cfg = WALL_CONFIGS[n] || { checkX: false, triggerXMin: -9999, checkZ: false, triggerZ: 9999 };
  
  animWalls.push({
    mesh, 
    originY: mesh.position.y, 
    currentY: mesh.position.y,
    triggered: false, 
    moving: false, 
    smokeAxis: cfg.smokeAxis || 'X', 
    smokeFlip: cfg.smokeFlip || false,
    checkX: cfg.checkX, 
    triggerXMin: cfg.triggerXMin,
    checkZ: cfg.checkZ, 
    triggerZ: cfg.triggerZ,
    sfx: null
  });
  console.log('[Wall] Init:', mesh.name);
}

export function checkWallTriggers(yawObject) {
  animWalls.forEach(w => {
    if (w.triggered) return;
    const px = yawObject.position.x;
    const pz = yawObject.position.z;
    const xOk = !w.checkX || px >= w.triggerXMin;
    const zOk = !w.checkZ || pz <= w.triggerZ;
    
    if (xOk && zOk) {
      w.triggered = true;
      w.moving = true;
      triggerEarthquake(4.0, 0.3); 
      w.sfx = playSFX('wallRise', 1.0);
      
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
    }
  });
}

export function updateAnimWalls(dt) {
  animWalls.forEach(w => {
    if (!w.moving) return;
    const targetY = w.originY + WALL_RISE_AMOUNT;
    const remaining = targetY - w.currentY;

    if (remaining <= 0.001) {
      w.currentY = targetY;
      w.mesh.position.y = targetY;
      w.moving = false;
      w.mesh.updateWorldMatrix(true, false);
      if (w.sfx) { w.sfx.pause(); w.sfx = null; }
      return;
    }

    const step = Math.min(WALL_RISE_SPEED * dt, remaining);
    w.currentY += step;
    w.mesh.position.y = w.currentY;
    w.mesh.updateWorldMatrix(true, false);
  });
}

export function resetAnimWalls() {
  animWalls.forEach(w => { 
    w.currentY = w.originY; 
    w.mesh.position.y = w.originY; 
    w.triggered = false; 
    w.moving = false; 
    w.mesh.updateWorldMatrix(true, false);
    if (w.sfx) { w.sfx.pause(); w.sfx = null; }
  });
}
