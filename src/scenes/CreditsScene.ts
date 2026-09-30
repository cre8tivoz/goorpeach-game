import Phaser from 'phaser';
import { SCENES, COLOURS, COLOUR_HEX, FONTS } from '../config';
import { getLayout } from '../systems/Layout';
import { CrtOverlay } from '../ui/CrtOverlay';

/** Condensed attribution from CREDITS.md — audit-clean, fits the screen. */
const CREDIT_LINES = [
  'DOORPEACH APOCALYPSE',
  '',
  'Sprites',
  'Bespoke pixel art, AI-assisted',
  '',
  'Audio',
  'freesound.org community samples',
  'Pixabay royalty-free loops',
  '',
  'Fonts',
  'Bungee — Google Fonts (OFL)',
  'JetBrains Mono — Google Fonts (OFL)',
  '',
  'A Melbourne parody. No real brands.',
  'Trams are still trying to kill you.',
];

/**
 * CreditsScene — asset attribution log (docs/BRIEF.md title screen Credits).
 */
export class CreditsScene extends Phaser.Scene {
  constructor() {
    super(SCENES.Credits);
  }

  create(): void {
    const { width, height, centerX, centerY } = getLayout();
    new CrtOverlay(this);

    this.add.rectangle(centerX, centerY, width, height, COLOURS.textDark).setOrigin(0.5);
    this.add
      .text(centerX, height * 0.08, 'CREDITS', { fontFamily: FONTS.title, fontSize: '22px', color: COLOUR_HEX.cyan })
      .setOrigin(0.5);

    const body = CREDIT_LINES.join('\n');
    const bodyText = this.add
      .text(centerX, height * 0.17, body, {
        fontFamily: FONTS.mono,
        fontSize: width < 320 ? '7px' : '8px',
        color: COLOUR_HEX.text,
        align: 'center',
        lineSpacing: 3,
        wordWrap: { width: width - 32 },
      })
      .setOrigin(0.5, 0);

    // Place BACK below the body, clamped above the bottom edge — never overlaps copy.
    const backY = Math.min(bodyText.y + bodyText.height + height * 0.06, height * 0.95);
    const back = this.add
      .text(centerX, backY, '[B] BACK', { fontFamily: FONTS.title, fontSize: '13px', color: COLOUR_HEX.cyan })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    back.on('pointerover', () => back.setColor(COLOUR_HEX.hazard));
    back.on('pointerout', () => back.setColor(COLOUR_HEX.cyan));
    back.on('pointerup', () => this.scene.start(SCENES.Menu));

    this.input.keyboard?.on('keydown', (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' || ev.key === 'b' || ev.key === 'B' || ev.key === 'm' || ev.key === 'M') {
        this.scene.start(SCENES.Menu);
      }
    });
  }
}