import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getCourseDetail } from "@/lib/data";
import { saveChapter, moveChapterAction } from "@/lib/actions";
import { PageHeader, SearchBox } from "@/components/page";
import { Banner, fieldClass, textareaClass, ActiveChip } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { Reveal } from "@/components/motion";

export const dynamic = "force-dynamic";

function errorText(e?: string) {
  if (e === "missing") return "A chapter needs a title.";
  if (e === "url") return "The resource link must start with http:// or https://.";
  return null;
}

export default async function CourseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string; deleted?: string; q?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");

  const { id } = await params;
  const [detail, sp] = await Promise.all([getCourseDetail(id), searchParams]);
  if (!detail) notFound();
  const { course, chapters } = detail;
  const active = course.active === "TRUE";
  const err = errorText(sp.error);

  const q = (sp.q ?? "").trim();
  const ql = q.toLowerCase();
  const searching = q.length > 0;
  // reorder is meaningless on a filtered view, so it's hidden while searching.
  const shown = searching
    ? chapters.filter(
        (ch) => ch.title.toLowerCase().includes(ql) || ch.topics.toLowerCase().includes(ql),
      )
    : chapters;

  // small icon-button style for the per-chapter move/delete controls
  const iconBtn =
    "grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        backHref="/manage/curriculum"
        backLabel="Curriculum"
        title={course.name}
        subtitle={`${course.subject} · ${course.level} · ${chapters.length} chapter${
          chapters.length === 1 ? "" : "s"
        }`}
        actions={
          chapters.length > 0 ? (
            <SearchBox action={`/manage/curriculum/${id}`} placeholder="Search chapters…" defaultValue={q} />
          ) : undefined
        }
      />

      <div className="mt-3 flex items-center gap-3">
        {!active ? <ActiveChip active={active} /> : null}
        <Link
          href={`/manage/curriculum/${id}/edit`}
          className="text-sm font-semibold text-brand hover:underline"
        >
          Edit course
        </Link>
      </div>

      <div className="mt-4 space-y-3">
        {err ? <Banner tone="danger">{err}</Banner> : null}
        {sp.saved ? <Banner tone="success">Saved.</Banner> : null}
        {sp.deleted ? <Banner tone="success">Chapter deleted.</Banner> : null}
      </div>

      {course.description ? (
        <Reveal>
          <p className="mt-4 rounded-2xl border border-border bg-surface p-4 text-sm text-muted-foreground">
            {course.description}
          </p>
        </Reveal>
      ) : null}

      {chapters.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-border bg-surface p-6 text-sm text-muted-foreground">
          No chapters yet. Add the first one below.
        </p>
      ) : shown.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-border bg-surface p-6 text-sm text-muted-foreground">
          No chapters match “{q}”.
        </p>
      ) : (
        <ol className="mt-6 space-y-3">
          {shown.map((ch, i) => (
            <Reveal key={ch.chapter_id} delay={Math.min(i * 0.03, 0.3)}>
              <li className="rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
                <div className="flex items-start gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-subtle text-xs font-semibold text-brand tabular-nums">
                    {ch.order || i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground">{ch.title}</p>
                    {ch.topics ? (
                      <p className="mt-1 text-sm text-muted-foreground">{ch.topics}</p>
                    ) : null}
                    {ch.resource_url ? (
                      <a
                        href={ch.resource_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
                      >
                        Resource ↗
                      </a>
                    ) : null}
                  </div>

                  {/* reorder + edit controls — reorder hidden while searching */}
                  <div className="flex shrink-0 items-center gap-1.5">
                    {!searching ? (
                      <>
                        <form action={moveChapterAction}>
                          <input type="hidden" name="courseId" value={course.course_id} />
                          <input type="hidden" name="chapterId" value={ch.chapter_id} />
                          <input type="hidden" name="dir" value="up" />
                          <SubmitButton
                            className={iconBtn}
                            disabled={i === 0}
                            ariaLabel="Move up"
                            pendingText="·"
                          >
                            ↑
                          </SubmitButton>
                        </form>
                        <form action={moveChapterAction}>
                          <input type="hidden" name="courseId" value={course.course_id} />
                          <input type="hidden" name="chapterId" value={ch.chapter_id} />
                          <input type="hidden" name="dir" value="down" />
                          <SubmitButton
                            className={iconBtn}
                            disabled={i === chapters.length - 1}
                            ariaLabel="Move down"
                            pendingText="·"
                          >
                            ↓
                          </SubmitButton>
                        </form>
                      </>
                    ) : null}
                    <Link
                      href={`/manage/curriculum/${id}/chapters/${ch.chapter_id}`}
                      className={iconBtn}
                      aria-label="Edit chapter"
                    >
                      ✎
                    </Link>
                  </div>
                </div>
              </li>
            </Reveal>
          ))}
        </ol>
      )}

      {/* Add chapter */}
      <form
        action={saveChapter}
        className="mt-5 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]"
      >
        <p className="text-sm font-semibold text-foreground">Add chapter</p>
        <input type="hidden" name="courseId" value={course.course_id} />
        <label className="mt-3 block">
          <span className="text-sm font-medium">Title</span>
          <input
            name="title"
            placeholder="Real Numbers"
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
            rows={2}
            placeholder="Euclid's division lemma, fundamental theorem of arithmetic…"
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
            placeholder="https://ncert.nic.in/…"
            className={fieldClass}
            aria-invalid={sp.error === "url" || undefined}
          />
        </label>
        <div className="mt-4">
          <SubmitButton pendingText="Adding…">+ Add chapter</SubmitButton>
        </div>
      </form>
    </div>
  );
}
