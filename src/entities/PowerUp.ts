import Phaser from 'phaser';
import { POWERUP, POWERUP_GLOW, COLOURS } from '../config';
import { getLayout } from '../systems/Layout';
import type { PowerUpKind } from '../types';

/** Power-up pickup — scrolls with the road; collect by driving over it (not shooting). */
export class PowerUp {
  readonly kind: PowerUpKind;
  active = true;
  private readonly icon: Phaser.GameObjects.Image;
  private readonly glow?: Phaser.GameObjects.Image;
  private readonly x: number;
  private baseY: number;
  private y: number;
  private phase: number;

  constructor(scene: Phaser.Scene, x: number, y: number, kind: PowerUpKind) {
    this.kind = kind;
    this.x = x;
    this.baseY = y;
    this.y = y;
    this.phase = Math.random() * Math.PI * 2;

    // Soft additive halo behind the icon, gently pulsing — draws the eye to rewards.
    if (scene.textures.exists('softGlow')) {
      this.glow = scene.add
        .image(x, y, 'softGlow')
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(POWERUP_GLOW.tint[kind] ?? COLOURS.cyan)
        .setDisplaySize(POWERUP_GLOW.size, POWERUP_GLOW.size)
        .setDepth(POWERUP_GLOW.depth)
        .setAlpha(POWERUP_GLOW.alphaMin);
      scene.tweens.add({
        targets: this.glow,
        alpha: POWERUP_GLOW.alphaMax,
        duration: POWERUP_GLOW.pulseMs,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    this.icon = scene.add.image(x, y, POWERUP.textures[kind]);
    this.icon.setDisplaySize(POWERUP.iconSize, POWERUP.iconSize);
    this.icon.setOrigin(0.5, 0.5);
    this.icon.setDepth(7);

    this.updateBounds();
  }

  private updateBounds(): void {
    const r = POWERUP.visualRadius;
    this.boundsRect.setTo(this.x - r, this.y - r, r * 2, r * 2);
  }

  update(delta: number, effectiveScroll: number): void {
    this.baseY += effectiveScroll * (delta / 1000);
    this.phase += (delta / 1000) * POWERUP.floatHz * Math.PI * 2;
    this.y = this.baseY + Math.sin(this.phase) * POWERUP.floatAmp;
    this.icon.setPosition(this.x, this.y);
    this.glow?.setPosition(this.x, this.y);
    this.updateBounds();
  }

  get offscreen(): boolean {
    const { road } = getLayout();
    return this.y > road.bottomY + POWERUP.visualRadius;
  }

  // Reusable rectangle buffer to eliminate per-frame GC allocations
  private readonly boundsRect = new Phaser.Geom.Rectangle();

  /** Pre-calculated bounds rectangle accessor; O(1) time without re-computing coordinate math during collision loops. */
  getBounds(out: Phaser.Geom.Rectangle = this.boundsRect): Phaser.Geom.Rectangle {
    if (out !== this.boundsRect) {
      out.setTo(this.boundsRect.x, this.boundsRect.y, this.boundsRect.width, this.boundsRect.height);
    }
    return out;
  }

  destroy(): void {
    this.glow?.destroy();
    this.icon.destroy();
    this.active = false;
  }
}