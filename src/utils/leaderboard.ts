export interface LeaderboardEntry {
  name: string;
  time: number;
  won: boolean;
  timestamp: number;
}

/** API 超时时间（毫秒） */
const API_TIMEOUT = 5000;

/** 带超时的 fetch 封装 */
async function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** 从后端加载榜单列表 */
export async function loadLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetchWithTimeout('/api/leaderboard');
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * 向后端添加榜单条目，返回更新后的榜单。
 * 失败时抛出异常（网络错误、后端未启动、参数校验失败等），
 * 以便调用方正确感知保存结果，而不是静默吞掉错误。
 */
export async function addLeaderboardEntry(entry: LeaderboardEntry): Promise<LeaderboardEntry[]> {
  const res = await fetchWithTimeout('/api/leaderboard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
  if (!res.ok) {
    // 尝试读取后端返回的错误信息
    let detail = `HTTP ${res.status}`;
    try {
      const errBody = await res.json();
      if (errBody && typeof errBody.error === 'string') detail = errBody.error;
    } catch { /* ignore */ }
    throw new Error(`保存失败: ${detail}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export function formatTime(seconds: number): string {
  const s = Math.floor(seconds);
  const mm = Math.floor(s / 60).toString().padStart(2, '0');
  const ss = (s % 60).toString().padStart(2, '0');
  const ms = Math.floor((seconds - s) * 100).toString().padStart(2, '0');
  return `${mm}:${ss}.${ms}`;
}

export function formatTimeShort(seconds: number): string {
  const s = Math.floor(seconds);
  const mm = Math.floor(s / 60).toString().padStart(2, '0');
  const ss = (s % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}
