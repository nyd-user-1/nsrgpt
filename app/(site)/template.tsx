"use client";

import { usePathname } from "next/navigation";

import { RevealFx } from "@/components/RevealFx";

// Every page arrives through the RevealFx (Brendan, 2026-11-06: "all page transitions should appear smooth",
// chart to chart above all). A template, unlike a layout, mounts afresh on each navigation, so the reveal plays every
// time while the header and sidebar (app/(site)/layout.tsx) stay put. The pages no longer reveal themselves.
// The Elpis pages are the exception (Brendan, 2026-11-11: the book first, then /elpis and every route under it): a
// click there changes the route, and the next page must land at once, with no reveal.
export default function Template({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  if (path === "/elpis" || path.startsWith("/elpis/")) return <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>;
  return (
    <RevealFx className="flex min-h-0 min-w-0 flex-1 flex-col" translateY={4}>
      {children}
    </RevealFx>
  );
}
