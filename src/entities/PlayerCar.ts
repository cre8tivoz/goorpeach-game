import Phaser from 'phaser';
import { PLAYER } from '../config';
import { getLayout } from '../systems/Layout';
import type { SteerIntent } from '../types';

/**
 * PlayerCar — the VN Commodore. Braking slows world scroll via getSpeedRatio().
 */
export class PlayerCar {
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  private readonly scene: Phaser.Scene;
  private currentSpeed: number;
  private readonly maxSpeed: number;
  private readonly steerSpeed: number;
  private steering: 'left' | 'right' | 'none' = 'none';

  lives: number;
  ammo: number = PLAYER.startingAmmo;
  hasShield = false;
  boostEndTime = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string, maxSpeed: number) {
    this.scene = scene;
    this.maxSpeed = maxSpeed;
    this.sprite = scene.physics.add.sprite(x, y, texture);
    this.sprite.setScale(PLAYER.scale);
    this.sprite.setOrigin(0.5, 0.5);
    this.sprite.setDepth(10);

    this.sprite.body?.setSize(
      this.sprite.width - PLAYER.hitboxPadding * 2,
      this.sprite.height - PLAYER.hitboxPadding * 2,
    );

    this.currentSpeed = this.maxSpeed;
    this.steerSpeed = PLAYER.steerSpeed;
    this.lives = PLAYER.startingLives;
    this.applyDamageVisual();
    this.updateHitBounds();
  }

  private updateHitBounds(): void {
    const w = this.sprite.displayWidth;
    const h = this.sprite.displayHeight;
    const x = this.sprite.x - w / 2;
    const y = this.sprite.y - h / 2;
    const ix = w * PLAYER.hitInsetXFrac;
    const iy = h * PLAYER.hitInsetYFrac;
    this.hitBoundsRect.setTo(x + ix, y + iy, w - ix * 2, h - iy * 2);
  }

  /** Progressive Commodore damage — worn sprite, then wrecked tint on last heart. */
  applyDamageVisual(): void {
    const sprite = this.sprite;
    sprite.stop();
    if (this.lives >= PLAYER.wornBelowLives) {
      sprite.setTexture(PLAYER.textures.clean);
      sprite.clearTint();
    } else if (this.lives > PLAYER.criticalLives) {
      sprite.setTexture(PLAYER.textures.worn);
      sprite.clearTint();
    } else {
      sprite.setTexture(PLAYER.textures.wrecked);
      sprite.setTint(PLAYER.hitFlashTint);
    }
    sprite.setAngle(0);
  }

  private applySteerVisual(intent: SteerIntent): void {
    const sprite = this.sprite;
    const clean = this.lives >= PLAYER.wornBelowLives;

    if (clean) {
      if (intent.left && !intent.right) {
        if (this.steering !== 'left') {
          this.steering = 'left';
          sprite.play({ key: 'playerTurnLeft', repeat: 0 }, true);
        }
      } else if (intent.right && !intent.left) {
        if (this.steering !== 'right') {
          this.steering = 'right';
          sprite.play({ key: 'playerTurnRight', repeat: 0 }, true);
        }
      } else if (!intent.left && !intent.right) {
        if (this.steering !== 'none') {
          this.steering = 'none';
          sprite.stop();
          this.applyDamageVisual();
        }
      }
      return;
    }

    const target =
      intent.left && !intent.right
        ? -PLAYER.turnAngle
        : intent.right && !intent.left
          ? PLAYER.turnAngle
          : 0;
    sprite.angle = Phaser.Math.Linear(sprite.angle, target, PLAYER.turnLerp);
  }

  update(delta: number, now: number, intent: SteerIntent): void {
    const dt = delta / 1000;
    const sprite = this.sprite;
    const { road, player, width } = getLayout();

    const speedMult = now < this.boostEndTime ? PLAYER.boostMultiplier : 1.0;
    const effectiveSteer = this.steerSpeed * speedMult;

    // Proportional steer: touch tracks the finger, keyboard is full lock. Falls
    // back to the boolean left/right (as ±1) for any input source without an axis.
    const axis = intent.steerAxis ?? ((intent.right ? 1 : 0) - (intent.left ? 1 : 0));
    sprite.x += effectiveSteer * axis * dt;

    this.applySteerVisual(intent);

    const brakeFloor = this.maxSpeed * PLAYER.brakeMinRatio;

    if (intent.brake) {
      this.currentSpeed = Phaser.Math.Linear(this.currentSpeed, brakeFloor, PLAYER.brakeDecay);
    } else {
      this.currentSpeed = Phaser.Math.Linear(this.currentSpeed, this.maxSpeed, PLAYER.accelRate);
    }

    const ratio = this.getSpeedRatio();
    const targetY = Phaser.Math.Linear(player.brakeY, player.cruiseY, ratio);
    sprite.y = Phaser.Math.Linear(sprite.y, targetY, PLAYER.yLerp);

    const halfW = sprite.displayWidth / 2;
    sprite.x = Phaser.Math.Clamp(sprite.x, road.footpathWidth + halfW, width - road.footpathWidth - halfW);
    sprite.y = Phaser.Math.Clamp(sprite.y, player.cruiseY - 8, player.brakeY);

    this.updateHitBounds();
  }

  // Reusable rectangle buffers for collision bounds to eliminate per-frame GC allocations
  private readonly hitBoundsRect = new Phaser.Geom.Rectangle();

  /**
   * Tight, player-favouring damage hitbox. Reuses pre-calculated bounds rectangle to eliminate matrix/bounds math in collision loops.
   */
  getHitBounds(out: Phaser.Geom.Rectangle = this.hitBoundsRect): Phaser.Geom.Rectangle {
    if (out !== this.hitBoundsRect) {
      out.setTo(this.hitBoundsRect.x, this.hitBoundsRect.y, this.hitBoundsRect.width, this.hitBoundsRect.height);
    }
    return out;
  }

  getSpeedRatio(): number {
    return Phaser.Math.Clamp(this.currentSpeed / this.maxSpeed, PLAYER.brakeMinRatio, 1);
  }

  getSpeed(): number {
    return this.currentSpeed;
  }

  takeDamage(): boolean {
    if (this.hasShield) {
      this.hasShield = false;
      this.sprite.setTint(PLAYER.shieldTint);
      this.scene.time.delayedCall(PLAYER.shieldFlashMs, () => {
        if (this.sprite?.active) this.applyDamageVisual();
      });
      return false;
    }

    this.lives -= 1;
    this.steering = 'none';
    this.sprite.setTint(PLAYER.hitFlashTint);
    this.scene.time.delayedCall(PLAYER.hitFlashMs, () => {
      if (this.sprite?.active) this.applyDamageVisual();
    });
    this.applyDamageVisual();
    return this.lives <= 0;
  }

  addAmmo(amount: number): void {
    this.ammo += amount;
  }

  applyBoost(durationMs: number): void {
    this.boostEndTime = Date.now() + durationMs;
  }

  applyShield(): void {
    this.hasShield = true;
    this.sprite.setTint(PLAYER.shieldTint);
  }

  canFire(): boolean {
    return this.ammo > 0;
  }

  consumeAmmo(): void {
    if (this.ammo > 0) this.ammo -= 1;
  }
}