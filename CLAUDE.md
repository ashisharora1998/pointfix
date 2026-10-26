# Pointfix

Chrome extension (Manifest V3) plus a local Node helper. The user picks an element on a page, types a request, and the extension sends it over native messaging to the helper, which runs `claude -p` or `codex exec` in the user's project folder. See `README.md` for the layout and user-facing behavior.

## Git and commits

- **Claude must never be the commit author or co-author.** Do not add `Co-Authored-By: Claude …` (or any other Claude/Anthropic attribution) to commit messages or PR descriptions, and never commit with a Claude name or email.
- Commit as the repo owner. This repo's local git config sets `Ashish Arora <ashisharora1998@users.noreply.github.com>`; don't change it or commit with any other identity (not the global work email).
- Remote is `git@github-personal:ashisharora1998/pointfix.git` (the personal SSH key). The `gh` CLI on this machine is signed in to a work account with no admin rights here, so repo settings (Pages, rulesets, collaborators) are changed by the owner in the GitHub web UI.
- `main` has a `protect-main` ruleset: changes need a pull request approved by the code owner (`.github/CODEOWNERS`), and force pushes and deletion are blocked. The owner can bypass it. Never force-push or rewrite published history.
- Commit or push only when the owner asks.

## Code conventions

- No build step and no dependencies in `extension/`. Plain JS, loaded as-is.
- `picker.js` renders everything inside a closed shadow root. All styles live in the `<style>` block at the top. Every color needs a dark-mode counterpart in the `@media (prefers-color-scheme: dark)` block, and later `background` shorthands there reset `background-image`, so restate it when needed.
- Functions in `background.js` that run with `world: 'MAIN'` (`installErrorCapture`, `readPageErrors`, `readSourceHints`) are serialized by `chrome.scripting.executeScript`. They must be self-contained: no closures over module variables or imports. They talk back to the picker through `window` events (e.g. `pointfix-error`).
- Page content that goes into the prompt is marked as data, not instructions (see `buildPrompt`). Keep it that way.
- Match the surrounding style: small functions, few comments, comments explain why.

## Testing

- No automated test suite. `node --check <file>` for syntax.
- `test-site/` is a small static page with plain HTML and a React section. Serve it with `python3 -m http.server 5180 --directory test-site`.
- To see panel changes without installing the extension, load `markdown.js` and `picker.js` into a page with a stubbed `window.chrome` (`runtime.sendMessage`, `runtime.connect`, `storage.local`) and check light and dark mode.
- A real check means reloading the unpacked extension in `chrome://extensions` and reloading the page, since an old picker stays injected until the page reloads.

## Releases

- Extension version lives in `extension/manifest.json`; the helper has its own version in `helper/package.json` and is published to npm separately, only when `helper/` changes.
- `sh scripts/package-extension.sh` builds `dist/pointfix-<version>.zip` (`dist/` is ignored). The owner uploads it in the Chrome Web Store dashboard.
- The store allows one package in review at a time. Never change the code of a version that is already submitted: bump the version for any new change.
- When behavior that touches user data changes, update both `store/PRIVACY.md` and `docs/privacy.html` (with their "Last updated" dates) and the listing text in `store/LISTING.md`.
- `docs/` is the GitHub Pages site, served from `main` `/docs` at https://ashisharora1998.github.io/pointfix/. The store's privacy link points at `docs/privacy.html`, so never move or rename it.
