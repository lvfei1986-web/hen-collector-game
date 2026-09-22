import { DASH_COST_PER_SEC, MIN_DASH_STAMINA, STAMINA_REGEN_PER_SEC } from '../utils/constants';

export class SkillSystem {
  stamina: number = 100;
  isDashing = false;

  get canDash(): boolean {
    return this.stamina >= MIN_DASH_STAMINA;
  }

  update(dt: number): void {
    if (this.isDashing) {
      this.stamina -= DASH_COST_PER_SEC * dt;
      if (this.stamina <= 0) {
        this.stamina = 0;
        this.isDashing = false;
      }
    } else if (this.stamina < 100) {
      this.stamina = Math.min(100, this.stamina + STAMINA_REGEN_PER_SEC * dt);
    }
  }

  startDash(): boolean {
    if (this.isDashing) return true;
    if (this.stamina < MIN_DASH_STAMINA) return false;
    this.isDashing = true;
    return true;
  }

  stopDash(): void {
    this.isDashing = false;
  }

  reset(): void {
    this.stamina = 100;
    this.isDashing = false;
  }

  render(ctx: CanvasRenderingContext2D): void {
    const x = 16;
    const y = 16;
    const w = 180;
    const h = 18;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = '#3c3c3c';
    ctx.fillRect(x, y, w, h);
    const pct = this.stamina / 100;
    const canUse = pct * 100 >= MIN_DASH_STAMINA;
    ctx.fillStyle = this.isDashing ? '#ff6b35' : canUse ? '#e74c3c' : '#7f8c8d';
    ctx.fillRect(x, y, w * pct, h);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#fff';
    ctx.font = '11px sans-serif';
    ctx.fillText(this.isDashing ? '冲刺中...' : '按住空格冲刺', x, y - 4);
  }
}
