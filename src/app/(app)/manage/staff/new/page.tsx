import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { saveStaff } from "@/lib/actions";
import { Banner, fieldClass } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

function errorText(e?: string) {
  if (e === "missing") return "Enter a name (and a valid phone if you give one).";
  if (e === "phone") return "That phone number is already used by someone else.";
  if (e === "pin") return "PIN must be 4–6 digits.";
  return null;
}

export default async function NewStaffPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; type?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");
  const sp = await searchParams;
  const err = errorText(sp.error);
  const teaching = sp.type !== "non_teaching"; // default: teaching
  const staff_type = teaching ? "teaching" : "non_teaching";

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <Link
        href="/manage/staff"
        className="text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        ← Staff
      </Link>
      <h2 className="mt-3 text-xl font-bold tracking-tight">Add staff</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {teaching
          ? "Teaching staff sign in with phone + PIN."
          : "Non-teaching staff are profile records — they don’t sign in."}
      </p>

      {/* type toggle (links — keeps this a server component) */}
      <div className="mt-3 flex gap-2">
        <Link
          href="/manage/staff/new?type=teaching"
          className={`flex-1 rounded-lg border px-3 py-2 text-center text-sm font-semibold transition-colors ${
            teaching
              ? "border-brand/30 bg-brand/10 text-brand"
              : "border-border bg-surface text-muted-foreground hover:bg-muted"
          }`}
        >
          Teaching
        </Link>
        <Link
          href="/manage/staff/new?type=non_teaching"
          className={`flex-1 rounded-lg border px-3 py-2 text-center text-sm font-semibold transition-colors ${
            !teaching
              ? "border-brand/30 bg-brand/10 text-brand"
              : "border-border bg-surface text-muted-foreground hover:bg-muted"
          }`}
        >
          Non-teaching
        </Link>
      </div>

      {err ? (
        <div className="mt-3">
          <Banner tone="danger">{err}</Banner>
        </div>
      ) : null}

      <form
        action={saveStaff}
        className="mt-4 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]"
      >
        <input type="hidden" name="staff_type" value={staff_type} />

        <label className="block">
          <span className="text-sm font-medium">Name</span>
          <input name="name" className={fieldClass} aria-invalid={sp.error === "missing" || undefined} />
        </label>

        <label className="mt-3 block">
          <span className="text-sm font-medium">
            Phone {!teaching ? <span className="text-muted-foreground">(optional)</span> : null}
          </span>
          <input
            name="phone"
            inputMode="numeric"
            placeholder="9876500000"
            className={fieldClass}
            aria-invalid={sp.error === "missing" || sp.error === "phone" || undefined}
          />
        </label>

        {teaching ? (
          <>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-medium">Role</span>
                <select name="role" defaultValue="teacher" className={`${fieldClass} cursor-pointer`}>
                  <option value="teacher">Teacher</option>
                  <option value="owner">Owner</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium">PIN (4–6 digits)</span>
                <input
                  name="pin"
                  inputMode="numeric"
                  placeholder="1234"
                  className={fieldClass}
                  aria-invalid={sp.error === "pin" || undefined}
                />
              </label>
            </div>
            <label className="mt-3 block">
              <span className="text-sm font-medium">
                Subjects <span className="text-muted-foreground">(optional)</span>
              </span>
              <input name="subjects" placeholder="Mathematics, Physics" className={fieldClass} />
            </label>
          </>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium">Designation</span>
              <input name="designation" placeholder="Receptionist" className={fieldClass} />
            </label>
            <label className="block">
              <span className="text-sm font-medium">
                Department <span className="text-muted-foreground">(optional)</span>
              </span>
              <input name="department" placeholder="Front Office" className={fieldClass} />
            </label>
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium">
              Joined <span className="text-muted-foreground">(optional)</span>
            </span>
            <input name="join_date" type="date" className={fieldClass} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">
              Monthly salary <span className="text-muted-foreground">(optional)</span>
            </span>
            <input name="monthly_salary" inputMode="numeric" placeholder="20000" className={fieldClass} />
          </label>
        </div>

        <label className="mt-3 block">
          <span className="text-sm font-medium">
            Notes <span className="text-muted-foreground">(optional)</span>
          </span>
          <textarea name="notes" rows={2} className={fieldClass} />
        </label>

        <div className="mt-4">
          <SubmitButton pendingText="Adding…">Add staff</SubmitButton>
        </div>
      </form>
    </main>
  );
}
