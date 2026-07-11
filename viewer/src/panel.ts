// Block story panel: a building's own 36-year price history — sparkline,
// lease position, floor-level breakdown, and its actual transactions.
// Pure DOM into #panel.
import { rampCss } from "./ramp";
import { track } from "./analytics";

type Ctx = {
  buildings: any[];
  enums: { flatTypes: string[]; towns: string[] };
  col: Record<string, Uint8Array | Uint16Array | Uint32Array>;
  M: number;
  maxMonth: number;
  psmSum: Float32Array;
  cnt: Uint16Array;
  txOffsets: Uint32Array;
  txIndex: Uint32Array;
  monthName: (m: number) => string;
  onClose: () => void;
  toast: (msg: string) => void;
};

let ctx: Ctx;
let el: HTMLElement;

export function initPanel(c: Ctx) {
  ctx = c;
  el = document.getElementById("panel")!;
}

const FLAT_SHORT = ["1-rm", "2-rm", "3-rm", "4-rm", "5-rm", "Exec", "MG"];
const title = (s: string) =>
  s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
const sgd = (x: number) => "S$" + Math.round(x).toLocaleString();

function sparkline(idx: number): string {
  const { psmSum, cnt, M } = ctx;
  const pts: { y: number; v: number }[] = [];
  const lastYear = 1990 + Math.floor((M - 1) / 12);
  for (let y = 0; y * 12 < M; y++) {
    let s = 0, c = 0;
    for (let m = y * 12; m < Math.min(M, y * 12 + 12); m++) {
      s += psmSum[idx * M + m];
      c += cnt[idx * M + m];
    }
    if (c) pts.push({ y: 1990 + y, v: s / c });
  }
  if (pts.length < 2) return `<div class="muted spark-empty">not enough sales for a trend</div>`;
  const w = 256, h = 56, pad = 3;
  const vmin = Math.min(...pts.map((p) => p.v));
  const vmax = Math.max(...pts.map((p) => p.v));
  const X = (y: number) => pad + ((y - 1990) / (lastYear - 1990)) * (w - 2 * pad);
  const Y = (v: number) => h - pad - ((v - vmin) / (vmax - vmin || 1)) * (h - 2 * pad);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${X(p.y).toFixed(1)},${Y(p.v).toFixed(1)}`).join("");
  const last = pts[pts.length - 1];
  const first = pts[0];
  const mult = last.v / first.v;
  return `
    <svg viewBox="0 0 ${w} ${h}" class="spark">
      <path d="${d}" fill="none" stroke="#86b6ef" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${X(last.y).toFixed(1)}" cy="${Y(last.v).toFixed(1)}" r="2.5" fill="#cde2fb"/>
    </svg>
    <div class="spark-ends">
      <span>${sgd(first.v)}/m² · ${first.y}</span>
      <span>${sgd(last.v)}/m² · ${last.y}</span>
    </div>
    <div class="spark-mult">×${mult >= 10 ? mult.toFixed(0) : mult.toFixed(1)} since ${first.y}</div>`;
}

// Fair range: for each flat type this block contains, the 25th-75th
// percentile of the past year's estate sales of that type (S$/m²),
// adjusted by the block's own all-time premium vs its town (clamped, and
// only applied when both sides have enough data), sized by the block's
// typical unit. computeFair returns structured rows (dominant type first)
// so the peek can show the main type and the expanded view can list all.
type FairRow = {
  t: number; lo: number; hi: number; sqm: number;
  n: number; similar: boolean; blkCount: number;
};
function computeFair(idx: number): FairRow[] {
  const { col, buildings, maxMonth, txOffsets, txIndex } = ctx;
  const b = buildings[idx];
  const N = col.price.length;
  const T = FLAT_SHORT.length;
  if (txOffsets[idx] === txOffsets[idx + 1]) return [];
  const blkLease = col.leaseStart[txIndex[txOffsets[idx]]];
  const est12: number[][] = Array.from({ length: T }, () => []); // similar lease vintage
  const est12All: number[][] = Array.from({ length: T }, () => []); // any vintage (fallback)
  const townAll = Array.from({ length: T }, () => ({ s: 0, c: 0 }));
  const blkAll = Array.from({ length: T }, () => ({ s: 0, c: 0 }));
  const blkSizes: number[][] = Array.from({ length: T }, () => []);
  const from = maxMonth - 11;
  for (let i = 0; i < N; i++) {
    const t = col.flatType[i];
    const psm = col.price[i] / (col.sqmX10[i] / 10);
    if (buildings[col.building[i]].town === b.town) {
      townAll[t].s += psm;
      townAll[t].c++;
      if (col.month[i] >= from) {
        est12All[t].push(psm);
        // Comps should be blocks of a similar age: a 1978 flat's fair range
        // shouldn't be stretched by 2015-lease premium blocks across town.
        if (Math.abs(col.leaseStart[i] - blkLease) <= 12) est12[t].push(psm);
      }
    }
    if (col.building[i] === idx) {
      blkAll[t].s += psm;
      blkAll[t].c++;
      blkSizes[t].push(col.sqmX10[i] / 10);
    }
  }
  const out: FairRow[] = [];
  for (let t = 0; t < T; t++) {
    const similar = est12[t].length >= 15;
    const pool = similar ? est12[t] : est12All[t];
    if (blkAll[t].c < 3 || pool.length < 15) continue;
    const arr = pool.sort((a, z) => a - z);
    const q = (p: number) => arr[Math.floor(p * (arr.length - 1))];
    let factor = 1;
    if (blkAll[t].c >= 5 && townAll[t].c >= 50) {
      factor = blkAll[t].s / blkAll[t].c / (townAll[t].s / townAll[t].c);
      factor = Math.max(0.8, Math.min(1.2, factor));
    }
    const sizes = blkSizes[t].sort((a, z) => a - z);
    const sqm = sizes[sizes.length >> 1];
    out.push({ t, lo: q(0.25) * factor * sqm, hi: q(0.75) * factor * sqm, sqm, n: arr.length, similar, blkCount: blkAll[t].c });
  }
  out.sort((a, z) => z.blkCount - a.blkCount); // dominant type first
  return out;
}

// Methodology line for the fair range, revealed behind the info affordance.
function fairMethod(f: FairRow, town: string): string {
  return `Estimated from ${f.n} ${f.similar ? "similar-age " : ""}${town} ${FLAT_SHORT[f.t]} sales in the past 12 months. Not a valuation.`;
}

// Expanded view: fair range for every flat type in the block.
function renderFairRows(fair: FairRow[], town: string): string {
  if (!fair.length) return "";
  const rows = fair.map((f) => `
    <div class="fair-row">
      <strong>${FLAT_SHORT[f.t]}</strong>
      <span class="fair-range">${sgd(f.lo)} – ${sgd(f.hi)}</span>
      <span class="muted">~${Math.round(f.sqm)} m²</span>
    </div>`).join("");
  const method = `Estimated from registered sales of similar-age ${town} flats in the past 12 months. Not a valuation.`;
  return `
    <div class="panel-txhead muted">fair range by flat type<span class="info-wrap"><button class="info" type="button" aria-label="How this is estimated">i</button><span class="info-pop">${method}</span></span></div>
    ${rows}`;
}

// Trailing-12-month change in S$/m² vs the prior 12 months. Only returned
// when both windows have enough of the block's own sales to mean something.
function trend12(idx: number): number | null {
  const { psmSum, cnt, M } = ctx;
  const win = (a: number, b: number) => {
    let s = 0, c = 0;
    for (let m = Math.max(0, a); m < b; m++) { s += psmSum[idx * M + m]; c += cnt[idx * M + m]; }
    return { s, c };
  };
  const recent = win(M - 12, M);
  const prior = win(M - 24, M - 12);
  if (recent.c >= 3 && prior.c >= 3) return (recent.s / recent.c / (prior.s / prior.c) - 1) * 100;
  return null;
}

// Per-storey-band S$/m² bars — mirrors the 3D floor plates so the floor
// story is readable without hunting for them on the map.
function floorSection(idx: number): string {
  const { col, txOffsets, txIndex } = ctx;
  const bands = new Map<number, { ps: number; c: number }>();
  for (let k = txOffsets[idx]; k < txOffsets[idx + 1]; k++) {
    const i = txIndex[k];
    const s = col.storey[i];
    let e = bands.get(s);
    if (!e) bands.set(s, (e = { ps: 0, c: 0 }));
    e.ps += col.price[i] / (col.sqmX10[i] / 10);
    e.c++;
  }
  if (bands.size < 2) return "";
  const rows = [...bands.entries()]
    .map(([s, e]) => ({ s, psm: e.ps / e.c, n: e.c }))
    .sort((a, b) => b.s - a.s);
  const min = Math.min(...rows.map((r) => r.psm));
  const max = Math.max(...rows.map((r) => r.psm));
  const html = rows.map((r) => {
    const t = max > min ? (r.psm - min) / (max - min) : 0.5;
    return `<div class="floor-row">
      <span class="muted">F${r.s}</span>
      <div class="floor-bar"><i style="width:${Math.round(30 + t * 70)}%;background:${rampCss(t)}"></i></div>
      <span class="floor-val">${sgd(r.psm)}/m²</span>
      <span class="muted floor-n">${r.n}</span>
    </div>`;
  }).join("");
  return `<div class="panel-txhead muted" style="margin-top:2px">by floor · all-time S$/m² · sales</div>${html}`;
}

export function showPanel(idx: number) {
  const { buildings, enums, col, txOffsets, txIndex, monthName, maxMonth } = ctx;
  const b = buildings[idx];
  const txs = Array.from(txIndex.subarray(txOffsets[idx], txOffsets[idx + 1]))
    .sort((a, z) => col.month[z] - col.month[a]);

  const leaseStart = txs.length ? col.leaseStart[txs[0]] : b.year;
  const nowYear = 1990 + Math.floor(maxMonth / 12);
  const leaseLeft = leaseStart ? Math.max(0, leaseStart + 99 - nowYear) : null;

  const rows = txs.map((i) => `
    <div class="tx">
      <span class="muted">${monthName(col.month[i])}</span>
      <span>~F${col.storey[i]}</span>
      <span>${Math.round(col.sqmX10[i] / 10)} m²</span>
      <span>${FLAT_SHORT[col.flatType[i]]}</span>
      <strong>${sgd(col.price[i])}</strong>
    </div>`).join("");

  const fair = computeFair(idx);
  const dom = fair[0] || null;
  const town = title(enums.towns[b.town]);
  const tr = trend12(idx);
  const last = txs.length ? txs[0] : null;
  const domType = dom ? FLAT_SHORT[dom.t] : last !== null ? FLAT_SHORT[col.flatType[last]] : "";

  // Structure (Option A): a pinned handle + close, then the decision at the
  // top — last real sale as the hero, fair range with a tucked-away
  // methodology, a recent trend chip, and the fundamentals — then the
  // evidence (chart, all types, floors, ledger) below the peek fold.
  el.innerHTML = `
    <button id="panel-close" aria-label="Close">×</button>
    <div id="panel-grab" aria-hidden="true"></div>
    <div id="panel-scroll">
      <div class="panel-head"><strong>Blk ${b.block}</strong> ${title(b.street)}</div>
      <div class="panel-sub muted">${town}${domType ? ` · ${domType}` : ""} · ${b.floors || "?"} floors</div>

      <div class="hero">
        <div class="hero-sold">
          ${last !== null
            ? `<div class="lbl">Last sold</div>
               <div class="hero-big num">${sgd(col.price[last])}</div>
               <div class="hero-sub num">${monthName(col.month[last])} · ~F${col.storey[last]} · ${Math.round(col.sqmX10[last] / 10)} m²</div>`
            : `<div class="hero-mid">Not yet resold</div>
               <div class="hero-sub muted">no registered resale here yet</div>`}
        </div>
        ${dom ? `
        <div class="hero-fair">
          <div class="hero-fair-main">
            <div class="lbl">Fair range now<span class="info-wrap"><button class="info" type="button" aria-label="How this is estimated">i</button><span class="info-pop">${fairMethod(dom, town)}</span></span></div>
            <div class="hero-fairval num">${sgd(dom.lo)} – ${sgd(dom.hi)}</div>
          </div>
          ${tr !== null ? `<div class="trend" title="past 12 months vs the year before">${tr >= 0 ? "▲" : "▼"} ${Math.abs(tr).toFixed(1)}% <span class="since">12 mo</span></div>` : ""}
        </div>` : ""}
      </div>

      <div class="funds">
        ${leaseLeft !== null ? `<div><div class="fv num">${leaseLeft} yrs</div><div class="fk">lease left</div></div>` : ""}
        ${b.mrt ? `<div><div class="fv num">${b.mrtM >= 1000 ? (b.mrtM / 1000).toFixed(1) + " km" : b.mrtM + " m"}</div><div class="fk" title="${b.mrt} MRT">${b.mrt} MRT</div></div>` : ""}
        ${dom ? `<div><div class="fv num">~${Math.round(dom.sqm)} m²</div><div class="fk">typical unit</div></div>` : ""}
      </div>

      <button class="more-hint" id="panel-more" type="button">
        ${last !== null ? `Floor prices &amp; ${txs.length} past sales` : "Lease &amp; location"}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 15l6-6 6 6"/></svg>
      </button>

      <div class="evidence">
        ${sparkline(idx)}
        ${renderFairRows(fair, town)}
        ${floorSection(idx)}
        <div class="panel-txhead muted" style="margin-top:10px">${txs.length.toLocaleString()} resales since 1990</div>
        <div class="txlist">${rows || `<div class="muted">no recorded resales</div>`}</div>
        <button id="panel-share">Share</button>
      </div>
    </div>`;

  if (clearTimer) { clearTimeout(clearTimer); clearTimer = null; }
  el.classList.remove("hidden", "expanded"); // open as a peek
  el.style.transform = "";
  // Fit the peek to the summary so the fold lands just above the evidence:
  // the chart no longer peeks, and (with scroll disabled until expanded) the
  // only way to see more is the expand hint or handle.
  if (matchMedia("(max-width: 640px)").matches) {
    const ev = el.querySelector(".evidence") as HTMLElement | null;
    if (ev) {
      const ph = el.getBoundingClientRect().height;
      const fold = ev.getBoundingClientRect().top - el.getBoundingClientRect().top - 4;
      el.style.setProperty("--peek-y", `${Math.max(0, ph - fold)}px`);
    }
  }
  attachSheetDrag(document.getElementById("panel-grab")!);
  el.querySelectorAll(".info").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      (e.currentTarget as HTMLElement).parentElement!.classList.toggle("open");
    }),
  );
  document.getElementById("panel-more")!.addEventListener("click", () => el.classList.add("expanded"));
  document.getElementById("panel-close")!.addEventListener("click", ctx.onClose);
  document.getElementById("panel-share")!.addEventListener("click", async () => {
    track("share");
    const shareTitle = `Blk ${b.block} ${title(b.street)} — every resale since 1990`;
    // Native share sheet on touch devices only; desktop Chrome/Safari also
    // expose navigator.share but their sheets are worse than copy + toast.
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ title: shareTitle, url: location.href });
        return;
      } catch (err: any) {
        if (err?.name === "AbortError") return; // user closed the sheet
        // otherwise fall through to clipboard
      }
    }
    await navigator.clipboard.writeText(location.href);
    ctx.toast(`Link to Blk ${b.block} copied`);
  });
}

// Draggable bottom sheet (mobile only). The handle drags the sheet between
// peek and expanded; a tap toggles; a hard drag down closes. translateY is
// driven inline while dragging, then handed back to the CSS classes (which
// carry the transition) on release.
let lastDragT = 0;
function attachSheetDrag(grab: HTMLElement) {
  if (!matchMedia("(max-width: 640px)").matches) return;
  const peekT = () => parseFloat(getComputedStyle(el).getPropertyValue("--peek-y")) || Math.round(innerHeight * 0.46);
  const panelH = () => el.getBoundingClientRect().height || innerHeight * 0.88;
  let startY = 0, startT = 0, dragging = false, moved = false;

  grab.addEventListener("pointerdown", (e) => {
    dragging = true;
    moved = false;
    startY = e.clientY;
    startT = el.classList.contains("expanded") ? 0 : peekT();
    lastDragT = startT;
    el.classList.add("dragging");
    grab.setPointerCapture(e.pointerId);
  });
  grab.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dy = e.clientY - startY;
    if (Math.abs(dy) > 4) moved = true;
    lastDragT = Math.max(0, Math.min(panelH(), startT + dy));
    el.style.transform = `translateY(${lastDragT}px)`;
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove("dragging");
    el.style.transform = "";
    if (!moved) {
      el.classList.toggle("expanded"); // tap toggles peek/expanded
      return;
    }
    const pk = peekT();
    const h = panelH();
    if (lastDragT < pk * 0.5) el.classList.add("expanded");
    else if (lastDragT < pk + (h - pk) * 0.45) el.classList.remove("expanded");
    else ctx.onClose(); // dragged well down: close
  };
  grab.addEventListener("pointerup", end);
  grab.addEventListener("pointercancel", end);
}

let clearTimer: ReturnType<typeof setTimeout> | null = null;
export function hidePanel() {
  el.classList.add("hidden");
  // Keep the content mounted through the slide-out, then clear it once the
  // panel has animated off screen. A new showPanel cancels the pending clear.
  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    if (el.classList.contains("hidden")) el.innerHTML = "";
  }, 450);
}
