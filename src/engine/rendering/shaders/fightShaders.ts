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
  attribute float aRand;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec3 p = position;
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
    p.y += wave * 0.45 + aRand * 0.015;
    // Concentric arena rings pulse with the bass
    float rings = pow(0.5 + 0.5 * cos(r * 3.14159), 24.0);
    vec3 c = uBase * (0.25 + 0.75 * smoothstep(26.0, 0.0, r)) * (0.7 + aRand * 0.6);
    c += uBase * rings * (0.5 + uBass * 1.2);
    // Fighter light pools: the floor catches each fighter's colour
    for (int i = 0; i < 2; i++) {
      float d = length(p.xz - uLightPos[i].xz);
      c += uLightCol[i] * exp(-d * d * 0.28) * (0.9 + uGlow);
    }
    c += vec3(1.0, 0.92, 0.85) * wave * 1.6;
    vColor = c;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uScale * uPixelRatio * (0.8 + aRand * 0.7 + wave) / max(0.3, -mv.z), 1.0, 24.0);
    vAlpha = (0.35 + wave * 1.2 + rings * 0.3) * smoothstep(28.0, 12.0, r);
  }
`;

const ROCK_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uScale;
  uniform float uPixelRatio;
  uniform float uLevitate;
  uniform vec3 uTint;
  attribute vec3 aCenter;
  attribute float aRand;
  attribute float aRock;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    // Rocks tumble and rise off the ground while someone charges up
    float a = uTime * (0.2 + aRock * 0.6) * uLevitate;
    vec3 o = position;
    o.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * o.xz;
    o.xy = mat2(cos(a * 0.7), -sin(a * 0.7), sin(a * 0.7), cos(a * 0.7)) * o.xy;
    vec3 c = aCenter;
    c.y += uLevitate * (0.4 + aRock * 3.2) + sin(uTime * 0.8 + aRock * 30.0) * 0.12 * uLevitate;
    vec4 mv = modelViewMatrix * vec4(c + o, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uScale * uPixelRatio * (0.9 + aRand * 0.6) / max(0.3, -mv.z), 1.0, 18.0);
    vColor = mix(vec3(0.32, 0.3, 0.42), uTint, 0.35 + uLevitate * 0.4) * (0.6 + aRand * 0.6);
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
  attribute float aRand;
  attribute float aKind;
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
      // Moon
      vColor = uMoon * (0.8 + aRand * 0.5) * (1.0 + uPulse * 0.25);
      size = 1.4 + aRand;
      vAlpha = 0.9;
    } else {
      // Bokeh: soft discs drifting around the arena
      p += 0.5 * vec3(sin(uTime * 0.13 + aRand * 50.0), cos(uTime * 0.11 + aRand * 30.0), sin(uTime * 0.09 + aRand * 70.0));
      vColor = mix(uSky, uMoon, fract(aRand * 3.7));
      float big = pow(aRand, 4.0);
      size = 2.0 + big * 16.0;
      vAlpha = (0.08 + 0.12 * (1.0 - big)) * (0.6 + 0.4 * sin(uTime * (0.3 + aRand) + aRand * 90.0)) * (1.0 + uPulse * 0.8);
    }
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uScale * uPixelRatio * size * (aKind < 1.5 ? 12.0 : 1.0) / max(0.3, -mv.z), 1.0, 120.0);
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
    },
    0.35,
    0.2,
  );
}

export function createRockMaterial(): THREE.ShaderMaterial {
  return base(ROCK_VERT, { uLevitate: { value: 0 }, uTint: { value: new THREE.Color() } }, 0.2, 0.1);
}

export function createSkyMaterial(soft: number): THREE.ShaderMaterial {
  return base(SKY_VERT, { uSky: { value: new THREE.Color() }, uMoon: { value: new THREE.Color() }, uPulse: { value: 0 } }, soft, soft > 0.5 ? 0 : 0.4);
}
