import { CognitoIdentityProviderClient, InitiateAuthCommand } from "@aws-sdk/client-cognito-identity-provider";
import { cookies } from "next/headers";

/**
 * The signed-in reader, from the Cognito ID token in the nysgpt_session
 * cookie, verified against the pool's signing keys (2026-10-07, ported from
 * Hermes). The pool is invite-only: accounts are created by hand, so a bot
 * can never sign itself up and wake a product's database.
 */

const POOL = process.env.NYSGPT_COGNITO_POOL_ID;
const CLIENT = process.env.NYSGPT_COGNITO_CLIENT_ID;

// The token check runs on Web Crypto (2026-11-05), so it works on the Cloudflare worker as well as Node.
// aws-jwt-verify's Node build (crypto.createVerify, setTimeout().unref()) failed on workerd, and the
// failure was swallowed: every signed-in reader came back signed out.
const ISSUER = POOL ? `https://cognito-idp.${POOL.split("_")[0]}.amazonaws.com/${POOL}` : "";
const RS256 = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } as const;

/** The pool's signing keys by kid. The resolved keys are kept, not the pending fetch: workerd won't let one
 *  request await a promise another request started. */
let signingKeys: Map<string, CryptoKey> | null = null;

async function loadSigningKeys(): Promise<Map<string, CryptoKey>> {
  const r = await fetch(`${ISSUER}/.well-known/jwks.json`);
  if (!r.ok) throw new Error(`jwks: ${r.status}`);
  const { keys } = (await r.json()) as { keys: (JsonWebKey & { kid: string })[] };
  return new Map(await Promise.all(keys.map(async (k) => [k.kid, await crypto.subtle.importKey("jwk", k, RS256, false, ["verify"])] as const)));
}

const b64url = (s: string) => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0));
};
const json = (s: string) => JSON.parse(new TextDecoder().decode(b64url(s))) as Record<string, unknown>;

/** The ID token's claims when its signature, issuer, audience, use and expiry all check out; otherwise null. */
async function verifyIdToken(token: string): Promise<Record<string, unknown> | null> {
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) return null;
  const header = json(h);
  if (header.alg !== "RS256" || typeof header.kid !== "string") return null;
  // A kid not yet seen means the pool rotated its keys: fetch them again, once.
  if (!signingKeys?.has(header.kid)) signingKeys = await loadSigningKeys();
  const key = signingKeys.get(header.kid);
  if (!key || !(await crypto.subtle.verify(RS256, key, b64url(s), new TextEncoder().encode(`${h}.${p}`)))) return null;
  const claims = json(p);
  const live = typeof claims.exp === "number" && claims.exp > Date.now() / 1000;
  return live && claims.iss === ISSUER && claims.aud === CLIENT && claims.token_use === "id" ? claims : null;
}

export const SESSION_COOKIE = "nysgpt_session";

/** admin / superAdmin / demo are what trinity's housekeeping routes read (ported 2026-11-04). nysgpt.com has no
 *  roles yet, so every reader is none of them — the same falsy value those routes already saw at runtime. */
export type SessionUser = { email: string; admin: boolean; superAdmin: boolean; demo: boolean };

/** Demo accounts don't exist here; the housekeeping routes (ported from pax-trinity) call this guard. */
export function forbidDemo(_user: unknown) {}

export async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !POOL || !CLIENT) return null;
  try {
    const claims = await verifyIdToken(token);
    return claims ? { email: String(claims.email ?? "").toLowerCase(), admin: false, superAdmin: false, demo: false } : null;
  } catch (e) {
    console.error("auth: token check failed", (e as Error).message);
    return null;
  }
}

export const cognito = new CognitoIdentityProviderClient({ region: "us-east-1" });
export const POOL_ID = POOL;

/**
 * Signs in with email and password and sets the session cookie. Throws
 * Cognito's own error (its `name` says why) when the pair is refused.
 */
export async function signIn(email: string, password: string): Promise<void> {
  if (!CLIENT) throw Object.assign(new Error("Sign-in isn't configured here."), { name: "NotConfigured" });
  const r = await cognito.send(new InitiateAuthCommand({ ClientId: CLIENT, AuthFlow: "USER_PASSWORD_AUTH", AuthParameters: { USERNAME: email.trim().toLowerCase(), PASSWORD: password } }));
  const t = r.AuthenticationResult;
  if (!t?.IdToken) throw Object.assign(new Error("This account needs a step the form doesn't support."), { name: "ChallengeRequired" });
  (await cookies()).set(SESSION_COOKIE, t.IdToken, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: t.ExpiresIn ?? 3600, path: "/" });
}
