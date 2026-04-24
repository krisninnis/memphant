/**
 * POST /api/create-portal
 *
 * Creates a Stripe Customer Portal session so users can manage their subscription
 * (update payment method, cancel, view invoices) without us building any of that UI.
 *
 * Requires: Authorization: Bearer <Supabase access token>
 * Returns: { url: string } — open in system browser
 */

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-03-25.dahlia',
});

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function handler(req: any, res: any) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const authHeader = req.headers['authorization'] ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return res.status(401).json({ error: 'Unauthorised' });
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const userId = user.id;

    const { data, error } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .single();

    if (error || !data?.stripe_customer_id) {
      return res.status(404).json({ error: 'No active subscription found for this user.' });
    }

    const baseUrl = process.env.APP_URL || 'https://memephant.com';

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: `${baseUrl}/success`,
    });

    return res.status(200).json({ url: portalSession.url });
  } catch (err: any) {
    console.error('[create-portal] Error:', err);
    return res.status(500).json({ error: err?.message || 'Internal server error' });
  }
}