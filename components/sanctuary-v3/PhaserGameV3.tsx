'use client';

import { forwardRef, useEffect, useLayoutEffect, useRef } from 'react';
import Phaser from 'phaser';
import { GAME_CONFIG_V3 } from '@/game/v3/config/GameConfigV3';
import EventBus from '@/components/sanctuary/EventBus';

export interface PhaserGameV3Ref {
  game: Phaser.Game | null;
  scene: Phaser.Scene | null;
}

interface Props {
  onSceneReady?: (scene: Phaser.Scene) => void;
}

const PhaserGameV3 = forwardRef<PhaserGameV3Ref, Props>(function PhaserGameV3(
  { onSceneReady }, ref,
) {
  const gameRef = useRef<Phaser.Game | null>(null);

  useLayoutEffect(() => {
    if (gameRef.current) return;
    const game = new Phaser.Game({ ...GAME_CONFIG_V3 });
    gameRef.current = game;
    if (typeof ref === 'function') ref({ game, scene: null });
    else if (ref) ref.current = { game, scene: null };
    return () => { game.destroy(true); gameRef.current = null; };
  }, [ref]);

  useEffect(() => {
    const handler = (scene: Phaser.Scene) => {
      if (typeof ref === 'function') ref({ game: gameRef.current, scene });
      else if (ref) ref.current = { game: gameRef.current, scene };
      onSceneReady?.(scene);
    };
    EventBus.on('scene-ready', handler);
    return () => { EventBus.off('scene-ready', handler); };
  }, [ref, onSceneReady]);

  return (
    <div
      id="phaser-sanctuary-v3"
      style={{
        imageRendering: 'pixelated',
        aspectRatio: '4 / 3',
        width: '100%',
      }}
    />
  );
});

export default PhaserGameV3;
