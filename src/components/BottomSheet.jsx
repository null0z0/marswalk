import { useEffect, useRef } from 'react';

export default function BottomSheet({ open, onClose, title, children, ariaLabel = 'Details sheet' }) {
  const startY = useRef(0);
  const currentY = useRef(0);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const onTouchStart = (e) => {
    startY.current = e.touches[0].clientY;
    currentY.current = e.touches[0].clientY;
  };

  const onTouchMove = (e) => {
    currentY.current = e.touches[0].clientY;
  };

  const onTouchEnd = () => {
    if (currentY.current - startY.current > 70) {
      onClose();
    }
  };

  return (
    <div className="bottom-sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="bottom-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : ariaLabel}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="bottom-sheet-drag-handle" aria-hidden="true" />
        <div className="bottom-sheet-header">
          <div className="bottom-sheet-title">{title}</div>
          <button
            type="button"
            className="bottom-sheet-close"
            onClick={onClose}
            aria-label="Close sheet"
          >
            ✕
          </button>
        </div>
        <div className="bottom-sheet-content">
          {children}
        </div>
      </div>
    </div>
  );
}
