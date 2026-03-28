import React, { useEffect, useRef, useState } from 'react';
import { useMotionValue, useSpring } from 'framer-motion';

const VW = 800;
const VH = 130;
const REVEAL_RADIUS = 230;

interface TextHoverEffectProps {
  text: string;
  fontSize?: number;
}

export const TextHoverEffect: React.FC<TextHoverEffectProps> = ({
  text,
  fontSize = 96,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const gradRef = useRef<SVGRadialGradientElement>(null);
  const [hovered, setHovered] = useState(false);

  const rawX = useMotionValue(VW / 2);
  const rawY = useMotionValue(VH / 2);
  const springX = useSpring(rawX, { stiffness: 55, damping: 16 });
  const springY = useSpring(rawY, { stiffness: 55, damping: 16 });

  useEffect(() => {
    const unsubX = springX.on('change', (v) => {
      gradRef.current?.setAttribute('cx', String(v));
    });
    const unsubY = springY.on('change', (v) => {
      gradRef.current?.setAttribute('cy', String(v));
    });
    return () => {
      unsubX();
      unsubY();
    };
  }, [springX, springY]);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const { left, top, width, height } = svgRef.current.getBoundingClientRect();
    rawX.set(((e.clientX - left) / width) * VW);
    rawY.set(((e.clientY - top) / height) * VH);
  };

  const handleMouseLeave = () => {
    setHovered(false);
    rawX.set(VW / 2);
    rawY.set(VH / 2);
  };

  const textProps = {
    x: '50%',
    y: '52%',
    textAnchor: 'middle' as const,
    dominantBaseline: 'middle' as const,
    fill: 'none',
    strokeWidth: '0.9',
    fontSize,
    fontWeight: 900,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    letterSpacing: -4,
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VW} ${VH}`}
      width="100%"
      xmlns="http://www.w3.org/2000/svg"
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={handleMouseLeave}
      className="select-none"
      style={{ overflow: 'visible', cursor: 'default' }}
      aria-label={text}
    >
      <defs>
        <style>{`
          @keyframes fl-stop-shift-1 {
            0%   { stop-color: #0090FF; }
            33%  { stop-color: #FFC20E; }
            66%  { stop-color: #FF8000; }
            100% { stop-color: #0090FF; }
          }
          @keyframes fl-stop-shift-2 {
            0%   { stop-color: #FFC20E; }
            33%  { stop-color: #FF8000; }
            66%  { stop-color: #0090FF; }
            100% { stop-color: #FFC20E; }
          }
          @keyframes fl-stop-shift-3 {
            0%   { stop-color: #FF8000; }
            33%  { stop-color: #0090FF; }
            66%  { stop-color: #FFC20E; }
            100% { stop-color: #FF8000; }
          }
          .fl-s1 { animation: fl-stop-shift-1 4s linear infinite; }
          .fl-s2 { animation: fl-stop-shift-2 4s linear infinite; }
          .fl-s3 { animation: fl-stop-shift-3 4s linear infinite; }
        `}</style>

        {/* Dynamic gradient — colors always cycle */}
        <linearGradient id="fl-grad-main" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   className="fl-s1" />
          <stop offset="50%"  className="fl-s2" />
          <stop offset="100%" className="fl-s3" />
        </linearGradient>

        {/* Radial mask that follows the cursor */}
        <radialGradient
          ref={gradRef}
          id="fl-cursor-mask-grad"
          gradientUnits="userSpaceOnUse"
          cx={VW / 2}
          cy={VH / 2}
          r={REVEAL_RADIUS}
        >
          <stop offset="0%"   stopColor="white" />
          <stop offset="100%" stopColor="black" />
        </radialGradient>

        <mask id="fl-cursor-mask">
          <rect x="-20" y="-20" width={VW + 40} height={VH + 40} fill="url(#fl-cursor-mask-grad)" />
        </mask>
      </defs>

      {/* Layer 1 — dim ghost outline (always visible) */}
      <text {...textProps} stroke="rgba(0,144,255,0.15)">
        {text}
      </text>

      {/* Layer 2 — animated gradient at low opacity (always cycling) */}
      <text {...textProps} stroke="url(#fl-grad-main)" opacity={0.35}>
        {text}
      </text>

      {/* Layer 3 — full-brightness gradient revealed only around the cursor */}
      <text
        {...textProps}
        stroke="url(#fl-grad-main)"
        mask="url(#fl-cursor-mask)"
        style={{ opacity: hovered ? 1 : 0, transition: 'opacity 0.35s ease' }}
      >
        {text}
      </text>
    </svg>
  );
};
