# Changelog

All notable changes to Memephant are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions follow [Semantic Versioning](https://semver.org/).

---

## [0.3.0] - 2026-04-29

### Added
- Added Agent Handoff so users can move between AI tools with continuity from the previous session.
- Added Continue, Debug, and Review modes to shape what the next AI returns.
- Added optional Codex and Claude Code export targets for code review, verification, and implementation work.
- Added file-change context from linked project folders so handoffs can mention what changed since the last session.
- Strengthened export safety tests to ensure linked folder paths stay out of copied context.

## [0.2.23] - 2026-04-26

### Fixed
- Repaired text encoding across the app and landing page so UI copy renders cleanly.
- Clarified folder watcher documentation and status copy.
- Stabilised CI and authentication tests for release builds.
- Added export checks that protect against leaking local folder paths.
- Clarified BUSL license wording for public release.

## [0.2.20] - 2026-04-25

### Changed
- Added the project launchpad flow for creating useful starter projects more quickly.
- Added a dedicated download page with OS-aware installer guidance.
- Enforced single-instance desktop behaviour so repeated launches focus the existing app.
- Updated public pages, pricing copy, and support links for the beta launch.
- Adopted BUSL 1.1 license wording throughout the app and public site.

## [0.2.15] - 2026-04-24

### Added
- Added folder watcher groundwork for tracking recent project activity.
- Added recent activity summaries that can be included in Claude and ChatGPT exports.
- Added plain-English labels for recent project changes inside the editor.
- Improved platform colour theming across export controls.
- Reduced internal wording in the UI so project memory features are easier to understand.

## [0.2.10] - 2026-04-23

### Added
- Added a three-step first-run onboarding modal.
- Added feedback and bug report actions in Settings.
- Added an automatic project memory update interval setting.
- Improved save failure handling with clearer user-facing messages.
- Improved the AI response instructions so project updates are easier to capture.

## [0.2.5] - 2026-04-23

### Fixed
- Fixed desktop folder selection so users choose folders instead of files.
- Added a close button to the project creation wizard.
- Improved the web experience when folder import is unavailable.
- Updated release checks and test expectations for the current export format.
- Improved mobile and PWA install fallback behaviour.

## [0.2.3] - 2026-04-11

### Changed
- Added the `memphant_update` schema 1.1.0 response format.
- Tightened AI response instructions so project updates are more consistent.
- Unified update expectations across supported export platforms.
- Improved continuity fields for current state, session summary, next steps, and decisions.
- Stabilised settings sync and dependency resolution.

## [0.2.2] - 2026-04-11

### Fixed
- Fixed release flow issues for desktop updater builds.
- Improved SEO metadata and public branding.
- Polished authentication onboarding and cloud backup screens.
- Improved sidebar account display.
- Updated process relaunch support for installed desktop builds.

## [0.2.1] - 2026-04-11

### Changed
- Improved account isolation so signed-in users see the right projects.
- Reworked the welcome screen flow and project ordering.
- Improved Git sync safeguards when desktop APIs are unavailable.
- Restored truncated UI and service files after release preparation.
- Improved cloud sync error handling and Tauri runtime detection.

## [0.2.0] - 2026-04-11

### Added
- Added paste preview and structured diff detection for AI responses.
- Added safer fallback handling in the diff engine.
- Added optional local AI settings and Ollama fallback support.
- Added human-readable update summaries to diff previews.
- Persisted platform state and project identity more reliably.

## [0.1.4] - 2026-04-10

### Changed
- Renamed the app to Memephant across the product.
- Added a GitHub repository field to project memory.
- Added OAuth login support.
- Rebranded the browser extension.
- Improved version sync for desktop builds.

## [0.1.3] - 2026-04-09

### Added
- Prepared desktop update testing for early users.
- Enabled Tauri updater artifacts for release builds.
- Improved release workflow compatibility.
- Fixed deployment configuration for the public site.

## [0.1.2] - 2026-04-08

### Added
- Added PWA support and install prompts for mobile and web users.
- Improved cloud backup and authentication flows.
- Added OAuth callback handling.
- Added early local AI and platform state groundwork.
- Improved mobile web logout reliability.

## [0.1.1] - 2026-04-08

### Changed
- Added early authentication and account UI improvements.
- Improved initial branding and sidebar presentation.
- Added GitHub Actions release and CI setup.
- Polished the first public app shell after launch.
- Fixed early sidebar delete button styling.

## [0.1.0] - 2026-04-08

### First public release

#### Core app
- Structured project memory editor for summaries, goals, rules, decisions, next steps, open questions, and important files.
- Five platform-specific export formatters for Claude, ChatGPT, Grok, Perplexity, and Gemini.
- Paste-detect-diff-apply loop for reviewing AI updates before saving them.
- Export quality indicator showing how complete a handoff is before copying.
- Smart export mode for condensing larger projects.

#### Projects
- Project templates for common starting points.
- Folder scanning for local project context.
- Sidebar search across project names and memory fields.
- Delete confirmation dialog.
- Markdown export.

#### Settings
- General settings for app behaviour.
- Privacy and security controls for export scanning.
- Project defaults for export mode and saving.
- Platform enablement settings.
- Cloud Backup and About sections.

#### Cloud and billing
- Optional cloud backup via Supabase.
- Sign in, sign up, and password reset.
- Early access cloud backup during beta.
- Stripe billing groundwork for future paid plans.
- Optional cloud sync with local-first project storage.

#### Infrastructure
- Desktop auto-updater groundwork.
- Chrome browser extension.
- Mobile companion PWA.
- GitHub Actions CI.
- GitHub Actions release workflow.

#### Security
- Secrets scanner for API keys, tokens, and credentials.
- Hardcoded sensitive-file exclusions for folder scanning.
- No telemetry or analytics.
- No direct connection to AI platforms.
