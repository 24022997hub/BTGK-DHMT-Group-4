// src/utils/constants.js

export const SPEED         = 7;
export const RUN_SPEED     = 12;
export const JUMP_FORCE    = 13;
export const GRAVITY       = -25;
export const PLAYER_H      = 5;
export const PLAYER_RADIUS = 0.35;
export const DEATH_Y       = -1000;

export const SPAWN_X = 0;
export const SPAWN_Y = PLAYER_H;
export const SPAWN_Z = 0;

export const FLAME_Y_OFFSET   = 0.5;
export const TORCH_SHOW_DIST  = 30;
export const TORCH_LIGHT_DIST = 30;
export const MAX_ACTIVE_LIGHTS = 2;

export const MOVING_TRAP_TRIGGER_Z = -51.0;
export const MOVING_TRAP_SPEED     = 30.0;
export const MOVING_TRAP_TRAVEL    = 102.0;

export const TRAP5_SPEED  = 13.5;
export const TRAP5_TRAVEL = 164;

export const CHEST_INTERACT_DIST   = 5.0;
export const CHEST_KNOCKBACK_SPEED = 90.0;

export const LOOT_PICKUP_DIST     = 11.0;
export const PORTAL_TELEPORT_DIST = 0.6;

export const WALL_RISE_AMOUNT = 20.0;
export const WALL_RISE_SPEED  = 5.0;
export const WALL_CONFIGS = {
  'animate_wall_001': { checkX: true,  triggerXMin: 8.5,   checkZ: false, triggerZ: 9999,   smokeAxis: 'Z', smokeFlip: false  },
  'animate_wall_002': { checkX: false, triggerXMin: -9999, checkZ: true,  triggerZ: -163.5, smokeAxis: 'X', smokeFlip: true },
};

export const SPIDER_TRIGGER_DIST  = 80.0;
export const SPIDER_FLY_SPEED     = 100.0;
export const SPIDER_STOP_X        = 10;
export const SPIDER_RETURN_TRIG_X = 100.0;
export const SPIDER_FLY_ROT  = { x: 0, y: Math.PI / 2, z: 0 };
export const SPIDER_HIT_ROT  = { x: Math.PI / 2, y: 0, z: -Math.PI / 2 };
export const SPIDER_BACK_ROT = { x: 0, y: -Math.PI / 2, z: 0 };

export const TRIGGER_X_MIN = -1.0;
export const TRIGGER_X_MAX = 5.0;
export const TRIGGER_Z_MIN = -1.0;
export const TRIGGER_Z_MAX = 2.0;
export const TRIGGER_Y_MAX = 10.0;

export const PLATFORM_HINT_OFFSET = 2.0;
export const PLATFORM_SHIFT_1     = 2.0;
export const PLATFORM_SHIFT_2     = 4.0;
export const PLATFORM_SHIFT_3     = 4.0;
export const PLATFORM_SPEED       = 50.0;

export const CUA2_ROT_SPEED    = 2000;
export const CUA2_TRIGGER_DIST = 10;
export const CUA2_RISE_DIST    = 3.0;
export const CUA_RESET_DIST    = 5.0;
export const CUA2_RISE_SPEED   = 5;

export const CUA7_FALL_DIST  = 8.0;
export const CUA7_FALL_SPEED = 10.0;
export const CUA7_WARN_DIST  = 20.0;

export const PORTAL_DEST = { x: 0, y: 2, z: -10 };