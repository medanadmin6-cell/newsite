"use client";

import { useState } from "react";
import Image from "next/image";
import { Eye, EyeOff, X, ChevronRight, Check as CheckGlyph } from "lucide-react";
import { allCountries, type CountryConfig } from "@/lib/countries";

/**
 * The auth form furniture, following the reference login: a country row with a
 * Change affordance, and fields that invert — a pale fill sitting inside a
 * lifted, bordered shell on the dark ground.
 */

/**
 * Flags are drawn art, not emoji: Windows ships no regional-indicator glyphs,
 * so an emoji flag degrades to the bare letters "GH" there.
 */
export function Flag({ code, size = 18 }: { code: string; size?: number }) {
  return (
    <Image
      src={`/flags/${code.toLowerCase()}.svg`}
      alt=""
      width={size}
      height={Math.round((size * 2) / 3)}
      className="shrink-0 rounded-[2px]"
    />
  );
}

/** Country row with an inline picker, and the close control on the right. */
export function CountryBar({
  country,
  onChange,
  onClose,
}: {
  country: CountryConfig;
  onChange: (code: string) => void;
  onClose?: () => void;
}) {
  const [picking, setPicking] = useState(false);

  return (
    <div className="relative">
      <div className="flex items-center justify-between px-1 py-1">
        <div className="flex items-center gap-2">
          <Flag code={country.code} size={20} />
          <span className="text-[15px] font-medium text-[var(--text-bright)]">{country.name}</span>
          <button
            type="button"
            onClick={() => setPicking((p) => !p)}
            className="flex items-center gap-0.5 text-[15px] font-medium text-[var(--accent)]"
          >
            Change
            <ChevronRight size={15} strokeWidth={2.2} />
          </button>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[var(--text-bright)]"
          >
            <X size={22} strokeWidth={2} />
          </button>
        )}
      </div>

      {picking && (
        <ul className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded bg-[var(--field)] ring-1 ring-[var(--field-line)]">
          {allCountries().map((c) => (
            <li key={c.code}>
              <button
                type="button"
                onClick={() => {
                  onChange(c.code);
                  setPicking(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[14px] hover:bg-[var(--surface-2)]"
                style={c.code === country.code ? { color: "var(--accent)" } : undefined}
              >
                <Flag code={c.code} />
                <span className="flex-1">{c.name}</span>
                <span className="text-[12px] text-[var(--text-muted)]">+{c.dialCode}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Phone field: dial-code prefix on the shell, pale input, clear control. */
export function PhoneField({
  country,
  value,
  onChange,
  autoFocus,
}: {
  country: CountryConfig;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-[3px] bg-[var(--field)] px-3 py-2 ring-1 ring-[var(--field-line)]">
      <span className="shrink-0 text-[15px] text-[var(--text-muted)]">+{country.dialCode}</span>
      <div className="relative flex-1">
        <input
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
          className="w-full rounded-[2px] bg-[var(--input)] py-2 pl-2 pr-7 text-[15px] text-[var(--input-ink)] outline-none placeholder:text-[var(--input-placeholder)] focus:ring-1 focus:ring-[var(--accent)]"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Clear phone number"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--input-placeholder)]"
          >
            <X size={16} strokeWidth={2.2} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Password field with the show/hide eye on the shell, outside the pale input. */
export function PasswordField({
  value,
  onChange,
  autoComplete = "current-password",
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  placeholder?: string;
}) {
  const [shown, setShown] = useState(false);

  return (
    <div className="flex items-center gap-2 rounded-[3px] bg-[var(--field)] px-3 py-2 ring-1 ring-[var(--field-line)]">
      <input
        type={shown ? "text" : "password"}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 rounded-[2px] bg-[var(--input)] px-2 py-2 text-[15px] text-[var(--input-ink)] outline-none placeholder:text-[var(--input-placeholder)] focus:ring-1 focus:ring-[var(--accent)]"
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? "Hide password" : "Show password"}
        className="shrink-0 text-[var(--text-muted)]"
      >
        {shown ? <Eye size={20} strokeWidth={1.7} /> : <EyeOff size={20} strokeWidth={1.7} />}
      </button>
    </div>
  );
}

/** Square checkbox with a lime tick, matching the reference pair. */
export function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-2">
      <span
        className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[3px] ring-1 transition-colors"
        style={{
          background: checked ? "var(--accent)" : "transparent",
          boxShadow: `inset 0 0 0 1px ${checked ? "var(--accent)" : "var(--text-muted)"}`,
        }}
      >
        {checked && <CheckGlyph size={14} strokeWidth={3.4} className="text-[var(--accent-ink)]" />}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <span className="text-[14px] text-[var(--text-bright)]">{label}</span>
    </label>
  );
}

/**
 * The full-width lime action the reference uses for Login and Register.
 *
 * It is lime in every state. A greyed or faded version of it over this ground
 * turns into a dark slab that reads as a broken button, so an empty form is
 * answered by the form telling the player what is missing, not by the button
 * going out. The only time it changes is while a submission is in flight, and
 * then it says so.
 */
export function PrimaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="w-full rounded-[3px] bg-[var(--accent)] py-3.5 text-[16px] font-medium text-[var(--accent-ink)] disabled:cursor-wait"
    >
      {children}
    </button>
  );
}
