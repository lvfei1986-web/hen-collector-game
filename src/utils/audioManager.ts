export type BgmKey = 'bgm';

export type SfxKey =
  | 'collect'
  | 'itemPickup'
  | 'itemUse'
  | 'eagleSpawn'
  | 'eagleHit'
  | 'dash'
  | 'win'
  | 'lose'
  | 'itemFreeze'
  | 'itemSpeed'
  | 'itemShield'
  | 'itemType'
  | 'itemTextBall';

export type AudioKey = BgmKey | SfxKey;

const STORAGE_KEY = 'hen-game-audio';
const VOLUME_KEY = 'hen-game-audio-volume';

import defaultBgmUrl from '../../sound/backmusic.mp3';
import defaultFreezeUrl from '../../sound/ice.mp3';
import defaultSpeedUrl from '../../sound/speed.mp3';
import defaultShieldUrl from '../../sound/shield.mp3';
import defaultTypeUrl from '../../sound/type.mp3';
import defaultTextBallUrl from '../../sound/textball.mp3';

interface AudioAsset {
  audio: HTMLAudioElement;
  loaded: boolean;
  custom: boolean;
}

const SFX_LABELS: Record<SfxKey, string> = {
  collect: '收集小鸡',
  itemPickup: '拾取道具',
  itemUse: '使用道具',
  eagleSpawn: '老鹰出现',
  eagleHit: '老鹰受伤',
  dash: '冲刺',
  win: '胜利',
  lose: '失败',
  itemFreeze: '冰冻道具',
  itemSpeed: '加速道具',
  itemShield: '盾牌道具',
  itemType: '打字音',
  itemTextBall: '弹球反弹',
};

/** 有默认音效文件的 key → 默认URL映射 */
const DEFAULT_SFX: Partial<Record<SfxKey, string>> = {
  itemFreeze: defaultFreezeUrl,
  itemSpeed: defaultSpeedUrl,
  itemShield: defaultShieldUrl,
  itemType: defaultTypeUrl,
  itemTextBall: defaultTextBallUrl,
};

/**
 * 校验 localStorage 中读取到的自定义音频 URL 是否为合法可用值。
 * 仅允许：data:URL(base64)、http(s) 绝对URL、Vite打包后的 /assets/ 带哈希URL。
 * 禁止：相对路径 sound/xxx.mp3、/sound/xxx.mp3 等未经打包的直链。
 */
function isValidCustomAudioUrl(url: unknown): url is string {
  if (typeof url !== 'string' || url.length === 0) return false;
  if (url.startsWith('data:')) return true;
  if (url.startsWith('http://') || url.startsWith('https://')) return true;
  // Vite import 生成的开发/生产URL：包含/assets/ 或带查询参数hash或 .mp3前有长hash
  if (url.startsWith('/assets/') || /\.(mp3|wav|ogg)(\?|$)/.test(url)) {
    // 排除可疑的未打包直链（sound/或/sound/开头）
    if (url.startsWith('sound/') || url.startsWith('/sound/')) return false;
    return true;
  }
  return false;
}

/**
 * 保证所有 volume 赋值为 0-1 区间的有限数。
 * - 非数字 / Infinity / NaN / 负数 → 回落到 0
 * - >1 → 钳制到 1
 */
function clampVolume(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

export class AudioManager {
  private static instance: AudioManager;
  private bgmAssets: Map<BgmKey, AudioAsset> = new Map();
  private sfxAssets: Map<SfxKey, AudioAsset> = new Map();
  private bgmVolume = 0.4;
  private sfxVolume = 0.6;
  private muted = false;
  private bgmWantsToPlay = false;

  static getInstance(): AudioManager {
    if (!AudioManager.instance) AudioManager.instance = new AudioManager();
    return AudioManager.instance;
  }

  init(): void {
    const vol = this.loadVolume();
    this.bgmVolume = vol.bgm;
    this.sfxVolume = vol.sfx;
    this.muted = vol.muted;

    const saved = this.loadFromStorage();
    // bgm：仅当 localStorage 存的是合法自定义URL时使用，否则强制用 import 的默认资源
    const bgmUrl = isValidCustomAudioUrl(saved.bgm) ? saved.bgm : defaultBgmUrl;
    const bgmIsCustom = isValidCustomAudioUrl(saved.bgm) && saved.bgm !== defaultBgmUrl;
    this.loadBgm('bgm', bgmUrl, bgmIsCustom);
    // 若存在非法bgm值（如旧的 sound/backmusic.mp3），清理掉避免下次继续读错
    if (saved.bgm && !isValidCustomAudioUrl(saved.bgm)) {
      delete (saved as any).bgm;
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch { /* ignore */ }
    }

    for (const key of Object.keys(SFX_LABELS) as SfxKey[]) {
      // 优先用户自定义URL（校验合法），其次默认URL
      const customUrl = isValidCustomAudioUrl(saved[key]) ? saved[key] : null;
      const defaultUrl = DEFAULT_SFX[key] ?? null;
      if (customUrl) {
        this.loadSfx(key, customUrl, true);
      } else if (defaultUrl) {
        this.loadSfx(key, defaultUrl, false);
      }
      // 清理非法 sfx 值
      if (saved[key] && !isValidCustomAudioUrl(saved[key])) {
        delete (saved as any)[key];
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch { /* ignore */ }
      }
    }
  }

  get sfxLabelMap(): Record<SfxKey, string> {
    return SFX_LABELS;
  }

  get sfxKeys(): SfxKey[] {
    return Object.keys(SFX_LABELS) as SfxKey[];
  }

  get bgmVolumeValue(): number {
    return this.bgmVolume;
  }

  get sfxVolumeValue(): number {
    return this.sfxVolume;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  setBgmVolume(v: number): void {
    this.bgmVolume = clampVolume(v);
    this.applyVolume();
    this.saveVolume();
  }

  setSfxVolume(v: number): void {
    this.sfxVolume = clampVolume(v);
    this.saveVolume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.applyVolume();
    this.saveVolume();
    return this.muted;
  }

  isCustom(key: AudioKey): boolean {
    if (key === 'bgm') return this.bgmAssets.get(key)?.custom ?? false;
    return this.sfxAssets.get(key)?.custom ?? false;
  }

  setFromDataURL(key: AudioKey, dataUrl: string): Promise<void> {
    return new Promise((resolve) => {
      const audio = new Audio();
      const asset: AudioAsset = { audio, loaded: false, custom: true };

      audio.addEventListener('canplaythrough', () => {
        asset.loaded = true;
        resolve();
      }, { once: true });
      audio.addEventListener('error', () => {
        asset.loaded = false;
        resolve();
      }, { once: true });

      audio.src = dataUrl;
      audio.load();

      if (key === 'bgm') {
        audio.loop = true;
        this.bgmAssets.set(key, asset);
      } else {
        this.sfxAssets.set(key, asset);
      }

      const saved = this.loadFromStorage();
      (saved as any)[key] = dataUrl;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      } catch {
        // localStorage quota exceeded - ignore
      }
      this.applyVolume();
    });
  }

  reset(key: AudioKey): void {
    const saved = this.loadFromStorage();
    delete (saved as any)[key];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));

    if (key === 'bgm') {
      this.loadBgm('bgm', defaultBgmUrl, false);
    } else {
      // 默认音效重置时恢复默认URL
      const defaultUrl = DEFAULT_SFX[key];
      if (defaultUrl) {
        this.loadSfx(key, defaultUrl, false);
      } else {
        this.sfxAssets.delete(key);
      }
    }
  }

  resetAll(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.sfxAssets.clear();
    this.loadBgm('bgm', defaultBgmUrl, false);
    // 重置后重新加载默认道具音效
    for (const [k, url] of Object.entries(DEFAULT_SFX) as [SfxKey, string][]) {
      this.loadSfx(k, url, false);
    }
  }

  startBgm(): void {
    this.bgmWantsToPlay = true;
    const asset = this.bgmAssets.get('bgm');
    if (!asset?.loaded) return;
    asset.audio.currentTime = 0;
    asset.audio.play().catch(() => {});
  }

  stopBgm(): void {
    this.bgmWantsToPlay = false;
    const asset = this.bgmAssets.get('bgm');
    if (!asset?.loaded) return;
    asset.audio.pause();
    asset.audio.currentTime = 0;
  }

  pauseBgm(): void {
    this.bgmWantsToPlay = false;
    const asset = this.bgmAssets.get('bgm');
    if (!asset?.loaded) return;
    asset.audio.pause();
  }

  playSfx(key: SfxKey): void {
    if (this.muted) return;
    const asset = this.sfxAssets.get(key);
    if (!asset?.loaded) return;
    // Clone for overlapping playback
    const clone = asset.audio.cloneNode() as HTMLAudioElement;
    clone.volume = clampVolume(this.muted ? 0 : this.sfxVolume);
    clone.play().catch(() => {});
  }

  preview(key: AudioKey): void {
    if (key === 'bgm') {
      const asset = this.bgmAssets.get('bgm');
      if (!asset?.loaded) return;
      if (asset.audio.paused) {
        asset.audio.currentTime = 0;
        asset.audio.play().catch(() => {});
      } else {
        asset.audio.pause();
      }
    } else {
      this.playSfx(key);
    }
  }

  stopPreview(): void {
    const asset = this.bgmAssets.get('bgm');
    if (asset?.loaded) {
      asset.audio.pause();
      asset.audio.currentTime = 0;
    }
  }

  private applyVolume(): void {
    const bgm = this.bgmAssets.get('bgm');
    if (bgm?.loaded) {
      const v = clampVolume(this.muted ? 0 : this.bgmVolume);
      try {
        bgm.audio.volume = v;
      } catch {
        // 浏览器或非有限值导致的错误都被兜底，不再向上抛导致初始化中断
      }
    }
  }

  private loadBgm(key: BgmKey, src: string | null, custom: boolean = true): void {
    if (!src) return;
    const audio = new Audio();
    audio.loop = true;
    const asset: AudioAsset = { audio, loaded: false, custom };
    audio.addEventListener('canplaythrough', () => {
      asset.loaded = true;
      this.applyVolume();
      if (this.bgmWantsToPlay) {
        asset.audio.currentTime = 0;
        asset.audio.play().catch(() => {});
      }
    }, { once: true });
    audio.addEventListener('error', () => {
      asset.loaded = false;
    }, { once: true });
    audio.src = src;
    audio.load();
    this.bgmAssets.set(key, asset);
  }

  private loadSfx(key: SfxKey, dataUrl: string | null, custom: boolean = true): void {
    if (!dataUrl) return;
    const audio = new Audio();
    const asset: AudioAsset = { audio, loaded: false, custom };
    audio.addEventListener('canplaythrough', () => {
      asset.loaded = true;
    }, { once: true });
    audio.addEventListener('error', () => {
      asset.loaded = false;
    }, { once: true });
    audio.src = dataUrl;
    audio.load();
    this.sfxAssets.set(key, asset);
  }

  private loadFromStorage(): Record<string, string> {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  }

  private loadVolume(): { bgm: number; sfx: number; muted: boolean } {
    const DEFAULTS: { bgm: number; sfx: number; muted: boolean } = { bgm: 0.4, sfx: 0.6, muted: false };
    try {
      const raw = JSON.parse(localStorage.getItem(VOLUME_KEY) || '{}');
      const bgm = clampVolume(
        typeof raw.bgm === 'number' && Number.isFinite(raw.bgm) ? raw.bgm : DEFAULTS.bgm
      );
      const sfx = clampVolume(
        typeof raw.sfx === 'number' && Number.isFinite(raw.sfx) ? raw.sfx : DEFAULTS.sfx
      );
      const muted = typeof raw.muted === 'boolean' ? raw.muted : DEFAULTS.muted;
      return { bgm, sfx, muted };
    } catch {
      return DEFAULTS;
    }
  }

  private saveVolume(): void {
    localStorage.setItem(VOLUME_KEY, JSON.stringify({
      bgm: this.bgmVolume,
      sfx: this.sfxVolume,
      muted: this.muted,
    }));
  }
}
