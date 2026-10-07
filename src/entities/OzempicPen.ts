import Phaser from 'phaser';
import { PEN } from '../config';
import { getLayout } from '../systems/Layout';

/**
 * OzempicPen — the player's projectile. Grok-generated pen sprite.
 * Generous against couriers when fired (CLAUDE.md rule 9). Tuning from PEN.
 */
export class OzempicPen {
  private readonly body: Phaser.GameObjects.Image;

  // Reusable rectangle buffer pre-computed on position update to eliminate O(N*M) inner loop arithmetic
  private readonly boundsRect = new Phaser.Geom.Rectangle();

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.body = scene.add.image(x, y, PEN.texture);
    this.body.setDisplaySize(PEN.width, PEN.height);
    this.body.setOrigin(0.5, 0.5);
    this.body.setDepth(11);
    this.updateBounds();
  }

  /** Re-arm a pooled pen at a new muzzle position instead of allocating one. */
  spawn(x: number, y: number): void {
    this.body.setPosition(x, y);
    this.body.setActive(true).setVisible(true);
    this.updateBounds();
  }

  /** Park the pen for reuse (pooled) — cheaper than destroy/re-create. */
  deactivate(): void {
    this.body.setActive(false).setVisible(false);
  }

  private updateBounds(): void {
    const w = PEN.width;
    const h = PEN.height;
    this.boundsRect.setTo(this.body.x - w / 2, this.body.y - h / 2, w, h);
  }

  /** Pre-calculated bounds rectangle accessor; O(1) time without re-computing coordinate math during collision loops. */
  getBounds(out: Phaser.Geom.Rectangle = this.boundsRect): Phaser.Geom.Rectangle {
    if (out !== this.boundsRect) {
      out.setTo(this.boundsRect.x, this.boundsRect.y, this.boundsRect.width, this.boundsRect.height);
    }
    return out;
  }

  get active(): boolean {
    return this.body.active;
  }

  /** True once it has flown off the top of the play area. Optional topY overrides getLayout() call in hot loops. */
  isOffscreen(topY?: number): boolean {
    const limitY = topY ?? getLayout().road.topY;
    return this.body.y < limitY - 4;
  }

  get offscreen(): boolean {
    return this.isOffscreen();
  }

  update(delta: number): void {
    this.body.y -= PEN.speed * (delta / 1000);
    this.boundsRect.y = this.body.y - PEN.height / 2;
  }

  destroy(): void {
    if (this.body.active) this.body.destroy();
  }
}