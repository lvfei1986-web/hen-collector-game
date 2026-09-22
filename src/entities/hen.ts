import { Entity } from './entity';
import { CANVAS_WIDTH, CANVAS_HEIGHT, HEN_SIZE, HEN_BASE_SPEED, HEN_DASH_SPEED, HEN_CHICK_GAP, SPEED_BOOST_MULTIPLIER, MAX_TOTAL_CHICKS, FREEZE_DURATION } from '../utils/constants';
import { InputManager } from '../utils/input';
import { Rect, MapBounds, isColliding, clampToBounds, clampToMapBounds } from '../utils/collision';
import { Chick } from './chick';
import { Inventory } from './item';
import { SpriteManager, drawSprite } from '../utils/spriteManager';

const PATH_STEP = 3;

export class Hen extends Entity {
  path: { x: number; y: number }[] = [];
  private input: InputManager;
  team: Chick[] = [];
  inventory: Inventory = new Inventory();
  private lastPathPush: { x: number; y: number };

  isDashing = false;

  mapBounds: MapBounds | null = null;

  speedBoostTimer = 0;
  shieldTimer = 0;
  freezeTimer = 0;
  trail: { x: number; y: number; alpha: number }[] = [];

  freeze(): void {
    this.freezeTimer = Math.max(this.freezeTimer, FREEZE_DURATION);
  }

  get frozen(): boolean {
    return this.freezeTimer > 0;
  }

  constructor(x: number, y: number, input: InputManager) {
    super(x, y, HEN_SIZE, HEN_SIZE, HEN_BASE_SPEED);
    this.input = input;
    const init = { x: this.centerX, y: this.centerY };
    this.path.push(init);
    this.lastPathPush = init;
  }

  get effectiveSpeed(): number {
    let s = this.isDashing ? HEN_DASH_SPEED : this.speed;
    if (this.speedBoostTimer > 0) s *= SPEED_BOOST_MULTIPLIER;
    return s;
  }

  update(dt: number, aiDir?: { dx: number; dy: number }): void {
    if (this.speedBoostTimer > 0) this.speedBoostTimer -= dt;
    if (this.shieldTimer > 0) this.shieldTimer -= dt;
    if (this.freezeTimer > 0) this.freezeTimer -= dt;

    if (this.freezeTimer > 0) {
      this.vx = 0;
      this.vy = 0;
      this.followTeam();
      return;
    }

    const dir = aiDir ?? this.input.getDirection();
    this.vx = dir.dx;
    this.vy = dir.dy;

    const len = Math.hypot(this.vx, this.vy) || 1;
    const mvx = (this.vx / len) * this.effectiveSpeed * dt;
    const mvy = (this.vy / len) * this.effectiveSpeed * dt;

    this.x += mvx;
    this.y += mvy;

    if (this.mapBounds) {
      const clamped = clampToMapBounds(this.boundingBox(), this.mapBounds, CANVAS_WIDTH, CANVAS_HEIGHT);
      this.x = clamped.x;
      this.y = clamped.y;
    } else {
      const clamped = clampToBounds(this.boundingBox(), CANVAS_WIDTH, CANVAS_HEIGHT);
      this.x = clamped.x;
      this.y = clamped.y;
    }

    const cx = this.centerX;
    const cy = this.centerY;
    const moved = Math.hypot(cx - this.lastPathPush.x, cy - this.lastPathPush.y);
    if (moved >= PATH_STEP) {
      this.path.push({ x: cx, y: cy });
      this.lastPathPush = { x: cx, y: cy };
    }
    const maxPathLen = Math.ceil((MAX_TOTAL_CHICKS + 2) * HEN_CHICK_GAP / PATH_STEP) + 5;
    while (this.path.length > maxPathLen) this.path.shift();

    this.trail.push({ x: cx, y: cy, alpha: this.isDashing ? 0.6 : 0.2 });
    for (const t of this.trail) t.alpha -= dt * 2;
    this.trail = this.trail.filter((t) => t.alpha > 0).slice(-25);

    this.followTeam();
  }

  followTeam(): void {
    const path = this.path;
    if (path.length < 2) return;

    for (let i = 0; i < this.team.length; i++) {
      const chick = this.team[i];
      const targetDist = (i + 1) * HEN_CHICK_GAP;

      let accDist = 0;
      let found = false;

      for (let j = path.length - 1; j > 0; j--) {
        const a = path[j];
        const b = path[j - 1];
        const segLen = Math.hypot(a.x - b.x, a.y - b.y);

        if (accDist + segLen >= targetDist) {
          const remain = targetDist - accDist;
          const t = segLen > 0 ? remain / segLen : 0;
          const px = a.x + (b.x - a.x) * t;
          const py = a.y + (b.y - a.y) * t;
          chick.moveTo(px - chick.width / 2, py - chick.height / 2);
          found = true;
          break;
        }
        accDist += segLen;
      }

      if (!found) {
        const first = path[0];
        chick.moveTo(first.x - chick.width / 2, first.y - chick.height / 2);
      }
    }
  }

  tryDash(): boolean {
    if (this.isDashing) return true;
    this.isDashing = true;
    return true;
  }

  endDash(): void {
    this.isDashing = false;
  }

  collidesWith(obstacles: Rect[]): boolean {
    const b = this.boundingBox();
    for (const o of obstacles) {
      if (isColliding(b, o)) return true;
    }
    return false;
  }

  render(ctx: CanvasRenderingContext2D): void {
    for (const t of this.trail) {
      ctx.globalAlpha = t.alpha;
      ctx.fillStyle = this.isDashing ? '#ff6b35' : '#ffb347';
      ctx.beginPath();
      ctx.arc(t.x, t.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const sprite = SpriteManager.getInstance().get('hen');
    if (sprite) {
      drawSprite(ctx, sprite, this.centerX, this.centerY, this.width, this.height);
    } else {
      ctx.fillStyle = '#ff8c42';
      ctx.beginPath();
      ctx.ellipse(this.centerX, this.centerY, this.width / 2, this.height / 2, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(this.centerX + 6, this.centerY - 4, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(this.centerX + 7, this.centerY - 4, 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ff6347';
      ctx.beginPath();
      ctx.moveTo(this.centerX + this.width / 2, this.centerY - 2);
      ctx.lineTo(this.centerX + this.width / 2 + 8, this.centerY);
      ctx.lineTo(this.centerX + this.width / 2, this.centerY + 2);
      ctx.closePath();
      ctx.fill();
    }

    if (this.shieldTimer > 0) {
      ctx.strokeStyle = `rgba(120, 200, 255, ${0.4 + Math.sin(Date.now() / 200) * 0.3})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this.centerX, this.centerY, this.width * 0.8, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
