# Memphant — Manual Setup Steps

> Everything in this document is something the code **cannot** do for you. 
> Work through it top to bottom after pushing your code to GitHub.
> Each section tells you exactly where to click.

---

## 1. Rename the GitHub repo

The code says "memphant" everywhere. If you have not yet renamed the GitHub repo, do it now.

1. Go to **github.com/krisninnis/memphant** (or the old URL — GitHub redirects automatically)
2. Click **Settings** (top tab, not the profile Settings)
3. Under "General → Repository name", change it to **`memphant`**
4. Click **Rename**
5. GitHub will auto-redirect old URLs — no links will break

Then update your local git remote so `git push` still works:

```
git remote set-url origin https://github.com/krisninnis/memphant.git
```

---

## 2. Set up your domain

Decide on a domain. Options in rough order of preference:

| Domain | Check availability at |
|---|---|
| memphant.com | namecheap.com / porkbun.com |
| memphant.app | same |
| getmemphant.com | same |
| usememphant.com | same |

Porkbun tends to be cheapest (~$8–12/year for .com). Once you've bought one:
- You'll point it at Vercel in step 3 below

---

## 3. Rename your Vercel project + set custom domain

1. Go to **vercel.com/dashboard** → click your current project ("memphant")
2. **Settings → General → Project Name** → change to `memphant` → Save
3. **Settings → Domains** → Add domain → type your new domain (e.g. `memphant.com`)
4. Vercel shows you DNS records to add — go to your domain registrar and add them:
   - Usually one `A` record pointing to `76.76.21.21`
   - And a `CNAME` for `www` pointing to `cname.vercel-dns.com`
5. Wait up to 30 minutes for DNS to propagate — Vercel shows a green tick when it's live

### Required environment variables

While you're in **Vercel → Settings → Environment Variables**, make sure all of these exist:

| Variable | Where to get it |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API Keys |
| `STRIPE_PRO_PRICE_ID` | Stripe Dashboard → Products → your Pro plan |
| `STRIPE_TEAM_PRICE_ID` | Stripe Dashboard → Products → your Team plan |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Webhooks → your endpoint → Signing secret |
| `SUPABASE_URL` | Supabase Dashboard → Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API → service_role key |
| `VITE_SUPABASE_URL` | Same as SUPABASE_URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API → anon/public key |
| `APP_URL` | Your new domain, e.g. `https://memphant.com` (no trailing slash) |

After adding/changing any variable, click **Redeploy** so they take effect.

---

## 4. Enable Google Sign-In in Supabase

1. Go to **supabase.com/dashboard** → your project
2. Left sidebar → **Authentication → Providers**
3. Find **Google** → click to expand → toggle **Enable**
4. You need a Google Cloud Console app:
   - Go to **console.cloud.google.com**
   - Create a new project (or use an existing one)
   - Search for **"OAuth consent screen"** → External → Fill in app name "Memphant", your email, homepage URL
   - Then go to **Credentials → Create Credentials → OAuth Client ID**
   - Application type: **Web application**
   - Authorised redirect URIs — add exactly:
     ```
     https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
     ```
     (Find your project ref in Supabase → Settings → General → Reference ID)
5. Copy the **Client ID** and **Client Secret** from Google Cloud Console
6. Paste them into the Supabase Google provider fields → **Save**

That's it — Google Sign-In will now work for both the web/PWA and desktop app.

---

## 5. Enable Apple Sign-In in Supabase

Apple Sign-In requires an **Apple Developer account** ($99/year). If you don't have one yet, skip this for now — Google login is enough to launch.

If you have an Apple Developer account:

1. Go to **developer.apple.com → Certificates, Identifiers & Profiles**
2. **Identifiers** → Register a new identifier → **Services IDs** → Continue
3. Description: "Memphant", Identifier: `com.kris.memphant.web` → Continue → Register
4. Click on the service ID you just made → enable **Sign In with Apple** → Configure
5. Primary App ID: select your main app ID (`com.kris.memphant`)
6. Website URLs → Domains and Subdomains: your domain (e.g. `memphant.com`)
7. Return URLs:
   ```
   https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
   ```
8. Save → Done → Continue → Register

Then create a key:
- **Keys** → Register a new key → enable **Sign In with Apple** → Configure
- Primary App ID: your app → Save → Continue → Register
- Download the `.p8` file (**you can only download it once — save it safely**)
- Note the **Key ID** shown

Back in **Supabase → Authentication → Providers → Apple**:
- Secret Key: paste the contents of the `.p8` file
- Team ID: your Apple Developer Team ID (top right on developer.apple.com)
- Bundle ID: `com.kris.memphant`
- Key ID: the Key ID from above
- Save

---

## 6. Desktop app OAuth — deep link setup (for the Tauri app)

> **Background:** When a user clicks "Sign in with Google" inside the desktop app, Memphant opens the Google OAuth flow in the **system browser** (Chrome/Safari/Edge). After signing in, Google redirects to `memphant.com/auth/callback`. The callback page shows a success message. The user then switches back to the desktop app and clicks "Refresh" — but because the session is in the system browser's storage (not the app's), it won't connect automatically.
>
> The permanent fix is a **custom URL scheme** (deep link): `memphant://auth/callback`. The system browser would redirect there, Tauri intercepts it, and the session is established directly. This requires some Rust code changes.

### What to add (when you're ready)

1. In `src-tauri/Cargo.toml`, add the deep-link plugin:
   ```toml
   [dependencies]
   tauri-plugin-deep-link = "2"
   ```

2. In `src-tauri/src/lib.rs`, register the plugin:
   ```rust
   .plugin(tauri_plugin_deep_link::init())
   ```

3. In `src-tauri/tauri.conf.json`, register the URL scheme:
   ```json
   "plugins": {
     "deep-link": {
       "desktop": {
         "schemes": ["memphant"]
       }
     }
   }
   ```

4. In `src/components/Settings/SettingsSync.tsx`, change `redirectTo` to:
   ```
   memphant://auth/callback
   ```

5. Add a listener in `App.tsx` or `AppShell.tsx`:
   ```typescript
   import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
   onOpenUrl((urls) => {
     const url = urls[0];
     if (url.startsWith('memphant://auth/callback')) {
       // Extract code from URL and call supabase.auth.exchangeCodeForSession()
     }
   });
   ```

**Until this is set up**, the current flow works like this: user signs in via browser → comes back to the app → clicks "Already signed in via browser? Click to refresh →" → the app calls `supabase.auth.getSession()`. This works on the web/PWA version. On the desktop, users may need to sign in via the PWA on their phone first, then the desktop will sync via cloud.

---

## 7. Load the Chrome extension

The extension lives in `chrome-extension/` in your repo. To install it in Chrome:

1. Open Chrome → go to `chrome://extensions`
2. Top right: enable **Developer mode** (toggle)
3. Click **Load unpacked**
4. Navigate to your local repo → select the `chrome-extension` folder → Open

The Memphant elephant icon will appear in your browser toolbar. Pin it for easy access.

When you update the extension code, come back to `chrome://extensions` and click the **refresh icon** on the Memphant card.

### For the Chrome Web Store (when ready to publish)

1. Go to **chrome.google.com/webstore/devconsole**
2. Pay the one-time $5 developer registration fee
3. Click **New item** → upload a `.zip` of the `chrome-extension/` folder:
   ```
   cd chrome-extension
   zip -r ../memphant-extension.zip .
   ```
4. Fill in the listing: name "Memphant", description, screenshots
5. Set permissions justification (the extension uses `activeTab`, `clipboardWrite`, and host permissions for the 5 AI platforms — explain each)
6. Submit for review (takes 1–3 business days)

---

## 8. Create the Supabase `subscriptions` table

If you haven't already, run this SQL in **Supabase → SQL Editor**:

```sql
create table if not exists public.subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade not null unique,
  stripe_customer_id  text,
  stripe_sub_id       text,
  tier          text not null default 'free',   -- 'free' | 'pro' | 'team'
  status        text not null default 'active', -- 'active' | 'canceled' | 'past_due'
  updated_at    timestamptz not null default now()
);

-- RLS: users can only read their own row
alter table public.subscriptions enable row level security;

create policy "Users read own subscription" on public.subscriptions
  for select using (auth.uid() = user_id);

-- Service role can write (used by the Stripe webhook)
create policy "Service role can write subscriptions" on public.subscriptions
  for all using (true)
  with check (true);
```

---

## 9. Set up Stripe webhook

After you have a live domain, tell Stripe to send events there:

1. **Stripe Dashboard → Developers → Webhooks → Add endpoint**
2. Endpoint URL: `https://your-domain.com/api/webhook`
3. Events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Click **Add endpoint**
5. Copy the **Signing secret** → paste into Vercel env var `STRIPE_WEBHOOK_SECRET` → redeploy

---

## 10. GitHub Actions secrets (for release builds)

To produce signed installer files (`.msi`, `.dmg`, `.AppImage`) via GitHub Actions:

1. Generate a Tauri signing key pair if you haven't already:
   ```
   npm run tauri signer generate -- -w ~/.tauri/memphant.key
   ```
   This creates a `.key` (private) and `.key.pub` (public) file. **Keep the .key file safe — losing it means users can't update from old versions.**

2. Go to **github.com/krisninnis/memphant → Settings → Secrets and variables → Actions**
3. Add these secrets:
   | Secret name | Value |
   |---|---|
   | `TAURI_SIGNING_PRIVATE_KEY` | Contents of `~/.tauri/memphant.key` (the whole base64 string) |
   | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | The password you set when generating the key |

4. In `src-tauri/tauri.conf.json`, add the public key to the updater config:
   ```json
   "plugins": {
     "updater": {
       "pubkey": "PASTE_YOUR_PUBLIC_KEY_CONTENTS_HERE"
     }
   }
   ```

Now every push to `main` that's tagged `v*.*.*` will trigger a full cross-platform build.

To trigger a release:
```
git tag v0.1.1
git push origin v0.1.1
```

---

## 11. Get a proper AI mascot image

The SVG mascot in `public/memphant-mascot.svg` is a hand-crafted vector. For a more polished version, use one of these prompts in Midjourney or DALL-E 3:

**Midjourney prompt:**
```
cute elephant mascot logo, memory-themed, big friendly eyes, glowing brain pattern 
on side, warm amber and deep purple color palette, rounded cartoon style, clean white 
background, suitable for a tech app icon, no text --style raw --ar 1:1
```

**DALL-E 3 prompt:**
```
A cute, friendly cartoon elephant mascot for a tech app called Memphant. The elephant 
has a warm amber color, large expressive eyes with a shine, a gently curled trunk 
(for good luck), and subtle glowing blue circuit/memory patterns on its side. 
Clean illustration style, dark purple/navy background, rounded shapes, 
professional app icon quality.
```

Download the result and save it as `public/memphant-mascot.png` (or replace the SVG). Update `public/index.html` to point to the new file.

---

## 12. macOS notarisation (optional, when publishing to Mac users)

Apple requires apps to be notarised to avoid "unidentified developer" warnings on macOS. This requires an Apple Developer account.

Add these GitHub secrets:

| Secret | Where to get it |
|---|---|
| `APPLE_CERTIFICATE` | Base64-encoded `.p12` export from Keychain Access |
| `APPLE_CERTIFICATE_PASSWORD` | Password you set on the `.p12` |
| `APPLE_SIGNING_IDENTITY` | e.g. `Developer ID Application: Your Name (TEAMID)` |
| `APPLE_ID` | Your Apple Developer email |
| `APPLE_PASSWORD` | App-specific password from appleid.apple.com |
| `APPLE_TEAM_ID` | Your team ID from developer.apple.com |

The GitHub Actions release workflow already has placeholder slots for these.

---

## 13. Final end-to-end test checklist

Run through this before announcing Memphant publicly:

- [ ] Create a new project → fills in correctly → auto-saves
- [ ] Copy for Claude → paste into claude.ai → AI gets context
- [ ] Paste AI response back → diff shows → apply works
- [ ] Sign in with Google (web version at your domain) → session persists on refresh
- [ ] Cloud sync: change something in web → verify it shows in desktop (or vice versa)
- [ ] Free tier: create 4 projects without signing in → 4th prompts to sign in
- [ ] Pro gate: Smart export mode shows as locked for free users
- [ ] Stripe checkout: complete a test payment (use card `4242 4242 4242 4242`) → tier upgrades to Pro
- [ ] Customer portal: manage subscription → cancel → tier downgrades
- [ ] Chrome extension: install, visit claude.ai, send a message → "🐘 Copy for Memphant" button appears
- [ ] Auto-updater: tag a new version → build completes → app shows update prompt
- [ ] GDPR: Privacy settings → "Download all your data" → JSON downloads

---

*That's everything. The code is done — this document is the only gap between the code and a live product.*
