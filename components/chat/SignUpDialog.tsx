"use client"

import * as React from "react"
import { AnimatePresence, motion } from "motion/react"
import { ArrowRight, MailCheck, X } from "lucide-react"
import { EASE_OUT } from "@/lib/ease"

// The chat's sign-up dialog (Brendan, 2026-11-10): a signed-out reader's question gets my sign-up message
// (hooks/useChat.ts SIGN_UP_TEXT), and 2.5 s after it lands, or on its link, this opens: email and password, then the
// six-digit code Cognito emails, then signed in, and the kept question goes again. The flow is the sign-in page's
// (app/(bare)/signin/SignInForm.tsx) on the same API (/api/auth/signup, confirm, resend, signin). A reader who already
// has an account signs in here instead. Dismissible: the message and its link stay.
// Forgot password (2026-11-19, from the sign-in page): the email, then the emailed code and a new password, then signed in.

const SANS = { fontFamily: 'var(--font-sans, "DM Sans"), sans-serif' } as const
const SERIF = { fontFamily: "var(--font-display), Georgia, serif" } as const
const FIELD = "w-full rounded-xl border border-[var(--paper-rule)]/25 bg-[var(--paper)] px-4 py-3 text-[15px] text-[var(--paper-text)] outline-none placeholder:text-[var(--paper-faint)] focus:border-[var(--paper-text)]"
const BUTTON = "flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--paper-text)] text-[15px] font-medium text-[var(--paper)] transition-opacity hover:opacity-90 disabled:opacity-60"
const QUIET = "text-sm text-[var(--paper-muted)] transition-colors hover:text-[var(--paper-text)]"

const post = async (action: string, body: object) => {
  const r = await fetch(`/api/auth/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; confirm?: boolean; newPassword?: boolean }
  return { status: r.status, ...j }
}

export function SignUpDialog({ open, onClose, onSignedIn }: { open: boolean; onClose: () => void; onSignedIn: () => void }) {
  const [mode, setMode] = React.useState<"signup" | "signin">("signup")
  const [step, setStep] = React.useState<"form" | "code" | "forgot" | "reset">("form")
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [code, setCode] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  const signin = async () => {
    const r = await post("signin", { email, password })
    if (r.status === 409) {
      await post("resend", { email })
      setNotice(`Confirm the email first. A new code is on its way to ${email}.`)
      setStep("code")
    } else if (r.ok) onSignedIn()
    else if (r.newPassword) setError("This account needs a new password: sign in from the sign-in page.")
    else setError(r.error ?? "Something went wrong. Try again.")
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      if (step === "forgot") {
        const r = await post("forgot", { email })
        if (r.ok) {
          setCode("")
          setPassword("")
          setStep("reset")
        } else setError(r.error ?? "Something went wrong. Try again.")
      } else if (step === "reset") {
        const r = await post("reset", { email, code, password })
        if (r.ok) await signin()
        else setError(r.error ?? "Something went wrong. Try again.")
      } else if (step === "code") {
        const r = await post("confirm", { email, code })
        if (r.ok) await signin()
        else setError(r.error ?? "Something went wrong. Try again.")
      } else if (mode === "signup") {
        const r = await post("signup", { email, password })
        if (r.ok) setStep("code")
        else setError(r.error ?? "Something went wrong. Try again.")
      } else await signin()
    } finally {
      setBusy(false)
    }
  }

  const title = step === "forgot" || step === "reset" ? "Reset your password" : mode === "signup" ? "Create an account" : "Sign in"
  const back = () => {
    setStep("form")
    setMode("signin")
    setError(null)
    setNotice(null)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="signup"
          className="nysgpt-app fixed inset-0 z-[80] flex items-center justify-center bg-black/30 px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: EASE_OUT }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="relative w-full max-w-sm rounded-2xl border border-[var(--paper-rule)] bg-[var(--paper)] p-6 text-[var(--paper-text)] shadow-[0_8px_40px_rgba(0,0,0,0.25)]"
            style={SANS}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
          >
            <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 text-[var(--paper-faint)] transition-colors hover:text-[var(--paper-text)]">
              <X className="h-4 w-4" />
            </button>
            <p className="m-0 mb-5 text-[26px] leading-tight" style={SERIF}>
              {title}
            </p>
            <form onSubmit={submit} className="flex flex-col gap-4">
              {step === "forgot" ? (
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Email
                  <input type="email" required autoFocus autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={FIELD} />
                </label>
              ) : step === "reset" ? (
                <>
                  <p className="m-0 flex items-start gap-2.5 rounded-xl bg-[var(--paper-quiet)] px-4 py-3 text-sm leading-relaxed">
                    <MailCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {notice ?? `If ${email} has an account, a six-digit code is on its way to it.`}
                  </p>
                  <label className="flex flex-col gap-1.5 text-sm font-medium">
                    Code
                    <input autoFocus inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} className={`${FIELD} tabular-nums tracking-[0.3em]`} />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm font-medium">
                    New password
                    <input type="password" required minLength={10} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={FIELD} />
                    <span className="text-xs font-normal text-[var(--paper-muted)]">At least 10 characters, with a lowercase letter and a number.</span>
                  </label>
                </>
              ) : step === "code" ? (
                <>
                  <p className="m-0 flex items-start gap-2.5 rounded-xl bg-[var(--paper-quiet)] px-4 py-3 text-sm leading-relaxed">
                    <MailCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {notice ?? `A six-digit code is on its way to ${email}.`}
                  </p>
                  <label className="flex flex-col gap-1.5 text-sm font-medium">
                    Code
                    <input autoFocus inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} className={`${FIELD} tabular-nums tracking-[0.3em]`} />
                  </label>
                </>
              ) : (
                <>
                  <label className="flex flex-col gap-1.5 text-sm font-medium">
                    Email
                    <input type="email" required autoFocus autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={FIELD} />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm font-medium">
                    Password
                    <input type="password" required minLength={mode === "signup" ? 10 : undefined} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} className={FIELD} />
                    {mode === "signup" && <span className="text-xs font-normal text-[var(--paper-muted)]">At least 10 characters, with a lowercase letter and a number.</span>}
                  </label>
                  {mode === "signin" && (
                    <button
                      type="button"
                      onClick={() => {
                        setStep("forgot")
                        setError(null)
                        setNotice(null)
                      }}
                      className={`-mt-2 self-end ${QUIET}`}
                    >
                      Forgot password?
                    </button>
                  )}
                </>
              )}
              {error && <p className="m-0 text-sm font-medium text-[var(--pax2-red)]">{error}</p>}
              <button
                type="submit"
                disabled={busy || (step === "forgot" ? !email : step === "reset" ? code.trim().length < 6 || !password : step === "code" ? code.trim().length < 6 : !email || !password)}
                className={BUTTON}
              >
                {busy ? "One moment…" : step === "forgot" ? "Send a reset code" : step === "reset" ? "Set password and ask" : step === "code" ? "Confirm and ask" : mode === "signup" ? "Create the account" : "Sign in and ask"} <ArrowRight className="size-4" aria-hidden />
              </button>
              {step === "forgot" || step === "reset" ? (
                <>
                  {step === "reset" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        await post("forgot", { email })
                        setNotice(`A new code is on its way to ${email}.`)
                      }}
                      className={QUIET}
                    >
                      Send a new code
                    </button>
                  )}
                  <button type="button" disabled={busy} onClick={back} className={QUIET}>
                    Back to sign in
                  </button>
                </>
              ) : step === "code" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    await post("resend", { email })
                    setNotice(`A new code is on its way to ${email}.`)
                  }}
                  className={QUIET}
                >
                  Send a new code
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setMode((m) => (m === "signup" ? "signin" : "signup"))
                    setError(null)
                  }}
                  className={QUIET}
                >
                  {mode === "signup" ? "I have an account" : "Create an account instead"}
                </button>
              )}
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
