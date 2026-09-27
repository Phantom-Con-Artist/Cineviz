import React, { useEffect } from 'react';
import { CinevizMark } from './CinevizMark';

export const APP_VERSION = '1.0';

interface AboutPanelProps {
  onClose: () => void;
  compact?: boolean;
}

const TIPS: [string, string][] = [
  ['Pick a song', 'Load your own track or one of the samples, then press play. The fight starts when the music does.'],
  ['Go to WATCH mode', 'No buttons, no panels, just the fight. On a computer it goes full screen too. Press W or Esc to come back.'],
  ['Fly the camera', 'FREE CAM hands you the lens. Drag to spin round the fight, right-drag to pan, scroll to zoom. On a phone, one finger turns and two fingers pan and zoom.'],
  ['Every play is a new fight', 'New fighters, new weapons and a new kind of battle each time. Tap the seed button if you want a fresh pair right away.'],
  ['Meet the cast', 'Open CAST to read about the eight fighters. Their life stories are completely made up and they are very proud of them.'],
  ['Tune the show', 'The sliders along the bottom change the mood: more chaos, more drama, more slow motion, bigger auras.'],
];

/** Who made this and why */
export const AboutPanel: React.FC<AboutPanelProps> = ({ onClose, compact }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="absolute inset-0 z-50 overflow-y-auto bg-[#06070a]/92 backdrop-blur-md font-mono text-slate-200"
      style={compact ? { paddingTop: 'max(10px, env(safe-area-inset-top))', paddingLeft: 'max(12px, env(safe-area-inset-left))' } : undefined}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button onClick={onClose} className="absolute right-3 top-2 w-9 h-9 text-slate-400 hover:text-white" aria-label="Close" title="Close (Esc)">✕</button>
      <div className={`mx-auto max-w-[720px] ${compact ? 'px-3 py-3' : 'px-6 py-10'}`}>
        <div className="flex items-center gap-4">
          <CinevizMark size={compact ? 44 : 64} />
          <div>
            <div className="text-2xl tracking-[0.35em] text-white">CINEVIZ</div>
            <div className="text-[10px] tracking-[0.3em] text-slate-500">VERSION {APP_VERSION} · ANIME FIGHTS TO YOUR MUSIC</div>
          </div>
        </div>

        <div className="mt-6 space-y-4 text-[13px] leading-relaxed text-slate-300">
          <p className="text-slate-100 text-[15px]">
            Put on a song and two fighters made of light will settle their differences to it.
          </p>
          <p>
            They listen to the same track you do. Kick drums turn into punches, the bass shakes the floor, and when the
            drop finally lands somebody opens the sky and throws a thousand swords at their rival. Nothing is pre-animated.
            The fight, the camera and every spark are worked out from your music while it plays, so no two shows are the same.
          </p>
          <p>
            Why make this? Because the best fight scenes in anime always feel like they were cut to the soundtrack, and I
            kept rewinding them just to catch that moment again. Cineviz is my way of getting that feeling out of any song
            you love. Grab some snacks, turn the volume up and enjoy the show.
          </p>
        </div>

        <div className="mt-7 text-[9px] tracking-[0.3em] text-slate-500">HOW TO ENJOY IT</div>
        <ul className={`mt-2 grid gap-2 ${compact ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {TIPS.map(([t, d]) => (
            <li key={t} className="rounded-sm border border-white/[0.06] bg-white/[0.02] px-3 py-2">
              <div className="text-[12px] text-white">{t}</div>
              <div className="text-[11px] text-slate-400 leading-snug">{d}</div>
            </li>
          ))}
        </ul>

        <div className="mt-8 rounded-sm border border-rose-500/25 bg-gradient-to-r from-rose-500/10 to-cyan-400/5 px-4 py-4">
          <div className="text-[9px] tracking-[0.3em] text-slate-500">MADE BY</div>
          <div className="mt-1 text-lg tracking-[0.12em] text-white">Subhradeep Sarkar</div>
          <p className="mt-1 text-[12px] text-slate-300">
            Built over many late nights with loud music on. If a fight made you grin, that was the whole idea. Thank you for watching.
          </p>
        </div>

        <div className="mt-6 text-[10px] tracking-[0.2em] text-slate-600">
          CINEVIZ v{APP_VERSION} · © {new Date().getFullYear()} SUBHRADEEP SARKAR
        </div>
      </div>
    </div>
  );
};
