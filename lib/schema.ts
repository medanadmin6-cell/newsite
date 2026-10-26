import { db } from "./supabase";

/**
 * Optional-column probes.
 *
 * Migrations are applied by hand, so a deployment can be running code that
 * knows about a column the database has not been given yet. Naming such a
 * column in a select makes PostgREST reject the whole query, which surfaces as
 * a row that does not exist — a missing migration then looks like missing data,
 * and the real cause is invisible.
 *
 * So the features that depend on newer columns ask first, and switch
 * themselves off cleanly when the answer is no.
 */

const probes = new Map<string, { at: number; present: boolean }>();
const TTL_MS = 60_000;

/** Whether `table.column` exists, cached so this is not asked on every request. */
export async function hasColumn(table: string, column: string): Promise<boolean> {
  const key = `${table}.${column}`;
  const cached = probes.get(key);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.present;

  const supabase = db();
  if (!supabase) return false;

  const { error } = await supabase.from(table).select(column).limit(1);
  const present = !error;

  if (!present) {
    console.warn(`[schema] ${key} is missing — the feature that needs it is disabled`, error?.message);
  }

  probes.set(key, { at: Date.now(), present });
  return present;
}

/** Cashout needs two columns from migration 0011. */
export async function cashoutEnabled(): Promise<boolean> {
  const [amount, at] = await Promise.all([
    hasColumn("bets", "cashout_amount"),
    hasColumn("bets", "cashed_out_at"),
  ]);
  return amount && at;
}
