/**
 * main.ts — Phaser game init ONLY (CLAUDE.md). No game logic here.
 *
 * Rendering is locked: 480×270 internal resolution, pixel-art, FIT-scaled and
 * centred. The look is chunky on purpose — do not "fix" the pixels.
 *
 * Mobile-first / touch conventions (carried into every scene):
 *  - Mobile-first: portrait (270×480) and landscape (480×270) both playable.
 *  - Touch is the primary input. ui/TouchControls.ts emits the SAME events as
 *    keyboard, so scenes never branch on input source (CLAUDE.md rule 5).
 *  - Honour `prefers-reduced-motion`: the CRT scanline overlay and screen shake
 *    default OFF when the OS requests reduced motion (toggleable in Settings).
 *
 */

import Phaser from 'phaser';
import { COLOUR_HEX } from './config';
import { bindResponsiveLayout, getInitialLayout } from './systems/Layout';

import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { MenuScene } from './scenes/MenuScene';
import { DriveScene } from './scenes/DriveScene';
import { GameOverScene } from './scenes/GameOverScene';
import { BossScene } from './scenes/BossScene';
import { VictoryScene } from './scenes/VictoryScene';
import { ScoreboardScene } from './scenes/ScoreboardScene';
import { LevelSelectScene } from './scenes/LevelSelectScene';
import { SettingsScene } from './scenes/SettingsScene';
import { CreditsScene } from './scenes/CreditsScene';

/** Whether the player's OS asks us to minimise motion (WCAG 2.1). */
export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const bootLayout = getInitialLayout();

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-root',
  backgroundColor: COLOUR_HEX.textDark,
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: bootLayout.width,
    height: bootLayout.height,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [
    BootScene,
    PreloadScene,
    MenuScene,
    LevelSelectScene,
    DriveScene,
    GameOverScene,
    BossScene,
    VictoryScene,
    ScoreboardScene,
    SettingsScene,
    CreditsScene,
  ],
};

// eslint-disable-next-line no-new -- Phaser.Game registers itself on construction.
const game = new Phaser.Game(config);
bindResponsiveLayout(game);

/** Give the Phaser canvas an accessible name (parent role=application already set). */
const labelGameCanvas = (): void => {
  const canvas = document.querySelector('#game-root canvas');
  if (!(canvas instanceof HTMLCanvasElement)) return;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    'DoorPeach Apocalypse game canvas. Use on-screen controls or keyboard to play.',
  );
};
labelGameCanvas();
game.events.once(Phaser.Core.Events.READY, labelGameCanvas);

if (import.meta.env.DEV) {
  (window as unknown as { __GAME__: Phaser.Game }).__GAME__ = game;
}
