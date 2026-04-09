import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(204).set(CORS).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).set(CORS).json({ error: 'Method not allowed' });
  }

  const { email } = req.body ?? {};

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).set(CORS).json({ error: 'Valid email required' });
  }

  const normalised = email.trim().toLowerCase();

  // Upsert into a simple `subscribers` table.
  // Run once in Supabase SQL:
  //   create table if not exists subscribers (
  //     id uuid primary key default gen_random_uuid(),
  //     email text unique not null,
  //     created_at timestamptz default now()
  //   );
  const { error } = await supabase
    .from('subscribers')
    .upsert({ email: normalised }, { onConflict: 'email', ignoreDuplicates: true });

  if (error) {
    console.error('[subscribe] supabase error:', error.message);
    return res.status(500).set(CORS).json({ error: 'Could not save email.' });
  }

  return res.status(200).set(CORS).json({ ok: true });
}
