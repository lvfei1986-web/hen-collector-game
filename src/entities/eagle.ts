import { Entity } from './entity';
import {
  EAGLE_SIZE, EAGLE_BASE_SPEED, CANVAS_WIDTH, CANVAS_HEIGHT,
  EAGLE_MAX_LIVES, EAGLE_MAX_ARMOR, EAGLE_ARMOR_REGEN_DELAY, EAGLE_ARMOR_REGEN_RATE,
  EAGLE_INVINCIBLE_DURATION, EAGLE_STUN_DURATION, EAGLE_FREEZE_DURATION,
  SPEED_BOOST_DURATION, SPEED_BOOST_MULTIPLIER,
  EAGLE_DODGE_RANGE, EAGLE_DODGE_DURATION, EAGLE_DODGE_COOLDOWN,
  EAGLE_ITEM_CHECK_INTERVAL, SHIELD_DURATION,
} from '../utils/constants';
import { Rect, isColliding, clampToBounds } from '../utils/collision';
import { Inventory, ItemType } from './item';
import { Chick } from './chick';
import { SpriteManager, drawSprite } from '../utils/spriteManager';

export interface HenThreat {
  centerX: number;
  centerY: number;
  vx: number;
  vy: number;
  isDashing: boolean;
}

export class Eagle extends Entity {
  lives: number = EAGLE_MAX_LIVES;
  armor: number = EAGLE_MAX_ARMOR;
  maxArmor: number = EAGLE_MAX_ARMOR;
  armorRegenDelay: number = 0;
  invincibleTimer = 0;
  stunTimer = 0;
  freezeTimer = 0;
  speedBoostTimer = 0;
  shieldTimer = 0;
  target: Chick | null = null;
  inventory: Inventory = new Inventory();
  flashVisible = true;

  private flashTimer = 0;
  private wanderTimer = 0;
  private wanderDir = { dx: 0, dy: 0 };
  private obstacleAvoidTimer = 0;
  private obstacleAvoidDir = { dx: 0, dy: 0 };

  private dodgeTimer = 0;
  private dodgeCooldownTimer = 0;
  private dodgeDir = { dx: 0, dy: 0 };

  private itemCheckTimer = 0;
  private threat: HenThreat | null = null;
  private itemTarget: { x: number; y: number } | null = null;
  private hasTeamTarget = false;  // 当前目标是否为队伍小鸡
  private justPickedUp = false;   // 刚拾取道具的标志（用于立即使用判断）

  constructor(x: number, y: number) {
    super(x, y, EAGLE_SIZE, EAGLE_SIZE, EAGLE_BASE_SPEED);
  }

  get canUseItems(): boolean {
    return this.inventory.size > 0;
  }

  setTarget(c: Chick | null, isTeam: boolean = false): void {
    this.target = c;
    this.hasTeamTarget = isTeam;
  }

  setThreat(threat: HenThreat | null): void {
    this.threat = threat;
  }

  setItemTarget(item: { x: number; y: number } | null): void {
    this.itemTarget = item;
  }

  /** 标记刚拾取了道具，用于触发"第一时间使用"判断 */
  setJustPickedUp(): void {
    this.justPickedUp = true;
    // 缩短道具检查间隔，让第一时间使用判断尽快触发
    this.itemCheckTimer = Math.min(this.itemCheckTimer, 0.15);
  }

  takeDamage(): boolean {
    if (this.shieldTimer > 0) return false;
    if (this.invincibleTimer > 0 || this.stunTimer > 0 || this.freezeTimer > 0) return false;
    if (this.armor > 0) {
      this.armor -= 1;
      this.armorRegenDelay = EAGLE_ARMOR_REGEN_DELAY;
      this.invincibleTimer = 0.3;
      return true;
    }
    this.lives -= 1;
    this.invincibleTimer = EAGLE_INVINCIBLE_DURATION;
    this.stunTimer = EAGLE_STUN_DURATION;
    return true;
  }

  freeze(): void {
    this.freezeTimer = Math.max(this.freezeTimer, EAGLE_FREEZE_DURATION);
  }

  applySpeedBoost(): void {
    this.speedBoostTimer = SPEED_BOOST_DURATION;
  }

  applyShield(): void {
    this.shieldTimer = SHIELD_DURATION;
  }

  update(dt: number): void {
    this.updateTimers(dt);

    let speedMult = 1;
    if (this.freezeTimer > 0) speedMult = 0;
    if (this.speedBoostTimer > 0) speedMult *= SPEED_BOOST_MULTIPLIER;

    this.itemCheckTimer -= dt;
    if (this.itemCheckTimer <= 0 && this.inventory.size > 0 && this.freezeTimer <= 0 && this.stunTimer <= 0) {
      this.itemCheckTimer = EAGLE_ITEM_CHECK_INTERVAL;
      const chosen = this.chooseItem();
      if (chosen) {
        this._pendingItem = chosen;
      }
    }

    if (this.dodgeTimer > 0) {
      this.dodgeTimer -= dt;
    } else if (this.dodgeCooldownTimer > 0) {
      this.dodgeCooldownTimer -= dt;
    }

    if (this.shouldDodge()) {
      this.startDodge();
    }

    const { dx, dy } = this.computeDirection();

    this.vx = dx;
    this.vy = dy;
    const len = Math.hypot(dx, dy) || 1;
    this.x += (dx / len) * this.speed * speedMult * dt;
    this.y += (dy / len) * this.speed * speedMult * dt;

    const clamped = clampToBounds(this.boundingBox(), CANVAS_WIDTH, CANVAS_HEIGHT);
    this.x = clamped.x;
    this.y = clamped.y;
  }

  private _pendingItem: ItemType | null = null;

  consumePendingItem(): ItemType | null {
    const item = this._pendingItem;
    this._pendingItem = null;
    if (item) this.inventory.shift();
    return item;
  }

  get pendingItem(): ItemType | null {
    return this._pendingItem;
  }

  updateTimers(dt: number): void {
    if (this.invincibleTimer > 0) {
      this.invincibleTimer -= dt;
      this.flashTimer += dt;
      if (this.flashTimer > 0.1) {
        this.flashVisible = !this.flashVisible;
        this.flashTimer = 0;
      }
    } else {
      this.flashVisible = true;
    }
    if (this.stunTimer > 0) this.stunTimer -= dt;
    if (this.freezeTimer > 0) this.freezeTimer -= dt;
    if (this.speedBoostTimer > 0) this.speedBoostTimer -= dt;
    if (this.shieldTimer > 0) this.shieldTimer -= dt;
    if (this.obstacleAvoidTimer > 0) this.obstacleAvoidTimer -= dt;

    if (this.armorRegenDelay > 0) {
      this.armorRegenDelay -= dt;
    } else if (this.armor < this.maxArmor) {
      this.armor = Math.min(this.maxArmor, this.armor + EAGLE_ARMOR_REGEN_RATE * dt);
    }
  }

  private shouldDodge(): boolean {
    if (!this.threat) return false;
    if (this.dodgeTimer > 0 || this.dodgeCooldownTimer > 0) return false;
    if (this.freezeTimer > 0 || this.stunTimer > 0) return false;

    const t = this.threat;
    const ddx = this.centerX - t.centerX;
    const ddy = this.centerY - t.centerY;
    const dist = Math.hypot(ddx, ddy);
    if (dist > EAGLE_DODGE_RANGE) return false;

    if (t.isDashing) return true;

    const speed = Math.hypot(t.vx, t.vy);
    if (speed <= 0) return false;
    const nvx = t.vx / speed;
    const nvy = t.vy / speed;
    const dot = (ddx * nvx + ddy * nvy);
    return dot < -20;
  }

  private startDodge(): void {
    const t = this.threat!;
    const tdx = t.centerX - this.centerX;
    const tdy = t.centerY - this.centerY;
    const tlen = Math.hypot(tdx, tdy) || 1;
    const approachX = tdx / tlen;
    const approachY = tdy / tlen;

    const perp1 = { dx: -approachY, dy: approachX };
    const perp2 = { dx: approachY, dy: -approachX };

    const score = (p: { dx: number; dy: number }) => {
      const cx = this.centerX + p.dx * 40;
      const cy = this.centerY + p.dy * 40;
      let s = 0;
      if (cx < 30 || cx > CANVAS_WIDTH - 30) s -= 100;
      if (cy < 30 || cy > CANVAS_HEIGHT - 30) s -= 100;
      for (let i = 0; i < (this.targetsCenterX?.length ?? 0); i++) {
        const tx = this.targetsCenterX![i];
        const ty = this.targetsCenterY![i];
        s += Math.hypot(tx - cx, ty - cy);
      }
      return s;
    };

    const s1 = score(perp1);
    const s2 = score(perp2);
    this.dodgeDir = s1 >= s2 ? perp1 : perp2;
    this.dodgeTimer = EAGLE_DODGE_DURATION;
    this.dodgeCooldownTimer = EAGLE_DODGE_COOLDOWN;
  }

  targetsCenterX?: number[];
  targetsCenterY?: number[];

  private computeDirection(): { dx: number; dy: number } {
    if (this.freezeTimer > 0) return { dx: 0, dy: 0 };

    if (this.dodgeTimer > 0) {
      return this.dodgeDir;
    }

    if (this.stunTimer > 0) {
      this.wanderTimer -= 1 / 60;
      if (this.wanderTimer <= 0) {
        const ang = Math.random() * Math.PI * 2;
        this.wanderDir = { dx: Math.cos(ang), dy: Math.sin(ang) };
        this.wanderTimer = 1 + Math.random() * 1.5;
      }
      return this.wanderDir;
    }

    // 背包未满且有道具目标时，权衡拾取道具与追击目标
    if (this.inventory.canAdd() && this.itemTarget) {
      const itemDx = this.itemTarget.x - this.centerX;
      const itemDy = this.itemTarget.y - this.centerY;
      const itemDist = Math.hypot(itemDx, itemDy);

      // 如果目标小鸡很近（即将抓到），优先抓小鸡
      if (this.target && this.target.alive) {
        const targetDist = Math.hypot(
          this.target.centerX - this.centerX,
          this.target.centerY - this.centerY
        );
        if (targetDist < 80 && targetDist < itemDist) {
          // 跳过拾取，继续追击目标
        } else if (itemDist < 300) {
          const len = itemDist || 1;
          return { dx: itemDx / len, dy: itemDy / len };
        }
      } else {
        const len = itemDist || 1;
        return { dx: itemDx / len, dy: itemDy / len };
      }
    }

    if (this.obstacleAvoidTimer > 0) {
      return this.obstacleAvoidDir;
    }

    if (!this.target || !this.target.alive) {
      this.wanderTimer -= 1 / 60;
      if (this.wanderTimer <= 0) {
        const ang = Math.random() * Math.PI * 2;
        this.wanderDir = { dx: Math.cos(ang), dy: Math.sin(ang) };
        this.wanderTimer = 1 + Math.random() * 1.5;
      }
      return this.wanderDir;
    }

    const tx = this.target.centerX;
    const ty = this.target.centerY;
    const ex = this.centerX;
    const ey = this.centerY;
    const ddx = tx - ex;
    const ddy = ty - ey;
    const len = Math.hypot(ddx, ddy) || 1;
    return { dx: ddx / len, dy: ddy / len };
  }

  private chooseItem(): ItemType | null {
    const items = this.inventory.all();
    if (items.length === 0) return null;

    // ===== 第一时间使用：刚拾取道具时有概率立即使用 =====
    if (this.justPickedUp) {
      this.justPickedUp = false;
      // 40% 概率立即使用最新获得的道具
      if (Math.random() < 0.4) {
        const latest = items[items.length - 1];
        // 但防御性道具在安全时不必立即用
        if (latest === 'shield' || latest === 'freeze') {
          if (!this.threat) return null;
        }
        return latest;
      }
    }

    const t = this.threat;

    // ===== 无威胁时：进攻性策略，积攒防御道具 =====
    if (!t) {
      if (this.speedBoostTimer > 0) return null;

      // 目标较远时用加速追赶
      if (this.target && items.includes('speedBoost')) {
        const dist = Math.hypot(
          this.target.centerX - this.centerX,
          this.target.centerY - this.centerY
        );
        if (dist > 200 && Math.random() < 0.5) return 'speedBoost';
      }

      return null; // 积攒道具
    }

    // ===== 有威胁时：根据危险程度选择道具 =====
    if (this.speedBoostTimer > 0) return null;

    const ddx = this.centerX - t.centerX;
    const ddy = this.centerY - t.centerY;
    const dist = Math.hypot(ddx, ddy);
    const inDanger = dist < 180;
    const veryDanger = dist < 120;

    if (inDanger || t.isDashing) {
      // 极度危险：优先护盾
      if (veryDanger && this.shieldTimer <= 0 && items.includes('shield')) {
        return 'shield';
      }
      // 危险：冻结母鸡
      if (items.includes('freeze')) {
        return 'freeze';
      }
      // 护盾作为兜底
      if (this.shieldTimer <= 0 && items.includes('shield')) {
        return 'shield';
      }
    }

    // 远距离追击用加速
    if (dist > 220 && items.includes('speedBoost')) {
      return 'speedBoost';
    }

    return null; // 积攒道具等待更好时机
  }

  triggerObstacleAvoidance(currentDx: number, currentDy: number): void {
    const baseAng = Math.atan2(currentDy, currentDx);
    const ang = (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 3 + Math.random() * Math.PI / 6);
    const newAng = baseAng + ang;
    this.obstacleAvoidDir = { dx: Math.cos(newAng), dy: Math.sin(newAng) };
    this.obstacleAvoidTimer = 0.8 + Math.random() * 0.6;
  }

  collidesWith(obstacles: Rect[]): boolean {
    const b = this.boundingBox();
    for (const o of obstacles) {
      if (isColliding(b, o)) return true;
    }
    return false;
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (!this.flashVisible) return;

    const sprite = SpriteManager.getInstance().get('eagle');
    if (sprite) {
      drawSprite(ctx, sprite, this.centerX, this.centerY, this.width, this.height);
    } else {
      ctx.save();
      ctx.translate(this.centerX, this.centerY);

      ctx.fillStyle = this.freezeTimer > 0 ? '#6ec6ff' : '#7f8c8d';
      ctx.beginPath();
      ctx.moveTo(0, -this.height / 2);
      ctx.lineTo(this.width / 2, this.height / 4);
      ctx.lineTo(0, this.height / 2);
      ctx.lineTo(-this.width / 2, this.height / 4);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#c0392b';
      ctx.beginPath();
      ctx.arc(-4, -2, 2.5, 0, Math.PI * 2);
      ctx.arc(4, -2, 2.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(-4, -2, 1, 0, Math.PI * 2);
      ctx.arc(4, -2, 1, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    if (this.dodgeTimer > 0) {
      ctx.fillStyle = 'rgba(255, 193, 7, 0.35)';
      ctx.beginPath();
      ctx.arc(this.centerX, this.centerY, this.width * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = 0; i < this.lives; i++) {
      ctx.fillStyle = '#e74c3c';
      ctx.beginPath();
      const bx = CANVAS_WIDTH - 20 - i * 18;
      const by = 24;
      ctx.moveTo(bx, by + 4);
      ctx.arc(bx - 4, by + 4, 4, Math.PI, 0);
      ctx.arc(bx + 4, by + 4, 4, Math.PI, 0);
      ctx.lineTo(bx, by + 12);
      ctx.closePath();
      ctx.fill();
    }

    // Armor bar
    const armorBarW = 90;
    const armorBarH = 8;
    const armorBarX = CANVAS_WIDTH - 20 - armorBarW;
    const armorBarY = 44;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(armorBarX - 2, armorBarY - 2, armorBarW + 4, armorBarH + 4);
    ctx.fillStyle = '#455a64';
    ctx.fillRect(armorBarX, armorBarY, armorBarW, armorBarH);
    const armorPct = this.armor / this.maxArmor;
    ctx.fillStyle = armorPct > 0.5 ? '#29b6f6' : armorPct > 0.25 ? '#ffa726' : '#ef5350';
    ctx.fillRect(armorBarX, armorBarY, armorBarW * armorPct, armorBarH);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('护甲', armorBarX + armorBarW / 2, armorBarY + armorBarH / 2);

    if (this.freezeTimer > 0) {
      ctx.fillStyle = 'rgba(0, 188, 212, 0.25)';
      ctx.beginPath();
      ctx.arc(this.centerX, this.centerY, this.width * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.shieldTimer > 0) {
      ctx.strokeStyle = 'rgba(236, 240, 241, 0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this.centerX, this.centerY, this.width * 0.75, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(236, 240, 241, 0.15)';
      ctx.beginPath();
      ctx.arc(this.centerX, this.centerY, this.width * 0.75, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
