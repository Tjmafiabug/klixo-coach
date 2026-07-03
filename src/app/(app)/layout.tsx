import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role === "student") redirect("/portal"); // students never see the ops app

  return (
    <AppShell name={user.name} role={user.role}>
      {children}
    </AppShell>
  );
}
