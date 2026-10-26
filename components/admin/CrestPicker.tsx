"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Upload, X, Link2 } from "lucide-react";

/**
 * A team crest for an operator-created match.
 *
 * Takes an upload or a pasted URL. Both end up as the same thing — a URL on the
 * match row — so a crest already hosted elsewhere does not have to be
 * re-uploaded just to be used.
 */
export function CrestPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Upload failed");
        return;
      }
      onChange(json.url);
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="rounded-[4px] bg-[var(--surface)] p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
        {label}
      </p>

      <div className="flex items-center gap-3">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded bg-[var(--bg)] ring-1 ring-[var(--line)]">
          <Image
            src={value || "/crest-fallback.svg"}
            alt=""
            width={44}
            height={44}
            className="h-11 w-11 object-contain"
            unoptimized
          />
        </span>

        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-[3px] bg-[var(--surface-2)] px-2.5 py-1.5 text-[11px] font-bold disabled:opacity-50"
          >
            <Upload size={12} strokeWidth={2.2} />
            {busy ? "Uploading…" : value ? "Replace" : "Upload"}
          </button>

          <button
            type="button"
            onClick={() => setPasting((p) => !p)}
            className="flex items-center gap-1.5 rounded-[3px] bg-[var(--surface-2)] px-2.5 py-1.5 text-[11px] font-bold"
          >
            <Link2 size={12} strokeWidth={2.2} />
            URL
          </button>

          {value && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="flex items-center gap-1.5 rounded-[3px] px-2.5 py-1.5 text-[11px] font-bold text-[var(--lose)]"
            >
              <X size={12} strokeWidth={2.4} />
              Clear
            </button>
          )}
        </div>
      </div>

      {pasting && (
        <div className="mt-2 flex gap-1.5">
          <input
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder="https://…/crest.png"
            className="min-w-0 flex-1 rounded-[3px] bg-[var(--surface-2)] px-2.5 py-1.5 text-[11px] outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
          <button
            type="button"
            onClick={() => {
              const v = pasted.trim();
              if (!v) return;
              onChange(v);
              setPasted("");
              setPasting(false);
            }}
            className="rounded-[3px] bg-[var(--accent)] px-3 py-1.5 text-[11px] font-black text-[var(--accent-ink)]"
          >
            Use
          </button>
        </div>
      )}

      {error && <p className="mt-1.5 text-[11px] text-[var(--lose)]">{error}</p>}

      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
        }}
      />
    </div>
  );
}
