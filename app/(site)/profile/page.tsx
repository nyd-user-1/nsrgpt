import { AccountShell } from "@/components/AccountShell";
import { ProfileSections } from "@/components/AccountForms";
import { SignedIn } from "@/components/SignedIn";

export default function Profile() {
  return (
    <AccountShell title="Profile">
      <SignedIn next="/profile" sections={["Name", "Email"]}>
        <ProfileSections />
      </SignedIn>
    </AccountShell>
  );
}
