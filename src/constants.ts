/** Gamepad button codes and timing constants for Projacktor */

export const BUTTON = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  L1: 4,
  R1: 5,
  L2: 6,
  R2: 7,
  SELECT: 8,
  START: 9,
  L3: 10,
  R3: 11,
  DPAD_UP: 12,
  DPAD_DOWN: 13,
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15,
  QUICK_ACCESS: 20,
  STEAM: 28,
} as const;

export const TIMING = {
  DEBOUNCE: 250,
  CONTROLS_HIDE: 3000,
  HUD_HIDE: 1500,
  VOLUME_COOLDOWN: 120,
  SEEK_STEP_SMALL: 10,
  SEEK_STEP_MEDIUM: 30,
  SEEK_STEP_LARGE: 60,
  VOLUME_STEP: 0.05,
} as const;

export const FOCUS_DELAYS = [40, 120, 260] as const;
