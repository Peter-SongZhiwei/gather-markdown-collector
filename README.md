# Gather — Markdown Collector

Paste Markdown or plain text in **Edit** mode, then switch to **Select blocks**. Tap paragraphs or list items, review your collection, and copy Markdown or download a `.md` file. Code blocks and tables stay whole; nested list details stay with their parent. Output follows source order.

Switching back to Edit preserves your source. Switching to Select blocks applies edits and preserves picks for unchanged blocks. Clear source removes the answer, draft, blocks, selection, and selection history; Undo clear restores the previous state until you start another answer or reload.

All parsing and draft storage happen in the browser. Drafts use the existing `gather.markdown.v1` localStorage key and do not sync across devices. Existing v1.1 drafts and selections remain compatible; legacy import fields are ignored. No model API calls are made. Remote images display their alt text, and rendered HTML uses a safe allowlist.

Version 1.2 removes shared-link importing and replaces Edit source / Update blocks with an Edit / Select blocks mode switch. Includes Clear source with undo.

For ChatGPT on iPhone, use the Safari shortcut to copy the rendered answer as Markdown, then paste into Gather. Plain text cannot restore lost table boundaries or code fences.

Version 1.3 adds an optional Userscripts flow. See `/send-to-gather.html` for setup and `/gather-auto.user.js` for the script. A share-sheet shortcut opens `x-safari-` + the public HTTPS ChatGPT share URL + `#gather-auto` to request Safari instead of routing the ordinary universal link back into the ChatGPT app. The extension waits for the last answer, converts its DOM to Markdown, and transfers it via local GM storage to this exact Gather origin. Gather receives a string-valued `gather:import-v1` DOM event, parses before replacing the current draft, acknowledges the ticket, and offers Undo import. The extension removes successful transfers; pending records expire after one hour and are pruned on the next send. No answer content enters URLs, a server fetch, or the clipboard. Native iPhone URL-scheme handling, Userscripts installation, permissions, sign-in continuity and cross-origin storage require device testing.

The browser app lives in `web/`. `npm run build` embeds assets in a Worker ESM at `dist/server/index.js`. `npm run dev` serves it locally. No npm dependencies or install step are needed. `npm test` checks Markdown parsing and selection/export; `npm run validate` checks the built artifact. The vendored Marked parser is MIT licensed; see `web/vendor/marked-LICENSE.md`.
