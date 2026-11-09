/**
 * One drag payload for the whole workspace: canvas cards, rail rows, search
 * hits and detail-panel headers all set `application/nsr-entity`; the canvas
 * (add at drop point) and the chat dock (attach as context) both read it.
 */

export const ENTITY_MIME = "application/nsr-entity";

export interface DragEntity {
  type: "paper" | "author" | "nuclide" | "reaction" | "exfor" | "prompt" | "file" | "more" | "dataset" | "material" | "level";
  id: string;
  label: string;
  sub?: string;
  title?: string | null;
}

export function setDragEntity(dt: DataTransfer, g: DragEntity) {
  const payload: DragEntity = { type: g.type, id: g.id, label: g.label, sub: g.sub, title: g.title };
  dt.setData(ENTITY_MIME, JSON.stringify(payload));
  dt.setData("text/plain", `${g.type} ${g.label}`);
  dt.effectAllowed = "copy";
}

export function readDragEntity(dt: DataTransfer | null): DragEntity | null {
  if (!dt) return null;
  try {
    const raw = dt.getData(ENTITY_MIME);
    if (!raw) return null;
    const g = JSON.parse(raw);
    return g && typeof g.type === "string" && typeof g.id === "string" ? (g as DragEntity) : null;
  } catch {
    return null;
  }
}

/** The record behind an entity, as a system-context paragraph for /api/chat. */
export async function describeEntity(g: DragEntity | null): Promise<string> {
  if (!g) return "";
  const head = "ACTIVE CONTEXT — the user attached this entity to the conversation:";
  if (g.type === "paper") {
    try {
      const d = await fetch(`/api/graph?op=node&type=paper&id=${encodeURIComponent(g.id)}`).then((r) => r.json());
      const n = d.node ?? {};
      return `${head}\nPAPER ${g.id}: "${n.title ?? g.title ?? ""}" (${n.pub_year ?? ""})${n.authors ? `\nAuthors: ${String(n.authors).slice(0, 300)}` : ""}${n.reference ? `\nReference: ${n.reference}` : ""}${n.abstract ? `\nAbstract: ${String(n.abstract).slice(0, 1200)}` : ""}`;
    } catch {
      return `${head}\nPAPER ${g.id}: ${g.title ?? ""}`;
    }
  }
  return `${head}\n${g.type.toUpperCase()} ${g.label}${g.sub ? ` (${g.sub})` : ""}${g.title ? ` — ${g.title}` : ""}`;
}
