// Loading scene: a first-person dolly down an endless HDB street. Blocks
// rise from the ground on both sides as the camera approaches; anything
// left behind is recycled ahead with a fresh height and color, so the
// street builds itself in a loop until the data is in. Same design
// language as the map: dark surface, ramp blues, fog to black.
import * as THREE from "three";

const RAMP_HEX = [0x104281, 0x1c5cab, 0x256abf, 0x2a78d6, 0x3987e5, 0x6da7ec, 0x9ec5f4, 0xcde2fb];

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export type Loader = { finish: () => void };

export function startLoader(): Loader {
  const overlay = document.getElementById("loading")!;
  const fallback: Loader = { finish: () => overlay.classList.add("done") };
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return fallback;
  const canvas = document.getElementById("load-canvas") as HTMLCanvasElement | null;
  if (!canvas) return fallback;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0d0d);
  scene.fog = new THREE.Fog(0x0d0d0d, 160, 520);

  const camera = new THREE.PerspectiveCamera(56, 1, 1, 900);
  camera.position.set(0, 24, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const sun = new THREE.DirectionalLight(0xdfe8ff, 1.6);
  sun.position.set(-140, 220, -80);
  scene.add(sun);

  // Street: near-black ground with two faint kerb lines, like the basemap's
  // hairline roads.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000),
    new THREE.MeshLambertMaterial({ color: 0x131312 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const kerbMat = new THREE.MeshBasicMaterial({ color: 0x2c2c2a });
  const kerbs: THREE.Mesh[] = [];
  for (const x of [-36, 36]) {
    const kerb = new THREE.Mesh(new THREE.BoxGeometry(2, 0.12, 4000), kerbMat);
    kerb.position.set(x, 0.06, 0);
    scene.add(kerb);
    kerbs.push(kerb);
  }

  // Blocks: unit box with its base at y=0 so scale.y grows upward.
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);

  type Block = {
    mesh: THREE.Mesh;
    side: number;
    h: number;
    z: number;
    born: number; // -1 = fully risen, otherwise rise start time
  };

  const PER_SIDE = 30;
  const SPACING = 44;
  const RISE_SECS = 0.85;
  const AHEAD = PER_SIDE * SPACING;
  const blocks: Block[] = [];

  const pickColor = () =>
    RAMP_HEX[Math.floor(Math.pow(Math.random(), 1.5) * RAMP_HEX.length)];

  function place(b: Block, z: number, initial: boolean, now: number) {
    b.h = rand(26, 115);
    b.z = z + rand(-9, 9);
    const w = rand(24, 56);
    const d = rand(10, 17);
    b.mesh.scale.set(w, initial ? b.h : 0.001, d);
    b.mesh.position.set(b.side * rand(54, 92), 0, b.z);
    (b.mesh.material as THREE.MeshLambertMaterial).color.setHex(pickColor());
    b.born = initial ? -1 : now;
  }

  for (const side of [-1, 1]) {
    for (let i = 0; i < PER_SIDE; i++) {
      const mesh = new THREE.Mesh(
        boxGeo,
        new THREE.MeshLambertMaterial({ color: pickColor() }),
      );
      const b: Block = { mesh, side, h: 0, z: 0, born: -1 };
      // Blocks already beside/behind the camera start risen; the street
      // ahead starts flat and rises as we reach it.
      const z = i * SPACING - 60;
      place(b, z, z < 140, 0);
      blocks.push(b);
      scene.add(mesh);
    }
  }

  function resize() {
    const w = canvas!.clientWidth || innerWidth;
    const h = canvas!.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  addEventListener("resize", resize);

  const SPEED = 42; // units/sec forward
  const OUTRO_SECS = 1.25;
  const start = performance.now();
  let raf = 0;
  let stopped = false;
  let lastT = 0;
  let finishAt = -1; // t when the outro (ascend + fade into the map) began
  let fadeStarted = false;

  function frame(nowMs: number) {
    if (stopped) return;
    // Clamped: the first rAF timestamp can precede `start`, and a negative
    // t stored as a block's birth time reads as the "fully risen" sentinel.
    const t = Math.max(0, (nowMs - start) / 1000);
    lastT = t;
    const camZ = t * SPEED;
    // Outro: the dolly becomes a crane shot — camera pulls up out of the
    // street and tilts toward the ground while the overlay crossfades to
    // the aerial map underneath.
    const k = finishAt >= 0 ? easeInOut(Math.min(1, (t - finishAt) / OUTRO_SECS)) : 0;
    const sway = 1 - k;
    camera.position.set(
      Math.sin(t * 0.22) * 7 * sway,
      24 + Math.sin(t * 0.35) * 1.2 * sway + 300 * k,
      camZ,
    );
    camera.lookAt(Math.sin(t * 0.22 + 0.6) * 5 * sway, 17 - 260 * k, camZ + 130 - 40 * k);
    if (finishAt >= 0 && !fadeStarted && k > 0.18) {
      fadeStarted = true;
      overlay.classList.add("done");
    }
    if (finishAt >= 0 && k >= 1) {
      cleanup();
      return;
    }

    for (const b of blocks) {
      // Recycle anything 80 units behind the camera to the far end ahead.
      if (b.z < camZ - 80) place(b, b.z + AHEAD, false, t);
      if (b.born >= 0) {
        // Hold flat until the camera is near enough to watch the rise.
        const dist = b.z - camZ;
        if (dist < 300) {
          const k = Math.min(1, (t - b.born) / RISE_SECS);
          b.mesh.scale.y = Math.max(0.001, b.h * easeOut(k));
          if (k >= 1) b.born = -1;
        } else {
          b.born = t; // hold flat until it's near enough to be seen rising
        }
      }
    }
    // Keep the kerbs endless.
    for (const kerb of kerbs) kerb.position.z = camZ;

    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  function cleanup() {
    stopped = true;
    cancelAnimationFrame(raf);
    removeEventListener("resize", resize);
    renderer.dispose();
    renderer.forceContextLoss(); // dispose() alone keeps the GL context alive
    boxGeo.dispose();
    canvas!.remove();
  }

  return {
    finish: () => {
      // Wall clock, not lastT: deck.gl's first layer build can stall rAF for
      // ~0.5s right before this call, and a stale lastT would fast-forward
      // the outro by that much.
      if (finishAt < 0) finishAt = Math.max(0, (performance.now() - start) / 1000);
    },
  };
}
