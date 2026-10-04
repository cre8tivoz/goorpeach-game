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

    y = this.addVolumeRow('[1] MUSIC', 'musicVolume', y, rowGap);
    y = this.addVolumeRow('[2] SOUND', 'soundVolume', y, rowGap);
    y = this.addToggleRow('[3] CRT SCANLINES', 'crtScanlines', y, rowGap);
    y = this.addToggleRow('[4] REDUCED MOTION', 'reducedMotion', y, rowGap);
    y = this.addSensitivityRow('[5] TOUCH SENS', y, rowGap);
    y = this.addModeRow('[6] TOUCH MODE', y, rowGap);

    const back = this.add
      .text(centerX, height * 0.9, '[B] BACK', { fontFamily: FONTS.title, fontSize: '13px', color: COLOUR_HEX.cyan })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    back.on('pointerover', () => back.setColor(COLOUR_HEX.hazard));
    back.on('pointerout', () => back.setColor(COLOUR_HEX.cyan));
    back.on('pointerup', () => this.goBack());

    this.input.keyboard?.on('keydown', (ev: KeyboardEvent) => {
      const k = ev.key;
      if (k === '1' || k === 'Numpad1') this.cycleVolume('musicVolume');
      else if (k === '2' || k === 'Numpad2') this.cycleVolume('soundVolume');
      else if (k === '3' || k === 'Numpad3') this.toggleSetting('crtScanlines');
      else if (k === '4' || k === 'Numpad4') this.toggleSetting('reducedMotion');
      else if (k === '5' || k === 'Numpad5') this.cycleSensitivity();
      else if (k === '6' || k === 'Numpad6') this.toggleMode();
      else if (k === 'Escape' || k === 'b' || k === 'B' || k === 'm' || k === 'M') {
        this.goBack();
      }
    });

    this.crt = new CrtOverlay(this);

    announce('Settings menu: Press 1-6 to adjust settings or B to go back.');
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

    value.on('pointerover', () => value.setColor(COLOUR_HEX.hazard));
    value.on('pointerout', () => value.setColor(COLOUR_HEX.cyan));
    value.on('pointerup', () => this.toggleSetting(key));

    return y + gap;
  }

  private refreshCrt(): void {
    this.crt?.refresh();
  }

  private addSensitivityRow(label: string, y: number, gap: number): number {
    const { width, centerX } = getLayout();
    const leftX = width * 0.12;
    this.add
      .text(leftX, y, label, { fontFamily: FONTS.mono, fontSize: '9px', color: COLOUR_HEX.text })
      .setOrigin(0, 0.5);

    const value = this.add
      .text(centerX, y, `${this.settings.touchSteerSensitivity.toFixed(1)}x`, {
        fontFamily: FONTS.mono,
        fontSize: '10px',
        color: COLOUR_HEX.cyan,
      })
      .setOrigin(0.5);
    this.valueTexts.set('touchSteerSensitivity', value);

    this.addStepBtn(centerX - 52, y, '-', () => this.stepSensitivity(-SETTINGS_UI.sensitivityStep));
    this.addStepBtn(centerX + 52, y, '+', () => this.stepSensitivity(SETTINGS_UI.sensitivityStep));

    return y + gap;
  }

  private addModeRow(label: string, y: number, gap: number): number {
    const { width, centerX } = getLayout();
    const leftX = width * 0.12;
    this.add
      .text(leftX, y, label, { fontFamily: FONTS.mono, fontSize: '9px', color: COLOUR_HEX.text })
      .setOrigin(0, 0.5);

    const value = this.add
      .text(centerX - 30, y, this.settings.touchInputMode.toUpperCase(), {
        fontFamily: FONTS.mono,
        fontSize: '10px',
        color: COLOUR_HEX.cyan,
      })
      .setOrigin(0.5);
    this.valueTexts.set('touchInputMode', value);

    this.addStepBtn(centerX + 48, y, 'SWITCH', () => this.toggleMode());

    return y + gap;
  }

  private toggleSetting(key: 'crtScanlines' | 'reducedMotion'): void {
    this.settings = Persistence.setSettings({ [key]: !this.settings[key] });
    this.valueTexts.get(key)?.setText(this.settings[key] ? 'ON' : 'OFF');
    this.refreshCrt();
    const name = key === 'crtScanlines' ? 'CRT Scanlines' : 'Reduced Motion';
    announce(`${name}: ${this.settings[key] ? 'ON' : 'OFF'}`);
  }

  private stepSensitivity(delta: number): void {
    const next = Phaser.Math.Clamp(
      Math.round((this.settings.touchSteerSensitivity + delta) * 10) / 10,
      SETTINGS_UI.sensitivityMin,
      SETTINGS_UI.sensitivityMax,
    );
    this.settings = Persistence.setSettings({ touchSteerSensitivity: next });
    this.valueTexts.get('touchSteerSensitivity')?.setText(`${next.toFixed(1)}x`);
    announce(`Touch sensitivity: ${next.toFixed(1)}x`);
  }

  private cycleSensitivity(): void {
    const cur = this.settings.touchSteerSensitivity;
    const next = cur >= SETTINGS_UI.sensitivityMax ? SETTINGS_UI.sensitivityMin : cur + SETTINGS_UI.sensitivityStep;
    this.stepSensitivity(next - cur);
  }

  private toggleMode(): void {
    const next: TouchInputMode = this.settings.touchInputMode === 'joystick' ? 'swipe' : 'joystick';
    this.settings = Persistence.setSettings({ touchInputMode: next });
    this.valueTexts.get('touchInputMode')?.setText(next.toUpperCase());
    announce(`Touch input mode: ${next.toUpperCase()}`);
  }

  private bumpVolume(key: 'musicVolume' | 'soundVolume', delta: number): void {
    const next = Phaser.Math.Clamp(
      Math.round((this.settings[key] + delta) * 100) / 100,
      SETTINGS_UI.volumeMin,
      SETTINGS_UI.volumeMax,
    );
    this.settings = Persistence.setSettings({ [key]: next });
    this.valueTexts.get(key)?.setText(this.formatPct(next));
    this.applyAudio();
    const label = key === 'musicVolume' ? 'Music volume' : 'Sound volume';
    announce(`${label}: ${this.formatPct(next)}`);
  }

  private cycleVolume(key: 'musicVolume' | 'soundVolume'): void {
    const cur = this.settings[key];
    const step = SETTINGS_UI.volumeStep * 2; // 10% steps on keypress
    const next = cur >= 0.99 ? 0 : Math.min(1, Math.round((cur + step) * 100) / 100);
    this.bumpVolume(key, next - cur);
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