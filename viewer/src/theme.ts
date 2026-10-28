// Graphite & ice: shared colours for the interface, map and entrance.
const GRAPHITE = {
  id: "graphite", name: "Graphite & ice", scheme: "dark" as const,
  background: "#14171b", surface: "#20242a", raised: "#282e36",
  ink: "#f1f3f6", secondary: "#bcc5d0", muted: "#929fac", faint: "#748391",
  accent: "#aacfe9", noSales: "#474c54",
  ramp: ["#35556e", "#41657f", "#4e7691", "#5e89a4", "#709cb6", "#85afc6", "#9dc3d5", "#b9d8e4", "#dcedf3"],
};

export function rgba(hex: string, alpha = 255): [number, number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), alpha];
}

const root = document.documentElement;
root.dataset.palette = GRAPHITE.id;
root.style.colorScheme = GRAPHITE.scheme;
const vars = {
  "--background": GRAPHITE.background, "--surface": GRAPHITE.surface, "--surface-raised": GRAPHITE.raised,
  "--ink": GRAPHITE.ink, "--ink-2": GRAPHITE.secondary, "--ink-muted": GRAPHITE.muted, "--ink-faint": GRAPHITE.faint,
  "--accent": GRAPHITE.accent, "--hairline": `color-mix(in srgb, ${GRAPHITE.ink} 13%, transparent)`,
  "--shadow": "#000000",
};
for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value);

// Retire comparison preferences and links while preserving the shared view.
try { localStorage.removeItem("everyblock-palette"); } catch { /* optional preference */ }
const url = new URL(location.href);
if (url.searchParams.has("palette")) {
  url.searchParams.delete("palette");
  history.replaceState(null, "", url);
}

export function getTheme() { return GRAPHITE; }
export function getAtlasStyle() {
  return "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json";
}
