# Testing

The release checks use two layers: automated Vitest suites for deterministic module orchestration and a manual unpacked-extension smoke test for Chrome-owned UI and permission surfaces.

## Automated checks

Run the focused release suites with Node.js 24 and pnpm 11:

```bash
corepack pnpm test:integration
corepack pnpm test:e2e
corepack pnpm typecheck
```

Before producing a release candidate, run the complete project checks:

```bash
corepack pnpm lint
corepack pnpm format:check
corepack pnpm test
corepack pnpm typecheck
corepack pnpm build
```

`test:integration` exercises the real prompt builder, chat store, OpenAI-compatible adapter, SSE parser, error redaction, cancellation, and session repository through mocked network and in-memory storage ports.

`test:e2e` is an E2E-style orchestration suite in jsdom. It exercises the production background controller, durable pending-capture repository, runtime message router, context store, injected page serializer, page extractor, permission retry flow, prompt construction, and session restore semantics. The command intentionally fails if its test directory is missing or empty.

These suites do not launch Chrome and do not automate the native Side Panel, context menu, extension permission prompts, or `chrome://extensions` UI. Passing them is not evidence that Chrome-owned UI surfaces work in a packaged extension.

## Manual unpacked Chrome smoke

Build and load the extension:

1. Run `corepack pnpm build`.
2. Open `chrome://extensions` in Chrome 116 or newer.
3. Enable Developer mode.
4. Choose **Load unpacked** and select `.output/chrome-mv3`.
5. Click the extension action and verify that the native Side Panel opens.

Use a dedicated test endpoint and non-production API key, then verify the release-critical flows:

1. Configure the endpoint, authentication fields, and model. Deny the endpoint host permission once, confirm the error is actionable, then retry and grant it.
2. Select text on an ordinary HTTPS page, choose **Ask with selected text**, and confirm the Side Panel opens with the exact selection, title, and source URL. Repeat while the panel is closed to cover durable delivery.
3. Open two different tabs, capture different text from each, switch tabs again, and confirm both cards retain their original title and URL without silent replacement.
4. On a test page containing visible article text, hidden nodes, a password input, a textarea, and a select, choose **Add current page**. Confirm visible article text is present and form values or hidden text are absent from the preview.
5. Deny page access when prompted, confirm capture fails without adding a card, then retry, grant access, and confirm capture succeeds.
6. Send a question to a mock or test OpenAI-compatible endpoint that streams multiple chunks. Confirm incremental rendering, completion, and that a second send is blocked while the first request is active.
7. Start another streaming request and cancel it. Confirm the partial assistant message is marked cancelled and the UI returns to an idle state.
8. Reload the Side Panel and confirm completed messages and context cards are restored. If a request was interrupted by reload, confirm it is restored as an error rather than as an active stream.
9. Return HTTP 401, 429, and 500 responses from the test endpoint and confirm the UI distinguishes the failure without displaying the API key.

Chrome internal pages, the Chrome Web Store, extension pages, the built-in PDF viewer, and inaccessible `file://` pages should fail with a clear unsupported-page or permission error. Network behavior, Chrome permission prompt wording, native context-menu delivery, Side Panel lifecycle, focus behavior, and final packaged CSP remain manual boundaries.
