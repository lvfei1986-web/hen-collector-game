import { Rect, MapBounds, overlapsAny } from '../utils/collision';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../utils/constants';
import backgardenUrl from '../../map/backgarden.png';
import islandUrl from '../../map/island.png';

export interface MapData {
  obstacles: Rect[];
  henStart: { x: number; y: number };
  bgImage: HTMLImageElement | null;
  bounds: MapBounds;
}

interface MapAsset {
  img: HTMLImageElement;
  loaded: boolean;
  bounds: MapBounds;
}

const mapAssets: MapAsset[] = [];

function initMapAssets(): void {
  if (mapAssets.length > 0) return;
  const configs = [
    { url: backgardenUrl, bounds: { left: 60, top: 60, right:60, bottom: 60 } },
    { url: islandUrl, bounds: { left: 120, top: 140, right: 120, bottom: 140 } },
  ];
  for (const cfg of configs) {
    const img = new Image();
    const asset: MapAsset = { img, loaded: false, bounds: cfg.bounds };
    img.onload = () => { asset.loaded = true; };
    img.src = cfg.url;
    mapAssets.push(asset);
  }
}

initMapAssets();

export class MapGenerator {
  static generate(): MapData {
    const obstacles: Rect[] = [];
    const totalArea = CANVAS_WIDTH * CANVAS_HEIGHT;
    const maxObstacleArea = totalArea * 0.28;
    let usedArea = 0;

    const attempts = 120;
    for (let i = 0; i < attempts && usedArea < maxObstacleArea; i++) {
      const w = 30 + Math.random() * 80;
      const h = 30 + Math.random() * 60;
      const margin = 60;
      const x = margin + Math.random() * (CANVAS_WIDTH - w - margin * 2);
      const y = margin + Math.random() * (CANVAS_HEIGHT - h - margin * 2);
      const rect: Rect = { x, y, width: w, height: h };
      const inflated: Rect = { x: rect.x - 8, y: rect.y - 8, width: rect.width + 16, height: rect.height + 16 };
      if (!overlapsAny(inflated, obstacles)) {
        obstacles.push(rect);
        usedArea += w * h;
      }
    }

    const henStart = {
      x: CANVAS_WIDTH / 2 - 14,
      y: CANVAS_HEIGHT / 2 - 14,
    };

    const henRect: Rect = { x: henStart.x - 20, y: henStart.y - 20, width: 80, height: 80 };
    if (overlapsAny(henRect, obstacles)) {
      obstacles.length = 0;
    }

    const choice = mapAssets[Math.floor(Math.random() * mapAssets.length)];
    const bgImage = choice.loaded ? choice.img : null;

    return { obstacles, henStart, bgImage, bounds: choice.bounds };
  }

  static findFreeSpot(size: number, obstacles: Rect[], existing: Rect[], bounds?: MapBounds): { x: number; y: number } | null {
    const left = bounds?.left ?? 40;
    const top = bounds?.top ?? 40;
    const rightEdge = bounds ? CANVAS_WIDTH - bounds.right : CANVAS_WIDTH - 40;
    const bottomEdge = bounds ? CANVAS_HEIGHT - bounds.bottom : CANVAS_HEIGHT - 40;
    for (let i = 0; i < 80; i++) {
      const x = left + Math.random() * (rightEdge - left - size);
      const y = top + Math.random() * (bottomEdge - top - size);
      const rect: Rect = { x, y, width: size, height: size };
      const inflated: Rect = { x: x - 4, y: y - 4, width: size + 8, height: size + 8 };
      if (!overlapsAny(inflated, obstacles) && !overlapsAny(inflated, existing)) {
        return { x, y };
      }
    }
    return null;
  }

  static findSpotNear(
    center: { x: number; y: number },
    size: number,
    obstacles: Rect[],
    existing: Rect[],
    minDist: number,
    maxDist: number,
    bounds?: MapBounds
  ): { x: number; y: number } | null {
    const minX = bounds?.left ?? 20;
    const minY = bounds?.top ?? 20;
    const maxX = bounds ? CANVAS_WIDTH - bounds.right - size : CANVAS_WIDTH - 20 - size;
    const maxY = bounds ? CANVAS_HEIGHT - bounds.bottom - size : CANVAS_HEIGHT - 20 - size;
    for (let i = 0; i < 60; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = minDist + Math.random() * (maxDist - minDist);
      const x = center.x + Math.cos(ang) * dist - size / 2;
      const y = center.y + Math.sin(ang) * dist - size / 2;
      if (x < minX || y < minY || x > maxX || y > maxY) continue;
      const rect: Rect = { x, y, width: size, height: size };
      const inflated: Rect = { x: x - 4, y: y - 4, width: size + 8, height: size + 8 };
      if (!overlapsAny(inflated, obstacles) && !overlapsAny(inflated, existing)) {
        return { x, y };
      }
    }
    return this.findFreeSpot(size, obstacles, existing, bounds);
  }

  static findFarthestSpotFrom(
    target: { x: number; y: number },
    size: number,
    obstacles: Rect[],
    existing: Rect[]
  ): { x: number; y: number } | null {
    const corners = [
      { x: 60, y: 60 },
      { x: CANVAS_WIDTH - 60 - size, y: 60 },
      { x: 60, y: CANVAS_HEIGHT - 60 - size },
      { x: CANVAS_WIDTH - 60 - size, y: CANVAS_HEIGHT - 60 - size },
    ];
    const sorted = corners
      .map((c) => ({ c, d: Math.hypot(c.x + size / 2 - target.x, c.y + size / 2 - target.y) }))
      .sort((a, b) => b.d - a.d);

    for (const { c } of sorted) {
      const rect: Rect = { x: c.x, y: c.y, width: size, height: size };
      const inflated: Rect = { x: c.x - 8, y: c.y - 8, width: size + 16, height: size + 16 };
      if (!overlapsAny(inflated, obstacles) && !overlapsAny(inflated, existing)) {
        return c;
      }
    }

    let best: { x: number; y: number } | null = null;
    let bestD = 0;
    for (let i = 0; i < 120; i++) {
      const margin = 50;
      const x = margin + Math.random() * (CANVAS_WIDTH - size - margin * 2);
      const y = margin + Math.random() * (CANVAS_HEIGHT - size - margin * 2);
      const rect: Rect = { x, y, width: size, height: size };
      const inflated: Rect = { x: x - 4, y: y - 4, width: size + 8, height: size + 8 };
      if (overlapsAny(inflated, obstacles) || overlapsAny(inflated, existing)) continue;
      const d = Math.hypot(x + size / 2 - target.x, y + size / 2 - target.y);
      if (d > bestD) {
        bestD = d;
        best = { x, y };
      }
    }
    return best;
  }
}
