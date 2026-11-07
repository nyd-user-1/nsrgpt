"use client"

import dynamic from "next/dynamic"

// The canvas renders in the browser only, as it did in the old single-page app: it reads localStorage
// as it starts, and a server render has nothing to show for a canvas anyway.
export const GraphClient = dynamic(() => import("./GraphPage").then((m) => m.GraphPage), { ssr: false })
