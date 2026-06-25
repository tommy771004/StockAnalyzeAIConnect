import React from 'react';

/**
 * QuantumAnimation — auth page backdrop.
 * CSS-only: drops the three.js dependency for this use-case.
 * ponytail: was a full Three.js scene (2 meshes, 2 mixers, 200 particles) for a fixed z-0 backdrop.
 */
export const QuantumAnimation: React.FC = () => (
  <div
    className="fixed inset-0 pointer-events-none z-0"
    style={{ opacity: 0.6 }}
    aria-hidden="true"
  >
    <style>{`
      @keyframes qt-spin  { to { transform: rotate(360deg); } }
      @keyframes qt-pulse { 0%,100% { opacity:.15; transform:scale(1); } 50% { opacity:.4; transform:scale(1.15); } }
      @keyframes qt-drift { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-12px); } }
    `}</style>

    {/* Outer wireframe ring */}
    <div style={{
      position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center',
    }}>
      <div style={{
        width:320, height:320, borderRadius:'50%',
        border:'1px solid rgba(99,102,241,.35)',
        animation:'qt-spin 20s linear infinite',
      }} />
    </div>

    {/* Mid ring (counter-rotate) */}
    <div style={{
      position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center',
    }}>
      <div style={{
        width:200, height:200, borderRadius:'50%',
        border:'1px solid rgba(129,140,248,.25)',
        animation:'qt-spin 12s linear infinite reverse',
      }} />
    </div>

    {/* Core glow */}
    <div style={{
      position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center',
    }}>
      <div style={{
        width:80, height:80, borderRadius:'50%',
        background:'radial-gradient(circle, rgba(99,102,241,.6) 0%, transparent 70%)',
        animation:'qt-pulse 4s ease-in-out infinite, qt-drift 6s ease-in-out infinite',
      }} />
    </div>
  </div>
);
