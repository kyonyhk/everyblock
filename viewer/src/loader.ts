// The entrance uses the map's own renderer and real Ang Mo Kio footprints.
// There is no synthetic street, extra WebGL context, or camera cut on entry.
import { SolidPolygonLayer } from "@deck.gl/layers";
import type { MapboxOverlay } from "@deck.gl/mapbox";
import type { Map } from "maplibre-gl";
import neighbourhood from "./intro-neighbourhood.json";
import { getTheme, rgba } from "./theme";

export const INTRO_VIEW = {
  center: [103.8435, 1.3697] as [number, number],
  zoom: 14.8, pitch: 48, bearing: -25,
};

export function startLoader() {
  const el = document.getElementById("loading")!;
  const status = document.getElementById("load-status")!;
  const enter = document.getElementById("intro-enter") as HTMLButtonElement;
  const replay = new URLSearchParams(location.search).get("intro") === "1";
  const shared = !!location.hash;
  let seen = false;
  try { seen = sessionStorage.getItem("everyblock-visited") === "1"; } catch { /* optional preference */ }
  const cinematic = replay || (!seen && !shared);
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.classList.toggle("compact", !cinematic);
  document.body.classList.add("is-loading");
  let raf = 0;
  let stopped = false;
  let ready = false;
  const controls = [...document.querySelectorAll<HTMLElement>(".app-ui"), document.getElementById("map")!];
  controls.forEach(node => node.inert = true);

  const dismiss = () => {
    if (!ready) return;
    el.classList.add("done");
    el.setAttribute("aria-hidden", "true");
    el.inert = true;
    controls.forEach(node => node.inert = false);
    document.body.classList.remove("is-loading");
    try { sessionStorage.setItem("everyblock-visited", "1"); } catch { /* optional preference */ }
    if (replay) document.querySelector<HTMLCanvasElement>("#map canvas")?.focus({ preventScroll: true });
  };
  enter.addEventListener("click", dismiss);
  document.getElementById("load-retry")!.addEventListener("click", () => location.reload());

  return {
    cinematic,
    attach(map: Map, overlay: MapboxOverlay) {
      if (!cinematic) return;
      let start = 0;
      function frame(now: number) {
        if (stopped) return;
        if (!start) start = now;
        const elapsed = (now - start) / 1000;
        overlay.setProps({ layers: [new SolidPolygonLayer({
          id: "intro-neighbourhood",
          data: neighbourhood,
          getPolygon: (b: typeof neighbourhood[number]) => b.footprint,
          extruded: true,
          getElevation: (b: typeof neighbourhood[number], { index }: { index: number }) => {
            const t = reducedMotion ? 1 : Math.max(0, Math.min(1, (elapsed - (index % 9) * 0.055) / 1.1));
            return Math.max(b.floors, 3) * 2.8 * 1.65 * (1 - Math.pow(1 - t, 3));
          },
          getFillColor: (b: typeof neighbourhood[number]) => {
            const ramp = getTheme().ramp;
            return rgba(ramp[b.year < 1985 ? 3 : 6]);
          },
          material: { ambient: 0.65, diffuse: 0.45, shininess: 12, specularColor: [50, 55, 60] },
          updateTriggers: { getElevation: elapsed },
        })] });
        if (!reducedMotion && elapsed < 1.7) raf = requestAnimationFrame(frame);
      }
      if (map.isStyleLoaded()) frame(performance.now());
      else map.once("load", () => frame(performance.now()));
    },
    stopPreview() { stopped = true; cancelAnimationFrame(raf); },
    finish() {
      ready = true;
      status.textContent = "The atlas is ready";
      enter.disabled = false;
      enter.innerHTML = 'Explore the map <span aria-hidden="true">↗</span>';
      // An explicit replay waits for the visitor. Normal visits have no
      // minimum intro duration and enter as soon as the data is ready.
      if (!replay || !cinematic) dismiss();
    },
    fail() {
      if (ready) return;
      stopped = true;
      cancelAnimationFrame(raf);
      el.classList.remove("compact");
      status.textContent = "The map couldn’t load. Please try again.";
      status.setAttribute("role", "alert");
      enter.hidden = true;
      document.getElementById("load-retry")!.hidden = false;
    },
  };
}
