import Phaser from 'phaser';
import { SCENES, COLOURS, COLOUR_HEX } from '../config';
import { LEVELS } from '../data/levels';
import { Persistence } from '../systems/Persistence';
import { Audio } from '../systems/Audio';
import { getLayout } from '../systems/Layout';
import { CrtOverlay } from '../ui/CrtOverlay';
import { announce } from '../systems/A11y';

/**
 * LevelSelectScene — pick a suburb. Levels unlock progressively (the furthest
 * reached is stored via Persistence); locked suburbs show a padlock. Selecting
 * an unlocked driving level starts it; the final entry is the Kew boss arena.
 */
export class LevelSelectScene extends Phaser.Scene {
  private statusText!: Phaser.GameObjects.Text;

  constructor() {
    super(SCENES.LevelSelect);
  }

  create(): void {
    const { width, height, centerX, centerY } = getLayout();
    new CrtOverlay(this);
    this.add.rectangle(centerX, centerY, width, height, COLOURS.road).setOrigin(0.5);
    this.add
      .text(centerX, height * 0.08, 'SELECT SUBURB', { fontFamily: 'Bungee', fontSize: '20px', color: COLOUR_HEX.text })
      .setOrigin(0.5);

    this.statusText = this.add
      .text(centerX, height * 0.83, 'Select an unlocked suburb to drive', {
        fontFamily: 'JetBrains Mono',
        fontSize: '9px',
        color: COLOUR_HEX.cyan,
      })
      .setOrigin(0.5);

    announce('Select suburb: press numbers 1 to 5 or B for menu');

    const highest = Persistence.getHighestUnlocked();

    // Driving suburbs from level data, plus the Kew boss arena as the finale.
    const entries: { id: number; name: string; boss: boolean }[] = [
      ...LEVELS.map((l) => ({ id: l.id, name: l.name, boss: false })),
      { id: 5, name: 'Kew — The Nerd', boss: true },
    ];

    let y = height * 0.22;
    const rowGap = height * 0.11;
    for (const entry of entries) {
      const unlocked = entry.id <= highest;
      this.createRow(entry.id, entry.name, entry.boss, unlocked, y, () => {
        void this.startEntry(entry.boss, entry.id);
      });
      y += rowGap;
    }

    const back = this.add
      .text(centerX, height * 0.91, '[B] BACK', { fontFamily: 'Bungee', fontSize: '13px', color: COLOUR_HEX.cyan })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    back.on('pointerover', () => back.setColor(COLOUR_HEX.hazard));
    back.on('pointerout', () => back.setColor(COLOUR_HEX.cyan));
    back.on('pointerup', () => this.scene.start(SCENES.Menu));

    this.input.keyboard?.on('keydown', (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' || ev.key === 'b' || ev.key === 'B' || ev.key === 'm' || ev.key === 'M') {
        this.scene.start(SCENES.Menu);
      } else {
        const num = parseInt(ev.key, 10);
        if (num >= 1 && num <= entries.length) {
          const entry = entries[num - 1];
          if (entry) {
            if (num <= highest) {
              void this.startEntry(entry.boss, entry.id);
            } else {
              this.showLockedMsg(num);
            }
          }
        }
      }
    });
  }

  private showLockedMsg(id: number): void {
    const prevName = id > 1 ? LEVELS[id - 2]?.name ?? `Suburb ${id - 1}` : 'previous suburb';
    const msg = `Complete ${prevName} to unlock!`;
    this.statusText.setText(msg);
    this.statusText.setColor(COLOUR_HEX.hazard);
    announce(msg);
  }

  /** Level pick is a user gesture — unlock audio here if START was skipped. */
  private async startEntry(boss: boolean, levelId: number): Promise<void> {
    let audio = this.registry.get('audio') as Audio | undefined;
    if (!audio) {
      audio = new Audio(this.sound);
      await audio.unlock();
      this.registry.set('audio', audio);
    }
    const settings = Persistence.getSettings();
    audio.setMusicVolume(settings.musicVolume);
    audio.setSfxVolume(settings.soundVolume);
    if (boss) this.scene.start(SCENES.Boss, { score: 0 });
    else this.scene.start(SCENES.Drive, { levelId });
  }

  private createRow(id: number, name: string, boss: boolean, unlocked: boolean, y: number, onSelect: () => void): void {
    const { width, centerX } = getLayout();
    const rowW = Math.min(300, width - 20);
    const bg = this.add.graphics();
    bg.fillStyle(unlocked ? COLOURS.textDark : COLOURS.road, unlocked ? 0.9 : 0.6);
    bg.fillRect(centerX - rowW / 2, y - 11, rowW, 24);
    if (boss && unlocked) bg.lineStyle(2, COLOURS.magenta, 1).strokeRect(centerX - rowW / 2, y - 11, rowW, 24);

    const label = unlocked ? `[${id}] ${name}` : `[${id}] 🔒 ${name}`;
    const txt = this.add
      .text(centerX - rowW / 2 + 12, y, label, {
        fontFamily: boss ? 'Bungee' : 'JetBrains Mono',
        fontSize: boss ? '12px' : '11px',
        color: unlocked ? (boss ? COLOUR_HEX.magenta : COLOUR_HEX.text) : COLOUR_HEX.road,
      })
      .setOrigin(0, 0.5);

    txt.setInteractive({ useHandCursor: true });

    if (!unlocked) {
      txt.setColor(COLOUR_HEX.footpath).setAlpha(0.6);
      txt.on('pointerdown', () => {
        this.showLockedMsg(id);
      });
      return;
    }

    txt.on('pointerover', () => txt.setColor(COLOUR_HEX.cyan));
    txt.on('pointerout', () => txt.setColor(boss ? COLOUR_HEX.magenta : COLOUR_HEX.text));
    txt.on('pointerup', onSelect);
  }
}
