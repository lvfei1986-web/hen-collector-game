import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'leaderboard.json');
const MAX_ENTRIES = 20;

// 确保数据目录和文件存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, '[]', 'utf-8');
}

/** 读取榜单数据 */
function readLeaderboard() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** 写入榜单数据 */
function writeLeaderboard(entries) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(entries, null, 2), 'utf-8');
}

app.use(express.json());

// 简单的 CORS 支持（生产环境部署时可用）
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// 获取榜单列表
app.get('/api/leaderboard', (req, res) => {
  const entries = readLeaderboard();
  res.json(entries);
});

// 添加榜单条目
app.post('/api/leaderboard', (req, res) => {
  const { name, time, won, timestamp } = req.body;

  // 参数校验
  if (typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: '名字不能为空' });
  }
  if (typeof time !== 'number' || time < 0) {
    return res.status(400).json({ error: '无效的时间' });
  }

  const entries = readLeaderboard();
  entries.push({
    name: name.trim().slice(0, 12),
    time,
    won: !!won,
    timestamp: typeof timestamp === 'number' ? timestamp : Date.now(),
  });

  // 按时间升序排序，时间相同按时间戳升序
  entries.sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time;
    return a.timestamp - b.timestamp;
  });

  const trimmed = entries.slice(0, MAX_ENTRIES);
  writeLeaderboard(trimmed);
  res.json(trimmed);
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`榜单服务已启动: http://localhost:${PORT}`);
  console.log(`数据文件: ${DATA_FILE}`);
});
