import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * GET /api/health
 * Lightweight liveness probe used by the app on startup.
 * Returns 200 with JSON when the serverless layer is reachable.
 */
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ ok: true, ts: new Date().toISOString() });
}
