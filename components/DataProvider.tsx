"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/use-data";

/** The app's one query cache, mounted once at the root (2026-11-08): chart data (lib/use-data.ts), search and graph. */
export function DataProvider({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>;
}
