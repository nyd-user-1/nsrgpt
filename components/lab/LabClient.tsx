"use client"

import dynamic from "next/dynamic"

// The Lab renders in the browser only: its blocks fetch when they run, and a server render has nothing to show for them.
export const LabClient = dynamic(() => import("./LabPage").then((m) => m.LabPage), { ssr: false })
