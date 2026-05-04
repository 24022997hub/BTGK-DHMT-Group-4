// src/managers/InputManager.js
export const keys = {};
export let mouseDX = 0;
export let mouseDY = 0;

export function initInput(onKeyDown) { // <--- Nhận hàm callback từ main.js
  document.addEventListener('keydown', e => { 
    keys[e.code] = true; 
    if (onKeyDown) onKeyDown(e); // <--- Gọi hàm xử lý phím của main.js
  });
  document.addEventListener('keyup', e => { keys[e.code] = false; });
  
  document.addEventListener('mousemove', e => {
    mouseDX += Math.max(-40, Math.min(40, e.movementX));
    mouseDY += Math.max(-40, Math.min(40, e.movementY));
  });
}

export function consumeMouseDelta() {
  const res = { x: mouseDX, y: mouseDY };
  mouseDX = 0; mouseDY = 0;
  return res;
}