import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listBatches } from "@/lib/data";
import { createTestAction } from "@/lib/actions";
import { Banner, fieldClass } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

function errorText(e?: string) {
  if (e === "missing") return "Enter a title and pick a batch.";
  if (e === "pass") return "Pass % must be a whole number 0–100.";
  return null;
}

export default async function NewTestPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");
  const sp = await searchParams;
  const err = errorText(sp.error);
  const batches = (await listBatches()).filter((b) => b.active);

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <Link href="/manage/tests" className="text-sm font-medium text-muted-foreground hover:text-foreground">
        ← Tests
      </Link>
      <h2 className="mt-3 text-xl font-bold tracking-tight">New test</h2>
      <p className="mt-1 text-sm text-muted-foreground">Add MCQ questions after saving, then publish.</p>
      {err ? (
        <div className="mt-3">
          <Banner tone="danger">{err}</Banner>
        </div>
      ) : null}

      <form
        action={createTestAction}
        className="mt-4 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]"
      >
        <label className="block">
          <span className="text-sm font-medium">Title</span>
          <input
            name="title"
            placeholder="Class 10 Maths — Chapter 1 Quiz"
            className={fieldClass}
            aria-invalid={sp.error === "missing" || undefined}
          />
        </label>

        <label className="mt-3 block">
          <span className="text-sm font-medium">Batch</span>
          <select name="batchId" className={fieldClass} defaultValue="" aria-invalid={sp.error === "missing" || undefined}>
            <option value="" disabled>
              Select a batch…
            </option>
            {batches.map((b) => (
              <option key={b.batch_id} value={b.batch_id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium">Pass %</span>
            <input
              name="passPct"
              type="number"
              min={0}
              max={100}
              defaultValue={40}
              inputMode="numeric"
              className={fieldClass}
              aria-invalid={sp.error === "pass" || undefined}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">
              Time limit <span className="text-muted-foreground">(min)</span>
            </span>
            <input name="durationMin" type="number" min={0} defaultValue={0} inputMode="numeric" className={fieldClass} />
          </label>
        </div>

        <label className="mt-4 flex items-center gap-2.5">
          <input name="negativeMarking" type="checkbox" className="h-4 w-4 accent-[var(--brand)]" />
          <span className="text-sm font-medium">Negative marking</span>
        </label>
        <label className="mt-3 block">
          <span className="text-sm font-medium">
            Marks to cut per wrong answer <span className="text-muted-foreground">(if negative marking)</span>
          </span>
          <input name="marksToCut" type="number" min={0} defaultValue={0} inputMode="numeric" className={fieldClass} />
        </label>
        <p className="mt-2 text-xs text-muted-foreground">
          Timed tests are best-effort — not a proctored exam.
        </p>

        <div className="mt-4">
          <SubmitButton pendingText="Creating…">Create test</SubmitButton>
        </div>
      </form>
    </main>
  );
}
