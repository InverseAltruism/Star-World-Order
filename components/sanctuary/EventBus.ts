import Phaser from 'phaser';

// React ↔ Phaser bridge: scenes emit events, React listens (and vice versa)
const EventBus = new Phaser.Events.EventEmitter();

export default EventBus;
