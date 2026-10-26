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
 */

const BUCKET_MS = 30_000;

let current = Math.floor(Date.now() / BUCKET_MS) * BUCKET_MS;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function tick(): void {
  const next = Math.floor(Date.now() / BUCKET_MS) * BUCKET_MS;
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  timer ??= setInterval(tick, 1_000);

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
