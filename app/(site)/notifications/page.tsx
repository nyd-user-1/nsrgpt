import { AccountShell } from "@/components/AccountShell";
import { SignedIn } from "@/components/SignedIn";

/** Nothing on the site sends notifications yet; the page says so. */
export default function Notifications() {
  return (
    <AccountShell title="Notifications">
      <SignedIn next="/notifications">
        <p className="m-0 border-t border-[var(--paper-rule-soft)] pt-8 text-[15px] text-[var(--paper-muted)]">No notifications yet.</p>
      </SignedIn>
    </AccountShell>
  );
}
