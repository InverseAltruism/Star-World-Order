# Sanctuary Audio Assets

The Howler-based audio service in `lib/sanctuary/audio.ts` looks up files at the
exact paths listed below. Drop matching `.mp3` (or `.ogg`/`.webm`) files into
each folder; missing assets are non-fatal — the service silently skips them so
playback degrades gracefully while art is in flight.

## Format guidelines

- **Container**: `.mp3` (preferred for browser compat) or `.ogg`/`.webm`.
- **Sample rate**: 44.1 kHz.
- **Bitrate**: ambient 96–128 kbps mono/stereo; SFX 96 kbps mono.
- **Loudness**: normalize to ~-18 LUFS for ambient, ~-14 LUFS for SFX so the
  master mix stays in headroom under crossfade.
- **Loop joins**: ambient tracks must loop seamlessly (zero-cross trim).

## `ambient/` — per-zone background loops (8 + 1 default)

Crossfaded over 1.2s on `location-entered` / `location-exited` events from
`game/systems/ZoneSystem.ts`.

| File | Zone | Mood |
| --- | --- | --- |
| `town-square.mp3` | (default / no zone) | Welcoming, soft pads |
| `hot-springs.mp3` | Hot Springs | Bubbling water, warm choir |
| `training-grounds.mp3` | Training Grounds | Driving low percussion |
| `dream-hollow.mp3` | Dream Hollow | Hazy lullaby, sub bass |
| `star-garden.mp3` | Star Garden | Twinkling celesta |
| `nebula-kitchen.mp3` | Nebula Kitchen | Playful kitchen jingle |
| `cosmic-library.mp3` | Cosmic Library | Quiet harp + page rustle |
| `observatory.mp3` | Observatory | Spacey synth drone |
| `aura-forge.mp3` | Aura Forge | Industrial ambient hum |

## `sfx/` — interaction one-shots (10)

Triggered from EventBus events emitted by overlays / scenes.

| File | Event source | Description |
| --- | --- | --- |
| `pet-sparkle.mp3` | `companion-interacted` (action: pet) | Glittery chime |
| `feed-munch.mp3` | `companion-interacted` (action: feed) | Soft munch + happy chirp |
| `talk-chirp.mp3` | `companion-interacted` (action: talk) | Tiny vocal tone |
| `level-up.mp3` | `companion-level-up` | Triumphant arpeggio |
| `quest-claim.mp3` | `companion-quest-claimed` | Coin-burst flourish |
| `shop-buy.mp3` | `shop-purchase` | Cash-register ding |
| `door-enter.mp3` | `room-entered` | Whoosh + soft thud |
| `ui-confirm.mp3` | (manual) | Soft pop |
| `ui-cancel.mp3` | (manual) | Lower mute pop |
| `minigame-win.mp3` | (manual) | Celebratory fanfare |

## Mute / volume

The service is muted by default. Players control mute + master / ambient / SFX
volumes from the audio panel inside Spawn Fox's help dialog (the WelcomeDialog
overlay after the intro is complete). Prefs persist in `localStorage` under
`swo:sanctuary:audio-prefs`.
