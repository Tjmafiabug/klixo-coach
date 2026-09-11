import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listStaff } from "@/lib/data";
import { paginate } from "@/lib/format";
import { Avatar, RoleChip, ActiveChip, Banner } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { PageHeader, PrimaryLink, SecondaryLink, RowChevron, SearchBox, Pager, FilterTabs } from "@/components/page";

export const dynamic = "force-dynamic";

type Filter = "all" | "teaching" | "non_teaching" | "inactive";


export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; q?: string; page?: string; type?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/today");
  const [staff, sp] = await Promise.all([listStaff(), searchParams]);

  const type: Filter =
    sp.type === "teaching" || sp.type === "non_teaching" || sp.type === "inactive"
      ? sp.type
      : "all";
  const q = (sp.q ?? "").trim();
  const ql = q.toLowerCase();

  const byType =
    type === "all" ? staff
    : type === "inactive" ? staff.filter((s) => !s.active)
    : staff.filter((s) => s.staff_type === type && s.active);
  const matches = q
    ? byType.filter(
        (s) =>
          s.name.toLowerCase().includes(ql) ||
          s.subjects.toLowerCase().includes(ql) ||
          s.designation.toLowerCase().includes(ql) ||
          s.department.toLowerCase().includes(ql) ||
          s.batchNames.some((n) => n.toLowerCase().includes(ql)),
      )
    : byType;
  const { slice, page, pages, total, start, size } = paginate(matches, Number(sp.page));

  const baseParams = { q: q || undefined, type: type === "all" ? undefined : type };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        backHref="/manage"
        backLabel="Manage"
        title="Staff"
        subtitle={`${staff.length} people`}
        actions={
          <>
            <SearchBox action="/manage/staff" placeholder="Search staff…" defaultValue={q} />
            <SecondaryLink href="/manage/staff/attendance">Attendance</SecondaryLink>
            <SecondaryLink href="/manage/staff/tasks">Tasks</SecondaryLink>
            <SecondaryLink href="/manage/staff/payroll">Payroll</SecondaryLink>
            <PrimaryLink href="/manage/staff/new">+ Add staff</PrimaryLink>
          </>
        }
      />

      {sp.saved ? (
        <div className="mt-4">
          <Banner tone="success">Staff saved.</Banner>
        </div>
      ) : null}

      <FilterTabs
        filters={[
          { label: "All", count: staff.length },
          { key: "teaching", label: "Teaching", count: staff.filter((s) => s.staff_type === "teaching" && s.active).length },
          { key: "non_teaching", label: "Non-teaching", count: staff.filter((s) => s.staff_type === "non_teaching" && s.active).length },
          { key: "inactive", label: "Inactive", count: staff.filter((s) => !s.active).length },
        ]}
        active={type === "all" ? undefined : type}
        baseHref="/manage/staff"
        params={{ q: q || undefined }}
        paramName="type"
      />

      {total === 0 ? (
        <div className="mt-6 grid h-[160px] place-items-center rounded-2xl border border-dashed border-border bg-surface-2">
          <p className="px-4 text-center text-sm text-muted-foreground">
            {q ? `No staff match “${q}”.` : "No staff here yet."}
          </p>
        </div>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {slice.map((s, i) => (
            <Reveal key={s.teacher_id} delay={Math.min(i * 0.03, 0.3)} className="h-full">
              <li className="h-full">
                <Link
                  href={`/manage/staff/${s.teacher_id}`}
                  className="group flex h-full items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)] transition-all hover:border-brand/30 hover:shadow-[var(--shadow-pop)] active:scale-[0.99]"
                >
                  <Avatar name={s.name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-foreground">{s.name}</p>
                      <RoleChip
                        role={
                          s.staff_type === "teaching"
                            ? s.role || "teacher"
                            : s.designation || "staff"
                        }
                      />
                      {!s.active ? <ActiveChip active={false} /> : null}
                    </div>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground tabular-nums">
                      {s.staff_type === "teaching"
                        ? `${s.phone || "—"} · ${s.subjects || "—"}${s.hasPin ? "" : " · no PIN"}`
                        : [s.department, s.phone].filter(Boolean).join(" · ") || "—"}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {s.staff_type === "teaching"
                        ? s.batchNames.length > 0
                          ? s.batchNames.join(", ")
                          : "No batches"
                        : "Non-teaching staff"}
                    </p>
                  </div>
                  <RowChevron />
                </Link>
              </li>
            </Reveal>
          ))}
        </ul>
      )}

      <Pager
        page={page}
        pages={pages}
        total={total}
        start={start}
        size={size}
        baseHref="/manage/staff"
        params={baseParams}
      />
    </div>
  );
}
