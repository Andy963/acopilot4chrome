# Security

## Endpoint policy

Endpoints must use HTTPS. HTTP is allowed only for `localhost`, `127.0.0.1`, and `[::1]`. Endpoint URLs containing credentials are rejected, and chat paths must be relative without traversal segments.

Endpoint origins are requested as optional host permissions only when the user saves or tests a profile. The extension does not request permanent access to every website.

## Page data

Page capture evaluates visibility in the live page, then removes scripts, styles, form controls, editable regions, hidden content, and other non-readable nodes from a cloned document. It never modifies the live page. Captured page content is marked as untrusted background data in the model prompt and cannot trigger browser actions.

## Rendering and diagnostics

Assistant Markdown is rendered without raw HTML. Dangerous link schemes are rejected, and code blocks remain inert text. Errors are classified and shortened before display; request headers, API keys, full upstream bodies, page text, user questions, and complete assistant responses are not logged.
