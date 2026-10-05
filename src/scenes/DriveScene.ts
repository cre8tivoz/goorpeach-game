import Phaser from 'phaser';
import { SCENES, COLOURS, COLOUR_HEX, TRAM, TRAM_WARN, HAPTICS, EXHAUST, POWERUP, COURIER, MESSAGES, LANDMARKS } from '../config';
import { getLayout } from '../systems/Layout';
import { LEVELS } from '../data/levels';
import { PlayerCar } from '../entities/PlayerCar';
import { OzempicPen } from '../entities/OzempicPen';
import { Courier } from '../entities/Courier';
import { ScooterCourier } from '../entities/ScooterCourier';
import { EbikeCourier } from '../entities/EbikeCourier';
import { PushbikeCourier } from '../entities/PushbikeCourier';
import { PowerUp } from '../entities/PowerUp';
import { Tram, type TramDirection } from '../entities/Tram';
import { TramWarning } from '../entities/TramWarning';
import { HUD } from '../ui/HUD';
import { CrtOverlay } from '../ui/CrtOverlay';
import { PauseOverlay } from '../ui/PauseOverlay';
import { TouchControls } from '../ui/TouchControls';
import { Particles } from '../systems/Particles';
import { ScreenShake } from '../systems/ScreenShake';
import type { CourierBrand, PowerUpKind, SteerIntent } from '../types';
import { Score } from '../systems/Score';
import { Audio } from '../systems/Audio';
import { Persistence } from '../systems/Persistence';

/**
 * DriveScene — the core driving level, parameterised by level id. All level
 * config comes from src/data/levels.ts (rule 2). Couriers, trams, HUD and touch
 * live in their own modules; this scene just orchestrates them. Auto-scrolls
 * forward; ends at the checkpoint after durationMs.
 */
export class DriveScene extends Phaser.Scene {
  private audio?: Audio;
  private player!: PlayerCar;
  private hud!: HUD;
  private touch!: TouchControls;
  private pauseOverlay!: PauseOverlay;
  private paused = false;
  private levelData!: (typeof LEVELS)[number];

  private timeLeft = 0;
  private scrollSpeed = 0;
  private roadBase!: Phaser.GameObjects.Graphics;
  private roadLines!: Phaser.GameObjects.Graphics;
  private landmarkSprite?: Phaser.GameObjects.Image;
  private landmarkLabel!: Phaser.GameObjects.Text;
  private landmarkVisible = false;
  private roadScroll = 0;

  private pens: OzempicPen[] = [];
  /** Inactive pens parked for reuse — pens fire ~every 280ms, so pooling avoids churn. */
  private penPool: OzempicPen[] = [];
  private couriers: Courier[] = [];
  private powerups: PowerUp[] = [];
  private trams: Tram[] = [];
  private tramWarnings: TramWarning[] = [];
  private score = new Score();

  private lastFireTime = 0;
  private readonly fireCooldown = 280;

  // Keyboard (optional — mobile uses touch only)
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyA?: Phaser.Input.Keyboard.Key;
  private keyD?: Phaser.Input.Keyboard.Key;
  private keyS?: Phaser.Input.Keyboard.Key;
  private fireKey?: Phaser.Input.Keyboard.Key;
  private pauseKey?: Phaser.Input.Keyboard.Key;

  // Predictable spawn cursors
  private nextCourierWaveIndex = 0;
  private nextPowerupIndex = 0;
  private nextTramIndex = 0;
  private tramTimers: Phaser.Time.TimerEvent[] = [];

  private levelId = 1;
  private endingRun = false;
  private runScoreSeed = 0; // score carried in from earlier levels this run
  private levelStartScore = 0; // snapshot for "Restart Level"

  constructor() {
    super(SCENES.Drive);
  }

  init(data: { levelId?: number; score?: number }): void {
    this.levelId = data.levelId ?? 1;
    this.runScoreSeed = data.score ?? 0;
  }

  create(): void {
    const { width, centerX, road, player } = getLayout();

    this.physics.world.setBounds(0, road.topY, width, road.bottomY - road.topY);

    const level = LEVELS.find((l) => l.id === this.levelId);
    if (!level) {
      console.error('[Drive] Level 1 (Richmond) missing from levels.ts');
      this.scene.start(SCENES.Menu);
      return;
    }
    this.levelData = level;
    this.scrollSpeed = level.scrollSpeed;
    this.timeLeft = level.durationMs / 1000;

    // Reset per-run state — Phaser reuses the scene instance across restarts.
    // The pool holds GameObjects from the *previous* run that Phaser destroyed on
    // shutdown, so drop those stale references and start the pool empty.
    this.pens = [];
    this.penPool = [];
    this.couriers = [];
    this.powerups = [];
    this.trams = [];
    this.tramWarnings = [];
    this.score = new Score();
    this.score.seed(this.runScoreSeed); // accumulate across the run
    this.levelStartScore = this.runScoreSeed;
    this.nextCourierWaveIndex = 0;
    this.nextPowerupIndex = 0;
    this.nextTramIndex = 0;
    this.tramTimers = [];
    this.lastFireTime = 0;
    this.roadScroll = 0;
    this.endingRun = false;
    this.paused = false;
    this.time.timeScale = 1;
    this.physics.resume();

    // Procedural road (palette tokens, chunky GTA-1 look — no heavy bitmap)
    this.roadBase = this.add.graphics();
    this.drawRoadBase();
    this.roadLines = this.add.graphics();
    this.landmarkSprite?.destroy();
    this.landmarkSprite = undefined;
    this.landmarkVisible = false;
    this.landmarkLabel = this.add
      .text(0, 0, '', { fontFamily: 'JetBrains Mono', fontSize: '5px', color: COLOUR_HEX.text })
      .setDepth(2)
      .setOrigin(0.5, 0)
      .setVisible(false);

    this.hud = new HUD(this, level.name);
    this.player = new PlayerCar(this, centerX, player.cruiseY, 'playerClean', level.scrollSpeed);
    this.addExhaust();
    this.touch = new TouchControls(this);
    this.pauseOverlay = new PauseOverlay(this, {
      onResume: () => this.togglePause(false),
      onRestart: () => this.restartLevel(),
      onQuit: () => this.quitToMenu(),
      getMuted: () => this.audio?.isMuted ?? false,
      onMuteToggle: () => {
        const muted = this.audio?.toggleMute() ?? false;
        if (muted) this.audio?.stopMusic();
        else this.playMusic('drivingLoopA');
      },
    });

    this.audio = this.registry.get('audio') as Audio | undefined;
    if (this.audio) {
      const settings = Persistence.getSettings();
      this.audio.setMusicVolume(settings.musicVolume);
      this.audio.setSfxVolume(settings.soundVolume);
    }
    this.playMusic('drivingLoopA');

    new CrtOverlay(this);
    this.addPauseButton();
    this.setupKeyboard();
    this.refreshHud();
  }

  private addPauseButton(): void {
    const btn = this.add
      .text(16, 14, 'II', {
        fontFamily: 'Bungee',
        fontSize: '12px',
        color: COLOUR_HEX.text,
        backgroundColor: COLOUR_HEX.textDark,
      })
      .setOrigin(0, 0)
      .setPadding(4, 6, 4, 6)
      .setDepth(5000)
      .setInteractive({ useHandCursor: true });
    btn.on('pointerover', () => btn.setColor(COLOUR_HEX.cyan));
    btn.on('pointerout', () => btn.setColor(COLOUR_HEX.text));
    btn.on('pointerup', () => this.togglePause());
  }

  private setupKeyboard(): void {
    const kb = this.input.keyboard;
    if (!kb) return;
    this.cursors = kb.createCursorKeys();
    this.keyA = kb.addKey('A');
    this.keyD = kb.addKey('D');
    this.keyS = kb.addKey('S');
    this.fireKey = kb.addKey('SPACE');
    this.pauseKey = kb.addKey('P');

    kb.on('keydown', (ev: KeyboardEvent) => {
      if (!this.paused) return;
      if (ev.key === 'r' || ev.key === 'R') {
        this.restartLevel();
      } else if (ev.key === 'q' || ev.key === 'Q') {
        this.quitToMenu();
      } else if (ev.key === 'm' || ev.key === 'M') {
        const muted = this.audio?.toggleMute() ?? false;
        if (muted) this.audio?.stopMusic();
        else this.playMusic('drivingLoopA');
        this.pauseOverlay.show(); // Refresh mute label
      }
    });
  }

  private togglePause(force?: boolean): void {
    if (this.endingRun) return;
    const next = force ?? !this.paused;
    this.paused = next;
    if (next) {
      this.pauseOverlay.show();
      this.physics.pause();
      this.time.timeScale = 0;
    } else {
      this.pauseOverlay.hide();
      this.physics.resume();
      this.time.timeScale = 1;
    }
  }

  private restartLevel(): void {
    if (this.endingRun) return;
    this.cleanupHazards();
    this.pauseOverlay.hide();
    this.paused = false;
    this.time.timeScale = 1;
    this.physics.resume();
    this.scene.restart({ levelId: this.levelId, score: this.levelStartScore });
  }

  private quitToMenu(): void {
    if (this.endingRun) return;
    this.endingRun = true;
    this.cleanupHazards();
    this.audio?.stopMusic();
    this.scene.start(SCENES.Menu);
  }

  /** Merge keyboard and touch into a single intent (rule 5). */
  private buildIntent(): SteerIntent {
    const c = this.cursors;
    const kbLeft = (c?.left.isDown ?? false) || (this.keyA?.isDown ?? false);
    const kbRight = (c?.right.isDown ?? false) || (this.keyD?.isDown ?? false);
    const kbBrake = (c?.down.isDown ?? false) || (this.keyS?.isDown ?? false);
    const t = this.touch.getState();
    // Keyboard is full-lock ±1; touch is proportional. Keyboard wins when held.
    const kbAxis = (kbRight ? 1 : 0) - (kbLeft ? 1 : 0);
    const steerAxis = kbAxis !== 0 ? kbAxis : (t.steerAxis ?? 0);
    return {
      left: kbLeft || t.left,
      right: kbRight || t.right,
      brake: kbBrake || t.brake,
      steerAxis,
    };
  }

  update(time: number, delta: number): void {
    if (!this.player || this.endingRun) return;

    if (this.pauseKey && Phaser.Input.Keyboard.JustDown(this.pauseKey)) {
      this.togglePause();
      return;
    }

    if (this.paused) return;

    this.player.update(delta, Date.now(), this.buildIntent());

    // Scrolling road — tied to brake (S / ↓ / hold brake zone)
    const effectiveScroll = this.scrollSpeed * this.player.getSpeedRatio();
    this.roadScroll += effectiveScroll * (delta / 1000);
    this.drawRoadLines();
    this.drawLandmark();

    // Firing — keyboard held or a touch tap; touch only consumed off cooldown so taps aren't dropped
    const offCooldown = time - this.lastFireTime > this.fireCooldown;
    const wantFire = (this.fireKey?.isDown ?? false) || (offCooldown && this.touch.consumeFire());
    if (wantFire && offCooldown && this.player.canFire()) {
      this.player.consumeAmmo();
      this.firePen();
      this.lastFireTime = time;
    }

    this.updatePens(delta);
    this.runSpawns();
    this.updateCouriers(delta);
    this.updatePowerups(delta, effectiveScroll);
    this.updateTrams(delta);

    this.timeLeft -= delta / 1000;
    if (this.timeLeft <= 0) {
      this.completeLevel();
      return;
    }
    this.refreshHud();
  }

  private updatePens(delta: number): void {
    for (let i = this.pens.length - 1; i >= 0; i--) {
      const pen = this.pens[i];
      if (!pen || !pen.active) {
        this.releasePen(i);
        continue;
      }
      pen.update(delta);
      if (pen.offscreen) {
        this.releasePen(i);
      }
    }
  }

  private runSpawns(): void {
    const { road } = getLayout();
    const elapsed = this.levelData.durationMs - this.timeLeft * 1000;

    while (
      this.nextCourierWaveIndex < this.levelData.courierWaves.length &&
      elapsed >= (this.levelData.courierWaves[this.nextCourierWaveIndex]?.triggerMs ?? Infinity)
    ) {
      const wave = this.levelData.courierWaves[this.nextCourierWaveIndex];
      wave?.spawns.forEach((spawn, idx) => {
        const x = road.laneXs[idx % road.laneXs.length] ?? getLayout().centerX;
        const y = road.topY + COURIER.spawnInsetY;
        this.couriers.push(this.spawnCourier(spawn.brand, x, y));
      });
      this.nextCourierWaveIndex += 1;
    }

    while (
      this.nextPowerupIndex < this.levelData.powerUpSpawns.length &&
      elapsed >= (this.levelData.powerUpSpawns[this.nextPowerupIndex]?.triggerMs ?? Infinity)
    ) {
      const p = this.levelData.powerUpSpawns[this.nextPowerupIndex];
      const idx = this.nextPowerupIndex % road.laneXs.length;
      const px = road.laneXs[idx % road.laneXs.length] ?? getLayout().centerX;
      const py = road.topY - POWERUP.spawnAboveRoad;
      if (p) this.powerups.push(new PowerUp(this, px, py, p.kind));
      this.nextPowerupIndex += 1;
    }

    const tramTimes = this.levelData.tramSpawnTimes;
    while (this.nextTramIndex < tramTimes.length && elapsed >= (tramTimes[this.nextTramIndex] ?? Infinity)) {
      this.spawnTram();
      this.nextTramIndex += 1;
    }
  }

  private spawnCourier(brand: CourierBrand, x: number, y: number): Courier {
    switch (brand) {
      case 'GoorPeach':
        return new ScooterCourier(this, x, y);
      case 'ChewSnog':
        return new EbikeCourier(this, x, y);
      case 'GorgeRush':
        return new PushbikeCourier(this, x, y);
    }
  }

  private updateCouriers(delta: number): void {
    // Hoist player hit bounds and offscreen threshold outside loop to compute once per frame instead of per courier
    const playerHitBounds = this.player.getHitBounds();
    const bottomThreshold = getLayout().height + 20;
    for (let i = this.couriers.length - 1; i >= 0; i--) {
      const c = this.couriers[i];
      if (!c || !c.active || c.sprite.y > bottomThreshold) {
        c?.destroy();
        this.couriers.splice(i, 1);
        continue;
      }
      c.update(delta);

      // Pen hits — hoist courier hit bounds outside pen loop to convert O(N*M) bounds calculations to O(N+M)
      let killed = false;
      const cHitBounds = c.getHitBounds();
      for (let p = this.pens.length - 1; p >= 0; p--) {
        const pen = this.pens[p];
        if (!pen || !pen.active) continue;
        if (Phaser.Geom.Intersects.RectangleToRectangle(pen.getBounds(), cHitBounds)) {
          this.releasePen(p);
          if (c.hit()) {
            Particles.burst(this, c.sprite.x, c.sprite.y, 'courierBurst');
            this.score.addCourier(c.brand);
            c.destroy();
            this.couriers.splice(i, 1);
            killed = true;
            this.audio?.playCourierCrash(0.8);
          }
          break;
        }
      }
      if (killed) continue;

      // Player damage — tight, player-favouring boxes on both sides so couriers
      // only hurt when they visibly touch the car (not via sprite padding).
      if (Phaser.Geom.Intersects.RectangleToRectangle(playerHitBounds, c.getBodyBounds())) {
        const dead = this.player.takeDamage();
        c.destroy();
        this.couriers.splice(i, 1);
        this.playSfx('heartLost', 0.9);
        this.vibrate(HAPTICS.courierHit);
        ScreenShake.courierHit(this);
        if (dead) {
          this.gameOver('courier');
          return;
        }
      }
    }
  }

  private updatePowerups(delta: number, effectiveScroll: number): void {
    // Use pre-calculated player hit bounds directly without copying into buffer
    const playerBounds = this.player.getHitBounds();
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const p = this.powerups[i];
      if (!p || !p.active) {
        this.powerups.splice(i, 1);
        continue;
      }
      p.update(delta, effectiveScroll);
      if (p.offscreen) {
        p.destroy();
        this.powerups.splice(i, 1);
        continue;
      }
      if (Phaser.Geom.Intersects.RectangleToRectangle(playerBounds, p.getBounds())) {
        this.applyPowerUp(p.kind);
        p.destroy();
        this.powerups.splice(i, 1);
        this.playSfx('powerupPickup', 0.7);
        this.vibrate(HAPTICS.powerup);
      }
    }
  }

  private updateTrams(delta: number): void {
    // Hoist player hit bounds outside tram loop
    const playerHitBounds = this.player.getHitBounds();
    for (let i = this.trams.length - 1; i >= 0; i--) {
      const tram = this.trams[i];
      if (!tram) {
        this.trams.splice(i, 1);
        continue;
      }
      tram.update(delta);
      if (tram.offscreen) {
        tram.destroy();
        this.trams.splice(i, 1);
      } else if (Phaser.Geom.Intersects.RectangleToRectangle(playerHitBounds, tram.getHitBounds())) {
        Particles.burst(this, this.player.sprite.x, this.player.sprite.y, 'tramSparks');
        ScreenShake.tramDeath(this);
        this.gameOver('tram');
        return;
      }
    }
  }

  private firePen(): void {
    const x = this.player.sprite.x;
    const y = this.player.sprite.y - 30;
    const pen = this.penPool.pop();
    if (pen) pen.spawn(x, y);
    this.pens.push(pen ?? new OzempicPen(this, x, y));
    this.playSfx('ozempicFire', 0.7);
  }

  /** Park a spent pen back in the pool and remove it from the active list. */
  private releasePen(index: number): void {
    const pen = this.pens[index];
    this.pens.splice(index, 1);
    if (pen) {
      pen.deactivate();
      this.penPool.push(pen);
    }
  }

  private applyPowerUp(kind: PowerUpKind): void {
    switch (kind) {
      case 'ammo':
        this.player.addAmmo(POWERUP.ammo.shots);
        break;
      case 'boost':
        this.player.applyBoost(POWERUP.boost.durationMs);
        break;
      case 'shield':
        this.player.applyShield();
        break;
      case 'magpie':
        for (let idx = this.couriers.length - 1; idx >= 0; idx--) {
          const c = this.couriers[idx];
          if (c && c.active && Math.abs(c.sprite.x - this.player.sprite.x) < POWERUP.magpie.radius) {
            this.score.addCourier(c.brand);
            c.destroy();
            this.couriers.splice(idx, 1);
          }
        }
        break;
    }
  }

  /** Fixed cross-street depth — ahead of cruise lane; brake drops you clear. */
  private tramCrossY(): number {
    return getLayout().player.cruiseY - TRAM.crossAheadOffset;
  }

  /** Tram body crosses — ding first, then duck driving music under it. */
  private arriveTram(warning: TramWarning, direction: TramDirection, crossY: number): void {
    if (!this.scene.isActive() || this.endingRun) return;
    const idx = this.tramWarnings.indexOf(warning);
    if (idx >= 0) this.tramWarnings.splice(idx, 1);
    warning.destroy();
    this.trams.push(new Tram(this, direction, crossY));
    this.audio?.playTramBell(1.0);
    this.time.delayedCall(TRAM.duckDelayMs, () => {
      if (!this.endingRun) this.audio?.duck(TRAM.duckFactor, TRAM.duckRestoreMs);
    });
  }

  private spawnTram(): void {
    const direction: TramDirection = this.nextTramIndex % 2 === 0 ? 'left' : 'right';
    const crossY = this.tramCrossY();
    const warning = new TramWarning(this, crossY, direction);
    this.tramWarnings.push(warning);

    // Audible + haptic alarm — the visual telegraph alone was too easy to miss.
    this.ringTramAlarm();

    const timer = this.time.delayedCall(
      TRAM.warningMs,
      () => this.arriveTram(warning, direction, crossY),
      undefined,
      this,
    );
    this.tramTimers.push(timer);
  }

  /** Bell rings spread across the telegraph window, plus a touch-device buzz. */
  private ringTramAlarm(): void {
    const spacing = TRAM.warningMs / (TRAM_WARN.bellRings + 1);
    for (let i = 0; i < TRAM_WARN.bellRings; i++) {
      const delay = i * spacing;
      const ring = (): void => this.playSfx('tramBell', TRAM_WARN.bellVolume);
      if (delay <= 0) ring();
      else this.tramTimers.push(this.time.delayedCall(delay, ring, undefined, this));
    }
    this.vibrate(TRAM_WARN.vibrateMs);
  }

  /** Exhaust puffs trailing the car. Skipped under reduced motion. */
  private addExhaust(): void {
    if (Persistence.getSettings().reducedMotion) return;
    if (!this.textures.exists('softGlow')) return;
    this.add
      .particles(0, 0, 'softGlow', {
        follow: this.player.sprite,
        followOffset: { x: 0, y: EXHAUST.offsetY },
        frequency: EXHAUST.frequencyMs,
        lifespan: EXHAUST.lifespanMs,
        speedX: { min: -8, max: 8 },
        speedY: { min: EXHAUST.speedMin, max: EXHAUST.speedMax },
        scale: { start: EXHAUST.scaleStart, end: 0 },
        alpha: { start: EXHAUST.alphaStart, end: 0 },
        tint: EXHAUST.tint,
        blendMode: 'NORMAL',
      })
      .setDepth(EXHAUST.depth);
  }

  /** Subtle touch-device haptic. No-ops on desktop and iOS Safari. */
  private vibrate(ms: number): void {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(ms);
    }
  }

  /** Stop tram telegraphs, pending spawns, and the bell when a run ends. */
  private cleanupHazards(): void {
    for (const timer of this.tramTimers) timer.remove();
    this.tramTimers = [];
    for (const warning of this.tramWarnings) warning.destroy();
    this.tramWarnings = [];
    for (const tram of this.trams) tram.destroy();
    this.trams = [];
  }

  private refreshHud(): void {
    this.hud.update({
      lives: this.player.lives,
      ammo: this.player.ammo,
      score: this.score.value,
      secondsLeft: this.timeLeft,
    });
  }

  private drawRoadBase(): void {
    const { width, road } = getLayout();
    const g = this.roadBase;
    g.clear();
    g.fillStyle(COLOURS.road, 1);
    g.fillRect(0, road.topY, width, road.bottomY - road.topY);
    g.fillStyle(COLOURS.footpath, 1);
    g.fillRect(0, road.topY, road.footpathWidth, road.bottomY - road.topY);
    g.fillRect(width - road.footpathWidth, road.topY, road.footpathWidth, road.bottomY - road.topY);
  }

  private drawLandmark(): void {
    const lm = LANDMARKS[this.levelId];
    if (!lm) {
      if (this.landmarkVisible) {
        this.landmarkSprite?.setVisible(false);
        this.landmarkLabel.setVisible(false);
        this.landmarkVisible = false;
      }
      return;
    }

    const elapsed = this.levelData.durationMs - this.timeLeft * 1000;
    const show = elapsed >= lm.showAtMs && elapsed <= lm.showAtMs + lm.hideAfterMs;

    if (!show) {
      if (this.landmarkVisible) {
        this.landmarkSprite?.setVisible(false);
        this.landmarkLabel.setVisible(false);
        this.landmarkVisible = false;
      }
      return;
    }

    const { width, road } = getLayout();
    const x = width * lm.xFrac;
    const y = road.topY + 48 + (elapsed - lm.showAtMs) * 0.03;

    // Configure texture, display size and text once when transitioning to visible
    if (!this.landmarkVisible) {
      if (!this.landmarkSprite) {
        this.landmarkSprite = this.add.image(x, y, lm.sprite).setDepth(2).setOrigin(0.5, 0);
      } else {
        this.landmarkSprite.setTexture(lm.sprite);
      }
      this.landmarkSprite.setDisplaySize(lm.displayW, lm.displayH);
      this.landmarkSprite.setVisible(true);
      this.landmarkLabel.setText(lm.label).setVisible(true);
      this.landmarkVisible = true;
    }

    this.landmarkSprite?.setPosition(x, y);
    this.landmarkLabel.setPosition(x, y + lm.displayH + 2);
  }

  private drawRoadLines(): void {
    const { road } = getLayout();
    const period = road.dashLength + road.dashGap;
    const start = road.topY - period + (this.roadScroll % period);
    const g = this.roadLines;
    g.clear();
    g.fillStyle(COLOURS.footpath, 0.85);
    const cols = road.lineColumns;
    for (let i = 0; i < cols.length; i++) {
      const x = cols[i];
      if (x === undefined) continue;
      for (let y = start; y < road.bottomY; y += period) {
        const top = Math.max(y, road.topY);
        const bottom = Math.min(y + road.dashLength, road.bottomY);
        if (bottom > top) g.fillRect(x - road.dashWidth / 2, top, road.dashWidth, bottom - top);
      }
    }
  }

  private playMusic(key: 'drivingLoopA'): void {
    if (!this.audio || this.audio.isMuted) return;
    try {
      this.audio.playMusic(key);
    } catch (e) {
      console.info('[Drive] music failed:', key, e);
    }
  }

  private playSfx(key: Parameters<Audio['playSfx']>[0], volume: number): void {
    if (!this.audio || this.audio.isMuted) return;
    try {
      this.audio.playSfx(key, volume);
    } catch (e) {
      console.info('[Drive] sfx failed:', key, e);
    }
  }

  /** Death — hand off to GameOverScene with the right death-cause line. */
  private gameOver(cause: 'courier' | 'tram'): void {
    if (this.endingRun) return;
    this.endingRun = true;
    this.cleanupHazards();
    this.audio?.stopMusic();
    if (cause === 'tram') this.playSfx('tramImpact', 0.95);
    const message = cause === 'tram' ? MESSAGES.tramDeath : this.levelData.deathLine;
    this.scene.start(SCENES.GameOver, {
      message,
      score: this.score.value,
      levelId: this.levelId,
      restartScore: this.levelStartScore,
    });
  }

  /** Level cleared — award the clear bonus, unlock + advance to the next suburb. */
  private completeLevel(): void {
    if (this.endingRun) return;
    this.endingRun = true;
    this.cleanupHazards();
    this.audio?.stopMusic();
    this.score.addLevelClear(Math.max(0, this.timeLeft));

    const nextId = this.levelId + 1;
    const next = LEVELS.find((l) => l.id === nextId);
    Persistence.unlockLevel(nextId); // unlocks the next suburb (or the boss after level 4)

    const { centerX, centerY } = getLayout();
    this.add
      .text(centerX, centerY - 25, 'CHECKPOINT', { fontFamily: 'Bungee', fontSize: '24px', color: COLOUR_HEX.text })
      .setOrigin(0.5);
    this.add
      .text(centerX, centerY + 5, `${this.levelData.name} cleared. ${next ? `On to ${next.name}.` : MESSAGES.checkpoint}`, {
        fontFamily: 'JetBrains Mono',
        fontSize: '9px',
        color: COLOUR_HEX.cyan,
      })
      .setOrigin(0.5);
    this.add
      .text(centerX, centerY + 25, `SCORE: ${this.score.value}`, {
        fontFamily: 'JetBrains Mono',
        fontSize: '10px',
        color: COLOUR_HEX.bile,
      })
      .setOrigin(0.5);

    const carriedScore = this.score.value;
    this.time.delayedCall(1600, () => {
      if (next) {
        this.scene.start(SCENES.Drive, { levelId: nextId, score: carriedScore });
      } else {
        // After Approaching Kew (level 4), into the Kew boss arena.
        this.scene.start(SCENES.Boss, { score: carriedScore });
      }
    });
  }
}
