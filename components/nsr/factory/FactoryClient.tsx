"use client"

import dynamic from "next/dynamic"

// The canvas renders in the browser only, as /graph's and /pipeline's do: React Flow measures its nodes on mount.
export const FactoryClient = dynamic(() => import("./FactoryCanvas").then((m) => m.FactoryCanvas), { ssr: false })
