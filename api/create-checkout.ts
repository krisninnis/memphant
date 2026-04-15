import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-03-25.dahlia',
});

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { priceId, userId, email } = req.body ?? {};

    if (!priceId || !userId || !email) {
      return res.status(400).json({ error: 'priceId, userId and email are required' });
    }

    const allowedPrices = [
      process.env.STRIPE_PRO_PRICE_ID,
      process.env.STRIPE_TEAM_PRICE_ID,
    ];

    if (!allowedPrices.includes(priceId)) {
      return res.status(400).json({ error: 'Invalid price ID' });
    }

    const baseUrl = process.env.APP_URL || 'https://memephant.com';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cancel`,
      metadata: {
        supabase_user_id: userId,
      },
      subscription_data: {
        metadata: {
          supabase_user_id: userId,
        },
      },
      billing_address_collection: 'auto',
      allow_promotion_codes: true,
    });

    return res.status(200).json({ url: session.url });
  } catch (err: any) {
    console.error('[create-checkout] Error:', err);
    return res.status(500).json({
      error: err?.message || 'Internal server error',
    });
  }
}