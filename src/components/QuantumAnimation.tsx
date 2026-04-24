import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

export const QuantumAnimation: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // --- Scene Setup ---
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 5;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    containerRef.current.appendChild(renderer.domElement);

    // --- Lights ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0x6366f1, 2);
    pointLight.position.set(2, 3, 4);
    scene.add(pointLight);

    // --- Quantum Core (Central Sphere) ---
    const geometry = new THREE.IcosahedronGeometry(1.5, 2);
    const material = new THREE.MeshStandardMaterial({
      color: 0x6366f1,
      wireframe: true,
      transparent: true,
      opacity: 0.4,
    });
    const core = new THREE.Mesh(geometry, material);
    scene.add(core);

    // Inner glowing sphere
    const innerGeo = new THREE.IcosahedronGeometry(0.8, 1);
    const innerMat = new THREE.MeshStandardMaterial({
      color: 0x818cf8,
      emissive: 0x4f46e5,
      emissiveIntensity: 2,
    });
    const innerCore = new THREE.Mesh(innerGeo, innerMat);
    scene.add(innerCore);

    // --- Particles ---
    const particlesCount = 200;
    const positions = new Float32Array(particlesCount * 3);
    for (let i = 0; i < particlesCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 10;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 10;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 10;
    }
    const particlesGeo = new THREE.BufferGeometry();
    particlesGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particlesMat = new THREE.PointsMaterial({ color: 0x818cf8, size: 0.05, transparent: true, opacity: 0.8 });
    const particles = new THREE.Points(particlesGeo, particlesMat);
    scene.add(particles);

    // --- Animation System Implementation (AnimationClip, Mixer, Action) ---
    // Specifically following line 31 of SKILL.md
    
    // 1. Create AnimationClip (Container for keyframe data)
    const times = [0, 2, 4]; // seconds
    const opacityValues = [0.2, 0.8, 0.2];
    const scaleValues = [1, 1.2, 1];
    
    const opacityTrack = new THREE.NumberKeyframeTrack(
        '.material.opacity',
        times,
        opacityValues
    );
    
    const scaleTrack = new THREE.VectorKeyframeTrack(
        '.scale',
        times,
        [1, 1, 1, 1.2, 1.2, 1.2, 1, 1, 1]
    );

    const pulseClip = new THREE.AnimationClip('pulse', 4, [opacityTrack, scaleTrack]);

    // Shiver animation for additive blending or mixing
    const shiverTrack = new THREE.VectorKeyframeTrack(
        '.position',
        [0, 0.1, 0.2, 0.3, 0.4],
        [0, 0, 0, 0.05, 0, 0, -0.05, 0, 0, 0, 0.05, 0, 0, 0, 0]
    );
    const shiverClip = new THREE.AnimationClip('shiver', 0.4, [shiverTrack]);

    // 2. Create AnimationMixer (Plays animations)
    const mixer = new THREE.AnimationMixer(core);

    // 3. Create AnimationActions
    const pulseAction = mixer.clipAction(pulseClip);
    const shiverAction = mixer.clipAction(shiverClip);
    
    pulseAction.play();
    shiverAction.play();
    shiverAction.setEffectiveWeight(0.3); // Mix with lower influence
    pulseAction.setEffectiveWeight(1.0);

    // Secondary mixer for internal core
    const innerMixer = new THREE.AnimationMixer(innerCore);
    const innerTimes = [0, 1.5, 3];
    const innerEmissiveValues = [0.5, 3, 0.5];
    const emissiveTrack = new THREE.NumberKeyframeTrack('.material.emissiveIntensity', innerTimes, innerEmissiveValues);
    const glowClip = new THREE.AnimationClip('glow', 3, [emissiveTrack]);
    innerMixer.clipAction(glowClip).play();

    // --- Animation Loop ---
    const clock = new THREE.Clock();

    const animate = () => {
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      // Update mixers
      mixer.update(delta);
      innerMixer.update(delta);

      // Procedural animations (following line 495 of SKILL.md)
      core.rotation.y += delta * 0.2;
      core.rotation.z += delta * 0.1;
      
      innerCore.rotation.y -= delta * 0.4;
      
      // Floating motion
      core.position.y = Math.sin(elapsed * 0.5) * 0.2;
      innerCore.position.y = Math.sin(elapsed * 0.5) * 0.2;

      // Particles rotation
      particles.rotation.y += delta * 0.05;

      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };

    animate();

    // Handle Resize
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
      geometry.dispose();
      material.dispose();
      innerGeo.dispose();
      innerMat.dispose();
      particlesGeo.dispose();
      particlesMat.dispose();
      renderer.dispose();
    };
  }, []);

  return <div ref={containerRef} className="fixed inset-0 pointer-events-none z-0" style={{ opacity: 0.6 }} />;
};
