# pointfix

**The local helper for [Pointfix](https://ashisharora1998.github.io/pointfix/), the Chrome extension that lets you point at any element on a page, say what to change, and have your own Claude Code or OpenAI Codex fix the code.**

```bash
npx pointfix install
```

One command, once. After that, the extension does everything.

---

## What is this?

Pointfix has two parts:

1. **The Chrome extension.** You click an element on your page, type a request like *"make this button match the header"*, and press Send.
2. **This helper.** A small program on your computer that receives the request and runs **your own** `claude` or `codex` command-line tool in your project folder.

```
Chrome extension ──(Chrome native messaging)──► pointfix helper ──► claude -p / codex exec
                                                                     (in your project folder)
```

Browser extensions can't run programs on your computer by themselves. Chrome's [native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging) lets an extension talk to one program you've explicitly installed and registered, and this package is that program.

- **Uses your own subscription.** Claude Code signs in with your Claude account, and Codex with your ChatGPT account. No API keys.
- **Nothing goes through a server.** There's no Pointfix server. Requests go from your browser to your computer to the agent you chose.
- **Free and open.** MIT licensed, no dependencies.

## Requirements

- **Node.js 18 or later**
- **Google Chrome**, or Chromium, Brave or Microsoft Edge
- **At least one coding agent, installed and signed in:**
  - **Claude Code:** install from [claude.com/claude-code](https://claude.com/claude-code), then run `claude` and type `/login`.
  - **Codex:** on a Mac, the **ChatGPT desktop app already includes it**. Otherwise run `npm install -g @openai/codex`, then `codex` to sign in with ChatGPT.
- **Optional: `git`.** Only needed for the change list, diff and Undo. Projects don't have to be git repositories.

macOS and Linux are fully supported. Windows support is experimental.

## Install

```bash
npx pointfix install
```

This registers the helper for the Pointfix extension from the Chrome Web Store. Then open the extension's setup page (⚙ in the Pointfix panel, or the extension's **Options**): it checks that everything works.

**Testing a local copy of the extension** ("Load unpacked" in `chrome://extensions`)? Pass its ID:

```bash
npx pointfix install --extension-id <your-32-letter-extension-id>
```

You can run `install` again at any time. Extension IDs you registered before are kept.

## Commands

| Command | What it does |
|---|---|
| `npx pointfix install` | Installs the helper and registers it with your browsers. |
| `npx pointfix install --extension-id <id>` | Also allows another extension ID (e.g. your own unpacked build). Repeat the flag for several. |
| `npx pointfix doctor` | Checks the installation: helper files, Node.js, browser registration, and whether Claude Code and Codex are found. |
| `npx pointfix uninstall` | Removes the helper, its browser registration, its settings and its snapshots. |

## What gets installed

Everything lives in your home folder, and nothing needs `sudo`:

- **`~/.pointfix/host.js`:** the helper itself, a copy of this package's `host.js`.
- **`~/.pointfix/host.sh`** (or `host.bat` on Windows): a launcher that starts it with the Node.js you installed with.
- **`~/.pointfix/config.json`:** where `claude` and `codex` were found.
- **A native-messaging manifest named `com.pointfix.bridge.json`**, which tells the browser where the helper is and which extension IDs may start it:
  - macOS: `~/Library/Application Support/<browser>/NativeMessagingHosts/`
  - Linux: `~/.config/<browser>/NativeMessagingHosts/`
  - Windows: in `~/.pointfix/`, registered under `HKCU\Software\<browser>\NativeMessagingHosts`

  The manifest goes into Chrome's folder always, and into Chrome Beta, Chromium, Brave and Edge's folders if those browsers are installed.

## How requests are run

When you press **Send** in the extension, the helper:

1. **Checks the request.** The project folder must be an absolute path to an existing directory, and the agent must be `claude` or `codex`.
2. **Records the project** (in *Make the change* mode), so it can show what changed and undo it. [See below.](#changes-and-undo)
3. **Writes screenshots to a temporary file.** Screenshots of the selected elements go into a temporary folder for the agent to read, and are deleted afterwards.
4. **Runs the agent in your project folder:**

   | Mode | Claude Code | Codex |
   |---|---|---|
   | **Make the change** | `claude -p --permission-mode acceptEdits`: can edit files and run read-only commands; anything else needs your Claude Code permission settings to allow it | `codex exec` with `sandbox_mode="workspace-write"` |
   | **Suggest only** | `--permission-mode plan`: reads, never edits | `sandbox_mode="read-only"` |

5. **Streams progress back** to the panel: the agent's replies, the files it edits, the commands it runs.

Follow-up messages resume the same agent conversation (`claude --resume` / `codex exec resume`).

## Changes and Undo

Before an edit run, the helper takes a snapshot of the project with git, and diffs it afterwards. That's how the panel shows exactly which files the agent changed, and how **Undo** can restore them.

- **In a git repository** it uses a throwaway index file. Your staged changes, branches, stashes and history are **never touched**, and `.gitignore` is respected. The snapshot data is stored in the repository's own `.git` folder, unreferenced, and git's normal cleanup (`git gc`) removes it over time.
- **In other folders** it keeps a private snapshot repository in `~/.pointfix/snapshots/`, skipping `node_modules`, `dist`, `build`, `.next` and similar folders.
- **Undo refuses** if any of those files changed again after the agent's edit, so it can't overwrite your later work.

## Security

- **Only the Pointfix extension can start the helper.** Chrome checks the extension ID against the manifest's `allowed_origins`, so websites can't reach it.
- **Page content is treated as data.** The selected element's HTML and text go into the prompt marked as data, not instructions. A malicious page could still try to steer the agent, so use Pointfix on sites whose code you own, and use **Suggest only** on pages you don't trust.
- **The agent works inside the project folder you chose**, with its own permission and sandbox rules (see the table above).
- **No network access of its own.** The helper never sends data anywhere except to the agent CLI you chose, which talks to Anthropic or OpenAI under your account.

Full privacy policy: [ashisharora1998.github.io/pointfix/privacy.html](https://ashisharora1998.github.io/pointfix/privacy.html)

## Troubleshooting

**The panel says "Couldn't reach the local helper"**
Run `npx pointfix install`, then press Send again. If you use a locally loaded copy of the extension, add `--extension-id <id>` with the ID shown in `chrome://extensions`.

**"Not logged in" or an authentication error from Claude Code**
Run `claude` in a terminal and type `/login`. The helper uses the same login as your terminal.

**"Couldn't find the codex command"**
Install Codex or update the ChatGPT app, then run `npx pointfix install` again so the helper records where it is.

**It stopped working after switching Node.js versions** (nvm, fnm, Homebrew upgrade)
The launcher points at the Node.js you installed with. Run `npx pointfix install` again.

**Changes don't show on the page**
Pointfix reloads the page without the cache after an edit. If you reload by hand, use ⌘⇧R / Ctrl+Shift+R. Dev servers with hot reload (Vite, Next.js…) update by themselves.

Still stuck? Run `npx pointfix doctor` and include its output when you ask for help: [ashisharora4063@gmail.com](mailto:ashisharora4063@gmail.com).

## License

MIT

Not affiliated with or endorsed by Anthropic or OpenAI. Claude and Claude Code are trademarks of Anthropic. Codex and ChatGPT are trademarks of OpenAI.
