# /docs' pictures and videos

NSRgpt's help center media (brief 10, 2026-11-07), pax-trinity's `scripts/docs-media` brought over and adapted. It is
made here and served from `https://d19bx9wfmnrb34.cloudfront.net/nsrgpt/docs/` (the clips bucket's `nsrgpt/docs/`,
New account), never from the repo. `capture/upload.sh` is the one place that names the bucket and the CDN; the move
to `s3://nsr-lake-613473203863/files/docs/` changes those two lines and `lib/docs/media.ts`.

The folder has its own `package.json` and `node_modules` (Remotion 4.0.524, playwright-core 1.60.0) and sits outside
the app's type check (tsconfig's exclude). Capture and render in the codespace; narrate and upload on the Mac.

## Make it again

In the codespace, with the dev server on localhost:3000 (no sign-in), once:

```
cd scripts/docs-media && npm install && npx playwright-core install chromium --with-deps
```

Then, one script at a time (the codespace's 16 GB is shared with the dev server):

```
cd scripts/docs-media/capture
node shots.mjs              # the key states and every chart page, shots/<name>.jpg (or: node shots.mjs home,nav)
node guides.mjs             # each guide's steps and the box each step points at, guides/<id>/ and guides/<id>.json
node record.mjs decay       # a screen recording with a timestamp at each beat, rec/decay.webm and rec/decay.json
node record.mjs levels
node record.mjs reactions
```

Pictures are dark mode (the user panel's switch, next-themes' `theme`), 1440×900 at 2x, JPEG. `LIGHT=1 node shots.mjs
home,sidebar` takes PAX Light (DEFAULT_THEME) instead, as `<name>.light.jpg`. The browser is Playwright's full Chromium
in new headless mode with WebGL on SwiftShader (the headless shell timed out on the busiest WebGL pages). `common.mjs` holds
what the three share. `decay-edit.json`, `levels-edit.json` and `reactions-edit.json` cut a recording into captioned
segments, each at its own speed; their times come from the recording's beats.

## Narration

On the Mac (the aws CLI's default profile is the old account; the new account's organization policy denies Polly),
with `guides/*.json` and the edit files copied over:

```
node capture/narrate.mjs Ruth,Matthew
```

It voices each video's title and captions with Polly's neural voices, measures each line, and writes the props that
stretch a step or slow a segment until its line is said: `voice/props/<video>.<voice>.json`, with the lines in
`voice/<Voice>/`. Lines are cached by hash, so a line is never paid for twice. ElevenLabs' voices join the same way
once a key with characters is in `ELEVENLABS_API_KEY`.

## Render

In the codespace, `capture/render.sh` renders every video in both voices and each poster, one at a time at
concurrency 1, skipping what's already rendered (`capture/render.sh guide-search` for one). By hand, from
`scripts/docs-media`:

```
M=capture
npx remotion render index.ts Guide $M/videos/guide-search.mp4 --props=$M/voice/props/guide-search.ruth.json --public-dir=$M --codec=h264 --crf=24 --concurrency=1
npx remotion render index.ts Guide $M/videos/guide-search.matthew.mp4 --props=$M/voice/props/guide-search.matthew.json --public-dir=$M --codec=h264 --crf=24 --concurrency=1
npx remotion still index.ts Guide $M/videos/guide-search.jpg --props=$M/guides/search.json --public-dir=$M --frame=20
npx remotion render index.ts Recording $M/videos/record-decay.mp4 --props=$M/voice/props/record-decay.ruth.json --public-dir=$M --codec=h264 --crf=24 --concurrency=1
```

The first narrator in `lib/docs/media.ts` NARRATORS (Ruth) is the default, `<video>.mp4`; each other is
`<video>.<voice>.mp4` (`.matthew.mp4`).

- `Guide.tsx`: a title card, then each step's screenshot in a window, the camera easing toward its target, a ring,
  a cursor that travels and clicks, and the step's caption.
- `Recording.tsx`: a recording's segments in the same window and captions.

## Upload

Copy the codespace's `capture/shots/` and `capture/videos/` to the Mac's `capture/`, then `capture/upload.sh`: it
syncs both with their content types (profile `nysgpt-new`) and checks every file on the CDN for a 200 and its type.

## A poster for the mail

`capture/play-badge.py` draws a play badge at the bottom right of a poster, for a mail that links to the article:

```
python3 capture/play-badge.py capture/videos guide-search      # capture/videos/guide-search.play.jpg
```
