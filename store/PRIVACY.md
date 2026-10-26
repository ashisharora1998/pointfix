# Privacy Policy — Pointfix

_Last updated: 2026-10-26_

## What the extension does

When you click the toolbar icon, the extension lets you select an element on the current page and send a request about it to a coding agent (Claude Code or OpenAI Codex) that **you** have installed and signed in to on your own computer.

## Data the extension handles

When you press **Send**, the extension collects, from the current tab only:

- the page address (URL)
- the selected element's HTML, visible text, CSS selector, size, position and a few computed styles
- the name of the UI component and its source-file location, when the page is a development build that exposes it
- a screenshot of each selected element
- the viewport size, and, if you leave "Send to agent" checked in the page errors box, the page's JavaScript errors (uncaught errors, unhandled promise rejections and messages logged with console.error) and the addresses of failed requests on the page
- the message you typed and the project folder path you entered

## Where the data goes

This data is passed to a helper program on your computer, which you install yourself. The helper hands it to the Claude Code or Codex command-line tool you chose. That tool then sends it to its provider (Anthropic or OpenAI) under **your own account** and that provider's terms and privacy policy:

- Anthropic: https://www.anthropic.com/legal/privacy
- OpenAI: https://openai.com/policies/privacy-policy

The extension developer runs **no servers** and receives **none** of this data. The extension contains no analytics, tracking or advertising.

## Data stored on your device

The extension saves, in Chrome's local extension storage:

- the project folder you entered for each website
- your chosen agent and mode
- conversation IDs, so follow-up messages continue the same conversation
- your last 20 chats per site (your messages, the agent's replies and the change lists, without screenshots), so you can reopen them

Screenshots are written to a temporary file for the agent to read and deleted when the request finishes. To show and undo changes, the helper records snapshots of your project folder with git: inside your repository's own object store for git projects, or in `~/.pointfix/snapshots/` for other folders. These never leave your computer. Removing the extension deletes its stored data. Running `npx pointfix uninstall` removes the helper.

## Permissions

- **activeTab, scripting:** run the element picker on the current tab, only after you click the toolbar icon
- **nativeMessaging:** talk to the local helper program
- **storage:** remember the settings listed above

## Contact

Questions: ashisharora4063@gmail.com
