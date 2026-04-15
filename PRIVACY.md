# Privacy Policy - Memephant

**Last updated: April 2026**

## The short version

Memephant is local-first. By default, your project data stays on your device. Cloud Backup is optional and only used if you sign in. Local AI is optional and runs on your device through Ollama.

## What data does Memephant store?

Memephant stores the project data you put into the app, including project names, summaries, goals, decisions, notes, linked-folder metadata, and other structured project memory.

By default, this data is stored locally on your device in your operating system's application data directory.

## Does Memephant send data over the internet?

Not by default.

Memephant can send data over the internet only in these optional cases:

- If you sign in and enable Cloud Backup, your projects are sent to Supabase so they can sync across your devices.
- If you subscribe to a paid plan, billing flows are handled through Stripe-hosted checkout and billing pages.
- If you choose to use the web app instead of the desktop app, your browser will connect to the Memephant website and related backend endpoints.

Memephant does not send your project data to ChatGPT, Claude, Gemini, Grok, Perplexity, or any other AI service directly. You choose what to copy and paste into those services yourself.

## Cloud Backup

Cloud Backup is optional.

If you sign in, Memephant can back up your projects to Supabase so they are available across devices. Cloud data is transmitted over HTTPS. Your local project files remain available even if you never use Cloud Backup.

## Local AI / Private Mode

Local AI is optional.

If you enable Private Mode, Memephant can call a locally running Ollama model on your device to improve project update extraction. This runs against your local Ollama endpoint and is intended to keep processing on your machine.

## Linked folders

If you link a project folder, Memephant scans local files and metadata to help build project context. That scan is designed to stay local unless you later choose to copy exported context into another tool or enable Cloud Backup.

## Billing and accounts

If you create an account, Memephant stores account and authentication data through Supabase Auth. If you subscribe to a paid plan, Stripe stores billing and subscription data needed to manage payments.

## Analytics and tracking

This repository does not show product analytics or ad-tracking code in the core app. Cloud requests that support sign-in, sync, auth callbacks, subscriptions, and account management are still part of the product when those features are used.

## Your control

- You can use Memephant locally without signing in.
- You can export your data from the app.
- You can delete your local data from the app.
- You can delete your cloud account from the app if you have signed in.

## Contact

If you have privacy questions, contact hello@memephant.com or open an issue in the repository.
