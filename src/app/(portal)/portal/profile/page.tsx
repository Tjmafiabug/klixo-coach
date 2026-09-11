import { requireStudent } from "@/lib/portal";
import { logout } from "@/lib/actions";
import { getStudentProfile, getStudentPtm } from "@/lib/data";
import { PortalTitle, Tile } from "@/components/portal-ui";
import { Pill, Avatar } from "@/components/ui";
import { shortDate } from "@/lib/format";
import { ChangePinForm } from "./ChangePinForm";

const PTM_TONE: Record<string, "info" | "success" | "warning" | "neutral"> = {
  scheduled: "info",
  done: "success",
  no_show: "warning",
  cancelled: "neutral",
};

export default async function PortalProfile() {
  const { studentId } = await requireStudent();
  const [profile, ptm] = await Promise.all([getStudentProfile(studentId), getStudentPtm(studentId)]);
  if (!profile) return <p className="text-sm text-muted-foreground">Student not found.</p>;
  const s = profile.student;
  const currentBatches = profile.enrollments.filter((e) => e.status === "active" && e.end_date === "");

  return (
    <div>
      <PortalTitle title="Profile" />

      <Tile className="mb-4 flex items-center gap-3">
        <Avatar name={s.name} />
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-foreground">{s.name}</p>
          <p className="text-xs text-muted-foreground">Student ID {s.student_id}</p>
        </div>
      </Tile>

      <Tile className="mb-4">
        <dl className="space-y-2.5 text-sm">
          <Row label="Phone" value={s.phone || "—"} />
          <Row label="Parent phone" value={s.parent_phone || "—"} />
          <Row label="Joined" value={s.join_date ? shortDate(s.join_date) : "—"} />
        </dl>
        {currentBatches.length > 0 ? (
          <div className="mt-3 border-t border-border pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Classes</p>
            <div className="flex flex-wrap gap-1.5">
              {currentBatches.map((b) => (
                <Pill key={b.enroll_id} tone="brand" dot={false}>{b.batchName}</Pill>
              ))}
            </div>
          </div>
        ) : null}
      </Tile>

      <p className="mb-2 px-1 text-sm font-semibold text-foreground">Parent meetings</p>
      {ptm.length === 0 ? (
        <p className="mb-6 px-1 text-sm text-muted-foreground">No meetings on record.</p>
      ) : (
        <ul className="mb-6 space-y-2">
          {ptm.map((p) => (
            <li key={p.ptm_id} className="rounded-xl border border-border bg-surface px-3.5 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">{shortDate(p.date)}</p>
                <Pill tone={PTM_TONE[p.status] ?? "neutral"}>{p.status.replace("_", " ")}</Pill>
              </div>
              {p.summary ? <p className="mt-1 text-sm text-muted-foreground">{p.summary}</p> : null}
            </li>
          ))}
        </ul>
      )}

      <ChangePinForm />

      <form action={logout}>
        <button
          type="submit"
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm font-semibold text-danger transition-colors hover:bg-danger-subtle"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}
