/**
 * The win cup.
 *
 * Drawn here so a winning ticket always has a cup. The old artwork lived at
 * public/trophy.png, and that file is not in the project, so the celebration
 * was an empty box.
 */
export function Trophy({
  size = 220,
  className,
  animated = false,
}: {
  /** Width in pixels; the height follows the artwork. */
  size?: number;
  className?: string;
  /** The celebration animates the wrapper around this. */
  animated?: boolean;
}) {
  const height = Math.round(size * 1.05);
  return (
    <svg
      width={size}
      height={height}
      viewBox="0 0 200 210"
      className={className}
      role="img"
      aria-label="Trophy"
      data-animated={animated ? "true" : undefined}
    >
      <defs>
        <linearGradient id="cup-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff4c2" />
          <stop offset="0.35" stopColor="#f0c14b" />
          <stop offset="0.7" stopColor="#c8881a" />
          <stop offset="1" stopColor="#ffe08a" />
        </linearGradient>
        <linearGradient id="cup-shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.7" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <ellipse cx="100" cy="198" rx="46" ry="8" fill="#000" opacity="0.28" />
      <path
        d="M58 28h84c2 28 2 48-8 66-8 14-22 24-34 26-12-2-26-12-34-26-10-18-10-38-8-66z"
        fill="url(#cup-gold)"
      />
      <path d="M72 36h22c-2 22-4 40-10 52-6-8-10-28-12-52z" fill="url(#cup-shine)" />
      <path
        d="M58 40c-16 2-28 14-28 30 0 16 12 26 26 26"
        fill="none"
        stroke="url(#cup-gold)"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path
        d="M142 40c16 2 28 14 28 30 0 16-12 26-26 26"
        fill="none"
        stroke="url(#cup-gold)"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path d="M86 120h28l6 28H80z" fill="url(#cup-gold)" />
      <path d="M64 150h72l8 16H56z" fill="url(#cup-gold)" />
      <rect x="48" y="166" width="104" height="16" rx="4" fill="url(#cup-gold)" />
      <path d="M78 58h44l-6 28c-6 4-26 4-32 0z" fill="#8a5a10" opacity="0.35" />
    </svg>
  );
}
