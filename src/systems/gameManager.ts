import { CANVAS_WIDTH, CANVAS_HEIGHT, HEN_SIZE, CHICK_SIZE, EAGLE_SIZE, ITEM_SIZE, MAX_TOTAL_CHICKS, INITIAL_FREE_CHICKS, CHICK_SPAWN_INTERVAL, MAX_ITEMS, ITEM_SPAWN_INTERVAL, ITEM_LIFETIME, MAX_FREE_CHICKS, SPEED_BOOST_DURATION, SHIELD_DURATION, EAGLE_FREEZE_DURATION, EAGLE_SPAWN_TEAM_SIZE, EAGLE_MAX_ARMOR, EAGLE_BASE_SPEED, HEN_BASE_SPEED, TARGET_CHICKS, VICTORY_COUNTDOWN, BOOK_REQUIRED, WORD_MODE_COUNTDOWN, WORD_MODE_MAX_MISTAKES, LETTER_BALL_SPEED, LETTER_BALL_MAX_BOUNCES, LETTER_BALL_RADIUS } from '../utils/constants';
import { Rect, isColliding, overlapsAny, clampToBounds } from '../utils/collision';
import { MapGenerator, MapData } from './mapGenerator';
import { Hen } from '../entities/hen';
import { Chick } from '../entities/chick';
import { Eagle } from '../entities/eagle';
import { WorldItem, ItemType, ITEM_COLORS, ITEM_LABELS } from '../entities/item';
import { Inventory } from '../entities/item';
import { SkillSystem } from './skillSystem';
import { InputManager } from '../utils/input';
import { UIManager, PlayerRole } from '../ui/uiManager';
import { addLeaderboardEntry } from '../utils/leaderboard';
import { AudioManager } from '../utils/audioManager';
import shieldIconUrl from '../../equip/盾.png';
import freezeIconUrl from '../../equip/冷冻.png';
import bookIconUrl from '../../equip/book.png';
import speedBoostIconUrl from '../../equip/加速.png';

type GameState = 'playing' | 'henWin' | 'eagleWin';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

const ALL_ITEM_TYPES: ItemType[] = ['speedBoost', 'shield', 'freeze', 'book'];

const WORD_LIST = ['magic', 'power', 'eagle', 'speed', 'brave', 'shine', 'flash', 'storm', 'blaze', 'glory', 'quest', 'spark'];

interface LetterBall {
  x: number;
  y: number;
  vx: number;
  vy: number;
  letter: string;
  bounces: number;
  alive: boolean;
}

interface WordModeState {
  active: boolean;
  countdown: number;
  word: string;
  typed: string;
  mistakes: number;
  graceTimer: number;
}

export class GameManager {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private input: InputManager;
  private ui: UIManager;
  private skillSystem: SkillSystem = new SkillSystem();
  private audio = AudioManager.getInstance();

  private map!: MapData;
  private hen!: Hen;
  private eagle!: Eagle;
  private freeChicks: Chick[] = [];
  private worldItems: WorldItem[] = [];
  private particles: Particle[] = [];

  private gameTime = 0;
  private gameState: GameState = 'playing';
  private chickSpawnTimer = 0;
  private itemSpawnTimer = 0;

  private initialized = false;
  private everAbsorbed = false;
  private eagleActive = false;

  private playerRole: PlayerRole = 'hen';
  private victoryCountdown = -1;
  private itemIcons: Partial<Record<ItemType, HTMLImageElement>> = {};
  private itemIconsLoaded: Partial<Record<ItemType, boolean>> = {};
  private bookCount = 0;
  private letterBalls: LetterBall[] = [];
  private wordMode: WordModeState = { active: false, countdown: 0, word: '', typed: '', mistakes: 0, graceTimer: 0 };
  // 单词模式结束后的老鹰抓小鸡保护期：让弹球能飞向老鹰，避免恢复即被判负
  private eagleCatchCooldown = 0;

  constructor(canvas: HTMLCanvasElement, input: InputManager, ui: UIManager) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.input = input;
    this.ui = ui;
    this.initItemIcons();

    this.ui.setCallbacks({
      onStart: (role) => this.startGame(role),
      onRestart: (role) => this.startGame(role),
      onBackMenu: () => {
        this.audio.stopBgm();
        this.ui.setPauseEnabled(false);
        this.ui.showMenu();
      },
      onSaveScore: (name) => this.saveScore(name),
    });
  }

  private initItemIcons(): void {
    const cfg: { type: ItemType; url: string }[] = [
      { type: 'shield', url: shieldIconUrl },
      { type: 'freeze', url: freezeIconUrl },
      { type: 'book', url: bookIconUrl },
      { type: 'speedBoost', url: speedBoostIconUrl },
    ];
    for (const c of cfg) {
      const img = new Image();
      img.onload = () => { this.itemIconsLoaded[c.type] = true; };
      img.src = c.url;
      this.itemIcons[c.type] = img;
    }
  }

  private drawItemIcon(ctx: CanvasRenderingContext2D, type: ItemType, x: number, y: number, size: number): void {
    const img = this.itemIcons[type];
    if (img && this.itemIconsLoaded[type]) {
      ctx.drawImage(img, x, y, size, size);
    } else {
      ctx.fillStyle = ITEM_COLORS[type];
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.floor(size * 0.7)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ITEM_LABELS[type], x + size / 2, y + size / 2);
    }
  }

  startGame(role: PlayerRole): void {
    this.playerRole = role;
    this.map = MapGenerator.generate();

    const eagleSpot = role === 'eagle'
      ? { x: CANVAS_WIDTH / 2 - EAGLE_SIZE / 2, y: CANVAS_HEIGHT / 2 - EAGLE_SIZE / 2 }
      : MapGenerator.findFarthestSpotFrom(
          { x: this.map.henStart.x + HEN_SIZE / 2, y: this.map.henStart.y + HEN_SIZE / 2 },
          EAGLE_SIZE,
          this.map.obstacles,
          []
        ) ?? { x: CANVAS_WIDTH - 80, y: 40 };

    this.hen = new Hen(this.map.henStart.x, this.map.henStart.y, this.input);
    this.hen.mapBounds = this.map.bounds;
    this.eagle = new Eagle(eagleSpot.x, eagleSpot.y);
    this.eagle.armor = EAGLE_MAX_ARMOR;
    this.eagle.maxArmor = EAGLE_MAX_ARMOR;
    this.eagleActive = role === 'eagle';

    this.freeChicks = [];
    for (let i = 0; i < INITIAL_FREE_CHICKS; i++) {
      this.spawnChickNearHen();
    }

    this.worldItems = [];
    this.itemSpawnTimer = 1;
    this.chickSpawnTimer = 0;
    this.gameTime = 0;
    this.gameState = 'playing';
    this.particles = [];
    this.skillSystem.reset();
    this.everAbsorbed = false;

    this.ui.hideAll();
    this.ui.setPauseEnabled(true);
    this.initialized = true;
    this.victoryCountdown = -1;
    this.bookCount = 0;
    this.letterBalls = [];
    this.wordMode = { active: false, countdown: 0, word: '', typed: '', mistakes: 0, graceTimer: 0 };
    this.eagleCatchCooldown = 0;

    this.audio.startBgm();
  }

  private trySpawnEagle(): void {
    if (this.eagleActive) return;
    if (this.playerRole === 'eagle') return;
    if (this.hen.team.length < EAGLE_SPAWN_TEAM_SIZE) return;

    const spot = MapGenerator.findFarthestSpotFrom(
      { x: this.hen.centerX, y: this.hen.centerY },
      EAGLE_SIZE,
      this.map.obstacles,
      [this.hen.boundingBox(), ...this.hen.team.map((c) => c.boundingBox())]
    ) ?? { x: CANVAS_WIDTH - 80, y: 40 };

    this.eagle.x = spot.x;
    this.eagle.y = spot.y;
    this.eagle.lives = 3;
    this.eagle.armor = EAGLE_MAX_ARMOR;
    this.eagle.maxArmor = EAGLE_MAX_ARMOR;
    this.eagle.invincibleTimer = 1.0;
    this.eagle.freezeTimer = 0;
    this.eagle.stunTimer = 0;
    this.eagle.speedBoostTimer = 0;
    this.eagle.setTarget(null);
    this.eagle.setThreat(null);
    this.eagle.inventory = new Inventory();
    this.eagleActive = true;
    this.audio.playSfx('eagleSpawn');
  }

  private spawnChickNearHen(): void {
    const occupied: Rect[] = [
      this.hen.boundingBox(),
      this.eagleActive ? this.eagle.boundingBox() : null,
      ...this.freeChicks.map((c) => c.boundingBox()),
      ...this.hen.team.map((c) => c.boundingBox()),
    ].filter(Boolean) as Rect[];
    const spot = MapGenerator.findSpotNear(
      { x: this.hen.centerX, y: this.hen.centerY },
      CHICK_SIZE,
      this.map.obstacles,
      occupied,
      60,
      180,
      this.map.bounds
    );
    if (spot) this.freeChicks.push(new Chick(spot.x, spot.y));
  }

  private spawnChick(): void {
    const occupied: Rect[] = [
      this.hen.boundingBox(),
      this.eagleActive ? this.eagle.boundingBox() : null,
      ...this.freeChicks.map((c) => c.boundingBox()),
      ...this.hen.team.map((c) => c.boundingBox()),
    ].filter(Boolean) as Rect[];
    const spot = MapGenerator.findFreeSpot(CHICK_SIZE, this.map.obstacles, occupied, this.map.bounds);
    if (spot) {
      this.freeChicks.push(new Chick(spot.x, spot.y));
    }
  }

  private spawnItem(): void {
    const occupied: Rect[] = [
      this.hen.boundingBox(),
      this.eagleActive ? this.eagle.boundingBox() : null,
      ...this.freeChicks.map((c) => c.boundingBox()),
      ...this.hen.team.map((c) => c.boundingBox()),
    ].filter(Boolean) as Rect[];
    const spot = MapGenerator.findFreeSpot(ITEM_SIZE, this.map.obstacles, occupied, this.map.bounds);
    if (spot) {
      const type = ALL_ITEM_TYPES[Math.floor(Math.random() * ALL_ITEM_TYPES.length)];
      this.worldItems.push({ x: spot.x, y: spot.y, width: ITEM_SIZE, height: ITEM_SIZE, type, bob: Math.random() * Math.PI * 2, age: 0 });
    }
  }

  update(dt: number): void {
    if (!this.initialized) return;
    if (!this.ui.isPlaying() || this.gameState !== 'playing') return;

    // 单词模式输入阶段：游戏暂停，仅更新单词模式
    if (this.wordMode.active) {
      this.updateWordMode(dt);
      return;
    }

    this.gameTime += dt;
    this.skillSystem.update(dt);
    if (this.eagleCatchCooldown > 0) this.eagleCatchCooldown -= dt;

    if (this.playerRole === 'hen') {
      if (this.input.isDown(' ') && !this.hen.frozen) {
        if (this.skillSystem.startDash()) this.audio.playSfx('dash');
      } else {
        this.skillSystem.stopDash();
      }
      this.hen.isDashing = this.skillSystem.isDashing;

      if (this.input.wasPressed('f')) {
        if (this.bookCount >= BOOK_REQUIRED) {
          this.startWordMode();
        } else {
          const used = this.hen.inventory?.shift();
          if (used) this.applyHenItem(used);
        }
      }

      this.hen.update(dt);

      if (this.hen.collidesWith(this.map.obstacles)) {
        const before = this.hen.boundingBox();
        this.hen.x -= this.hen.vx * this.hen.effectiveSpeed * dt;
        this.hen.y -= this.hen.vy * this.hen.effectiveSpeed * dt;
        if (this.hen.collidesWith(this.map.obstacles)) {
          this.hen.x = before.x;
          this.hen.y = before.y;
        }
      }
    } else {
      // Player controls eagle
      if (this.input.isDown(' ') && this.eagle.freezeTimer <= 0) {
        if (this.skillSystem.startDash()) this.audio.playSfx('dash');
      } else {
        this.skillSystem.stopDash();
      }

      if (this.input.wasPressed('f')) {
        const used = this.eagle.inventory?.shift();
        if (used) this.applyEagleItem(used);
      }

      this.updateHenAI(dt);

      const dir = this.input.getDirection();
      const len = Math.hypot(dir.dx, dir.dy) || 1;
      const baseSpeed = this.skillSystem.isDashing ? HEN_BASE_SPEED * 1.8 : this.eagle.speed;
      let speedMult = 1;
      if (this.eagle.speedBoostTimer > 0) speedMult *= 1.5;
      if (this.eagle.freezeTimer > 0) speedMult = 0;
      if (this.eagle.stunTimer > 0) speedMult = 0;
      if (this.eagle.invincibleTimer > 0) {
        // flashing handled in render
      }

      this.eagle.x += (dir.dx / len) * baseSpeed * speedMult * dt;
      this.eagle.y += (dir.dy / len) * baseSpeed * speedMult * dt;
      const clamped = clampToBounds(this.eagle.boundingBox(), CANVAS_WIDTH, CANVAS_HEIGHT);
      this.eagle.x = clamped.x;
      this.eagle.y = clamped.y;

      this.eagle.updateTimers(dt);

      if (this.eagle.collidesWith(this.map.obstacles)) {
        this.eagle.x -= (dir.dx / len) * baseSpeed * speedMult * dt;
        this.eagle.y -= (dir.dy / len) * baseSpeed * speedMult * dt;
      }
    }

    for (const chick of this.freeChicks) chick.update(dt);
    for (const chick of this.hen.team) chick.update(dt);

    if (this.playerRole === 'hen' && this.eagleActive) {
      const eagleTarget = this.getEagleTarget();
      this.eagle.setTarget(eagleTarget ? eagleTarget.chick : null, eagleTarget ? eagleTarget.isTeam : false);

      const teamCenters = this.hen.team.map((c) => c.centerX);
      const teamCentersY = this.hen.team.map((c) => c.centerY);
      this.eagle.targetsCenterX = teamCenters;
      this.eagle.targetsCenterY = teamCentersY;

      this.eagle.setThreat({
        centerX: this.hen.centerX,
        centerY: this.hen.centerY,
        vx: this.hen.vx,
        vy: this.hen.vy,
        isDashing: this.hen.isDashing,
      });

      // 设置老鹰最近的道具目标（背包不满时才去拾取）
      if (this.eagle.inventory.canAdd()) {
        let nearestItem: WorldItem | null = null;
        let nearestDist = Infinity;
        for (const item of this.worldItems) {
          if (item.type === 'book') continue; // 老鹰不拾取书本
          const d = Math.hypot(item.x + item.width / 2 - this.eagle.centerX, item.y + item.height / 2 - this.eagle.centerY);
          if (d < nearestDist) {
            nearestDist = d;
            nearestItem = item;
          }
        }
        if (nearestItem && nearestDist < 400) {
          this.eagle.setItemTarget({ x: nearestItem.x + nearestItem.width / 2, y: nearestItem.y + nearestItem.height / 2 });
        } else {
          this.eagle.setItemTarget(null);
        }
      } else {
        this.eagle.setItemTarget(null);
      }

      this.eagle.update(dt);

      const pendingItem = this.eagle.consumePendingItem();
      if (pendingItem) this.applyEagleItem(pendingItem);

      if (this.eagle.collidesWith(this.map.obstacles)) {
        this.eagle.x -= this.eagle.vx * this.eagle.speed * dt;
        this.eagle.y -= this.eagle.vy * this.eagle.speed * dt;
        this.eagle.triggerObstacleAvoidance(this.eagle.vx, this.eagle.vy);
      }
    }

    const remainingFree: Chick[] = [];
    for (const chick of this.freeChicks) {
      if (!chick.alive) continue;
      if (this.playerRole === 'hen' && isColliding(this.hen.boundingBox(), chick.boundingBox())) {
        this.hen.team.push(chick);
        this.everAbsorbed = true;
        this.spawnParticles(chick.centerX, chick.centerY, '#ffd54f', 8);
        this.audio.playSfx('collect');
        this.trySpawnEagle();
      } else if (this.playerRole === 'eagle' && isColliding(this.hen.boundingBox(), chick.boundingBox())) {
        this.hen.team.push(chick);
        this.everAbsorbed = true;
        this.spawnParticles(chick.centerX, chick.centerY, '#ffd54f', 8);
        this.audio.playSfx('collect');
      } else {
        remainingFree.push(chick);
      }
    }
    this.freeChicks = remainingFree;

    this.chickSpawnTimer += dt;
    if (this.chickSpawnTimer >= CHICK_SPAWN_INTERVAL && this.freeChicks.length < MAX_FREE_CHICKS && (this.freeChicks.length + this.hen.team.length) < MAX_TOTAL_CHICKS) {
      this.spawnChick();
      this.chickSpawnTimer = 0;
    }

    this.itemSpawnTimer += dt;
    if (this.itemSpawnTimer >= ITEM_SPAWN_INTERVAL && this.worldItems.length < MAX_ITEMS) {
      this.spawnItem();
      this.itemSpawnTimer = 0;
    }

    for (const item of this.worldItems) {
      item.bob += dt * 3;
      item.age += dt;
    }
    this.worldItems = this.worldItems.filter((item) => item.age < ITEM_LIFETIME);

    this.handleItemPickups();
    this.handleEagleCatch();
    this.handleDashAttack();
    this.updateParticles(dt);
    this.updateLetterBalls(dt);

    this.updateVictoryCountdown(dt);
    this.checkWinLose();
  }

  private updateHenAI(dt: number): void {
    let target: { x: number; y: number } | null = null;

    if (this.freeChicks.length > 0) {
      let best: Chick | null = null;
      let bestD = Infinity;
      for (const c of this.freeChicks) {
        const d = Math.hypot(c.centerX - this.hen.centerX, c.centerY - this.hen.centerY);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (best) target = { x: best.centerX, y: best.centerY };
    }

    let dir: { dx: number; dy: number } = { dx: 0, dy: 0 };
    if (target) {
      const dx = target.x - this.hen.centerX;
      const dy = target.y - this.hen.centerY;
      const len = Math.hypot(dx, dy) || 1;
      dir = { dx: dx / len, dy: dy / len };
    }

    this.hen.update(dt, dir);

    if (this.hen.collidesWith(this.map.obstacles)) {
      this.hen.x -= dir.dx * this.hen.effectiveSpeed * dt;
      this.hen.y -= dir.dy * this.hen.effectiveSpeed * dt;
      if (this.hen.collidesWith(this.map.obstacles)) {
        this.hen.x -= dir.dx * this.hen.effectiveSpeed * dt * 2;
        this.hen.y -= dir.dy * this.hen.effectiveSpeed * dt * 2;
      }
    }
  }

  private handleItemPickups(): void {
    const remaining: WorldItem[] = [];
    for (const item of this.worldItems) {
      const pickRect: Rect = { x: item.x - 4, y: item.y - 4, width: item.width + 8, height: item.height + 8 };
      let picked = false;

      // 书本道具：仅母鸡可拾取，累加到 bookCount（不进背包）
      if (item.type === 'book') {
        if (this.playerRole === 'hen') {
          const henHasItem = overlapsAny(pickRect, [this.hen.boundingBox(), ...this.hen.team.map((c) => c.boundingBox())]);
          if (henHasItem && this.bookCount < BOOK_REQUIRED) {
            this.bookCount++;
            this.spawnParticles(item.x + item.width / 2, item.y + item.height / 2, ITEM_COLORS[item.type], 10);
            this.audio.playSfx('itemPickup');
            picked = true;
          }
        }
        if (!picked) remaining.push(item);
        continue;
      }

      if (this.playerRole === 'hen') {
        const henHasItem = overlapsAny(pickRect, [this.hen.boundingBox(), ...this.hen.team.map((c) => c.boundingBox())]);
        if (henHasItem && this.hen.inventory.canAdd()) {
          this.hen.inventory.add(item.type);
          this.spawnParticles(item.x + item.width / 2, item.y + item.height / 2, ITEM_COLORS[item.type], 10);
          this.audio.playSfx('itemPickup');
          picked = true;
        }
      } else {
        const eagleHasItem = isColliding(pickRect, this.eagle.boundingBox());
        if (eagleHasItem && this.eagle.inventory.canAdd()) {
          this.eagle.inventory.add(item.type);
          this.spawnParticles(item.x + item.width / 2, item.y + item.height / 2, ITEM_COLORS[item.type], 10);
          this.audio.playSfx('itemPickup');
          picked = true;
        }
      }

      if (!picked && this.eagleActive && this.playerRole === 'hen' && isColliding(pickRect, this.eagle.boundingBox()) && this.eagle.inventory.canAdd()) {
        this.eagle.inventory.add(item.type);
        this.eagle.setJustPickedUp();
        this.spawnParticles(item.x + item.width / 2, item.y + item.height / 2, ITEM_COLORS[item.type], 10);
        this.audio.playSfx('itemPickup');
        picked = true;
      }
      if (!picked) remaining.push(item);
    }
    this.worldItems = remaining;
  }

  private handleEagleCatch(): void {
    if (!this.eagleActive) return;
    if (this.eagle.stunTimer > 0 || this.eagle.freezeTimer > 0) return;
    // 单词模式结束后的保护期：让弹球有机会飞向老鹰，避免恢复即被抓光
    if (this.eagleCatchCooldown > 0) return;

    // 1. 尝试抓队伍尾部小鸡
    const team = this.hen.team;
    if (team.length > 0) {
      const tail = team[team.length - 1];
      if (tail.alive && isColliding(this.eagle.boundingBox(), tail.boundingBox())) {
        // 母鸡护盾保护时弹开老鹰
        if (this.hen.shieldTimer > 0 && this.playerRole === 'hen') {
          const dx = this.eagle.centerX - this.hen.centerX;
          const dy = this.eagle.centerY - this.hen.centerY;
          const len = Math.hypot(dx, dy) || 1;
          this.eagle.x += (dx / len) * 30;
          this.eagle.y += (dy / len) * 30;
        } else {
          tail.alive = false;
          this.hen.team.pop();
          this.spawnParticles(tail.centerX, tail.centerY, '#e67e22', 14);
        }
      }
    }

    // 2. 尝试抓场上的单只小鸡（freeChicks 无护盾保护，老鹰碰到即吃掉）
    const remainingFree: Chick[] = [];
    for (const chick of this.freeChicks) {
      if (!chick.alive) continue;
      if (isColliding(this.eagle.boundingBox(), chick.boundingBox())) {
        chick.alive = false;
        this.spawnParticles(chick.centerX, chick.centerY, '#e67e22', 14);
      } else {
        remainingFree.push(chick);
      }
    }
    this.freeChicks = remainingFree;
  }

  private handleDashAttack(): void {
    if (this.playerRole === 'hen') {
      if (!this.eagleActive) return;
      if (!this.hen.isDashing || this.hen.frozen) return;
      if (isColliding(this.hen.boundingBox(), this.eagle.boundingBox())) {
        if (this.eagle.takeDamage()) {
          this.spawnParticles(this.eagle.centerX, this.eagle.centerY, '#c0392b', 16);
          this.audio.playSfx('eagleHit');
        }
      }
    } else {
      // Player eagle: dash = rush team tail / hen
      if (!this.skillSystem.isDashing) return;
      if (this.eagle.freezeTimer > 0 || this.eagle.stunTimer > 0) return;

      const team = this.hen.team;
      const targets = team.length > 0 ? [team[team.length - 1]] : this.freeChicks;
      if (targets.length > 0) {
        const t = targets[0];
        if (isColliding(this.eagle.boundingBox(), t.boundingBox())) {
          if (team.length > 0) {
            t.alive = false;
            this.hen.team.pop();
          } else {
            t.alive = false;
          }
          this.spawnParticles(t.centerX, t.centerY, '#e67e22', 14);
        }
      }
    }
  }

  private getEagleTarget(): { chick: Chick; isTeam: boolean } | null {
    const ex = this.eagle.centerX;
    const ey = this.eagle.centerY;

    // 候选目标列表：{ chick, dist(加权距离), isTeam }
    const candidates: { chick: Chick; score: number; isTeam: boolean }[] = [];

    // 队伍尾部小鸡（战略价值最高：权重 0.6，优先让老鹰去抓队尾）
    if (this.hen.team.length > 0) {
      const tail = this.hen.team[this.hen.team.length - 1];
      const d = Math.hypot(tail.centerX - ex, tail.centerY - ey);
      candidates.push({ chick: tail, score: d * 0.6, isTeam: true });
    }

    // 场上的单只小鸡（权重 1.6，只有 freeChick 近得多才去抓；否则优先进攻队伍）
    for (const c of this.freeChicks) {
      const d = Math.hypot(c.centerX - ex, c.centerY - ey);
      candidates.push({ chick: c, score: d * 1.6, isTeam: false });
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.score - b.score);
    return { chick: candidates[0].chick, isTeam: candidates[0].isTeam };
  }

  private applyHenItem(type: ItemType): void {
    switch (type) {
      case 'speedBoost':
        this.audio.playSfx('itemSpeed');
        this.hen.speedBoostTimer = SPEED_BOOST_DURATION;
        break;
      case 'shield':
        this.audio.playSfx('itemShield');
        this.hen.shieldTimer = SHIELD_DURATION;
        break;
      case 'freeze':
        this.audio.playSfx('itemFreeze');
        this.eagle.freeze();
        break;
    }
  }

  private applyEagleItem(type: ItemType): void {
    switch (type) {
      case 'freeze':
        this.audio.playSfx('itemFreeze');
        this.hen.freeze();
        break;
      case 'speedBoost':
        this.audio.playSfx('itemSpeed');
        this.eagle.applySpeedBoost();
        break;
      case 'shield':
        this.audio.playSfx('itemShield');
        this.eagle.applyShield();
        break;
    }
  }

  private startWordMode(): void {
    this.bookCount -= BOOK_REQUIRED;
    this.wordMode.active = true;
    this.wordMode.countdown = WORD_MODE_COUNTDOWN;
    this.wordMode.word = WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)];
    this.wordMode.typed = '';
    this.wordMode.mistakes = 0;
    this.wordMode.graceTimer = 0.6;
    // 清除所有待处理的按键，防止残留输入被误判为错误
    for (let i = 0; i < 26; i++) {
      this.input.wasPressed(String.fromCharCode(97 + i));
    }
    this.input.wasPressed('f');
    this.input.wasPressed(' ');
    this.audio.playSfx('itemUse');
  }

  private updateWordMode(dt: number): void {
    // 消费非字母按键，防止退出后误触
    this.input.wasPressed('f');
    this.input.wasPressed(' ');

    // 宽限期：界面刚弹出时不接收输入，防止残留按键误触
    if (this.wordMode.graceTimer > 0) {
      this.wordMode.graceTimer -= dt;
      // 消费所有字母按键，清空待处理输入
      for (let i = 0; i < 26; i++) {
        this.input.wasPressed(String.fromCharCode(97 + i));
      }
      return;
    }

    this.wordMode.countdown -= dt;
    if (this.wordMode.countdown <= 0) {
      this.exitWordMode();
      return;
    }

    // 检查字母输入
    for (let i = 0; i < 26; i++) {
      const letter = String.fromCharCode(97 + i);
      if (this.input.wasPressed(letter)) {
        this.handleWordInput(letter);
        break;
      }
    }
  }

  private handleWordInput(letter: string): void {
    const expected = this.wordMode.word[this.wordMode.typed.length];
    // 每次按键都播放打字音
    this.audio.playSfx('itemType');
    if (letter === expected) {
      this.wordMode.typed += letter;
      if (this.wordMode.typed.length >= this.wordMode.word.length) {
        this.launchLetterBalls();
        this.exitWordMode();
      }
    } else {
      this.wordMode.mistakes++;
      this.audio.playSfx('eagleHit');
      if (this.wordMode.mistakes >= WORD_MODE_MAX_MISTAKES) {
        this.exitWordMode();
      }
    }
  }

  private launchLetterBalls(): void {
    const word = this.wordMode.word;
    const baseAng = this.eagleActive
      ? Math.atan2(this.eagle.centerY - this.hen.centerY, this.eagle.centerX - this.hen.centerX)
      : -Math.PI / 4;
    const spread = 0.25;
    const startAng = baseAng - (spread * (word.length - 1)) / 2;
    for (let i = 0; i < word.length; i++) {
      const ang = startAng + i * spread;
      this.letterBalls.push({
        x: this.hen.centerX,
        y: this.hen.centerY,
        vx: Math.cos(ang) * LETTER_BALL_SPEED,
        vy: Math.sin(ang) * LETTER_BALL_SPEED,
        letter: word[i],
        bounces: 0,
        alive: true,
      });
    }
    this.audio.playSfx('dash');
  }

  private updateLetterBalls(dt: number): void {
    for (const ball of this.letterBalls) {
      if (!ball.alive) continue;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      // 边界反弹（使用母鸡移动的地图边界）
      const b = this.map.bounds;
      const minX = b.left + LETTER_BALL_RADIUS;
      const maxX = CANVAS_WIDTH - b.right - LETTER_BALL_RADIUS;
      const minY = b.top + LETTER_BALL_RADIUS;
      const maxY = CANVAS_HEIGHT - b.bottom - LETTER_BALL_RADIUS;
      if (ball.x < minX) { ball.x = minX; ball.vx = -ball.vx; ball.bounces++; this.audio.playSfx('itemTextBall'); }
      else if (ball.x > maxX) { ball.x = maxX; ball.vx = -ball.vx; ball.bounces++; this.audio.playSfx('itemTextBall'); }
      if (ball.y < minY) { ball.y = minY; ball.vy = -ball.vy; ball.bounces++; this.audio.playSfx('itemTextBall'); }
      else if (ball.y > maxY) { ball.y = maxY; ball.vy = -ball.vy; ball.bounces++; this.audio.playSfx('itemTextBall'); }

      if (ball.bounces > LETTER_BALL_MAX_BOUNCES) {
        ball.alive = false;
        continue;
      }

      // 碰撞老鹰
      if (this.eagleActive) {
        const dx = ball.x - this.eagle.centerX;
        const dy = ball.y - this.eagle.centerY;
        if (Math.hypot(dx, dy) < this.eagle.width / 2 + LETTER_BALL_RADIUS) {
          if (this.eagle.takeDamage()) {
            this.spawnParticles(ball.x, ball.y, '#fff', 10);
            this.audio.playSfx('eagleHit');
          }
          ball.alive = false;
        }
      }
    }
    this.letterBalls = this.letterBalls.filter((b) => b.alive);
  }

  private exitWordMode(): void {
    this.wordMode.active = false;
    // 退出单词模式后给1.2秒保护期：让弹球能飞向老鹰造成伤害，母鸡也有机会脱离危险
    // 避免文字刚输入完、弹球还没飞到老鹰时就被老鹰抓光队伍而判负
    this.eagleCatchCooldown = 1.2;
  }

  private updateVictoryCountdown(dt: number): void {
    if (this.playerRole !== 'hen') return;
    if (this.victoryCountdown > 0) {
      // 队伍少于10只时停止倒计时
      if (this.hen.team.length < TARGET_CHICKS) {
        this.victoryCountdown = -1;
        return;
      }
      this.victoryCountdown -= dt;
      if (this.victoryCountdown <= 0) {
        this.victoryCountdown = 0;
        this.gameState = 'henWin';
        this.audio.stopBgm();
        this.audio.playSfx('win');
        this.ui.setPauseEnabled(false);
        this.ui.showEnd(true, this.gameTime);
      }
      return;
    }
    // Trigger countdown when hen collects TARGET_CHICKS
    if (this.hen.team.length >= TARGET_CHICKS && this.everAbsorbed) {
      this.victoryCountdown = VICTORY_COUNTDOWN;
      this.audio.playSfx('eagleSpawn');
    }
  }

  private checkWinLose(): void {
    if (this.gameState !== 'playing') return;
    if (!this.eagleActive) return;

    // 老鹰胜：只有当母鸡曾经吸收过小鸡 (everAbsorbed)，且母鸡身后的 team 被吃光 (team.length===0) 才算胜
    // freeChicks 可以被老鹰吃掉但不决定胜负（freeChick会无限刷新）
    if (this.eagle.lives <= 0) {
      // 母鸡胜：老鹰血量被单词弹球打光
      this.gameState = 'henWin';
      this.audio.stopBgm();
      this.audio.playSfx('win');
      this.ui.setPauseEnabled(false);
      this.ui.showEnd(true, this.gameTime);
    } else if (this.everAbsorbed && this.hen.team.length === 0) {
      // 老鹰胜：母鸡身后的队伍被吃空（无论 freeChicks 是否还在刷新）
      this.gameState = 'eagleWin';
      this.audio.stopBgm();
      if (this.playerRole === 'hen') {
        this.audio.playSfx('lose');
        this.ui.showEnd(false, this.gameTime);
      } else {
        this.audio.playSfx('win');
        this.ui.showEnd(true, this.gameTime);
      }
      this.ui.setPauseEnabled(false);
    }
  }

  private updateParticles(dt: number): void {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  private spawnParticles(x: number, y: number, color: string, count: number): void {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 80;
      this.particles.push({
        x, y,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        life: 0.4 + Math.random() * 0.4,
        maxLife: 0.8,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }

  async saveScore(name: string): Promise<void> {
    const won = this.gameState === (this.playerRole === 'hen' ? 'henWin' : 'eagleWin');
    const status = document.getElementById('save-status')!;
    const saveBtn = document.getElementById('save-score-btn') as HTMLButtonElement | null;
    status.textContent = '保存中...';
    if (saveBtn) saveBtn.disabled = true;
    try {
      await addLeaderboardEntry({
        name: name.slice(0, 12),
        time: this.gameTime,
        won,
        timestamp: Date.now(),
      });
      status.textContent = '✓ 保存成功！';
      // 保存成功后清空输入框，避免重复提交
      const nameInput = document.getElementById('player-name') as HTMLInputElement | null;
      if (nameInput) nameInput.value = '';
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      // 常见原因：后端服务未启动（端口3001）或网络中断
      status.textContent = `✗ ${msg}（请确认后端服务已启动：npm run server）`;
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
    setTimeout(() => (status.textContent = ''), 4000);
  }

  render(): void {
    const ctx = this.ctx;
    // 每帧重置坐标变换：将逻辑坐标系(800x600)映射到 canvas 实际像素分辨率
    // 这样无论 canvas 的 width/height 如何随窗口/DPR 变化，游戏逻辑都无需改动
    ctx.setTransform(
      this.canvas.width / CANVAS_WIDTH, 0,
      0, this.canvas.height / CANVAS_HEIGHT,
      0, 0
    );

    if (!this.initialized) {
      ctx.fillStyle = '#2c3e50';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      return;
    }
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    if (this.map.bgImage) {
      ctx.drawImage(this.map.bgImage, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    } else {
      ctx.fillStyle = '#8bc34a';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      ctx.fillStyle = '#7cb342';
      for (let i = 0; i < 40; i++) {
        const x = (i * 97) % CANVAS_WIDTH;
        const y = (i * 73) % CANVAS_HEIGHT;
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.fillStyle = '#795548';
    for (const o of this.map.obstacles) {
      ctx.fillRect(o.x, o.y, o.width, o.height);
      ctx.fillStyle = '#6d4c41';
      ctx.fillRect(o.x + 2, o.y + 2, o.width - 4, 4);
      ctx.fillStyle = '#795548';
    }

    for (const item of this.worldItems) {
      const bob = Math.sin(item.bob) * 2;
      // 最后3秒闪烁提示即将消失
      const expiring = item.age > ITEM_LIFETIME - 3;
      if (expiring && Math.sin(item.age * 12) < 0) continue;
      if (item.type === 'shield' || item.type === 'freeze' || item.type === 'book' || item.type === 'speedBoost') {
        this.drawItemIcon(ctx, item.type, item.x, item.y + bob, item.width);
      } else {
        ctx.fillStyle = ITEM_COLORS[item.type];
        ctx.beginPath();
        ctx.arc(item.x + item.width / 2, item.y + item.height / 2 + bob, item.width / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ITEM_LABELS[item.type], item.x + item.width / 2, item.y + item.height / 2 + bob);
      }
    }

    for (const c of this.freeChicks) c.render(ctx);
    for (const c of this.hen.team) c.render(ctx);

    if (this.eagleActive) this.eagle.render(ctx);
    this.hen.render(ctx);

    // Boundary walls
    ctx.fillStyle = '#5d4037';
    ctx.fillRect(0, 0, CANVAS_WIDTH, 8);
    ctx.fillRect(0, CANVAS_HEIGHT - 8, CANVAS_WIDTH, 8);
    ctx.fillRect(0, 0, 8, CANVAS_HEIGHT);
    ctx.fillRect(CANVAS_WIDTH - 8, 0, 8, CANVAS_HEIGHT);
    ctx.fillStyle = '#795548';
    ctx.fillRect(0, 8, CANVAS_WIDTH, 2);
    ctx.fillRect(0, CANVAS_HEIGHT - 10, CANVAS_WIDTH, 2);
    ctx.fillRect(8, 0, 2, CANVAS_HEIGHT);
    ctx.fillRect(CANVAS_WIDTH - 10, 0, 2, CANVAS_HEIGHT);

    // Eagle warning banner
    if (this.playerRole === 'hen' && !this.eagleActive && this.hen.team.length < EAGLE_SPAWN_TEAM_SIZE) {
      const need = EAGLE_SPAWN_TEAM_SIZE - this.hen.team.length;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(CANVAS_WIDTH / 2 - 160, CANVAS_HEIGHT - 60, 320, 32);
      ctx.fillStyle = '#ffd54f';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`再吸收 ${need} 只小鸡，老鹰就会出现！`, CANVAS_WIDTH / 2, CANVAS_HEIGHT - 44);
    }

    // Victory countdown
    if (this.victoryCountdown > 0 && this.playerRole === 'hen') {
      const seconds = Math.ceil(this.victoryCountdown);
      const pulse = 1 + Math.sin(this.gameTime * 8) * 0.08;
      const size = 100 * pulse;
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.beginPath();
      ctx.arc(CANVAS_WIDTH / 2, 80, size / 2 + 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = seconds <= 5 ? '#ff5252' : '#ffd54f';
      ctx.beginPath();
      ctx.arc(CANVAS_WIDTH / 2, 80, size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 32px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(seconds), CANVAS_WIDTH / 2, 80);
      ctx.restore();

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`15秒内保持队伍！`, CANVAS_WIDTH / 2, 140);
    }

    for (const p of this.particles) {
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    this.skillSystem.render(ctx);
    this.renderHUD(ctx);

    this.renderLetterBalls(ctx);

    this.renderWordMode(ctx);
  }

  private renderLetterBalls(ctx: CanvasRenderingContext2D): void {
    for (const ball of this.letterBalls) {
      if (!ball.alive) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.arc(ball.x + 1, ball.y + 2, LETTER_BALL_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e91e63';
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, LETTER_BALL_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ball.letter.toUpperCase(), ball.x, ball.y);
    }
  }

  private renderWordMode(ctx: CanvasRenderingContext2D): void {
    if (!this.wordMode.active) return;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.fillStyle = '#ffd54f';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('📖 输入单词发射弹球！', CANVAS_WIDTH / 2, 170);

    // 单词显示
    const word = this.wordMode.word;
    const typed = this.wordMode.typed;
    const spacing = 40;
    const startX = CANVAS_WIDTH / 2 - ((word.length - 1) * spacing) / 2;
    ctx.font = 'bold 44px monospace';
    for (let i = 0; i < word.length; i++) {
      if (i < typed.length) {
        ctx.fillStyle = '#4caf50';
      } else if (i === typed.length) {
        ctx.fillStyle = '#ffeb3b';
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
      }
      ctx.fillText(word[i].toUpperCase(), startX + i * spacing, 250);
    }

    if (this.wordMode.graceTimer > 0) {
      // 宽限期提示：准备输入
      ctx.fillStyle = '#81c784';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText('准备输入...', CANVAS_WIDTH / 2, 330);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '14px sans-serif';
      ctx.fillText('看清单词后开始输入', CANVAS_WIDTH / 2, 380);
    } else {
      // 倒计时
      const seconds = Math.ceil(this.wordMode.countdown);
      ctx.fillStyle = seconds <= 3 ? '#ff5252' : '#fff';
      ctx.font = 'bold 38px sans-serif';
      ctx.fillText(`${seconds}s`, CANVAS_WIDTH / 2, 330);

      // 错误次数
      ctx.fillStyle = '#ff5252';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText(`错误: ${this.wordMode.mistakes} / ${WORD_MODE_MAX_MISTAKES}`, CANVAS_WIDTH / 2, 380);

      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '14px sans-serif';
      ctx.fillText('用键盘输入字母，输错两次或超时则退出', CANVAS_WIDTH / 2, 420);
    }
  }

  private renderHUD(ctx: CanvasRenderingContext2D): void {
    // 游戏计时器移至右下角，避免与老鹰背包信息重叠
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(CANVAS_WIDTH - 130, CANVAS_HEIGHT - 38, 120, 28);
    ctx.fillStyle = '#ffd54f';
    ctx.font = 'bold 16px monospace';
    const mm = Math.floor(this.gameTime / 60).toString().padStart(2, '0');
    const ss = Math.floor(this.gameTime % 60).toString().padStart(2, '0');
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`⏱ ${mm}:${ss}`, CANVAS_WIDTH - 120, CANVAS_HEIGHT - 24);
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(16, 40, 220, 24);
    ctx.fillStyle = '#fff';
    ctx.font = '12px sans-serif';
    const totalAlive = this.freeChicks.length + this.hen.team.length;
    ctx.fillText(`队伍: ${this.hen.team.length} | 场上: ${totalAlive}/10`, 22, 56);

    // 书本计数
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(240, 40, 110, 24);
    ctx.fillStyle = this.bookCount >= BOOK_REQUIRED ? '#ffd54f' : '#fff';
    ctx.font = this.bookCount >= BOOK_REQUIRED ? 'bold 12px sans-serif' : '12px sans-serif';
    ctx.fillText(`📖 ${this.bookCount}/${BOOK_REQUIRED}${this.bookCount >= BOOK_REQUIRED ? ' 按F!' : ''}`, 246, 56);

    const invX = 16;
    const invY = 74;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(invX - 4, invY - 4, 96, 32);
    const playerEntity = this.playerRole === 'hen' ? this.hen : this.eagle;
    if (playerEntity instanceof Hen) {
      for (let i = 0; i < 3; i++) {
        const slotX = invX + i * 30;
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.strokeRect(slotX, invY, 24, 24);
        const it = this.hen.inventory.peek(i);
        if (it) {
          if (it === 'shield' || it === 'freeze' || it === 'book' || it === 'speedBoost') {
            this.drawItemIcon(ctx, it, slotX, invY, 24);
          } else {
            ctx.fillStyle = ITEM_COLORS[it];
            ctx.beginPath();
            ctx.arc(slotX + 12, invY + 12, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(ITEM_LABELS[it], slotX + 12, invY + 12);
          }
        }
      }
    } else {
      for (let i = 0; i < 3; i++) {
        const slotX = invX + i * 30;
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.strokeRect(slotX, invY, 24, 24);
        const it = this.eagle.inventory.peek(i);
        if (it) {
          if (it === 'shield' || it === 'freeze' || it === 'book' || it === 'speedBoost') {
            this.drawItemIcon(ctx, it, slotX, invY, 24);
          } else {
            ctx.fillStyle = ITEM_COLORS[it];
            ctx.beginPath();
            ctx.arc(slotX + 12, invY + 12, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(ITEM_LABELS[it], slotX + 12, invY + 12);
          }
        }
      }
    }

    // ===== 老鹰道具栏（右上角，老鹰血条下方）=====
    if (this.eagleActive) {
      const eagleInvX = CANVAS_WIDTH - 100;
      const eagleInvY = 60;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(eagleInvX - 6, eagleInvY - 6, 94, 36);
      ctx.fillStyle = '#e74c3c';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('老鹰背包', eagleInvX - 2, eagleInvY - 2);

      for (let i = 0; i < 3; i++) {
        const slotX = eagleInvX + i * 29;
        ctx.strokeStyle = 'rgba(231, 76, 60, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(slotX, eagleInvY + 4, 24, 24);
        ctx.lineWidth = 1;
        const it = this.eagle.inventory.peek(i);
        if (it) {
          if (it === 'shield' || it === 'freeze') {
            this.drawItemIcon(ctx, it, slotX, eagleInvY + 4, 24);
          } else {
            ctx.fillStyle = ITEM_COLORS[it];
            ctx.beginPath();
            ctx.arc(slotX + 12, eagleInvY + 16, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(ITEM_LABELS[it], slotX + 12, eagleInvY + 16);
          }
        }
      }

      // 老鹰状态效果显示
      let eagleEffectY = 110;
      if (this.eagle.speedBoostTimer > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(CANVAS_WIDTH - 106, eagleEffectY - 2, 94, 14);
        ctx.fillStyle = '#3498db';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`⚡加速 ${this.eagle.speedBoostTimer.toFixed(1)}s`, CANVAS_WIDTH - 16, eagleEffectY + 8);
        eagleEffectY += 16;
      }
      if (this.eagle.shieldTimer > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(CANVAS_WIDTH - 106, eagleEffectY - 2, 94, 14);
        ctx.fillStyle = '#ecf0f1';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`🛡护盾 ${this.eagle.shieldTimer.toFixed(1)}s`, CANVAS_WIDTH - 16, eagleEffectY + 8);
        eagleEffectY += 16;
      }
      if (this.eagle.freezeTimer > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(CANVAS_WIDTH - 106, eagleEffectY - 2, 94, 14);
        ctx.fillStyle = '#00bcd4';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`❄冻结 ${this.eagle.freezeTimer.toFixed(1)}s`, CANVAS_WIDTH - 16, eagleEffectY + 8);
      }
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    let effectY = 118;
    if (this.eagleCatchCooldown > 0) {
      ctx.fillStyle = '#9b59b6';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(`🛡单词保护 ${this.eagleCatchCooldown.toFixed(1)}s`, 16, effectY);
      effectY += 14;
    }
    if (this.playerRole === 'hen') {
      if (this.hen.speedBoostTimer > 0) {
        ctx.fillStyle = '#3498db';
        ctx.font = '11px sans-serif';
        ctx.fillText(`⚡加速 ${this.hen.speedBoostTimer.toFixed(1)}s`, 16, effectY);
        effectY += 14;
      }
      if (this.hen.shieldTimer > 0) {
        ctx.fillStyle = '#ecf0f1';
        ctx.font = '11px sans-serif';
        ctx.fillText(`🛡护盾 ${this.hen.shieldTimer.toFixed(1)}s`, 16, effectY);
        effectY += 14;
      }
      if (this.eagleActive && this.eagle.freezeTimer > 0) {
        ctx.fillStyle = '#00bcd4';
        ctx.font = '11px sans-serif';
        ctx.fillText(`❄老鹰冻结 ${this.eagle.freezeTimer.toFixed(1)}s`, 16, effectY);
      }
    } else {
      if (this.eagle.speedBoostTimer > 0) {
        ctx.fillStyle = '#3498db';
        ctx.font = '11px sans-serif';
        ctx.fillText(`⚡加速 ${this.eagle.speedBoostTimer.toFixed(1)}s`, 16, effectY);
        effectY += 14;
      }
      if (this.eagle.shieldTimer > 0) {
        ctx.fillStyle = '#ecf0f1';
        ctx.font = '11px sans-serif';
        ctx.fillText(`🛡护盾 ${this.eagle.shieldTimer.toFixed(1)}s`, 16, effectY);
      }
    }
  }
}
