// src/entities/Torch.js
import * as THREE from 'three';
import { FLAME_Y_OFFSET, MAX_ACTIVE_LIGHTS, TORCH_LIGHT_DIST, TORCH_SHOW_DIST } from '../utils/constants.js';
import { scene, yawObject } from '../core/Renderer.js';
import { playSFX } from '../managers/AudioManager.js';

export const torches = [];
let _sharedLights = null;
let _lastTorchIgniteTime = 0;

function makeFlameTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
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

export function initTorch(mesh) {
  const n = mesh.name.toLowerCase();
  if (n.endsWith('_2')) return; 

  const wp = new THREE.Vector3();
  const obj = mesh.parent && mesh.parent.type !== 'Scene' ? mesh.parent : mesh;
  obj.updateWorldMatrix(true, false);
  wp.x = obj.matrixWorld.elements[12];
  wp.y = obj.matrixWorld.elements[13];
  wp.z = obj.matrixWorld.elements[14];

  const fx = wp.x;
  const fy = wp.y + FLAME_Y_OFFSET;
  const fz = wp.z;

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
    sp.renderOrder = 999;
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

  torches.push({ sprites, basePos: new THREE.Vector3(fx, fy, fz), timer: Math.random() * 10, visible: false });
}

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

export function updateTorches(dt) {
  if (!yawObject) return;
  const camPos = yawObject.position;
  const lights = getSharedLights();

  torches.forEach(t => { t.timer += dt; t._isLitNow = false; });

  const nearby = torches
    .map(t => ({ t, dist: camPos.distanceTo(t.basePos) }))
    .filter(x => x.dist < TORCH_LIGHT_DIST)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, MAX_ACTIVE_LIGHTS);

  const _t = performance.now() / 1000;
  const sharedFlicker = 1.0 + Math.sin(_t * 7.3) * 0.15 + Math.sin(_t * 13.1) * 0.1 + Math.sin(_t * 23.7) * 0.05;
  const now = performance.now();

  for (let i = 0; i < lights.length; i++) {
    const light = lights[i];
    const entry = nearby[i];
    
    if (!entry) { light.intensity = 0; continue; }
    const t = entry.t;
    t._isLitNow = true;

    if (!t._wasLitLastFrame && (now - _lastTorchIgniteTime > 500)) {
        let vol = 1.0 - (entry.dist / TORCH_LIGHT_DIST);
        playSFX('torch', Math.max(0.4, Math.min(1.0, vol + 0.2))); 
        _lastTorchIgniteTime = now; 
    }

    light.intensity = 30.0 * sharedFlicker;
    light.position.set(t.basePos.x, t.basePos.y + 0.3, t.basePos.z);
    light.distance = 40;
  }

  torches.forEach(t => { t._wasLitLastFrame = t._isLitNow; });

  torches.forEach(t => {
    const near = camPos.distanceTo(t.basePos) < TORCH_SHOW_DIST;
    if (near !== t.visible) {
      t.visible = near;
      t.sprites.forEach(s => { s.sprite.visible = near; });
    }
    if (!near) return;

    t.sprites.forEach((s, i) => {
      const wX = Math.sin(t.timer * 4.5 + s.phase) * 0.07;
      const wY = Math.abs(Math.sin(t.timer * 3.2 + s.phase)) * 0.09;
      s.sprite.position.set(s.baseX + wX, s.baseY + wY, s.baseZ);
      const sc = s.baseSize * (0.9 + Math.sin(t.timer * 6.5 + s.phase + i) * 0.1);
      s.sprite.scale.set(sc, sc * 1.6, 1);
      s.sprite.material.opacity = s.baseOp + Math.sin(t.timer * 10.0 + s.phase) * 0.08;
    });
  });
}

export function resetTorches() {
  torches.forEach(t => {
    t.sprites.forEach(s => { scene.remove(s.sprite); s.sprite.material.dispose(); });
  });
  torches.length = 0;
  if (_sharedLights) _sharedLights.forEach(l => { l.intensity = 0; });
}