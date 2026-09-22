type KeyState = {
  pressed: boolean;
  justPressed: boolean;
};

export class InputManager {
  private keys: Map<string, KeyState> = new Map();
  private _preventDefault: (e: KeyboardEvent) => void;

  constructor() {
    this._preventDefault = (e: KeyboardEvent) => {
      const tracked = ['w', 'a', 's', 'd', ' ', 'f'];
      if (tracked.includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('keydown', this._preventDefault);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('keydown', this._preventDefault);
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    const state = this.keys.get(key);
    if (!state) {
      this.keys.set(key, { pressed: true, justPressed: true });
    } else if (!state.pressed) {
      state.justPressed = true;
      state.pressed = true;
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    const state = this.keys.get(key);
    if (state) {
      state.pressed = false;
    }
  };

  isDown(key: string): boolean {
    return this.keys.get(key.toLowerCase())?.pressed ?? false;
  }

  wasPressed(key: string): boolean {
    const state = this.keys.get(key.toLowerCase());
    if (state?.justPressed) {
      state.justPressed = false;
      return true;
    }
    return false;
  }

  getDirection(): { dx: number; dy: number } {
    let dx = 0;
    let dy = 0;
    if (this.isDown('w')) dy -= 1;
    if (this.isDown('s')) dy += 1;
    if (this.isDown('a')) dx -= 1;
    if (this.isDown('d')) dx += 1;
    if (dx !== 0 && dy !== 0) {
      const len = Math.SQRT1_2;
      dx *= len;
      dy *= len;
    }
    return { dx, dy };
  }
}
