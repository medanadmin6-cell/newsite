/**
 * The site's own clock: Ghana time (GMT, no daylight saving).
 *
 * Kickoffs typed into the admin and partner forms used to be read in the
 * timezone of whatever computer typed them. A laptop left on Pacific time
 * turned a "20:00" kickoff into 04:00 in Ghana, while the admin page — read
 * on the same laptop — still showed 20:00, so only the players saw the
 * shift. Everything an operator types or reads is now Ghana time.
 */
export const SITE_TIMEZONE = "Africa/Accra";
export const SITE_TIMEZONE_LABEL = "Ghana time";

/**
 * A `datetime-local` value ("2026-11-20T20:00") read as Ghana time, as an ISO
 * instant. Ghana is UTC+0 all year, so the wall time is the UTC time.
 * Null for anything that is not a full date and time.
 */
export function siteInputToIso(value: string): string | null {
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const at = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, s ? +s : 0));
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

/** An ISO instant as a `datetime-local` value in Ghana time, for prefilling a form. */
export function isoToSiteInput(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return at.toISOString().slice(0, 16);
}

/** "20/11/2026, 20:00 GMT" — an instant as an operator should read it. */
export function formatSiteTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "—";
  return `${at.toLocaleString("en-GB", {
    timeZone: SITE_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })} GMT`;
}
