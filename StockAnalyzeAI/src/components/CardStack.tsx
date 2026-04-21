import { useState, useEffect } from 'react';
import { motion, AnimatePresence, PanInfo } from 'motion/react';
import { cn } from '../lib/utils';

interface CardStackProps<T> {
  items: T[];
  renderCard: (item: T) => React.ReactNode;
  onSwipeLeft?: (item: T) => void;
  onSwipeRight?: (item: T) => void;
  className?: string;
}

export default function CardStack<T extends { id: string | number }>({
  items,
  renderCard,
  onSwipeLeft,
  onSwipeRight,
  className,
}: CardStackProps<T>) {
  const [index, setIndex] = useState(0);

  // Reset index when items change to avoid out-of-bounds
  useEffect(() => {
    if (index >= items.length) {
      requestAnimationFrame(() => setIndex(0));
    }
  }, [items.length, index]);

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const threshold = 100;
    if (info.offset.x > threshold) {
      onSwipeRight?.(items[index]);
      next();
    } else if (info.offset.x < -threshold) {
      onSwipeLeft?.(items[index]);
      next();
    }
  };

  const next = () => {
    setIndex((prev) => (prev + 1) % items.length);
  };

  return (
    <div className={cn("relative w-full h-48 md:h-64", className)}>
      <AnimatePresence>
        {items.map((item, i) => {
          if (i < index) return null;
          const isTop = i === index;
          return (
            <motion.div
              key={item.id}
              className="absolute w-full h-full cursor-grab active:scale-[0.98] touch-pan-y"
              style={{
                zIndex: items.length - i,
              }}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{
                scale: isTop ? 1 : 0.95,
                opacity: 1,
                y: isTop ? 0 : 10 * (i - index),
              }}
              exit={{ opacity: 0, x: -100 }}
              drag={isTop ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              onDragEnd={handleDragEnd}
            >
              {renderCard(item)}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
