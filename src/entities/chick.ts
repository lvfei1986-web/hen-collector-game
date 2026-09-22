import { Entity } from './entity';
import { CHICK_SIZE } from '../utils/constants';
import { SpriteManager, drawSprite } from '../utils/spriteManager';

export class Chick extends Entity {
  detachedTimer = 0;

  constructor(x: number, y: number) {
    super(x, y, CHICK_SIZE, CHICK_SIZE, 0);
  }

  moveTo(cx: number, cy: number): void {
    this.x = cx;
    this.y = cy;
  }

  update(dt: number): void {
    if (this.detachedTimer > 0) this.detachedTimer -= dt;
  }

  render(ctx: CanvasRenderingContext2D): void {
    const sprite = SpriteManager.getInstance().get('chick');
    if (sprite) {
      drawSprite(ctx, sprite, this.centerX, this.centerY, this.width, this.height);
      return;
    }

    ctx.fillStyle = this.detachedTimer > 0 ? '#ffeb3b' : '#ffd54f';
    ctx.beginPath();
    ctx.arc(this.centerX, this.centerY, this.width / 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(this.centerX + 3, this.centerY - 3, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(this.centerX + 3.5, this.centerY - 3, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
}
