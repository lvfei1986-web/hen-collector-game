import { Rect } from '../utils/collision';

export abstract class Entity {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  vx: number = 0;
  vy: number = 0;
  alive: boolean = true;

  constructor(x: number, y: number, width: number, height: number, speed: number) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.speed = speed;
  }

  get centerX(): number {
    return this.x + this.width / 2;
  }

  get centerY(): number {
    return this.y + this.height / 2;
  }

  boundingBox(): Rect {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  }

  abstract update(dt: number): void;
  abstract render(ctx: CanvasRenderingContext2D): void;
}
