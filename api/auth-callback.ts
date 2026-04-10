/**
 * Memphant — /api/auth-callback
 *
 * Serves the OAuth callback page with Supabase credentials injected at
 * request time (so we don't have to bake secrets into a static file or
 * expose them in client-side JS that's checked into git).
 *
 * Vercel routes /auth/callback → this function.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readFileSync } from 'fs';
import { join } from 'path';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const supabaseUrl  = process.env.VITE_SUPABASE_URL  ?? '';
  const supabaseAnon = process.env.VITE_SUPABASE_ANON_KEY ?? '';

  // Inject meta tags into the static HTML so the client-side script
  // can read the credentials without them being hardcoded.
  let html: string;
  try {
    html = readFileSync(join(process.cwd(), 'public/auth/callback.html'), 'utf8');
  } catch {
    res.status(500).send('Could not load callback page.');
    return;
  }

  const metaTags = `
    <meta name="supa-url"  content="${supabaseUrl}">
    <meta name="supa-anon" content="${supabaseAnon}">
  `;

  // Insert meta tags right after <head>
  html = html.replace('<head>', `<head>\n${metaTags}`);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(html);
}
