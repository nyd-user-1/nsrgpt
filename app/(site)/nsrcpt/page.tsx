import { Announcing } from "@/components/nsrcpt/Announcing"

// /nsrcpt (brief 58, Part A, 2026-11-10): the NSR-CPT model's page, the old nsr app's announcement ported whole
// (components/nsrcpt/Announcing.tsx). A static shell: every figure is in the bundle, nothing loads.

export const metadata = { title: "NSR-CPT" }

export default function Page() {
  return <Announcing />
}
