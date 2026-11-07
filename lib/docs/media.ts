// /docs' pictures and videos (2026-11-07): screenshots of every page and the guide videos made from them with
// Remotion (scripts/docs-media, pax-trinity's pipeline), served from CloudFront, so none of it rides in the repo or
// the worker. The one base URL: it moves to NSRgpt's own bucket later by changing this line.

export const DOCS_MEDIA = process.env.NEXT_PUBLIC_DOCS_MEDIA ?? "https://d19bx9wfmnrb34.cloudfront.net/nsrgpt/docs"

/** A screenshot, as markdown: shots/<name>.jpg. */
export const shot = (name: string, alt: string) => `![${alt}](${DOCS_MEDIA}/shots/${name}.jpg)`

/** A video, as markdown the docs draw as a player; its poster is the same name as a .jpg. */
export const video = (name: string, alt: string) => `![${alt}](${DOCS_MEDIA}/videos/${name}.mp4)`

/** The narrators each video is rendered in, the first the default (<name>.mp4); each other is <name><suffix>.mp4.
 *  Rendered by media-agent (docs/briefs/10-docs-media.md): Polly for both; ElevenLabs had no characters left. */
export const NARRATORS: { id: string; label: string; provider: string; suffix: string }[] = [
  { id: "ruth", label: "Ruth", provider: "Polly", suffix: "" },
  { id: "matthew", label: "Matthew", provider: "Polly", suffix: ".matthew" },
]

/** The guide videos and screen recordings, as rendered, for Video guides and each article that plays one. */
export const GUIDES: { name: string; title: string; summary: string; article: string }[] = [
  { name: "guide-find-your-way", title: "Find your way", summary: "The sidebar, search and the Nav.", article: "sidebar" },
  { name: "guide-read-a-chart", title: "Read a chart", summary: "Open one, read a point, change its type.", article: "chart-pages" },
  { name: "guide-3d-camera", title: "Move the 3D camera", summary: "Click in, steer with the keys, Esc out.", article: "three-d" },
  { name: "guide-panel-2", title: "Open a second panel", summary: "Two pages side by side.", article: "panel-2" },
  { name: "guide-search", title: "Search", summary: "Every chart, table, chat and page from one box.", article: "search" },
  { name: "guide-data-table", title: "Use a chart's table", summary: "Step through the rows and select a run.", article: "data-tables" },
  { name: "guide-notes", title: "Write a note", summary: "Shift and a drag, on any page.", article: "notes" },
  { name: "record-decay", title: "Radioactive decay, simulated", summary: "Every nuclide decaying at its measured rate.", article: "atlas-decay" },
  { name: "record-levels", title: "Level energies in 3D", summary: "139,868 adopted levels over the chart of nuclides.", article: "atlas-structure" },
  { name: "record-reactions", title: "Decay paths", summary: "Every decay step ENSDF records, on the chart of nuclides.", article: "atlas-decay" },
]
