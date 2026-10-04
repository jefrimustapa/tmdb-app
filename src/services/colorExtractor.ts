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
          if (lum < 25 || lum > 235) continue;

          // Saturation weight: strongly favor vibrant cinematic hues over dull neutrals/grays
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const saturation = max === 0 ? 0 : (max - min) / max;

          // Exponential saturation weighting (vivid colors dominate over muddy skin/background tones)
          const weight = saturation > 0.20 ? Math.pow(saturation, 3) * 100 : 0.05;

          rAcc += r * weight;
          gAcc += g * weight;
          bAcc += b * weight;
          totalWeight += weight;
        }

        if (totalWeight === 0) {
          return finish(null);
        }

        const r = Math.round(rAcc / totalWeight);
        const g = Math.round(gAcc / totalWeight);
        const b = Math.round(bAcc / totalWeight);

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

    // Append ?cors=1 to prevent Chromium from reusing non-CORS cached images from DOM <img> tags
    const corsSafeUrl = imageUrl.includes('?') ? `${imageUrl}&cors=1` : `${imageUrl}?cors=1`;
    img.src = corsSafeUrl;
  });
}

/**
 * Returns a React CSS style object with an adaptive ambient background gradient.
 * - Under hero banner (0% - 55vh): Deep black (#050508) matching the hero banner bottom tint seamlessly.
 * - After hero banner down to bottom (55vh -> 100%): Transitions smoothly from dark (#050508)
 *   to a rich translucent ambient tint, making the rails glow with the dominant color.
 */
export function getAdaptiveBackgroundStyle(
  color: DominantColor | null,
  accentOpacity = 0.70
): React.CSSProperties {
  if (!color) {
    return {
      backgroundColor: '#050508',
      transition: 'background 0.8s cubic-bezier(0.16, 1, 0.3, 1)'
    };
  }

  const { r, g, b } = color;
  const oPeak = accentOpacity.toFixed(3);
  const oMid = (accentOpacity * 0.65).toFixed(3);
  const oSubtle = (accentOpacity * 0.35).toFixed(3);

  return {
    backgroundImage: `linear-gradient(180deg, #050508 0%, #050508 105vh, rgba(${r}, ${g}, ${b}, ${oSubtle}) 135vh, rgba(${r}, ${g}, ${b}, ${oMid}) 175vh, rgba(${r}, ${g}, ${b}, ${oPeak}) 100%)`,
    backgroundColor: '#050508',
    transition: 'background 0.8s cubic-bezier(0.16, 1, 0.3, 1)'
  };
}
