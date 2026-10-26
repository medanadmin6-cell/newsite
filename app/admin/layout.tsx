import Link from "next/link";
import Image from "next/image";
import { AdminNav } from "./AdminNav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--surface)]">
        <div className="flex h-14 w-full items-center gap-2 px-3">
          {/* The mark stays a link home; the drawer carries the navigation. */}
          <Link href="/admin" className="flex shrink-0 items-center" aria-label="Console home">
            <Image src="/logo-mark.svg" alt="" width={24} height={24} />
          </Link>
          <AdminNav />
        </div>
      </header>
      <main className="w-full px-4 py-4">{children}</main>
    </div>
  );
}
