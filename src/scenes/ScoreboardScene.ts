import Phaser from 'phaser';
import { SCENES, COLOURS, COLOUR_HEX, LEADERBOARD } from '../config';
import { Scoreboard } from '../systems/Scoreboard';
import { getLayout } from '../systems/Layout';
import { CrtOverlay } from '../ui/CrtOverlay';
import type { ScoreEntry } from '../types';

/** Data passed in when arriving from a finished run. */
export interface ScoreboardData {
  score?: number; // run score to submit (omit for view-only)
  levelReached?: number; // 1..5
}

type Phase = 'loading' | 'entry' | 'board';

/**
 * ScoreboardScene — global Top-20 board with classic 3-letter arcade initials
 * entry. Reads/writes go through systems/Scoreboard.ts only (CLAUDE.md). When a
 * qualifying run score is passed in, the player enters initials and it is
 * submitted; otherwise the board is shown read-only.
 */
export class ScoreboardScene extends Phaser.Scene {
  private readonly board = new Scoreboard();
  private pendingScore?: number;
  private levelReached = 1;

  private phase: Phase = 'loading';
  private letters: number[] = [0, 0, 0]; // 0 = 'A'
  private cursor = 0;
  private slotTexts: Phaser.GameObjects.Text[] = [];
  private layer?: Phaser.GameObjects.Container;
  private statusText!: Phaser.GameObjects.Text;

  constructor() {
    super(SCENES.Scoreboard);
  }

  init(data: ScoreboardData): void {
    this.pendingScore = data.score;
    this.levelReached = Phaser.Math.Clamp(data.levelReached ?? 1, LEADERBOARD.minLevel, LEADERBOARD.maxLevel);
    this.phase = 'loading';
    this.letters = [0, 0, 0];
    this.cursor = 0;
    this.slotTexts = [];
  }

  create(): void {
    const { width, height, centerX, centerY } = getLayout();
    new CrtOverlay(this);
    this.add.rectangle(centerX, centerY, width, height, COLOURS.textDark).setOrigin(0.5);
    this.add
      .text(centerX, height * 0.08, 'GLOBAL TOP 20', { fontFamily: 'Bungee', fontSize: '18px', color: COLOUR_HEX.cyan })
      .setOrigin(0.5);
    this.statusText = this.add
      .text(centerX, height * 0.93, 'loading board…', { fontFamily: 'JetBrains Mono', fontSize: '8px', color: COLOUR_HEX.text })
      .setOrigin(0.5);

    this.input.keyboard?.on('keydown', this.onKey, this);

    void this.loadBoard();
  }

  private async loadBoard(): Promise<void> {
    const top = await this.board.getTop();
    if (this.pendingScore !== undefined && Scoreboard.qualifies(this.pendingScore, top)) {
      this.showEntry();
    } else {
      this.showBoard(top, null);
    }
  }

  /* ----------------------------------------------------------------------- */
  /* Initials entry                                                          */
  /* ----------------------------------------------------------------------- */

  private showEntry(): void {
    this.phase = 'entry';
    this.layer?.destroy();
    const { width, height, centerX, centerY } = getLayout();
    const layer = this.add.container(0, 0);
    this.layer = layer;

    const slotGap = width < 320 ? 34 : 40;
    const blockTop = centerY - height * 0.12;
    const startX = centerX - ((LEADERBOARD.initialsLength - 1) * slotGap) / 2;

    layer.add(
      this.add
        .text(centerX, blockTop - 42, `YOU MADE THE BOARD — ${this.pendingScore}`, {
          fontFamily: 'JetBrains Mono',
          fontSize: width < 320 ? '8px' : '9px',
          color: COLOUR_HEX.bile,
          align: 'center',
          wordWrap: { width: width - 24 },
        })
        .setOrigin(0.5),
    );

    this.slotTexts = [];
    for (let i = 0; i < LEADERBOARD.initialsLength; i++) {
      const x = startX + i * slotGap;
      const up = this.add
        .text(x, blockTop, '▲', { fontFamily: 'JetBrains Mono', fontSize: '12px', color: COLOUR_HEX.cyan })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      up.on('pointerup', () => this.changeLetter(i, +1));

      const slot = this.add
        .text(x, blockTop + 26, 'A', { fontFamily: 'Bungee', fontSize: width < 320 ? '22px' : '26px', color: COLOUR_HEX.text })
        .setOrigin(0.5);

      const down = this.add
        .text(x, blockTop + 52, '▼', { fontFamily: 'JetBrains Mono', fontSize: '12px', color: COLOUR_HEX.cyan })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      down.on('pointerup', () => this.changeLetter(i, -1));

      this.slotTexts.push(slot);
      layer.add([up, slot, down]);
    }

    const confirm = this.add
      .text(centerX, blockTop + 88, 'CONFIRM', { fontFamily: 'Bungee', fontSize: '13px', color: COLOUR_HEX.caution })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    confirm.on('pointerup', () => void this.submit());
    layer.add(confirm);

    this.statusText.setText('▲▼ tap letters • ←→ move • CONFIRM when done');
    this.renderSlots();
  }

  private changeLetter(index: number, delta: number): void {
    this.cursor = index;
    this.letters[index] = ((this.letters[index] ?? 0) + delta + 26) % 26;
    this.renderSlots();
  }

  private renderSlots(): void {
    this.slotTexts.forEach((t, i) => {
      t.setText(String.fromCharCode(65 + (this.letters[i] ?? 0)));
      t.setColor(i === this.cursor ? COLOUR_HEX.caution : COLOUR_HEX.text);
    });
  }

  private onKey(ev: KeyboardEvent): void {
    if (this.phase === 'board') {
      if (ev.key === 'Escape' || ev.key === 'm' || ev.key === 'M' || ev.key === 'b' || ev.key === 'B') {
        this.scene.start(SCENES.Menu);
      }
      return;
    }
    if (this.phase !== 'entry') return;
    switch (ev.key) {
      case 'ArrowUp':
        this.changeLetter(this.cursor, +1);
        break;
      case 'ArrowDown':
        this.changeLetter(this.cursor, -1);
        break;
      case 'ArrowLeft':
        this.cursor = (this.cursor + LEADERBOARD.initialsLength - 1) % LEADERBOARD.initialsLength;
        this.renderSlots();
        break;
      case 'ArrowRight':
        this.cursor = (this.cursor + 1) % LEADERBOARD.initialsLength;
        this.renderSlots();
        break;
      case 'Enter':
      case ' ':
        void this.submit();
        break;
    }
  }

  private async submit(): Promise<void> {
    if (this.phase !== 'entry' || this.pendingScore === undefined) return;
    this.phase = 'board'; // lock input during submit
    const initials = this.letters.map((n) => String.fromCharCode(65 + n)).join('');
    this.statusText.setText('submitting…');
    const result = await this.board.submit({
      initials,
      score: this.pendingScore,
      levelReached: this.levelReached,
    });
    this.showBoard(result.top, { initials, score: this.pendingScore });
    this.statusText.setText(`your rank: #${result.rank}`);
  }

  /* ----------------------------------------------------------------------- */
  /* Board view                                                              */
  /* ----------------------------------------------------------------------- */

  private showBoard(entries: ScoreEntry[], highlight: { initials: string; score: number } | null): void {
    this.phase = 'board';
    this.layer?.destroy();
    const { width, height, centerX } = getLayout();
    const layer = this.add.container(0, 0);
    this.layer = layer;

    if (entries.length === 0) {
      layer.add(
        this.add
          .text(centerX, height * 0.45, 'No scores yet. Be the first.', {
            fontFamily: 'JetBrains Mono',
            fontSize: '9px',
            color: COLOUR_HEX.text,
          })
          .setOrigin(0.5),
      );
    }

    const portrait = width < 320;
    const startY = height * 0.16;
    const step = portrait ? 14 : 16;

    entries.slice(0, LEADERBOARD.topN).forEach((e, i) => {
      let x: number;
      let y: number;
      if (portrait) {
        x = centerX;
        y = startY + i * step;
      } else {
        const col = i < 10 ? 0 : 1;
        const row = i % 10;
        x = col === 0 ? width * 0.14 : width * 0.54;
        y = startY + row * step;
      }
      const isMine = highlight !== null && e.initials === highlight.initials && e.score === highlight.score;
      const line = `${String(i + 1).padStart(2, ' ')}. ${e.initials}  ${String(e.score).padStart(6, ' ')}`;
      layer.add(
        this.add
          .text(x, y, line, {
            fontFamily: 'JetBrains Mono',
            fontSize: portrait ? '8px' : '9px',
            color: isMine ? COLOUR_HEX.caution : COLOUR_HEX.text,
          })
          .setOrigin(portrait ? 0.5 : 0, 0.5),
      );
    });

    const btnW = Math.min(184, width - 24);
    const menuY = height * 0.86;
    const bg = this.add.graphics();
    const drawPlaque = (fill: number, borderColor: number = COLOURS.cyan, borderWidth = 0): void => {
      bg.clear();
      bg.fillStyle(fill, 0.95);
      bg.fillRect(centerX - btnW / 2, menuY - 10, btnW, 22);
      if (borderWidth > 0) {
        bg.lineStyle(borderWidth, borderColor, 0.9);
        bg.strokeRect(centerX - btnW / 2 + 0.5, menuY - 10 + 0.5, btnW - 1, 21);
      }
    };
    drawPlaque(COLOURS.road);
    layer.add(bg);

    const menu = this.add
      .text(centerX, menuY, '[M] MENU', { fontFamily: 'Bungee', fontSize: '13px', color: COLOUR_HEX.text })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    menu.on('pointerover', () => {
      menu.setColor(COLOUR_HEX.cyan);
      menu.setScale(1.05);
      drawPlaque(COLOURS.road, COLOURS.cyan, 1);
    });
    menu.on('pointerout', () => {
      menu.setColor(COLOUR_HEX.text);
      menu.setScale(1.0);
      drawPlaque(COLOURS.road);
    });
    menu.on('pointerdown', () => {
      menu.setColor(COLOUR_HEX.hazard);
      menu.setScale(0.98);
      drawPlaque(COLOURS.hazard, COLOURS.hazard, 1);
    });
    menu.on('pointerup', () => {
      menu.setColor(COLOUR_HEX.cyan);
      menu.setScale(1.05);
      drawPlaque(COLOURS.road, COLOURS.cyan, 1);
      this.scene.start(SCENES.Menu);
    });
    layer.add(menu);

    if (this.pendingScore === undefined) this.statusText.setText('');
  }
}