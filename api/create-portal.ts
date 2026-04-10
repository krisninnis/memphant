/**
 * POST /api/create-portal
 *
 * Creates a Stripe Customer Portal session so users can manage their subscription
 * (update payment method, cancel, view invoices) without us building any of that UI.
 *
 * Body: { userId: string }
 * Returns: { url: string }  — open in system browser
 */

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia',
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
    const { userId } = req.body ?? {};

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // Look up the Stripe customer ID from Supabase
    const { data, error } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .single();

    if (error || !data?.stripe_customer_id) {
      // This usually means the Stripe webhook hasn't written the subscription row yet,
      // or the user downgraded/cancelled before a row existed.
      return res.status(404).json({
        error:   'No billing record found for this account.',
        details: 'If you recently upgraded, wait a moment and try again. If this keeps happening, contact support at hello@memephant.com',
      });
    }

    const returnUrl = process.env.APP_URL
      ? `${process.env.APP_URL}/success`
      : 'https://memphant.com/success';

    const portalSession = await stripe.billingPortal.sessions.create({
      customer:   data.stripe_customer_id,
      return_url: returnUrl,
    });

    return res.status(200).json({ url: portalSession.url });
  } catch (err: any) {
    console.error('[create-portal] Error:', err);
    return res.status(500).json({ error: err?.message || 'Internal server error' });
  }
}
