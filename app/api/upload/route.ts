// The old nsr app's canvas file drop (presigned uploads to its PDF bucket, and the library list). NSRgpt has no upload
// store wired to the app yet (2026-11-07), so an upload still says so. The list answers with three real files from the
// lake (Brendan, 2026-11-08, brief 30), in the canvas-upload prefix and the paper PDFs: a paper the lake holds as a PDF,
// EXFOR entry 10001 as its X4 text, and the ENSDF 60Co adopted levels dataset as its cards.

const SEED_FILES = [
  { key: "files/pdfs/arxiv/1311.7043.pdf", name: "2014BE25, decay rates of 40K and 232Th.pdf", size: 269659, modified: "2026-11-06" },
  { key: "files/pdfs/workspace/exfor-10001.x4", name: "EXFOR 10001.x4", size: 614466, modified: "2026-11-08" },
  { key: "files/pdfs/workspace/ensdf-60CO.ens", name: "ENSDF 60Co adopted levels.ens", size: 92826, modified: "2026-11-08" },
]

export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("list")) return Response.json({ files: SEED_FILES })
  return Response.json({ error: "File upload isn't available yet." }, { status: 501 })
}
