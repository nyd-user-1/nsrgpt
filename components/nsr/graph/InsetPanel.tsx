"use client";

import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";

import { RailToggle, useRailClosed } from "@/components/rail-toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/nova/tooltip";
import { cn } from "@/lib/utils";

// /graph's two inset panels on one frame, so they can't drift (Brendan, 2026-11-08): the left panel's type, spacing and
// hover (INSET), the right panel's gripper, the left panel's 284 px starting width, the settings panel's tooltip
// (InsetTip). LeftInsetPanel.tsx and RightInsetPanel.tsx are the two panels.

export type InsetSide = "left" | "right";

const W = { start: 284, min: 280, max: 720 };
/** The canvas keeps at least this much while a panel is dragged wider. */
const CANVAS_MIN = 480;

/** The left panel's type, spacing and hover: every list in either panel is set in these. */
export const INSET = {
  header: "flex items-center gap-2 border-b p-3",
  title: "text-sm font-semibold text-[var(--paper-text)]",
  section: "px-3 pb-1 pt-4 text-[10px] uppercase tracking-wide text-[var(--paper-muted)]",
  row: "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--paper-text)] transition-colors hover:bg-[var(--paper-quiet)]",
  icon: "h-3.5 w-3.5 shrink-0 text-[var(--paper-muted)]",
  count: "ml-auto shrink-0 font-mono text-xs text-[var(--paper-muted)]",
  note: "p-3 text-xs text-[var(--paper-muted)]",
};

/** A panel's scrolling content, with the one bottom margin both panels share. */
export function InsetBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto pb-4", className)}>{children}</div>;
}

/** The settings panel's tooltip, for both panels: a name and what it does, in a paper card beside the row, on the
 *  canvas's side. It renders in a portal above the canvas, so no panel edge clips it. */
export function InsetTip({ name, text, side, children }: { name: string; text?: string; side: InsetSide; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger delay={0} closeDelay={0} render={children} />
      <TooltipContent
        side={side === "left" ? "right" : "left"}
        align="start"
        sideOffset={8}
        className="nysgpt-app pointer-events-none flex w-56 max-w-56 flex-col items-start gap-1 rounded-lg border border-[var(--paper-rule)] bg-[var(--paper)] p-2.5 text-left text-[var(--paper-text)] shadow-md [&>[data-side]]:hidden"
      >
        <span className="block font-mono text-[10px] text-[var(--paper-muted)]">{name}</span>
        {text && <span className="block text-xs leading-snug text-[var(--paper-text)]">{text}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

/** One inset panel: the rail tab on its inner edge closes and opens it (<html data-rail-left|right>); the shell's
 *  gripper on the same edge (components/shell.tsx, pax-trinity's) drags its width from 280 to 720 px, remembered per
 *  browser, double-click for 284, arrow keys in 24 px steps; 500 ms open and close, none while dragging. `tabs` ride
 *  the inner edge under the rail tab. */
export function InsetPanel({ side, storageKey, tabs, children }: { side: InsetSide; storageKey: string; tabs?: ReactNode; children: ReactNode }) {
  const closed = useRailClosed(side);
  const [w, setW] = useState(() => {
    try {
      const v = Number(localStorage.getItem(storageKey));
      return v >= W.min && v <= W.max ? v : W.start;
    } catch {
      return W.start;
    }
  });
  const [dragging, setDragging] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (dragging) return;
    try { localStorage.setItem(storageKey, String(w)); } catch {}
  }, [w, dragging, storageKey]);
  useEffect(() => {
    if (!dragging) return;
    const s = document.body.style;
    const prev = [s.cursor, s.userSelect];
    s.cursor = "col-resize"; s.userSelect = "none";
    return () => { s.cursor = prev[0]; s.userSelect = prev[1]; };
  }, [dragging]);
  const clamp = (v: number) => Math.max(W.min, Math.min(v, W.max, window.innerWidth - CANVAS_MIN));
  // The panel's inner edge follows the pointer.
  const resizeTo = (x: number) => {
    const r = box.current?.getBoundingClientRect();
    setW(clamp(side === "left" ? x - (r?.left ?? 0) : (r?.right ?? window.innerWidth) - x));
  };
  const grow = side === "left" ? "ArrowRight" : "ArrowLeft";
  const shrink = side === "left" ? "ArrowLeft" : "ArrowRight";
  return (
    <div
      ref={box}
      style={{ width: closed ? 0 : w }}
      className={cn("relative hidden h-full shrink-0", side === "left" ? "lg:block" : "md:block", !dragging && "transition-[width] duration-[500ms] ease-in-out")}
    >
      <RailToggle
        side={side}
        className={cn(
          "top-24 w-[22px] border border-[#033882] bg-[var(--paper-text)] text-[#033882] shadow-[0_2px_10px_rgba(3,56,130,0.22)] hover:w-[30.25px] hover:text-[#033882]",
          side === "left" ? "right-0 border-l-0" : "left-0 border-r-0",
        )}
      />
      {tabs}
      {!closed && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the panel"
          tabIndex={0}
          onPointerDown={(e) => { if (e.button !== 0) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); setDragging(true); }}
          onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && resizeTo(e.clientX)}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
          onLostPointerCapture={() => setDragging(false)}
          onDoubleClick={() => setW(W.start)}
          onKeyDown={(e) => {
            if (e.key !== grow && e.key !== shrink) return;
            e.preventDefault();
            setW((v) => clamp(v + (e.key === grow ? 24 : -24)));
          }}
          className={cn(
            "group absolute top-1/2 z-40 flex h-16 w-[18px] -translate-y-1/2 cursor-col-resize touch-none items-center justify-center outline-none",
            side === "left" ? "right-0 translate-x-1/2" : "left-0 -translate-x-1/2",
          )}
        >
          <span className={`h-8 w-1 rounded-full transition-colors group-hover:bg-[#033882] group-focus-visible:bg-[#033882] ${dragging ? "bg-[#033882]" : "bg-[rgba(22,24,29,0.18)] dark:bg-[rgba(240,233,216,0.2)]"}`} />
        </div>
      )}
      <div className={cn("flex h-full w-full overflow-hidden", side === "right" && "justify-end")}>
        <div style={{ width: w }} className={cn("flex h-full min-h-0 shrink-0 flex-col bg-[var(--paper)]", side === "left" ? "border-r" : "border-l")}>
          {children}
        </div>
      </div>
    </div>
  );
}
