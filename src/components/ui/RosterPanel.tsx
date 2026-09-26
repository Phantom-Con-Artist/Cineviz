import React, { useEffect, useMemo, useState } from 'react';
import { EngineBridge } from '../../engine/EngineBridge';
import { ARCHETYPES, ARCHETYPE_IDS, ArchetypeId, SuperId, TechId, UltraId } from '../../engine/simulation/combat/Archetypes';
import { SUPER_AFFINITY, ULTRA_AFFINITY } from '../../engine/simulation/combat/powers/Loadout';
import { TECHNIQUES } from '../../engine/simulation/combat/Techniques';
import { setOfForm, WEAPON_SETS, WeaponSet } from '../../engine/simulation/combat/weapons/Arsenal';
import { CharacterBio, ELEMENT_COLOR, ELEMENT_NAME, ROSTER, rumour, weaponLore } from '../../content/roster';

interface RosterPanelProps {
  bridge: EngineBridge | null;
  seed: number;
  onClose: () => void;
  /** Phone layout: the cast as a strip of chips over one scrolling page */
  compact?: boolean;
}

/** Who is in the arena this show: style, weapon set and the powers they rolled */
interface InArena {
  side: 'A' | 'B';
  set: WeaponSet;
  supers: TechId[];
  ultras: TechId[];
}

const STAT_LABEL: [keyof CharacterBio['stats'], string][] = [
  ['power', 'POWER'], ['speed', 'SPEED'], ['technique', 'TECHNIQUE'], ['range', 'RANGE'], ['flair', 'FLAIR'],
];

const techName = (id: TechId) => TECHNIQUES[id]?.name ?? id;

/** The cast: every fighter, their weapons, their powers, and a (made-up) history */
export const RosterPanel: React.FC<RosterPanelProps> = ({ bridge, seed, onClose, compact }) => {
  const [arena, setArena] = useState<Partial<Record<ArchetypeId, InArena>>>({});
  const [sel, setSel] = useState<ArchetypeId | null>(null);
  const [roll, setRoll] = useState(0);

  // Who is fighting right now (the loadout is rolled per show, so poll it)
  useEffect(() => {
    if (!bridge) return;
    const read = () => {
      const next: Partial<Record<ArchetypeId, InArena>> = {};
      bridge.combat.fighters.forEach((f, i) => {
        next[f.arch.id] = { side: i === 0 ? 'A' : 'B', set: f.weaponSet, supers: [...f.supers], ultras: [...f.ultras] };
      });
      setArena((old) => (JSON.stringify(Object.keys(old).map((k) => [k, old[k as ArchetypeId]!.set.id])) === JSON.stringify(Object.keys(next).map((k) => [k, next[k as ArchetypeId]!.set.id])) ? old : next));
    };
    read();
    const id = setInterval(read, 800);
    return () => clearInterval(id);
  }, [bridge]);

  const first = (Object.keys(arena) as ArchetypeId[]).find((k) => arena[k]!.side === 'A') ?? 'saiyan';
  const id = sel ?? first;
  const bio = ROSTER[id];
  const arch = ARCHETYPES[id];
  const here = arena[id];
  const color = ELEMENT_COLOR[arch.element];

  const weapons = useMemo(() => {
    const sig = arch.weapon ? setOfForm(arch.weapon) : undefined;
    const rest = WEAPON_SETS.filter((s) => s.affinity.includes(id) && s !== sig);
    return { sig, rest };
  }, [arch, id]);

  const universalSupers = (Object.keys(SUPER_AFFINITY) as SuperId[]).filter((k) => SUPER_AFFINITY[k].includes(id));
  const universalUltras = (Object.keys(ULTRA_AFFINITY) as UltraId[]).filter((k) => ULTRA_AFFINITY[k].includes(id));

  // Esc closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const list = (
    <div className={compact ? 'flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1' : 'flex flex-col gap-1 w-56 shrink-0 overflow-y-auto pr-1'}>
      {ARCHETYPE_IDS.map((k) => {
        const b = ROSTER[k];
        const on = k === id;
        const a = arena[k];
        const c = ELEMENT_COLOR[ARCHETYPES[k].element];
        return (
          <button
            key={k}
            onClick={() => { setSel(k); setRoll(0); }}
            className={`group relative text-left rounded-sm border transition-colors ${compact ? 'shrink-0 px-2.5 py-1.5' : 'px-3 py-2'} ${on ? 'border-white/25 bg-white/[0.06]' : 'border-white/[0.05] hover:border-white/15 hover:bg-white/[0.03]'}`}
          >
            <span className="absolute left-0 top-1 bottom-1 w-[2px] rounded-full" style={{ background: c, opacity: on ? 1 : 0.35 }} />
            <div className="flex items-center gap-2">
              <span className={`text-[11px] tracking-[0.12em] ${on ? 'text-white' : 'text-slate-300'} whitespace-nowrap`}>{b.name}</span>
              {a && <span className="ml-auto text-[8px] tracking-[0.2em] px-1 rounded-sm bg-rose-500/80 text-white whitespace-nowrap">{a.side}</span>}
            </div>
            {!compact && <div className="text-[9px] tracking-[0.2em] text-slate-500 truncate">{k.toUpperCase()} · {ELEMENT_NAME[ARCHETYPES[k].element]}</div>}
          </button>
        );
      })}
    </div>
  );

  const page = (
    <div className="flex-1 min-w-0 overflow-y-auto pr-1">
      {/* Header */}
      <div className="relative overflow-hidden rounded-sm border border-white/[0.06] px-5 py-4" style={{ background: `linear-gradient(115deg, ${color}26, transparent 55%), #0b0c11` }}>
        <div className="absolute -right-6 -top-10 text-[120px] leading-none font-black opacity-[0.06] select-none pointer-events-none" style={{ color }}>{id.toUpperCase()}</div>
        <div className="flex items-center gap-2 text-[9px] tracking-[0.3em]">
          <span className="px-1.5 py-0.5 rounded-sm" style={{ background: `${color}33`, color }}>{ELEMENT_NAME[arch.element]}</span>
          <span className="text-slate-500">{id.toUpperCase()} STYLE</span>
          {here && <span className="px-1.5 py-0.5 rounded-sm bg-rose-500/80 text-white">IN THE ARENA · FIGHTER {here.side}</span>}
        </div>
        <h2 className="mt-2 text-2xl tracking-[0.08em] text-white">{bio.name}</h2>
        <div className="text-[11px] tracking-[0.25em]" style={{ color }}>{bio.title.toUpperCase()}</div>
        <p className="mt-2 text-[12px] text-slate-300 italic max-w-[60ch]">{bio.tagline}</p>
      </div>

      <div className={`mt-3 grid gap-3 ${compact ? 'grid-cols-1' : 'grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]'}`}>
        {/* Story */}
        <Section title="WHO THEY ARE">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
            <Row k="ORIGIN" v={bio.origin} />
            <Row k="AGE" v={bio.age} />
            <Row k="HEIGHT" v={bio.height} />
            <Row k="STYLE" v={bio.style} />
            <Row k="RIVAL" v={`${ROSTER[bio.rival].name}, ${ROSTER[bio.rival].title}`} onClick={() => { setSel(bio.rival); setRoll(0); }} />
          </dl>
          <div className="mt-3 space-y-2 text-[12px] leading-relaxed text-slate-300">
            {bio.lore.map((p, i) => <p key={i}>{p}</p>)}
          </div>
          <blockquote className="mt-3 pl-3 border-l-2 text-[12px] text-slate-100 italic" style={{ borderColor: color }}>“{bio.quote}”</blockquote>
        </Section>

        <div className="flex flex-col gap-3 min-w-0">
          <Section title="STATS">
            <div className="space-y-1.5">
              {STAT_LABEL.map(([k, l]) => (
                <div key={k} className="flex items-center gap-2 text-[9px] tracking-[0.2em] text-slate-500">
                  <span className="w-20 shrink-0">{l}</span>
                  <div className="flex-1 flex gap-[2px]">
                    {Array.from({ length: 10 }, (_, i) => (
                      <span key={i} className="h-1.5 flex-1 rounded-[1px]" style={{ background: i < bio.stats[k] ? color : 'rgba(255,255,255,0.06)', opacity: i < bio.stats[k] ? 0.55 + i * 0.045 : 1 }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>
          <Section title="LIKES / DISLIKES">
            <div className="grid grid-cols-2 gap-3 text-[11px]">
              <ul className="space-y-0.5 text-slate-300">{bio.likes.map((l) => <li key={l}><span className="text-emerald-400/80">+ </span>{l}</li>)}</ul>
              <ul className="space-y-0.5 text-slate-400">{bio.dislikes.map((l) => <li key={l}><span className="text-rose-400/80">− </span>{l}</li>)}</ul>
            </div>
          </Section>
          <Section title="UNCONFIRMED RUMOUR" action={<button onClick={() => setRoll((r) => r + 1)} className="text-slate-500 hover:text-white" title="Another rumour">↻</button>}>
            <p className="text-[12px] text-slate-200 leading-relaxed">{rumour(bio, seed, roll)}</p>
          </Section>
        </div>
      </div>

      {/* This show's loadout */}
      {here && (
        <Section title={`THIS FIGHT · SEED ${seed}`} className="mt-3" accent={color}>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[14px] text-white tracking-[0.08em]">{here.set.name}</span>
            <span className="text-[9px] tracking-[0.2em] text-slate-500">{here.set.archetypes.join(' · ')}</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400 italic">{weaponLore(here.set, seed)}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {here.supers.map((t) => <Chip key={t} label={techName(t)} kind="SUPER" color={color} />)}
            {here.ultras.map((t) => <Chip key={t} label={techName(t)} kind="ULTRA" color={color} strong />)}
          </div>
        </Section>
      )}

      {/* Arsenal */}
      <Section title="ARSENAL" className="mt-3">
        <div className={`grid gap-2 ${compact ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {weapons.sig ? <WeaponCard set={weapons.sig} seed={seed} signature color={color} current={here?.set === weapons.sig} /> : (
            <div className="rounded-sm border border-white/[0.06] px-3 py-2">
              <div className="text-[12px] text-white">Bare hands</div>
              <div className="text-[9px] tracking-[0.2em] text-slate-500">SIGNATURE · FISTS, FEET, KI</div>
              <p className="mt-1 text-[11px] text-slate-400 italic">Needs no forge. Has broken several.</p>
            </div>
          )}
          {weapons.rest.map((s) => <WeaponCard key={s.id} set={s} seed={seed} color={color} current={here?.set === s} />)}
        </div>
      </Section>

      {/* Powers */}
      <Section title="POWERS" className="mt-3 mb-2">
        <div className="text-[9px] tracking-[0.25em] text-slate-500 mb-1">SIGNATURE</div>
        <div className="flex flex-wrap gap-1.5">
          {arch.supers.map((t) => <Chip key={t} label={techName(t)} kind="SUPER" color={color} />)}
          <Chip label={techName(arch.ultra)} kind="ULTRA" color={color} strong />
        </div>
        <div className="text-[9px] tracking-[0.25em] text-slate-500 mt-3 mb-1">CAN LEARN</div>
        <div className="flex flex-wrap gap-1.5">
          {universalSupers.map((t) => <Chip key={t} label={techName(t)} kind="SUPER" color={color} dim />)}
          {universalUltras.map((t) => <Chip key={t} label={techName(t)} kind="ULTRA" color={color} strong dim />)}
        </div>
      </Section>
    </div>
  );

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col bg-[#06070a]/90 backdrop-blur-md font-mono text-slate-200"
      style={compact ? { paddingTop: 'max(10px, env(safe-area-inset-top))', paddingLeft: 'max(12px, env(safe-area-inset-left))', paddingRight: 12 } : undefined}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className={`flex items-center gap-3 ${compact ? 'pb-2' : 'px-5 pt-4 pb-3'} text-[10px] tracking-[0.3em] text-slate-400`}>
        <span className="text-slate-100">THE CAST</span>
        <span className="text-slate-600 hidden sm:inline">EIGHT STYLES · {WEAPON_SETS.length} WEAPON SETS</span>
        <button onClick={onClose} className="ml-auto w-9 h-9 -mr-2 text-slate-400 hover:text-white" aria-label="Close" title="Close (Esc)">✕</button>
      </div>
      <div className={`flex-1 min-h-0 ${compact ? 'flex flex-col' : 'flex gap-4 px-5 pb-5'}`}>
        {list}
        {page}
      </div>
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode; className?: string; action?: React.ReactNode; accent?: string }> = ({ title, children, className = '', action, accent }) => (
  <section className={`rounded-sm border border-white/[0.06] bg-white/[0.015] px-4 py-3 ${className}`} style={accent ? { borderColor: `${accent}55` } : undefined}>
    <div className="flex items-center mb-2 text-[9px] tracking-[0.3em] text-slate-500">
      <span>{title}</span>
      {action && <span className="ml-auto">{action}</span>}
    </div>
    {children}
  </section>
);

const Row: React.FC<{ k: string; v: string; onClick?: () => void }> = ({ k, v, onClick }) => (
  <>
    <dt className="text-[9px] tracking-[0.2em] text-slate-500 pt-[2px]">{k}</dt>
    <dd className={`text-slate-300 ${onClick ? 'underline decoration-dotted underline-offset-2 cursor-pointer hover:text-white' : ''}`} onClick={onClick}>{v}</dd>
  </>
);

const Chip: React.FC<{ label: string; kind: 'SUPER' | 'ULTRA'; color: string; strong?: boolean; dim?: boolean }> = ({ label, kind, color, strong, dim }) => (
  <span
    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-sm text-[10px] tracking-[0.08em] border"
    style={{
      borderColor: strong ? `${color}aa` : 'rgba(255,255,255,0.08)',
      background: strong ? `${color}22` : 'rgba(255,255,255,0.03)',
      opacity: dim ? 0.7 : 1,
    }}
  >
    <span className="text-[8px] tracking-[0.2em]" style={{ color: strong ? color : '#64748b' }}>{kind}</span>
    <span className={strong ? 'text-white' : 'text-slate-200'}>{label}</span>
  </span>
);

const Bar: React.FC<{ label: string; v: number; color: string }> = ({ label, v, color }) => (
  <div className="flex items-center gap-1.5 text-[8px] tracking-[0.2em] text-slate-500">
    <span className="w-9">{label}</span>
    <div className="w-14 h-1 rounded-full bg-white/[0.06] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.round(Math.min(1, v) * 100)}%`, background: color }} /></div>
  </div>
);

const WeaponCard: React.FC<{ set: WeaponSet; seed: number; color: string; signature?: boolean; current?: boolean }> = ({ set, seed, color, signature, current }) => (
  <div className="rounded-sm border px-3 py-2" style={{ borderColor: current ? `${color}99` : 'rgba(255,255,255,0.06)', background: current ? `${color}12` : undefined }}>
    <div className="flex items-baseline gap-2">
      <span className="text-[12px] text-white">{set.name}</span>
      <span className="text-[8px] tracking-[0.2em] text-slate-600">#{set.index}</span>
      {signature && <span className="ml-auto text-[8px] tracking-[0.2em]" style={{ color }}>SIGNATURE</span>}
      {current && <span className={`${signature ? '' : 'ml-auto '}text-[8px] tracking-[0.2em] px-1 rounded-sm bg-rose-500/80 text-white`}>EQUIPPED</span>}
    </div>
    <div className="text-[9px] tracking-[0.2em] text-slate-500">{set.archetypes.join(' · ')}</div>
    <div className="mt-1 flex gap-3">
      <Bar label="WEIGHT" v={set.mass / 2.6} color={color} />
      <Bar label="SPEED" v={set.speed / 1.5} color={color} />
    </div>
    <p className="mt-1 text-[11px] text-slate-400 italic leading-snug">{weaponLore(set, seed)}</p>
    <div className="mt-1 text-[9px] tracking-[0.12em] text-slate-500">
      UNLOCKS <span className="text-slate-300">{techName(set.super)}</span> · <span className="text-slate-300">{techName(set.ultra)}</span>
    </div>
  </div>
);
