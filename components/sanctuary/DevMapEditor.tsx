'use client';

import { useEffect, useState } from 'react';
import EventBus from './EventBus';

type Mode = 'door' | 'collision' | 'spawn';

interface DoorEntry { kind: 'door'; room: string; x: number; y: number; w: number; h: number }
interface CollisionEntry { kind: 'collision'; x: number; y: number; w: number; h: number }
interface SpawnEntry { kind: 'spawn'; x: number; y: number }
type Entry = DoorEntry | CollisionEntry | SpawnEntry;

const ROOMS = [
  'Hot Springs', 'Observatory', 'Training Grounds', 'Nebula Kitchen',
  'Star Garden', 'Cosmic Library', 'Dream Hollow', 'Aura Forge',
];

export default function DevMapEditor() {
  const [mode, setMode] = useState<Mode>('door');
  const [room, setRoom] = useState(ROOMS[0]);
  const [mouse, setMouse] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [corner, setCorner] = useState<{ x: number; y: number } | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    EventBus.emit('editor-mode', true);
    return () => { EventBus.emit('editor-mode', false); };
  }, []);

  useEffect(() => {
    const onMouse = (p: { x: number; y: number }) => setMouse(p);
    const onCorner = (p: { x: number; y: number }) => setCorner({ x: p.x, y: p.y });
    const onRect = (r: { x: number; y: number; w: number; h: number }) => {
      setCorner(null);
      if (mode === 'spawn') {
        setEntries((e) => [...e.filter((x) => x.kind !== 'spawn'), { kind: 'spawn', x: r.x, y: r.y }]);
      } else if (mode === 'door') {
        setEntries((e) => [...e, { kind: 'door', room, x: r.x, y: r.y, w: r.w, h: r.h }]);
      } else {
        setEntries((e) => [...e, { kind: 'collision', x: r.x, y: r.y, w: r.w, h: r.h }]);
      }
    };
    EventBus.on('editor-mouse', onMouse);
    EventBus.on('editor-corner', onCorner);
    EventBus.on('editor-rect', onRect);
    return () => {
      EventBus.off('editor-mouse', onMouse);
      EventBus.off('editor-corner', onCorner);
      EventBus.off('editor-rect', onRect);
    };
  }, [mode, room]);

  const asTS = () => {
    const spawn = entries.find((e) => e.kind === 'spawn') as SpawnEntry | undefined;
    const doors = entries.filter((e) => e.kind === 'door') as DoorEntry[];
    const cols = entries.filter((e) => e.kind === 'collision') as CollisionEntry[];
    const out: string[] = [];
    if (spawn) out.push(`export const SPAWN = { x: ${spawn.x}, y: ${spawn.y} };`);
    out.push('export const DOORS: Door[] = [');
    for (const d of doors) out.push(`  { room: '${d.room}', x: ${d.x}, y: ${d.y}, w: ${d.w}, h: ${d.h} },`);
    out.push('];');
    out.push('export const COLLISION: Rect[] = [');
    for (const c of cols) out.push(`  { x: ${c.x}, y: ${c.y}, w: ${c.w}, h: ${c.h} },`);
    out.push('];');
    return out.join('\n');
  };

  const copy = () => { navigator.clipboard.writeText(asTS()); };
  const undo = () => setEntries((e) => e.slice(0, -1));
  const clear = () => { setEntries([]); setCorner(null); };

  return (
    <div className="absolute top-2 right-2 z-50 w-72 bg-black/90 border border-[#00ff88] rounded p-2 text-[10px] text-white font-mono space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[#00ff88] font-bold">MAP EDITOR</span>
        <span className="text-[#ffd700]">x={mouse.x} y={mouse.y}</span>
      </div>
      <div className="flex gap-1">
        {(['door', 'collision', 'spawn'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setCorner(null); }}
            className={`px-2 py-1 rounded text-[9px] uppercase ${
              mode === m ? 'bg-[#00ff88] text-black' : 'bg-black border border-[#00ff88]/40 text-[#00ff88]'
            }`}
          >{m}</button>
        ))}
      </div>
      {mode === 'door' && (
        <select
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          className="w-full bg-black border border-[#00ff88]/40 text-[#ffd700] text-[10px] p-1"
        >
          {ROOMS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      )}
      <div className="text-[#9966ff] leading-tight">
        {mode === 'spawn'
          ? 'click once to set spawn'
          : corner
          ? `corner A: (${corner.x}, ${corner.y}) — click corner B`
          : 'click two corners to define rect'}
      </div>
      <div className="max-h-40 overflow-auto border border-[#00ff88]/20 p-1 space-y-0.5">
        {entries.length === 0 && <div className="text-gray-500 italic">no entries yet</div>}
        {entries.map((e, i) => (
          <div key={i} className="flex justify-between gap-1">
            <span className="truncate">
              {e.kind === 'door' && `🚪 ${(e as DoorEntry).room}: ${e.x},${e.y} ${(e as DoorEntry).w}×${(e as DoorEntry).h}`}
              {e.kind === 'collision' && `🧱 ${e.x},${e.y} ${(e as CollisionEntry).w}×${(e as CollisionEntry).h}`}
              {e.kind === 'spawn' && `⭐ spawn ${e.x},${e.y}`}
            </span>
          </div>
        ))}
      </div>
      <div className="flex gap-1">
        <button onClick={copy} className="flex-1 px-2 py-1 bg-[#00ff88] text-black font-bold rounded text-[9px]">COPY TS</button>
        <button onClick={undo} className="px-2 py-1 bg-black border border-[#ffd700] text-[#ffd700] rounded text-[9px]">UNDO</button>
        <button onClick={clear} className="px-2 py-1 bg-black border border-[#ff00ff] text-[#ff00ff] rounded text-[9px]">CLEAR</button>
      </div>
    </div>
  );
}
