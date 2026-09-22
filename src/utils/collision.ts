export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MapBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function isColliding(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function clampToBounds(
  rect: Rect,
  width: number,
  height: number
): Rect {
  return {
    x: Math.max(0, Math.min(rect.x, width - rect.width)),
    y: Math.max(0, Math.min(rect.y, height - rect.height)),
    width: rect.width,
    height: rect.height,
  };
}

export function clampToMapBounds(
  rect: Rect,
  bounds: MapBounds,
  canvasW: number,
  canvasH: number
): Rect {
  const rightEdge = canvasW - bounds.right;
  const bottomEdge = canvasH - bounds.bottom;
  return {
    x: Math.max(bounds.left, Math.min(rect.x, rightEdge - rect.width)),
    y: Math.max(bounds.top, Math.min(rect.y, bottomEdge - rect.height)),
    width: rect.width,
    height: rect.height,
  };
}

export function overlapsAny(rect: Rect, rects: Rect[]): boolean {
  return rects.some((r) => isColliding(rect, r));
}
