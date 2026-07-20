# Privacy

Acopilot4chrome does not operate a hosted backend and does not require an account.

The extension collects page text only when the user explicitly chooses a selection capture or page capture action. Captured text is stored as a browser-session snapshot so the user can inspect or remove it. It is sent only when the user submits a question, and only to the endpoint configured in the active profile.

The extension does not collect browsing history, cookies, form values, passwords, page scripts, analytics, crash reports, or telemetry. API keys are excluded from chat messages, context snapshots, exported data, and diagnostic messages.

API keys are stored in `chrome.storage.session` by default. If the user explicitly enables local persistence, the key is stored in `chrome.storage.local`. Browser local storage is not an operating-system keychain.

Settings sync is opt-in and off by default. When enabled, the extension mirrors configuration (base URL, model names, request/context limits, and system instruction) to `chrome.storage.sync`, which Chrome syncs across devices signed in to the same Google account. API keys are never synced; they stay in `chrome.storage.session`/`chrome.storage.local` on each device. Turning sync off keeps all configuration local to the device.
