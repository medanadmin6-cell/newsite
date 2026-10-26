"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useAdminData, Panel, CurrencyTotals } from "@/components/admin/ui";

interface Overview {
  deposits: Record<string, number>;
  withdrawals: Record<string, number>;
  players: number;
  depositors: number;
  openTickets: number;
  openStake: number;
  liability: Record<string, number>;
  pendingDeposits: number;
  commissionToday: Record<string, number>;
  commissionCountToday: number;
  partnersPaidToday: number;
}

export default function OverviewPage() {
  const { data, error, busy } = useAdminData<Overview>("/api/admin/overview");

  if (error) return <p className="text-[13px] text-[var(--lose)]">{error}</p>;
  if (busy && !data) return <p className="text-[13px] text-[var(--text-muted)]">Loading…</p>;
  if (!data) return null;

  return (
    <div className="space-y-3">
      {data.pendingDeposits > 0 && (
        <Link
          href="/admin/deposits"
          className="flex items-center gap-1 rounded bg-[var(--pending)]/15 px-4 py-3 text-[13px] font-semibold text-[var(--pending)]"
        >
          {data.pendingDeposits} manual deposit{data.pendingDeposits === 1 ? "" : "s"} waiting for
          confirmation
          <ChevronRight size={15} strokeWidth={2.2} />
        </Link>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Panel title="Commission today">
          <div className="p-4">
            <CurrencyTotals totals={data.commissionToday} />
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              {data.commissionCountToday === 0
                ? "No partner deposits yet today"
                : `${data.commissionCountToday} deposit${
                    data.commissionCountToday === 1 ? "" : "s"
                  } · ${data.partnersPaidToday} partner${data.partnersPaidToday === 1 ? "" : "s"}`}
            </p>
          </div>
        </Panel>
        <Panel title="Deposits">
          <div className="p-4">
            <CurrencyTotals totals={data.deposits} />
          </div>
        </Panel>
        <Panel title="Withdrawals">
          <div className="p-4">
            <CurrencyTotals totals={data.withdrawals} />
          </div>
        </Panel>
        <Panel title="Players">
          <div className="p-4">
            <p className="text-[24px] font-black">{data.players.toLocaleString()}</p>
            <p className="text-[11px] text-[var(--text-muted)]">
              {data.depositors.toLocaleString()} have deposited
            </p>
          </div>
        </Panel>
        <Panel title="Open tickets">
          <div className="p-4">
            <p className="text-[24px] font-black">{data.openTickets.toLocaleString()}</p>
            <p className="text-[11px] text-[var(--text-muted)]">
              Liability if every one lands:
            </p>
            <div className="mt-1 text-[12px]">
              <CurrencyTotals totals={data.liability} />
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
