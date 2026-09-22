import { formatTime, formatTimeShort, loadLeaderboard, LeaderboardEntry } from '../utils/leaderboard';
import { SpriteManager, SpriteKey } from '../utils/spriteManager';
import { AudioManager, AudioKey, SfxKey } from '../utils/audioManager';

export type Screen = 'menu' | 'playing' | 'end' | 'leaderboard' | 'sprite' | 'audio' | 'pause';
export type PlayerRole = 'hen' | 'eagle';

export class UIManager {
  private screen: Screen = 'menu';
  private onStart: (role: PlayerRole) => void = () => {};
  private onRestart: (role: PlayerRole) => void = () => {};
  private onBackMenu: () => void = () => {};
  private onSaveScore: (name: string) => void = () => {};
  private selectedRole: PlayerRole = 'hen';
  private pauseEnabled = false;

  constructor() {
    this.bindButtons();
    this.bindSpritePanel();
    this.bindAudioPanel();
    this.bindRoleSelect();
    this.bindPauseMenu();
    this.bindEscape();
  }

  bindRoleSelect(): void {
    document.querySelectorAll('.role-img-btn').forEach((el) => {
      el.addEventListener('click', () => {
        document.querySelectorAll('.role-img-btn').forEach((b) => b.classList.remove('active'));
        el.classList.add('active');
        this.selectedRole = (el as HTMLElement).dataset.role as PlayerRole;
      });
    });
  }

  bindEscape(): void {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.screen === 'playing' && this.pauseEnabled) {
          this.showPause();
        } else if (this.screen === 'pause') {
          this.resumeFromPause();
        }
      }
    });
  }

  setPauseEnabled(v: boolean): void {
    this.pauseEnabled = v;
  }

  bindPauseMenu(): void {
    document.getElementById('pause-exit-btn')!.addEventListener('click', () => {
      this.onBackMenu();
    });
    document.getElementById('pause-restart-btn')!.addEventListener('click', () => {
      this.onRestart(this.selectedRole);
    });
  }

  getRole(): PlayerRole {
    return this.selectedRole;
  }

  bindButtons(): void {
    document.getElementById('start-btn')!.addEventListener('click', () => this.onStart(this.selectedRole));
    document.getElementById('menu-leaderboard-btn')!.addEventListener('click', () => this.showLeaderboard('menu'));
    document.getElementById('restart-btn')!.addEventListener('click', () => this.onRestart(this.selectedRole));
    document.getElementById('back-menu-btn')!.addEventListener('click', () => this.showMenu());
    document.getElementById('end-leaderboard-btn')!.addEventListener('click', () => this.showLeaderboard('end'));
    document.getElementById('leaderboard-back-btn')!.addEventListener('click', () => this.showBackFromLeaderboard());
    document.getElementById('save-score-btn')!.addEventListener('click', () => {
      const nameInput = document.getElementById('player-name') as HTMLInputElement;
      const name = nameInput.value.trim();
      if (!name) {
        const status = document.getElementById('save-status')!;
        status.textContent = '请输入姓名！';
        setTimeout(() => (status.textContent = ''), 2000);
        return;
      }
      this.onSaveScore(name);
    });
    const spriteBtn = document.getElementById('sprite-btn');
    if (spriteBtn) spriteBtn.addEventListener('click', () => this.showSpritePanel());
    const audioBtn = document.getElementById('audio-btn');
    if (audioBtn) audioBtn.addEventListener('click', () => this.showAudioPanel());
  }

  bindSpritePanel(): void {
    const sprite = SpriteManager.getInstance();

    const setupFileInput = (key: SpriteKey) => {
      const fileInput = document.getElementById(`file-${key}`) as HTMLInputElement;
      const btn = document.querySelector(`[data-target="${key}"]`) as HTMLButtonElement;
      btn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const dataUrl = await this.fileToDataURL(file);
        await sprite.setFromDataURL(key, dataUrl);
        this.updateSpritePreview(key, dataUrl);
        fileInput.value = '';
      });
    };

    setupFileInput('hen');
    setupFileInput('chick');
    setupFileInput('eagle');

    document.querySelectorAll('[data-reset]').forEach((el) => {
      el.addEventListener('click', () => {
        const key = (el as HTMLElement).dataset.reset as SpriteKey;
        sprite.reset(key);
        this.resetSpritePreview(key);
      });
    });

    document.getElementById('sprite-reset-all-btn')!.addEventListener('click', () => {
      sprite.resetAll();
      this.resetSpritePreview('hen');
      this.resetSpritePreview('chick');
      this.resetSpritePreview('eagle');
    });

    document.getElementById('sprite-back-btn')!.addEventListener('click', () => this.showMenu());
  }

  bindAudioPanel(): void {
    const audio = AudioManager.getInstance();

    // Build SFX items dynamically
    const sfxGrid = document.getElementById('audio-sfx-grid')!;
    const icons: Record<SfxKey, string> = {
      collect: '🐤', itemPickup: '🎁', itemUse: '✨', eagleSpawn: '🦅',
      eagleHit: '💥', dash: '💨', win: '🎉', lose: '💀',
      itemFreeze: '❄️', itemSpeed: '⚡', itemShield: '🛡️', itemType: '⌨️', itemTextBall: '🏓',
    };
    for (const key of audio.sfxKeys) {
      const label = audio.sfxLabelMap[key];
      const item = document.createElement('div');
      item.className = 'audio-item';
      item.innerHTML = `
        <div class="audio-icon">${icons[key]}</div>
        <div class="audio-label">${label}</div>
        <div class="audio-status" id="status-${key}">默认</div>
        <input type="file" id="file-${key}" accept="audio/*" hidden />
        <div class="audio-buttons">
          <button class="btn small" data-target="${key}">选择音频</button>
          <button class="btn small ghost" data-reset="${key}">重置</button>
          <button class="btn small ghost" data-preview="${key}">试听</button>
        </div>
      `;
      sfxGrid.appendChild(item);
    }

    const setupFileInput = (key: AudioKey) => {
      const fileInput = document.getElementById(`file-${key}`) as HTMLInputElement;
      const btn = document.querySelector(`#audio-screen [data-target="${key}"]`) as HTMLButtonElement;
      btn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const dataUrl = await this.fileToDataURL(file);
        await audio.setFromDataURL(key, dataUrl);
        this.updateAudioStatus(key);
        fileInput.value = '';
      });
    };

    setupFileInput('bgm');
    for (const key of audio.sfxKeys) {
      setupFileInput(key);
    }

    document.querySelectorAll('#audio-screen [data-reset]').forEach((el) => {
      el.addEventListener('click', () => {
        const key = (el as HTMLElement).dataset.reset as AudioKey;
        audio.reset(key);
        this.updateAudioStatus(key);
      });
    });

    document.querySelectorAll('#audio-screen [data-preview]').forEach((el) => {
      el.addEventListener('click', () => {
        const key = (el as HTMLElement).dataset.preview as AudioKey;
        audio.preview(key);
      });
    });

    document.getElementById('audio-reset-all-btn')!.addEventListener('click', () => {
      audio.resetAll();
      this.updateAllAudioStatuses();
    });

    document.getElementById('audio-back-btn')!.addEventListener('click', () => {
      audio.stopPreview();
      this.showMenu();
    });

    // Volume sliders
    const bgmSlider = document.getElementById('bgm-volume') as HTMLInputElement;
    const bgmVal = document.getElementById('bgm-volume-val')!;
    bgmSlider.value = String(audio.bgmVolumeValue);
    bgmVal.textContent = `${Math.round(audio.bgmVolumeValue * 100)}%`;
    bgmSlider.addEventListener('input', () => {
      const v = parseFloat(bgmSlider.value);
      audio.setBgmVolume(v);
      bgmVal.textContent = `${Math.round(v * 100)}%`;
    });

    const sfxSlider = document.getElementById('sfx-volume') as HTMLInputElement;
    const sfxVal = document.getElementById('sfx-volume-val')!;
    sfxSlider.value = String(audio.sfxVolumeValue);
    sfxVal.textContent = `${Math.round(audio.sfxVolumeValue * 100)}%`;
    sfxSlider.addEventListener('input', () => {
      const v = parseFloat(sfxSlider.value);
      audio.setSfxVolume(v);
      sfxVal.textContent = `${Math.round(v * 100)}%`;
    });

    // Mute toggle
    const muteBtn = document.getElementById('audio-mute-btn')!;
    this.updateMuteButton(muteBtn, audio.isMuted);
    muteBtn.addEventListener('click', () => {
      const muted = audio.toggleMute();
      this.updateMuteButton(muteBtn, muted);
    });
  }

  private updateMuteButton(btn: HTMLElement, muted: boolean): void {
    btn.textContent = muted ? '🔇 取消静音' : '🔊 静音';
  }

  private updateAudioStatus(key: AudioKey): void {
    const audio = AudioManager.getInstance();
    const el = document.getElementById(`status-${key}`);
    if (el) {
      el.textContent = audio.isCustom(key) ? '✓ 已自定义' : '默认';
    }
  }

  private updateAllAudioStatuses(): void {
    const audio = AudioManager.getInstance();
    this.updateAudioStatus('bgm');
    for (const key of audio.sfxKeys) {
      this.updateAudioStatus(key);
    }
  }

  private fileToDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  private updateSpritePreview(key: SpriteKey, dataUrl: string): void {
    const container = document.getElementById(`preview-${key}`)!;
    container.innerHTML = '';
    const img = document.createElement('img');
    img.src = dataUrl;
    container.appendChild(img);
  }

  private resetSpritePreview(key: SpriteKey): void {
    const placeholders: Record<SpriteKey, string> = { hen: '🐔', chick: '🐤', eagle: '🦅' };
    const container = document.getElementById(`preview-${key}`)!;
    container.innerHTML = `<span class="sprite-placeholder">${placeholders[key]}</span>`;
  }

  refreshSpritePreviews(): void {
    const sprite = SpriteManager.getInstance();
    const keys: SpriteKey[] = ['hen', 'chick', 'eagle'];
    for (const k of keys) {
      const img = sprite.get(k);
      if (img) {
        this.updateSpritePreview(k, img.src);
      } else {
        this.resetSpritePreview(k);
      }
    }
  }

  setCallbacks(callbacks: {
    onStart: (role: PlayerRole) => void;
    onRestart: (role: PlayerRole) => void;
    onBackMenu: () => void;
    onSaveScore: (name: string) => void;
  }): void {
    this.onStart = callbacks.onStart;
    this.onRestart = callbacks.onRestart;
    this.onBackMenu = callbacks.onBackMenu;
    this.onSaveScore = callbacks.onSaveScore;
  }

  showMenu(): void {
    this.screen = 'menu';
    this.hideAllScreens();
    document.getElementById('menu-screen')!.classList.remove('hidden');
  }

  showSpritePanel(): void {
    this.screen = 'sprite';
    this.hideAllScreens();
    document.getElementById('sprite-screen')!.classList.remove('hidden');
    this.refreshSpritePreviews();
  }

  showAudioPanel(): void {
    this.screen = 'audio';
    this.hideAllScreens();
    document.getElementById('audio-screen')!.classList.remove('hidden');
    this.updateAllAudioStatuses();
  }

  showEnd(won: boolean, time: number): void {
    this.screen = 'end';
    this.hideAllScreens();
    document.getElementById('end-screen')!.classList.remove('hidden');
    document.getElementById('end-title')!.textContent = won ? '🎉 母鸡胜利！' : '💀 老鹰胜利';
    document.getElementById('end-time')!.textContent = `用时: ${formatTimeShort(time)}`;
    (document.getElementById('player-name') as HTMLInputElement).value = '';
    document.getElementById('save-status')!.textContent = '';
  }

  showLeaderboard(returnFrom: 'menu' | 'end'): void {
    this.screen = 'leaderboard';
    this.hideAllScreens();
    document.getElementById('leaderboard-screen')!.classList.remove('hidden');
    void this.renderLeaderboard();
    (document.getElementById('leaderboard-screen') as any).dataset.returnFrom = returnFrom;
  }

  showBackFromLeaderboard(): void {
    const returnFrom = (document.getElementById('leaderboard-screen') as any).dataset.returnFrom || 'menu';
    if (returnFrom === 'end') {
      this.showEnd(false, 0);
    } else {
      this.showMenu();
    }
  }

  showPause(): void {
    this.screen = 'pause';
    this.hideAllScreens();
    document.getElementById('pause-screen')!.classList.remove('hidden');
  }

  resumeFromPause(): void {
    this.hideAll();
  }

  hideAllScreens(): void {
    document.getElementById('menu-screen')!.classList.add('hidden');
    document.getElementById('end-screen')!.classList.add('hidden');
    document.getElementById('leaderboard-screen')!.classList.add('hidden');
    document.getElementById('sprite-screen')!.classList.add('hidden');
    document.getElementById('audio-screen')!.classList.add('hidden');
    document.getElementById('pause-screen')!.classList.add('hidden');
  }

  private async renderLeaderboard(): Promise<void> {
    const list = document.getElementById('leaderboard-list')!;
    // 加载期间显示加载中状态
    list.innerHTML = '<div class="leaderboard-empty">加载中...</div>';
    const entries = await loadLeaderboard();
    if (entries.length === 0) {
      list.innerHTML = '<div class="leaderboard-empty">暂无记录，快来刷新榜单吧！</div>';
      return;
    }
    list.innerHTML = entries
      .map(
        (e: LeaderboardEntry, i: number) => `
      <div class="leaderboard-entry">
        <span class="rank">#${i + 1}</span>
        <span class="name">${this.escape(e.name)}</span>
        <span class="time">${formatTime(e.time)}</span>
        <span class="result">${e.won ? '✓' : '✗'}</span>
      </div>`
      )
      .join('');
  }

  private escape(s: string): string {
    return s.replace(/[<>]/g, (c) => (c === '<' ? '&lt;' : '&gt;'));
  }

  isPlaying(): boolean {
    return this.screen === 'playing';
  }

  hideAll(): void {
    this.screen = 'playing';
    this.hideAllScreens();
  }
}
