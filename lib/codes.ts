/**
 * Short, human-readable codes. Deliberately excludes characters that get
 * misread when a player reads a booking code down the phone: 0/O, 1/I/L, 5/S.
 */
const ALPHABET = "ABCDEFGHJKMNPQRTUVWXYZ2346789";

function code(len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

/** Ticket code, shown on the bet slip and in My Bets. */
export function ticketCode(): string {
  return `B${code(7)}`;
}

/** Booking code, shared between players to load the same selections. */
export function bookingCode(): string {
  return code(6);
}

export function paymentReference(prefix = "BLX"): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${code(5)}`;
}
