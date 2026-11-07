// The old nsr app's canvas file drop (presigned uploads to its PDF bucket, and the library list).
// NSRgpt has no upload store yet (2026-11-07): the list answers empty and an upload says so.
export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("list")) return Response.json({ files: [] })
  return Response.json({ error: "File upload isn't available yet." }, { status: 501 })
}
