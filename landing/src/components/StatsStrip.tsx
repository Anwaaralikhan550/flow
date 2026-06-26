"use client";

import { useEffect, useRef, useState } from "react";

type StatItem = {
  value: number;
  suffix: string;
  label: string;
  accent: string;
  tint: string;
  decimals?: number;
};

const stats: StatItem[] = [
  {
    value: 11,
    suffix: "K+",
    label: "Active creators",
    accent: "linear-gradient(135deg, #7dd3fc 0%, #93c5fd 100%)",
    tint: "rgba(125, 211, 252, 0.075)",
  },
  {
    value: 2.7,
    suffix: "M",
    label: "Generations",
    accent: "linear-gradient(135deg, #c4b5fd 0%, #f0abfc 100%)",
    tint: "rgba(196, 181, 253, 0.075)",
    decimals: 1,
  },
  {
    value: 99,
    suffix: "%",
    label: "Uptime",
    accent: "linear-gradient(135deg, #86efac 0%, #67e8f9 100%)",
    tint: "rgba(134, 239, 172, 0.07)",
  },
  {
    value: 2,
    suffix: "min",
    label: "Avg. time",
    accent: "linear-gradient(135deg, #fde68a 0%, #f9a8d4 100%)",
    tint: "rgba(253, 230, 138, 0.07)",
  },
];

function easeOutCubic(progress: number) {
  return 1 - Math.pow(1 - progress, 3);
}

function AnimatedStat({ value, suffix, label, accent, tint, decimals = 0 }: StatItem) {
  const ref = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const [currentValue, setCurrentValue] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return undefined;
    }

    const stopAnimation = () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };

    const startAnimation = () => {
      stopAnimation();
      setCurrentValue(0);

      const startedAt = performance.now();
      const duration = 1200;

      const tick = (timestamp: number) => {
        const elapsed = timestamp - startedAt;
        const progress = Math.min(elapsed / duration, 1);
        setCurrentValue(value * easeOutCubic(progress));

        if (progress < 1) {
          frameRef.current = window.requestAnimationFrame(tick);
        }
      };

      frameRef.current = window.requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          startAnimation();
          return;
        }

        stopAnimation();
        setCurrentValue(0);
      },
      { threshold: 0.45 },
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
      stopAnimation();
    };
  }, [value]);

  return (
    <div
      ref={ref}
      className="group min-w-0 rounded-lg border border-white/10 bg-white/[0.035] px-4 py-6 text-center shadow-[0_18px_70px_rgba(0,0,0,0.22)] backdrop-blur-sm transition hover:-translate-y-1 hover:border-cyan-300/35 hover:bg-cyan-300/[0.055]"
      style={{ background: `linear-gradient(180deg, ${tint}, rgba(255,255,255,0.025))` }}
    >
      <div className="mx-auto mb-4 h-1 w-14 rounded-full opacity-80 transition group-hover:w-20" style={{ background: accent }} />
      <div
        className="bg-clip-text text-[clamp(2.8rem,5.2vw,4.8rem)] font-black leading-none tracking-[-0.055em] text-transparent"
        style={{ backgroundImage: accent }}
      >
        {decimals > 0 ? currentValue.toFixed(decimals) : Math.round(currentValue)}
        <span className="tracking-[-0.05em]">{suffix}</span>
      </div>
      <p className="mt-4 text-[0.64rem] font-bold uppercase tracking-[0.26em] text-white/48 transition group-hover:text-white/75 md:text-xs">
        {label}
      </p>
    </div>
  );
}

export function StatsStrip() {
  return (
    <section className="relative overflow-hidden border-y border-white/10 bg-[#05050b] py-12 md:py-16">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.13),transparent_34rem)]" />
      <div className="section-shell relative">
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 md:gap-4">
          {stats.map((stat, index) => (
            <div key={stat.label} className="relative">
              {index > 0 ? (
                <span
                  className="absolute -left-2 top-1/2 hidden size-1 -translate-y-1/2 rounded-full bg-cyan-300/80 shadow-[0_0_16px_rgba(34,211,238,0.9)] md:block"
                  aria-hidden="true"
                />
              ) : null}
              <AnimatedStat {...stat} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
