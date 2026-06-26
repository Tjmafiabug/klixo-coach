import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getCourseDetail } from "@/lib/data";
import { saveChapter, deleteChapterAction } from "@/lib/actions";
import { Banner, fieldClass, textareaClass } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

function errorText(e?: string) {
  if (e === "missing") return "A chapter needs a title.";
  if (e === "url") return "The resource link must start with http:// or https://.";
  return null;
}

export default async function EditChapterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; chapterId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");

  const { id, chapterId } = await params;
  const [detail, sp] = await Promise.all([getCourseDetail(id), searchParams]);
  if (!detail) notFound();
  const chapter = detail.chapters.find((c) => c.chapter_id === chapterId);
  if (!chapter) notFound();
  const err = errorText(sp.error);

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <Link
        href={`/manage/curriculum/${id}`}
        className="text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        ← {detail.course.name}
      </Link>
      <h2 className="mt-3 text-xl font-bold tracking-tight">Edit chapter</h2>
      <p className="mt-1 text-sm text-muted-foreground tabular-nums">
        Chapter {chapter.order || "—"} · {chapter.chapter_id}
      </p>

      {err ? (
        <div className="mt-3">
          <Banner tone="danger">{err}</Banner>
        </div>
      ) : null}

      <form
        action={saveChapter}
        className="mt-4 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]"
      >
        <input type="hidden" name="courseId" value={id} />
        <input type="hidden" name="chapterId" value={chapter.chapter_id} />
        <label className="block">
          <span className="text-sm font-medium">Title</span>
          <input
            name="title"
            defaultValue={chapter.title}
            className={fieldClass}
            aria-invalid={sp.error === "missing" || undefined}
          />
        </label>
        <label className="mt-3 block">
          <span className="text-sm font-medium">
            Topics <span className="text-muted-foreground">(optional)</span>
          </span>
          <textarea
            name="topics"
            rows={3}
            defaultValue={chapter.topics}
            className={textareaClass}
          />
        </label>
        <label className="mt-3 block">
          <span className="text-sm font-medium">
            Resource link <span className="text-muted-foreground">(optional)</span>
          </span>
          <input
            name="resourceUrl"
            inputMode="url"
            defaultValue={chapter.resource_url}
            placeholder="https://ncert.nic.in/…"
            className={fieldClass}
            aria-invalid={sp.error === "url" || undefined}
          />
        </label>
        <p className="mt-2 text-xs text-muted-foreground">
          Reorder chapters from the course page.
        </p>
        <div className="mt-4">
          <SubmitButton>Save changes</SubmitButton>
        </div>
      </form>

      <form
        action={deleteChapterAction}
        className="mt-4 rounded-2xl border border-border bg-surface p-4"
      >
        <input type="hidden" name="courseId" value={id} />
        <input type="hidden" name="chapterId" value={chapter.chapter_id} />
        <p className="text-sm font-semibold text-foreground">Delete chapter</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Removes it permanently. Remaining chapters renumber automatically.
        </p>
        <SubmitButton
          pendingText="Deleting…"
          className="mt-2 inline-flex h-10 cursor-pointer items-center justify-center rounded-lg border border-danger/30 bg-danger-subtle px-4 text-sm font-semibold text-danger transition-colors hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Delete chapter
        </SubmitButton>
      </form>
    </main>
  );
}
