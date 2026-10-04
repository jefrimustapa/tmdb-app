/**
 * Color Extractor Service
 * Extracts vibrant dominant colors from TMDB backdrops and posters via Offscreen Canvas.
 * Generates smooth, cinematic adaptive background gradients for Home & Details pages.
 */

export interface DominantColor {
  r: number;
  g: number;
  b: number;
  hex: string;
}

const COLOR_CACHE = new Map<string, DominantColor>();

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Extracts the most representative vibrant dominant color from an image URL.
 * Automatically samples a downscaled 32x32 canvas for sub-2ms performance.
 */
export async function extractDominantColor(imageUrl: string | null | undefined): Promise<DominantColor | null> {
  if (!imageUrl || typeof window === 'undefined') return null;

  // 1. Fast Cache Check
  const cached = COLOR_CACHE.get(imageUrl);
  if (cached) return cached;

  // 2. Performance Mode Check: Skip intensive extraction if low-end mode is active
  const isPerfMode = typeof document !== 'undefined' && document.documentElement.getAttribute('data-perf-mode') === 'true';
  if (isPerfMode && COLOR_CACHE.size > 20) {
    return null;
  }

  return new Promise<DominantColor | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';

    let hasResolved = false;
    const finish = (color: DominantColor | null) => {
      if (hasResolved) return;
      hasResolved = true;
      if (color) {
        COLOR_CACHE.set(imageUrl, color);
      }
      resolve(color);
    };

    const timer = setTimeout(() => finish(null), 3000);

    img.onload = () => {
      clearTimeout(timer);
      try {
        const sampleSize = 32;
        const canvas = document.createElement('canvas');
        canvas.width = sampleSize;
        canvas.height = sampleSize;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return finish(null);

        ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
        const imgData = ctx.getImageData(0, 0, sampleSize, sampleSize).data;

        let totalWeight = 0;
        let rAcc = 0;
        let gAcc = 0;
        let bAcc = 0;

        for (let i = 0; i < imgData.length; i += 4) {
          const r = imgData[i];
          const g = imgData[i + 1];
          const b = imgData[i + 2];
          const a = imgData[i + 3];

          if (a < 128) continue; // Skip transparent

          // Luminance check (standard Rec. 709 coefficients)
          const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

          // Ignore extreme blacks (letterboxing/shadows) and blown-out whites/highlights
          if (lum < 20 || lum > 230) continue;

          // Saturation weight: encourage vibrant cinematic hues over dull grays
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const saturation = max === 0 ? 0 : (max - min) / max;

          // Weighting: pixels with rich color get exponentially higher weight
          const weight = 1 + saturation * 3;

          rAcc += r * weight;
          gAcc += g * weight;
          bAcc += b * weight;
          totalWeight += weight;
        }

        if (totalWeight === 0) {
          return finish(null);
        }

        let r = Math.round(rAcc / totalWeight);
        let g = Math.round(gAcc / totalWeight);
        let b = Math.round(bAcc / totalWeight);

        // Clamp brightness to keep the dark cinematic aesthetic
        const finalLum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (finalLum > 160) {
          const scale = 160 / finalLum;
          r = Math.round(r * scale);
          g = Math.round(g * scale);
          b = Math.round(b * scale);
        }

        const dominant: DominantColor = {
          r,
          g,
          b,
          hex: rgbToHex(r, g, b)
        };

        finish(dominant);
      } catch (err) {
        finish(null);
      }
    };

    img.onerror = () => {
      clearTimeout(timer);
      finish(null);
    };

    img.src = imageUrl;
  });
}

/**
 * Returns a React CSS style object with an ambient radial gradient
 * that smoothly flows into the dark base background (#050508).
 */
export function getAdaptiveBackgroundStyle(
  color: DominantColor | null,
  topOpacity = 0.4
): React.CSSProperties {
  if (!color) {
    return {
      backgroundColor: '#050508',
      transition: 'background 0.8s cubic-bezier(0.16, 1, 0.3, 1)'
    };
  }

  const { r, g, b } = color;
  const oTop = topOpacity;
  const oMid = (topOpacity * 0.3).toFixed(3);
  const oLow = (topOpacity * 0.08).toFixed(3);

  return {
    background: `radial-gradient(circle at 50% -5%, rgba(${r}, ${g}, ${b}, ${oTop}) 0%, rgba(${r}, ${g}, ${b}, ${oMid}) 35%, rgba(${r}, ${g}, ${b}, ${oLow}) 60%, #050508 85%)`,
    backgroundColor: '#050508',
    transition: 'background 0.8s cubic-bezier(0.16, 1, 0.3, 1)'
  };
}
