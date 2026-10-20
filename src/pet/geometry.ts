export interface Point { x: number; y: number }
export interface Viewport { left: number; top: number; right: number; bottom: number }
export interface Surface { id: string; left: number; right: number; y: number; kind: 'folder' | 'file' | 'tab' | 'leaf' | 'ground' }

const finite = (n: number, fallback: number): number => Number.isFinite(n) ? n : fallback;
export const clamp = (n: number, min: number, max: number): number => Math.min(Math.max(min, max), Math.max(min, finite(n, min)));

/** Positions are the top-left of the entire cat, in its owner window. */
export function clampPosition(point: Point, size: number, viewport: Viewport): Point {
  const safeSize = Math.max(0, finite(size, 0));
  return {
    x: clamp(point.x, viewport.left, viewport.right - safeSize),
    y: clamp(point.y, viewport.top, viewport.bottom - safeSize)
  };
}

export function viewportGround(viewport: Viewport, padding = 14): Surface {
  return { id: 'ground', left: viewport.left, right: viewport.right,
    y: Math.max(viewport.top, viewport.bottom - Math.max(0, padding)), kind: 'ground' };
}

/** The first ledge below the feet that supports the cat's center. */
export function nearestSurface(position: Point, size: number, surfaces: readonly Surface[], ground: Surface): Surface {
  const feet = position.y + size;
  const center = position.x + size / 2;
  return surfaces.filter(s => Number.isFinite(s.y) && s.y >= feet - 2 && s.y <= ground.y
    && center >= s.left + Math.min(size / 4, 8) && center <= s.right - Math.min(size / 4, 8))
    .sort((a, b) => a.y - b.y)[0] ?? ground;
}

/** Reject invisible, clipped, too narrow or off-screen host geometry. */
export function surfaceFromRect(rect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom' | 'width' | 'height'>,
  kind: Exclude<Surface['kind'], 'ground'>, id: string, viewport: Viewport, size: number): Surface | null {
  const y = kind === 'leaf' ? rect.bottom - 8 : rect.top;
  const left = Math.max(viewport.left, rect.left);
  const right = Math.min(viewport.right, rect.right);
  if (![left, right, y, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0
    || right - left < Math.min(size * 0.65, 40) || y < viewport.top + size || y > viewport.bottom - 8) return null;
  return { id, left, right, y, kind };
}
