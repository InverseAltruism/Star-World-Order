import { EventEmitter } from 'events';

// React ↔ Phaser bridge: scenes emit events, React listens (and vice versa).
// Uses Node's EventEmitter (universal, SSR-safe) instead of Phaser's, since
// importing Phaser at module-load time triggers `window is not defined`
// under Next.js SSR.
const EventBus = new EventEmitter();

export default EventBus;
