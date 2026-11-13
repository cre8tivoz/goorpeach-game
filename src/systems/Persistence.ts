import { LEADERBOARD, SETTINGS, SETTINGS_UI, STORAGE_KEYS } from '../config';
import type { GameSettings, ScoreEntry } from '../types';

const INITIALS_RE = /^[A-Z]{3}$/;

/** Drop anything that does not look like a real leaderboard row. */
function sanitiseScoreEntry(value: unknown): ScoreEntry | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<ScoreEntry>;
  const initials = typeof row.initials === 'string' ? row.initials.toUpperCase() : '';
  if (!INITIALS_RE.test(initials)) return null;
  if (typeof row.score !== 'number' || !Number.isInteger(row.score) || row.score < 0 || row.score > LEADERBOARD.maxScore) {
    return null;
  }
  if (
    typeof row.levelReached !== 'number' ||
    !Number.isInteger(row.levelReached) ||
    row.levelReached < LEADERBOARD.minLevel ||
    row.levelReached > LEADERBOARD.maxLevel
  ) {
    return null;
  }
  if (typeof row.createdAt !== 'number' || !Number.isFinite(row.createdAt)) return null;
  return {
    initials,
    score: row.score,
    levelReached: row.levelReached,
    createdAt: row.createdAt,
  };
}

function osPrefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Persistence — the ONLY place raw localStorage is touched (CLAUDE.md rule 4).
 * Wraps high score, settings, unlocked levels, and volume so the store can be
 * swapped later. Scenes/systems call this, never localStorage directly.
 *
 * Mostly stubbed; the local-scores cache is implemented now because the
 * scoreboard needs an offline fallback (see systems/Scoreboard.ts).
 */
export class Persistence {
  /** Safe read of a JSON value; returns the fallback on any error. */
  private static read<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  }

  /** Safe write of a JSON value; silently no-ops if storage is unavailable. */
  private static write(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or blocked (e.g. private mode) — non-fatal for a game.
    }
  }

  /** Local mirror of the global board, shown when the API is unreachable. */
  static getLocalScores(): ScoreEntry[] {
    return Persistence.sanitiseScores(Persistence.read<unknown>(STORAGE_KEYS.localScores, []));
  }

  static saveLocalScores(scores: ScoreEntry[]): void {
    Persistence.write(STORAGE_KEYS.localScores, Persistence.sanitiseScores(scores));
  }

  /** Keep only well-formed rows (storage or API data may be stale or tampered). */
  static sanitiseScores(value: unknown): ScoreEntry[] {
    if (!Array.isArray(value)) return [];
    return value
      .map(sanitiseScoreEntry)
      .filter((entry): entry is ScoreEntry => entry !== null)
      .slice(0, LEADERBOARD.topN);
  }

  /** Highest level the player has unlocked (1-based). Defaults to level 1. */
  static getHighestUnlocked(): number {
    const stored = Persistence.read<unknown>(STORAGE_KEYS.highestUnlockedLevel, 1);
    // Ignore edited/corrupt values so storage can't unlock levels that don't exist.
    if (typeof stored !== 'number' || !Number.isInteger(stored)) return 1;
    return Math.min(Math.max(stored, LEADERBOARD.minLevel), LEADERBOARD.maxLevel);
  }

  /** Record a newly reached level if it beats the stored high-water mark. */
  static unlockLevel(level: number): void {
    if (level > Persistence.getHighestUnlocked()) {
      Persistence.write(STORAGE_KEYS.highestUnlockedLevel, level);
    }
  }

  static getSettings(): GameSettings {
    const fallback: GameSettings = {
      soundVolume: SETTINGS.soundVolume,
      musicVolume: SETTINGS.musicVolume,
      crtScanlines: SETTINGS.crtScanlines,
      reducedMotion: osPrefersReducedMotion(),
      touchSteerSensitivity: SETTINGS.touchSteerSensitivity,
      touchInputMode: SETTINGS.touchInputMode,
    };
    const raw = Persistence.read<unknown>(STORAGE_KEYS.settings, {});
    const stored = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    // Field-by-field so a corrupt or edited value falls back instead of crashing a scene.
    const num = (v: unknown, min: number, max: number, d: number): number =>
      typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(v, min), max) : d;
    return {
      soundVolume: num(stored.soundVolume, SETTINGS_UI.volumeMin, SETTINGS_UI.volumeMax, fallback.soundVolume),
      musicVolume: num(stored.musicVolume, SETTINGS_UI.volumeMin, SETTINGS_UI.volumeMax, fallback.musicVolume),
      crtScanlines: typeof stored.crtScanlines === 'boolean' ? stored.crtScanlines : fallback.crtScanlines,
      reducedMotion: typeof stored.reducedMotion === 'boolean' ? stored.reducedMotion : fallback.reducedMotion,
      touchSteerSensitivity: num(
        stored.touchSteerSensitivity,
        SETTINGS_UI.sensitivityMin,
        SETTINGS_UI.sensitivityMax,
        fallback.touchSteerSensitivity,
      ),
      touchInputMode:
        stored.touchInputMode === 'joystick' || stored.touchInputMode === 'swipe'
          ? stored.touchInputMode
          : fallback.touchInputMode,
    };
  }

  static setSettings(patch: Partial<GameSettings>): GameSettings {
    const next = { ...Persistence.getSettings(), ...patch };
    Persistence.write(STORAGE_KEYS.settings, next);
    return next;
  }
}
