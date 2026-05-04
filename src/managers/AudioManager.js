// src/managers/AudioManager.js

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
  platformMove:`${_BASE}/audio/platform_move.ogg`,
  swoosh:      `${_BASE}/audio/swoosh.ogg`,
  wallRise:    `${_BASE}/audio/wall_rise.ogg`,
  spiderHiss:  `${_BASE}/audio/spider_hiss.ogg`,
  spiderAttack:`${_BASE}/audio/spider_attack.ogg`,
  lavaDeath:   `${_BASE}/audio/lava_death.ogg`,
  sawBlade1:   `${_BASE}/audio/saw_blade_1.ogg`,
  sawBlade2:   `${_BASE}/audio/saw_blade_2.ogg`,
};

const _audio = {};        
const _sfxBuffers = {};   
let _audioCtx = null;     

export function _initAudioCtx() {
  if (_audioCtx) return;
  _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

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

export function preloadAudio() {
  Object.keys(AUDIO_FILES).forEach(k => {
    if (k.startsWith('bg')) _getAudio(k);
    else _preloadSFX(k);
  });
}

export function playSFX(key, volume = 1.0, speed = 1.0, loop = false) { 
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
        gainNode.gain.setTargetAtTime(0, _audioCtx.currentTime, 0.015);
        setTimeout(() => { try { source.stop(); } catch(e){} }, 50);
      } catch(e){} 
    },
    setVolume: (v) => { gainNode.gain.value = Math.max(0, Math.min(1, v)); },
    currentTime: 0
  };
}

let _currentBG = null;
let _currentBGKey = null;

export function playBGM(key, volume = 0.4, fadeDuration = 1.0) {
  if (_currentBGKey === key) return; 
  _initAudioCtx();

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

export function stopBGM() { playBGM(null); }

let _footstepDist = 0;
let _lastFootstepAudio = null;
const FOOTSTEP_INTERVAL = 3.5; 

export function updateFootstep(movedDist, onGround, isRunning) {
  if (!onGround || movedDist <= 0) return;
  _footstepDist += movedDist;
  
  if (_footstepDist >= FOOTSTEP_INTERVAL) {
    _footstepDist %= FOOTSTEP_INTERVAL;
    
    if (_lastFootstepAudio) {
      _lastFootstepAudio.pause();
    }
    
    const vol = isRunning ? 0.5 : 0.3;
    _lastFootstepAudio = playSFX('footstep', vol);
  }
}

export function resetFootstepDist() {
  _footstepDist = 0;
}