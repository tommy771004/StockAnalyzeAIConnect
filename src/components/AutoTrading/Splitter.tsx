/**
 * src/components/AutoTrading/Splitter.tsx
 *
 * 垂直可拖曳分隔線：用於調整左主面板與右側欄寬度。
 * - 滑鼠左鍵與觸控皆可拖曳
 * - 支援鍵盤左右鍵微調 (8px) 與 Shift+左右 (32px)
 * - onResize 回傳像素位移；由父層套用上下界限與持久化。
 */
import React from 'react';

interface Props {
  onResize: (deltaX: number) => void;
  ariaLabel?: string;
}

export function Splitter({ onResize, ariaLabel = 'Resize sidebar' }: Props) {
  const draggingRef = React.useRef(false);
  const lastXRef = React.useRef(0);
  const [isDragging, setIsDragging] = React.useState(false);

  const begin = React.useCallback((clientX: number) => {
    draggingRef.current = true;
    lastXRef.current = clientX;
    setIsDragging(true);
    document.body.dataset.autotradingResizing = 'true';
  }, []);

  const end = React.useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setIsDragging(false);
    delete document.body.dataset.autotradingResizing;
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    begin(e.clientX);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    begin(touch.clientX);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const step = e.shiftKey ? 32 : 8;
    onResize(e.key === 'ArrowRight' ? step : -step);
  };

  React.useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const delta = e.clientX - lastXRef.current;
      lastXRef.current = e.clientX;
      if (delta !== 0) onResize(delta);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!draggingRef.current) return;
      const touch = e.touches[0];
      if (!touch) return;
      const delta = touch.clientX - lastXRef.current;
      lastXRef.current = touch.clientX;
      if (delta !== 0) onResize(delta);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', end);
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', end);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', end);
      window.removeEventListener('touchcancel', end);
      delete document.body.dataset.autotradingResizing;
    };
  }, [end, onResize]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      tabIndex={0}
      className="autotrading-splitter hidden lg:block"
      data-dragging={isDragging || undefined}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onKeyDown={handleKeyDown}
    />
  );
}
