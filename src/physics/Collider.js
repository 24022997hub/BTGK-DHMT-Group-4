// src/physics/Collider.js
import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

// Cài đặt plugin BVH cho bản lề của Three.js để tối ưu tốc độ tính toán va chạm (đỡ lag)
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export const rc = new THREE.Raycaster();
export const collisionMeshes = [];
export const trapMeshes = [];