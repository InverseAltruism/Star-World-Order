import EventEmitter from 'eventemitter3';

// React ↔ Phaser bridge: scenes emit events, React listens (and vice versa).
//
// Uses eventemitter3 (Phaser's own underlying emitter) rather than Node's
// `events`. eventemitter3 is pure JS with no `window`/`document` references, so
// it is SSR-safe under Next.js — while ALSO supporting the `(event, fn, context)`
// signature that Phaser scenes rely on (`EventBus.on('x', this.handler, this)`).
//
// This matters: with Node's EventEmitter the 3rd `this` arg was silently dropped
// and the method passed unbound, so scene handlers ran with the wrong `this`
// (e.g. RoomScene's `minigame-launch` handler threw on `this.scene` → "games
// don't work"). eventemitter3 binds the context correctly, and `off(event)` with
// no listener removes all listeners for that event (matching WorldScene cleanup).
const EventBus = new EventEmitter();

export default EventBus;
