import Phaser from 'phaser';
import { SCENES, COLOURS, COLOUR_HEX, FONTS, SETTINGS_UI } from '../config';
import { Audio } from '../systems/Audio';
import { Persistence } from '../systems/Persistence';
import { CrtOverlay } from '../ui/CrtOverlay';
import { getLayout } from '../systems/Layout';
import type { GameSettings, TouchInputMode } from '../types';
import { announce } from '../systems/A11y';

/**
 * SettingsScene — volume, CRT, reduced motion, touch sensitivity and input mode.
 * Values persist via Persistence; audio updates apply immediately when unlocked.
 */
export class SettingsScene extends Phaser.Scene {
  private settings!: GameSettings;
  private crt?: CrtOverlay;
  private valueTexts = new Map<string, Phaser.GameObjects.Text>();

  constructor() {
    super(SCENES.Settings);
  }

  create(): void {
    this.settings = Persistence.getSettings();
    const { width, height, centerX, centerY } = getLayout();

    this.add.rectangle(centerX, centerY, width, height, COLOURS.road).setOrigin(0.5);
    this.add
      .text(centerX, height * 0.08, 'SETTINGS', { fontFamily: FONTS.title, fontSize: '22px', color: COLOUR_HEX.hazard })
      .setOrigin(0.5);

    let y = height * 0.2;
    const rowGap = height * 0.09;

    y = this.addVolumeRow('MUSIC', 'musicVolume', y, rowGap);
    y = this.addVolumeRow('SOUND', 'soundVolume', y, rowGap);
    y = this.addToggleRow('CRT SCANLINES', 'crtScanlines', y, rowGap);
    y = this.addToggleRow('REDUCED MOTION', 'reducedMotion', y, rowGap);
    y = this.addSensitivityRow(y, rowGap);
    y = this.addModeRow(y, rowGap);

    const back = this.add
      .text(centerX, height * 0.9, '[B] BACK', { fontFamily: FONTS.title, fontSize: '13px', color: COLOUR_HEX.cyan })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    back.on('pointerover', () => back.setColor(COLOUR_HEX.hazard));
    back.on('pointerout', () => back.setColor(COLOUR_HEX.cyan));
    back.on('pointerup', () => this.goBack());

    this.input.keyboard?.on('keydown', (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' || ev.key === 'b' || ev.key === 'B' || ev.key === 'm' || ev.key === 'M') {
        this.goBack();
      }
    });

    this.crt = new CrtOverlay(this);

    announce('Settings menu: adjust audio volume, CRT scanlines, reduced motion, touch sensitivity, and touch input mode. Press B to go back.');
  }

  private addVolumeRow(
    label: string,
    key: 'musicVolume' | 'soundVolume',
    y: number,
    gap: number,
  ): number {
    const { width, centerX } = getLayout();
    const leftX = width * 0.12;
    this.add
      .text(leftX, y, label, { fontFamily: FONTS.mono, fontSize: '9px', color: COLOUR_HEX.text })
      .setOrigin(0, 0.5);

    const value = this.add
      .text(centerX, y, this.formatPct(this.settings[key]), {
        fontFamily: FONTS.mono,
        fontSize: '10px',
        color: COLOUR_HEX.cyan,
      })
      .setOrigin(0.5);
    this.valueTexts.set(key, value);

    this.addStepBtn(centerX - 52, y, '-', () => this.bumpVolume(key, -SETTINGS_UI.volumeStep));
    this.addStepBtn(centerX + 52, y, '+', () => this.bumpVolume(key, SETTINGS_UI.volumeStep));

    return y + gap;
  }

  private addToggleRow(label: string, key: 'crtScanlines' | 'reducedMotion', y: number, gap: number): number {
    const { width, centerX } = getLayout();
    const leftX = width * 0.12;
    this.add
      .text(leftX, y, label, { fontFamily: FONTS.mono, fontSize: '9px', color: COLOUR_HEX.text })
      .setOrigin(0, 0.5);

    const value = this.add
      .text(centerX, y, this.settings[key] ? 'ON' : 'OFF', {
        fontFamily: FONTS.mono,
        fontSize: '10px',
        color: COLOUR_HEX.cyan,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.valueTexts.set(key, value);

    const toggle = (): void => {
      this.settings = Persistence.setSettings({ [key]: !this.settings[key] });
      value.setText(this.settings[key] ? 'ON' : 'OFF');
      this.refreshCrt();
    };
    value.on('pointerover', () => value.setColor(COLOUR_HEX.hazard));
    value.on('pointerout', () => value.setColor(COLOUR_HEX.cyan));
    value.on('pointerup', toggle);

    return y + gap;
  }

  private refreshCrt(): void {
    this.crt?.refresh();
  }

  private addSensitivityRow(y: number, gap: number): number {
    const { width, centerX } = getLayout();
    const leftX = width * 0.12;
    this.add
      .text(leftX, y, 'TOUCH SENS', { fontFamily: FONTS.mono, fontSize: '9px', color: COLOUR_HEX.text })
      .setOrigin(0, 0.5);

    const value = this.add
      .text(centerX, y, `${this.settings.touchSteerSensitivity.toFixed(1)}x`, {
        fontFamily: FONTS.mono,
        fontSize: '10px',
        color: COLOUR_HEX.cyan,
      })
      .setOrigin(0.5);
    this.valueTexts.set('touchSteerSensitivity', value);

    this.addStepBtn(centerX - 52, y, '-', () => {
      const next = Phaser.Math.Clamp(
        this.settings.touchSteerSensitivity - SETTINGS_UI.sensitivityStep,
        SETTINGS_UI.sensitivityMin,
        SETTINGS_UI.sensitivityMax,
      );
      this.settings = Persistence.setSettings({ touchSteerSensitivity: next });
      value.setText(`${next.toFixed(1)}x`);
    });
    this.addStepBtn(centerX + 52, y, '+', () => {
      const next = Phaser.Math.Clamp(
        this.settings.touchSteerSensitivity + SETTINGS_UI.sensitivityStep,
        SETTINGS_UI.sensitivityMin,
        SETTINGS_UI.sensitivityMax,
      );
      this.settings = Persistence.setSettings({ touchSteerSensitivity: next });
      value.setText(`${next.toFixed(1)}x`);
    });

    return y + gap;
  }

  private addModeRow(y: number, gap: number): number {
    const { width, centerX } = getLayout();
    const leftX = width * 0.12;
    this.add
      .text(leftX, y, 'TOUCH MODE', { fontFamily: FONTS.mono, fontSize: '9px', color: COLOUR_HEX.text })
      .setOrigin(0, 0.5);

    const value = this.add
      .text(centerX - 30, y, this.settings.touchInputMode.toUpperCase(), {
        fontFamily: FONTS.mono,
        fontSize: '10px',
        color: COLOUR_HEX.cyan,
      })
      .setOrigin(0.5);
    this.valueTexts.set('touchInputMode', value);

    this.addStepBtn(centerX + 48, y, 'SWITCH', () => {
      const next: TouchInputMode = this.settings.touchInputMode === 'joystick' ? 'swipe' : 'joystick';
      this.settings = Persistence.setSettings({ touchInputMode: next });
      value.setText(next.toUpperCase());
    });

    return y + gap;
  }

  private bumpVolume(key: 'musicVolume' | 'soundVolume', delta: number): void {
    const next = Phaser.Math.Clamp(
      this.settings[key] + delta,
      SETTINGS_UI.volumeMin,
      SETTINGS_UI.volumeMax,
    );
    this.settings = Persistence.setSettings({ [key]: next });
    this.valueTexts.get(key)?.setText(this.formatPct(next));
    this.applyAudio();
  }

  private formatPct(v: number): string {
    return `${Math.round(v * 100)}%`;
  }

  private applyAudio(): void {
    const audio = this.registry.get('audio') as Audio | undefined;
    if (!audio) return;
    audio.setMusicVolume(this.settings.musicVolume);
    audio.setSfxVolume(this.settings.soundVolume);
  }

  private addStepBtn(x: number, y: number, label: string, onClick: () => void): void {
    const txt = this.add
      .text(x, y, label, { fontFamily: FONTS.title, fontSize: '10px', color: COLOUR_HEX.text })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    txt.on('pointerover', () => txt.setColor(COLOUR_HEX.cyan));
    txt.on('pointerout', () => txt.setColor(COLOUR_HEX.text));
    txt.on('pointerup', onClick);
  }

  private goBack(): void {
    this.applyAudio();
    this.scene.start(SCENES.Menu);
  }
}