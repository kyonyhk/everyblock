import { getTheme } from "./theme";

// Sequential Graphite & ice rank scale, ordered from low to high prices.
export const RAMP = [...getTheme().ramp];
export const hexToRgb = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16),
];
export const LUT: [number, number, number][] = [];
function rebuild() {
  LUT.length = 0;
  for (let i = 0; i < 256; i++) {
    const t = (i / 255) * (RAMP.length - 1);
    const a = hexToRgb(RAMP[Math.floor(t)]);
    const b = hexToRgb(RAMP[Math.min(RAMP.length - 1, Math.floor(t) + 1)]);
    const f = t - Math.floor(t);
    LUT.push(a.map((v, k) => Math.round(v + (b[k] - v) * f)) as [number, number, number]);
  }
}
rebuild();
export const rampCss = (t: number): string => `rgb(${LUT[Math.max(0, Math.min(255, Math.round(t * 255)))].join(",")})`;
