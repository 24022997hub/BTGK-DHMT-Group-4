// src/core/Renderer.js
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SPAWN_X, SPAWN_Y, SPAWN_Z } from '../utils/constants.js';

export let renderer, scene, camera, clock, composer;
export let yawObject, pitchObject;

export function initRenderer() {
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
  pitchObject = new THREE.Object3D();
  pitchObject.add(camera);

  yawObject = new THREE.Object3D();
  yawObject.add(pitchObject);
  yawObject.position.set(SPAWN_X, SPAWN_Y, SPAWN_Z);
  scene.add(yawObject);

  clock = new THREE.Clock();

  // Bloom post-processing
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
  window.THREE            = THREE;
}

export function setupLights() {
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