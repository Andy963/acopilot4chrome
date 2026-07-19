# Acopilot4chrome

Acopilot4chrome is a Chrome 116+ side-panel extension that sends only user-selected page snapshots to a user-configured OpenAI-compatible endpoint. It has no account system, hosted backend, analytics, or automatic page collection.

## Features

- Capture selected text from the context menu or the side panel.
- Extract readable text from the current page on explicit request.
- Review, preview, remove, and clear context snapshots before sending, including exact next-request truncation or omission caused by the total context limit.
- Configure an OpenAI-compatible base URL, API key, and optional model. Requests use `Authorization: Bearer <key>` and the standard `chat/completions` path automatically.
- Stream Markdown responses, cancel active requests, and restore the active browser-session conversation.
- Keep API keys session-only by default, with an explicit local persistence option.

## Development

Requirements: Node.js 22 and pnpm 11.

```bash
corepack pnpm install
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

Load `.output/chrome-mv3` as an unpacked extension in Chrome. Click the extension action to open the side panel.

See [Testing](docs/testing.md) for automated release suites and the manual Chrome Side Panel smoke checklist.

## Releases

Releases are automated by GitHub Actions: pushing a version tag builds, validates, packages, and publishes the extension. Pre-releases are cut from `dev` (`v0.0.x` or `-suffix` tags); formal releases are cut from `main` (`v0.1.0`, `v0.2.0`, …). See [Releases](docs/release.md) for the full workflow.

## Data flow

Page text is captured only after a user action and remains a local context snapshot until the user sends a question. The side panel then sends the selected context, question, and chat history directly to the configured endpoint. See [Privacy](docs/privacy.md) and [Security](docs/security.md).

## Known limitations

Chrome internal pages, the Chrome Web Store, other extension pages, the built-in PDF viewer, and inaccessible `file://` pages cannot be injected. Page extraction uses the currently rendered DOM and does not include unrendered virtual-list or closed Shadow DOM content.
