"use client";

import { useEffect, useRef, useState } from "react";
import { animate } from "framer-motion";

/**
 * Animated count-up/down number. When `value` changes, tweens smoothly
 * from the old value to the new one. Used for all live header stats and
 * the per-spot click count in the ruler card.
 */
export default function AnimatedNumber({
  value,
  format,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const prevRef = useRef(value);
  const [display, setDisplay] = useState(() => (format ? format(value) : String(value)));

  useEffect(() => {
    const from = prevRef.current;
    prevRef.current = value;

    if (from === value) {
      setDisplay(format ? format(value) : String(value));
      return;
    }

    const controls = animate(from, value, {
      duration: 0.5,
      ease: "easeOut",
      onUpdate(v) {
        setDisplay(format ? format(Math.round(v)) : String(Math.round(v)));
      },
    });

    return () => controls.stop();
  }, [value, format]);

  return (
    <span ref={ref} className={className}>
      {display}
    </span>
  );
}
