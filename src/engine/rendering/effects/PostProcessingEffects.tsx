import React, { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette, ChromaticAberration, HueSaturation, BrightnessContrast, Noise } from '@react-three/postprocessing';
import { BlendFunction, BloomEffect, ChromaticAberrationEffect, HueSaturationEffect, BrightnessContrastEffect, VignetteEffect } from 'postprocessing';
import { EngineBridge } from '../../EngineBridge';

interface PostProcessingEffectsProps {
  enabled?: boolean;
  bridge: EngineBridge;
}

/**
 * Cinematic post chain: mipmap bloom (strength follows impacts and the music),
 * chromatic aberration on hits and in bullet time, flash, colour grade
 * (sadness desaturates), film grain and vignette. Effect parameters are pushed
 * from the director every frame through refs — no React re-renders.
 */
export const PostProcessingEffects: React.FC<PostProcessingEffectsProps> = ({ enabled = true, bridge }) => {
  const bloom = useRef<BloomEffect>(null);
  const chroma = useRef<ChromaticAberrationEffect>(null);
  const hue = useRef<HueSaturationEffect>(null);
  const bc = useRef<BrightnessContrastEffect>(null);
  const vig = useRef<VignetteEffect>(null);
  const offset = useRef(new THREE.Vector2(0, 0));

  useFrame(() => {
    const d = bridge.director;
    const m = bridge.getMusicState();
    if (bloom.current) bloom.current.intensity = (1.25 + d.bloom * 1.6 + d.flash * 1.5 + m.bassSmooth * m.intensity * 0.6 + m.pulse * 0.5 - d.hush * 0.5) * bridge.particles.quality.bloom;
    if (chroma.current) {
      const c = 0.0006 + d.chroma * 0.006;
      chroma.current.offset.set(c, c * 0.6);
    }
    if (hue.current) hue.current.saturation = d.saturation;
    if (bc.current) bc.current.brightness = d.flash * 0.35;
    if (vig.current) vig.current.darkness = 0.75 + (d.timeScale < 0.6 ? 0.2 : 0);
  });

  if (!enabled) return null;

  // Integrated graphics: a shorter bloom mip chain (the costliest part of the chain) and no grain
  if (bridge.budget.integrated) {
    return (
      <EffectComposer multisampling={0}>
        <Bloom ref={bloom} mipmapBlur levels={5} luminanceThreshold={0.2} luminanceSmoothing={0.3} intensity={1.3} radius={0.72} />
        <ChromaticAberration ref={chroma} offset={offset.current} radialModulation modulationOffset={0.2} />
        <HueSaturation ref={hue} saturation={0} />
        <BrightnessContrast ref={bc} brightness={0} contrast={0.08} />
        <Vignette ref={vig} eskil={false} offset={0.22} darkness={0.8} />
      </EffectComposer>
    );
  }

  return (
    <EffectComposer multisampling={0}>
      <Bloom ref={bloom} mipmapBlur luminanceThreshold={0.18} luminanceSmoothing={0.3} intensity={1.3} radius={0.78} />
      <ChromaticAberration ref={chroma} offset={offset.current} radialModulation modulationOffset={0.2} />
      <HueSaturation ref={hue} saturation={0} />
      <BrightnessContrast ref={bc} brightness={0} contrast={0.08} />
      <Noise premultiply blendFunction={BlendFunction.ADD} opacity={0.25} />
      <Vignette ref={vig} eskil={false} offset={0.22} darkness={0.8} />
    </EffectComposer>
  );
};
