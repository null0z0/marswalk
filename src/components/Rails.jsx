// Reusable rail components shared by the left ("What's on the map") and right
// ("What to do") side rails, and by the mobile bottom sheet.
//
// Persistence: rail UI preferences (section open state, collapse) live under
// marswalk-ui-v1, separate from marswalk-plan-v1. All localStorage access is
// wrapped in try/catch; on failure we fall back to defaults.
import { useCallback, useEffect, useState } from 'react';
import { ChevronIcon, InfoIcon } from './Icons.jsx';

const UI_STORE_KEY = 'marswalk-ui-v1';

export function readUI(key, def) {
  try {
    const raw = localStorage.getItem(UI_STORE_KEY);
    if (!raw) return def;
    const d = JSON.parse(raw);
    return d && typeof d === 'object' && key in d ? d[key] : def;
  } catch { return def; }
}

export function writeUI(updater) {
  try {
    const raw = localStorage.getItem(UI_STORE_KEY);
    const d = raw ? JSON.parse(raw) : {};
    const next = updater(d);
    localStorage.setItem(UI_STORE_KEY, JSON.stringify(next));
    return next;
  } catch { return updater({}); }
}

// ---- shape badge matching the map markers (shape, not color alone) ----

function PlaceShape({ shape = 'circle', color = '#67e8f9', size = 12 }) {
  const s2 = size / 2;
  const inner = {
    circle: `<circle cx="${s2}" cy="${s2}" r="${s2 - 1}" fill="${color}" fill-opacity="0.9" stroke="#05080f" stroke-width="1"/>`,
    diamond: `<polygon points="${s2},1 ${size - 1},${s2} ${s2},${size - 1} 1,${s2}" fill="${color}" fill-opacity="0.9" stroke="#05080f" stroke-width="1"/>`,
    triangle: `<polygon points="${s2},1 ${size - 1},${size - 1} 1,${size - 1}" fill="${color}" fill-opacity="0.9" stroke="#05080f" stroke-width="1"/>`,
    square: `<rect x="1" y="1" width="${size - 2}" height="${size - 2}" fill="${color}" fill-opacity="0.9" stroke="#05080f" stroke-width="1"/>`,
    pentagon: `<polygon points="${s2},1 ${size - 1},${size * 0.62} ${size * 0.81},${size - 1} ${size * 0.19},${size - 1} 0,${size * 0.62}" fill="${color}" fill-opacity="0.9" stroke="#05080f" stroke-width="1"/>`,
  }[shape];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: inner }} />
  );
}

// ---- RailSection: accordion built on .disclosure / native <details> ----
// `open` is controlled from React state and synced via onToggle so saved state
// and the DOM cannot drift. Toggles with click, Enter and Space.

export function RailSection({ id, title, Icon, summary, defaultOpen = false, className = '', children }) {
  const [open, setOpen] = useState(() => readUI(`rail.section.${id}`, defaultOpen));

  useEffect(() => {
    writeUI(d => { d[`rail.section.${id}`] = open; return d; });
  }, [id, open]);

  const toggle = useCallback(() => setOpen(o => !o), []);
  const onToggle = useCallback(e => setOpen(!!e.target.open), []);
  const onKeyDown = useCallback((e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(o => !o);
    }
  }, []);

  return (
    <details
      className={`disclosure rail-section ${className}`}
      open={open}
      onToggle={onToggle}
      aria-labelledby={`rail-section-${id}-title`}
    >
      <summary className="rail-section-head" onClick={toggle} onKeyDown={onKeyDown}>
        <div className="rail-section-head-row">
          {Icon && <Icon size={13} aria-hidden="true" />}
          <span id={`rail-section-${id}-title`} className="rail-section-title">{title}</span>
          {summary && <span className="rail-section-summary">{summary}</span>}
        </div>
        <ChevronIcon size={14} open={open} />
      </summary>
      <div className="rail-section-body">{children}</div>
    </details>
  );
}

// ---- PlaceRow: compact left-rail place row ----
// Clicking the row flies to / selects the place. A nested disclosure expands
// the row to show objective, photo (16:9, captioned), caveats and conditions.

export function PlaceRow({ place, selected = false, onClick, shape = 'circle', color = '#67e8f9', expanded = false, onExpandToggle }) {
  const short = place.short || place.name.split('(')[0].trim() || place.id;
  const unit = place.unit ? place.unit.split('(')[0].trim() : null;

  return (
    <div className="rail-place-row" onClick={onClick} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick && onClick(); } }} role="button" tabIndex={0} aria-label={`Place ${short}`}>
      <div className="rail-place-body">
        <PlaceShape shape={shape} color={color} size={12} />
        <div className="rail-place-text">
          <span className="rail-place-name">{short}</span>
          {unit && <span className="rail-caption">· {unit}</span>}
        </div>
        <span className="rail-place-dot" aria-hidden="true" />
      </div>
      {selected && <span className="rail-place-selected" aria-label="Selected">●</span>}
    </div>
  );
}

// ---- StatChip: a stat readout (value + label + unit), min 36px ----

export function StatChip({ label, value, unit, variant = 'cyan' }) {
  const accent = { cyan: 'var(--cyan-strong)', green: 'var(--green)', amber: 'var(--amber)', mars: 'var(--mars)' }[variant] || 'var(--cyan-strong)';
  return (
    <span className="stat-chip" style={{ '--stat-accent': accent }}>
      <span className="stat-chip-value" aria-label={`${label} ${value} ${unit || ''}`}>{value}</span>
      <span className="stat-chip-label">{label}</span>
      {unit && <span className="rail-caption stat-chip-unit">{unit}</span>}
    </span>
  );
}

// ---- SegmentedControl: ≥36px buttons, visible focus rings, UI font ----

export function SegmentedControl({ options, value, onChange, ariaLabel }) {
  return (
    <div className="segmented rail-segmented" role="group" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`flex-1 ${opt.value === value ? 'is-active' : ''}`}
          aria-pressed={opt.value === value}
          onClick={() => onChange(opt.value)}
        >
          {opt.icon && <opt.icon size={13} aria-hidden="true" />}
          <span className="segmented-label">{opt.label}</span>
        </button>
      ))}
    </div>
  );
}

// ---- InfoPopover: click an info icon to reveal a block of prose ----

export function InfoPopover({ children, content, title }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen(o => !o), []);
  return (
    <div className="info-popover">
      <button type="button" className="info-popover-trigger" onClick={toggle} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o); } }} aria-expanded={open} aria-label={title || 'More info'}>
        <InfoIcon size={13} />
      </button>
      {open && (
        <div className="info-popover-body">
          {title && <div className="rail-caption info-popover-title">{title}</div>}
          <div className="rail-body info-popover-content">{content}</div>
        </div>
      )}
    </div>
  );
}

// ---- EmptyState: "pick two places" style empty state with mini illustration ----

export function EmptyState({ title, description, illustration }) {
  return (
    <div className="empty-state">
      {illustration}
      <div className="empty-state-copy">
        <div className="rail-section-title empty-state-title">{title}</div>
        {description && <div className="rail-caption empty-state-desc">{description}</div>}
      </div>
    </div>
  );
}
