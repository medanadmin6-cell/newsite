/**
 * Icons the set does not carry.
 *
 * Everything else comes from lucide-react; these are drawn to the same
 * conventions — a 24-unit box, currentColor, stroke-driven — so they sit
 * beside Lucide icons without looking bolted on.
 */

export interface IconProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
}

/** A football. Lucide's generic ball reads as basketball at small sizes. */
export function BallIcon({ size = 24, strokeWidth = 1.7, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 6.6l3.9 2.8-1.5 4.6H9.6L8.1 9.4z" />
      <path d="M12 2.5v4.1M3.1 9.1l5 .3M5.6 19.3l4-5.3M18.4 19.3l-4-5.3M20.9 9.1l-5 .3" />
    </svg>
  );
}

/** 3btafric mark, for the home tab in the bottom navigation. */
export function BrandIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className={className}
      aria-hidden="true"
    >
      <rect width="40" height="40" rx="10" fill="currentColor" />
      <text
        x="20"
        y="29"
        textAnchor="middle"
        fontFamily="ui-sans-serif,system-ui,Segoe UI,Roboto,Arial,sans-serif"
        fontSize="27"
        fontWeight="800"
        fill="var(--bg)"
      >
        S
      </text>
    </svg>
  );
}
