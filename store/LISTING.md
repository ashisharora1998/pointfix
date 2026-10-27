# Chrome Web Store listing — copy and paste

## Name (comes from the manifest)
Pointfix: fix your UI with Claude Code or Codex

## Summary (max 132 characters)
Point at any element on a page, say what to change, and your local Claude Code or Codex edits the code.

## Category
Developer Tools

## Description
Stop describing UI bugs in words. Point at the button, card or heading you want changed, say what you want, and Pointfix sends it to the coding agent already on your computer: Claude Code or OpenAI Codex. The agent finds the right code in your project and makes the change.

HOW IT WORKS
• Click the Pointfix icon (or press Alt+Shift+E) and hover to highlight any element on the page.
• Click to select it. Use ↑ / ↓ to jump to the parent or child, or Shift+click to select several elements at once.
• Type your request, e.g. "match this button to the header color" or "fix the spacing on mobile", or use a one-click quick action.
• Pointfix sends the agent everything it needs: the CSS selector, HTML, text, styles, size, a screenshot, and on development builds the UI component and the source file it comes from.
• The agent edits your code, the page reloads by itself, and you see the result.

SEE AND UNDO EVERY CHANGE
• Every edit shows which files changed, with a color diff.
• Before and after screenshots show whether the change really worked.
• Undo any change with one click. Pointfix refuses to undo if you've edited those files again since, so your later work is never overwritten.
• Prefer to stay in control? Switch to "Suggest only" and the agent explains the fix without touching any files.

BUILT FOR REAL PROJECTS
• Finds your project folder automatically from your localhost dev server, or choose it with Browse.
• Works with your existing project and framework. There's nothing to add to your code.
• Catches the page's JavaScript errors and failed requests as they happen and shows them in the panel. They go to the agent with your request, so "fix this" works for broken pages too.
• Fix phone layouts by picking elements in Chrome DevTools' device mode.
• Follow-up messages continue the same conversation. Past chats are saved per site so you can pick up where you left off.
• A ✓ on the toolbar icon tells you when a request is done, so you can keep working in other tabs.
• "Copy prompt" turns the element and your request into text you can paste into any other AI tool.

FREE, AND USES YOUR OWN SUBSCRIPTION
• Pointfix is free. No sign-up, no API keys, no payments.
• Claude Code signs in with your Claude account. Codex signs in with your ChatGPT account (the ChatGPT app for Mac already includes it).
• Nothing goes through our servers. We don't run any. Your code and page data go only to the agent you choose, under your own account.

ONE-TIME SETUP
1. Install Claude Code and/or Codex and sign in once.
2. Install the small local helper by running this in a terminal: npx pointfix install
3. Open your app, click the Pointfix icon, and start fixing.
Pointfix opens a setup page after install that checks each step for you. Requires macOS, Linux or Windows with Node.js 18 or later.

Not affiliated with or endorsed by Anthropic or OpenAI. Claude and Claude Code are trademarks of Anthropic. Codex and ChatGPT are trademarks of OpenAI.

## Single purpose (dashboard field)
Let the user select an element on a web page and send it, with their request, to a coding agent running locally on their computer.

## Permission justifications (dashboard fields)
- activeTab: Runs the element picker on the current tab, and screenshots the selected element, only after the user clicks the toolbar icon.
- scripting: Injects the element picker into the current tab when the user clicks the icon, and reads framework component names, the page's JavaScript errors (including console.error messages) and failed requests from the page, so the agent can find the right source file and see what is broken.
- nativeMessaging: Sends the selected element and the user's request to the helper the user installed locally, which runs their Claude Code or Codex CLI.
- storage: Remembers the project folder for each site, the chosen agent and mode, and conversation IDs for follow-up messages.
- Remote code: No. All code ships in the package.

## Data usage (dashboard checkboxes)
- Website content: collected (selected element and screenshot), sent only to the user's local helper on their request.
- Not sold, not used for unrelated purposes, not used for creditworthiness.

## Privacy policy URL
https://ashisharora1998.github.io/pointfix/privacy.html (published from docs/privacy.html)

## Assets you need
- Icon 128×128: extension/icons/icon128.png
- At least one screenshot, 1280×800 or 640×400 (the picker highlighting an element, with the panel open)
- Optional small promo tile, 440×280
