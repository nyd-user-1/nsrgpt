import { SignInForm } from "./SignInForm";

const SERIF = { fontFamily: "var(--font-display), Georgia, serif" } as const;

export default function SignIn() {
  return (
    <main className="flex min-h-dvh w-full items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="m-0 mb-8 text-center text-4xl font-normal" style={SERIF}>Sign in</h1>
        <SignInForm mode="signin" />
      </div>
    </main>
  );
}
