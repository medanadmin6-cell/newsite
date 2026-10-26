import Image from "next/image";

/**
 * The win trophy.
 *
 * A rendered image rather than the drawn SVG that used to live here: hand-authored
 * vector gets you clean shapes and stops well short of looking like metal, and
 * this is a win screen, so it should look expensive.
 *
 * The source art arrived as a JPEG on white. `public/trophy.png` is that file
 * keyed to transparency — the background flood-filled away from the edges so the
 * highlights inside the cup survive, and the near-white burst ramped to a soft
 * alpha so it fades into the dark instead of ending on a hard white edge.
 */
const NATURAL_WIDTH = 700;
const NATURAL_HEIGHT = 649;

export function Trophy({
  size = 220,
  className,
  animated = false,
}: {
  /** Width in pixels; the height follows the artwork's own proportions. */
  size?: number;
  className?: string;
  /** Kept for the celebration, which animates the wrapper around this. */
  animated?: boolean;
}) {
  return (
    <Image
      src="/trophy.png"
      alt="Trophy"
      width={size}
      height={Math.round((size * NATURAL_HEIGHT) / NATURAL_WIDTH)}
      className={className}
      priority={animated}
      unoptimized={false}
    />
  );
}
