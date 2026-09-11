import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

// Phone + PIN auth (LOCKED). Session = signed JWT in an httpOnly cookie.

const COOKIE = "klixo_session";
const MAX_AGE = 60 * 60 * 12; // 12h

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return new TextEncoder().encode(s);
}

// Two identities share one session shape:
//   - staff (owner/teacher): teacherId is the Staff PK, studentId "".
//   - student/parent portal: role "student", studentId is the Student PK the
//     token is scoped to (the trust boundary — every portal read filters by it),
//     teacherId "". A student's phone OR their parent_phone can mint this token;
//     both land on the SAME studentId, so a parent only ever sees their child.
export interface Session {
  teacherId: string;
  studentId: string;
  role: "teacher" | "owner" | "student";
  name: string;
  /** PIN fingerprint (see pinVersion). Absent on tokens minted before this
   *  existed — those are treated as stale by the guards, so everyone signs in
   *  again once. That is the correct side effect of shipping a revocation fix. */
  pv?: string;
}

/**
 * Short fingerprint of a bcrypt hash, carried in the token so a PIN change can
 * invalidate sessions minted with the old one.
 *
 * Without it, resetting a PIN — the only remediation the UI offers, and the
 * obvious thing to do when a teacher leaves or a PIN is shared — left the old
 * holder's cookie valid for up to 12h. The owner believed access was revoked
 * and it was not.
 *
 * A prefix of the hash is enough: bcrypt hashes embed a per-row random salt, so
 * two rows with the same PIN still differ here. It is not a secret (it never
 * leaves the server except inside a signed token, and it is not reversible to
 * the PIN), and 16 chars keeps the cookie small.
 */
export function pinVersion(pinHash: string): string {
  return pinHash.slice(-16);
}

const asRole = (r: unknown): Session["role"] =>
  r === "owner" ? "owner" : r === "student" ? "student" : "teacher";

export async function createSession(s: Session): Promise<void> {
  const token = await new SignJWT({ ...s })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secret());
  const c = await cookies();
  c.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function getSession(): Promise<Session | null> {
  const c = await cookies();
  const token = c.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      teacherId: String(payload.teacherId ?? ""),
      studentId: String(payload.studentId ?? ""),
      role: asRole(payload.role),
      name: String(payload.name),
      pv: payload.pv === undefined ? undefined : String(payload.pv),
    };
  } catch {
    return null;
  }
}

export async function destroySession(): Promise<void> {
  const c = await cookies();
  c.delete(COOKIE);
}
