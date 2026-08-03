import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

export type AgentState = null | 'thinking' | 'listening' | 'talking';

export interface OrbProps {
  colors?: [string, string];
  colorsRef?: React.RefObject<[string, string]>;
  resizeDebounce?: number;
  seed?: number;
  agentState?: AgentState;
  volumeMode?: 'auto' | 'manual';
  manualInput?: number;
  manualOutput?: number;
  inputVolumeRef?: React.RefObject<number>;
  outputVolumeRef?: React.RefObject<number>;
  getInputVolume?: () => number;
  getOutputVolume?: () => number;
  className?: string;
}

const vertexShader = `
uniform float uTime;
uniform float uNoiseScale;
uniform float uDisplacement;
uniform float uVolume;

varying vec3 vNormal;
varying vec3 vPosition;
varying float vDisplacement;
varying vec3 vViewPosition;

void main() {
  vNormal = normalize(normalMatrix * normal);
  vPosition = position;

  // Organic 3D wave deformation (100% GPU safe, zero NaN risk)
  float w1 = sin(position.x * uNoiseScale * 2.2 + uTime * 1.8);
  float w2 = cos(position.y * uNoiseScale * 2.2 + uTime * 1.5);
  float w3 = sin(position.z * uNoiseScale * 2.2 + uTime * 1.2);
  
  float displacement = (w1 + w2 + w3) * 0.333 * (uDisplacement + uVolume * 0.3);
  vDisplacement = displacement;

  vec3 newPos = position + normal * displacement;
  vec4 mvPosition = modelViewMatrix * vec4(newPos, 1.0);
  vViewPosition = -mvPosition.xyz;

  gl_Position = projectionMatrix * mvPosition;
}
`;

const fragmentShader = `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uTime;
uniform float uVolume;

varying vec3 vNormal;
varying vec3 vPosition;
varying float vDisplacement;
varying vec3 vViewPosition;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(vViewPosition);

  float NdotV = max(dot(normal, viewDir), 0.0);
  float fresnel = pow(1.0 - NdotV, 2.2);

  // Gradient color mixing
  float mixFactor = clamp((vDisplacement + 0.25) * 1.6 + (vPosition.y + 0.5) * 0.5, 0.0, 1.0);
  vec3 baseColor = mix(uColorA, uColorB, mixFactor);

  // Intense glowing rim highlight & inner soundwave volume pulse
  vec3 glow = mix(baseColor, vec3(0.65, 0.9, 1.0), fresnel * 0.7);
  glow += vec3(0.2, 0.55, 1.0) * (uVolume * 0.55);

  // Spherical alpha falloff: 1.0 inside sphere, 0.0 outside
  float alpha = smoothstep(0.0, 0.12, NdotV) * 0.92 + fresnel * 0.08;

  gl_FragColor = vec4(glow, alpha);
}
`;

export function Orb({
  colors = ['#38bdf8', '#1d4ed8'],
  colorsRef,
  seed = 42,
  agentState = null,
  volumeMode = 'auto',
  manualInput = 0,
  manualOutput = 0,
  inputVolumeRef,
  outputVolumeRef,
  getInputVolume,
  getOutputVolume,
  className = '',
}: OrbProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef({
    colors,
    colorsRef,
    seed,
    agentState,
    volumeMode,
    manualInput,
    manualOutput,
    inputVolumeRef,
    outputVolumeRef,
    getInputVolume,
    getOutputVolume,
  });

  useEffect(() => {
    propsRef.current = {
      colors,
      colorsRef,
      seed,
      agentState,
      volumeMode,
      manualInput,
      manualOutput,
      inputVolumeRef,
      outputVolumeRef,
      getInputVolume,
      getOutputVolume,
    };
  }, [
    colors,
    colorsRef,
    seed,
    agentState,
    volumeMode,
    manualInput,
    manualOutput,
    inputVolumeRef,
    outputVolumeRef,
    getInputVolume,
    getOutputVolume,
  ]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = 220;
    const height = 220;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, 3.4);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0); // 100% TRANSPARENT CANVAS BACKGROUND
    container.appendChild(renderer.domElement);

    // 2. Main Outer Deforming Sphere
    const geometry = new THREE.SphereGeometry(0.7, 64, 64);
    const initialColors = propsRef.current.colors;
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uNoiseScale: { value: 1.5 },
        uDisplacement: { value: 0.1 },
        uVolume: { value: 0 },
        uColorA: { value: new THREE.Color(initialColors[0]) },
        uColorB: { value: new THREE.Color(initialColors[1]) },
      },
      transparent: true,
      depthWrite: false,
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // 3. Inner Glowing Core Sphere
    const coreGeometry = new THREE.SphereGeometry(0.32, 32, 32);
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#38bdf8'),
      transparent: true,
      opacity: 0.8,
    });
    const coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
    scene.add(coreMesh);

    // 4. Point Lights inside scene for ambient sheen
    const light1 = new THREE.PointLight('#38bdf8', 2, 10);
    light1.position.set(2, 2, 2);
    scene.add(light1);

    const light2 = new THREE.PointLight('#6366f1', 1.5, 10);
    light2.position.set(-2, -2, 1);
    scene.add(light2);

    // 5. Animation Loop
    let animationFrameId: number;
    let lastTime = performance.now();

    const animate = (currentTime: number) => {
      animationFrameId = requestAnimationFrame(animate);

      const delta = (currentTime - lastTime) / 1000;
      lastTime = currentTime;

      const p = propsRef.current;
      const state = p.agentState;

      material.uniforms.uTime.value += delta;

      // Calculate Volume
      let vol = 0;
      if (p.volumeMode === 'manual') {
        vol = state === 'talking' ? p.manualOutput : p.manualInput;
      } else {
        if (p.getInputVolume && state === 'listening') {
          vol = p.getInputVolume();
        } else if (p.getOutputVolume && state === 'talking') {
          vol = p.getOutputVolume();
        } else if (p.inputVolumeRef?.current !== undefined && state === 'listening') {
          vol = p.inputVolumeRef.current;
        } else if (p.outputVolumeRef?.current !== undefined && state === 'talking') {
          vol = p.outputVolumeRef.current;
        } else {
          // Auto simulation
          if (state === 'talking') {
            vol = 0.4 + Math.sin(currentTime * 0.008) * 0.25;
          } else if (state === 'listening') {
            vol = 0.3 + Math.cos(currentTime * 0.004) * 0.15;
          } else if (state === 'thinking') {
            vol = 0.2;
          }
        }
      }

      material.uniforms.uVolume.value = THREE.MathUtils.lerp(
        material.uniforms.uVolume.value,
        vol,
        0.1
      );

      // Target params based on agent state
      let targetDisplacement = 0.08;
      let targetNoiseScale = 1.4;
      let rotSpeed = 0.4;

      if (state === 'thinking') {
        targetDisplacement = 0.14;
        targetNoiseScale = 2.4;
        rotSpeed = 1.4;
      } else if (state === 'listening') {
        targetDisplacement = 0.12 + vol * 0.15;
        targetNoiseScale = 1.6;
        rotSpeed = 0.6;
      } else if (state === 'talking') {
        targetDisplacement = 0.16 + vol * 0.25;
        targetNoiseScale = 2.0;
        rotSpeed = 0.9;
      }

      material.uniforms.uDisplacement.value = THREE.MathUtils.lerp(
        material.uniforms.uDisplacement.value,
        targetDisplacement,
        0.08
      );
      material.uniforms.uNoiseScale.value = THREE.MathUtils.lerp(
        material.uniforms.uNoiseScale.value,
        targetNoiseScale,
        0.08
      );

      // Dynamic Colors
      const activeColors = p.colorsRef?.current || p.colors;
      material.uniforms.uColorA.value.set(activeColors[0]);
      material.uniforms.uColorB.value.set(activeColors[1]);

      // Inner Core Pulse
      const coreScale = 1 + vol * 0.3 + Math.sin(currentTime * 0.004) * 0.04;
      coreMesh.scale.set(coreScale, coreScale, coreScale);

      // Rotate mesh
      mesh.rotation.y += delta * rotSpeed * 0.6;
      mesh.rotation.x += delta * rotSpeed * 0.3;

      renderer.render(scene, camera);
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrameId);
      geometry.dispose();
      material.dispose();
      coreGeometry.dispose();
      coreMaterial.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [seed]);

  return (
    <div
      ref={containerRef}
      className={`relative w-[220px] h-[220px] mx-auto flex items-center justify-center pointer-events-none ${className}`}
      style={{ width: '220px', height: '220px', margin: '0 auto' }}
    />
  );
}
