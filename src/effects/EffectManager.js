import * as THREE from 'three';
import { scene, pitchObject } from '../core/Renderer.js';

// --- Earthquake (Rung chấn) ---
let earthquakeTimer = 0, earthquakeDuration = 0, earthquakeIntensity = 0;
let _eqOffX = 0, _eqOffY = 0, _eqNoiseX = 0, _eqNoiseY = 0;

export function triggerEarthquake(duration, intensity) {
  earthquakeTimer = duration; earthquakeDuration = duration; earthquakeIntensity = intensity;
}

export function updateEarthquake(dt) {
  pitchObject.position.x -= _eqOffX; pitchObject.position.y -= _eqOffY;
  _eqOffX = 0; _eqOffY = 0;
  if (earthquakeTimer <= 0) return;
  earthquakeTimer -= dt;
  if (earthquakeTimer <= 0) {
    earthquakeTimer = 0; pitchObject.position.set(0, 0, 0);
    _eqNoiseX = 0; _eqNoiseY = 0; return;
  }
  const t = earthquakeTimer / earthquakeDuration, mag = earthquakeIntensity * t;
  const noiseSpeed = 18.0;
  _eqNoiseX += ((Math.random() - 0.5) * 2 - _eqNoiseX) * Math.min(noiseSpeed * dt, 1);
  _eqNoiseY += ((Math.random() - 0.5) * 2 - _eqNoiseY) * Math.min(noiseSpeed * dt, 1);
  _eqOffX = _eqNoiseX * mag; _eqOffY = _eqNoiseY * mag * 0.5;
  pitchObject.position.x += _eqOffX; pitchObject.position.y += _eqOffY;
}

// --- Smoke (Khói bụi) ---
const smokeEmitters = [];
let _smokeTex = null;

function getSmokeTex() {
  if (_smokeTex) return _smokeTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d'), g = ctx.createRadialGradient(32,32,0, 32,32,32);
  g.addColorStop(0, 'rgba(200,180,150,1)'); g.addColorStop(1, 'rgba(100,85,65,0)');
  ctx.fillStyle = g; ctx.fillRect(0,0,64,64);
  _smokeTex = new THREE.CanvasTexture(c); return _smokeTex;
}

export function spawnSmokePuff(wx, wz, wallW, wallD, axis, flip = false) {
  const tex = getSmokeTex(), flipSign = flip ? -1 : 1, particles = [];
  for (let i = 0; i < 40; i++) {
    const alongX = (Math.random()-0.5) * wallW * 3.0;
    const alongZ = (Math.random()-0.5) * wallD * 3.0;
    const outward = (Math.random() * 3.0) * flipSign;
    const px = axis === 'X' ? wx + alongX : wx + alongX + outward;
    const pz = axis === 'Z' ? wz + alongZ : wz + alongZ + outward;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, color: 0xc8b89a }));
    sp.scale.set(1.5, 1.5, 1); sp.position.set(px, 0.5, pz); sp.renderOrder = 999;
    scene.add(sp);
    particles.push({ sp, sz: 1.5, x: px, y: 0.5, z: pz, vx: (Math.random()-0.5)*2, vy: 0.5+Math.random(), vz: (Math.random()-0.5)*2 });
  }
  smokeEmitters.push({ particles, life: 0, maxLife: 4.0, maxOp: 0.1 });
}

export function updateSmokePuffs(dt) {
  for (let i = smokeEmitters.length-1; i >= 0; i--) {
    const e = smokeEmitters[i]; e.life += dt;
    const t = Math.min(e.life / e.maxLife, 1), op = t < 0.2 ? e.maxOp*(t/0.2) : e.maxOp*(1-(t-0.2)/0.8);
    e.particles.forEach(p => {
      p.y += p.vy*dt; p.sp.position.y = p.y;
      p.sp.material.opacity = op;
    });
    if (e.life >= e.maxLife) {
      e.particles.forEach(p => { scene.remove(p.sp); p.sp.material.dispose(); });
      smokeEmitters.splice(i, 1);
    }
  }
}