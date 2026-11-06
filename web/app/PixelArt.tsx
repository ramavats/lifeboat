import { MARK, wordBitmap, type Bitmap } from "./pixels.js";

/** A bitmap as crisp SVG squares, in the current text or accent colour. */
export function PixelArt({ bitmap, size, gap = 0.12, className, label }: { bitmap: Bitmap; size: number; gap?: number; className?: string; label?: string }) {
  const s = 1 - gap;
  return (
    <svg
      className={className}
      width={bitmap.cols * size}
      height={bitmap.rows * size}
      viewBox={`0 0 ${bitmap.cols} ${bitmap.rows}`}
      shapeRendering="crispEdges"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {bitmap.cells.map(([x, y]) => (
        <rect key={`${x}.${y}`} x={x} y={y} width={s} height={s} fill="currentColor" />
      ))}
    </svg>
  );
}

const SMALL_WORD = wordBitmap("LIFEBOAT", false);
export const Mark = ({ size = 3 }: { size?: number }) => <PixelArt bitmap={MARK} size={size} gap={0} className="mark" />;
export const SmallWordmark = ({ size = 3 }: { size?: number }) => <PixelArt bitmap={SMALL_WORD} size={size} gap={0.15} label="Lifeboat" className="wordmark-px" />;
