# 59 — Morning report, 2026-11-11 (the overnight run before launch, brief 55)

Brief 55's "Morning report must list": each item's URL on production and the box; the sweep's retrodiction hit rate;
the VIII.1 list's size and top ten; the mislabelled EXFOR count; the medical routes' yield uncertainties; what was left
out and why; spend; the layers table. Each window appends its own section.

Production: https://nsrgpt.brendan-stanton.workers.dev · Dev box: http://3.133.98.108:3000 (stops itself about 07:10 ET;
`scripts/devbox/launch.sh start i-0ec4775a5cd68d41b` restarts it and prints the new address).

## worker-2 (UI: briefs 54 and 58, the chat sign-up)

Every page below was type-checked and linted on the dev box before its push and checked there in light and dark.

| Page | Production | Box | Commit |
| --- | --- | --- | --- |
| Chart of nuclides: Colour by, legend and nuclide card in the right panel; 2× hovered and picked cell | /viz/chart | /viz/chart | f7b1a1c |
| Panels off the canvas: structure, matrix, spectra; decay and 3D graph legends | /viz/structure, /viz/matrix, /viz/spectra | same | 3ebe150 |
| 3D charts: Camera keys in the right panel, pan (Shift or Option + arrows, and the caps), 4× picked point | /viz/scatter3d-dataset, /viz/decay, /viz/graph | same | 51d94ad |
| "Decay chain" for "Decay family" (5 reader-facing strings) | /viz/chart | same | 7611248 |
| NSR-CPT, the model's page | /nsrcpt | /nsrcpt | f61c636, 92b5e3b |
| About | /about | /about | 8472322, acb8e18 |
| Sweep: ranked list, Retrodiction, Flags; pair in the second panel; Open in the Lab | /sweep, /sweep/pair | same | 5842ea4, acb8e18 |
| Medical isotope routes and a page per route | /sweep/medical, /sweep/medical/{route} | same | acb8e18 |
| ICRP 107 half-lives against ENSDF (1,246 rows, live) | /sweep/icrp | same | acb8e18 |
| GNDS 2.0 download on an ENDF/B record (precompiled, or compiled on demand through a job), and a GNDS row on the lake card | /datasets/endf/B-VIII.1/9228, /pipeline | same | a552f3c, ccf0cde |
| Chat for a signed-out reader: my sign-up message, then the sign-up dialog, then the kept question | /chat | /chat (tested with a 402 answered in Playwright; the box runs NYSGPT_CHAT_OPEN=1) | 8b426f9 |

What it needs from you:
- Hugging Face: every NYSgpt model repo but the two 44b ones answers 401 (private), the NSR pair included, so the
  /nsrcpt cards' links 404 for a visitor. Making them public, or not, is yours; the cards stay as they are.
- The chat's sign-up dialog succeeds on production once worker-1's Cognito change (self sign-up) is live; I did not
  submit a real sign-up on the box (it spends the day's allowance).

Left out, and why:
- /sweep and /sweep/medical show sample rows, labelled "Sample rows", until worker-3's routes answer: at this writing
  `GET /sweep`, `/sweep/releases`, `/sweep/retrodiction`, `/sweep/flags` and `/sweep/medical` all return 404. The pages
  read the routes first and switch to them the moment they answer; no number in a sample is measured. So the
  retrodiction hit rate, the VIII.1 list's size and top ten, the mislabelled EXFOR count and the medical yield
  uncertainties are worker-3's to report.
- Open in the Lab is offered on neutron pairs only: the Lab's ENDF block reads the neutron sublibrary. The pair's canvas
  has no Broaden block, so opening a pair never starts a job on the job box; add a Process block to broaden.
- Kept on the charts by decision: hover readouts that ignore the pointer (decay, 3D graph, knowledge) and the ECharts
  zoom sliders. Nothing a reader operates sits over a chart.
- Found and fixed on the way: /viz/matrix had been colouring every cell by its pair's row number, not by r.
- /viz/decay logs 19 React "synchronously unmount a root" warnings on load; main logs the same 19, so they predate this
  work.
