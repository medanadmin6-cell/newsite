"use client";

import { useState } from "react";
import Image from "next/image";
import { Copy, Check, Link2, Download, Share2, ZoomIn, X } from "lucide-react";
import { useSession } from "@/lib/store";

/**
 * The booking receipt.
 *
 * A code on its own is a string someone has to type correctly down a phone, so
 * it comes with a rendered ticket image: the code and the selections together,
 * readable as a screenshot without any of our chrome around it.
 */
export function BookedCode({
  code,
  expiresAt,
  onDone,
}: {
  code: string;
  expiresAt?: string | null;
  onDone: () => void;
}) {
  const player = useSession((s) => s.player);

  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [shared, setShared] = useState(true);
  const [zoom, setZoom] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = `${origin}/load-code?code=${code}`;
  const imageUrl = `/api/bookings/${code}/image`;
  const message = `Load my Betvanta code ${code} — ${link}`;

  const copy = (value: string, which: "code" | "link") => {
    navigator.clipboard?.writeText(value).then(
      () => {
        setCopied(which);
        setTimeout(() => setCopied(null), 1600);
      },
      () => setCopied(null),
    );
  };

  const toggleShare = async (next: boolean) => {
    setShared(next);
    if (!player) return;
    try {
      await fetch(`/api/bookings/${code}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: player.id, shared: next }),
      });
    } catch {
      // The toggle is a listing preference; a failure is not worth an error state.
    }
  };

  const shareInApp = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: `Betvanta code ${code}`, text: message, url: link });
        return;
      } catch {
        /* dismissed */
      }
    }
    copy(link, "link");
  };

  return (
    <div className="border-t border-[var(--line)] px-5 pb-5 pt-4">
      <h2 className="text-center text-[14px] font-bold text-[var(--text-bright)]">Booking Code</h2>

      <button
        onClick={() => copy(code, "code")}
        className="mx-auto mt-1 flex items-center gap-2"
        aria-label="Copy booking code"
      >
        <span className="text-[30px] font-black tracking-[0.12em] text-[var(--text-bright)]">
          {code}
        </span>
        {copied === "code" ? (
          <Check size={18} strokeWidth={2.6} className="text-[var(--accent)]" />
        ) : (
          <Copy size={18} strokeWidth={1.9} className="text-[var(--text-muted)]" />
        )}
      </button>

      <p className="mt-1 text-center text-[12px] text-[var(--text-muted)]">
        {expiresAt
          ? new Date(expiresAt).toLocaleString("en-GB", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "No expiry"}
      </p>

      {/* Ticket preview */}
      <button
        onClick={() => setZoom(true)}
        className="relative mx-auto mt-3 block w-[92px] overflow-hidden rounded ring-1 ring-[var(--line)]"
        aria-label="Enlarge ticket"
      >
        <Image
          src={imageUrl}
          alt={`Ticket for booking code ${code}`}
          width={92}
          height={122}
          className="h-[122px] w-[92px] object-cover"
          unoptimized
        />
        <span className="absolute inset-0 flex items-center justify-center bg-black/25">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white">
            <ZoomIn size={15} strokeWidth={2.2} />
          </span>
        </span>
      </button>

      {/* Personal page listing */}
      <div className="mt-4 flex items-center justify-between">
        <span className="text-[14px] text-[var(--text-bright)]">Share Code on Personal Page</span>
        <button
          role="switch"
          aria-checked={shared}
          onClick={() => toggleShare(!shared)}
          className="relative h-6 w-11 rounded-full transition-colors"
          style={{ background: shared ? "var(--accent)" : "var(--surface-2)" }}
        >
          <span
            className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all"
            style={{ left: shared ? "calc(100% - 22px)" : "2px" }}
          />
        </button>
      </div>

      <hr className="mt-4 border-[var(--line)]" />

      {/* Share row */}
      <div className="mt-4 grid grid-cols-5 gap-1">
        <ShareAction
          label="X / Twitter"
          href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}`}
          icon={<XLogo />}
        />
        <ShareAction
          label="Whatsapp"
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          icon={<WhatsAppLogo />}
        />
        <ShareAction label="Share In App" onClick={shareInApp} icon={<Share2 size={19} strokeWidth={2} />} />
        <ShareAction
          label={copied === "link" ? "Copied" : "Copy Link"}
          onClick={() => copy(link, "link")}
          icon={copied === "link" ? <Check size={19} strokeWidth={2.4} /> : <Link2 size={19} strokeWidth={2} />}
        />
        <ShareAction
          label="Save"
          href={imageUrl}
          download={`betvanta-${code}.png`}
          icon={<Download size={19} strokeWidth={2} />}
        />
      </div>

      <button
        onClick={onDone}
        className="mt-4 w-full py-2 text-[13px] font-semibold text-[var(--text-muted)]"
      >
        Back to slip
      </button>

      {zoom && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-6">
          <button className="absolute inset-0" onClick={() => setZoom(false)} aria-label="Close" />
          <button
            onClick={() => setZoom(false)}
            aria-label="Close"
            className="absolute right-4 top-4 text-white"
          >
            <X size={26} strokeWidth={2} />
          </button>
          <Image
            src={imageUrl}
            alt={`Ticket for booking code ${code}`}
            width={450}
            height={600}
            className="relative max-h-full w-auto rounded"
            unoptimized
          />
        </div>
      )}
    </div>
  );
}

function ShareAction({
  label,
  icon,
  href,
  onClick,
  download,
}: {
  label: string;
  icon: React.ReactNode;
  href?: string;
  onClick?: () => void;
  download?: string;
}) {
  const body = (
    <>
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#03272B]">
        {icon}
      </span>
      <span className="text-center text-[11px] leading-tight text-[var(--text)]">{label}</span>
    </>
  );

  const shell = "flex flex-col items-center gap-1.5";

  if (href) {
    return (
      <a
        href={href}
        download={download}
        target={download ? undefined : "_blank"}
        rel="noopener noreferrer"
        className={shell}
      >
        {body}
      </a>
    );
  }

  return (
    <button onClick={onClick} className={shell}>
      {body}
    </button>
  );
}

function XLogo() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.9 2H22l-7.1 8.1L23 22h-6.6l-5.2-6.8L5.3 22H2.2l7.6-8.7L1.6 2h6.8l4.7 6.2zm-1.1 18h1.7L7.3 3.7H5.4z" />
    </svg>
  );
}

function WhatsAppLogo() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a9.9 9.9 0 00-8.5 15L2 22l5.2-1.4A9.9 9.9 0 1012 2zm0 18a8 8 0 01-4.1-1.1l-.3-.2-3.1.8.8-3-.2-.3A8 8 0 1112 20zm4.5-5.9c-.2-.1-1.4-.7-1.7-.8s-.4-.1-.5.1-.6.8-.7.9-.3.2-.5.1a6.5 6.5 0 01-1.9-1.2 7.3 7.3 0 01-1.4-1.7c-.1-.3 0-.4.1-.5l.4-.5.2-.4v-.4l-.7-1.7c-.2-.4-.4-.4-.5-.4h-.5a.9.9 0 00-.7.3 2.8 2.8 0 00-.9 2.1 4.9 4.9 0 001 2.6 11 11 0 004.2 3.7 8.6 8.6 0 001.4.5 3.4 3.4 0 001.6.1 2.6 2.6 0 001.7-1.2 2.1 2.1 0 00.1-1.2z" />
    </svg>
  );
}
