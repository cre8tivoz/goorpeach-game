import Phaser from 'phaser';
import { COURIER } from '../config';
import { getLayout } from '../systems/Layout';
import type { CourierBrand } from '../types';

/**
 * Courier — GoorPeach scooter, ChewSnog e-bike, GorgeRush pushbike (docs/BRIEF.md).
 * Grok-generated sprites with wobble/pedal loops and pulsing food bags.
 */
export class Courier {
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  readonly brand: CourierBrand;
  private readonly foodBag: Phaser.GameObjects.Sprite;
  private hp: number;
  private readonly baseX: number;
  private elapsed = 0;
  private readonly cfg: (typeof COURIER)[CourierBrand];
  private readonly bodySize: { w: number; h: number };
  private readonly displaySize: { w: number; h: number };

  constructor(scene: Phaser.Scene, x: number, y: number, brand: CourierBrand) {
    this.brand = brand;
    this.cfg = COURIER[brand];
    this.bodySize = COURIER.body[brand];
    this.displaySize = COURIER.displaySize[brand];
    this.hp = this.cfg.hp;
    this.baseX = x;

    const sheet = COURIER.sheet[brand];
    const anim = COURIER.anim[brand];

    this.sprite = scene.physics.add.sprite(x, y, sheet);
    this.sprite.setDisplaySize(this.displaySize.w, this.displaySize.h);
    this.sprite.setDepth(COURIER.spriteDepth);
    this.sprite.setVelocityY(this.cfg.speed);
    if (scene.anims.exists(anim)) {
      this.sprite.play(anim);
    }

    this.sprite.body?.setSize(this.bodySize.w, this.bodySize.h);

    this.foodBag = scene.add.sprite(x, y + 4, 'foodBagSheet');
    this.foodBag.setDisplaySize(COURIER.foodBagSize, COURIER.foodBagSize);
    this.foodBag.setDepth(COURIER.spriteDepth + 1);
    if (scene.anims.exists('foodBagPulse')) {
      this.foodBag.play('foodBagPulse');
    }
  }

  update(delta: number): void {
    const { road, width } = getLayout();

    if (this.cfg.weave) {
      this.elapsed += delta / 1000;
      const offset = Math.sin(this.elapsed * this.cfg.weaveFreq * Math.PI * 2) * this.cfg.weaveAmp;
      const half = this.bodySize.w / 2;
      this.sprite.x = Phaser.Math.Clamp(
        this.baseX + offset,
        road.footpathWidth + half,
        width - road.footpathWidth - half,
      );
    }

    this.foodBag.setPosition(this.sprite.x, this.sprite.y + 4);
  }

  // Reusable rectangle buffers for collision bounds to eliminate per-frame GC allocations
  private readonly boundsRect = new Phaser.Geom.Rectangle();
  private readonly hitBoundsRect = new Phaser.Geom.Rectangle();
  private readonly bodyBoundsRect = new Phaser.Geom.Rectangle();

  /** Direct coordinate bounds arithmetic avoiding CPU-intensive Phaser matrix transform calculations. */
  getBounds(out: Phaser.Geom.Rectangle = this.boundsRect): Phaser.Geom.Rectangle {
    const { w, h } = this.displaySize;
    out.setTo(this.sprite.x - w / 2, this.sprite.y - h / 2, w, h);
    return out;
  }

  /** Direct coordinate bounds arithmetic avoiding CPU-intensive Phaser matrix transform calculations. */
  getHitBounds(out: Phaser.Geom.Rectangle = this.hitBoundsRect): Phaser.Geom.Rectangle {
    const { w, h } = this.displaySize;
    const g = COURIER.hitGenerosity;
    out.setTo(this.sprite.x - w / 2 - g, this.sprite.y - h / 2 - g, w + g * 2, h + g * 2);
    return out;
  }

  /**
   * Tight rider hitbox for player-damage collisions — the compact body size from
   * config, centred on the sprite, so couriers only hurt you when they visibly
   * touch (not via the sprite's transparent padding). Player-favouring (rule 9).
   * Reuses output rectangle to eliminate per-frame GC allocations.
   */
  getBodyBounds(out: Phaser.Geom.Rectangle = this.bodyBoundsRect): Phaser.Geom.Rectangle {
    const { w, h } = this.bodySize;
    out.setTo(this.sprite.x - w / 2, this.sprite.y - h / 2, w, h);
    return out;
  }

  hit(): boolean {
    this.hp -= 1;
    if (this.hp > 0) {
      this.sprite.setAlpha(0.35);
      this.foodBag.setAlpha(0.35);
      this.sprite.scene.time.delayedCall(80, () => {
        if (this.sprite.active) {
          this.sprite.setAlpha(1);
          this.foodBag.setAlpha(1);
        }
      });
      return false;
    }
    return true;
  }

  get active(): boolean {
    return this.sprite?.active ?? false;
  }

  destroy(): void {
    if (this.foodBag?.active) this.foodBag.destroy();
    if (this.sprite?.active) this.sprite.destroy();
  }
}