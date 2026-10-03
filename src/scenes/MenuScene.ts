import Phaser from 'phaser';
import { SCENES, COLOURS, COLOUR_HEX } from '../config';
import { Audio } from '../systems/Audio';
import { Persistence } from '../systems/Persistence';
import { CrtOverlay } from '../ui/CrtOverlay';
import { getLayout } from '../systems/Layout';
import { announce } from '../systems/A11y';

/**
 * MenuScene — title screen with chunky logo, Melbourne skyline hint, and the
 * four main buttons. The "Start" button is the critical audio-unlock gesture.
 *
 * Per CLAUDE.md:
 *  - No direct this.sound.play anywhere.
 *  - Audio system handles unlock + music.
 *  - Australian English, dry tone in any copy.
 *  - Mobile-first (buttons large, touch friendly).
 *
 * For this milestone Start proves the unlock + music path then moves to
 * DriveScene (even while that scene is still being built in the next step).
 * Other buttons show a temporary "coming soon" message (we implement one
 * scene at a time).
 */
export class MenuScene extends Phaser.Scene {
  private audio!: Audio;
  private statusText!: Phaser.GameObjects.Text;

  constructor() {
    super(SCENES.Menu);
  }

  create(): void {
    const { width, height, centerX, centerY } = getLayout();

    // Background
    this.add.rectangle(centerX, centerY, width, height, COLOURS.road).setOrigin(0.5);

    // Very minimal late-90s Melbourne skyline silhouette (hard rects, no gradients).
    // Drawn first so the menu panel sits cleanly on top of it (skyline frames the sides).
    this.drawSkyline();

    // Big chunky title — Bungee + palette
    this.add
      .text(centerX, height * 0.15, 'DOORPEACH', {
        fontFamily: 'Bungee',
        fontSize: '36px',
        color: COLOUR_HEX.text,
        align: 'center',
      })
      .setOrigin(0.5);

    this.add
      .text(centerX, height * 0.24, 'APOCALYPSE', {
        fontFamily: 'Bungee',
        fontSize: '16px',
        color: COLOUR_HEX.hazard,
        align: 'center',
      })
      .setOrigin(0.5);

    // Tagline (dry, Australian, per BRIEF.md) — smaller on narrow/portrait widths
    this.add
      .text(centerX, height * 0.31, 'Richmond to Kew. Delivery riders. Ozempic. Trams.', {
        fontFamily: 'JetBrains Mono',
        fontSize: width < 360 ? '7px' : '9px',
        color: COLOUR_HEX.cyan,
        align: 'center',
      })
      .setOrigin(0.5);

    // Buttons — large tap targets, chunky 90s style.
    // Lay them out inside a solid contained panel so the skyline never bleeds
    // through and text stays readable (CLAUDE.md: fewer features, more polish).
    const buttons: Array<[string, string, () => void]> = [
      ['[1] START', '1', () => void this.handleStart()],
      ['[2] LEVEL SELECT', '2', () => this.scene.start(SCENES.LevelSelect)],
      ['[3] HIGH SCORES', '3', () => this.scene.start(SCENES.Scoreboard)],
      ['[4] SETTINGS', '4', () => this.scene.start(SCENES.Settings)],
      ['[5] CREDITS', '5', () => this.scene.start(SCENES.Credits)],
    ];

    const firstY = height * 0.5;
    const btnGap = height * 0.09;
    const lastY = firstY + btnGap * (buttons.length - 1);
    this.drawButtonPanel(firstY, lastY);

    buttons.forEach(([label, _key, onActivate], i) => {
      this.createButton(label, firstY + btnGap * i, onActivate);
    });

    // Keyboard shortcuts for menu navigation
    this.input.keyboard?.on('keydown', (ev: KeyboardEvent) => {
      if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 's' || ev.key === 'S' || ev.key === '1') {
        void this.handleStart();
      } else if (ev.key === '2') {
        this.scene.start(SCENES.LevelSelect);
      } else if (ev.key === '3') {
        this.scene.start(SCENES.Scoreboard);
      } else if (ev.key === '4') {
        this.scene.start(SCENES.Settings);
      } else if (ev.key === '5') {
        this.scene.start(SCENES.Credits);
      } else if (ev.key === 'm' || ev.key === 'M') {
        if (this.audio) {
          const nowMuted = this.audio.toggleMute();
          muteBtn.setText(nowMuted ? 'M' : '♫');
        }
      }
    });

    // Small mute toggle (top-right, touch friendly)
    const muteBtn = this.add
      .text(width - 20, height * 0.07, '♫', {
        fontFamily: 'JetBrains Mono',
        fontSize: '14px',
        color: COLOUR_HEX.text,
        backgroundColor: COLOUR_HEX.textDark,
      })
      .setOrigin(0.5)
      .setPadding(6)
      .setInteractive({ useHandCursor: true });

    muteBtn.on('pointerdown', () => {
      if (this.audio) {
        const nowMuted = this.audio.toggleMute();
        muteBtn.setText(nowMuted ? 'M' : '♫');
      }
    });

    // Status line (for unlock feedback) — sits above the button panel, clear of it.
    this.statusText = this.add
      .text(centerX, height * 0.4, '', {
        fontFamily: 'JetBrains Mono',
        fontSize: '9px',
        color: COLOUR_HEX.bile,
        align: 'center',
      })
      .setOrigin(0.5);

    // Hint for first run (audio context)
    this.statusText.setText('tap START to begin — unlocks audio');

    // If someone arrives here with audio already in registry (rare on first load), reuse
    const existing = this.registry.get('audio') as Audio | undefined;
    if (existing) {
      this.audio = existing;
      this.statusText.setText('audio ready — tap START to drive');
    }

    announce('Main Menu: Press 1 or Start to drive, 2 for Level Select, 3 for High Scores, 4 for Settings, 5 for Credits');

    new CrtOverlay(this);
  }

  /** Solid contained card behind the button column with a hazard accent bar. */
  private drawButtonPanel(firstY: number, lastY: number): void {
    const { width, centerX } = getLayout();
    const btnW = Math.min(184, width - 24);
    const panelW = btnW + 28;
    const top = firstY - 16;
    const bottom = lastY + 16;
    const left = centerX - panelW / 2;

    const g = this.add.graphics();
    // Solid card, darker than the road, so buttons read crisply and the skyline
    // behind never bleeds through (it frames the panel on the sides instead).
    g.fillStyle(COLOURS.textDark, 1);
    g.fillRect(left, top, panelW, bottom - top);
    // Thin cyan border + hazard top accent (90s arcade cabinet trim)
    g.lineStyle(1, COLOURS.cyan, 0.5);
    g.strokeRect(left + 0.5, top + 0.5, panelW - 1, bottom - top - 1);
    g.fillStyle(COLOURS.hazard, 1);
    g.fillRect(left, top, panelW, 2);
  }

  private drawSkyline(): void {
    const { width, height } = getLayout();
    const scale = width / 480;
    // Hard-edged building silhouettes using palette colours (footpath, hazard, tram body, magenta)
    // Bottom strip representing inner-Melbourne roofline
    const g = this.add.graphics();
    const baseY = height * 0.86;

    // Simple repeating blocks of different heights — very GTA1 / Micro Machines feel
    const blocks = [
      { x: 20, w: 38, h: 42, c: COLOURS.footpath },
      { x: 62, w: 26, h: 58, c: COLOURS.hazard },
      { x: 92, w: 44, h: 35, c: COLOURS.tramBody },
      { x: 140, w: 30, h: 65, c: COLOURS.magenta },
      { x: 175, w: 52, h: 28, c: COLOURS.footpath },
      { x: 232, w: 22, h: 71, c: COLOURS.hazard },
      { x: 258, w: 36, h: 40, c: COLOURS.tramBody },
      { x: 298, w: 28, h: 55, c: COLOURS.footpath },
      { x: 330, w: 48, h: 33, c: COLOURS.magenta },
      { x: 382, w: 24, h: 62, c: COLOURS.hazard },
      { x: 410, w: 40, h: 38, c: COLOURS.tramBody },
    ];

    blocks.forEach((b) => {
      const x = b.x * scale;
      const w = b.w * scale;
      const h = b.h * scale;
      g.fillStyle(b.c, 0.85);
      g.fillRect(x, baseY - h, w, h);
      // Tiny roof detail line
      g.fillStyle(COLOURS.road, 0.6);
      g.fillRect(x, baseY - h - 2, w, 3);
    });
  }

  private createButton(label: string, y: number, onActivate: () => void): Phaser.GameObjects.Text {
    const { width, centerX } = getLayout();
    const btnW = Math.min(184, width - 24);

    // Background "plaque" — raised slightly lighter than the card it sits on with border trim
    const drawPlaque = (fill: number, alpha: number, borderColor: number = COLOURS.cyan, borderWidth = 0): void => {
      bg.clear();
      bg.fillStyle(fill, alpha);
      bg.fillRect(centerX - btnW / 2, y - 10, btnW, 22);
      if (borderWidth > 0) {
        bg.lineStyle(borderWidth, borderColor, 0.9);
        bg.strokeRect(centerX - btnW / 2 + 0.5, y - 10 + 0.5, btnW - 1, 21);
      }
    };
    const bg = this.add.graphics();
    drawPlaque(COLOURS.road, 1);

    const txt = this.add
      .text(centerX, y, label, {
        fontFamily: 'Bungee',
        fontSize: '13px',
        color: COLOUR_HEX.text,
        align: 'center',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    // Hover / active feedback with scale, border glow, and cyan/hazard accents
    txt.on('pointerover', () => {
      txt.setColor(COLOUR_HEX.cyan);
      txt.setScale(1.05);
      drawPlaque(COLOURS.road, 1, COLOURS.cyan, 1);
    });

    txt.on('pointerout', () => {
      txt.setColor(COLOUR_HEX.text);
      txt.setScale(1.0);
      drawPlaque(COLOURS.road, 1);
    });

    txt.on('pointerdown', () => {
      txt.setColor(COLOUR_HEX.hazard);
      txt.setScale(0.98);
      drawPlaque(COLOURS.hazard, 0.25, COLOURS.hazard, 1);
    });

    txt.on('pointerup', () => {
      txt.setColor(COLOUR_HEX.cyan);
      txt.setScale(1.05);
      drawPlaque(COLOURS.road, 1, COLOURS.cyan, 1);
      onActivate();
    });

    return txt;
  }

  private async handleStart(): Promise<void> {
    // This is THE unlock point (CLAUDE.md audio gotcha). Must be direct user gesture.
    if (!this.audio) {
      this.audio = new Audio(this.sound);
    }

    await this.audio.unlock();
    const settings = Persistence.getSettings();
    this.audio.setMusicVolume(settings.musicVolume);
    this.audio.setSfxVolume(settings.soundVolume);
    this.audio.playMusic('menuLoop');

    // Make the audio manager available to subsequent scenes (Drive, Boss, etc.)
    this.registry.set('audio', this.audio);

    this.statusText.setText('audio unlocked — driving...');
    this.statusText.setColor(COLOUR_HEX.bile);

    // Per working pattern, next is DriveScene level 1 (Richmond) — even if still stub.
    // Music will continue because the Audio instance is on the registry and the
    // underlying WebAudio context is now running.
    this.time.delayedCall(280, () => {
      this.scene.start(SCENES.Drive);
    });
  }

}
