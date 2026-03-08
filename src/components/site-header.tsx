"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminHeaderGreeting } from "@/components/admin/admin-header-greeting";
import { AdminLogoutButton } from "@/components/admin/admin-logout-button";
import { StudentHeaderGreeting } from "@/components/student/student-header-greeting";
import { StudentLogoutButton } from "@/components/student/student-logout-button";

export function SiteHeader() {
  const pathname = usePathname();
  const isAdminRoute = pathname.startsWith("/admin");
  const isStudentRoute = !isAdminRoute;

  if (pathname.startsWith("/attempts/")) {
    return null;
  }

  return (
    <header className="sticky top-0 z-30 border-b border-[#d9cfc3] bg-[rgba(249,246,241,0.97)] backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-4">
        <div className="flex items-center gap-10 text-[1.1rem] text-[#6d5c4d]">
          <Link href="/" className="font-semibold text-[#d7671b]">
            NEET Practice Platform
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            {isAdminRoute ? (
              <>
                <Link href="/admin">Admin</Link>
                <Link href="/admin/students">Students</Link>
                <Link href="/admin/test-series">Test Series</Link>
                <Link href="/admin/results">Results</Link>
              </>
            ) : (
              <>
                <Link href="/">Home</Link>
                <Link href="/results">Results</Link>
                <Link href="/test-series">Test Series</Link>
              </>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {isAdminRoute ? <AdminHeaderGreeting /> : null}
          {isAdminRoute ? <AdminLogoutButton /> : null}
          {isStudentRoute ? <StudentHeaderGreeting /> : null}
          {isStudentRoute ? <StudentLogoutButton /> : null}
        </div>
      </div>
    </header>
  );
}