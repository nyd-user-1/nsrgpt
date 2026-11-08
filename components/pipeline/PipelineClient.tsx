"use client"

import dynamic from "next/dynamic"

// The canvas renders in the browser only, as /graph's does (components/nsr/graph/GraphClient.tsx): a server render
// has nothing to show for a canvas, and React Flow measures its nodes on mount.
export const PipelineClient = dynamic(() => import("./PipelineCanvas").then((m) => m.PipelineCanvas), { ssr: false })
