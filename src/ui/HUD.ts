import Phaser from 'phaser';
import { COLOURS, COLOUR_HEX } from '../config';
import { getLayout } from '../systems/Layout';

/** Live values the HUD renders each frame. */
export interface HudState {
  lives: number;
  ammo: number;
  score: number;
  secondsLeft: number;
}

/**
 * HUD — lives, ammo, score and the level timer (CLAUDE.md: HUD lives in ui/).
 * Bungee for the level title, JetBrains Mono for tabular readouts. Colours come
 * from config tokens; pairings are chosen for legibility on the dark road.
 */

export class HUD {
  private readonly timerText: Phaser.GameObjects.Text;
  private readonly livesText: Phaser.GameObjects.Text;
  private readonly ammoText: Phaser.GameObjects.Text;
  private readonly scoreText: Phaser.GameObjects.Text;
  private readonly timerBgGraphics: Phaser.GameObjects.Graphics;
  private readonly footerBgGraphics: Phaser.GameObjects.Graphics;

  // Last rendered values
  private lastLives = NaN;
  private lastAmmo = NaN;
  private lastScore = NaN;
  private lastSeconds = NaN;

  constructor(scene: Phaser.Scene, levelName: string) {
    const { width, centerX, hud } = getLayout();

    // Top banner backdrop
    this.timerBgGraphics = scene.add.graphics();
    this.timerBgGraphics.fillStyle(COLOURS.textDark, 0.85);
    this.timerBgGraphics.fillRect(centerX - 90, 8, 180, 44);
    this.timerBgGraphics.lineStyle(1, COLOURS.cyan, 0.6);
    this.timerBgGraphics.strokeRect(centerX - 89.5, 8.5, 179, 43);

    scene.add
      .text(centerX, hud.titleY, levelName.toUpperCase(), {
        fontFamily: 'Bungee',
        fontSize: '16px',
        color: COLOUR_HEX.text,
      })
      .setOrigin(0.5);

    this.timerText = scene.add
      .text(centerX, hud.timerY, '', { fontFamily: 'Bungee', fontSize: '13px', color: COLOUR_HEX.caution })
      .setOrigin(0.5);

    // Footer indicator panel backdrop
    this.footerBgGraphics = scene.add.graphics();
    this.footerBgGraphics.fillStyle(COLOURS.textDark, 0.9);
    this.footerBgGraphics.fillRect(10, hud.footerY - 10, width - 20, 20);
    this.footerBgGraphics.lineStyle(1, COLOURS.hazard, 0.7);
    this.footerBgGraphics.strokeRect(10.5, hud.footerY - 9.5, width - 21, 19);

    this.livesText = scene.add
      .text(hud.livesX, hud.footerY, '', { fontFamily: 'JetBrains Mono', fontSize: '9px', color: COLOUR_HEX.hazard })
      .setOrigin(0.5);

    this.ammoText = scene.add
      .text(hud.ammoX, hud.footerY, '', { fontFamily: 'JetBrains Mono', fontSize: '9px', color: COLOUR_HEX.cyan })
      .setOrigin(0.5);

    this.scoreText = scene.add
      .text(hud.scoreX, hud.footerY, '', { fontFamily: 'JetBrains Mono', fontSize: '9px', color: COLOUR_HEX.bile })
      .setOrigin(0.5);

    scene.add
      .text(centerX, hud.hintY, 'A/D ←→ steer • S↓ brake • SPACE fire • P/ESC menu', {
        fontFamily: 'JetBrains Mono',
        fontSize: '6px',
        color: COLOUR_HEX.footpath,
      })
      .setOrigin(0.5);
  }

  update(state: HudState): void {
    if (state.lives !== this.lastLives) {
      this.lastLives = state.lives;
      const hearts = '♥'.repeat(Math.max(0, state.lives));
      this.livesText.setText(`HP ${hearts}`);
    }
    if (state.ammo !== this.lastAmmo) {
      this.lastAmmo = state.ammo;
      this.ammoText.setText(`PEN:${state.ammo}`);
    }
    if (state.score !== this.lastScore) {
      this.lastScore = state.score;
      this.scoreText.setText(`SCORE:${state.score}`);
    }
    const secs = Math.max(0, Math.ceil(state.secondsLeft));
    if (secs !== this.lastSeconds) {
      this.lastSeconds = secs;
      this.timerText.setText(`⏱ ${secs}s`);
    }
  }
}