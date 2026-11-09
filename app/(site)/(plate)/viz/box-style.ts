// The plate box's look, shared by the chart boxes (page.tsx) and the Hidden box (plate-arrange.tsx, brief 37).
export const SERIF = { fontFamily: "var(--font-display), Georgia, serif" } as const
export const SANS = { fontFamily: 'var(--font-sans, "DM Sans"), sans-serif' } as const
export const MONO = { fontFamily: "var(--font-mono), ui-monospace, monospace" } as const
export const BOX_CLASS =
  "flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-b border-r border-[var(--paper-rule)] px-5 py-5 transition-colors hover:bg-[var(--paper-quiet)] [-webkit-tap-highlight-color:transparent]"
