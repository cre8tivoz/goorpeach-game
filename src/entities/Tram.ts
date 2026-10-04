import Phaser from 'phaser';
import { TRAM } from '../config';
import { getLayout } from '../systems/Layout';

export type TramDirection = 'left' | 'right';

/** Tram — W-class crosses horizontally from a side street (docs/BRIEF.md). */
export class Tram {
  readonly body: Phaser.GameObjects.Sprite;
  private readonly velocityX: number;
  readonly crossY: number;

  constructor(scene: Phaser.Scene, direction: TramDirection, crossY: number) {
    const { road, width, tram: tramLayout } = getLayout();
    const playableW = width - road.footpathWidth * 2;
    const speed = playableW / (TRAM.crossDurationMs / 1000);
    const length = tramLayout.length;
    this.crossY = crossY;

    const startX = direction === 'left' ? -length / 2 : width + length / 2;
    this.velocityX = direction === 'left' ? speed : -speed;

    this.body = scene.add.sprite(startX, crossY, 'tramBodySheet');
    this.body.setDisplaySize(length, TRAM.height);
    this.body.setOrigin(0.5, 0.5);
    this.body.setDepth(9);
    if (scene.anims.exists('tramRoll')) {
      this.body.play('tramRoll');
    }

    this.updateBounds();
  }

  private updateBounds(): void {
    const length = getLayout().tram.length;
    const bx = this.body.x;
    const by = this.body.y;
    const x = bx - length / 2;
    const y = by - TRAM.height / 2;
    this.boundsRect.setTo(x, y, length, TRAM.height);
    this.hitBoundsRect.setTo(
      x - TRAM.hitPaddingX,
      y - TRAM.hitPaddingY,
      length + TRAM.hitPaddingX * 2,
      TRAM.height + TRAM.hitPaddingY * 2,
    );
  }

  update(delta: number): void {
    this.body.x += this.velocityX * (delta / 1000);
    this.updateBounds();
  }

  // Reusable rectangle buffers for collision bounds to eliminate per-frame GC allocations
  private readonly boundsRect = new Phaser.Geom.Rectangle();
  private readonly hitBoundsRect = new Phaser.Geom.Rectangle();

  /** Pre-calculated bounds rectangle accessor; O(1) time without re-computing coordinate math during collision loops. */
  getBounds(out: Phaser.Geom.Rectangle = this.boundsRect): Phaser.Geom.Rectangle {
    if (out !== this.boundsRect) {
      out.setTo(this.boundsRect.x, this.boundsRect.y, this.boundsRect.width, this.boundsRect.height);
    }
    return out;
  }

  /** Pre-calculated hazard bounds accessor; O(1) time without re-computing coordinate math during collision loops. */
  getHitBounds(out: Phaser.Geom.Rectangle = this.hitBoundsRect): Phaser.Geom.Rectangle {
    if (out !== this.hitBoundsRect) {
      out.setTo(this.hitBoundsRect.x, this.hitBoundsRect.y, this.hitBoundsRect.width, this.hitBoundsRect.height);
    }
    return out;
  }

  get offscreen(): boolean {
    const { width, tram: tramLayout } = getLayout();
    const half = tramLayout.length / 2;
    return this.body.x < -half || this.body.x > width + half;
  }

  destroy(): void {
    if (this.body.active) this.body.destroy();
  }
}