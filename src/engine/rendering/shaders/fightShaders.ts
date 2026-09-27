import * as THREE from 'three';

/**
 * Point-sprite shaders in the style of the brain scene: each point is a round
 * star with a white-hot centre, drawn twice — crisp, then a large faint glow
 * pass underneath for the bright ones — and everything blends additively so
 * dense clusters bloom into light on their own (before post-processing bloom).
 */

export const SPRITE_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  uniform float uSoft;
  uniform float uCore;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    if (r > 1.0) discard;
    float core = exp(-r * r * 9.0);
    float crisp = smoothstep(1.0, 0.45, r) * 0.75 + core * 0.5;
    float soft = exp(-r * r * 4.5);
    float a = mix(crisp, soft, uSoft) * vAlpha;
    gl_FragColor = vec4(mix(vColor, vec3(1.0), core * uCore), a);
  }
`;

const PARTICLE_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uScale;
  uniform float uPixelRatio;
  uniform float uGlowPass;
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aAlpha;
  attribute float aRand;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    bool glowPoint = aRand < 0.2 || aSize > 2.4;
    if (aAlpha < 0.004 || (uGlowPass > 0.5 && !glowPoint)) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      vAlpha = 0.0;
      vColor = vec3(0.0);
      return;
    }
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    // Every point twinkles at its own rate, like the brain's star field
    float tw = 0.78 + 0.22 * sin(uTime * (2.0 + aRand * 7.0) + aRand * 60.0);
    float s = uScale * uPixelRatio * aSize / max(0.25, -mv.z);
    vColor = aColor;
    if (uGlowPass > 0.5) {
      gl_PointSize = clamp(s * 3.6, 2.0, 96.0);
      vAlpha = aAlpha * 0.12 * tw;
    } else {
      gl_PointSize = clamp(s, 1.0, 72.0);
      vAlpha = aAlpha * tw;
    }
  }
`;

const FLOOR_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uScale;
  uniform float uPixelRatio;
  uniform vec4 uRipples[8];
  uniform vec3 uLightPos[2];
  uniform vec3 uLightCol[2];
  uniform vec3 uBase;
  uniform float uBass;
  uniform float uGlow;
  uniform float uPulse;
  uniform float uDim;
  uniform vec3 uTint;
  uniform vec4 uCrack;   // x, z, radius, glow
  uniform vec4 uTrench;  // x0, z0, x1, z1
  uniform vec2 uTrenchK; // progress, glow
  uniform vec3 uWarp;    // x, z, strength
  uniform float uFlash;
  uniform vec4 uSlab[12];  // x, z, radius, height
  uniform vec4 uSlabT[12]; // slope x, slope z, rim glow
  uniform float uRuin;
  uniform vec3 uRuinCol;
  attribute float aRand;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    // Slabs of floor heaved up by shockwaves: lifted and tilted, their broken rims glowing
    float rim = 0.0;
    for (int i = 0; i < 12; i++) {
      vec4 s = uSlab[i];
      if (s.z <= 0.0) continue;
      vec2 dv = p.xz - s.xy;
      float d = length(dv);
      if (d < s.z) {
        vec4 t = uSlabT[i];
        p.y += s.w + dot(t.xy, dv);
        rim = max(rim, smoothstep(s.z * 0.78, s.z, d) * (0.5 + t.z));
      }
    }
    // A ruined floor: rough, and crumbling away in places
    p.y += (aRand - 0.5) * 0.14 * uRuin;
    float crumble = max(0.0, aRand - (1.0 - uRuin * 0.2));
    p.y -= crumble * 7.0;
    // Void singularity: the floor is drawn towards the centre and sinks into it
    if (uWarp.z > 0.001) {
      vec2 dv = p.xz - uWarp.xy;
      float dl = length(dv);
      float pullK = uWarp.z * exp(-dl * 0.18);
      p.xz -= dv * pullK * 0.55;
      p.y -= pullK * 2.2 * exp(-dl * 0.35);
    }
    float r = length(p.xz);
    float wave = 0.0;
    for (int i = 0; i < 8; i++) {
      vec4 rp = uRipples[i];
      float age = uTime - rp.z;
      if (age < 0.0 || age > 3.5) continue;
      float d = length(p.xz - rp.xy);
      float w = (d - age * 9.0) * 1.4;
      wave += exp(-w * w) * exp(-age * 1.3) * rp.w;
    }
    // Kick: a ripple runs out from the centre of the fight
    float kickWave = exp(-pow((r - (1.0 - uPulse) * 16.0) * 0.8, 2.0)) * uPulse;
    p.y += wave * 0.45 + aRand * 0.015 + kickWave * 0.18;
    // Concentric arena rings pulse with the bass
    float rings = pow(0.5 + 0.5 * cos(r * 3.14159), 24.0);
    vec3 c = uBase * (0.25 + 0.75 * smoothstep(26.0, 0.0, r)) * (0.7 + aRand * 0.6);
    c += uBase * rings * (0.5 + uBass * 1.2 + uPulse * 1.4);
    c += uBase * kickWave * 2.5;
    // Radial cracks spreading from a point, glowing with the power's colour
    float crack = 0.0;
    if (uCrack.w > 0.01) {
      vec2 dc = p.xz - uCrack.xy;
      float d = length(dc);
      float a = atan(dc.y, dc.x);
      float seg = a * 7.0 / 6.2832 + sin(d * 1.3 + a * 3.0) * 0.18 + sin(d * 0.37) * 0.3;
      float line = 1.0 - smoothstep(0.0, 0.03 + d * 0.002, abs(fract(seg) - 0.5) - 0.47);
      float ring2 = 1.0 - smoothstep(0.0, 0.04, abs(fract(d * 0.25 + aRand * 0.03) - 0.5) - 0.48);
      // Brightest at the spreading front, fading behind it
      float front = exp(-pow((d - uCrack.z) * 0.6, 2.0));
      crack = max(line, ring2 * 0.35) * step(d, uCrack.z + 0.3) * (0.35 + front) * uCrack.w;
      p.y += crack * 0.06 * aRand;
    }
    // A trench carved in a straight line
    float trench = 0.0;
    if (uTrenchK.y > 0.01) {
      vec2 a0 = uTrench.xy;
      vec2 ab = uTrench.zw - a0;
      float L = max(0.01, length(ab));
      float t = clamp(dot(p.xz - a0, ab) / (L * L), 0.0, 1.0);
      float dist = length(p.xz - (a0 + ab * t));
      trench = exp(-dist * dist * 6.0) * step(t, uTrenchK.x) * uTrenchK.y;
      p.y -= trench * 0.25;
    }
    c += uTint * (crack * 2.0 + trench * 4.0);
    // Fighter light pools: the floor catches each fighter's colour
    for (int i = 0; i < 2; i++) {
      float d = length(p.xz - uLightPos[i].xz);
      c += uLightCol[i] * exp(-d * d * 0.28) * (0.9 + uGlow);
    }
    c += vec3(1.0, 0.92, 0.85) * wave * 1.6;
    c += uRuinCol * rim * 1.6;
    c = mix(c, c * vec3(1.3, 0.62, 0.5), uRuin * 0.55);
    c = c * (1.0 - uDim * 0.75) + uTint * 0.12 * (1.0 - smoothstep(0.0, 26.0, r)) + vec3(0.8, 0.85, 1.0) * uFlash * 0.5;
    vColor = c;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uScale * uPixelRatio * (0.8 + aRand * 0.7 + wave + kickWave * 1.5 + crack * 1.5 + trench * 2.0) / max(0.3, -mv.z), 1.0, 24.0);
    vAlpha = (0.35 + wave * 1.2 + rings * 0.3 + kickWave + crack + trench + rim) * smoothstep(28.0, 12.0, r) * (1.0 - crumble * 2.5);
  }
`;

const ROCK_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uScale;
  uniform float uPixelRatio;
  uniform float uLevitate;
  uniform vec3 uTint;
  uniform float uPulse;
  uniform float uDim;
  uniform vec4 uRockOff[42];
  uniform float uRuin;
  attribute vec3 aCenter;
  attribute float aRand;
  attribute float aRock;
  attribute float aIdx;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    // Where the shockwaves have thrown it, and how it has tumbled
    vec4 off = uRockOff[int(aIdx + 0.5)];
    // Rocks tumble and rise off the ground while someone charges up
    float a = uTime * (0.2 + aRock * 0.6) * uLevitate + off.w;
    vec3 o = position;
    o.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * o.xz;
    o.xy = mat2(cos(a * 0.7), -sin(a * 0.7), sin(a * 0.7), cos(a * 0.7)) * o.xy;
    vec3 c = aCenter + off.xyz;
    c.y += uLevitate * (0.4 + aRock * 3.2) + sin(uTime * 0.8 + aRock * 30.0) * 0.12 * uLevitate + uPulse * (0.05 + aRock * 0.12);
    vec4 mv = modelViewMatrix * vec4(c + o, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uScale * uPixelRatio * (0.9 + aRand * 0.6) / max(0.3, -mv.z), 1.0, 18.0);
    vColor = mix(vec3(0.32, 0.3, 0.42), uTint, 0.35 + uLevitate * 0.4) * (0.6 + aRand * 0.6);
    vColor *= (1.0 - uDim * 0.6) * (1.0 + uPulse * 0.4);
    vColor = mix(vColor, vColor * vec3(1.35, 0.7, 0.55), uRuin * 0.5);
    vAlpha = 0.55 + uLevitate * 0.3;
  }
`;

const SKY_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uScale;
  uniform float uPixelRatio;
  uniform vec3 uSky;
  uniform vec3 uMoon;
  uniform float uPulse;
  uniform float uDim;
  uniform float uFlash;
  uniform float uRuin;
  uniform vec4 uFrag[14];   // offset u, v, n and roll of each moon fragment
  uniform vec2 uFragC[14];  // fragment centroids in the moon's plane
  uniform vec3 uMoonC;
  uniform vec3 uMoonU;
  uniform vec3 uMoonV;
  uniform vec3 uMoonN;
  uniform float uMoonCrack;
  uniform float uMoonBreak;
  uniform vec3 uRift;
  attribute float aRand;
  attribute float aKind;
  attribute float aFrag;
  attribute vec2 aLocal;
  attribute float aEdge;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    float size;
    if (aKind < 0.5) {
      // Stars: fine, twinkling, a few big ones
      float w = 0.5 + 0.5 * sin(uTime * (0.4 + aRand * 2.5) + aRand * 90.0);
      vColor = mix(vec3(0.75, 0.8, 1.0), uSky, fract(aRand * 7.3) * 0.6) * (0.6 + pow(w, 6.0) * 1.2);
      size = 0.6 + pow(aRand, 8.0) * 3.0;
      vAlpha = 0.5 + 0.5 * w;
    } else if (aKind < 1.5) {
      // Moon: each point rides its fragment (drifting, rolling), fractures glow first
      int fi = int(aFrag + 0.5);
      vec4 fr = uFrag[fi];
      vec2 fc = uFragC[fi];
      vec2 l = aLocal - fc;
      float ca = cos(fr.w), sa = sin(fr.w);
      l = vec2(l.x * ca - l.y * sa, l.x * sa + l.y * ca) + fc + fr.xy;
      p = uMoonC + uMoonU * l.x + uMoonV * l.y + uMoonN * fr.z;
      float crack = aEdge * uMoonCrack;
      vColor = uMoon * (0.8 + aRand * 0.5) * (1.0 + uPulse * 0.25) * (1.0 - uMoonBreak * 0.3);
      vColor += uRift * crack * (1.4 + 0.6 * sin(uTime * 3.0 + aRand * 20.0));
      size = 1.4 + aRand + crack * 1.4;
      vAlpha = 0.9;
    } else if (aKind > 2.5) {
      // The moon's molten heart, spilling out between the pieces
      vec2 l = aLocal * (0.35 + uMoonBreak * 1.1) + vec2(sin(uTime * 0.2 + aRand * 40.0), cos(uTime * 0.17 + aRand * 30.0)) * uMoonBreak * 1.5;
      p = uMoonC + uMoonU * l.x + uMoonV * l.y - uMoonN * 0.4;
      vColor = mix(uRift, vec3(1.0, 0.75, 0.5), aRand) * (1.5 + uPulse * 0.8);
      size = 1.0 + aRand * 1.6;
      vAlpha = uMoonBreak * (0.5 + 0.5 * sin(uTime * (1.0 + aRand * 3.0) + aRand * 70.0));
    } else {
      // Bokeh: soft discs drifting around the arena
      p += 0.5 * vec3(sin(uTime * 0.13 + aRand * 50.0), cos(uTime * 0.11 + aRand * 30.0), sin(uTime * 0.09 + aRand * 70.0));
      vColor = mix(uSky, uMoon, fract(aRand * 3.7));
      float big = pow(aRand, 4.0);
      size = 2.0 + big * 16.0;
      vAlpha = (0.08 + 0.12 * (1.0 - big)) * (0.6 + 0.4 * sin(uTime * (0.3 + aRand) + aRand * 90.0)) * (1.0 + uPulse * 0.8);
    }
    // A dying world: the sky burns red at the end
    vColor = mix(vColor, vColor * vec3(1.35, 0.55, 0.5), uRuin * 0.55);
    vColor = vColor * (1.0 - uDim * 0.8) + vec3(0.75, 0.8, 1.0) * uFlash * 0.6;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uScale * uPixelRatio * size * (aKind < 1.5 || aKind > 2.5 ? 12.0 : 1.0) / max(0.3, -mv.z), 1.0, 120.0);
  }
`;

function base(vertexShader: string, uniforms: Record<string, THREE.IUniform>, soft: number, core: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader: SPRITE_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uScale: { value: 14 },
      uPixelRatio: { value: 1 },
      uSoft: { value: soft },
      uCore: { value: core },
      ...uniforms,
    },
  });
}

export function createParticleMaterials(): { main: THREE.ShaderMaterial; glow: THREE.ShaderMaterial } {
  const main = base(PARTICLE_VERT, { uGlowPass: { value: 0 } }, 0.15, 0.45);
  // Shares the uniform objects, so every update reaches both passes
  const glow = new THREE.ShaderMaterial({
    vertexShader: PARTICLE_VERT,
    fragmentShader: SPRITE_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { ...main.uniforms, uGlowPass: { value: 1 }, uSoft: { value: 1 }, uCore: { value: 0 } },
  });
  return { main, glow };
}

export function createFloorMaterial(): THREE.ShaderMaterial {
  return base(
    FLOOR_VERT,
    {
      uRipples: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, -99, 0)) },
      uLightPos: { value: [new THREE.Vector3(), new THREE.Vector3()] },
      uLightCol: { value: [new THREE.Color(), new THREE.Color()] },
      uBase: { value: new THREE.Color() },
      uBass: { value: 0 },
      uGlow: { value: 0 },
      uPulse: { value: 0 },
      uDim: { value: 0 },
      uTint: { value: new THREE.Color(0, 0, 0) },
      uCrack: { value: new THREE.Vector4(0, 0, 0, 0) },
      uTrench: { value: new THREE.Vector4(0, 0, 0, 0) },
      uTrenchK: { value: new THREE.Vector2(0, 0) },
      uWarp: { value: new THREE.Vector3(0, 0, 0) },
      uFlash: { value: 0 },
      uSlab: { value: Array.from({ length: 12 }, () => new THREE.Vector4()) },
      uSlabT: { value: Array.from({ length: 12 }, () => new THREE.Vector4()) },
      uRuin: { value: 0 },
      uRuinCol: { value: new THREE.Color(1.0, 0.42, 0.16) },
    },
    0.35,
    0.2,
  );
}

export function createRockMaterial(): THREE.ShaderMaterial {
  return base(ROCK_VERT, {
    uLevitate: { value: 0 }, uTint: { value: new THREE.Color() }, uPulse: { value: 0 }, uDim: { value: 0 }, uRuin: { value: 0 },
    uRockOff: { value: Array.from({ length: 42 }, () => new THREE.Vector4()) },
  }, 0.2, 0.1);
}

export function createSkyMaterial(soft: number): THREE.ShaderMaterial {
  return base(SKY_VERT, {
    uSky: { value: new THREE.Color() }, uMoon: { value: new THREE.Color() }, uPulse: { value: 0 }, uDim: { value: 0 }, uFlash: { value: 0 },
    uRuin: { value: 0 },
    uFrag: { value: Array.from({ length: 14 }, () => new THREE.Vector4()) },
    uFragC: { value: Array.from({ length: 14 }, () => new THREE.Vector2()) },
    uMoonC: { value: new THREE.Vector3() }, uMoonU: { value: new THREE.Vector3() }, uMoonV: { value: new THREE.Vector3() }, uMoonN: { value: new THREE.Vector3() },
    uMoonCrack: { value: 0 }, uMoonBreak: { value: 0 },
    uRift: { value: new THREE.Color(1.0, 0.5, 0.92) },
  }, soft, soft > 0.5 ? 0 : 0.4);
}

/**
 * Motes: a field of fine particles hanging in the air all over the arena. They drift and
 * swirl slowly, jump and flare on every kick, swell with the bass, part round the fighters
 * as they move (the actors' positions are uniforms) and are blown outwards by the floor
 * shockwaves — so the whole space reacts to the music and to the fight.
 */
const MOTE_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uScale;
  uniform float uPixelRatio;
  uniform float uPulse;
  uniform float uBass;
  uniform float uDim;
  uniform vec3 uColA;
  uniform vec3 uColB;
  uniform vec4 uActors[8];
  uniform vec4 uRipples[8];
  uniform vec2 uCenter;
  attribute float aRand;
  attribute float aRand2;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    // Slow swirl round the fight, a gentle bob
    float a = uTime * (0.03 + aRand * 0.05);
    vec2 rel = p.xz;
    p.xz = vec2(rel.x * cos(a) - rel.y * sin(a), rel.x * sin(a) + rel.y * cos(a)) + uCenter;
    p.y += sin(uTime * (0.4 + aRand2) + aRand * 40.0) * 0.25;
    // Kick: everything jumps
    p.y += uPulse * (0.25 + aRand2 * 0.6);
    // Part round moving bodies
    for (int i = 0; i < 8; i++) {
      vec4 act = uActors[i];
      if (act.w <= 0.0) continue;
      vec3 d = p - act.xyz;
      float dl = length(d);
      float k = act.w * exp(-dl * dl * 0.9);
      p += normalize(d + vec3(0.0001)) * k * 0.9;
    }
    // Floor shockwaves blow them outwards
    for (int i = 0; i < 8; i++) {
      vec4 rp = uRipples[i];
      float age = uTime - rp.z;
      if (age < 0.0 || age > 3.0) continue;
      vec2 dv = p.xz - rp.xy;
      float d = length(dv);
      float w = exp(-pow((d - age * 9.0) * 0.9, 2.0)) * exp(-age * 1.2) * rp.w;
      p.xz += normalize(dv + vec2(0.0001)) * w * 0.8;
      p.y += w * 0.6;
    }
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float glow = 0.35 + uBass * 0.6 + uPulse * 1.2;
    vColor = mix(uColA, uColB, aRand2) * glow * (1.0 - uDim * 0.5);
    gl_PointSize = clamp(uScale * uPixelRatio * (0.55 + aRand * 0.8) * (1.0 + uPulse * 0.8) / max(0.3, -mv.z), 1.0, 10.0);
    vAlpha = (0.25 + aRand * 0.35) * (0.6 + uPulse * 0.8);
  }
`;

export function createMoteMaterial(): THREE.ShaderMaterial {
  return base(
    MOTE_VERT,
    {
      uPulse: { value: 0 },
      uBass: { value: 0 },
      uDim: { value: 0 },
      uColA: { value: new THREE.Color() },
      uColB: { value: new THREE.Color() },
      uActors: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) },
      uRipples: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, -99, 0)) },
      uCenter: { value: new THREE.Vector2() },
    },
    0.6,
    0.2,
  );
}
