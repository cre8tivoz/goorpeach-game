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
/** Reject absurdly large POSTs before parsing (score payload is tiny). */
const MAX_BODY_BYTES = 2048;

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
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      Allow: 'GET, POST, OPTIONS',
    },
  });

/** Reject cross-site POSTs — /api/scores is same-origin with the static site. */
function isSameOriginPost(request: Request): boolean {
  const secFetchSite = request.headers.get('sec-fetch-site')?.trim().toLowerCase();
  if (secFetchSite === 'cross-site') return false;

  const origin = request.headers.get('origin');
  if (origin === null) return true;

  try {
    return origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

/**
 * Stream the request body with a hard UTF-8 byte cap so chunked requests
 * without an honest Content-Length cannot exhaust Worker memory.
 */
async function readBodyWithLimit(
  request: Request,
  maxBytes: number,
): Promise<{ ok: true; text: string } | { ok: false; status: 400 | 413 }> {
  if (!request.body) return { ok: true, text: '' };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return { ok: false, status: 413 };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(combined) };
  } catch {
    return { ok: false, status: 400 };
  }
}

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

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, {
    status: 204,
    headers: {
      Allow: 'GET, POST, OPTIONS',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  if (!env.DB) return json({ error: 'scoreboard unavailable' }, 503);
  try {
    const top = await topScores(env.DB);
    return json({ top });
  } catch {
    return json({ error: 'scoreboard unavailable' }, 503);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!isSameOriginPost(request)) {
    return json({ error: 'cross-origin submission forbidden' }, 403);
  }

  const mediaType = (request.headers.get('content-type') ?? '').split(';', 1)[0]?.trim().toLowerCase() ?? '';
  if (mediaType !== 'application/json') {
    return json({ error: 'content-type must be application/json' }, 415);
  }

  const contentLength = request.headers.get('content-length');
  if (contentLength !== null) {
    const len = Number(contentLength);
    if (!Number.isFinite(len) || len < 0 || len > MAX_BODY_BYTES) {
      return json({ error: 'payload too large' }, 413);
    }
  }

  const bodyRead = await readBodyWithLimit(request, MAX_BODY_BYTES);
  if (!bodyRead.ok) {
    return json(
      { error: bodyRead.status === 413 ? 'payload too large' : 'invalid UTF-8 payload' },
      bodyRead.status,
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(bodyRead.text) as unknown;
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return json({ error: 'body must be a JSON object' }, 400);
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

  if (!env.DB) return json({ error: 'scoreboard unavailable' }, 503);

  try {
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
  } catch {
    return json({ error: 'scoreboard unavailable' }, 503);
  }
};
