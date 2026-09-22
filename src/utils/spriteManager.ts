export type SpriteKey = 'hen' | 'chick' | 'eagle';

const STORAGE_KEY = 'hen-game-sprites';

import henDefaultUrl from '../../role/母鸡.png';
import chickDefaultUrl from '../../role/小鸡.png';
import eagleDefaultUrl from '../../role/老鹰.png';

const DEFAULT_URLS: Record<SpriteKey, string> = {
  hen: henDefaultUrl,
  chick: chickDefaultUrl,
  eagle: eagleDefaultUrl,
};

interface SpriteAsset {
  img: HTMLImageElement;
  loaded: boolean;
}

export class SpriteManager {
  private static instance: SpriteManager;
  private sprites: Map<SpriteKey, SpriteAsset> = new Map();

  static getInstance(): SpriteManager {
    if (!SpriteManager.instance) SpriteManager.instance = new SpriteManager();
    return SpriteManager.instance;
  }

  init(): void {
    const saved = this.loadFromStorage();
    for (const key of ['hen', 'chick', 'eagle'] as SpriteKey[]) {
      const src = saved[key] ?? DEFAULT_URLS[key];
      this.load(key, src);
    }
  }

  get(key: SpriteKey): HTMLImageElement | null {
    const s = this.sprites.get(key);
    return s?.loaded ? s.img : null;
  }

  isLoaded(key: SpriteKey): boolean {
    return this.sprites.get(key)?.loaded ?? false;
  }

  setFromDataURL(key: SpriteKey, dataUrl: string): Promise<void> {
    return new Promise((resolve) => {
      this.load(key, dataUrl, () => {
        const saved = this.loadFromStorage();
        saved[key] = dataUrl;
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
        } catch {
          // localStorage quota exceeded — ignore
        }
        resolve();
      });
    });
  }

  reset(key: SpriteKey): void {
    const saved = this.loadFromStorage();
    delete saved[key];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    this.load(key, DEFAULT_URLS[key]);
  }

  resetAll(): void {
    localStorage.removeItem(STORAGE_KEY);
    for (const key of ['hen', 'chick', 'eagle'] as SpriteKey[]) {
      this.load(key, DEFAULT_URLS[key]);
    }
  }

  private load(key: SpriteKey, src: string, onDone?: () => void): void {
    const img = new Image();
    const asset: SpriteAsset = { img, loaded: false };
    this.sprites.set(key, asset);

    img.onload = () => {
      asset.loaded = true;
      if (!img.parentElement) {
        img.style.cssText = 'position:absolute;visibility:hidden;width:0;height:0;pointer-events:none;';
        document.body.appendChild(img);
      }
      onDone?.();
    };
    img.onerror = () => {
      asset.loaded = false;
      onDone?.();
    };
    img.src = src;
  }

  private loadFromStorage(): Partial<Record<SpriteKey, string>> {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  }
}

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cx: number,
  cy: number,
  targetW: number,
  targetH: number
): void {
  const iw = img.naturalWidth || targetW;
  const ih = img.naturalHeight || targetH;
  const scale = Math.min(targetW / iw, targetH / ih);
  const w = iw * scale;
  const h = ih * scale;
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
}
