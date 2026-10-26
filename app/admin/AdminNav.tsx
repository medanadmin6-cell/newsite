"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Menu,
  X,
  LayoutDashboard,
  Users,
  Banknote,
  ReceiptText,
  CalendarDays,
  Clapperboard,
  Ticket,
  Handshake,
  Settings,
  LogOut,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";

/**
 * The operator console navigation.
 *
 * A drawer rather than a row of links: the console has nine screens across four
 * concerns, and a horizontal strip either scrolls sideways on a phone or runs
 * out of room. Grouped in a drawer, each screen sits under the thing it is
 * about, and the header keeps the current page name visible.
 */

interface Item {
  href: string;
  label: string;
  Icon: LucideIcon;
  hint?: string;
}

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Overview",
    items: [{ href: "/admin", label: "Dashboard", Icon: LayoutDashboard, hint: "Totals and liability" }],
  },
  {
    title: "Money",
    items: [
      { href: "/admin/players", label: "Players", Icon: Users, hint: "Balances and withdrawal approval" },
      { href: "/admin/deposits", label: "Deposits", Icon: Banknote, hint: "Manual deposits awaiting confirmation" },
      { href: "/admin/payments", label: "Payments", Icon: ReceiptText, hint: "The full ledger" },
    ],
  },
  {
    title: "Betting",
    items: [
      { href: "/admin/matches", label: "Matches", Icon: CalendarDays, hint: "Upstream fixtures and overrides" },
      { href: "/admin/custom-matches", label: "Custom matches", Icon: Clapperboard, hint: "Operator fixtures and goal scripts" },
      { href: "/admin/bets", label: "Bets", Icon: Ticket, hint: "Every ticket on the platform" },
    ],
  },
  {
    title: "Platform",
    items: [
      { href: "/admin/sub-admins", label: "Partners", Icon: Handshake, hint: "Approval and commission" },
      { href: "/admin/settings", label: "Settings", Icon: Settings, hint: "Operator-editable values" },
    ],
  },
];

const ALL = GROUPS.flatMap((g) => g.items);

export function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (pathname === "/admin/login") return null;

  // The longest matching path wins, so /admin does not claim every screen.
  const current = ALL.filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded px-2 py-1.5 text-[var(--text-bright)] hover:bg-[var(--surface-2)]"
      >
        <Menu size={20} strokeWidth={2} />
      </button>

      <span className="flex-1 truncate text-[14px] font-bold text-[var(--text-bright)]">
        {current?.label ?? "Admin"}
      </span>

      <Link
        href="/"
        className="hidden shrink-0 text-[12px] font-medium text-[var(--text-muted)] sm:block"
      >
        View site
      </Link>

      <button onClick={logout} className="shrink-0 text-[12px] font-semibold text-[var(--text-faint)]">
        Log out
      </button>

      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Console menu">
          <button className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} aria-label="Close menu" />

          <nav className="relative flex h-full w-[min(19rem,85vw)] flex-col bg-[var(--bg-elevated)] shadow-2xl">
            <header className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3.5">
              <span className="text-[14px] font-black">Operator console</span>
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="text-[var(--text-muted)]">
                <X size={19} strokeWidth={2} />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto py-2">
              {GROUPS.map((group) => (
                <section key={group.title} className="pb-1">
                  <h2 className="px-4 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-faint)]">
                    {group.title}
                  </h2>

                  {group.items.map((item) => {
                    const active = current?.href === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5"
                        style={{
                          background: active ? "var(--surface)" : undefined,
                          boxShadow: active ? "inset 3px 0 0 var(--accent)" : undefined,
                        }}
                      >
                        <item.Icon
                          size={18}
                          strokeWidth={1.8}
                          style={{ color: active ? "var(--accent)" : "var(--text-muted)" }}
                        />
                        <span className="min-w-0 flex-1">
                          <span
                            className="block text-[13px] font-medium"
                            style={{ color: active ? "var(--text-bright)" : "var(--text)" }}
                          >
                            {item.label}
                          </span>
                          {item.hint && (
                            <span className="block truncate text-[11px] text-[var(--text-faint)]">
                              {item.hint}
                            </span>
                          )}
                        </span>
                        <ChevronRight size={15} strokeWidth={2} className="text-[var(--text-faint)]" />
                      </Link>
                    );
                  })}
                </section>
              ))}
            </div>

            <div className="border-t border-[var(--line)] p-3">
              <Link
                href="/"
                onClick={() => setOpen(false)}
                className="mb-2 block rounded px-3 py-2 text-center text-[12px] font-bold text-[var(--text)] ring-1 ring-[var(--line)]"
              >
                View the site
              </Link>
              <button
                onClick={logout}
                className="flex w-full items-center justify-center gap-1.5 rounded py-2 text-[12px] font-bold text-[var(--lose)] ring-1 ring-[var(--line)]"
              >
                <LogOut size={14} strokeWidth={2} />
                Log out
              </button>
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
