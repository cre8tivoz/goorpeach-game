import Phaser from 'phaser';
import { SCENES, COLOURS, COLOUR_HEX, BOSS, MESSAGES } from '../config';
import { OzempicPen } from '../entities/OzempicPen';
import { Courier } from '../entities/Courier';
import { ScooterCourier } from '../entities/ScooterCourier';
import { EbikeCourier } from '../entities/EbikeCourier';
import { PushbikeCourier } from '../entities/PushbikeCourier';
import { CrtOverlay } from '../ui/CrtOverlay';
import { PauseOverlay } from '../ui/PauseOverlay';
import { TouchControls } from '../ui/TouchControls';
import { Score } from '../systems/Score';
import { Audio } from '../systems/Audio';
import { Particles } from '../systems/Particles';
import { Persistence } from '../systems/Persistence';
import { ScreenShake } from '../systems/ScreenShake';
import type { CourierBrand } from '../types';

type BossPhase = 'feeding' | 'escape';

/**
 * BossScene — the Kew arena, two-phase fight against The Nerd (docs/BRIEF.md).
 *
 * Phase 1 (feeding frenzy): couriers stream in to feed the nerd, raising his
 * feed meter; the player moves freely, fires Ozempic pens up into him to drain
 * it, and rams couriers to stop deliveries. Drain to 0 to win.
 *
 * Phase 2 (Tiguan escape): if the meter hits 100, the nerd bolts for his Tiguan.
 * The player has 15s to disable it with pens. Succeed → back to feeding at a
 * harder second-wind meter. Fail → game over (he's gone to a Grill'd in Chadstone).
 *
 * Everything is tuned from BOSS in config.ts. The nerd and Tiguan are local
 * set-piece props (no dedicated entity files in the locked structure).
 */
export class BossScene extends Phaser.Scene {
  private audio?: Audio;
  private score = new Score();
  private entryScore = 0;

  private phase: BossPhase = 'feeding';
  private feed: number = BOSS.feed.start;
  private ammo: number = BOSS.ammo.start;
  private over = false;

  private player!: Phaser.GameObjects.Sprite;
  private nerd!: Phaser.GameObjects.Image;
  private touch!: TouchControls;
  private pauseOverlay!: PauseOverlay;
  private paused = false;

  private pens: OzempicPen[] = [];
  private feeders: Courier[] = [];
  private feederSpawnIndex = 0;
  private lastFireTime = 0;

  // Phase 2
  private tiguan?: Phaser.GameObjects.Sprite;
  private tiguanHp = 0;
  private escapeEndsAt = 0;

  // HUD
  private feedBar!: Phaser.GameObjects.Graphics;
  private statusText!: Phaser.GameObjects.Text;

  // Input
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW?: Phaser.Input.Keyboard.Key;
  private keyA?: Phaser.Input.Keyboard.Key;
  private keyS?: Phaser.Input.Keyboard.Key;
  private keyD?: Phaser.Input.Keyboard.Key;
  private fireKey?: Phaser.Input.Keyboard.Key;
  private pauseKey?: Phaser.Input.Keyboard.Key;

  private readonly feederBrands: CourierBrand[] = ['GoorPeach', 'ChewSnog', 'GorgeRush'];
  private readonly playerBoundsRect = new Phaser.Geom.Rectangle();
  private readonly nerdBoundsRect = new Phaser.Geom.Rectangle();
  private readonly tiguanBoundsRect = new Phaser.Geom.Rectangle();

  constructor() {
    super(SCENES.Boss);
  }

  init(data: { score?: number }): void {
    this.entryScore = data.score ?? 0;
  }

  create(): void {
    // Reset per-attempt state (Phaser reuses the scene instance)
    this.phase = 'feeding';
    this.feed = BOSS.feed.start;
    this.ammo = BOSS.ammo.start;
    this.over = false;
    this.paused = false;
    this.time.timeScale = 1;
    this.pens = [];
    this.feeders = [];
    this.feederSpawnIndex = 0;
    this.lastFireTime = 0;
    this.tiguan = undefined;
    this.score = new Score();
    this.score.seed(this.entryScore);

    // Arena: Kew mansion backdrop + lawn
    this.add.image(240, 70, 'landmarkKewMansion').setDisplaySize(320, 120).setOrigin(0.5, 0.5).setAlpha(0.92);
    this.add.rectangle(240, 135, 480, 270, COLOURS.tramBody).setOrigin(0.5).setAlpha(0.55); // lawn green
    this.add.rectangle(240, 40, 480, 36, COLOURS.footpath).setOrigin(0.5); // mansion frontage band
    this.add
      .text(240, 40, 'KEW — THE NERD', { fontFamily: 'Bungee', fontSize: '14px', color: COLOUR_HEX.textDark })
      .setOrigin(0.5);

    // The Nerd — Grok-generated Patagonia-vest boss sprite
    this.nerd = this.add.image(BOSS.nerd.x, BOSS.nerd.y, BOSS.nerd.texture);
    this.nerd.setDisplaySize(BOSS.nerd.w, BOSS.nerd.h);
    this.nerd.setOrigin(0.5, 0.5);
    this.updateNerdBounds();

    // Player car (free movement in the arena)
    this.player = this.add.sprite(240, 200, 'playerClean').setScale(BOSS.playerScale);
    this.updatePlayerBounds();

    this.touch = new TouchControls(this);
    this.pauseOverlay = new PauseOverlay(this, {
      onResume: () => this.togglePause(false),
      onRestart: () => this.restartBoss(),
      onQuit: () => this.quitToMenu(),
      getMuted: () => this.audio?.isMuted ?? false,
      onMuteToggle: () => {
        const muted = this.audio?.toggleMute() ?? false;
        if (muted) this.audio?.stopMusic();
        else this.playMusic();
      },
    });
    this.setupInput();
    new CrtOverlay(this);
    this.addPauseButton();

    // HUD
    this.feedBar = this.add.graphics();
    this.statusText = this.add
      .text(240, 258, '', { fontFamily: 'JetBrains Mono', fontSize: '8px', color: COLOUR_HEX.text })
      .setOrigin(0.5);

    // Spawn + ammo-regen loops
    this.time.addEvent({ delay: BOSS.feeder.intervalMs, loop: true, callback: () => this.spawnFeeder() });
    this.time.addEvent({
      delay: BOSS.ammo.regenMs,
      loop: true,
      callback: () => {
        if (!this.over && this.ammo < BOSS.ammo.max) this.ammo += 1;
      },
    });

    this.audio = this.registry.get('audio') as Audio | undefined;
    if (this.audio) {
      const settings = Persistence.getSettings();
      this.audio.setMusicVolume(settings.musicVolume);
      this.audio.setSfxVolume(settings.soundVolume);
    }
    this.playMusic();
    this.drawHud();
  }

  private setupInput(): void {
    const kb = this.input.keyboard;
    if (!kb) return;
    this.cursors = kb.createCursorKeys();
    this.keyW = kb.addKey('W');
    this.keyA = kb.addKey('A');
    this.keyS = kb.addKey('S');
    this.keyD = kb.addKey('D');
    this.fireKey = kb.addKey('SPACE');
    this.pauseKey = kb.addKey('P');

    kb.on('keydown', (ev: KeyboardEvent) => {
      if (!this.paused) return;
      if (ev.key === 'r' || ev.key === 'R') {
        this.restartBoss();
      } else if (ev.key === 'q' || ev.key === 'Q') {
        this.quitToMenu();
      } else if (ev.key === 'm' || ev.key === 'M') {
        const muted = this.audio?.toggleMute() ?? false;
        if (muted) this.audio?.stopMusic();
        else this.playMusic();
        this.pauseOverlay.show(); // Refresh mute label
      }
    });
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

  private togglePause(force?: boolean): void {
    if (this.over) return;
    const next = force ?? !this.paused;
    this.paused = next;
    if (next) {
      this.pauseOverlay.show();
      this.time.timeScale = 0;
    } else {
      this.pauseOverlay.hide();
      this.time.timeScale = 1;
    }
  }

  private restartBoss(): void {
    if (this.over) return;
    this.pauseOverlay.hide();
    this.paused = false;
    this.time.timeScale = 1;
    this.scene.restart({ score: this.entryScore });
  }

  private quitToMenu(): void {
    if (this.over) return;
    this.over = true;
    this.audio?.stopMusic();
    this.scene.start(SCENES.Menu);
  }

  private buildMove(): { x: number; y: number } {
    const c = this.cursors;
    let x = 0;
    let y = 0;
    if ((c?.left.isDown ?? false) || (this.keyA?.isDown ?? false)) x -= 1;
    if ((c?.right.isDown ?? false) || (this.keyD?.isDown ?? false)) x += 1;
    if ((c?.up.isDown ?? false) || (this.keyW?.isDown ?? false)) y -= 1;
    if ((c?.down.isDown ?? false) || (this.keyS?.isDown ?? false)) y += 1;
    const t = this.touch.getMoveVector();
    return { x: Phaser.Math.Clamp(x + t.x, -1, 1), y: Phaser.Math.Clamp(y + t.y, -1, 1) };
  }

  update(time: number, delta: number): void {
    if (this.over) return;

    if (this.pauseKey && Phaser.Input.Keyboard.JustDown(this.pauseKey)) {
      this.togglePause();
      return;
    }

    if (this.paused) return;
    const dt = delta / 1000;

    // Move player within arena
    const move = this.buildMove();
    this.player.x = Phaser.Math.Clamp(
      this.player.x + move.x * BOSS.playerSpeed * dt,
      BOSS.arena.x,
      BOSS.arena.x + BOSS.arena.w,
    );
    this.player.y = Phaser.Math.Clamp(
      this.player.y + move.y * BOSS.playerSpeed * dt,
      BOSS.arena.y,
      BOSS.arena.y + BOSS.arena.h,
    );
    this.updatePlayerBounds();

    // Fire (pens go up the screen toward the nerd)
    const offCooldown = time - this.lastFireTime > BOSS.fireCooldown;
    const wantFire = (this.fireKey?.isDown ?? false) || (offCooldown && this.touch.consumeFire());
    if (wantFire && offCooldown && this.ammo > 0) {
      this.ammo -= 1;
      this.pens.push(new OzempicPen(this, this.player.x, this.player.y - 24));
      this.playSfx('ozempicFire', 0.6);
      this.lastFireTime = time;
    }

    this.updatePens(delta);
    this.updateFeeders(dt);

    if (this.phase === 'feeding') this.updateFeeding(dt);
    else this.updateEscape(time, dt);

    this.drawHud();
  }

  private updatePens(delta: number): void {
    for (let i = this.pens.length - 1; i >= 0; i--) {
      const pen = this.pens[i];
      if (!pen || !pen.active) {
        pen?.destroy();
        this.pens.splice(i, 1);
        continue;
      }
      pen.update(delta);
      if (pen.offscreen) {
        pen.destroy();
        this.pens.splice(i, 1);
      }
    }
  }

  private spawnFeeder(): void {
    if (this.over) return;
    // Deterministic round-robin spawn points around the arena edges (no RNG).
    const points = [
      { x: BOSS.arena.x, y: 205 },
      { x: BOSS.arena.x + BOSS.arena.w, y: 205 },
      { x: BOSS.arena.x, y: BOSS.arena.y + 20 },
      { x: BOSS.arena.x + BOSS.arena.w, y: BOSS.arena.y + 20 },
    ];
    const p = points[this.feederSpawnIndex % points.length] ?? { x: BOSS.arena.x, y: 205 };
    const brand = this.feederBrands[this.feederSpawnIndex % this.feederBrands.length] ?? 'GoorPeach';
    this.feederSpawnIndex += 1;
    const courier = this.spawnArenaCourier(brand, p.x, p.y);
    courier.sprite.setVelocity(0, 0);
    this.feeders.push(courier);
  }

  private spawnArenaCourier(brand: CourierBrand, x: number, y: number): Courier {
    switch (brand) {
      case 'GoorPeach':
        return new ScooterCourier(this, x, y);
      case 'ChewSnog':
        return new EbikeCourier(this, x, y);
      case 'GorgeRush':
        return new PushbikeCourier(this, x, y);
    }
  }

  private updatePlayerBounds(): void {
    const w = this.player.displayWidth;
    const h = this.player.displayHeight;
    this.playerBoundsRect.setTo(this.player.x - w / 2, this.player.y - h / 2, w, h);
  }

  private updateNerdBounds(): void {
    const w = BOSS.nerd.w;
    const h = BOSS.nerd.h;
    this.nerdBoundsRect.setTo(this.nerd.x - w / 2, this.nerd.y - h / 2, w, h);
  }

  private updateTiguanBounds(): void {
    if (!this.tiguan) return;
    const w = this.tiguan.displayWidth;
    const h = this.tiguan.displayHeight;
    this.tiguanBoundsRect.setTo(this.tiguan.x - w / 2, this.tiguan.y - h / 2, w, h);
  }

  private updateFeeders(dt: number): void {
    const deltaMs = dt * 1000;
    // Use pre-calculated player bounds O(1) field lookup without per-frame matrix math
    const playerBounds = this.playerBoundsRect;
    for (let i = this.feeders.length - 1; i >= 0; i--) {
      const c = this.feeders[i];
      if (!c || !c.active) {
        c?.destroy();
        this.feeders.splice(i, 1);
        continue;
      }

      // Player ram — stop the delivery (no ammo cost)
      if (Phaser.Geom.Intersects.RectangleToRectangle(playerBounds, c.getBounds())) {
        Particles.burst(this, c.sprite.x, c.sprite.y, 'courierBurst');
        ScreenShake.courierHit(this);
        this.score.addCourier(c.brand);
        c.destroy();
        this.feeders.splice(i, 1);
        this.audio?.playCourierCrash(0.7);
        continue;
      }

      // Move toward the nerd
      const sprite = c.sprite;
      const dx = this.nerd.x - sprite.x;
      const dy = this.nerd.y - sprite.y;
      const dist = Math.hypot(dx, dy) || 1;
      sprite.x += (dx / dist) * BOSS.feeder.speed * dt;
      sprite.y += (dy / dist) * BOSS.feeder.speed * dt;
      c.update(deltaMs);

      // Delivery — only feeds the nerd during the feeding phase
      if (dist < BOSS.feeder.deliverDist) {
        if (this.phase === 'feeding') {
          this.feed = Math.min(BOSS.feed.phase2At, this.feed + BOSS.feed.deliveryRise);
          this.showNerdState('feed');
        }
        c.destroy();
        this.feeders.splice(i, 1);
      }
    }
  }

  private updateFeeding(dt: number): void {
    // Passive creep keeps the pressure on
    this.feed = Math.min(BOSS.feed.phase2At, this.feed + BOSS.feed.passiveRisePerSec * dt);

    // Pen hits on the nerd drain the meter — use cached nerd bounds without per-frame matrix math
    const nerdBounds = this.nerdBoundsRect;
    for (let i = this.pens.length - 1; i >= 0; i--) {
      const pen = this.pens[i];
      if (pen && pen.active && Phaser.Geom.Intersects.RectangleToRectangle(pen.getBounds(), nerdBounds)) {
        pen.destroy();
        this.pens.splice(i, 1);
        this.feed = Math.max(0, this.feed - BOSS.feed.penDrain);
        this.showNerdState('hit');
      }
    }

    if (this.feed <= BOSS.feed.winAt) {
      this.winBoss();
    } else if (this.feed >= BOSS.feed.phase2At) {
      this.enterEscape();
    }
  }

  private enterEscape(): void {
    this.phase = 'escape';
    const boltY = this.nerd.y;
    this.nerd.setTexture(BOSS.nerd.textures.bolt);
    this.nerd.setVisible(true);
    this.tweens.add({
      targets: this.nerd,
      y: boltY - 36,
      duration: BOSS.nerd.boltRunMs,
      onComplete: () => {
        if (this.nerd.active) this.nerd.setVisible(false);
      },
    });

    this.tiguan = this.add
      .sprite(this.nerd.x, boltY, BOSS.escape.tiguanTexture)
      .setScale(BOSS.escape.tiguanScale);
    if (this.anims.exists(BOSS.escape.tiguanAnim)) {
      this.tiguan.play(BOSS.escape.tiguanAnim);
    }
    this.tiguanHp = BOSS.escape.tiguanHp;
    this.escapeEndsAt = this.time.now + BOSS.escape.timeMs;
    this.playSfx('tiguanStart', 1.0);
    this.audio?.duck();
  }

  private updateEscape(time: number, dt: number): void {
    const tiguan = this.tiguan;
    if (!tiguan) return;

    // Drive toward the exit (off the top of the arena)
    tiguan.y -= BOSS.escape.tiguanSpeed * dt;
    this.updateTiguanBounds();

    // Pen hits disable it — use cached tiguan bounds without per-frame matrix math
    const tiguanBounds = this.tiguanBoundsRect;
    for (let i = this.pens.length - 1; i >= 0; i--) {
      const pen = this.pens[i];
      if (pen && pen.active && Phaser.Geom.Intersects.RectangleToRectangle(pen.getBounds(), tiguanBounds)) {
        pen.destroy();
        this.pens.splice(i, 1);
        this.tiguanHp -= 1;
        tiguan.setTint(0xffffff);
        this.time.delayedCall(60, () => tiguan.active && tiguan.clearTint());
      }
    }

    if (this.tiguanHp <= 0) {
      this.returnToFeeding();
      return;
    }
    if (tiguan.y <= BOSS.escape.exitY || time >= this.escapeEndsAt) {
      this.loseBoss();
    }
  }

  private returnToFeeding(): void {
    this.tiguan?.destroy();
    this.tiguan = undefined;
    this.nerd.setTexture(BOSS.nerd.textures.idle);
    this.nerd.setVisible(true);
    this.nerd.setPosition(BOSS.nerd.x, BOSS.nerd.y);
    this.nerd.clearTint();
    this.updateNerdBounds();
    this.feed = BOSS.feed.secondWind; // second-wind difficulty
    this.phase = 'feeding';
    this.audio?.playCourierCrash(0.8);
  }

  private showNerdState(state: 'feed' | 'hit'): void {
    const tex = state === 'feed' ? BOSS.nerd.textures.feed : BOSS.nerd.textures.hit;
    const ms = state === 'feed' ? BOSS.nerd.feedFlashMs : BOSS.nerd.hitFlashMs;
    this.nerd.setTexture(tex);
    this.time.delayedCall(ms, () => {
      if (this.nerd.active && this.phase === 'feeding') {
        this.nerd.setTexture(BOSS.nerd.textures.idle);
      }
    });
  }

  private drawHud(): void {
    const g = this.feedBar;
    g.clear();
    // Feed meter frame + fill
    g.lineStyle(1, COLOURS.text, 0.9);
    g.strokeRect(90, 245, 300, 8);
    const pct = Phaser.Math.Clamp(this.feed / 100, 0, 1);
    g.fillStyle(this.phase === 'escape' ? COLOURS.caution : COLOURS.magenta, 1);
    g.fillRect(91, 246, 298 * pct, 6);

    if (this.phase === 'escape') {
      const secs = Math.max(0, Math.ceil((this.escapeEndsAt - this.time.now) / 1000));
      this.statusText.setText(`STOP THE TIGUAN — ${secs}s   AMMO:${this.ammo}`);
      this.statusText.setColor(COLOUR_HEX.caution);
    } else {
      this.statusText.setText(`FEED METER ${Math.round(this.feed)}%   AMMO:${this.ammo}   SCORE:${this.score.value}`);
      this.statusText.setColor(COLOUR_HEX.text);
    }
  }

  private winBoss(): void {
    if (this.over) return;
    this.over = true;
    this.score.addBossDefeat();
    this.audio?.stopMusic();
    this.scene.start(SCENES.Victory, { score: this.score.value });
  }

  private loseBoss(): void {
    if (this.over) return;
    this.over = true;
    this.audio?.stopMusic();
    this.scene.start(SCENES.GameOver, {
      message: MESSAGES.bossEscape,
      score: this.score.value,
      levelId: 5,
      restartScore: this.entryScore,
      restartScene: SCENES.Boss,
    });
  }

  private playMusic(): void {
    if (!this.audio || this.audio.isMuted) return;
    try {
      this.audio.playMusic('bossLoop');
    } catch (e) {
      console.info('[Boss] music failed:', e);
    }
  }

  private playSfx(key: Parameters<Audio['playSfx']>[0], volume: number): void {
    if (!this.audio || this.audio.isMuted) return;
    try {
      this.audio.playSfx(key, volume);
    } catch (e) {
      console.info('[Boss] sfx failed:', key, e);
    }
  }
}
