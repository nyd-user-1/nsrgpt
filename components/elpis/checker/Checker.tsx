"use client";

// /elpis/checker (brief 71, elpis-check): drop or paste a TRANS file; nsr-api's /exfor/check (through
// app/(site)/elpis/checker/api) returns the messages, each with the rule it broke. The results sit in the house table,
// filtered by severity; a rule unfolds its manual text; a line number scrolls the file pane to the flagged record.
// "Download report" writes the checker's own text format (scripts/exfor-check/check.py report()).

import { Fragment, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Download, FileUp } from "lucide-react";
import { SERIF } from "@/app/(site)/(plate)/viz/box-style";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/nova/table";
import { cn } from "@/lib/utils";

type Severity = "error" | "warning";
type Msg = { line: number; entry: string; subent: string; severity: Severity; rule: string; code: string; message: string };
type Rule = { id: string; source: string; topic: string; title: string; text: string };
type Result = {
  messages: Msg[];
  summary: { entries: number; subentries: number; errors: number; warnings: number; lines: number; bytes: number; seconds: number };
  entries: { entry: string; line: number; subentries: string[] }[];
  rules: Record<string, Rule>;
  held: Record<string, string>;
  dictionary: string;
  name: string;
  error?: string;
};

const PAGE = 300;
const WINDOW = 600; // file lines drawn at once around the selected line
const CELL = "py-1.5 align-top text-[13px] text-[var(--paper-text)]";
const MONO = "font-mono text-[12px]";
const SEV: Record<Severity, string> = {
  error: "border-[var(--pax2-red)] text-[var(--pax2-red)]",
  warning: "border-[#a16207] text-[#a16207] dark:border-[#e0b04a] dark:text-[#e0b04a]",
};
const MARK: Record<Severity, string> = {
  error: "bg-[color-mix(in_oklab,var(--pax2-red)_14%,var(--paper))]",
  warning: "bg-[color-mix(in_oklab,#d69e2e_16%,var(--paper))]",
};

function report(r: Result): string {
  const s = r.summary;
  const pad = (v: string | number, n: number, right = false) => (right ? String(v).padStart(n) : String(v).padEnd(n));
  const out = [
    `EXFOR TRANS check: ${r.name} (dictionary ${r.dictionary})`,
    `${s.entries} entries, ${s.subentries} subentries, ${s.errors} errors, ${s.warnings} warnings, ${s.seconds} s`,
    "",
    `${pad("LINE", 6, true)}  ${pad("ENTRY", 5)}  SUB  ${pad("SEVERITY", 8)}  ${pad("RULE", 12)}  ${pad("CODE", 16)}  MESSAGE`,
    ...r.messages.map((m) => `${pad(m.line, 6, true)}  ${pad(m.entry, 5)}  ${pad(m.subent, 3)}  ${pad(m.severity, 8)}  ${pad(m.rule, 12)}  ${pad(m.code.slice(0, 16), 16)}  ${m.message}`),
  ];
  return out.join("\n") + "\n";
}

export function Checker() {
  const [text, setText] = useState("");
  const [file, setFile] = useState<{ name: string; bytes: ArrayBuffer } | null>(null);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [shown, setShown] = useState<{ text: string; name: string } | null>(null);
  const [sev, setSev] = useState<"all" | Severity>("all");
  const [open, setOpen] = useState<number | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [sel, setSel] = useState<number | null>(null);
  const [over, setOver] = useState(false);
  const pick = useRef<HTMLInputElement>(null);
  const pane = useRef<HTMLDivElement>(null);

  const take = async (f: File) => {
    setFile({ name: f.name, bytes: await f.arrayBuffer() });
    setText("");
  };

  const run = async () => {
    const name = file?.name ?? "pasted.txt";
    const body: BodyInit = file ? file.bytes : new TextEncoder().encode(text);
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/elpis/checker/api?name=${encodeURIComponent(name)}`, { method: "POST", body });
      const j = (await r.json()) as Result;
      if (!r.ok || j.error) throw new Error(j.error ?? `The checker answered ${r.status}.`);
      setRes(j);
      setShown({ name, text: file ? new TextDecoder("latin1").decode(file.bytes) : text });
      setSev("all");
      setOpen(null);
      setLimit(PAGE);
      setSel(j.messages.find((m) => m.line > 0)?.line ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setRes(null);
    } finally {
      setBusy(false);
    }
  };

  const clear = () => {
    setText("");
    setFile(null);
    setRes(null);
    setErr(null);
    setShown(null);
    if (pick.current) pick.current.value = "";
  };

  const rows = useMemo(() => (res ? res.messages.filter((m) => sev === "all" || m.severity === sev) : []), [res, sev]);
  const flagged = useMemo(() => {
    const f = new Map<number, Severity>();
    for (const m of res?.messages ?? []) if (m.line > 0 && f.get(m.line) !== "error") f.set(m.line, m.severity);
    return f;
  }, [res]);
  const lines = useMemo(() => (shown && !res?.messages.some((m) => m.rule === "FILE-BINARY") ? shown.text.replace(/\r/g, "").split("\n") : []), [shown, res]);
  const start = lines.length <= WINDOW ? 0 : Math.max(0, Math.min((sel ?? 1) - WINDOW / 2, lines.length - WINDOW));

  const goto = (line: number) => {
    setSel(line);
    requestAnimationFrame(() => {
      const box = pane.current;
      const el = box?.querySelector<HTMLElement>(`[data-line="${line}"]`);
      if (box && el) box.scrollTop = el.offsetTop - box.clientHeight / 2; // the pane only, not the page
    });
  };

  const download = () => {
    if (!res) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([report(res)], { type: "text/plain" }));
    a.download = `${res.name.replace(/[^\w.-]+/g, "_")}.check.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const s = res?.summary;
  const held = res ? res.entries.filter((e) => res.held[e.entry] !== undefined) : [];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <h1 className="mb-4 text-3xl tracking-tight text-[var(--paper-text)]" style={SERIF}>EXFOR TRANS Checker</h1>
      <div className="grid max-w-[1100px] grid-cols-1 gap-3 md:grid-cols-2">
        <div
          role="button"
          tabIndex={0}
          onClick={() => pick.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && pick.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) void take(f); }}
          className={cn(
            "flex min-h-[132px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-4 text-center text-sm text-[var(--paper-muted)] transition-colors",
            over ? "border-[#033882] bg-[var(--paper-quiet)]" : "border-[var(--paper-rule)] hover:bg-[var(--paper-quiet)]",
          )}
        >
          <FileUp className="h-5 w-5" />
          {file ? <span className="font-mono text-[var(--paper-text)]">{file.name} · {(file.bytes.byteLength / 1024).toFixed(0)} KB</span> : "Drop a TRANS file or choose one"}
          <input ref={pick} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void take(f); }} />
        </div>
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setFile(null); }}
          placeholder="Paste a TRANS file"
          spellCheck={false}
          className={cn(MONO, "min-h-[132px] w-full resize-y rounded-xl border border-[var(--paper-rule)] bg-[var(--paper)] p-3 text-[var(--paper-text)] outline-none placeholder:text-[var(--paper-muted)] focus:border-[#033882]")}
        />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button type="button" className="h-10 rounded-full px-5" disabled={busy || (!file && !text.trim())} onClick={run}>{busy ? "Checking…" : "Check"}</Button>
        <Button type="button" variant="ghost" className="h-10 rounded-full px-4 text-[var(--paper-muted)]" onClick={clear}>Clear</Button>
      </div>
      {err && <p className="mt-4 text-sm text-[var(--pax2-red)]">{err}</p>}

      {res && s && (
        <div className="mt-6">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-[var(--paper-text)]">
            <span className="font-mono">{res.name}</span>
            <span className="text-[var(--paper-muted)]">
              {s.entries} entries · {s.subentries} subentries · {s.errors} errors · {s.warnings} warnings · {s.seconds} s · dictionary {res.dictionary}
            </span>
          </div>
          {held.length > 0 && (
            <p className="mt-2 text-sm text-[var(--paper-muted)]">
              {held.length === 1 ? "" : "Revises the held entries "}
              {held.map((e, i) => (
                <Fragment key={e.entry}>
                  {i > 0 && " · "}
                  <Link href={`/datasets/exfor/${e.entry}`} className="font-mono text-[var(--paper-text)] underline-offset-2 hover:underline">{e.entry}</Link>
                </Fragment>
              ))}
              {held.length === 1 && " revises the held entry"}
            </p>
          )}
          {res.messages.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--paper-text)]">I found no errors and no warnings.</p>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {(["all", "error", "warning"] as const).map((k) => (
                  <Button key={k} type="button" variant={sev === k ? "default" : "outline"} className="h-8 rounded-full px-3 text-xs"
                    onClick={() => { setSev(k); setLimit(PAGE); setOpen(null); }}>
                    {k === "all" ? `All ${res.messages.length}` : k === "error" ? `Errors ${s.errors}` : `Warnings ${s.warnings}`}
                  </Button>
                ))}
                <Button type="button" variant="outline" className="ml-auto h-8 rounded-full px-3 text-xs" onClick={download}>
                  <Download className="mr-1 h-3.5 w-3.5" />Download report
                </Button>
              </div>
              <div className="mt-3 flex flex-col gap-4 xl:flex-row">
                <div className="min-w-0 flex-1">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {["Line", "Entry", "Subentry", "Severity", "Code", "Message", "Rule"].map((h) => (
                          <TableHead key={h} className={cn("h-9 text-xs text-[var(--paper-muted)]", h === "Line" && "text-right")}>{h}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.slice(0, limit).map((m, i) => {
                        const rule = res.rules[m.rule];
                        return (
                          <Fragment key={i}>
                            <TableRow className={cn(sel === m.line && m.line > 0 && "bg-[var(--paper-quiet)]")}>
                              <TableCell className={cn(CELL, MONO, "text-right")}>
                                {m.line > 0 ? <button type="button" className="underline-offset-2 hover:underline" onClick={() => goto(m.line)}>{m.line}</button> : "–"}
                              </TableCell>
                              <TableCell className={cn(CELL, MONO)}>
                                {res.held[m.entry] !== undefined ? <Link href={`/datasets/exfor/${m.entry}`} className="underline-offset-2 hover:underline">{m.entry}</Link> : m.entry}
                              </TableCell>
                              <TableCell className={cn(CELL, MONO)}>{m.subent}</TableCell>
                              <TableCell className={CELL}><Badge variant="outline" className={cn("rounded-md px-1.5 py-0 text-[11px] font-normal", SEV[m.severity])}>{m.severity}</Badge></TableCell>
                              <TableCell className={cn(CELL, MONO, "max-w-[180px] break-all")}>{m.code}</TableCell>
                              <TableCell className={cn(CELL, "min-w-[240px] whitespace-normal")}>{m.message.charAt(0).toUpperCase() + m.message.slice(1)}</TableCell>
                              <TableCell className={cn(CELL, MONO)}>
                                <button type="button" aria-expanded={open === i} className="text-[#033882] underline-offset-2 hover:underline dark:text-[#8fb3ff]" onClick={() => setOpen(open === i ? null : i)}>{m.rule}</button>
                              </TableCell>
                            </TableRow>
                            {open === i && rule && (
                              <TableRow>
                                <TableCell colSpan={7} className="whitespace-normal bg-[var(--paper-quiet)] py-3 text-[13px] text-[var(--paper-text)]">
                                  <p className="font-medium">{rule.title}</p>
                                  <p className="mt-1 max-w-[760px] leading-relaxed">{rule.text}</p>
                                  <p className="mt-1 text-xs text-[var(--paper-muted)]">{rule.source} · {rule.topic}</p>
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                  {rows.length > limit && (
                    <Button type="button" variant="ghost" className="mt-2 h-8 rounded-full px-3 text-xs text-[var(--paper-muted)]" onClick={() => setLimit(limit + PAGE)}>
                      Show {Math.min(PAGE, rows.length - limit)} more of {rows.length - limit}
                    </Button>
                  )}
                </div>
                {lines.length > 0 && (
                  <div ref={pane} className="relative max-h-[70vh] min-w-0 overflow-auto rounded-xl border border-[var(--paper-rule)] xl:w-[46%] xl:shrink-0">
                    <div className={cn(MONO, "min-w-max py-2 leading-[18px]")}>
                      {lines.slice(start, start + WINDOW).map((l, k) => {
                        const n = start + k + 1;
                        const f = flagged.get(n);
                        return (
                          <div key={n} data-line={n} className={cn("flex whitespace-pre pr-3", f && MARK[f], sel === n && "outline outline-1 -outline-offset-1 outline-[#033882]")}>
                            <span className="w-14 shrink-0 select-none pr-3 text-right text-[var(--paper-muted)]">{n}</span>
                            <span className="text-[var(--paper-text)]">{l || " "}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
