# 50 — One chat standard everywhere: the renderer, the input container, Ask NSRgpt in the right panel, the orb (2026-11-09)

You're `window-2-ui-layer`. Written by `lead-agent` (Fable); Brendan asked at 17:30 ET after running a recipe on /graph
and reading its step output. Report to `lead-agent` by SendMessage, one line per part as it is pushed. Efficiency
Voice (`docs/sketches/2026-11-06-efficiency-voice.html`). No questions; a blocker goes in the report, you continue.

## Rules
1. `~/Code/nsrgpt` on main, shared: `git pull --rebase --autostash origin main`, commit in one step with explicit
   paths, push right after. Type-check on the dev box through SSM before pushing. Other windows have uncommitted
   files in `scripts/parse/` and `services/nsr-api/`; never add them.
2. Port from the named source, then adapt (EV rule 17): bring pax-trinity's files whole, change imports and tokens,
   leave the behaviour. Paper palette, plain language, reuse before writing.
3. Brendan reviews on the dev box, http://3.150.112.32:3000/graph and /chat, both themes.

## What he saw
A recipe's prompt step ran and its output opened in the right inset panel ("step output"). The text is raw: `##`
headings, `**bold**`, `$^{235}$U(n,f)`, pipe tables and `---` all unrendered, no citation chips, no footer, no way to
ask a follow-up, no orb. The same answer on /chat renders through `components/chat/ChatMessage.tsx` (react-markdown,
remark-gfm, remark-math, rehype-katex, the NSR-key citation chips, `ChatResponseFooter`). The standard is /chat's.

## Part A: the one renderer
1. Every place assistant text shows goes through `ChatMessage` (or a `ChatMarkdown` you lift out of it, so the
   message chrome stays optional): the step output in the right inset panel (`components/nsr/graph/GraphPage.tsx`
   around line 1832, today a `<p className="whitespace-pre-wrap">`), the run trace's step output (around line 1931,
   a `<pre>`), the prompt node's output excerpt on the canvas (around line 290), and `components/nsr/graph/ChatDock.tsx`
   (already `ChatMessage`; confirm). The note card's chat is TipTap and stays as it is.
2. Headings, tables, TeX, bold, lists, rules and the citation chips render as on /chat; a chip opens the entity as the
   dock's chips do (the open-entity event). Widths: the panel's, not /chat's column.

## Part B: the ChatInputContainer, and Ask NSRgpt in the right panel
1. `components/chat/ChatInput.tsx` is the container /chat and the dock use (the box, BorderLight, the plus menu,
   the model picker, send and stop). Name it as the design system does: export `ChatInputContainer` from it (keep
   `ChatInput` as an alias so nothing breaks), and use it wherever a right-side or right-inset chat happens.
2. The right inset panel's step output gets the container at its foot. A message sent there goes to `/api/chat`
   with the step's prompt and output as `systemContext` (first 80,000 characters are kept by the route), and the
   answer renders beneath the output through Part A's renderer, streaming. The conversation stays with the step
   (held in the prompt node's state the way `output` is, so a saved view carries it).
3. "Ask NSRgpt" on a paper's detail (`components/chat/EntityDetail.tsx` line 54) navigates away to `/chat?prompt=`.
   It opens the right-side panel's chat instead, through `useShellPanel().askAbout({ context, ask })`
   (`components/shell.tsx` line 23 has the seed's shape; the ShiftNote's menu uses it). Same for any other "Ask"
   that leaves the page; grep `/chat?prompt=`.

## Part C: the orb
1. pax-trinity has it: `src/components/agents/orbs.tsx` (CssOrb, Orb, ThinkingOrb, RestOrb, the kinds) and
   `src/components/agents/orbs.css`. Port both whole to `components/agents/`; keep its own colours and shadow (it is
   a glyph, not a palette element). NYSgpt (`~/Code/NYSgpt/components/agents/`) holds the same files; take
   pax-trinity's.
2. Placement is in pax-trinity's `src/components/chat/chat.tsx`, lines 824 to 828 and 1449: while inference runs,
   `ThinkingOrb` cycles on the waiting row; from the first word on, `RestOrb` stands below the newest answer and is
   pushed down as the output grows. Port that placement to `components/chat/ChatPage.tsx` (the /chat page), the
   dock, the right inset step output (Part B) and the shell's right-panel chat. One component for the placement
   (`AnswerOrb` or the name pax uses), used four times, not four copies.
3. The orb's follow-up chips (chat.tsx line 840, `orbAsk`) need an API pax has and we may not; port the click only
   if `/api/chat` can answer it in one call, else leave the orb inert on click and say so in the report.

## Done means
Each part pushed and type-checked; on the box: the recipe's step output renders like /chat with chips, a follow-up
can be typed beneath it and streams back with the orb, Ask NSRgpt opens the right panel, and /chat shows the orb.
Three one-line reports, then a short list of anything left out and why.

## Kickoff
`Read ~/Code/nsrgpt/docs/briefs/50-chat-standard-everywhere.md and do it; report to lead-agent after each part.`
