"use client"

import dynamic from "next/dynamic"

// The canvas renders in the browser only, as /graph's and /factory's do: React Flow measures its nodes on mount.
export const SchemaClient = dynamic(() => import("./SchemaCanvas").then((m) => m.SchemaCanvas), { ssr: false })
