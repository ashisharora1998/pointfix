# Pointfix

A Chrome extension. Click the toolbar icon, pick any element on the page, type what you want changed, and send it to **your own** Claude Code or Codex (ChatGPT) running on your machine. The agent gets the element's selector, HTML, styles, a screenshot and (on dev builds) the component and source file, then edits your project.

```
Chrome extension ──(native messaging)──► local helper ──► claude -p / codex exec   (in your project folder)
```

- `extension/`: the Chrome extension (Manifest V3). `picker.js` is the in-page picker and chat panel, `markdown.js` renders replies, `background.js` handles screenshots, page errors and the relay to the helper, and `setup.html` is the first-run setup page (also under the extension's **Options**).
- `helper/`: the npm package `pointfix`. `host.js` is the native messaging host, `bin/cli.js` installs and registers it with Chrome, Chromium, Brave and Edge.
- `store/`: privacy policy and Chrome Web Store listing text.
- `docs/`: the GitHub Pages site (home page and privacy policy), served from `main` at https://ashisharora1998.github.io/pointfix/.
- `scripts/`: icon generator and store zip packager.

## Try it locally

1. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose `extension/`. Copy the extension ID it shows.
2. Install the helper from this repo:
   ```bash
   node helper/bin/cli.js install --extension-id <ID from step 1>
   ```
3. Open your app (e.g. `http://localhost:3000`), click the extension icon, click an element, enter the project folder, type a request and press **Send**.

Check the setup with:

```bash
node helper/bin/cli.js doctor
```

### Using the picker
- **Project folder:** on `localhost` pages the helper finds the program serving that port and fills in its folder (the git repository root if there is one). It also reads `--directory`-style flags of static servers. Otherwise click **Browse…** for the system folder picker, or type the path. The folder is remembered per site. Detection needs `lsof` (macOS and Linux).
- **Start:** click the toolbar icon or press **Alt+Shift+E** (change it at `chrome://extensions/shortcuts`).
- **Select:** click an element. While picking, **↑** / **↓** moves to the parent or child and **Enter** selects. The ↑ / ↓ buttons in the panel do the same after selecting.
- **Several elements:** Shift+click up to 5 elements, then click or press Enter to finish.
- **Panel:** drag it by its title bar. Click **–** or double-click the title bar to collapse it. **⚙** opens the setup page.
- **Page errors:** uncaught errors, `console.error` calls and failed requests (HTTP 400+) appear in a red "N page errors" box in the panel, which expands to list each one with its stack, and are sent as extra context unless you untick "Send to agent". The list updates live while the panel is open. Errors are recorded from the moment the picker opens; failed requests are listed from page load.
- **Phone layout:** open the DevTools device toolbar (⌘⇧M / Ctrl+Shift+M) before picking. Below 768px wide, the agent is told to scope layout changes to small screens.

- **Quick actions:** buttons above the message box fill in common requests (Fix alignment, Make responsive, Match site style, Where's the code?).
- **Copy prompt:** copies the element details and your request as text, to paste into another AI tool. Screenshots aren't included.
- **Done badge:** the toolbar icon shows ✓ or ! when a request finishes, so you can work in other tabs. It clears on the next click or request.
- **Past chats:** ☰ lists the last 20 chats on the site. Reopening one continues the agent's conversation. Saved chats keep their text, diffs and Undo, but not screenshots.

### Changes and Undo
In **Make the change** mode the helper records the project before the run and lists the changed files with a diff afterwards. **Undo** writes back the previous versions. It refuses when any of those files changed again since, so it never overwrites your later work. After the page reloads, the panel shows **before and after** screenshots of the selected elements, so you can see whether the change really took effect.
- In a git repository this uses a throwaway index, so your staged changes, branches and history are never touched. It honors `.gitignore`.
- In other folders the helper keeps a private snapshot repository in `~/.pointfix/snapshots/` and skips `node_modules`, `dist`, `build` and similar folders.
- It needs `git` on the computer. Without it the agent still works, just without the change list and Undo.

### Modes
- **Make the change:** Claude runs with `--permission-mode acceptEdits`. It can edit files and run read-only commands such as `grep` and `ls`. Any other command runs only if your Claude Code permission settings already allow it; otherwise it is refused, because nobody is there to approve it. Codex runs with `sandbox_mode="workspace-write"`.
- **Suggest only:** Claude runs in `plan` mode and Codex in a `read-only` sandbox. Nothing is edited.

Follow-up messages continue the same conversation (per agent and project folder) until you click **New chat**.

## Publish

1. **Helper on npm.** From `helper/`, run `npm publish`. The name `pointfix` was free on 2026-10-23.
2. **Store zip.** Run `scripts/package-extension.sh` and upload `dist/pointfix-<version>.zip` as a new item in the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) (one-time $5 registration).
3. **Pin the store ID.** Copy the item ID from the dashboard into `STORE_EXTENSION_ID` in `helper/bin/cli.js`, bump the helper version and `npm publish` again. Users can then run `npx pointfix install` with no flags.
4. **Listing.** Fill in the listing, permission justifications and data-usage fields from `store/LISTING.md`. The privacy policy is published from `docs/privacy.html`; keep it in line with `store/PRIVACY.md`.
5. **Submit for review.**

## Store screenshots and demo video

- `scripts/make-screenshots.sh` rebuilds `store/screenshots/screenshot-1.png` and `-2.png` (1280×800, no alpha) from the real panel code, using the staged pages in `store/screenshots/`.
- The demo video `store/video/pointfix-demo.mp4` (about 49s, with a voice-over) is recorded from the real panel on `store/video/demo.html`, with a scripted agent. To re-record, serve the repo on port 4321 (`python3 -m http.server 4321` from this folder), then run `node store/video/record.js`. It speaks the narration (the `NARRATION` lines in `record.js`) with macOS `say`, drives headless Chrome over the DevTools protocol in time with it, encodes with AVFoundation (`encode.swift`) and adds the voice (`mux.swift`), so no ffmpeg is needed. It picks a Premium or Enhanced voice if one is installed (System Settings → Accessibility → Spoken Content → System voice → Manage Voices), otherwise Samantha. Use `VOICE="Name"` to choose one.

## Security notes

- Only extension IDs listed in the helper's `allowed_origins` can start it. Websites cannot reach it.
- Page content (HTML, text) goes into the prompt marked as data. A malicious page could still try to steer the agent, so use it on sites whose code you own, and use **Suggest only** on pages you don't trust. Claude can only run commands your Claude Code settings already allow, and Codex runs commands in its sandbox.
- The helper only runs inside the folder you enter, which must be an absolute path to an existing directory.
