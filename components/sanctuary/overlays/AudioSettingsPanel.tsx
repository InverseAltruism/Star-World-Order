'use client';

import { useEffect, useState } from 'react';
import { sanctuaryAudio, type AudioPrefs } from '@/lib/sanctuary/audio';

interface SliderRowProps {
  label: string;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}

function SliderRow({ label, value, disabled, onChange }: SliderRowProps) {
  return (
    <label className="flex items-center gap-3 text-[8px] font-['Press_Start_2P'] text-gray-300">
      <span className="w-14 shrink-0">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(value * 100)}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="flex-1 accent-[#ffd700] disabled:opacity-40"
        aria-label={`${label} volume`}
      />
      <span className="w-8 text-right text-gray-500">
        {Math.round(value * 100)}
      </span>
    </label>
  );
}

export default function AudioSettingsPanel() {
  const [prefs, setPrefs] = useState<AudioPrefs>(() => sanctuaryAudio.getPrefs());

  useEffect(() => sanctuaryAudio.subscribe(setPrefs), []);

  const muted = prefs.muted;

  return (
    <div className="space-y-2 rounded border border-[#ffd700]/20 bg-black/60 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[#00f7ff] font-['Press_Start_2P'] text-[9px]">
          Audio
        </span>
        <button
          type="button"
          onClick={() => sanctuaryAudio.setMuted(!muted)}
          className={`px-2 py-1 text-[8px] font-['Press_Start_2P'] rounded border transition-colors ${
            muted
              ? 'text-gray-400 border-gray-600 hover:text-white'
              : 'text-[#ffd700] border-[#ffd700]/40 bg-[#ffd700]/10 hover:bg-[#ffd700]/20'
          }`}
          aria-pressed={!muted}
          aria-label={muted ? 'Unmute audio' : 'Mute audio'}
        >
          {muted ? 'MUTED' : 'ON'}
        </button>
      </div>
      <SliderRow
        label="MASTER"
        value={prefs.masterVolume}
        disabled={muted}
        onChange={(v) => sanctuaryAudio.setMasterVolume(v)}
      />
      <SliderRow
        label="AMBIENT"
        value={prefs.ambientVolume}
        disabled={muted}
        onChange={(v) => sanctuaryAudio.setAmbientVolume(v)}
      />
      <SliderRow
        label="SFX"
        value={prefs.sfxVolume}
        disabled={muted}
        onChange={(v) => sanctuaryAudio.setSfxVolume(v)}
      />
    </div>
  );
}
