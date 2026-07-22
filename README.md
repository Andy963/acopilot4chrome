# Acopilot4chrome

Acopilot4chrome is a Chrome 116+ side-panel extension that sends only user-selected page snapshots to a user-configured OpenAI-compatible endpoint. It has no account system, hosted backend, analytics, or automatic page collection.

## Features

- Capture selected text from the context menu or the side panel.
- Extract readable text from the current page on explicit request.
- Review, preview, remove, and clear captured context before sending, including the exact next-request truncation or omission caused by the total context limit.
- Captured context is attached to the question you send it with: it appears at the top of that message and the staging area clears afterward, so each question owns its own context.
- Set a **Context window** on the Page context row to control how many of your recent messages and their replies are resent as history (default 4 turns; older turns are omitted from the request).
- Configure an OpenAI-compatible base URL, API key, and one or more model names (switch the active model from the composer toolbar). Mark a model as **Vision** to enable image input for it. Requests use `Authorization: Bearer <key>` and the standard `chat/completions` path automatically.
- Export and import your agent settings as a JSON file (the API key is never included).
- Attach images to a question when the active model is vision-capable — paste them into the composer (including "Copy image" from a page) or use the attach button. They are sent as `image_url` parts alongside your text.
- Stream Markdown (including LaTeX math via `$…$` and `$$…$$`) responses, cancel active requests, and restore the active browser-session conversation.
- Failed requests retry automatically up to 3 times; if they still fail, a **Retry** button re-runs the request and a successful retry removes the failed reply.
- Keep API keys session-only by default, with an explicit local persistence option.
- Optionally sync your settings (base URL, models, system instruction — never the API key) across Chrome via your Google account. Off by default; turning it off changes nothing else.

## Install

Download the latest `acopilot4chrome-<version>-chrome.zip` from the [Releases](https://github.com/Andy963/acopilot4chrome/releases) page and unzip it. Then in Chrome:

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select the unzipped folder.
3. Click the extension action to open the side panel, then set your Base URL and API key in Settings.

## Development

Requirements: Node.js 24 and pnpm 11.

```bash
corepack pnpm install
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

The build output is written to `.output/chrome-mv3`; load that folder as an unpacked extension for local development.

See [Testing](docs/testing.md) for automated release suites and the manual Chrome Side Panel smoke checklist.

## Releases

Releases are automated by GitHub Actions: pushing a version tag builds, validates, packages, and publishes the extension. Pre-releases are cut from `dev` (`v0.0.x` or `-suffix` tags); formal releases are cut from `main` (`v0.1.0`, `v0.2.0`, …). See [Releases](docs/release.md) for the full workflow.

## Data flow

Page text is captured only after a user action and remains a local context snapshot until the user sends a question. The side panel then sends the selected context, question, and chat history directly to the configured endpoint. See [Privacy](docs/privacy.md) and [Security](docs/security.md).

## Known limitations

Chrome internal pages, the Chrome Web Store, other extension pages, the built-in PDF viewer, and inaccessible `file://` pages cannot be injected. Page extraction uses the currently rendered DOM and does not include unrendered virtual-list or closed Shadow DOM content.
