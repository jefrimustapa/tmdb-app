import React, { useEffect, useRef } from 'react';

interface PerformanceHudProps {
  className?: string;
}

export const PerformanceHud: React.FC<PerformanceHudProps> = ({ className = '' }) => {
  const textRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let timer: any = null;

    const updateStats = () => {
      let statsText = '';
      try {
        if (typeof (window as any).AndroidBridge?.getPerformanceStats === 'function') {
          const raw = (window as any).AndroidBridge.getPerformanceStats();
          const data = JSON.parse(raw);
          if (data && !data.error) {
            const cpu = data.cpuPercent >= 0 ? `${data.cpuPercent}%` : '...';
            const gpu = data.gpuPercent >= 0 
              ? `${data.gpuPercent}%` 
              : (data.gpuMemMb > 0 ? `${data.gpuMemMb}MB` : '0%');
            const pss = data.pssMb ? `${data.pssMb}MB` : '...';
            const heap = data.usedMb ? `${data.usedMb}/${data.totalMb}MB` : '...';
            statsText = `CPU: ${cpu} | GPU: ${gpu} | RAM: ${pss} (Heap: ${heap})`;
          }
        }
      } catch {}

      // Web Fallback if performance.memory is available in Chromium
      if (!statsText) {
        const perf = (performance as any).memory;
        if (perf) {
          const used = Math.round(perf.usedJSHeapSize / (1024 * 1024));
          const total = Math.round(perf.totalJSHeapSize / (1024 * 1024));
          statsText = `JS Heap: ${used}/${total}MB`;
        } else {
          statsText = 'Perf HUD Active';
        }
      }

      if (textRef.current) {
        textRef.current.textContent = statsText;
      }
    };

    updateStats();
    // 3-second interval: completely harmless to video decoders
    timer = setInterval(updateStats, 3000);

    return () => {
      if (timer) clearInterval(timer);
    };
  }, []);

  return (
    <div
      className={`pointer-events-none select-none z-[9999999] px-2 py-0.5 rounded bg-black/20 border border-white/10 text-[9px] sm:text-[10px] font-mono text-emerald-400/90 font-medium tracking-tight ${className}`}
    >
      <span ref={textRef}>Measuring...</span>
    </div>
  );
};
