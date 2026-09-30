import Phaser from 'phaser';
import { SCENES, COLOURS, COLOUR_HEX } from '../config';
import { Audio } from '../systems/Audio';
import { Persistence } from '../systems/Persistence';
import { CrtOverlay } from '../ui/CrtOverlay';
import { getLayout } from '../systems/Layout';

/** Data passed from BossScene on a win. */
export interface VictoryData {
  score: number;
}

/**
 * VictoryScene — "Kew is safe. For now." Confetti, skyline, the final run score,
 * then on into the scoreboard to enter initials (docs/BRIEF.md).
 */
export class VictoryScene extends Phaser.Scene {
  private finalScore = 0;

  constructor() {
    super(SCENES.Victory);
  }

  init(data: VictoryData): void {
    this.finalScore = data.score ?? 0;
  }

  create(): void {
    const { width, height, centerX, centerY } = getLayout();
    this.add.rectangle(centerX, centerY, width, height, COLOURS.textDark).setOrigin(0.5);
    this.drawSkyline();
    if (!Persistence.getSettings().reducedMotion) this.dropConfetti();

    this.add
      .text(centerX, height * 0.26, 'KEW IS SAFE.', { fontFamily: 'Bungee', fontSize: '30px', color: COLOUR_HEX.bile })
      .setOrigin(0.5);
    this.add
      .text(centerX, height * 0.37, 'FOR NOW.', { fontFamily: 'Bungee', fontSize: '18px', color: COLOUR_HEX.text })
      .setOrigin(0.5);

    this.add
      .text(centerX, height * 0.51, `FINAL SCORE: ${this.finalScore}`, {
        fontFamily: 'JetBrains Mono',
        fontSize: '12px',
        color: COLOUR_HEX.caution,
      })
      .setOrigin(0.5);

    const btn1Y = height * 0.69;
    const btn2Y = height * 0.8;
    this.drawButtonPanel(btn1Y, btn2Y);

    const goToScoreboard = (): void => {
      this.scene.start(SCENES.Scoreboard, { score: this.finalScore, levelReached: 5 });
    };

    const goToMenu = (): void => {
      this.scene.start(SCENES.Menu);
    };

    this.createButton('[ENTER] INITIALS', btn1Y, goToScoreboard);
    this.createButton('[M] MENU', btn2Y, goToMenu);

    this.input.keyboard?.on('keydown', (ev: KeyboardEvent) => {
      if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'i' || ev.key === 'I') {
        goToScoreboard();
      } else if (ev.key === 'Escape' || ev.key === 'm' || ev.key === 'M') {
        goToMenu();
      }
    });

    const audio = this.registry.get('audio') as Audio | undefined;
    if (audio && !audio.isMuted) {
      try {
        audio.playSfx('victorySting', 0.9);
      } catch (e) {
        console.info('[Victory] sting failed:', e);
      }
    }

    new CrtOverlay(this);
  }

  private drawSkyline(): void {
    const { width, height } = getLayout();
    const scale = width / 480;
    const g = this.add.graphics();
    const baseY = height * 0.91;
    const blocks = [
      { x: 20, w: 40, h: 50, c: COLOURS.tramBody },
      { x: 70, w: 28, h: 70, c: COLOURS.footpath },
      { x: 110, w: 50, h: 40, c: COLOURS.hazard },
      { x: 170, w: 30, h: 78, c: COLOURS.magenta },
      { x: 250, w: 24, h: 60, c: COLOURS.footpath },
      { x: 290, w: 44, h: 46, c: COLOURS.tramBody },
      { x: 350, w: 28, h: 68, c: COLOURS.hazard },
      { x: 400, w: 46, h: 40, c: COLOURS.footpath },
    ];
    blocks.forEach((b) => {
      const x = b.x * scale;
      const w = b.w * scale;
      const h = b.h * scale;
      g.fillStyle(b.c, 0.85);
      g.fillRect(x, baseY - h, w, h);
    });
  }

  private dropConfetti(): void {
    const { width, height } = getLayout();
    // Deterministic falling confetti (no RNG) — fixed columns + palette colours.
    const cols = [40, 90, 150, 210, 270, 330, 390, 440].map((x) => (x / 480) * width);
    const colours = [COLOURS.magenta, COLOURS.cyan, COLOURS.caution, COLOURS.hazard, COLOURS.bile];
    cols.forEach((x, i) => {
      const c = colours[i % colours.length] ?? COLOURS.cyan;
      const piece = this.add.rectangle(x, -10 - i * 16, 5, 8, c).setOrigin(0.5);
      this.tweens.add({
        targets: piece,
        y: height + 10,
        angle: 360,
        duration: 2600 + i * 120,
        repeat: -1,
        ease: 'Linear',
      });
    });
  }

  /** Solid contained card behind the buttons so the skyline never bleeds through. */
  private drawButtonPanel(firstY: number, lastY: number): void {
    const { width, centerX } = getLayout();
    const btnW = Math.min(184, width - 24);
    const panelW = btnW + 28;
    const top = firstY - 16;
    const bottom = lastY + 16;
    const left = centerX - panelW / 2;
    const g = this.add.graphics();
    g.fillStyle(COLOURS.textDark, 1);
    g.fillRect(left, top, panelW, bottom - top);
    g.lineStyle(1, COLOURS.cyan, 0.5);
    g.strokeRect(left + 0.5, top + 0.5, panelW - 1, bottom - top - 1);
    g.fillStyle(COLOURS.bile, 1);
    g.fillRect(left, top, panelW, 2);
  }

  private createButton(label: string, y: number, onActivate: () => void): void {
    const { width, centerX } = getLayout();
    const btnW = Math.min(184, width - 24);
    const bg = this.add.graphics();
    const drawPlaque = (fill: number, borderColor: number = COLOURS.cyan, borderWidth = 0): void => {
      bg.clear();
      bg.fillStyle(fill, 0.95);
      bg.fillRect(centerX - btnW / 2, y - 10, btnW, 22);
      if (borderWidth > 0) {
        bg.lineStyle(borderWidth, borderColor, 0.9);
        bg.strokeRect(centerX - btnW / 2 + 0.5, y - 10 + 0.5, btnW - 1, 21);
      }
    };
    drawPlaque(COLOURS.road);

    const txt = this.add
      .text(centerX, y, label, { fontFamily: 'Bungee', fontSize: '12px', color: COLOUR_HEX.text })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    txt.on('pointerover', () => {
      txt.setColor(COLOUR_HEX.cyan);
      txt.setScale(1.05);
      drawPlaque(COLOURS.road, COLOURS.cyan, 1);
    });
    txt.on('pointerout', () => {
      txt.setColor(COLOUR_HEX.text);
      txt.setScale(1.0);
      drawPlaque(COLOURS.road);
    });
    txt.on('pointerdown', () => {
      txt.setColor(COLOUR_HEX.hazard);
      txt.setScale(0.98);
      drawPlaque(COLOURS.hazard, COLOURS.hazard, 1);
    });
    txt.on('pointerup', () => {
      txt.setColor(COLOUR_HEX.cyan);
      txt.setScale(1.05);
      drawPlaque(COLOURS.road, COLOURS.cyan, 1);
      onActivate();
    });
  }
}
