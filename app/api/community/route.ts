// The old nsr app's saved canvases ("views" and "recipes") lived in its database. NSRgpt holds no
// writable store for them yet (2026-11-07): the lists answer empty, saving says so.
export async function GET(req: Request) {
  const tab = new URL(req.url).searchParams.get("tab")
  if (tab === "view") return Response.json({ error: "not found" }, { status: 404 })
  return Response.json({ views: [], issues: [], posts: [], threads: [] })
}

export async function POST() {
  return Response.json({ error: "Saving to Community isn't available yet." }, { status: 501 })
}
