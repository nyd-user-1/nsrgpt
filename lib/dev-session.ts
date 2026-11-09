// The dev box's signed-in reader (brief 33, Part 3). On the box there is no Cognito session, so /api/chat answered 402
// and recipes ran without model output. With NEXT_PUBLIC_DEV_SIGNED_IN=1 in the dev server's environment (set only in
// scripts/devbox/userdata.sh's nsrgpt-dev service) every request reads as this fixed reader: chat answers, saves carry
// the name. Off in every production build whatever the variable says: Next.js writes NODE_ENV ("production" under
// `next build`) and NEXT_PUBLIC_ values into the code at build time, so there the test is the constant false and the
// branch is dropped from the bundle. A missing, empty or other value leaves it off too.

export const DEV_SIGNED_IN = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEV_SIGNED_IN === "1"

export const DEV_USER = { id: "dev-user", name: "Dev", email: "dev@nsrgpt.local" } as const
