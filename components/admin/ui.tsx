"use client";

import { useCallback, useEffect, useState } from "react";

/** Shared pieces for the operator console: fetching, tables, badges, money. */

export function useAdminData<T>(url: string): {
  data: T | null;
  error: string | null;
  reload: () => void;
  busy: boolean;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  // Bumping this re-runs the effect, which is how a manual reload happens
  // without the effect body ever calling setState synchronously.
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await fetch(url);
        const json = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(json.error ?? "Could not load");
        setData(json);
        setError(null);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Could not load");
      } finally {
        if (alive) setBusy(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [url, nonce]);

  return { data, error, reload, busy };
}

export async function adminAction(
  url: string,
  method: string,
  body?: unknown,
): Promise<{ ok: boolean; error?: string; data?: Record<string, unknown> }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, data: json } : { ok: false, error: json.error ?? "Action failed" };
  } catch {
    return { ok: false, error: "Network problem" };
  }
}

export function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded bg-[var(--bg-elevated)]">
      <header className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2.5">
        <h2 className="text-[13px] font-bold">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

/**
 * The console's data table, in two shapes.
 *
 * Above the breakpoint it is a table. Below it — which is most of the phones an
 * operator actually carries — a 46rem-wide table in a sideways scroller means
 * seeing a third of the columns at a time and swiping to reach the buttons,
 * which are always in the last one. So each row becomes a card with its values
 * labelled instead.
 *
 * The labels come from `head` through custom properties rather than markup, so
 * every screen already using this component gets the card layout without its
 * rows being rewritten. It relies on each row having one cell per heading,
 * which is what all six screens do.
 */
export function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  const labels = Object.fromEntries(
    // CSS `content` needs a quoted string, and a heading with a quote in it
    // would otherwise end the value early.
    head.map((h, i) => [`--col-${i + 1}`, `"${h.replace(/["\\]/g, "\\$&")}"`]),
  ) as React.CSSProperties;

  return (
    <div className="scroll-x">
      <table className="admin-table w-full text-left text-[12px] md:min-w-[46rem]" style={labels}>
        <thead>
          <tr className="border-b border-[var(--line)] text-[10px] uppercase tracking-wide text-[var(--text-faint)]">
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--line)]">{children}</tbody>
      </table>
    </div>
  );
}

export function Badge({
  tone,
  children,
}: {
  tone: "win" | "lose" | "pending" | "muted";
  children: React.ReactNode;
}) {
  const styles = {
    win: { background: "var(--win)", color: "#23310c" },
    lose: { background: "var(--lose)", color: "#ffffff" },
    pending: { background: "var(--pending)", color: "#3f2d03" },
    muted: { background: "var(--surface-2)", color: "var(--text-muted)" },
  }[tone];

  return (
    <span className="rounded px-1.5 py-0.5 text-[10px] font-black uppercase" style={styles}>
      {children}
    </span>
  );
}

export function Button({
  tone = "ghost",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "accent" | "ghost" | "danger" }) {
  const styles = {
    accent: { background: "var(--accent)", color: "var(--accent-ink)" },
    ghost: { background: "var(--surface-2)", color: "var(--text)" },
    danger: { background: "transparent", color: "var(--lose)", boxShadow: "inset 0 0 0 1px var(--lose)" },
  }[tone];

  return (
    <button
      {...props}
      style={styles}
      className="rounded px-2.5 py-1 text-[11px] font-bold disabled:opacity-40"
    />
  );
}

export function money(amount: number | string, currency: string): string {
  return `${currency} ${Number(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function CurrencyTotals({ totals }: { totals: Record<string, number> }) {
  const entries = Object.entries(totals);
  if (!entries.length) return <span className="text-[var(--text-faint)]">—</span>;
  return (
    <div className="space-y-0.5">
      {entries.map(([currency, amount]) => (
        <p key={currency} className="text-[15px] font-bold">
          {money(amount, currency)}
        </p>
      ))}
    </div>
  );
}
