# Memephant — Manual Test Plan
**Version:** 0.1.0  
**Purpose:** Verify every moving part before sharing with users or doing a Product Hunt launch.  
**How to use this:** Work through each section top-to-bottom. Mark each test ✅ pass, ❌ fail, or ⚠️ partial. If something fails, note what happened.

---

## 🎯 THE CORE FLOW — "AI → Memephant → New AI" (Test This First)

This is the whole point of the app. If this doesn't work smoothly, nothing else matters.

### TEST 1 — Full AI platform handoff from scratch

**What you're testing:** The complete journey a new user would take — create a project, export to AI, do some work, paste back, switch platform.

**Steps:**

1. Open the app fresh (no existing projects)
2. Click **"Set up my first project"** on the welcome screen
3. In the wizard: name it **"Test Project Alpha"**, add summary **"A test project to verify the app works"**, add next step **"Verify the export flow"**
4. Click **"Let's go 🚀"**
5. You should land in the editor with the project open
6. Select **Claude** platform pill
7. Click **"Copy for Claude"** — button should flash green **"✓ Copied — paste into Claude!"**
8. Open Claude (claude.ai) and paste
9. **Verify:** Claude receives a structured project context block, not raw text
10. Ask Claude: *"Based on this project context, what should I do next? Then include your memphant_update block."*
11. Copy Claude's full response
12. Go back to Memephant → paste zone → paste the response → click **"Check for updates"**
13. **Verify:** A diff preview appears showing what Claude suggested
14. Click **"Apply changes"**
15. **Verify:** Project fields updated, toast says "Project updated"
16. Now switch to **ChatGPT** platform pill
17. Click **"Copy for ChatGPT"**
18. Open ChatGPT, paste — **Verify:** ChatGPT understands the project without any re-explaining

**Expected result:** Entire loop works. No re-explaining needed. AI continues cleanly.  
**Pass criteria:** ✅ Context survived the transfer. The second AI knew what the first AI had done.

---

### TEST 2 — Export quality across all 5 platforms

**What you're testing:** That each platform gets correctly formatted output.

**Steps:**

1. With a project open (use Test Project Alpha or any project with content in all fields)
2. Select **Claude** → Copy → paste into a text editor → check format is XML tags (`<project_context>`, `<summary>`, etc.)
3. Select **ChatGPT** → Copy → paste into text editor → check format is markdown with `#` headers
4. Select **Grok** → Copy → paste into text editor → check format is compact key:value pairs (`PROJECT:`, `STATUS:`, `STACK:`)
5. Select **Perplexity** → Copy → paste → check format is conversational prose
6. Select **Gemini** → Copy → paste → check format is markdown with `**bold**` headers
7. **For any platform with a detected stack:** verify `Tech Stack:` line appears in the export

**Expected result:** Each platform gets a meaningfully different format suited to how that AI works.

---

### TEST 3 — The paste-back update loop with a real AI

**This is the most important mechanism in the whole app.**

**Setup:** Use Claude or ChatGPT. Have a project with at least: summary, 2 goals, 2 next steps.

**Steps:**

1. Export to Claude
2. Ask Claude: *"I need to work on [something specific]. What decisions should we make? What's the next step? Please end your response with a memphant_update block."*
3. Copy Claude's entire response (including the update block at the bottom)
4. Go to Memephant → paste zone area
5. Paste the response
6. Click **"Check for updates"**
7. **Verify:** Diff preview appears — shows new items Claude added
8. Review the diff — does it look accurate?
9. Click **"Apply changes"**
10. **Verify:** Fields updated. Toast confirms.
11. Click **"↩️ Undo last AI update"** → **Verify:** Project reverts to pre-merge state
12. Click the undo button again to redo (re-apply)

**Expected result:** The update loop works bidirectionally.

---

## 📁 PROJECT MANAGEMENT

### TEST 4 — Create project from template

1. Click **"+"** or **"From template"** in the sidebar
2. Select a template (e.g., "Business Plan")
3. Name it "Template Test"
4. Click create
5. **Verify:** Project opens with pre-filled fields (goals, rules, etc. already populated)
6. Check each pre-filled field looks sensible

---

### TEST 5 — Create project from folder

1. Click **"Open a project folder"** (or equivalent in sidebar)
2. Select a folder on your computer that has some files (any folder)
3. **Verify:** Project is created, Important Files & Assets list populated with files from that folder
4. **Verify:** No `.env` files, no `node_modules` folder contents, no binary files listed
5. Click **"🔄 Rescan linked folder"** in the action bar
6. **Verify:** Toast confirms rescan, file list updates if anything changed

---

### TEST 6 — Project search

1. Create 3+ projects with different names and descriptions
2. In the sidebar search bar, type part of one project's name
3. **Verify:** Only matching projects show
4. Clear the search → all projects return
5. Search for a word that's in a project's summary or goals (not the name)
6. **Verify:** That project appears in results

---

### TEST 7 — Delete project (with confirmation)

1. Right-click or hover a project card to find the delete option
2. Click delete
3. **Verify:** Confirmation dialog appears asking to confirm removal
4. Cancel → project still exists
5. Delete again → confirm → **Verify:** Project removed from sidebar
6. **Verify:** App doesn't crash. If it was the only project, welcome screen appears.

---

### TEST 8 — Free tier 3-project limit

1. (If testing free tier) Create projects until you hit 3
2. Try to create a 4th
3. **Verify:** App blocks creation and shows upgrade nudge or prompts to sign in
4. The nudge should be clear — not a cryptic error

---

## 🔍 GITHUB REPO SCAN (New Feature)

### TEST 9 — Scan a public GitHub repo (happy path)

**Use a real public repo.** Suggested test repos:
- `https://github.com/facebook/react` (React — well-known, good README)
- `https://github.com/krisninnis/memphant` (your own repo!)
- Any public repo you know well

**Steps:**

1. Open a project
2. Paste a valid GitHub URL into the **GitHub Repository** field
3. **Verify:** "🔍 Scan repo" button appears immediately after URL is entered
4. Click **"🔍 Scan repo"**
5. **Verify:** Button changes to spinner + "Scanning…" while working
6. **Verify:** After a few seconds, a preview panel appears below the field — NOT a blocking modal
7. **Verify preview panel contains:**
   - Detected stack chips (colour-coded, e.g., React chip is blue)
   - "What will be added" section with specific items
   - Any inferred decisions are labelled **"assumptions"**
   - Safety note: "No code, secrets, or .env files were read"
8. Click **"✓ Add to my project"**
9. **Verify:** Toast: "Repo scan merged into your project ✓"
10. **Verify:** "✓ scanned" badge appears next to "GitHub Repository" label
11. **Verify:** Detected Stack chips now visible below GitHub field with a ↻ Rescan button
12. Export to Claude → **Verify:** `tech_stack` appears in the export with the detected technologies

---

### TEST 10 — GitHub scan: additive-only (doesn't overwrite)

1. Open a project that already has a **summary** written
2. Note down the current summary text
3. Paste a GitHub URL and scan it
4. Accept the merge
5. **Verify:** Your original summary is unchanged (scan only fills empty fields)
6. Check next steps — newly suggested ones should be **appended**, not replacing

---

### TEST 11 — GitHub scan: error handling

**Test invalid URL:**
1. Type `https://notgithub.com/something/repo` into the GitHub field
2. **Verify:** "Scan repo" button does NOT appear (URL isn't a GitHub URL)

**Test non-existent repo:**
1. Paste `https://github.com/thisuserdoesnotexist99999/fakerepo`
2. Click Scan
3. **Verify:** Error message appears: "Repository not found or not accessible"
4. **Verify:** "Try again" link is visible

**Test private repo:**
1. If you have a private repo URL, paste it and scan
2. **Verify:** Error message says the repo is private

---

### TEST 12 — Re-scan to update stack

1. After a successful scan, find the **↻ Rescan** button next to the Detected Stack chips
2. Click it
3. **Verify:** Scan runs again, preview appears again with updated results
4. Dismiss (skip) — **Verify:** Stack chips remain unchanged

---

## ✏️ PROJECT EDITOR

### TEST 13 — Edit all fields

Go through every field in the editor and verify editing works:

1. **Project Name** → type a new name → sidebar updates immediately
2. **Summary** → type text → verify auto-save fires (check that closing and reopening app retains the text)
3. **What this project is about (Current State)** → type → save
4. **Goals** → add 2 goals → remove 1 → verify correct one removed
5. **Rules** → add a rule with a comma in it → verify it saves correctly
6. **Key Decisions** → add a decision with rationale → verify both parts save
7. **Next Steps** → add, reorder if possible, remove
8. **Open Questions** → add and remove
9. **Important Files & Assets** → add a file path → verify it saves
10. **How the AI should help** → add custom instructions → export → verify they appear in the export

---

### TEST 14 — Auto-fill suggestions

1. Open a project with **no summary**
2. Click **"Auto-fill"** on the Summary field
3. **Verify:** Something gets generated based on the other fields
4. **Verify:** Toast says "Auto-filled — edit it to make it your own"
5. Now click **"Regenerate"** (the button label changes when field has content)
6. **Verify:** Summary updates to a new suggestion

---

### TEST 15 — Secrets sanitization in export

1. Add a fake secret to a field: `My API key is sk-abcdefghijklmnopqrstuvwxyz1234567890`
2. Export to any platform
3. Paste the exported text into a text editor
4. **Verify:** The key is replaced with `[REDACTED]`
5. Try with `AKIAIOSFODNN7EXAMPLE` (fake AWS key format)
6. **Verify:** Also redacted
7. Go to Settings → Privacy → change scanner to **Strict**
8. Add `password = mysecretpassword123` to a field
9. Export → **Verify:** password also redacted in Strict mode

---

## 📋 PASTE ZONE & DIFF ENGINE

### TEST 16 — Paste zone: valid update detection

1. In a project, export to Claude
2. Ask Claude: *"Please update my project. Here are some thoughts: [say something]. Now generate a memphant_update block."*
3. Copy Claude's full response
4. In Memephant, click the paste zone area
5. Paste the text
6. Click **"Check for updates"**
7. **Verify:** Diff preview appears with clear +/- indicators
8. **Verify:** Changes look accurate to what Claude said
9. Click **"Apply changes"**
10. **Verify:** Project updated, toast fires

---

### TEST 17 — Paste zone: no update block detected

1. Go to paste zone
2. Paste some random text that has no `memphant_update` block (e.g., paste a Wikipedia article)
3. Click **"Check for updates"**
4. **Verify:** App shows "no update detected" message — NOT a crash
5. **Verify:** A helpful hint appears suggesting how to get the AI to provide an update block

---

### TEST 18 — Undo after AI merge

1. Apply a real AI update (from TEST 16)
2. Immediately click **"↩️ Undo last AI update"** in the action bar
3. **Verify:** Project reverts to pre-merge state
4. **Verify:** Button disappears (nothing to undo now)

---

## ☁️ CLOUD BACKUP & SYNC

### TEST 19 — Email sign-up flow

1. Go to Settings → Cloud Backup
2. Click **"Create Account"** tab
3. Enter a real email and a password (8+ chars)
4. Click **"Create account"**
5. **Verify:** App shows "Check your inbox" screen — NOT a confusing redirect
6. Check email → click the confirmation link
7. Link should open to **memephant.com** (NOT localhost:3000) — **critical check**
8. Return to the app → click **"I've confirmed my email"** or sign in
9. **Verify:** You're signed in, email shows in the account card

---

### TEST 20 — Resend confirmation email

1. During the "Check your inbox" state (after signup)
2. Click **"Resend confirmation email"**
3. **Verify:** Toast confirms resend
4. Check email — second confirmation email arrives
5. **Verify:** Both links work (or at least the second one)

---

### TEST 21 — Google OAuth flow

1. Go to Settings → Cloud Backup
2. Click **"Sign in with Google"**
3. **Verify:** Browser opens to Google's OAuth page (system browser, not in-app)
4. **Verify:** App shows "OAuth Pending" screen with 3-step instructions
5. Complete Google sign-in in browser
6. Click **"I've signed in — connect my account →"** in the app
7. **Verify:** Account connects successfully

---

### TEST 22 — Cloud sync: projects saved and retrieved

1. Sign in to cloud backup (use TEST 19 result)
2. Create a new project with some content
3. **Verify:** Sync status shows "Syncing…" then "Synced ✅"
4. Note the project name
5. Sign out of the account
6. Sign back in with the same credentials
7. **Verify:** The project from step 2 appears — data survived sign-out/in

---

### TEST 23 — Offline sync queue

1. Sign in to cloud
2. Disconnect your internet (turn off WiFi)
3. Edit a project field
4. **Verify:** A "pending changes" badge or indicator appears (changes queued)
5. Reconnect internet
6. **Verify:** Sync fires automatically, pending indicator clears

---

### TEST 24 — Sign out

1. Go to Settings → Cloud Backup
2. Click **"Sign out"**
3. **Verify:** UI returns to sign-in form
4. **Verify:** Local projects still visible (sign-out doesn't delete local data)

---

## 💳 STRIPE BILLING

### TEST 25 — Upgrade to Pro (test mode)

> Use Stripe test card: **4242 4242 4242 4242**, any future date, any CVC

1. Sign in to cloud backup
2. Go to Settings → Cloud Backup
3. Click **"Upgrade to Pro — $8/mo"**
4. **Verify:** System browser opens to Stripe checkout (not in-app)
5. Complete checkout with test card
6. **Verify:** Success page appears at memephant.com/success (not a blank page)
7. Return to app → click **"Refresh plan"**
8. **Verify:** Plan shows "Pro 🚀" instead of "Free"
9. **Verify:** Smart export mode is now available in Settings → Projects

---

### TEST 26 — Manage subscription portal

1. (With Pro subscription active)
2. Go to Settings → Cloud Backup
3. Click **"Manage subscription"**
4. **Verify:** Stripe customer portal opens in browser
5. **Verify:** You can see the subscription details

---

## ⚙️ SETTINGS

### TEST 27 — Export mode: Smart (Pro only)

1. Without Pro: Go to Settings → Projects → change handoff mode to **Smart**
2. **Verify:** A "Pro only" lock or warning appears — not available on free tier
3. With Pro: Change to Smart
4. Export a project with lots of content (many goals, decisions, etc.)
5. **Verify:** Export is noticeably shorter / condensed vs Full mode

---

### TEST 28 — Export mode: Delta (changes only)

1. Go to Settings → Projects → set handoff mode to **Changes only (delta)**
2. Apply an AI update to a project
3. Export immediately after
4. **Verify:** Export only shows recently changed fields, not the full project

---

### TEST 29 — Download all my data (GDPR)

1. Go to Settings → Privacy
2. Click **"Download all my data"**
3. **Verify:** A JSON file downloads
4. Open the JSON file — **Verify:** All projects are in there with their fields
5. **Verify:** No passwords, API keys, or auth tokens in the file

---

### TEST 30 — Clear all data

1. Create a project (or use existing)
2. Go to Settings → Privacy
3. Click **"Clear all data"**
4. **Verify:** Confirmation dialog appears
5. Confirm
6. **Verify:** All projects deleted, welcome screen appears
7. **Verify:** App doesn't crash

---

### TEST 31 — Default platform setting

1. Go to Settings → General
2. Change **Default AI Platform** to Grok
3. Close and reopen the app (or navigate away and back)
4. **Verify:** Grok is pre-selected in the platform pills

---

### TEST 32 — Secrets scanner level

1. Settings → Privacy → set scanner to **Standard**
2. Add `sk-testkey12345678901234` to a field
3. Export → verify `[REDACTED]`
4. Add `password=hello123` to a field
5. Export → verify this is NOT redacted in Standard mode
6. Switch to **Strict**
7. Export → verify `password=hello123` IS now redacted

---

## 🎓 ONBOARDING & WELCOME

### TEST 33 — Intro modal (first launch experience)

1. Clear all app data to simulate fresh install (Settings → Privacy → Clear all data)
2. **Verify:** Intro modal appears on first open
3. **Verify:** The 3-step visual is clear: Fill in → Copy → Paste back
4. Click **"Show me how it works"** → **Verify:** Tour starts
5. Click **"Start my first project"** → **Verify:** Goes to welcome screen

---

### TEST 34 — Tour walkthrough

1. Settings → General → click **"Restart Tour"**
2. **Verify:** Tour highlights UI areas in order
3. Click through each step
4. **Verify:** Tour ends cleanly without getting stuck
5. **Verify:** After tour, the app is in a normal usable state

---

### TEST 35 — Welcome screen wizard (3-step creation)

1. (Start from welcome screen — clear all data if needed)
2. Click **"Set up my first project"**
3. Step 1: Enter project name → click Next
4. Step 2: Enter summary → click Next (also test: click Skip)
5. Step 3: Enter a next step → click **"Let's go 🚀"**
6. **Verify:** Project created and you land in the editor with all three fields populated
7. **Verify:** Project appears in sidebar

---

### TEST 36 — Template creation flow

1. From welcome or sidebar, click **"From template"** / **"Start from a template"**
2. Select any template
3. Enter a project name
4. Click create
5. **Verify:** Project opens with template content pre-filled
6. **Verify:** You can edit any pre-filled field

---

## 📱 MOBILE EXPERIENCE

### TEST 37 — Mobile navigation

1. Open the web version (memephant.com) on a phone or resize browser to mobile width
2. **Verify:** Bottom nav bar appears with Projects / Settings / Workspace tabs
3. Tap Projects → **Verify:** Project list appears
4. Tap a project → navigate to Workspace
5. **Verify:** Export button and paste zone are usable with thumbs (not tiny)
6. **Verify:** Settings accessible via bottom nav

---

## 🏠 LANDING PAGE

### TEST 38 — Landing page SEO & feedback section

1. Open `https://memephant.com` in a browser
2. **Verify:** Page title is "Memephant — Remember your projects so your AIs don't have to"
3. **Verify:** Soft-launch banner appears at top
4. Click the **×** to dismiss banner — **Verify:** it disappears and stays gone on refresh
5. Scroll to **feedback section** — **Verify:** 4 feedback cards are visible
6. **Verify:** Navigation includes "Feedback" link
7. Open Chrome DevTools → inspect the `<title>` and `<meta name="description">` tags
8. **Verify:** og:image, og:title, og:description are all set correctly
9. Paste the URL into Twitter's card validator (cards-dev.twitter.com) — **Verify:** card renders

---

## 🔬 EDGE CASES & STRESS TESTS

### TEST 39 — Project with completely empty fields

1. Create a project with ONLY a name (skip all other fields)
2. Export to any platform
3. **Verify:** Export generates without crashing (shows "(no summary yet)" or equivalent placeholders)
4. Try to scan a GitHub repo on this project — **Verify:** Scan fills more fields, nothing breaks

---

### TEST 40 — Very long content in fields

1. In a project, paste 2,000+ words into the Summary field
2. Export to all 5 platforms — **Verify:** None crash
3. Paste that export back into the paste zone — **Verify:** Handles cleanly

---

### TEST 41 — Multiple projects open in sequence

1. Create 5 projects, each with different content
2. Click through them rapidly in the sidebar
3. **Verify:** Each project shows its own data (no bleed-over between projects)
4. Edit project #2, then click project #3, then back to #2 — **Verify:** edit is still there (auto-saved)

---

### TEST 42 — App state after browser/app restart

1. Create a project with full content
2. Close the app completely (or close browser tab)
3. Reopen
4. **Verify:** Project is still there with all fields intact
5. **Verify:** Active project is still selected
6. **Verify:** Target platform setting was remembered

---

### TEST 43 — Concurrent AI handoff (simulate real usage)

This test simulates a real user's day:

1. Create a project: "Website Redesign"
2. Export to ChatGPT → have a conversation → paste back updates
3. Switch to Claude → export → have a different conversation → paste back
4. Switch to Grok → export
5. **Verify:** After all three sessions, the project memory reflects work from ALL three AIs
6. **Verify:** Each platform's "last copied X ago" timestamp is correct

---

## ✅ FINAL SIGN-OFF CHECKLIST

Before any public release, confirm all of these:

- [ ] Core handoff loop works end-to-end (TEST 1)
- [ ] All 5 platforms receive correctly formatted exports (TEST 2)
- [ ] Paste-back and diff detection works reliably (TEST 16)
- [ ] GitHub scan works on a real public repo (TEST 9)
- [ ] No secrets appear in any export output (TEST 15)
- [ ] Email confirmation link goes to memephant.com NOT localhost (TEST 19)
- [ ] Stripe checkout works in test mode (TEST 25)
- [ ] App survives restart with data intact (TEST 42)
- [ ] Landing page meta tags correct for SEO (TEST 38)
- [ ] Tour and onboarding complete without getting stuck (TEST 34)

---

*Generated from full codebase scan — covers all user-facing mechanisms as of v0.1.0*
