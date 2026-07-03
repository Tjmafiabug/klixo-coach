import { requireStudent } from "@/lib/portal";
import { PortalShell } from "@/components/PortalShell";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { name } = await requireStudent();
  return <PortalShell name={name}>{children}</PortalShell>;
}
