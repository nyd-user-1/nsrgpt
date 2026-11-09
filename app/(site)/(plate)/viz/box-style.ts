// The plate box's look (page.tsx). `group/item`: the sidebar's hover group, so a box's icon takes a sidebar row's hover
// tones (box-icon.tsx).
export const SERIF = { fontFamily: "var(--font-display), Georgia, serif" } as const
export const SANS = { fontFamily: 'var(--font-sans, "DM Sans"), sans-serif' } as const
export const BOX_CLASS =
  "group/item flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-b border-r border-[var(--paper-rule)] px-5 py-5 transition-colors hover:bg-[var(--paper-quiet)] [-webkit-tap-highlight-color:transparent]"
