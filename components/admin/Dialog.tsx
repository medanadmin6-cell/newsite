"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

/**
 * In-app dialogs for the operator console.
 *
 * These replace window.prompt and window.confirm, which render as a browser
 * chrome box with no styling, no validation and no way to explain what an
 * action does before it happens.
 */

export interface Field {
  name: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  hint?: string;
  /** Return an error string to block submission. */
  validate?: (value: string, all: Record<string, string>) => string | null;
}

interface PromptState {
  title: string;
  description?: string;
  fields: Field[];
  confirmLabel: string;
  tone: "accent" | "danger";
  resolve: (values: Record<string, string> | null) => void;
}

/**
 * Hook giving the console an `ask` (form) and a `confirm` (yes/no), plus the
 * element to render. Both return a promise that resolves when the operator
 * answers, so call sites read the same way the old prompt did.
 */
export function useDialog() {
  const [state, setState] = useState<PromptState | null>(null);

  const ask = useCallback(
    (opts: {
      title: string;
      description?: string;
      fields: Field[];
      confirmLabel?: string;
      tone?: "accent" | "danger";
    }) =>
      new Promise<Record<string, string> | null>((resolve) => {
        setState({
          title: opts.title,
          description: opts.description,
          fields: opts.fields,
          confirmLabel: opts.confirmLabel ?? "Save",
          tone: opts.tone ?? "accent",
          resolve,
        });
      }),
    [],
  );

  const confirm = useCallback(
    (opts: { title: string; description?: string; confirmLabel?: string; tone?: "accent" | "danger" }) =>
      new Promise<boolean>((resolve) => {
        setState({
          title: opts.title,
          description: opts.description,
          fields: [],
          confirmLabel: opts.confirmLabel ?? "Confirm",
          tone: opts.tone ?? "danger",
          resolve: (v) => resolve(v !== null),
        });
      }),
    [],
  );

  const element = state ? (
    <DialogBox
      state={state}
      onClose={(values) => {
        state.resolve(values);
        setState(null);
      }}
    />
  ) : null;

  return { ask, confirm, dialog: element };
}

function DialogBox({
  state,
  onClose,
}: {
  state: PromptState;
  onClose: (values: Record<string, string> | null) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(state.fields.map((f) => [f.name, f.defaultValue ?? ""])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstField.current?.focus();
  }, []);

  // Escape closes; the console is a keyboard-heavy screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();

    const found: Record<string, string> = {};
    for (const f of state.fields) {
      const err = f.validate?.(values[f.name] ?? "", values);
      if (err) found[f.name] = err;
    }

    if (Object.keys(found).length) {
      setErrors(found);
      return;
    }
    onClose(values);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        className="absolute inset-0 bg-black/70"
        onClick={() => onClose(null)}
        aria-label="Cancel"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={state.title}
        className="relative w-full max-w-sm overflow-hidden rounded-[6px] bg-[var(--bg-elevated)] shadow-2xl ring-1 ring-[var(--line)]"
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
          <h2 className="text-[14px] font-bold">{state.title}</h2>
          <button onClick={() => onClose(null)} aria-label="Close" className="text-[var(--text-muted)]">
            <X size={17} strokeWidth={2} />
          </button>
        </header>

        <form onSubmit={submit} className="space-y-3 p-4">
          {state.description && (
            <p className="text-[12px] leading-relaxed text-[var(--text-muted)]">{state.description}</p>
          )}

          {state.fields.map((f, i) => (
            <label key={f.name} className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
                {f.label}
              </span>
              <input
                ref={i === 0 ? firstField : undefined}
                value={values[f.name] ?? ""}
                placeholder={f.placeholder}
                onChange={(e) => {
                  setValues((v) => ({ ...v, [f.name]: e.target.value }));
                  setErrors((x) => ({ ...x, [f.name]: "" }));
                }}
                className="w-full rounded-[3px] bg-[var(--surface-2)] px-3 py-2 text-[13px] outline-none focus:ring-1 focus:ring-[var(--accent)]"
              />
              {errors[f.name] ? (
                <span className="mt-1 block text-[11px] text-[var(--lose)]">{errors[f.name]}</span>
              ) : f.hint ? (
                <span className="mt-1 block text-[11px] text-[var(--text-faint)]">{f.hint}</span>
              ) : null}
            </label>
          ))}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => onClose(null)}
              className="rounded-[3px] px-4 py-2 text-[12px] font-bold text-[var(--text-muted)] ring-1 ring-[var(--line)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-[3px] px-4 py-2 text-[12px] font-black"
              style={
                state.tone === "danger"
                  ? { background: "var(--lose)", color: "#ffffff" }
                  : { background: "var(--accent)", color: "var(--accent-ink)" }
              }
            >
              {state.confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Shared validators, so the same rule is not rewritten at each call site. */
export const validators = {
  scoreline(value: string): string | null {
    if (!/^\d{1,2}\s*-\s*\d{1,2}$/.test(value.trim())) return "Enter the score as 2-1";
    return null;
  },
  integer(min: number, max: number) {
    return (value: string): string | null => {
      const n = Number(value.trim());
      if (!Number.isInteger(n)) return "Enter a whole number";
      if (n < min || n > max) return `Must be between ${min} and ${max}`;
      return null;
    };
  },
  money(value: string): string | null {
    const n = Number(value.trim());
    if (!Number.isFinite(n)) return "Enter an amount";
    if (n === 0) return "Enter a non-zero amount";
    return null;
  },
  goalTimeline(value: string): string | null {
    if (!value.trim()) return null;
    for (const part of value.split(",").map((s) => s.trim()).filter(Boolean)) {
      const [minute, team] = part.split(":").map((s) => s.trim());
      if (!/^\d{1,3}$/.test(minute ?? "")) return `"${part}" — minute must be a number`;
      if (team !== "home" && team !== "away") return `"${part}" — team must be home or away`;
    }
    return null;
  },
};
