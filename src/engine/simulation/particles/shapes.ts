import { SummonKind } from '../combat/Entities';
import { Gen, genBox, genDisc, genEllipsoid, genLine, genTri, genTube, R, sampleGens, ShapeData, unit, V3 } from './common';

/**
 * Point-cloud blueprints for everything the particles can morph into. All in
 * metres, +x = front / nose, +y = up. Wielded objects hang off the hand at the
 * origin along +y; toppling objects stand on the origin; the rest are centred.
 * Brightness > 1 marks outlines, lights and edges so shapes read instantly.
 */

function noisySphere(c: V3, r: number, amp: number, bright: number, g: number, cracks = 0): Gen {
  const u = [0, 0, 0];
  return {
    w: 4 * Math.PI * r * r,
    g,
    f: (o) => {
      unit(u);
      const n = Math.sin(u[0]! * 7.1 + u[1]! * 3.3) * Math.cos(u[2]! * 5.7 - u[0]! * 2.1) + Math.sin(u[1]! * 11.3 + u[2]! * 4.2) * 0.5;
      const rr = r * (1 + n * amp);
      o[0] = c[0] + u[0]! * rr;
      o[1] = c[1] + u[1]! * rr;
      o[2] = c[2] + u[2]! * rr;
      return cracks && Math.abs(n) < 0.06 ? cracks : bright;
    },
  };
}

function car(): Gen[] {
  const g: Gen[] = [
    genBox([0, 0, 0], [1.25, 0.22, 0.56], 0.7),
    genBox([-0.12, 0.4, 0], [0.52, 0.18, 0.47], 0.8, 0, 2.2),
    genBox([-1.15, 0.36, 0], [0.1, 0.025, 0.52], 1.1),
  ];
  for (const x of [-0.8, 0.8]) {
    for (const z of [-0.52, 0.52]) {
      g.push(genTube([x, -0.2, z - 0.1], [x, -0.2, z + 0.1], 0.28, 0.28, 0.6));
      g.push(genDisc([x, -0.2, z + Math.sign(z) * 0.1], 2, 0.16, 1.6));
    }
  }
  for (const z of [-0.38, 0.38]) {
    g.push({ ...genEllipsoid([1.26, 0.02, z], [0.04, 0.07, 0.09], 3.2), w: 0.25 });
    g.push({ ...genEllipsoid([-1.26, 0.05, z], [0.04, 0.05, 0.1], 2.6), w: 0.2 });
  }
  return g;
}

function plane(): Gen[] {
  const g: Gen[] = [
    genTube([-1.7, 0, 0], [1.3, 0, 0], 0.2, 0.24, 0.7),
    genEllipsoid([1.5, 0, 0], [0.45, 0.22, 0.23], 0.7),
    genEllipsoid([1.05, 0.2, 0], [0.38, 0.11, 0.14], 1.8),
    genTri([-1.25, 0.2, 0], [-1.9, 0.2, 0], [-1.85, 1.0, 0], 0.8, 0, 1.8),
  ];
  for (const s of [-1, 1]) {
    g.push(genTri([0.45, -0.05, s * 0.2], [-0.5, -0.05, s * 0.2], [-0.95, -0.05, s * 2.1], 0.7, 0, 1.8));
    g.push(genTri([0.45, -0.05, s * 0.2], [-0.95, -0.05, s * 2.1], [-0.6, -0.05, s * 2.1], 0.7, 0, 1.8));
    g.push(genTri([-1.35, 0.05, s * 0.15], [-1.85, 0.05, s * 0.15], [-1.9, 0.05, s * 0.85], 0.7, 0, 1.6));
    g.push(genTube([-0.3, -0.25, s * 0.95], [0.5, -0.25, s * 0.95], 0.13, 0.12, 0.8));
    g.push({ ...genEllipsoid([-0.78, -0.05, s * 2.1], [0.05, 0.05, 0.05], 3.5), w: 0.15 });
    g.push(genDisc([-0.32, -0.25, s * 0.95], 0, 0.11, 2.8));
  }
  return g;
}

function building(): Gen[] {
  const w = 0.75;
  const h = 6;
  const faces: Gen = {
    w: 4 * 2 * w * h,
    g: 0,
    f: (o) => {
      const side = Math.floor(R() * 4);
      const u = R() * 2 - 1;
      const y = R() * h;
      const a = side < 2 ? [side ? w : -w, u * w] : [u * w, side === 2 ? w : -w];
      o[0] = a[0]!;
      o[1] = y;
      o[2] = a[1]!;
      // Window grid: lit windows glow, some dark
      const fx = (u * w * 3.2 + 10) % 1;
      const fy = (y * 2.6) % 1;
      const win = fx > 0.25 && fx < 0.8 && fy > 0.25 && fy < 0.75;
      const lit = Math.sin(Math.floor(y * 2.6) * 12.9 + Math.floor(u * w * 3.2) * 78.2 + side) > -0.2;
      if (Math.abs(u) > 0.96) return 1.8;
      return win ? (lit ? 2.2 : 0.25) : 0.55;
    },
  };
  return [
    faces,
    genBox([0, h + 0.05, 0], [w, 0.05, w], 1.2),
    genBox([0, h + 0.25, 0], [w * 0.5, 0.2, w * 0.5], 0.9),
    genLine([0, h + 0.45, 0], [0, h + 1.5, 0], 1.8, 0.6),
    { ...genEllipsoid([0, h + 1.55, 0], [0.06, 0.06, 0.06], 4), w: 0.1 },
  ];
}

function palm(): Gen[] {
  const top: V3 = [0.7, 4.2, 0];
  const g: Gen[] = [];
  // Curved trunk (as a chain of tubes) with ring bands
  let prev: V3 = [0, 0, 0];
  for (let k = 1; k <= 8; k++) {
    const t = k / 8;
    const p: V3 = [0.7 * t * t, 4.2 * t, 0];
    g.push(genTube(prev, p, 0.17 - 0.08 * (t - 0.125), 0.17 - 0.08 * t, k % 2 ? 0.6 : 0.9));
    prev = p;
  }
  for (let l = 0; l < 8; l++) {
    const a = (l / 8) * Math.PI * 2 + 0.3;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    g.push({
      w: 1.6,
      g: 0,
      f: (o) => {
        const u = R();
        const side = (R() - 0.5) * 0.5 * Math.sin(Math.PI * Math.min(1, u * 1.2));
        const out = u * 1.9;
        const y = 0.5 * Math.sin(u * 2.2) - u * u * 1.1;
        o[0] = top[0] + dx * out - dz * side;
        o[1] = top[1] + y;
        o[2] = top[2] + dz * out + dx * side;
        return Math.abs(side) < 0.02 ? 1.6 : 0.9;
      },
    });
  }
  for (let k = 0; k < 5; k++) {
    const a = k * 1.3;
    g.push(genEllipsoid([top[0] + Math.cos(a) * 0.18, top[1] - 0.2 - (k % 2) * 0.1, Math.sin(a) * 0.18], [0.13, 0.14, 0.13], 1.3));
  }
  return g;
}

function coconuts(centers: V3[]): Gen[] {
  const g: Gen[] = [];
  centers.forEach((c, i) => {
    g.push(noisySphere(c, 0.24, 0.08, 0.85, i));
    for (let k = 0; k < 3; k++) {
      const a = (k - 1) * 0.35;
      g.push({ ...genEllipsoid([c[0] + 0.22 * Math.cos(a), c[1] + 0.08 * (k === 1 ? -1 : 1), c[2] + 0.22 * Math.sin(a)], [0.02, 0.02, 0.02], 3), w: 0.03, g: i });
    }
  });
  return g;
}

function missiles(centers: V3[]): Gen[] {
  const g: Gen[] = [];
  centers.forEach((c, i) => {
    const [x, y, z] = c;
    g.push(genTube([x - 0.45, y, z], [x + 0.35, y, z], 0.075, 0.075, 0.8, i));
    g.push(genTube([x + 0.35, y, z], [x + 0.62, y, z], 0.075, 0.005, 1.4, i));
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      g.push(genTri([x - 0.45, y, z], [x - 0.25, y, z], [x - 0.5, y + Math.cos(a) * 0.2, z + Math.sin(a) * 0.2], 1, i, 1.8));
    }
    g.push({ ...genDisc([x - 0.47, y, z], 0, 0.07, 3.5, i), w: 0.08 });
  });
  return g;
}

function sword(): Gen[] {
  const blade: Gen = {
    w: 4.2,
    g: 0,
    f: (o) => {
      const t = R();
      const y = 0.45 + t * 4;
      const w = 0.17 * (1 - Math.pow(t, 4) * 0.95);
      const e = R() * 2 - 1;
      o[0] = (R() - 0.5) * 0.04 * (1 - Math.abs(e));
      o[1] = y;
      o[2] = e * w;
      return Math.abs(e) > 0.9 ? 2.2 : Math.abs(e) < 0.06 ? 1.6 : 0.7;
    },
  };
  return [
    genTube([0, -0.3, 0], [0, 0.32, 0], 0.05, 0.05, 0.7),
    genEllipsoid([0, -0.36, 0], [0.07, 0.07, 0.07], 1.8),
    genBox([0, 0.36, 0], [0.06, 0.05, 0.42], 1.2),
    blade,
  ];
}

function hammer(): Gen[] {
  return [
    genTube([0, -0.2, 0], [0, 2.3, 0], 0.07, 0.07, 0.7),
    genBox([0, 2.6, 0], [0.34, 0.3, 0.62], 0.8, 0, 2.2),
    genLine([0.35, 2.35, 0], [0.35, 2.85, 0], 2.5, 0.2),
    genLine([-0.35, 2.35, 0], [-0.35, 2.85, 0], 2.5, 0.2),
  ];
}

function guitar(): Gen[] {
  const g: Gen[] = [
    genBox([0, -0.12, 0], [0.03, 0.14, 0.1], 1),
    genBox([0, 0.85, 0], [0.03, 0.85, 0.06], 0.7),
    genDisc([0, 2.6, 0], 0, 0.52, 0.7, 0, 2),
    genDisc([0, 1.95, 0], 0, 0.4, 0.7, 0, 2),
    genDisc([0.04, 2.25, 0], 0, 0.13, 2.4, 0, 0, 0.1),
  ];
  for (let k = 0; k < 6; k++) {
    const z = (k - 2.5) * 0.018;
    g.push(genLine([0.04, 0, z], [0.04, 2.75, z], 2.4, 0.15));
  }
  return g;
}

function shark(): Gen[] {
  const body: Gen = {
    w: 8,
    g: 0,
    f: (o) => {
      const t = R();
      const a = R() * Math.PI * 2;
      const r = 0.42 * Math.pow(Math.sin(Math.PI * Math.min(0.999, t * 0.93 + 0.04)), 0.7);
      o[0] = -1.3 + t * 2.7;
      o[1] = Math.sin(a) * r * 0.95;
      o[2] = Math.cos(a) * r * 0.75;
      return Math.sin(a) < -0.6 ? 1.1 : 0.7;
    },
  };
  const g: Gen[] = [
    body,
    genTri([0.15, 0.32, 0], [-0.4, 0.32, 0], [-0.3, 0.95, 0], 0.8, 0, 1.9),
    genTri([-1.25, 0, 0], [-1.75, 0.65, 0], [-1.55, 0, 0], 0.8, 0, 1.9),
    genTri([-1.25, 0, 0], [-1.65, -0.45, 0], [-1.52, 0, 0], 0.8, 0, 1.9),
  ];
  for (const s of [-1, 1]) {
    g.push(genTri([0.35, -0.2, s * 0.25], [0, -0.2, s * 0.25], [-0.1, -0.45, s * 0.75], 0.8, 0, 1.7));
    g.push({ ...genEllipsoid([1.05, 0.08, s * 0.19], [0.03, 0.03, 0.03], 3.5), w: 0.05 });
    for (let k = 0; k < 3; k++) g.push(genLine([0.55 - k * 0.08, 0.1, s * 0.3], [0.52 - k * 0.08, -0.12, s * 0.3], 1.6, 0.05));
  }
  return g;
}

function duck(): Gen[] {
  const g: Gen[] = [
    genEllipsoid([0, 0, 0], [0.78, 0.52, 0.56], 0.8),
    genEllipsoid([0.5, 0.65, 0], [0.37, 0.35, 0.34], 0.85),
    genEllipsoid([0.92, 0.56, 0], [0.24, 0.065, 0.15], 2),
    genEllipsoid([-0.74, 0.28, 0], [0.16, 0.22, 0.13], 0.9),
  ];
  for (const s of [-1, 1]) {
    g.push({ ...genEllipsoid([0.8, 0.75, s * 0.15], [0.035, 0.05, 0.035], 3.5), w: 0.05 });
    g.push(genEllipsoid([-0.05, 0.08, s * 0.52], [0.42, 0.2, 0.06], 0.9));
  }
  return g;
}

function ufo(): Gen[] {
  const lens: Gen = {
    w: 12,
    g: 0,
    f: (o) => {
      const r = Math.sqrt(R()) * 1.55;
      const a = R() * Math.PI * 2;
      const s = R() < 0.5 ? 1 : -1;
      o[0] = Math.cos(a) * r;
      o[1] = s * 0.2 * (1 - (r / 1.55) ** 2);
      o[2] = Math.sin(a) * r;
      return r > 1.48 ? 1.8 : 0.65;
    },
  };
  const g: Gen[] = [lens, genEllipsoid([0, 0.18, 0], [0.55, 0.45, 0.55], 1.3, 0, (u) => u[1]! > 0)];
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    g.push({ ...genEllipsoid([Math.cos(a) * 1.35, 0, Math.sin(a) * 1.35], [0.05, 0.05, 0.05], 3.5), w: 0.06 });
  }
  g.push(genDisc([0, -0.22, 0], 1, 0.5, 2.2));
  return g;
}

function torii(): Gen[] {
  const base = -0.6;
  const kasagi: Gen = {
    w: 4,
    g: 0,
    f: (o) => {
      const z = (R() * 2 - 1) * 1.8;
      const lift = 0.16 * Math.pow(Math.abs(z) / 1.8, 3);
      const face = Math.floor(R() * 4);
      const u = R() * 2 - 1;
      o[2] = z;
      o[0] = face < 2 ? (face ? 0.18 : -0.18) : u * 0.18;
      o[1] = base + 2.85 + lift + (face < 2 ? u * 0.09 : face === 2 ? 0.09 : -0.09);
      return Math.abs(u) > 0.9 ? 2 : 1;
    },
  };
  return [
    genTube([0, base, -1.1], [0, base + 2.8, -1.05], 0.14, 0.12, 0.9),
    genTube([0, base, 1.1], [0, base + 2.8, 1.05], 0.14, 0.12, 0.9),
    kasagi,
    genBox([0, base + 2.28, 0], [0.09, 0.07, 1.4], 1, 0, 2),
    genBox([0, base + 2.55, 0], [0.06, 0.2, 0.12], 1.2),
  ];
}

function meteor(): Gen[] {
  return [noisySphere([0, 0, 0], 1.1, 0.14, 0.75, 0, 2.8)];
}


/** A spectral warrior half-body (ribcage, skull, horns, pauldrons, arms) holding a colossal sword — stands on the origin */
function colossus(): Gen[] {
  const ribs: Gen = {
    w: 12,
    g: 0,
    f: (o) => {
      // Rib bands wrapping the chest
      const k = Math.floor(R() * 6);
      const a = (R() - 0.5) * Math.PI * 1.5;
      const y = 3.0 + k * 0.28;
      const rr = 1.0 - Math.abs(k - 2.5) * 0.08;
      o[0] = Math.cos(a) * rr * 0.8;
      o[1] = y - Math.abs(Math.sin(a)) * 0.15;
      o[2] = Math.sin(a) * rr * 1.25;
      return 1.5;
    },
  };
  const g: Gen[] = [
    ribs,
    genEllipsoid([0, 3.7, 0], [0.9, 1.15, 1.3], 0.55),
    genTube([-0.3, 2.1, 0], [-0.3, 4.9, 0], 0.12, 0.1, 1.4),
    genEllipsoid([0, 2.2, 0], [0.6, 0.35, 0.95], 0.8),
    genEllipsoid([0, 1.1, 0], [0.7, 1.1, 0.9], 0.35),
    genEllipsoid([0.1, 5.35, 0], [0.45, 0.52, 0.42], 0.9),
    genEllipsoid([0.35, 5.0, 0], [0.18, 0.12, 0.3], 1.2),
  ];
  for (const s of [-1, 1]) {
    g.push({ ...genEllipsoid([0.46, 5.4, s * 0.16], [0.05, 0.04, 0.07], 4), w: 0.25 });
    g.push(genTube([0, 5.65, s * 0.25], [-0.55, 6.5, s * 0.75], 0.09, 0.02, 1.8));
    g.push(genEllipsoid([0, 4.55, s * 1.45], [0.6, 0.42, 0.55], 1.1));
    g.push(genTube([0, 4.4, s * 1.6], [0.6, 3.4, s * 1.95], 0.26, 0.22, 0.8));
    g.push(genTube([0.6, 3.4, s * 1.95], [1.4, 3.9, s * 1.6], 0.22, 0.18, 0.8));
    g.push(genEllipsoid([1.5, 3.95, s * 1.55], [0.25, 0.25, 0.25], 1.3));
  }
  // The sword, raised in the right hand
  g.push(genTube([1.5, 3.2, 1.55], [1.55, 4.6, 1.5], 0.07, 0.07, 1.2));
  g.push(genBox([1.55, 4.6, 1.5], [0.1, 0.06, 0.55], 1.6, 0, 2.4));
  g.push(genTube([1.6, 4.7, 1.5], [2.6, 10.2, 1.3], 0.22, 0.03, 1.3, 0, 0.25));
  return g;
}

/** A giant fist punching down: knuckles at the bottom, forearm rising out of the top */
function fist(): Gen[] {
  const g: Gen[] = [
    genBox([0, 0.2, 0], [0.45, 0.4, 0.55], 0.8, 0, 1.7),
    genTube([0, 0.6, 0], [0, 2.4, 0], 0.36, 0.3, 0.55),
    genTube([0.4, 0.15, 0.55], [0.45, -0.3, 0.2], 0.13, 0.11, 0.9),
  ];
  for (let k = 0; k < 4; k++) {
    const z = -0.4 + k * 0.27;
    g.push(genTube([0.35, -0.22, z], [-0.25, -0.28, z], 0.13, 0.12, 0.9));
    g.push({ ...genEllipsoid([0.05, -0.42, z], [0.13, 0.1, 0.12], 2.2), w: 0.4 });
  }
  return g;
}

/** Sample `n` points of the shape. Volley shapes come in several pieces (groups). */
export function sampleShape(kind: SummonKind, n: number): ShapeData {
  switch (kind) {
    case 'car': return sampleGens(car(), n);
    case 'plane': return sampleGens(plane(), n);
    case 'building': return sampleGens(building(), n);
    case 'palm': return sampleGens(palm(), n);
    case 'sword': return sampleGens(sword(), n);
    case 'hammer': return sampleGens(hammer(), n);
    case 'guitar': return sampleGens(guitar(), n);
    case 'shark': return sampleGens(shark(), n);
    case 'duck': return sampleGens(duck(), n);
    case 'ufo': return sampleGens(ufo(), n);
    case 'torii': return sampleGens(torii(), n);
    case 'meteor': return sampleGens(meteor(), n);
    case 'colossus': return sampleGens(colossus(), n);
    case 'fist': return sampleGens(fist(), n);
    case 'coconuts': {
      const cs: V3[] = Array.from({ length: 10 }, (_, i) => [Math.cos(i * 2.4) * (0.35 + 0.1 * i), Math.sin(i * 1.3) * 0.45, Math.sin(i * 2.4) * (0.35 + 0.1 * i)]);
      return sampleGens(coconuts(cs), n, cs);
    }
    case 'missiles': {
      const cs: V3[] = Array.from({ length: 8 }, (_, i) => [Math.abs(i - 3.5) * -0.12, Math.sin(i * 0.9) * 0.25, (i - 3.5) * 0.42]);
      return sampleGens(missiles(cs), n, cs);
    }
  }
}
