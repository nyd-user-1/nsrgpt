import { AccountShell, Section } from "@/components/AccountShell";
import { DeleteForm, PasswordForm } from "@/components/AccountForms";
import { SignedIn } from "@/components/SignedIn";

export default function Account() {
  return (
    <AccountShell title="Account">
      <SignedIn next="/account" sections={["Password", "Delete account"]}>
        <Section title="Password">
          <PasswordForm />
        </Section>
        <Section title="Delete account">
          <DeleteForm />
        </Section>
      </SignedIn>
    </AccountShell>
  );
}
