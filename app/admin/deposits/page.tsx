"use client";

import { useState } from "react";
import Image from "next/image";
import { useAdminData, adminAction, Panel, Button, money } from "@/components/admin/ui";
import { useDialog } from "@/components/admin/Dialog";

interface ManualDeposit {
  reference: string;
  amount: number;
  currency: string;
  created_at: string;
  screenshotUrl: string | null;
  senderNumber: string | null;
  users: { id: string; name: string; phone: string; country_code: string };
}

export default function DepositsPage() {
  const { data, error, reload, busy } = useAdminData<{ deposits: ManualDeposit[] }>("/api/admin/deposits");
  const [note, setNote] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const { confirm, dialog } = useDialog();

  const act = async (reference: string, action: "confirm" | "reject" | "delete") => {
    if (action === "delete") {
      const ok = await confirm({
        title: "Delete this deposit?",
        description:
          "The money is taken back out of the wallet and the qualifying-deposit tick is reversed. " +
          "This cannot be undone.",
        confirmLabel: "Delete",
      });
      if (!ok) return;
    }
    setWorking(reference);
    const res = await adminAction("/api/admin/deposits", "POST", { reference, action });
    setNote(res.ok ? "Done." : (res.error ?? "Failed"));
    setWorking(null);
    if (res.ok) reload();
  };

  return (
    <div className="space-y-3">
      {note && <p className="text-[12px] text-[var(--text-muted)]">{note}</p>}
      {error && <p className="text-[13px] text-[var(--lose)]">{error}</p>}

      <Panel title={`Manual deposits awaiting confirmation${data ? ` (${data.deposits.length})` : ""}`}>
        {busy && !data ? (
          <p className="p-6 text-[13px] text-[var(--text-muted)]">Loading…</p>
        ) : !data?.deposits.length ? (
          <p className="p-8 text-center text-[13px] text-[var(--text-muted)]">Nothing waiting.</p>
        ) : (
          <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.deposits.map((d) => (
              <article key={d.reference} className="overflow-hidden rounded bg-[var(--surface)]">
                {d.screenshotUrl ? (
                  <a href={d.screenshotUrl} target="_blank" rel="noopener noreferrer">
                    <Image
                      src={d.screenshotUrl}
                      alt="Deposit screenshot"
                      width={400}
                      height={260}
                      className="h-40 w-full bg-[var(--bg)] object-contain"
                      unoptimized
                    />
                  </a>
                ) : (
                  <div className="flex h-40 items-center justify-center bg-[var(--bg)] text-[12px] text-[var(--text-faint)]">
                    No screenshot
                  </div>
                )}

                <div className="space-y-2 p-3">
                  <div>
                    <p className="text-[15px] font-black text-[var(--accent)]">
                      {money(d.amount, d.currency)}
                    </p>
                    <p className="text-[12px] font-semibold">{d.users.name}</p>
                    <p className="text-[11px] text-[var(--text-faint)]">
                      {d.users.phone}
                      {d.senderNumber && d.senderNumber !== d.users.phone
                        ? ` · sent from ${d.senderNumber}`
                        : ""}
                    </p>
                    <p className="mt-1 font-mono text-[10px] text-[var(--text-faint)]">{d.reference}</p>
                  </div>

                  <div className="flex gap-1.5">
                    <Button
                      tone="accent"
                      disabled={working === d.reference}
                      onClick={() => act(d.reference, "confirm")}
                    >
                      Credit
                    </Button>
                    <Button disabled={working === d.reference} onClick={() => act(d.reference, "reject")}>
                      Reject
                    </Button>
                    <Button
                      tone="danger"
                      disabled={working === d.reference}
                      onClick={() => act(d.reference, "delete")}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>
      {dialog}
    </div>
  );
}
