// src/entities/Player.js
import * as THREE from 'three';
import { SPEED, RUN_SPEED, JUMP_FORCE, GRAVITY, PLAYER_H, PLAYER_RADIUS, DEATH_Y, SPAWN_X, SPAWN_Y, SPAWN_Z } from '../utils/constants.js';
import { yawObject, camera } from '../core/Renderer.js';
import { playSFX, updateFootstep } from '../managers/AudioManager.js';
import { rc, collisionMeshes, trapMeshes } from '../physics/Collider.js';

export let playerVY = 0;
export let isOnGround = false;
let _prevOnGround = false;

export function updatePlayer(dt, keys, devMode, yaw, wasOnPlatform, wasJumping, mapLoaded, triggerDeathFn) {
  const isRunning = keys['ShiftLeft'] || keys['ShiftRight'];
  const speed = isRunning ? RUN_SPEED : SPEED;
  const dir = new THREE.Vector3();
  const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

  // --- CHẾ ĐỘ DEV ---
  if (devMode) {
    const devSpeed = isRunning ? 30 : 15;
    const fwd3D = new THREE.Vector3(); camera.getWorldDirection(fwd3D);
    if (keys['KeyW']) dir.add(fwd3D); if (keys['KeyS']) dir.sub(fwd3D);
    if (keys['KeyA']) dir.sub(right); if (keys['KeyD']) dir.add(right);
    if (keys['Space']) dir.y += 1; if (keys['KeyC']) dir.y -= 1;
    if (dir.length() > 0) yawObject.position.add(dir.normalize().multiplyScalar(devSpeed * dt));
    return { wasOnPlatform, wasJumping };
  }

  // --- DI CHUYỂN BÌNH THƯỜNG ---
  if (keys['KeyW']) dir.add(forward); if (keys['KeyS']) dir.sub(forward);
  if (isOnGround) { if (keys['KeyA']) dir.sub(right); if (keys['KeyD']) dir.add(right); }

  if (dir.length() > 0) {
    dir.normalize().multiplyScalar(speed * dt);
    // CCD check tường
    const checkHeights = [yawObject.position.y - PLAYER_H * 0.8, yawObject.position.y - PLAYER_H * 0.4, yawObject.position.y - PLAYER_H * 0.05];
    for (const hy of checkHeights) {
      rc.set(new THREE.Vector3(yawObject.position.x, hy, yawObject.position.z), dir.clone().normalize());
      rc.far = dir.length() + PLAYER_RADIUS;
      const wHits = rc.intersectObjects(collisionMeshes, false);
      if (wHits.length > 0 && wHits[0].face) {
        const n = wHits[0].face.normal.clone().transformDirection(wHits[0].object.matrixWorld);
        n.y = 0; n.normalize();
        const dot = dir.dot(n); if (dot < 0) dir.addScaledVector(n, -dot);
      }
    }
    yawObject.position.add(dir);
    updateFootstep(dir.length(), isOnGround, isRunning);
  }

  // --- NHẢY & TRỌNG LỰC ---
  const justJumped = isOnGround && keys['Space'] && !wasJumping;
  if (justJumped) { playerVY = JUMP_FORCE; isOnGround = false; }

  if (mapLoaded) {
    playerVY += GRAVITY * dt;
    const dy = playerVY * dt;
    const prevY = yawObject.position.y;
    const nextY = prevY + dy;

    if (dy < 0) {
      rc.set(new THREE.Vector3(yawObject.position.x, prevY, yawObject.position.z), new THREE.Vector3(0, -1, 0));
      rc.far = Math.abs(dy) + PLAYER_H + 0.2;
      const hits = rc.intersectObjects([...collisionMeshes, ...trapMeshes], false);
      if (hits.length > 0) {
        if (trapMeshes.includes(hits[0].object)) { triggerDeathFn('trap: ' + hits[0].object.name); return { wasOnPlatform, wasJumping }; }
        const floorY = hits[0].point.y + PLAYER_H;
        if (floorY >= nextY) { yawObject.position.y = floorY; playerVY = 0; isOnGround = true; } 
        else { yawObject.position.y = nextY; isOnGround = false; }
      } else { yawObject.position.y = nextY; isOnGround = false; }
    } else { yawObject.position.y = nextY; isOnGround = false; }

    if (yawObject.position.y < DEATH_Y) triggerDeathFn('fell into pit');
  }

  if (!_prevOnGround && isOnGround) playSFX('footstep', 1);
  _prevOnGround = isOnGround;
  return { wasOnPlatform, wasJumping: keys['Space'] };
}

export function resetPlayer() {
  yawObject.position.set(SPAWN_X, SPAWN_Y, SPAWN_Z);
  playerVY = 0; isOnGround = false; _prevOnGround = false;
}