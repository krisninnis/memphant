# Memphant — SaaS Launch Checklist

> **App verdict:** Core is ~95% done. You're not far from launch.
> The gap isn't features — it's the plumbing around the product (payments, landing page, distribution).

---

## 🔴 MUST DO BEFORE TAKING A SINGLE PAYMENT

### Legal & Business
- [ ] Register a business entity (Ltd / LLC) — protects you personally
- [ ] Write a Privacy Policy (use Iubenda or similar, ~£20/yr)
- [ ] Write Terms of Service (cover: no warranty, data handling, refunds, acceptable use)
- [ ] GDPR-compliant data handling (you're already local-first — this is your advantage)
- [ ] Open a business bank account

### Payments
- [ ] Set up Stripe (connects to Supabase via webhooks easily)
- [ ] Create 2 products in Stripe:
  - **Free** — local only, 3 projects max
  - **Pro £8/month** — unlimited projects + cloud sync + priority updates
- [ ] Add `subscription_tier` column to Supabase `users` table
- [ ] Wire Stripe webhook → Supabase → check tier before allowing cloud sync
- [ ] Add upgrade prompt in app when free user hits the 3-project limit

### Code Signing (required to avoid "untrusted app" warnings)
- [ ] **macOS**: Buy Apple Developer account (£79/yr), get notarization cert, add to release.yml secrets
- [ ] **Windows**: Buy a code signing cert (DigiCert/Sectigo, ~£100/yr) OR use Microsoft Trusted Signing (cheaper)
- [ ] Without signing: macOS shows scary "can't be opened" warning — most users won't install

---

## 🟠 NEEDED TO CONVERT VISITORS INTO USERS

### Landing Page (no app = no sales)
- [ ] Buy domain — projectbrain.app or getprojectbrain.com (check availability)
- [ ] Build a one-page site with:
  - **Hero**: "Switch between ChatGPT, Claude and Gemini without re-explaining your project every time"
  - **2-minute demo GIF** showing the copy → AI → paste → switch workflow
  - **3 feature blocks**: One project, every AI / Paste & it learns / Your data stays local
  - **Pricing table**: Free vs Pro
  - **Download buttons**: Windows / Mac / Linux
  - **Social proof**: "X projects created", testimonials once you have them
- [ ] Add email capture for people who visit but don't download yet
- [ ] Basic SEO: target "switch between ChatGPT and Claude", "AI context management", "stop re-explaining to AI"

### Auto-Updater (critical for trust)
- [ ] Wire up Tauri v2's built-in updater (tauri-plugin-updater)
- [ ] Host update manifests on GitHub releases (already building there)
- [ ] Without this: users stay on v0.1.0 forever — you can't ship improvements to existing users

### Chrome Extension — publish it
- [ ] Submit to Chrome Web Store ($5 one-time fee)
- [ ] Add deep link from extension → desktop app (custom URL scheme: `projectbrain://`)
- [ ] The extension is your best discovery channel — it sits in their browser on AI sites

---

## 🟡 NEEDED TO KEEP USERS (RETENTION)

### Onboarding polish
- [ ] Tour is built — test it with 5 real non-technical people and watch where they get stuck
- [ ] Add a "what to do first" prompt if projects list is empty after tour
- [ ] Email sequence: welcome → "did you try copying to Claude?" → "try switching to ChatGPT" (3 emails over 7 days)

### Error monitoring
- [ ] Add Sentry (free tier, 5k errors/month) — you're currently flying blind on crashes
- [ ] Add to both frontend (React) and Rust backend

### Analytics (privacy-first)
- [ ] Add Plausible or Fathom to the landing page (~£9/month)
- [ ] Add simple in-app events (projects created, exports, paste zone used) — local counter only, no user tracking, matches your privacy brand

### Support channel
- [ ] Set up a Discord server — your early users WILL find bugs, you want to hear from them fast
- [ ] Add a "Report a bug" button in Settings → About that opens a GitHub issue prefilled

---

## 🟢 FEATURES THAT WILL DRIVE PAID UPGRADES

These are validated pain points from forums that current tools don't address. Build these as Pro features.

### Context Distillation (biggest differentiator)
- [ ] "Smart Export" mode: before copying to AI, run a condensation pass that removes stale info, keeps only recent decisions and current state — fits in a smaller context window, works better
- [ ] Research shows context over 50% of the window degrades AI quality — this directly solves that

### Project Templates
- [ ] Pre-filled projects for: "SaaS product", "Freelance client", "Writing project", "Job search", "Research paper"
- [ ] Removes the blank slate problem for new users — they see value in 30 seconds
- [ ] Forum requests for this are consistent

### Export to File
- [ ] "Save as Markdown" — lets users paste into Obsidian, Notion, their own notes
- [ ] "Save as PDF" — for sharing project context with teammates who don't use AI
- [ ] Small feature, big perceived value

### Team Sharing (the £££ unlock)
- [ ] Share a project with a teammate (they get a read-only or editable copy via cloud sync)
- [ ] This enables a Team tier at £20/month/seat
- [ ] Currently the biggest gap vs competitors — nobody does this for the multi-AI use case

### Search
- [ ] Full-text search across all projects
- [ ] Users with 10+ projects can't find anything — becomes a pain fast

### Conversation → Project (reverse flow)
- [ ] "Save this AI response as a project update" — users paste any AI response and get offered to create a new project from it
- [ ] Validated pain point: people want to capture insights FROM their AI conversations, not just push TO them

---

## 🔵 DISTRIBUTION & GROWTH

### Week 1 launch channels
- [ ] **Reddit** — post in r/ChatGPT (4.5M members), r/ClaudeAI (500k), r/singularity, r/productivity
  - Angle: "I got tired of re-explaining my project to every AI, so I built this"
  - Show the GIF, link to landing page
- [ ] **Product Hunt** — schedule a launch, prep assets, ask friends to upvote
- [ ] **Hacker News** — "Show HN: Memphant — carry context across AI platforms"
- [ ] **Twitter/X** — demo video, tag @AnthropicAI @OpenAI accounts

### Ongoing SEO (high-intent search traffic)
These are the exact queries people search when they hit this pain:
- [ ] "how to switch from ChatGPT to Claude without losing context"
- [ ] "stop re-explaining project to AI"
- [ ] "AI context management tool"
- [ ] "use multiple AI tools on same project"
- [ ] "save AI conversation context"

Write one blog post per term — they'll rank within 3 months.

### The Chrome Extension is your growth engine
- [ ] It sits in their browser. Every time they use ChatGPT or Claude, they see it.
- [ ] Add a rating prompt after 3 successful exports: "Enjoying Memphant? ⭐ Review on Chrome Store"
- [ ] Chrome Web Store search traffic is free and highly targeted

---

## 📊 SUGGESTED PRICING

| Plan | Price | What's included |
|------|-------|-----------------|
| **Free** | £0 | 3 projects, local storage only, all 5 platforms, Chrome extension |
| **Pro** | £8/month | Unlimited projects, cloud sync, multi-device, file export, priority support |
| **Team** | £18/month/seat | Everything in Pro + project sharing, team templates (build this at 50+ users) |

**Why this pricing:**
- Free is generous enough to be genuinely useful — creates word of mouth
- £8 is below the "do I think about it" threshold for anyone who uses AI daily
- Annual option at £70 (2 months free) improves your cash flow

---

## 🗓️ REALISTIC TIMELINE

| Week | Focus |
|------|-------|
| **1–2** | Code signing + auto-updater + Stripe wiring |
| **3** | Landing page live, domain bought |
| **4** | Chrome extension published |
| **5** | Test with 10 real users, fix what breaks |
| **6** | Reddit + HN + Product Hunt launch |
| **8+** | Templates, distillation, file export based on user feedback |

---

## 📋 APP GAPS TO FIX BEFORE LAUNCH

From the code scan — these need attention before you charge people:

- [ ] **Tour**: Test the spotlight steps work after the recent fix (editor + export placement)
- [ ] **Password reset flow**: Currently missing — Supabase has this built in but there's no UI for it
- [ ] **Email confirmation handling**: After sign-up the user gets a confirmation email but the app doesn't tell them what to do next — add a "Check your email" screen
- [ ] **3-project limit enforcement**: Needs to be built before you can have a meaningful free tier
- [ ] **Error monitoring**: Crashes are silent right now — add Sentry before going public
- [ ] **"Open in app" URL scheme**: So the Chrome extension can open Memphant directly
- [ ] **Tests**: At least cover diffEngine and exportFormatters — these are the core loop

---

## THE HONEST ANSWER

You are **4–6 weeks of focused work** away from a live product that can charge money.

The app itself is genuinely good — the core workflow is solid, privacy-first is the right angle, and the pain point is real and validated. What's missing is the scaffolding around it: a page people can land on, a way to pay, signed installers that macOS doesn't block, and a way to tell people it exists.

The Chrome extension is your secret weapon. Publish it first — it puts you in front of the exact people who feel this pain, every day, for free.
