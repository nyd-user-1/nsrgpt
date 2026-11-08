import { GripVertical, X } from "lucide-react";

// The /search widgets' shared chrome (2026-11-08): the stat tables in SearchPage.tsx and the charts in
// SearchCharts.tsx both use it, so the charts' recharts code can load on its own.

export interface CountEntry {
  value: string;
  count: number;
}

/* ------------------------------------------------------------------ */
/*  Shared widget chrome — every card is 280px tall, header is the drag  */
/*  handle (grab cursor + grip glyph), ✕ hides.                          */
/* ------------------------------------------------------------------ */

export const WIDGET_H = 280;
export const SHELL_CLS = "rounded-lg border border-[var(--paper-rule)] overflow-hidden min-w-0 flex flex-col";

export function WidgetHeader({ icon, title, sub, right, onClose }: {
  icon: React.ReactNode; title: string; sub?: string; right?: React.ReactNode; onClose: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-[var(--paper-quiet)] border-b border-[var(--paper-rule)] shrink-0 cursor-grab active:cursor-grabbing select-none">
      {icon}
      <span className="text-xs font-semibold text-[var(--paper-text)]">{title}</span>
      <GripVertical className="h-3 w-3 text-[var(--paper-muted)]" aria-label="drag to reorder" />
      {sub && <span className="text-[10px] text-[var(--paper-muted)]">{sub}</span>}
      <span className="flex-1" />
      {right}
      <button
        onClick={onClose}
        onMouseDown={(e) => e.stopPropagation()}
        className="h-5 w-5 rounded flex items-center justify-center text-[var(--paper-muted)] hover:text-[var(--paper-text)] hover:bg-[var(--paper-quiet)] transition-colors cursor-pointer"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
