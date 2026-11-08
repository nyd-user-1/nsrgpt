import { AccountShell, Section } from "@/components/AccountShell";
import { AppearanceForm } from "@/components/AccountForms";
import { SignedIn } from "@/components/SignedIn";

export default function Settings() {
  return (
    <AccountShell title="Settings">
      <SignedIn next="/settings" sections={["Appearance"]}>
        <Section title="Appearance">
          <AppearanceForm />
        </Section>
      </SignedIn>
    </AccountShell>
  );
}
