// Small, dependency-free inline icons. Stroke color is inherited from the
// parent. Kept deliberately simple so they read well at 14-18 px in the HUD.
const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: 'false',
};

export function OrbitIcon({ size = 38 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="orbit-glow" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="100%" stopColor="#e2703a" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="6.5" fill="url(#orbit-glow)" opacity="0.95" />
      <circle cx="20" cy="20" r="6.5" fill="none" stroke="#e6eef8" strokeOpacity="0.35" />
      <ellipse cx="20" cy="20" rx="17" ry="6.4" transform="rotate(-27 20 20)"
        fill="none" stroke="url(#orbit-glow)" strokeWidth="1.2" opacity="0.9" />
      <circle cx="33.4" cy="12.2" r="2.1" fill="#fbbf24" />
      <circle cx="6.4" cy="27.8" r="1.4" fill="#67e8f9" opacity="0.85" />
    </svg>
  );
}

export function MapIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <path d="m3 6 5-2 8 3 5-2v14l-5 2-8-3-5 2V6Z" />
      <path d="M8 4v14M16 7v14" />
    </svg>
  );
}

export function TerrainIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <path d="m2 18 6-9 4 6 3-4 7 7H2Z" />
      <path d="M15 5h5M19.5 3v4" />
    </svg>
  );
}

export function BookIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v18H6.5A2.5 2.5 0 0 1 4 18.5v-13Z" />
      <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v18h4.5A2.5 2.5 0 0 0 20 18.5v-13Z" />
    </svg>
  );
}

export function PlayIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M8 5.5v13l10-6.5-10-6.5Z" fill="currentColor" />
    </svg>
  );
}

export function LayersIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
    </svg>
  );
}

export function TargetIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" />
    </svg>
  );
}

export function ClockIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

export function AlertIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <path d="M12 3 2.5 20h19L12 3Z" />
      <path d="M12 9v5M12 17.5v.1" />
    </svg>
  );
}

export function CheckIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <path d="m4 12.5 5 5L20 5.5" />
    </svg>
  );
}

export function UndoIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <path d="M9 5 4 10l5 5" />
      <path d="M4 10h9a6 6 0 0 1 0 12h-1" />
    </svg>
  );
}

export function ResetIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3 9" />
      <path d="M3 4v5h5" />
    </svg>
  );
}

export function ChevronIcon({ size = 14, open = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}
      style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .2s ease' }}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function CloseIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export function OrbitSmallIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <circle cx="12" cy="12" r="3.5" />
      <ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(-28 12 12)" />
      <circle cx="20" cy="7" r="1.4" fill="currentColor" />
    </svg>
  );
}

export function SwapIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <path d="m7 16-4-4 4-4" />
      <path d="M3 12h18" />
      <path d="m17 8 4 4-4 4" />
    </svg>
  );
}

export function ArrowRightIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

export function InfoIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h.01M11 12h1v4h1" />
    </svg>
  );
}
