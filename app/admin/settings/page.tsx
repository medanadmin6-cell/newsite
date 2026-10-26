"use client";

import { useState } from "react";
import { useAdminData, adminAction, Panel, Button } from "@/components/admin/ui";

const FIELDS = [
  { key: "deposit_account_name", label: "Deposit account name", hint: "Shown on the manual deposit screen" },
  { key: "deposit_account_number", label: "Deposit account number", hint: "The number players send money to" },
  { key: "deposit_account_network", label: "Network or bank", hint: "MTN Mobile Money, Telecel Cash, …" },
];

export default function SettingsPage() {
  const { data, error, reload } = useAdminData<{ settings: Record<string, string> }>(
    "/api/admin/settings",
  );
  // Saved values come from the server; edits layer on top. Deriving this during
  // render keeps the two in step without an effect that copies one into the other.
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [note, setNote] = useState<string | null>(null);
  const form = { ...(data?.settings ?? {}), ...edits };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await adminAction("/api/admin/settings", "PUT", { settings: form });
    setNote(res.ok ? "Saved." : (res.error ?? "Failed"));
    if (res.ok) {
      setEdits({});
      reload();
    }
  };

  return (
    <div className="max-w-lg space-y-3">
      {note && <p className="text-[12px] text-[var(--text-muted)]">{note}</p>}
      {error && <p className="text-[13px] text-[var(--lose)]">{error}</p>}

      <Panel title="Operator settings">
        <form onSubmit={save} className="space-y-3 p-4">
          {FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
                {f.label}
              </span>
              <input
                value={form[f.key] ?? ""}
                onChange={(e) => setEdits({ ...edits, [f.key]: e.target.value })}
                className="w-full rounded bg-[var(--surface-2)] px-3 py-2 text-[13px] outline-none focus:ring-1 focus:ring-[var(--accent)]"
              />
              <span className="mt-0.5 block text-[10px] text-[var(--text-faint)]">{f.hint}</span>
            </label>
          ))}

          <Button tone="accent" type="submit">
            Save settings
          </Button>
        </form>
      </Panel>

      <Panel title="Set elsewhere">
        <div className="space-y-2 p-4 text-[11px] text-[var(--text-muted)]">
          <p>
            Everything else is an environment variable, so it can differ per deployment without a
            database write. The ones that change behaviour most:
          </p>
          <ul className="list-inside list-disc space-y-1">
            <li>
              <code className="text-[var(--accent)]">FIRST_DEPOSIT_BONUS</code> — one-time welcome
              bonus, default 100
            </li>
            <li>
              <code className="text-[var(--accent)]">WITHDRAW_QUALIFY_COUNT_GH</code> — qualifying
              deposits needed; 0 reverts that market to the cumulative-total rule
            </li>
            <li>
              <code className="text-[var(--accent)]">WITHDRAW_QUALIFY_AMOUNT_GH</code> — how big each
              qualifying deposit must be
            </li>
            <li>
              <code className="text-[var(--accent)]">VERIFICATION_AMOUNT_GH</code>,{" "}
              <code className="text-[var(--accent)]">MIN_FIRST_DEPOSIT_GH</code>
            </li>
          </ul>
        </div>
      </Panel>
    </div>
  );
}
