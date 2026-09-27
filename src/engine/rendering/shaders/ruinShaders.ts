import * as THREE from 'three';
import { PILLAR_N } from '../../simulation/combat/powers/Ruin';
import { SPRITE_FRAG } from './fightShaders';

/**
 * The breaking world: monoliths that rock and topple (their tilt comes from the ruin's
 * rigid-body step), and cracks (in reality across the sky, in the floor) that tear open
 * from where they start and keep glowing.
 */

const PILLAR_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uScale;
  uniform float uPixelRatio;
  uniform vec4 uPil[${PILLAR_N}];
  uniform vec3 uStone;
  uniform vec3 uRune;
  uniform vec3 uRift;
  uniform float uPulse;
  uniform float uBass;
  uniform float uDim;
  uniform float uRuin;
  uniform float uFlash;
  attribute float aIdx;
  attribute float aRand;
  attribute float aKind;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 pl = uPil[int(aIdx + 0.5)];
    // Tip over the base edge, towards (cos axis, sin axis): Rodrigues about k = up × dir
    vec3 k = vec3(sin(pl.z), 0.0, -cos(pl.z));
    float ct = cos(pl.w), st = sin(pl.w);
    vec3 v = position;
    v = v * ct + cross(k, v) * st + k * dot(k, v) * (1.0 - ct);
    vec3 p = vec3(pl.x, 0.0, pl.y) + v;
    vec3 c = uStone * (0.45 + aRand * 0.55);
    float size = 0.9 + aRand * 0.6;
    if (aKind > 0.5 && aKind < 1.5) {
      // Runes: a band of glyphs that pulses with the kick and the bass (and sputters as the world dies)
      float live = 1.0 - uRuin * 0.75 * step(0.5, fract(sin(uTime * 13.0 + aRand * 40.0) * 43758.5));
      c = uRune * (0.5 + uPulse * 1.6 + uBass * 0.8) * live;
      size += 0.5 + uPulse;
    } else if (aKind > 1.5) {
      c *= 1.4;
    }
    // Stress fractures light up as the world breaks
    float fr = step(1.0 - uRuin * 0.28, fract(aRand * 7.31));
    c += uRift * fr * (1.2 + 0.5 * sin(uTime * 4.0 + aRand * 30.0));
    c = c * (1.0 - uDim * 0.6) + vec3(0.8, 0.85, 1.0) * uFlash * 0.4;
    vColor = c;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uScale * uPixelRatio * size / max(0.3, -mv.z), 1.0, 18.0);
    vAlpha = 0.55 + fr * 0.4;
  }
`;

/** Shared by crack lines and crack points: reveal from the origin, then glow and widen */
const CRACK_HEAD = /* glsl */ `
  uniform float uTime;
  uniform float uSpeed;
  uniform vec3 uColA;
  uniform vec3 uColB;
  uniform float uPulse;
  uniform float uDim;
  attribute float aT;
  attribute float aBorn;
  attribute float aW;
  varying vec3 vColor;
  varying float vAlpha;
  float reveal() {
    float grow = (uTime - aBorn) * uSpeed;
    return clamp((grow - aT) * 18.0, 0.0, 1.0);
  }
`;

const CRACK_LINE_VERT = /* glsl */ `
  ${CRACK_HEAD}
  void main() {
    float vis = reveal();
    float fl = 0.75 + 0.25 * sin(uTime * 7.0 + aT * 31.0);
    vColor = mix(uColA, vec3(1.0), aW * 0.55) * fl * (1.1 + uPulse * 0.7) * (1.0 - uDim * 0.3);
    vAlpha = vis * (0.5 + aW * 0.5);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const CRACK_LINE_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() { gl_FragColor = vec4(vColor, vAlpha); }
`;

const CRACK_POINT_VERT = /* glsl */ `
  ${CRACK_HEAD}
  uniform float uScale;
  uniform float uPixelRatio;
  uniform float uWiden;
  uniform float uSizeK;
  attribute float aRand;
  attribute float aKind;
  void main() {
    float vis = reveal();
    float age = max(0.0, uTime - aBorn);
    // The tear keeps opening: the glow around it spreads for a while
    float widen = 1.0 + min(age, 25.0) * uWiden;
    vec3 p = position;
    float fl = 0.7 + 0.3 * sin(uTime * (3.0 + aRand * 6.0) + aRand * 50.0);
    float size;
    if (aKind < 0.5) {
      vColor = mix(uColA, vec3(1.0), aW * 0.6) * fl * (1.2 + uPulse);
      size = (1.1 + aW * 1.4) * widen;
      vAlpha = vis * (0.6 + aW * 0.4);
    } else {
      // The void leaking out round the tear
      vColor = uColB * fl * 0.7;
      size = (2.0 + aRand * 3.0) * widen;
      vAlpha = vis * 0.18;
    }
    vColor *= 1.0 - uDim * 0.3;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uScale * uPixelRatio * size * uSizeK / max(0.3, -mv.z), 1.0, 40.0);
  }
`;

function common(): Record<string, THREE.IUniform> {
  return { uTime: { value: 0 }, uScale: { value: 14 }, uPixelRatio: { value: 1 }, uPulse: { value: 0 }, uDim: { value: 0 } };
}

export function createPillarMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: PILLAR_VERT,
    fragmentShader: SPRITE_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      ...common(),
      uSoft: { value: 0.25 },
      uCore: { value: 0.15 },
      uPil: { value: Array.from({ length: PILLAR_N }, () => new THREE.Vector4()) },
      uStone: { value: new THREE.Color() },
      uRune: { value: new THREE.Color() },
      uRift: { value: new THREE.Color() },
      uBass: { value: 0 },
      uRuin: { value: 0 },
      uFlash: { value: 0 },
    },
  });
}

export function createCrackMaterials(speed: number, widen: number, sizeK: number): { lines: THREE.ShaderMaterial; points: THREE.ShaderMaterial } {
  const u = {
    ...common(),
    uSpeed: { value: speed },
    uColA: { value: new THREE.Color() },
    uColB: { value: new THREE.Color() },
  };
  const lines = new THREE.ShaderMaterial({
    vertexShader: CRACK_LINE_VERT,
    fragmentShader: CRACK_LINE_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: u,
  });
  const points = new THREE.ShaderMaterial({
    vertexShader: CRACK_POINT_VERT,
    fragmentShader: SPRITE_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    // Shares the uniform objects with the lines, so one update reaches both
    uniforms: { ...u, uWiden: { value: widen }, uSizeK: { value: sizeK }, uSoft: { value: 0.6 }, uCore: { value: 0.3 } },
  });
  return { lines, points };
}

/**
 * The great rift in the sky: star trails swirling round an elliptical vortex (inner ones
 * faster, like water round a drain) and a molten slit through its middle. Everything is
 * computed from time on the GPU: a trail is a line whose two ends sit at the same orbit a
 * moment apart, so it draws an arc that fades towards its tail.
 */
const VORTEX_HEAD = /* glsl */ `
  uniform float uTime;
  uniform float uOpen;
  uniform float uPulse;
  uniform vec3 uC;
  uniform vec3 uU;
  uniform vec3 uV;
  uniform vec3 uN;
  uniform vec3 uColOut;
  uniform vec3 uColIn;
  uniform vec3 uColCore;
  varying vec3 vColor;
  varying float vAlpha;
`;

const VORTEX_TRAIL_VERT = /* glsl */ `
  ${VORTEX_HEAD}
  attribute float aR;
  attribute float aTh;
  attribute float aLen;
  attribute float aEnd;
  attribute float aRand;
  void main() {
    // Spiral inwards slowly, forever (the radius wraps round)
    float r = 0.16 + 0.84 * fract(aR - uTime * 0.012 * (0.5 + aRand));
    float w = 0.22 / (0.12 + r * r);
    float th = aTh + uTime * w - (1.0 - aEnd) * aLen * (0.6 + w * 0.8);
    float R = uOpen;
    vec3 p = uC + (uU * cos(th) + uV * sin(th)) * r * R + uN * sin(th * 3.0 + aRand * 9.0) * 0.6 * r;
    float inner = 1.0 - smoothstep(0.16, 0.6, r);
    // Blue-violet star trails outside, burning orange as they fall towards the slit
    vColor = mix(uColOut, uColIn, inner * inner) * (1.0 + uPulse * 0.6) * (0.75 + aRand * 0.6);
    vAlpha = aEnd * smoothstep(0.0, 0.25, uOpen) * (0.35 + inner * 0.3) * (1.0 - smoothstep(0.85, 1.0, r));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const VORTEX_CORE_VERT = /* glsl */ `
  ${VORTEX_HEAD}
  uniform float uScale;
  uniform float uPixelRatio;
  attribute float aX;
  attribute float aY;
  attribute float aRand;
  attribute float aKind;
  void main() {
    float R = uOpen;
    float open = smoothstep(0.0, 0.5, uOpen);
    vec3 p;
    float size;
    if (aKind < 0.5) {
      // The molten slit: a lens along the long axis, burning hottest along its seam
      float x = aX;
      float hw = (1.0 - x * x) * 0.2 * open;
      float y = aY * hw;
      p = uC + uU * x * R * 0.78 + uV * y * R + uN * 0.3;
      float seam = 1.0 - abs(aY);
      vColor = mix(uColCore, vec3(1.0, 0.92, 0.65), seam * seam) * (1.3 + seam * 1.3 + uPulse * 0.8) * (0.8 + 0.2 * sin(uTime * 5.0 + aRand * 40.0));
      size = 1.0 + seam * 1.6 + aRand;
      vAlpha = open * (0.35 + seam * 0.6);
    } else {
      // Embers raining out of it
      float t = fract(uTime * (0.05 + aRand * 0.05) + aRand * 13.0);
      p = uC + uU * aX * R * 0.7 + uV * aY * R * 0.08 - vec3(0.0, t * R * 28.0, 0.0) + uN * (t * 6.0);
      vColor = uColCore * (1.2 + aRand);
      size = 0.8 + aRand * 1.2;
      vAlpha = open * (1.0 - t) * 0.8;
    }
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uScale * uPixelRatio * size * 7.0 / max(0.3, -mv.z), 1.0, 28.0);
  }
`;

/** Light streaking out round a crack in the sky (the rays of the tear) */
const RAY_VERT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uCol;
  uniform float uPulse;
  attribute float aBorn;
  attribute float aFade;
  attribute float aRand;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float age = uTime - aBorn;
    float vis = smoothstep(0.4, 2.5, age);
    float fl = 0.6 + 0.4 * sin(uTime * (1.0 + aRand * 2.0) + aRand * 60.0);
    vColor = uCol * fl * (1.0 + uPulse * 0.5);
    vAlpha = vis * aFade * (0.12 + aRand * 0.16);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

function lineMat(vertexShader: string, uniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({ vertexShader, fragmentShader: CRACK_LINE_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms });
}

export function createVortexMaterials(): { trails: THREE.ShaderMaterial; core: THREE.ShaderMaterial } {
  const u: Record<string, THREE.IUniform> = {
    uTime: { value: 0 }, uOpen: { value: 0 }, uPulse: { value: 0 },
    uC: { value: new THREE.Vector3() }, uU: { value: new THREE.Vector3() }, uV: { value: new THREE.Vector3() }, uN: { value: new THREE.Vector3() },
    uColOut: { value: new THREE.Color(0.38, 0.5, 1.0) },
    uColIn: { value: new THREE.Color(1.0, 0.5, 0.22) },
    uColCore: { value: new THREE.Color(1.0, 0.5, 0.12) },
  };
  const trails = lineMat(VORTEX_TRAIL_VERT, u);
  const core = new THREE.ShaderMaterial({
    vertexShader: VORTEX_CORE_VERT,
    fragmentShader: SPRITE_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { ...u, uScale: { value: 14 }, uPixelRatio: { value: 1 }, uSoft: { value: 0.55 }, uCore: { value: 0.4 } },
  });
  return { trails, core };
}

export function createRayMaterial(): THREE.ShaderMaterial {
  return lineMat(RAY_VERT, { uTime: { value: 0 }, uCol: { value: new THREE.Color(0.45, 0.7, 1.0) }, uPulse: { value: 0 } });
}
