/**
 * The win cup.
 *
 * A gold trophy with figures on the handles, a crown on the lid, and a B
 * on the bowl.
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
  const height = Math.round(size * (855 / 771));
  return (
    <img
      src="/trophy.png"
      alt="Betvanta trophy"
      width={size}
      height={height}
      className={className}
      data-animated={animated ? "true" : undefined}
      draggable={false}
    />
  );
}
