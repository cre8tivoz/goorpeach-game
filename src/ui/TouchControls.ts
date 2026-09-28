import Phaser from 'phaser';
import { COLOURS, COLOUR_HEX, TOUCH_STEER } from '../config';
import { getLayout } from '../systems/Layout';
import { Persistence } from '../systems/Persistence';
import type { SteerIntent } from '../types';

/**
 * TouchControls — the ONLY home for touch input (CLAUDE.md rule 5). Mobile-first:
 * drag the lower-left to steer, hold the lower-right to brake, tap the upper-right
 * to fire (docs/BRIEF.md).
 *
 * It exposes the same semantics the keyboard does — a per-frame SteerIntent via
 * getState() and an edge-triggered consumeFire() — so the scene merges both
 * without knowing which fired. Faint zone hints are drawn on touch devices only.
 */
export class TouchControls {
  private steerPointer: Phaser.Input.Pointer | null = null;
  private steerAnchorX = 0;
  private steerAnchorY = 0;
  private brakePointer: Phaser.Input.Pointer | null = null;
  private firePending = false;

  constructor(scene: Phaser.Scene) {
    // Allow up to three simultaneous touches (steer + brake + fire).
    scene.input.addPointer(2);

    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);

    const touch = getLayout().touch;
    if (touch.showHints && scene.sys.game.device.input.touch) {
      this.drawHints(scene, touch);
    }
  }

  private static inZone(p: Phaser.Input.Pointer, z: { x: number; y: number; w: number; h: number }): boolean {
    return p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h;
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    const touch = getLayout().touch;
    if (TouchControls.inZone(pointer, touch.fireZone)) {
      this.firePending = true;
    } else if (TouchControls.inZone(pointer, touch.steerZone)) {
      this.steerPointer = pointer;
      this.steerAnchorX = pointer.x;
      this.steerAnchorY = pointer.y;
    } else if (TouchControls.inZone(pointer, touch.brakeZone)) {
      this.brakePointer = pointer;
    }
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (pointer === this.steerPointer) this.steerPointer = null;
    if (pointer === this.brakePointer) this.brakePointer = null;
  }

  /**
   * Current steering intent from active touches. Steering is discrete on/off at a
   * constant rate — exactly like the keyboard — so it feels instant and never
   * over-shoots into a far lane. The lower-left pad acts as two on-screen arrow
   * keys: hold the left/right side to steer that way, release to stop.
   *
   * 'joystick' (default): the side is judged from the pad's centre — touch the
   * left half to go left, right half to go right (fixed buttons).
   * 'swipe': the side is judged from where you first touched (relative d-pad).
   * Touch Sens scales the constant steer rate so it can be tuned on-device.
   */
  getState(): SteerIntent {
    const touch = getLayout().touch;
    const settings = Persistence.getSettings();
    const deadzone = touch.steerDeadzone;
    // Touch steers gentler than the keyboard; Touch Sens scales it (config TOUCH_STEER).
    const rate = Phaser.Math.Clamp(
      TOUCH_STEER.factor * settings.touchSteerSensitivity,
      TOUCH_STEER.minRate,
      TOUCH_STEER.maxRate,
    );
    let left = false;
    let right = false;
    let steerAxis = 0;

    if (this.steerPointer && this.steerPointer.isDown) {
      const reference =
        settings.touchInputMode === 'swipe'
          ? this.steerAnchorX
          : touch.steerZone.x + touch.steerZone.w / 2;
      const offset = this.steerPointer.x - reference;

      if (offset < -deadzone) {
        left = true;
        steerAxis = -rate;
      } else if (offset > deadzone) {
        right = true;
        steerAxis = rate;
      }
    } else {
      this.steerPointer = null;
    }

    const brake = !!this.brakePointer && this.brakePointer.isDown;
    return { left, right, brake, steerAxis };
  }

  /**
   * 2D move vector in [-1,1] from the steer-zone drag — used by the boss arena
   * where the player moves freely rather than steering in lanes.
   */
  getMoveVector(): { x: number; y: number } {
    const touch = getLayout().touch;
    const sensitivity = Persistence.getSettings().touchSteerSensitivity;
    if (this.steerPointer && this.steerPointer.isDown) {
      const dx = this.steerPointer.x - this.steerAnchorX;
      const dy = this.steerPointer.y - this.steerAnchorY;
      const range = touch.moveRange / sensitivity;
      return {
        x: Phaser.Math.Clamp(dx / range, -1, 1),
        y: Phaser.Math.Clamp(dy / range, -1, 1),
      };
    }
    this.steerPointer = null;
    return { x: 0, y: 0 };
  }

  /** Edge-triggered fire: true once per tap in the fire zone. */
  consumeFire(): boolean {
    const fired = this.firePending;
    this.firePending = false;
    return fired;
  }

  private drawHints(
    scene: Phaser.Scene,
    touch: ReturnType<typeof getLayout>['touch'],
  ): void {
    const g = scene.add.graphics();
    const sz = touch.steerZone;
    const half = sz.w / 2;
    const alpha = touch.hintAlpha;

    // Steer zones with rounded borders and directional chevrons
    g.fillStyle(COLOURS.cyan, alpha);
    g.fillRect(sz.x + 2, sz.y + 2, half - 4, sz.h - 4);
    g.lineStyle(1, COLOURS.cyan, alpha * 2.5);
    g.strokeRect(sz.x + 2.5, sz.y + 2.5, half - 5, sz.h - 5);

    g.fillStyle(COLOURS.cyan, alpha * 1.5);
    g.fillRect(sz.x + half + 2, sz.y + 2, half - 4, sz.h - 4);
    g.lineStyle(1, COLOURS.cyan, alpha * 2.5);
    g.strokeRect(sz.x + half + 2.5, sz.y + 2.5, half - 5, sz.h - 5);

    // Brake zone with caution border
    const bz = touch.brakeZone;
    g.fillStyle(COLOURS.caution, alpha);
    g.fillRect(bz.x + 2, bz.y + 2, bz.w - 4, bz.h - 4);
    g.lineStyle(1, COLOURS.caution, alpha * 2.5);
    g.strokeRect(bz.x + 2.5, bz.y + 2.5, bz.w - 5, bz.h - 5);

    // Fire zone with hazard border
    const fz = touch.fireZone;
    g.fillStyle(COLOURS.hazard, alpha);
    g.fillRect(fz.x + 2, fz.y + 2, fz.w - 4, fz.h - 4);
    g.lineStyle(1, COLOURS.hazard, alpha * 2.5);
    g.strokeRect(fz.x + 2.5, fz.y + 2.5, fz.w - 5, fz.h - 5);

    const tag = (x: number, y: number, s: string, size = 6, color: string = COLOUR_HEX.text): void => {
      scene.add
        .text(x, y, s, { fontFamily: 'JetBrains Mono', fontSize: `${size}px`, color })
        .setOrigin(0.5)
        .setAlpha(0.75);
    };
    const midY = sz.y + sz.h / 2;
    tag(sz.x + half / 2, midY, '◄ STEER', 9, COLOUR_HEX.cyan);
    tag(sz.x + half + half / 2, midY, 'STEER ►', 9, COLOUR_HEX.cyan);
    tag(bz.x + bz.w / 2, bz.y + bz.h / 2, 'BRAKE ⬇', 9, COLOUR_HEX.caution);
    tag(fz.x + fz.w / 2, fz.y + fz.h / 2, '⚡ FIRE', 9, COLOUR_HEX.hazard);
  }
}