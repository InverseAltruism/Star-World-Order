import { Howl } from 'howler';
import EventBus from '@/components/sanctuary/EventBus';

export interface AudioPrefs {
  muted: boolean;
  masterVolume: number;
  ambientVolume: number;
  sfxVolume: number;
}

export const DEFAULT_AUDIO_PREFS: AudioPrefs = {
  muted: true,
  masterVolume: 1,
  ambientVolume: 0.4,
  sfxVolume: 0.6,
};

const STORAGE_KEY = 'swo:sanctuary:audio-prefs';
const CROSSFADE_MS = 1200;
const AMBIENT_DEFAULT = 'default';

// Per-zone ambient loops keyed by ZoneSystem `location-entered` payload `name`.
// `default` is used when no zone is active (Town Square / open map).
export const AMBIENT_TRACKS: Readonly<Record<string, string>> = Object.freeze({
  [AMBIENT_DEFAULT]: '/audio/sanctuary/ambient/town-square.mp3',
  'Hot Springs': '/audio/sanctuary/ambient/hot-springs.mp3',
  'Training Grounds': '/audio/sanctuary/ambient/training-grounds.mp3',
  'Dream Hollow': '/audio/sanctuary/ambient/dream-hollow.mp3',
  'Star Garden': '/audio/sanctuary/ambient/star-garden.mp3',
  'Nebula Kitchen': '/audio/sanctuary/ambient/nebula-kitchen.mp3',
  'Cosmic Library': '/audio/sanctuary/ambient/cosmic-library.mp3',
  Observatory: '/audio/sanctuary/ambient/observatory.mp3',
  'Aura Forge': '/audio/sanctuary/ambient/aura-forge.mp3',
});

export type SfxKey =
  | 'pet-sparkle'
  | 'feed-munch'
  | 'talk-chirp'
  | 'level-up'
  | 'quest-claim'
  | 'shop-buy'
  | 'door-enter'
  | 'ui-confirm'
  | 'ui-cancel'
  | 'minigame-win';

export const SFX_TRACKS: Readonly<Record<SfxKey, string>> = Object.freeze({
  'pet-sparkle': '/audio/sanctuary/sfx/pet-sparkle.mp3',
  'feed-munch': '/audio/sanctuary/sfx/feed-munch.mp3',
  'talk-chirp': '/audio/sanctuary/sfx/talk-chirp.mp3',
  'level-up': '/audio/sanctuary/sfx/level-up.mp3',
  'quest-claim': '/audio/sanctuary/sfx/quest-claim.mp3',
  'shop-buy': '/audio/sanctuary/sfx/shop-buy.mp3',
  'door-enter': '/audio/sanctuary/sfx/door-enter.mp3',
  'ui-confirm': '/audio/sanctuary/sfx/ui-confirm.mp3',
  'ui-cancel': '/audio/sanctuary/sfx/ui-cancel.mp3',
  'minigame-win': '/audio/sanctuary/sfx/minigame-win.mp3',
});

type PrefsListener = (prefs: AudioPrefs) => void;

interface CompanionInteractedPayload {
  action?: string;
}

interface LocationPayload {
  name?: string;
}

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function sanitizePrefs(raw: unknown): AudioPrefs {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_AUDIO_PREFS };
  const obj = raw as Record<string, unknown>;
  return {
    muted: typeof obj.muted === 'boolean' ? obj.muted : DEFAULT_AUDIO_PREFS.muted,
    masterVolume:
      typeof obj.masterVolume === 'number'
        ? clampVolume(obj.masterVolume)
        : DEFAULT_AUDIO_PREFS.masterVolume,
    ambientVolume:
      typeof obj.ambientVolume === 'number'
        ? clampVolume(obj.ambientVolume)
        : DEFAULT_AUDIO_PREFS.ambientVolume,
    sfxVolume:
      typeof obj.sfxVolume === 'number'
        ? clampVolume(obj.sfxVolume)
        : DEFAULT_AUDIO_PREFS.sfxVolume,
  };
}

export class SanctuaryAudio {
  private prefs: AudioPrefs = { ...DEFAULT_AUDIO_PREFS };
  private subscribers = new Set<PrefsListener>();
  private ambientPool = new Map<string, Howl>();
  private sfxPool = new Map<string, Howl>();
  private currentAmbient: { name: string; howl: Howl } | null = null;
  private initialized = false;
  private boundHandlers: Array<{ event: string; handler: (...args: unknown[]) => void }> = [];

  init(): void {
    if (this.initialized) return;
    if (typeof window === 'undefined') return;
    this.initialized = true;
    this.loadPrefs();
    this.bindEventBus();
  }

  dispose(): void {
    if (!this.initialized) return;
    for (const { event, handler } of this.boundHandlers) {
      EventBus.off(event, handler);
    }
    this.boundHandlers = [];
    this.stopAmbient();
    for (const howl of this.sfxPool.values()) howl.unload();
    for (const howl of this.ambientPool.values()) howl.unload();
    this.sfxPool.clear();
    this.ambientPool.clear();
    this.initialized = false;
  }

  getPrefs(): AudioPrefs {
    return { ...this.prefs };
  }

  subscribe(listener: PrefsListener): () => void {
    this.subscribers.add(listener);
    listener(this.getPrefs());
    return () => {
      this.subscribers.delete(listener);
    };
  }

  setMuted(muted: boolean): void {
    this.updatePrefs({ muted });
  }

  setMasterVolume(value: number): void {
    this.updatePrefs({ masterVolume: clampVolume(value) });
  }

  setAmbientVolume(value: number): void {
    this.updatePrefs({ ambientVolume: clampVolume(value) });
  }

  setSfxVolume(value: number): void {
    this.updatePrefs({ sfxVolume: clampVolume(value) });
  }

  playSfx(key: SfxKey): void {
    if (typeof window === 'undefined') return;
    if (this.prefs.muted) return;
    const url = SFX_TRACKS[key];
    if (!url) return;
    const howl = this.getOrCreateSfx(key, url);
    howl.volume(this.effectiveSfxVolume());
    howl.play();
  }

  playAmbient(zoneName: string | null): void {
    if (typeof window === 'undefined') return;
    const targetKey = zoneName && AMBIENT_TRACKS[zoneName] ? zoneName : AMBIENT_DEFAULT;
    if (this.currentAmbient?.name === targetKey) return;
    if (this.prefs.muted) {
      this.currentAmbient = { name: targetKey, howl: this.getOrCreateAmbient(targetKey) };
      return;
    }

    const previous = this.currentAmbient;
    const nextHowl = this.getOrCreateAmbient(targetKey);
    nextHowl.volume(0);
    if (!nextHowl.playing()) nextHowl.play();
    nextHowl.fade(0, this.effectiveAmbientVolume(), CROSSFADE_MS);

    if (previous) {
      const fadingOut = previous.howl;
      fadingOut.fade(fadingOut.volume(), 0, CROSSFADE_MS);
      fadingOut.once('fade', () => {
        if (this.currentAmbient?.howl !== fadingOut) fadingOut.stop();
      });
    }

    this.currentAmbient = { name: targetKey, howl: nextHowl };
  }

  stopAmbient(): void {
    if (!this.currentAmbient) return;
    const { howl } = this.currentAmbient;
    howl.stop();
    this.currentAmbient = null;
  }

  // --- internals ---

  private updatePrefs(patch: Partial<AudioPrefs>): void {
    this.prefs = { ...this.prefs, ...patch };
    this.persistPrefs();
    this.applyVolumes();
    for (const listener of this.subscribers) listener(this.getPrefs());
  }

  private applyVolumes(): void {
    if (!this.currentAmbient) return;
    if (this.prefs.muted) {
      this.currentAmbient.howl.fade(
        this.currentAmbient.howl.volume(),
        0,
        300
      );
    } else {
      const target = this.effectiveAmbientVolume();
      const current = this.currentAmbient.howl;
      if (!current.playing()) current.play();
      current.fade(current.volume(), target, 300);
    }
  }

  private effectiveAmbientVolume(): number {
    return this.prefs.muted ? 0 : this.prefs.masterVolume * this.prefs.ambientVolume;
  }

  private effectiveSfxVolume(): number {
    return this.prefs.muted ? 0 : this.prefs.masterVolume * this.prefs.sfxVolume;
  }

  private getOrCreateAmbient(zoneName: string): Howl {
    const existing = this.ambientPool.get(zoneName);
    if (existing) return existing;
    const url = AMBIENT_TRACKS[zoneName] ?? AMBIENT_TRACKS[AMBIENT_DEFAULT];
    const howl = new Howl({
      src: [url],
      loop: true,
      volume: 0,
      html5: true,
      preload: true,
      onloaderror: () => {
        // Asset missing; keep service running silently rather than crashing.
      },
      onplayerror: () => {
        // Browsers may block autoplay before first user gesture; retry once.
        howl.once('unlock', () => howl.play());
      },
    });
    this.ambientPool.set(zoneName, howl);
    return howl;
  }

  private getOrCreateSfx(key: SfxKey, url: string): Howl {
    const existing = this.sfxPool.get(key);
    if (existing) return existing;
    const howl = new Howl({
      src: [url],
      loop: false,
      volume: this.effectiveSfxVolume(),
      preload: true,
      onloaderror: () => {
        // Missing SFX asset is non-fatal.
      },
    });
    this.sfxPool.set(key, howl);
    return howl;
  }

  private loadPrefs(): void {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      this.prefs = sanitizePrefs(JSON.parse(raw));
    } catch {
      this.prefs = { ...DEFAULT_AUDIO_PREFS };
    }
  }

  private persistPrefs(): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.prefs));
    } catch {
      // Storage unavailable (private mode, etc.) — keep in-memory prefs.
    }
  }

  private bindEventBus(): void {
    const onLocationEntered = (...args: unknown[]) => {
      const payload = args[0] as LocationPayload | undefined;
      const name = payload?.name;
      if (typeof name === 'string') this.playAmbient(name);
    };
    const onLocationExited = (...args: unknown[]) => {
      const payload = args[0] as LocationPayload | undefined;
      const name = payload?.name;
      if (typeof name === 'string' && this.currentAmbient?.name === name) {
        this.playAmbient(null);
      }
    };
    const onCompanionInteracted = (...args: unknown[]) => {
      const payload = args[0] as CompanionInteractedPayload | undefined;
      switch (payload?.action) {
        case 'pet':
          this.playSfx('pet-sparkle');
          break;
        case 'feed':
          this.playSfx('feed-munch');
          break;
        case 'talk':
          this.playSfx('talk-chirp');
          break;
        default:
          break;
      }
    };
    const onLevelUp = () => this.playSfx('level-up');
    const onQuestClaim = () => this.playSfx('quest-claim');
    const onShopBuy = () => this.playSfx('shop-buy');
    const onDoorEnter = () => this.playSfx('door-enter');

    const bindings: Array<[string, (...args: unknown[]) => void]> = [
      ['location-entered', onLocationEntered],
      ['location-exited', onLocationExited],
      ['companion-interacted', onCompanionInteracted],
      ['companion-level-up', onLevelUp],
      ['companion-quest-claimed', onQuestClaim],
      ['shop-purchase', onShopBuy],
      ['room-entered', onDoorEnter],
    ];

    for (const [event, handler] of bindings) {
      EventBus.on(event, handler);
      this.boundHandlers.push({ event, handler });
    }
  }
}

export const sanctuaryAudio = new SanctuaryAudio();
