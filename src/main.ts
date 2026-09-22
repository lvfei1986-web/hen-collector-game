import { GameLoop } from './systems/gameLoop';
import { GameManager } from './systems/gameManager';
import { InputManager } from './utils/input';
import { UIManager } from './ui/uiManager';
import { SpriteManager } from './utils/spriteManager';
import { AudioManager } from './utils/audioManager';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const input = new InputManager();
const ui = new UIManager();
const manager = new GameManager(canvas, input, ui);

SpriteManager.getInstance().init();
AudioManager.getInstance().init();

// ===== 自适应分辨率：根据 #app 显示尺寸和设备像素比设置 canvas 内部分辨率 =====
// 游戏逻辑始终使用 800x600 坐标系，由 GameManager.render 中的 setTransform 完成映射
function resizeCanvas(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 3); // 限制最大3倍，避免高分屏过度消耗
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(1, Math.round(rect.width));
  const cssH = Math.max(1, Math.round(rect.height));
  const newW = Math.round(cssW * dpr);
  const newH = Math.round(cssH * dpr);
  // 仅当尺寸变化时才重设，避免每帧重置清空画布
  if (canvas.width !== newW || canvas.height !== newH) {
    canvas.width = newW;
    canvas.height = newH;
  }
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);
// 全屏切换、设备旋转等场景也响应
window.addEventListener('orientationchange', resizeCanvas);

const loop = new GameLoop(
  (dt) => manager.update(dt),
  () => manager.render()
);

loop.start();

if (import.meta.env.DEV) {
  (window as any).__game = {
    start: () => manager.startGame(ui.getRole()),
    getState: () => ({
      time: (manager as any).gameTime,
      eagleLives: (manager as any).eagle?.lives,
      teamLength: (manager as any).hen?.team.length,
      stamina: (manager as any).skillSystem.stamina,
      state: (manager as any).gameState,
    }),
    killEagle: () => {
      if ((manager as any).eagle) (manager as any).eagle.lives = 0;
    },
    killAllTeam: () => {
      if ((manager as any).hen) {
        (manager as any).hen.team.length = 0;
        (manager as any).everAbsorbed = true;
      }
    },
  };
}
