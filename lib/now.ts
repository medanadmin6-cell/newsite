"use client";

import { useSyncExternalStore } from "react";

/**
 * A subscribed clock.
 *
 * Reading Date.now() during render is impure — a memo built on it goes stale
 * and never recomputes, so a "next 3 hours" filter would slowly drift out of
 * date while the page stayed open. This exposes the current time as an external
 * store instead: the value is stable between ticks, and every subscriber
 * re-renders together when it advances.
 *
 * Quantised to 30-second buckets so the snapshot is referentially stable and
 * cannot loop the renderer.
 *
 * It is also corrected to the server's clock. A device's own clock can be
 * hours out — a phone left on one timezone with its time set by hand for
 * another runs eight hours fast — and every live badge, match clock and
 * kickoff filter here reads this value. The offset is measured once against
 * /api/time and applied to every tick.
 */

const BUCKET_MS = 30_000;

/** Server time minus device time, in milliseconds. Zero until measured. */
let offset = 0;
let synced = false;

function deviceNowCorrected(): number {
  return Date.now() + offset;
}

let current = Math.floor(deviceNowCorrected() / BUCKET_MS) * BUCKET_MS;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function tick(): void {
  const next = Math.floor(deviceNowCorrected() / BUCKET_MS) * BUCKET_MS;
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener();
}

/**
 * Measure the device clock against the server once. Half the round trip is
 * assumed to be the server's share, which is accurate to well under a second —
 * far finer than the 30-second buckets. A failed request leaves the device
 * clock as it was.
 */
async function syncWithServer(): Promise<void> {
  if (synced) return;
  synced = true;
  try {
    const sent = Date.now();
    const res = await fetch("/api/time", { cache: "no-store" });
    const received = Date.now();
    const json = (await res.json()) as { now?: unknown };
    const server = Number(json.now);
    if (!res.ok || !Number.isFinite(server)) return;
    const measured = server - (sent + received) / 2;
    // Ignore jitter: only correct a clock that is actually off.
    if (Math.abs(measured) < 5_000) return;
    offset = measured;
    tick();
  } catch {
    synced = false; // Try again on the next subscriber.
  }
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  timer ??= setInterval(tick, 1_000);
  void syncWithServer();

  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const getSnapshot = () => current;

// Nothing time-dependent renders on the server: these boards only have
// fixtures after the client fetch resolves.
const getServerSnapshot = () => 0;

export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** The corrected current time, for code outside React rendering. */
export function correctedNow(): number {
  return deviceNowCorrected();
}
