import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface StatusIndicator3DProps {
  status: 'idle' | 'analyzing' | 'sentiment' | 'done';
}

export const StatusIndicator3D: React.FC<StatusIndicator3DProps> = ({ status }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionRef = useRef<THREE.AnimationAction | null>(null);
  const coreRef = useRef<THREE.Mesh | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 10);
    camera.position.z = 2;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(40, 40); // Small size
    containerRef.current.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1);
    scene.add(ambientLight);

    const geo = new THREE.SphereGeometry(0.8, 32, 32);
    const mat = new THREE.MeshStandardMaterial({ 
        color: 0x6366f1, 
        emissive: 0x4f46e5, 
        emissiveIntensity: 1 
    });
    const core = new THREE.Mesh(geo, mat);
    scene.add(core);
    coreRef.current = core;

    // Animation Clip
    const times = [0, 1, 2];
    const scaleValues = [1, 1.2, 1];
    const scaleTrack = new THREE.VectorKeyframeTrack('.scale', times, [1,1,1, 1.2,1.2,1.2, 1,1,1]);
    const clip = new THREE.AnimationClip('pulse', 2, [scaleTrack]);

    const mixer = new THREE.AnimationMixer(core);
    mixerRef.current = mixer;
    const action = mixer.clipAction(clip);
    action.play();
    actionRef.current = action;

    const clock = new THREE.Clock();
    const animate = () => {
      const delta = clock.getDelta();
      mixer.update(delta);
      core.rotation.y += delta;
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };
    animate();

    return () => {
      if (containerRef.current) containerRef.current.removeChild(renderer.domElement);
      geo.dispose();
      mat.dispose();
      renderer.dispose();
    };
  }, []);

  // Update animation based on status
  useEffect(() => {
    if (!actionRef.current || !coreRef.current) return;

    const mat = coreRef.current.material as THREE.MeshStandardMaterial;

    switch (status) {
      case 'analyzing':
      case 'sentiment':
        actionRef.current.timeScale = 3; // Faster pulse
        mat.color.set(0xec4899); // Pink
        mat.emissive.set(0xec4899);
        break;
      case 'done':
        actionRef.current.timeScale = 1;
        mat.color.set(0x10b981); // Emerald
        mat.emissive.set(0x10b981);
        break;
      default:
        actionRef.current.timeScale = 0.5;
        mat.color.set(0x6366f1); // Indigo
        mat.emissive.set(0x4f46e5);
    }
  }, [status]);

  return <div ref={containerRef} className="w-10 h-10 flex items-center justify-center overflow-hidden rounded-full shadow-lg" />;
};
