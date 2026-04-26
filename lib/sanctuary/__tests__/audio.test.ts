// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Polyfill window + localStorage for the audio service (env: node) -----
class MemoryStorage {
  private store: Record<string, string> = {};
  getItem(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = value;
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
  clear(): void {
    this.store = {};
  }
}

const memStorage = new MemoryStorage();
const g = globalThis as unknown as Record<string, unknown>;
g.window = { localStorage: memStorage };
g.localStorage = memStorage;

// --- Mock howler + EventBus via vi.hoisted (vi.mock factories are hoisted)
const { MockHowl, playSpies, eventBus } = vi.hoisted(() => {
  interface HowlOpts {
    src: string[];
    loop?: boolean;
    volume?: number;
  }

  const spies: Array<{ key: string; instance: MockHowlImpl }> = [];

  class MockHowlImpl {
    static instances: MockHowlImpl[] = [];
    private _volume: number;
    private _playing = false;
    public playCount = 0;
    public stopCount = 0;
    public fades: Array<{ from: number; to: number; duration: number }> = [];
    constructor(public opts: HowlOpts) {
      this._volume = opts.volume ?? 0;
      MockHowlImpl.instances.push(this);
    }
    play(): number {
      this._playing = true;
      this.playCount += 1;
      spies.push({ key: this.opts.src[0] ?? 'unknown', instance: this });
      return 1;
    }
    stop(): this {
      this._playing = false;
      this.stopCount += 1;
      return this;
    }
    fade(from: number, to: number, duration: number): this {
      this.fades.push({ from, to, duration });
      this._volume = to;
      return this;
    }
    volume(value?: number): number | this {
      if (value === undefined) return this._volume;
      this._volume = value;
      return this;
    }
    once(): this {
      return this;
    }
    on(): this {
      return this;
    }
    off(): this {
      return this;
    }
    playing(): boolean {
      return this._playing;
    }
    unload(): void {
      this._playing = false;
    }
  }

  class MiniEmitter {
    private map = new Map<string, Set<(...args: unknown[]) => void>>();
    on(event: string, fn: (...args: unknown[]) => void) {
      if (!this.map.has(event)) this.map.set(event, new Set());
      this.map.get(event)!.add(fn);
    }
    off(event: string, fn: (...args: unknown[]) => void) {
      this.map.get(event)?.delete(fn);
    }
    emit(event: string, ...args: unknown[]) {
      const subs = this.map.get(event);
      if (!subs) return;
      for (const fn of subs) fn(...args);
    }
  }

  return {
    MockHowl: MockHowlImpl,
    playSpies: spies,
    eventBus: new MiniEmitter(),
  };
});

vi.mock('howler', () => ({ Howl: MockHowl }));
vi.mock('@/components/sanctuary/EventBus', () => ({ default: eventBus }));

// --- Imports (after mocks) ------------------------------------------------
import {
  SanctuaryAudio,
  DEFAULT_AUDIO_PREFS,
  AMBIENT_TRACKS,
  SFX_TRACKS,
} from '../audio';

describe('sanctuary audio service', () => {
  let audio: SanctuaryAudio;

  beforeEach(() => {
    memStorage.clear();
    MockHowl.instances.length = 0;
    playSpies.length = 0;
    audio = new SanctuaryAudio();
    audio.init();
  });

  afterEach(() => {
    audio.dispose();
  });

  describe('defaults', () => {
    it('starts muted with sane default volumes', () => {
      const prefs = audio.getPrefs();
      expect(prefs.muted).toBe(true);
      expect(prefs.masterVolume).toBe(DEFAULT_AUDIO_PREFS.masterVolume);
      expect(prefs.ambientVolume).toBe(DEFAULT_AUDIO_PREFS.ambientVolume);
      expect(prefs.sfxVolume).toBe(DEFAULT_AUDIO_PREFS.sfxVolume);
    });

    it('exposes 8 zone ambient tracks plus a default', () => {
      const keys = Object.keys(AMBIENT_TRACKS);
      // 1 default + 8 named zones = 9
      expect(keys.length).toBeGreaterThanOrEqual(9);
      expect(AMBIENT_TRACKS.default).toMatch(/\.mp3$/);
    });

    it('exposes 10 sfx tracks', () => {
      expect(Object.keys(SFX_TRACKS)).toHaveLength(10);
    });
  });

  describe('preferences', () => {
    it('persists muted state and volume changes to localStorage', () => {
      audio.setMuted(false);
      audio.setMasterVolume(0.5);
      audio.setAmbientVolume(0.25);
      audio.setSfxVolume(0.75);

      const stored = JSON.parse(
        memStorage.getItem('swo:sanctuary:audio-prefs') as string,
      );
      expect(stored).toEqual({
        muted: false,
        masterVolume: 0.5,
        ambientVolume: 0.25,
        sfxVolume: 0.75,
      });
    });

    it('clamps out-of-range volumes to [0, 1]', () => {
      audio.setMasterVolume(2);
      audio.setSfxVolume(-1);
      const prefs = audio.getPrefs();
      expect(prefs.masterVolume).toBe(1);
      expect(prefs.sfxVolume).toBe(0);
    });

    it('restores persisted prefs on a fresh instance', () => {
      memStorage.setItem(
        'swo:sanctuary:audio-prefs',
        JSON.stringify({
          muted: false,
          masterVolume: 0.8,
          ambientVolume: 0.2,
          sfxVolume: 0.4,
        }),
      );
      const fresh = new SanctuaryAudio();
      fresh.init();
      expect(fresh.getPrefs()).toEqual({
        muted: false,
        masterVolume: 0.8,
        ambientVolume: 0.2,
        sfxVolume: 0.4,
      });
      fresh.dispose();
    });

    it('notifies subscribers immediately and on changes', () => {
      const calls: number[] = [];
      const unsubscribe = audio.subscribe((p) => calls.push(p.masterVolume));
      audio.setMasterVolume(0.3);
      audio.setMasterVolume(0.7);
      unsubscribe();
      audio.setMasterVolume(0.1); // post-unsubscribe — should not record

      expect(calls).toEqual([
        DEFAULT_AUDIO_PREFS.masterVolume, // initial snapshot on subscribe
        0.3,
        0.7,
      ]);
    });
  });

  describe('SFX playback via EventBus', () => {
    it('does not play SFX while muted', () => {
      eventBus.emit('companion-interacted', { action: 'pet' });
      expect(playSpies).toHaveLength(0);
    });

    it('plays pet-sparkle on companion-interacted action=pet when unmuted', () => {
      audio.setMuted(false);
      eventBus.emit('companion-interacted', { action: 'pet' });
      expect(playSpies).toHaveLength(1);
      expect(playSpies[0].key).toBe(SFX_TRACKS['pet-sparkle']);
    });

    it('routes feed and talk actions to distinct SFX', () => {
      audio.setMuted(false);
      eventBus.emit('companion-interacted', { action: 'feed' });
      eventBus.emit('companion-interacted', { action: 'talk' });
      const keys = playSpies.map((p) => p.key);
      expect(keys).toContain(SFX_TRACKS['feed-munch']);
      expect(keys).toContain(SFX_TRACKS['talk-chirp']);
    });

    it('plays level-up SFX on companion-level-up event', () => {
      audio.setMuted(false);
      eventBus.emit('companion-level-up', { tokenId: 1 });
      expect(playSpies.some((p) => p.key === SFX_TRACKS['level-up'])).toBe(true);
    });

    it('ignores unknown companion actions', () => {
      audio.setMuted(false);
      eventBus.emit('companion-interacted', { action: 'sneeze' });
      expect(playSpies).toHaveLength(0);
    });
  });

  describe('ambient music', () => {
    it('switches ambient track on location-entered when unmuted', () => {
      audio.setMuted(false);
      eventBus.emit('location-entered', { name: 'Hot Springs' });

      const hotSprings = MockHowl.instances.find(
        (h) => h.opts.src[0] === AMBIENT_TRACKS['Hot Springs'],
      );
      expect(hotSprings).toBeDefined();
      expect(hotSprings!.playing()).toBe(true);
    });

    it('crossfades between zones when entering a new location', () => {
      audio.setMuted(false);
      eventBus.emit('location-entered', { name: 'Hot Springs' });
      eventBus.emit('location-entered', { name: 'Star Garden' });

      const hot = MockHowl.instances.find(
        (h) => h.opts.src[0] === AMBIENT_TRACKS['Hot Springs'],
      )!;
      const garden = MockHowl.instances.find(
        (h) => h.opts.src[0] === AMBIENT_TRACKS['Star Garden'],
      )!;

      // Both should have fade calls — incoming fades up, outgoing fades down.
      expect(garden.fades.some((f) => f.to > 0)).toBe(true);
      expect(hot.fades.some((f) => f.to === 0)).toBe(true);
    });

    it('returns to default ambient on location-exited', () => {
      audio.setMuted(false);
      eventBus.emit('location-entered', { name: 'Hot Springs' });
      eventBus.emit('location-exited', { name: 'Hot Springs' });

      const def = MockHowl.instances.find(
        (h) => h.opts.src[0] === AMBIENT_TRACKS.default,
      );
      expect(def).toBeDefined();
      expect(def!.playing()).toBe(true);
    });

    it('does not duplicate ambient instances when re-entering same zone', () => {
      audio.setMuted(false);
      eventBus.emit('location-entered', { name: 'Hot Springs' });
      eventBus.emit('location-entered', { name: 'Hot Springs' });
      const hot = MockHowl.instances.filter(
        (h) => h.opts.src[0] === AMBIENT_TRACKS['Hot Springs'],
      );
      expect(hot).toHaveLength(1);
    });
  });

  describe('dispose', () => {
    it('detaches EventBus listeners so events no longer trigger SFX', () => {
      audio.setMuted(false);
      audio.dispose();
      eventBus.emit('companion-interacted', { action: 'pet' });
      expect(playSpies).toHaveLength(0);
    });
  });
});
