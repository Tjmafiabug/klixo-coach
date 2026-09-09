import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * DEMO_MODE gates things that are fine on a demo deployment and harmful on a
 * real centre's. Both must fail *closed*: absent env var ⇒ disabled, so
 * deploying for a real centre is safe by default rather than by remembering.
 *
 * Asserted on source text because the alternative is booting a Next request
 * context; the property that matters — "the check exists and is === '1'" — is
 * visible statically, and this fails loudly if someone inverts or drops it.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("DEMO_MODE gates", () => {
  it("mockPayFeesAction refuses to run outside demo mode", () => {
    const src = read("src/lib/actions.ts");
    const fn = src.slice(src.indexOf("export async function mockPayFeesAction"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body, "the mock payment must be gated").toMatch(/DEMO_MODE !== "1"/);
    // the gate has to precede the write, or it gates nothing
    expect(
      body.indexOf("DEMO_MODE"),
      "gate must come before recordPayment",
    ).toBeLessThan(body.indexOf("recordPayment"));
  });

  it("the landing page only shows the demo PIN in demo mode", () => {
    const src = read("src/app/page.tsx");
    if (!/Demo PIN/.test(src)) return; // removed entirely — also fine
    expect(src).toMatch(/DEMO_MODE === "1"/);
  });

  it("the portal only offers the mock pay button in demo mode", () => {
    const src = read("src/app/(portal)/portal/fees/page.tsx");
    expect(src).toMatch(/DEMO_MODE === "1"/);
  });

  it("the login page only shows the credentials hint in demo mode", () => {
    // The worst of the three: it published a working owner phone AND PIN on the
    // sign-in form itself. Client component, so it needs the NEXT_PUBLIC_ copy.
    const src = read("src/app/login/page.tsx");
    if (!/Demo — phone/.test(src)) return; // removed entirely — also fine
    expect(src).toMatch(/NEXT_PUBLIC_DEMO_MODE === "1"/);
  });

  it("does not put a real login phone in the input placeholder", () => {
    const src = read("src/app/login/page.tsx");
    const placeholder = src.match(/placeholder="([^"]*)"/)?.[1] ?? "";
    expect(placeholder, "a seeded phone number here is a credentials hint too").not.toMatch(/^\d{6,}$/);
  });

  it("never claims a real payment was taken", () => {
    // The old copy read "Secure online payment · UPI, card & netbanking" next
    // to a button that takes no money — a parent would reasonably believe they
    // had paid.
    const src = read("src/app/(portal)/portal/fees/page.tsx");
    expect(src).not.toMatch(/Secure online payment/);
  });
});
