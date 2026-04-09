import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-01-27.acacia',
});

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(204).set(CORS).end();
  if (req.method !== 'POST') return res.status(405).set(CORS).json({ error: 'Method not allowed' });

  // Verify the caller is authenticated — they must send their Supabase JWT
  const authHeader = req.headers['authorization'] ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) return res.status(401).set(CORS).json({ error: 'Unauthorised' });

  // Validate the JWT and get the user
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).set(CORS).json({ error: 'Invalid or expired token' });
  }

  const userId = user.id;

  try {
    // 1. Cancel Stripe subscription if one exists
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('stripe_sub_id, stripe_customer_id')
      .eq('user_id', userId)
      .single();

    if (sub?.stripe_sub_id) {
      try {
        await stripe.subscriptions.cancel(sub.stripe_sub_id);
      } catch (stripeErr) {
        // Non-fatal — subscription may already be cancelled
        console.warn('[delete-account] stripe cancel failed:', stripeErr);
      }
    }

    // 2. Delete all project data
    await supabase.from('projects').delete().eq('user_id', userId);

    // 3. Delete subscription row
    await supabase.from('subscriptions').delete().eq('user_id', userId);

    // 4. Delete the auth user (requires service role)
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error('[delete-account] auth.admin.deleteUser failed:', deleteError.message);
      return res.status(500).set(CORS).json({ error: 'Could not delete account. Please contact support.' });
    }

    return res.status(200).set(CORS).json({ ok: true });
  } catch (err) {
    console.error('[delete-account] unexpected error:', err);
    return res.status(500).set(CORS).json({ error: 'Unexpected error. Please try again.' });
  }
}
