import { PAPER_BRIDGE } from "@/components/editorial/PaperBridge";
import { VizLoading } from "@/components/viz/VizLoading";

// A chart page that is still rendering shows the atom on the paper ground (Brendan, 2026-11-11), not the site's
// blank loading panel (app/(site)/loading.tsx).
export default function Loading() {
  return (
    <div className="flex-1" style={{ backgroundColor: "var(--paper)", ...PAPER_BRIDGE }}>
      <VizLoading />
    </div>
  );
}
