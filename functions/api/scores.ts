/// <reference types="@cloudflare/workers-types" />
/**
 * /api/scores — global high-score board, backed by Cloudflare D1.
 *
 *   GET  /api/scores        → { top: ScoreEntry[] }   (Top-N, score DESC)
 *   POST /api/scores        → { rank, top }           submit { initials, score, levelReached }
 *
 * This is a casual arcade board with no accounts. There is no cryptographic
 * anti-cheat: a determined user can POST a fake score. We validate shape and
 * apply a sanity cap, which is appropriate for a parody game. If abuse becomes a
 * problem, add a rate-limit binding (KV) here — the rest of the app is unaffected.
 *
 * Constants below are duplicated from src/config.ts LEADERBOARD — keep in sync.
 */

interface Env {
  DB: D1Database;
}

const TOP_N = 20;
const INITIALS_RE = /^[A-Z]{3}$/;
const MAX_SCORE = 1_000_000;
const MIN_LEVEL = 1;
const MAX_LEVEL = 5;

interface ScoreRow {
  initials: string;
  score: number;
  level_reached: number;
  created_at: number;
}

interface ScoreEntry {
  initials: string;
  score: number;
  levelReached: number;
  createdAt: number;
}

const toEntry = (r: ScoreRow): ScoreEntry => ({
  initials: r.initials,
  score: r.score,
  levelReached: r.level_reached,
  createdAt: r.created_at,
});

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

async function topScores(db: D1Database): Promise<ScoreEntry[]> {
  const { results } = await db
    .prepare(
      'SELECT initials, score, level_reached, created_at FROM scores ' +
        'ORDER BY score DESC, created_at ASC LIMIT ?1',
    )
    .bind(TOP_N)
    .all<ScoreRow>();
  return (results ?? []).map(toEntry);
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const top = await topScores(env.DB);
  return json({ top });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }

  const body = payload as Partial<Record<'initials' | 'score' | 'levelReached', unknown>>;
  const initials = typeof body.initials === 'string' ? body.initials.toUpperCase() : '';
  const score = body.score;
  const levelReached = body.levelReached;

  if (!INITIALS_RE.test(initials)) {
    return json({ error: 'initials must be 3 letters A–Z' }, 400);
  }
  if (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > MAX_SCORE) {
    return json({ error: 'score out of range' }, 400);
  }
  if (
    typeof levelReached !== 'number' ||
    !Number.isInteger(levelReached) ||
    levelReached < MIN_LEVEL ||
    levelReached > MAX_LEVEL
  ) {
    return json({ error: 'levelReached out of range' }, 400);
  }

  const createdAt = Date.now();
  await env.DB.prepare(
    'INSERT INTO scores (initials, score, level_reached, created_at) VALUES (?1, ?2, ?3, ?4)',
  )
    .bind(initials, score, levelReached, createdAt)
    .run();

  // Rank = how many strictly-higher scores exist, plus one.
  const higher = await env.DB.prepare('SELECT COUNT(*) AS n FROM scores WHERE score > ?1')
    .bind(score)
    .first<{ n: number }>();
  const rank = (higher?.n ?? 0) + 1;

  const top = await topScores(env.DB);
  return json({ rank, top }, 201);
};
