export class GameLoop {
  private rafId: number = 0;
  private lastTime: number = 0;
  private running = false;
  public dt: number = 0;
  public elapsed: number = 0;

  constructor(
    private update: (dt: number) => void,
    private render: () => void
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  reset(): void {
    this.elapsed = 0;
    this.dt = 0;
    this.lastTime = performance.now();
  }

  private frame = (now: number) => {
    if (!this.running) return;
    const dtMs = now - this.lastTime;
    this.lastTime = now;
    this.dt = Math.min(dtMs / 1000, 0.1);
    this.elapsed += this.dt;
    this.update(this.dt);
    this.render();
    this.rafId = requestAnimationFrame(this.frame);
  };
}
