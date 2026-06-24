import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { logout } from "@/lib/actions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSession();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-black/10 bg-white/80 px-4 py-3 backdrop-blur dark:border-white/15 dark:bg-black/60">
        <div className="flex items-center gap-4">
          <Link href="/today" className="font-bold tracking-tight">
            KLiXO <span className="text-indigo-600">Coach</span>
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link href="/today" className="text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white">
              Today
            </Link>
            {user.role === "owner" ? (
              <Link href="/dashboard" className="text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white">
                Dashboard
              </Link>
            ) : null}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden text-black/50 sm:inline dark:text-white/50">
            {user.name}
          </span>
          <form action={logout}>
            <button className="rounded-md border border-black/15 px-2.5 py-1 text-black/70 hover:bg-black/5 dark:border-white/20 dark:text-white/70 dark:hover:bg-white/10">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
