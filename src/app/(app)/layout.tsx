import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { logout } from "@/lib/actions";
import { Wordmark } from "@/components/Logo";
import { Avatar, RoleChip } from "@/components/ui";
import { NavLink } from "./nav-link";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSession();
  if (!user) redirect("/login");

  const userBlock = (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar name={user.name} />
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-semibold text-foreground">
          {user.name}
        </p>
        <div className="mt-0.5">
          <RoleChip role={user.role} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Wordmark size={26} />
            <nav className="hidden items-center gap-1 sm:flex">
              <NavLink href="/today">Today</NavLink>
              {user.role === "owner" ? (
                <NavLink href="/dashboard">Dashboard</NavLink>
              ) : null}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:block">{userBlock}</div>
            <form action={logout}>
              <button className="cursor-pointer rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                Sign out
              </button>
            </form>
          </div>
        </div>

        {/* mobile row: nav (left) + user (right) */}
        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2 sm:hidden">
          <nav className="flex items-center gap-1">
            <NavLink href="/today">Today</NavLink>
            {user.role === "owner" ? (
              <NavLink href="/dashboard">Dashboard</NavLink>
            ) : null}
          </nav>
          {userBlock}
        </div>
      </header>

      <div className="flex-1">{children}</div>
    </div>
  );
}
