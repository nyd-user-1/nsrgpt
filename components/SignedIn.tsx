"use client";

import Link from "next/link";
import { Section } from "@/components/AccountShell";
import { useProductStatus } from "@/components/ProductStatusContext";
import { Skeleton } from "@/components/ui/nova/skeleton";

/**
 * The reader's own pages past their static shell (2026-11-08). The page's title and section headings paint at once
 * with skeleton rows; when /api/auth/me answers (ProductStatusProvider, once per load) the rows become the page, or
 * a link to sign in. No server render reads the session.
 */
export function SignedIn({ next, sections = [], children }: { next: string; sections?: string[]; children: React.ReactNode }) {
  const { email, checked } = useProductStatus();
  if (!checked)
    return sections.length ? (
      sections.map((title) => (
        <Section key={title} title={title}>
          <Skeleton className="h-11 w-full rounded-xl" />
        </Section>
      ))
    ) : (
      <div className="border-t border-[var(--paper-rule-soft)] pt-8">
        <Skeleton className="h-5 w-48" />
      </div>
    );
  if (email === null)
    return (
      <p className="m-0 border-t border-[var(--paper-rule-soft)] pt-8 text-[15px] text-[var(--paper-muted)]">
        <Link href={`/signin?next=${next}`} className="text-[var(--paper-strong)]">
          <span className="link-wipe">Sign in</span>
        </Link>{" "}
        to see this page.
      </p>
    );
  return <>{children}</>;
}
