/**
 * The win cup.
 *
 * The artwork is a public-domain trophy with the Betvanta mark on the bowl.
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
  const height = Math.round(size * (128.49 / 104.22));
  return (
    <img
      src="/trophy.svg"
      alt="Betvanta trophy"
      width={size}
      height={height}
      className={className}
      data-animated={animated ? "true" : undefined}
      draggable={false}
    />
  );
}
