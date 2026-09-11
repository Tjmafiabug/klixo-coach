import { readFileSync } from "node:fs";
import { join } from "node:path";
import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import { pinVersion } from "./auth";

/**
 * Sessions carry a fingerprint of the PIN hash so that changing a PIN cuts off
 * sessions minted with the old one.
 *
 * Without it, resetting a PIN — the only remediation the UI offers when a
 * teacher leaves or a PIN is shared — left the old holder's cookie valid for up
 * to 12h while the owner believed access was revoked.
 */

const SRC_ACTIONS = readFileSync(join(process.cwd(), "src/lib/actions.ts"), "utf8");
const SRC_PORTAL = readFileSync(join(process.cwd(), "src/lib/portal.ts"), "utf8");

describe("pinVersion", () => {
  it("changes when the PIN changes", () => {
    const before = bcrypt.hashSync("1234", 10);
    const after = bcrypt.hashSync("9999", 10);
    expect(pinVersion(before)).not.toBe(pinVersion(after));
  });

  it("differs for two accounts that share the same PIN", () => {
    // bcrypt salts per hash, so a shared PIN still yields distinct
    // fingerprints. One student's token must never validate against another's
    // row, even during the window where a centre has not yet rotated PINs.
    const a = bcrypt.hashSync("1234", 10);
    const b = bcrypt.hashSync("1234", 10);
    expect(a).not.toBe(b);
    expect(pinVersion(a)).not.toBe(pinVersion(b));
  });

  it("is stable for an unchanged hash", () => {
    // Every guarded request recomputes this; an unstable value would sign
    // everyone out on the next click.
    const h = bcrypt.hashSync("4321", 10);
    expect(pinVersion(h)).toBe(pinVersion(h));
  });

  it("does not leak the whole hash into the token", () => {
    const h = bcrypt.hashSync("1234", 10);
    expect(pinVersion(h).length).toBeLessThan(h.length);
    expect(h).not.toBe(pinVersion(h));
  });

  it("does not throw on an empty hash", () => {
    // A student row with no portal login has pin_hash "". requireStudent
    // compares against it before deciding, so it must not blow up.
    expect(() => pinVersion("")).not.toThrow();
  });
});

describe("the guards actually check it", () => {
  it("requireOwner compares pv against the live row", () => {
    const fn = SRC_ACTIONS.slice(SRC_ACTIONS.indexOf("async function requireOwner"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body, "requireOwner must reject a stale pv").toMatch(/user\.pv !== pinVersion/);
  });

  it("requireStaff compares pv against the live row", () => {
    const fn = SRC_ACTIONS.slice(SRC_ACTIONS.indexOf("async function requireStaff"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body, "requireStaff must reject a stale pv").toMatch(/user\.pv !== pinVersion/);
  });

  it("requireStudent compares pv against the live row", () => {
    // The portal guard was the asymmetric one: staff actions re-read the Staff
    // row, the student path did not re-read anything.
    expect(SRC_PORTAL, "requireStudent must reject a stale pv").toMatch(/pv !== pinVersion/);
  });

  it("login stamps pv for both staff and students", () => {
    const fn = SRC_ACTIONS.slice(SRC_ACTIONS.indexOf("export async function login"));
    const body = fn.slice(0, fn.indexOf("\nexport async function logout"));
    const stamps = [...body.matchAll(/pv: pinVersion\(/g)];
    expect(stamps.length, "both createSession calls in login must stamp pv").toBe(2);
  });

  it("the portal PIN change re-mints the session", () => {
    // Otherwise changing your PIN signs you straight out, because the guards
    // now reject the token you are holding.
    const fn = SRC_ACTIONS.slice(SRC_ACTIONS.indexOf("export async function changePortalPinAction"));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    expect(body, "must re-issue the session after a successful change").toMatch(/createSession\(/);
    expect(body, "must verify the current PIN first").toMatch(/bcrypt\.compare\(current/);
    expect(body, "must rate-limit before verifying").toMatch(
      /lockRemainingMs[\s\S]*bcrypt\.compare\(current/,
    );
  });
});

describe("seed scripts do not mint one shared PIN", () => {
  it("the student seed issues a unique PIN per row", () => {
    const src = readFileSync(join(process.cwd(), "scripts/seed-student-pins.mjs"), "utf8");
    // The bug: one hashSync hoisted out of the map, reused for every student.
    expect(src, "must hash per row, not once for everyone").toMatch(
      /body\.map\([\s\S]*bcrypt\.hashSync/,
    );
    expect(src, "PINs must be cryptographically random").toMatch(/randomInt/);
  });

  it("both seed scripts refuse to run against production", () => {
    const student = readFileSync(join(process.cwd(), "scripts/seed-student-pins.mjs"), "utf8");
    const staff = readFileSync(join(process.cwd(), "scripts/seed-pins.mjs"), "utf8");
    expect(student).toMatch(/PROD_SHEET_ID/);
    expect(staff).toMatch(/PROD_SHEET_ID/);
  });
});
