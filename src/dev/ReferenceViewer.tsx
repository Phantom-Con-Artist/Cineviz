import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BVHLoader } from 'three/examples/jsm/loaders/BVHLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CombatEngine, Fighter } from '../engine/simulation/combat/CombatEngine';
import { MOVES, MoveName } from '../engine/simulation/combat/Moves';
import { ARCHETYPE_IDS, ArchetypeId } from '../engine/simulation/combat/Archetypes';
import { BONES, J } from '../engine/simulation/combat/Skeleton';
import { REGION, Region, regionOfBone } from '../engine/simulation/figure/ReferenceMesh';

/**
 * Developer tool (open the app with ?reference): study real motion capture next to the
 * procedural fighter. Load a CMU clip (or your own BVH / FBX / GLB), play, scrub, slow it
 * down; see the skeleton, joint axes, centre of mass and limb velocities; run any move of
 * the procedural system beside it and compare how the striking limb extends over time.
 */

const CMU = 'https://raw.githubusercontent.com/una-dinosauria/cmu-mocap/master/data';
const CLIPS: [string, string][] = [
  ['144_20', 'punch sequence'], ['144_13', 'left punch sequence'], ['14_01', 'boxing'], ['13_17', 'boxing'], ['17_10', 'boxing'],
  ['135_09', 'karate oi-zuki'], ['135_04', 'karate mae-geri'], ['135_07', 'karate mawashi-geri'], ['135_11', 'karate yoko-geri'],
  ['144_05', 'front kicks'], ['86_06', 'kicks, punches, knees'], ['144_07', 'left blocks'], ['144_26', 'right blocks'],
];
/** Dempster segment masses per region (fractions of body mass) */
const REGION_MASS: Record<number, number> = {
  [REGION.HEAD]: 0.081, [REGION.NECK]: 0.02, [REGION.CHEST]: 0.335, [REGION.PELVIS]: 0.142,
  [REGION.UPPER_ARM_L]: 0.028, [REGION.FOREARM_L]: 0.016, [REGION.HAND_L]: 0.006,
  [REGION.UPPER_ARM_R]: 0.028, [REGION.FOREARM_R]: 0.016, [REGION.HAND_R]: 0.006,
  [REGION.THIGH_L]: 0.1, [REGION.CALF_L]: 0.0465, [REGION.FOOT_L]: 0.0145,
  [REGION.THIGH_R]: 0.1, [REGION.CALF_R]: 0.0465, [REGION.FOOT_R]: 0.0145,
};
type Limb = 'lHand' | 'rHand' | 'lFoot' | 'rFoot';
const LIMB_REGION: Record<Limb, [Region, Region]> = {
  lHand: [REGION.HAND_L, REGION.UPPER_ARM_L], rHand: [REGION.HAND_R, REGION.UPPER_ARM_R],
  lFoot: [REGION.FOOT_L, REGION.THIGH_L], rFoot: [REGION.FOOT_R, REGION.THIGH_R],
};
const STRIKES = (Object.keys(MOVES) as MoveName[]).filter((n) => MOVES[n].limb !== undefined).sort();

interface RefRig {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  action: THREE.AnimationAction;
  duration: number;
  bones: THREE.Bone[];
  region: (Region | null)[];
  /** First bone of each region's chain (joint anchors) */
  anchor: Map<Region, THREE.Bone>;
  helper: THREE.SkeletonHelper;
  axes: THREE.AxesHelper[];
}

export const ReferenceViewer: React.FC = () => {
  const mount = useRef<HTMLDivElement>(null);
  const graph = useRef<HTMLCanvasElement>(null);
  const [clipId, setClipId] = useState('144_20');
  const [status, setStatus] = useState('');
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(0.5);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showAxes, setShowAxes] = useState(false);
  const [limb, setLimb] = useState<Limb>('rHand');
  const [arch, setArch] = useState<ArchetypeId>('saiyan');
  const [move, setMove] = useState<MoveName>('cross');
  const [bpm, setBpm] = useState(110);
  const S = useRef({ playing, speed, showAxes, limb, arch, move, bpm, seek: -1 });
  S.current = { ...S.current, playing, speed, showAxes, limb, arch, move, bpm };
  const api = useRef<{ load: (src: string | File) => void } | null>(null);

  useEffect(() => {
    const el = mount.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#07080b');
    const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100);
    camera.position.set(0.4, 1.4, 5.2);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1, 0);
    const grid = new THREE.GridHelper(10, 20, 0x334155, 0x1e293b);
    scene.add(grid);

    // ---------------------------------------------------------------- reference rig
    let rig: RefRig | null = null;
    const refGroup = new THREE.Group();
    refGroup.position.x = -1;
    scene.add(refGroup);
    const comDot = new THREE.Mesh(new THREE.SphereGeometry(0.035), new THREE.MeshBasicMaterial({ color: 0xfbbf24 }));
    scene.add(comDot);
    const TRAIL = 180;
    const trailGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3));
    const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.5 }));
    scene.add(trail);
    let trailN = 0;
    const vecGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
    const vecs = new THREE.LineSegments(vecGeo, new THREE.LineBasicMaterial({ color: 0x22d3ee }));
    scene.add(vecs);
    const prevTips = new Map<Region, THREE.Vector3>();

    const setup = (root: THREE.Object3D, clip: THREE.AnimationClip) => {
      if (rig) {
        refGroup.remove(rig.root);
        scene.remove(rig.helper);
        rig.mixer.stopAllAction();
      }
      const holder = new THREE.Group();
      holder.add(root);
      refGroup.add(holder);
      const mixer = new THREE.AnimationMixer(holder);
      const action = mixer.clipAction(clip);
      action.play();
      mixer.update(0);
      holder.updateMatrixWorld(true);
      // Normalise to a 1.8 m performer standing on the floor
      const bones: THREE.Bone[] = [];
      holder.traverse((o) => (o as THREE.Bone).isBone && bones.push(o as THREE.Bone));
      const box = new THREE.Box3();
      const v = new THREE.Vector3();
      for (const b of bones) box.expandByPoint(b.getWorldPosition(v));
      const h = Math.max(1e-6, box.max.y - box.min.y);
      holder.scale.setScalar(1.7 / h);
      holder.updateMatrixWorld(true);
      box.makeEmpty();
      for (const b of bones) box.expandByPoint(b.getWorldPosition(v));
      holder.position.y -= box.min.y - 0.02;
      holder.position.x -= (box.min.x + box.max.x) / 2 - refGroup.position.x;
      holder.position.z -= (box.min.z + box.max.z) / 2;
      const region = bones.map((b) => {
        for (let o: THREE.Object3D | null = b; o && o !== holder; o = o.parent) {
          const r = regionOfBone(o.name);
          if (r !== null) return r;
        }
        return null;
      });
      const anchor = new Map<Region, THREE.Bone>();
      bones.forEach((b, i) => {
        const r = region[i];
        if (r === null || r === undefined || anchor.has(r)) return;
        anchor.set(r, b);
      });
      const helper = new THREE.SkeletonHelper(holder);
      scene.add(helper);
      const axes = bones.map((b) => {
        const a = new THREE.AxesHelper(0.08 * h / 1.7);
        b.add(a);
        return a;
      });
      rig = { root: holder, mixer, action, duration: clip.duration, bones, region, anchor, helper, axes };
      trailN = 0;
      prevTips.clear();
      setDuration(clip.duration);
    };

    const load = async (src: string | File) => {
      try {
        setStatus('loading…');
        const name = typeof src === 'string' ? src : src.name;
        const buf = typeof src === 'string' ? await (await fetch(src)).arrayBuffer() : await src.arrayBuffer();
        if (/\.bvh$/i.test(name)) {
          const r = new BVHLoader().parse(new TextDecoder().decode(buf));
          setup(r.skeleton.bones[0]!, r.clip);
        } else if (/\.fbx$/i.test(name)) {
          const o = new FBXLoader().parse(buf, '');
          o.traverse((c) => ((c as THREE.Mesh).isMesh ? (c.visible = false) : undefined));
          if (!o.animations.length) throw new Error('no animation in file');
          setup(o, o.animations[0]!);
        } else {
          const g = await new GLTFLoader().parseAsync(buf, '');
          g.scene.traverse((c) => ((c as THREE.Mesh).isMesh ? (c.visible = false) : undefined));
          if (!g.animations.length) throw new Error('no animation in file');
          setup(g.scene, g.animations[0]!);
        }
        setStatus(name.split('/').pop() ?? name);
      } catch (e) {
        setStatus(`failed: ${(e as Error).message}`);
      }
    };
    api.current = { load: (s) => void load(s) };

    // ---------------------------------------------------------------- procedural fighter
    let eng: CombatEngine | null = null;
    let key = '';
    let loopStart = 0;
    const procGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(BONES.length * 6), 3));
    const proc = new THREE.LineSegments(procGeo, new THREE.LineBasicMaterial({ color: 0xfb7185 }));
    scene.add(proc);
    const setupProc = () => {
      const s = S.current;
      eng = new CombatEngine();
      eng.forceArch = [s.arch, s.arch === 'saiyan' ? 'reaper' : 'saiyan'];
      eng.init(7);
      for (const f of eng.fighters) {
        f.present = true;
        f.setStance('guard');
      }
      const st = eng.stage;
      st.ang = st.tang = 0;
      st.sep = st.tsep = 2.2;
      st.cx = st.tcx = 1;
      (eng as unknown as { placeStage(): void }).placeStage();
      for (const f of eng.fighters) {
        f.x = f.tx;
        f.z = f.tz;
      }
      (eng as unknown as { music: unknown }).music = { bpm: s.bpm };
      loopStart = eng.beat + 0.5;
      eng.fighters[0].play(MOVES[s.move], loopStart, 1);
      key = `${s.arch}|${s.move}|${s.bpm}`;
    };
    const stepProc = (dt: number) => {
      const s = S.current;
      if (!eng || key !== `${s.arch}|${s.move}|${s.bpm}`) setupProc();
      const e = eng!;
      if (dt <= 1e-5) return NaN; // the engine never steps with dt = 0 (velocities divide by it)
      e.beat += (dt * s.bpm) / 60;
      const [a, b] = e.fighters as [Fighter, Fighter];
      const upd = (e as unknown as { updateActor(x: Fighter, y: Fighter, d: number): void }).updateActor.bind(e);
      upd(a, b, dt);
      // Opponent stays put and invisible; the move loops with a beat of rest
      if (e.beat > loopStart + 3) {
        loopStart = e.beat + 0.5;
        a.play(MOVES[s.move], loopStart, 1);
      }
      const p = procGeo.getAttribute('position') as THREE.BufferAttribute;
      BONES.forEach(([f, t], i) => {
        p.setXYZ(i * 2, a.joints[f * 3]!, a.joints[f * 3 + 1]!, a.joints[f * 3 + 2]!);
        p.setXYZ(i * 2 + 1, a.joints[t * 3]!, a.joints[t * 3 + 1]!, a.joints[t * 3 + 2]!);
      });
      p.needsUpdate = true;
      const lm = MOVES[s.move].limb ?? J.rHand;
      const tip = lm, root = lm === J.lHand || lm === J.lEl ? J.lSh : lm === J.rHand || lm === J.rEl ? J.rSh : lm === J.lFoot || lm === J.lKn ? J.lHip : J.rHip;
      const d = Math.hypot(a.joints[tip * 3]! - a.joints[root * 3]!, a.joints[tip * 3 + 1]! - a.joints[root * 3 + 1]!, a.joints[tip * 3 + 2]! - a.joints[root * 3 + 2]!);
      const reach = root === J.lSh || root === J.rSh ? a.dims.upper + a.dims.fore : a.dims.thigh + a.dims.shin;
      return d / reach;
    };

    // ---------------------------------------------------------------- graph: limb extension over time
    const HIST = 360;
    const refHist = new Float32Array(HIST).fill(NaN);
    const procHist = new Float32Array(HIST).fill(NaN);
    let histI = 0;
    const drawGraph = () => {
      const c = graph.current;
      if (!c) return;
      const g = c.getContext('2d')!;
      const W = (c.width = c.clientWidth * devicePixelRatio), H = (c.height = c.clientHeight * devicePixelRatio);
      g.clearRect(0, 0, W, H);
      g.strokeStyle = 'rgba(148,163,184,0.15)';
      for (const y of [0.25, 0.5, 0.75]) {
        g.beginPath();
        g.moveTo(0, H * y);
        g.lineTo(W, H * y);
        g.stroke();
      }
      const line = (arr: Float32Array, col: string) => {
        g.strokeStyle = col;
        g.lineWidth = 1.5 * devicePixelRatio;
        g.beginPath();
        let first = true;
        for (let k = 0; k < HIST; k++) {
          const v = arr[(histI + k) % HIST]!;
          if (Number.isNaN(v)) continue;
          const x = (k / (HIST - 1)) * W, y = H - Math.max(0, Math.min(1.1, (v - 0.2) / 0.9)) * H * 0.9 - 2;
          if (first) g.moveTo(x, y);
          else g.lineTo(x, y);
          first = false;
        }
        g.stroke();
      };
      line(refHist, '#fbbf24');
      line(procHist, '#fb7185');
    };

    // ---------------------------------------------------------------- loop
    const clock = new THREE.Clock();
    const v = new THREE.Vector3();
    let raf = 0;
    let uiTick = 0;
    const loop = () => {
      const dt = Math.min(0.05, clock.getDelta());
      const s = S.current;
      if (rig) {
        if (s.seek >= 0) {
          rig.action.time = s.seek;
          rig.mixer.update(0);
          s.seek = -1;
        } else if (s.playing) rig.mixer.update(dt * s.speed);
        rig.root.updateMatrixWorld(true);
        for (const a of rig.axes) a.visible = s.showAxes;
        // Centre of mass: region masses at the mean of their bones
        const acc = new Map<Region, [THREE.Vector3, number]>();
        rig.bones.forEach((b, i) => {
          const r = rig!.region[i];
          if (r === null || r === undefined) return;
          const e = acc.get(r) ?? [new THREE.Vector3(), 0];
          e[0].add(b.getWorldPosition(v));
          e[1]++;
          acc.set(r, e);
        });
        const com = new THREE.Vector3();
        let m = 0;
        for (const [r, [sum, n]] of acc) {
          const w = REGION_MASS[r] ?? 0;
          com.addScaledVector(sum.divideScalar(n), w);
          m += w;
        }
        com.divideScalar(Math.max(1e-6, m));
        comDot.position.copy(com);
        const tp = trailGeo.getAttribute('position') as THREE.BufferAttribute;
        if (s.playing || trailN === 0) {
          (tp.array as Float32Array).copyWithin(3, 0, (TRAIL - 1) * 3);
          tp.setXYZ(0, com.x, 0.01, com.z);
          trailN = Math.min(TRAIL, trailN + 1);
          tp.needsUpdate = true;
          trailGeo.setDrawRange(0, trailN);
        }
        // Velocity vectors of hands and feet (0.1 s ahead)
        const vp = vecGeo.getAttribute('position') as THREE.BufferAttribute;
        [REGION.HAND_L, REGION.HAND_R, REGION.FOOT_L, REGION.FOOT_R].forEach((r, i) => {
          const b = rig!.anchor.get(r);
          if (!b) return;
          const p = b.getWorldPosition(new THREE.Vector3());
          const prev = prevTips.get(r) ?? p.clone();
          const vel = p.clone().sub(prev).divideScalar(Math.max(1e-4, dt * s.speed));
          prevTips.set(r, p);
          vp.setXYZ(i * 2, p.x, p.y, p.z);
          vp.setXYZ(i * 2 + 1, p.x + vel.x * 0.1, p.y + vel.y * 0.1, p.z + vel.z * 0.1);
        });
        vp.needsUpdate = true;
        // Extension of the chosen limb
        const [tipR, rootR] = LIMB_REGION[s.limb];
        const tb = rig.anchor.get(tipR), rb = rig.anchor.get(rootR);
        if (tb && rb) {
          const d = tb.getWorldPosition(new THREE.Vector3()).distanceTo(rb.getWorldPosition(v));
          const reach = tipR === REGION.HAND_L || tipR === REGION.HAND_R ? 0.6 : 0.9;
          if (s.playing) refHist[histI] = d / reach;
        }
      }
      const pe = stepProc(dt * (s.playing ? s.speed : 0));
      if (s.playing) {
        procHist[histI] = pe;
        histI = (histI + 1) % HIST;
      }
      controls.update();
      renderer.render(scene, camera);
      if (uiTick++ % 6 === 0) {
        drawGraph();
        if (rig) setTime(rig.action.time % rig.duration);
      }
      raf = requestAnimationFrame(loop);
    };
    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    loop();
    void load(`${CMU}/144/144_20.bvh`);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, []);

  const pickClip = (id: string) => {
    setClipId(id);
    api.current?.load(`${CMU}/${id.split('_')[0]!.padStart(3, '0')}/${id}.bvh`);
  };

  return (
    <div className="flex h-screen w-screen bg-[#050608] text-slate-300 font-mono text-[11px]">
      <div className="relative flex-1 min-w-0 flex flex-col">
        <div ref={mount} className="flex-1 min-h-0" />
        <div className="absolute top-3 left-4 space-y-1 pointer-events-none">
          <div className="tracking-[0.3em] text-slate-100">MOTION REFERENCE</div>
          <div className="text-slate-500">{status}</div>
          <div><span className="text-amber-300">■</span> mocap (CMU) · <span className="text-rose-400">■</span> procedural · <span className="text-amber-300">●</span> centre of mass · <span className="text-cyan-300">—</span> hand / foot velocity</div>
        </div>
        <canvas ref={graph} className="h-28 w-full border-t border-white/10" title="Limb extension over time: amber mocap, rose procedural" />
        <div className="flex items-center gap-3 px-4 h-11 border-t border-white/10">
          <button onClick={() => setPlaying((p) => !p)} className="w-16 text-left text-white">{playing ? '❚❚ PAUSE' : '▶ PLAY'}</button>
          <input
            type="range" min={0} max={duration || 1} step={1 / 120} value={time}
            onChange={(e) => { setPlaying(false); S.current.seek = Number(e.target.value); setTime(Number(e.target.value)); }}
            className="flex-1 slim"
          />
          <span className="tabular-nums w-24 text-right">{time.toFixed(2)} / {duration.toFixed(1)} s</span>
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="bg-black border border-white/10">
            {[0.1, 0.25, 0.5, 1, 2].map((s) => <option key={s} value={s}>{s}×</option>)}
          </select>
        </div>
      </div>
      <div className="w-64 shrink-0 border-l border-white/10 p-4 space-y-4 overflow-y-auto">
        <Field label="REFERENCE CLIP (CMU)">
          <select value={clipId} onChange={(e) => pickClip(e.target.value)} className="w-full bg-black border border-white/10">
            {CLIPS.map(([id, d]) => <option key={id} value={id}>{id} · {d}</option>)}
          </select>
          <label className="block mt-2 text-slate-500 cursor-pointer hover:text-white">
            or load BVH / FBX / GLB…
            <input type="file" accept=".bvh,.fbx,.glb,.gltf" className="hidden" onChange={(e) => e.target.files?.[0] && api.current?.load(e.target.files[0])} />
          </label>
        </Field>
        <Field label="GRAPH LIMB">
          <select value={limb} onChange={(e) => setLimb(e.target.value as Limb)} className="w-full bg-black border border-white/10">
            <option value="rHand">right hand</option><option value="lHand">left hand</option>
            <option value="rFoot">right foot</option><option value="lFoot">left foot</option>
          </select>
        </Field>
        <Field label="SHOW">
          <label className="flex gap-2"><input type="checkbox" checked={showAxes} onChange={(e) => setShowAxes(e.target.checked)} /> joint axes</label>
        </Field>
        <Field label="PROCEDURAL FIGHTER">
          <select value={arch} onChange={(e) => setArch(e.target.value as ArchetypeId)} className="w-full bg-black border border-white/10 mb-2">
            {ARCHETYPE_IDS.map((a) => <option key={a}>{a}</option>)}
          </select>
          <select value={move} onChange={(e) => setMove(e.target.value as MoveName)} className="w-full bg-black border border-white/10 mb-2">
            {STRIKES.map((m) => <option key={m}>{m}</option>)}
          </select>
          <label className="block">tempo {bpm} bpm
            <input type="range" min={70} max={170} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} className="w-full slim" />
          </label>
        </Field>
        <p className="text-slate-600 leading-relaxed">
          The procedural strike loops with its impact on a beat. Slow the reference down and compare the extension curves: the mocap hand barely moves for the first third of a punch, then accelerates late — the generator follows the same prior (docs/motion-reference.md).
        </p>
        <a href="./" className="block text-slate-500 hover:text-white">← back to the app</a>
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <div className="text-[9px] tracking-[0.25em] text-slate-500 mb-1.5">{label}</div>
    {children}
  </div>
);

export default ReferenceViewer;
