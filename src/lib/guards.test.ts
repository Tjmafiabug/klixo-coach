import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard conformance — a lint rule wearing a test costume.
 *
 * actions.ts carries "use server" at file scope, so EVERY export in it is an
 * independently POST-able HTTP endpoint. Layouts and page-level role checks do
 * not run for a server-action POST, so the guard inside the action is the only
 * thing standing between a student's valid session cookie and an owner-only
 * write.
 *
 * Nothing in the type system enforces that. This test does: add action #51 and
 * forget its guard, and CI fails the same day instead of in an incident.
 */

const SRC = readFileSync(join(process.cwd(), "src/lib/actions.ts"), "utf8");

/** Actions that legitimately have no session guard, with the reason each is safe. */
const UNGUARDED_BY_DESIGN: Record<string, string> = {
  login: "the auth entry point — it has no session to check yet",
  logout: "destroys the cookie; safe to call with or without a session",
};

const GUARD = /requireOwner\(\)|requireStaff\(\)|requireStudent\(\)|getSession\(\)/;

/** Every `export async function <name>(` in the file, with its body. */
function actions(): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = [];
  const re = /^export async function (\w+)\s*\(/gm;
  for (let m = re.exec(SRC); m; m = re.exec(SRC)) {
    const start = m.index;
    const next = new RegExp(`^export async function `, "gm");
    next.lastIndex = re.lastIndex;
    const after = next.exec(SRC);
    out.push({ name: m[1], body: SRC.slice(start, after ? after.index : SRC.length) });
  }
  return out;
}

describe("server action guards", () => {
  const all = actions();

  it("finds the actions (guards against this test silently scanning nothing)", () => {
    // If a refactor moves/renames actions.ts, the regex could match zero
    // functions and every assertion below would vacuously pass. Pin a floor.
    expect(all.length).toBeGreaterThan(40);
  });

  it.each(all.map((a) => a.name))("%s checks the session before it acts", (name) => {
    const action = all.find((a) => a.name === name)!;
    if (name in UNGUARDED_BY_DESIGN) {
      expect(GUARD.test(action.body), `${name} is allowlisted but now has a guard — remove it from UNGUARDED_BY_DESIGN`).toBe(false);
      return;
    }
    expect(
      GUARD.test(action.body),
      `${name} has no session/role guard. Every export here is a public POST endpoint — ` +
        `call requireOwner() / requireStaff() / requireStudent() as its first statement.`,
    ).toBe(true);
  });

  it("routes owner checks through requireOwner(), never a hand-rolled copy", () => {
    // The drift vector: before consolidation, 4 actions inlined the same three
    // lines that requireOwner() already encapsulated, and a copy-paste of the
    // wrong neighbour is how a guard loses a line.
    //
    // Match the *shape* of the hand-rolled guard — a bare role comparison that
    // redirects — not every mention of "owner". Business rules that happen to
    // read the role are legitimate and must not trip this:
    //   - `user.role !== "owner" && !ownsSession(...)`  (owner marks all sessions)
    //   - `cur?.role === "owner" && ... otherActiveOwners(id) === 0` (last-owner lockout)
    const HAND_ROLLED = /^if \(\s*(?:!)?\w+(?:\?)?\.role !== "owner"\s*\)\s*redirect/;
    const offenders = SRC.split("\n")
      .map((line, i) => ({ line: line.trim(), no: i + 1 }))
      .filter(({ line }) => HAND_ROLLED.test(line))
      .filter(({ no }) => {
        // the one legitimate occurrence is inside requireOwner itself
        const ctx = SRC.split("\n").slice(Math.max(0, no - 12), no).join("\n");
        return !/async function requireOwner|async function requireStaff/.test(ctx);
      });
    expect(
      offenders,
      `hand-rolled owner check(s) at line(s) ${offenders.map((o) => o.no).join(", ")} — use requireOwner()`,
    ).toEqual([]);
  });

  it("requireOwner re-reads the Staff row so a demoted owner loses access at once", () => {
    // role lives in a 12h JWT claim. Without re-reading, deactivating or
    // demoting someone in the Sheet leaves their existing token owner-valid
    // until it expires.
    const body = SRC.slice(SRC.indexOf("async function requireOwner"));
    const fn = body.slice(0, body.indexOf("\n}"));
    expect(fn).toMatch(/getStaff\(/);
    expect(fn).toMatch(/active !== "TRUE"/);
    expect(fn).toMatch(/role !== "owner"/);
  });
});
