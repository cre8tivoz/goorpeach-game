import Phaser from 'phaser';
import { SCENES, COLOURS, COLOUR_HEX } from '../config';
import { Audio } from '../systems/Audio';
import { getLayout } from '../systems/Layout';
import { CrtOverlay } from '../ui/CrtOverlay';

/** Data passed in from DriveScene when a run ends in death. */
export interface GameOverData {
  message: string; // resolved death-cause line
  score: number; // run total at death (shown)
  levelId: number; // for "Restart Level"
  restartScore: number; // score the player entered this level with
  restartScene?: string; // scene to restart into (default DriveScene; boss uses BossScene)
}

/**
 * GameOverScene — death-cause text (per level, or the tram line), plus Restart
 * Level and Quit to Menu. Restart resumes the current suburb, not Richmond
 * (docs/BRIEF.md). One scene per file (CLAUDE.md).
 */
export class GameOverScene extends Phaser.Scene {
  private params!: GameOverData;

  constructor() {
    super(SCENES.GameOver);
  }

  init(data: GameOverData): void {
    this.params = data;
  }

  create(): void {
    const { width, height, centerX, centerY } = getLayout();
    new CrtOverlay(this);

    this.add.rectangle(centerX, centerY, width, height, COLOURS.textDark).setOrigin(0.5);

    // Hazard card backdrop
    const cardW = Math.min(360, width - 24);
    const cardH = height * 0.82;
    const cardG = this.add.graphics();
    cardG.fillStyle(COLOURS.road, 0.95);
    cardG.fillRect(centerX - cardW / 2, centerY - cardH / 2, cardW, cardH);
    cardG.lineStyle(1, COLOURS.hazard, 0.8);
    cardG.strokeRect(centerX - cardW / 2 + 0.5, centerY - cardH / 2 + 0.5, cardW - 1, cardH - 1);
    cardG.fillStyle(COLOURS.hazard, 1);
    cardG.fillRect(centerX - cardW / 2, centerY - cardH / 2, cardW, 3);

    this.add
      .text(centerX, height * 0.2, 'GAME OVER', { fontFamily: 'Bungee', fontSize: '32px', color: COLOUR_HEX.hazard })
      .setOrigin(0.5);

    // Death cause badge container
    const msgG = this.add.graphics();
    msgG.fillStyle(COLOURS.textDark, 0.85);
    msgG.fillRect(centerX - cardW / 2 + 16, height * 0.33, cardW - 32, 42);
    msgG.lineStyle(1, COLOURS.caution, 0.5);
    msgG.strokeRect(centerX - cardW / 2 + 16.5, height * 0.33 + 0.5, cardW - 33, 41);

    this.add
      .text(centerX, height * 0.4, this.params.message, {
        fontFamily: 'JetBrains Mono',
        fontSize: '9px',
        color: COLOUR_HEX.text,
        align: 'center',
        wordWrap: { width: cardW - 48 },
      })
      .setOrigin(0.5);

    this.add
      .text(centerX, height * 0.53, `FINAL SCORE: ${this.params.score}`, {
        fontFamily: 'JetBrains Mono',
        fontSize: '11px',
        color: COLOUR_HEX.bile,
      })
      .setOrigin(0.5);

    this.createButton('RESTART LEVEL', height * 0.63, () => {
      const target = this.params.restartScene ?? SCENES.Drive;
      this.scene.start(target, { levelId: this.params.levelId, score: this.params.restartScore });
    });
    this.createButton('SUBMIT SCORE', height * 0.73, () => {
      this.scene.start(SCENES.Scoreboard, { score: this.params.score, levelReached: this.params.levelId });
    });
    this.createButton('QUIT TO MENU', height * 0.83, () => {
      this.scene.start(SCENES.Menu);
    });

    // Defeat sting
    const audio = this.registry.get('audio') as Audio | undefined;
    if (audio && !audio.isMuted) {
      try {
        audio.playSfx('gameoverSting', 0.8);
      } catch (e) {
        console.info('[GameOver] sting failed:', e);
      }
    }
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
