import Phaser from 'phaser';
import { PEN } from '../config';
import { getLayout } from '../systems/Layout';

/**
 * OzempicPen — the player's projectile. Grok-generated pen sprite.
 * Generous against couriers when fired (CLAUDE.md rule 9). Tuning from PEN.
 */
export class OzempicPen {
  private readonly body: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.body = scene.add.image(x, y, PEN.texture);
    this.body.setDisplaySize(PEN.width, PEN.height);
    this.body.setOrigin(0.5, 0.5);
    this.body.setDepth(11);
  }

  /** Re-arm a pooled pen at a new muzzle position instead of allocating one. */
  spawn(x: number, y: number): void {
    this.body.setPosition(x, y);
    this.body.setActive(true).setVisible(true);
  }

  /** Park the pen for reuse (pooled) — cheaper than destroy/re-create. */
  deactivate(): void {
    this.body.setActive(false).setVisible(false);
  }

  // Reusable rectangle buffer to eliminate per-frame GC allocations
  private readonly boundsRect = new Phaser.Geom.Rectangle();

  /** Direct coordinate bounds arithmetic avoiding CPU-intensive Phaser matrix transform calculations. */
  getBounds(out: Phaser.Geom.Rectangle = this.boundsRect): Phaser.Geom.Rectangle {
    const w = PEN.width;
    const h = PEN.height;
    out.setTo(this.body.x - w / 2, this.body.y - h / 2, w, h);
    return out;
  }

  get active(): boolean {
    return this.body.active;
  }

  /** True once it has flown off the top of the play area. */
  get offscreen(): boolean {
    return this.body.y < getLayout().road.topY - 4;
  }

  update(delta: number): void {
    this.body.y -= PEN.speed * (delta / 1000);
  }

  destroy(): void {
    if (this.body.active) this.body.destroy();
  }
}