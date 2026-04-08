/**
 * POST /api/webhook
 *
 * Receives Stripe webhook events and updates Supabase subscriptions table.
 *
 * Events handled:
 *   checkout.session.completed       — payment succeeded, activate subscription
 *   customer.subscription.updated    — plan change, renewal, etc.
 *   customer.subscription.deleted    — cancellation
 *   invoice.payment_failed           — mark status as past_due
 *
 * Stripe sends a signature header so we can verify the payload is genuine.
 * MUST be registered as a raw-body endpoint — Vercel's bodyParser must be off.
 */

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const config = {
  api: {
    bodyParser: false, // Stripe needs the raw body to verify the signature
  },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-11-20.acacia',
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// ── helpers ───────────────────────────────────────────────────────────────────

/** Read the raw request body as a Buffer (needed for Stripe signature check). */
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Map a Stripe price ID to our internal tier name. */
function priceToTier(priceId) {
  if (priceId === process.env.STRIPE_PRO_PRICE_ID)  return 'pro';
  if (priceId === process.env.STRIPE_TEAM_PRICE_ID) return 'team';
  return 'free';
}

/**
 * Upsert a row into the subscriptions table.
 * We key on user_id (passed via metadata) and also keep stripe_sub_id current.
 */
async function upsertSubscription({ userId, customerId, subId, tier, status }) {
  const { error } = await supabase.from('subscriptions').upsert(
    {
      user_id:            userId,
      stripe_customer_id: customerId,
      stripe_sub_id:      subId,
      tier,
      status,
      updated_at:         new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );

  if (error) {
    console.error('[webhook] Supabase upsert error:', error);
    throw new Error(error.message);
  }
}

// ── Event handlers ────────────────────────────────────────────────────────────

/**
 * checkout.session.completed
 * The user finished payment. The subscription is now active.
 * session.subscription holds the sub ID; retrieve it to get the price.
 */
async function handleCheckoutComplete(session) {
  const userId     = session.metadata?.supabase_user_id
                  || session.subscription_data?.metadata?.supabase_user_id;
  const customerId = session.customer;
  const subId      = session.subscription;

  if (!userId) {
    console.warn('[webhook] checkout.session.completed — no supabase_user_id in metadata');
    return;
  }

  // Fetch the full subscription to get the price ID
  const subscription = await stripe.subscriptions.retrieve(subId);
  const priceId      = subscription.items.data[0]?.price?.id;
  const tier         = priceToTier(priceId);
  const status       = subscription.status; // 'active', 'trialing', etc.

  await upsertSubscription({ userId, customerId, subId, tier, status });
  console.log(`[webhook] checkout complete → user ${userId} tier=${tier} status=${status}`);
}

/**
 * customer.subscription.updated
 * Handles plan upgrades, downgrades, renewals, trial end, etc.
 */
async function handleSubscriptionUpdated(subscription) {
  const userId     = subscription.metadata?.supabase_user_id;
  const customerId = subscription.customer;
  const subId      = subscription.id;
  const priceId    = subscription.items.data[0]?.price?.id;
  const tier       = priceToTier(priceId);
  const status     = subscription.status;

  if (!userId) {
    // Try to look up user by customer ID in Supabase as fallback
    const { data } = await supabase
      .from('subscriptions')
      .select('user_id')
      .eq('stripe_customer_id', customerId)
      .single();

    if (!data?.user_id) {
      console.warn('[webhook] subscription.updated — cannot resolve user for customer', customerId);
      return;
    }

    await upsertSubscription({ userId: data.user_id, customerId, subId, tier, status });
    console.log(`[webhook] subscription updated → user ${data.user_id} tier=${tier} status=${status}`);
    return;
  }

  await upsertSubscription({ userId, customerId, subId, tier, status });
  console.log(`[webhook] subscription updated → user ${userId} tier=${tier} status=${status}`);
}

/**
 * customer.subscription.deleted
 * Subscription fully cancelled — downgrade to free.
 */
async function handleSubscriptionDeleted(subscription) {
  const customerId = subscription.customer;

  const { data } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!data?.user_id) {
    console.warn('[webhook] subscription.deleted — cannot resolve user for customer', customerId);
    return;
  }

  await upsertSubscription({
    userId:     data.user_id,
    customerId,
    subId:      subscription.id,
    tier:       'free',
    status:     'canceled',
  });
  console.log(`[webhook] subscription deleted → user ${data.user_id} downgraded to free`);
}

/**
 * invoice.payment_failed
 * Payment failed — mark status as past_due so the app can warn the user.
 */
async function handlePaymentFailed(invoice) {
  const customerId = invoice.customer;
  const subId      = invoice.subscription;

  const { data } = await supabase
    .from('subscriptions')
    .select('user_id, tier')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!data?.user_id) {
    console.warn('[webhook] invoice.payment_failed — cannot resolve user for customer', customerId);
    return;
  }

  await upsertSubscription({
    userId:     data.user_id,
    customerId,
    subId,
    tier:       data.tier,   // keep existing tier, just mark past_due
    status:     'past_due',
  });
  console.log(`[webhook] payment failed → user ${data.user_id} marked past_due`);
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Read raw body and verify signature
  let rawBody;
  try {
    rawBody = await getRawBody(req);
  } catch (err) {
    return res.status(400).json({ error: 'Could not read request body' });
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    console.error('[webhook] Signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook signature error: ${err.message}` });
  }

  // Dispatch to event handlers
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutComplete(event.data.object);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;

      default:
        // Silently ignore events we don't care about
        console.log(`[webhook] Ignored event type: ${event.type}`);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[webhook] Handler error:', err);
    // Return 200 so Stripe doesn't retry — log the error for investigation
    return res.status(200).json({ received: true, warning: err.message });
  }
}
