/**
 * PauseOverlay — translucent pause layer: Resume, Restart Level, Quit to Menu,
 * Mute toggle. Triggered by P (keyboard) during DriveScene and BossScene.
 */
import Phaser from 'phaser';
import { COLOURS, COLOUR_HEX, FONTS, PAUSE } from '../config';
import { getLayout } from '../systems/Layout';

export interface PauseOverlayCallbacks {
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
  getMuted: () => boolean;
  onMuteToggle: () => void;
}

export class PauseOverlay {
  private readonly container: Phaser.GameObjects.Container;
  private muteLabel!: Phaser.GameObjects.Text;
  private open = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly callbacks: PauseOverlayCallbacks,
  ) {
    const { width, height, centerX } = getLayout();
    this.container = scene.add.container(0, 0).setDepth(PAUSE.depth).setVisible(false);

    const dim = scene.add
      .rectangle(centerX, height / 2, width, height, COLOURS.textDark, PAUSE.overlayAlpha)
      .setOrigin(0.5)
      .setInteractive();
    this.container.add(dim);

    // Card frame for pause overlay
    const cardW = PAUSE.btnW + 36;
    const cardH = height * 0.62;
    const cardTop = height * 0.18;
    const cardG = scene.add.graphics();
    cardG.fillStyle(COLOURS.textDark, 0.95);
    cardG.fillRect(centerX - cardW / 2, cardTop, cardW, cardH);
    cardG.lineStyle(1, COLOURS.cyan, 0.8);
    cardG.strokeRect(centerX - cardW / 2 + 0.5, cardTop + 0.5, cardW - 1, cardH - 1);
    cardG.fillStyle(COLOURS.hazard, 1);
    cardG.fillRect(centerX - cardW / 2, cardTop, cardW, 3);
    this.container.add(cardG);

    const title = scene.add
      .text(centerX, cardTop + 24, 'PAUSED', {
        fontFamily: FONTS.title,
        fontSize: '22px',
        color: COLOUR_HEX.hazard,
      })
      .setOrigin(0.5);
    this.container.add(title);

    let y = cardTop + 62;
    const gap = height * 0.09;
    this.addButton('RESUME', y, () => callbacks.onResume());
    y += gap;
    this.addButton('RESTART', y, () => callbacks.onRestart());
    y += gap;
    this.addButton('QUIT', y, () => callbacks.onQuit());
    y += gap;
    this.muteLabel = this.addButton(this.muteText(), y, () => {
      callbacks.onMuteToggle();
      this.muteLabel.setText(this.muteText());
    });
  }

  private muteText(): string {
    return this.callbacks.getMuted() ? 'UNMUTE' : 'MUTE';
  }

  private addButton(label: string, y: number, onClick: () => void): Phaser.GameObjects.Text {
    const { centerX } = getLayout();
    const bg = this.scene.add.graphics();

    const drawPlaque = (fill: number, borderColor: number = COLOURS.cyan, borderWidth = 0): void => {
      bg.clear();
      bg.fillStyle(fill, 0.95);
      bg.fillRect(centerX - PAUSE.btnW / 2, y - 10, PAUSE.btnW, 22);
      if (borderWidth > 0) {
        bg.lineStyle(borderWidth, borderColor, 0.9);
        bg.strokeRect(centerX - PAUSE.btnW / 2 + 0.5, y - 10 + 0.5, PAUSE.btnW - 1, 21);
      }
    };
    drawPlaque(COLOURS.road);
    this.container.add(bg);

    const txt = this.scene.add
      .text(centerX, y, label, {
        fontFamily: FONTS.title,
        fontSize: '11px',
        color: COLOUR_HEX.text,
      })
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
      onClick();
    });
    this.container.add(txt);
    return txt;
  }

  show(): void {
    this.open = true;
    this.muteLabel.setText(this.muteText());
    this.container.setVisible(true);
  }

  hide(): void {
    this.open = false;
    this.container.setVisible(false);
  }

  get isOpen(): boolean {
    return this.open;
  }

  destroy(): void {
    this.container.destroy(true);
  }
}