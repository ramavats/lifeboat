/**
 * Davits: a lifeboat hangs outboard of a ship's side from two radial davits. The
 * pointer's height lowers it down its falls to the water on one spring. At rest it
 * hangs part way down, swung out, its canopy bright; lowering, the falls take the
 * bright; afloat, the hull. The slider is the pointer travel a full launch takes.
 * The pattern: a continuous answer, a hit band fixed on screen, a designed rest.
 */
const {
  Cam, clamp, facing, fillet, fit, hull, open, poly, prism, proj, rings, ringAt, run, seg, spring, stepS,
  mk, pointer, put, register, disposer, solid,
} = HL;

const SCALE = 1.78; // the camera scale, also the tubes' width in screen units per world unit
const DECK = 50; // deck height above the water
const SHIP = [0, 0, 150, 22]; // the ship's side: x0, y0, x1, y1; the side faces +y, outboard
const BX0 = 38, BX1 = 112, BY0 = 40, BY1 = 62, BYM = (BY0 + BY1) / 2; // the boat's gunwale
const BH = 12, CH = 11; // hull depth, canopy height
const STOWED = DECK + 10, AFLOAT = -3, REST = 0.46; // keel heights, and rest as a share of the way down
// Radial davits: a pedestal inboard on the deck, a tubular post, a quarter-circle bend, a
// straight arm out over the boat, and a block at the tip that the falls run from.
const DAVITS = [44, 106], DY = 4, POST = 30, BEND = 13, ARM = DECK + 4 + POST + BEND, TUBE = 2.1;
const BLOCK = [ARM - 9, ARM - 2.5], TIP = BLOCK[0]; // the block hangs under the arm's end
const keelAt = (f) => STOWED + (AFLOAT - STOWED) * f;

/** The boat in plan: a flat transom aft, a pointed bow forward, every corner rounded. */
const PLAN = fillet([[BX0, BY0 + 3], [BX1 - 20, BY0], [BX1, BYM], [BX1 - 20, BY1], [BX0, BY1 - 3]], [4, 18, 7, 18, 4], 5);
const CX = PLAN.reduce((a, p) => a + p[0], 0) / PLAN.length;

/** A plan scaled about its middle, as a ring of samples with outward normals. */
function shape(sx, sy) {
  const pts = PLAN.map(([x, y]) => [CX + (x - CX) * sx, BYM + (y - BYM) * sy]);
  const n = pts.length, area = pts.reduce((a, p, i) => a + p[0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * p[1], 0);
  return pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    let nu = b[1] - a[1], nv = a[0] - b[0];
    if (area < 0) { nu = -nu; nv = -nv; }
    const l = Math.hypot(nu, nv) || 1;
    return { u: p[0], v: p[1], nu: nu / l, nv: nv / l };
  });
}

/** A davit's centreline in world space: post, bend and arm, as two runs split at the rail. */
function davitLine(x) {
  const post = [[x, DY, DECK + 4], [x, DY, DECK + 4 + POST]];
  const bend = [];
  for (let k = 1; k <= 8; k++) {
    const a = (k / 8) * (Math.PI / 2);
    bend.push([x, DY + BEND - BEND * Math.cos(a), DECK + 4 + POST + BEND * Math.sin(a)]);
  }
  return { inboard: post.concat(bend), arm: [[x, DY + BEND, ARM], [x, BYM + 2.5, ARM]] };
}

/** A tube along a screen polyline: an opaque body, an outline open where it joins another tube, one crease. */
function tube(pts, w, capEnd) {
  const n = pts.length, L = [], R = [], crease = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, tx = (b[0] - a[0]) / l, ty = (b[1] - a[1]) / l, [x, y] = pts[i];
    L.push([x - ty * w, y + tx * w]);
    R.push([x + ty * w, y - tx * w]);
    crease.push([x - ty * w * 0.35, y + tx * w * 0.35]);
  }
  const cap = (p, q, c) => { // a half circle from p to q around c
    const out = [], a0 = Math.atan2(p[1] - c[1], p[0] - c[0]);
    for (let k = 1; k < 6; k++) out.push([c[0] + w * Math.cos(a0 - (k / 6) * Math.PI), c[1] + w * Math.sin(a0 - (k / 6) * Math.PI)]);
    return out;
  };
  const end = capEnd ? cap(L[n - 1], R[n - 1], pts[n - 1]) : [];
  const outline = L.concat(end, R.reverse());
  return { body: poly(outline), edge: capEnd ? open(outline) : open(L) + " " + open(R), crease: open(crease) };
}

/** Draw a tube: its opaque body first, so it hides what is behind it, then outline and crease. */
const drawTube = (parent, t) => [["fo", t.body], ["sil nf", t.edge], ["lo nf", t.crease]].forEach(([c, d]) => mk("path", { class: c, d }, parent));

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  const C = Cam(45, 0.5, SCALE);
  fit(C, [
    [SHIP[0], SHIP[1], 0], [SHIP[2], SHIP[1], DECK + 6], [SHIP[2], SHIP[3], 0], [SHIP[0], SHIP[3], DECK + 42],
    [BX0, BY1, AFLOAT], [BX1, BY1, AFLOAT], [BX0, BY0, STOWED + BH + CH],
  ], 200, 166);
  const P = proj(C), front = facing(C);
  let band = value, over = null;
  const g = mk("g", {}, svg);

  // Where the boat will float, painted first: a guide it settles onto.
  mk("path", { class: "dash nf", d: poly(ringAt(P, shape(0.92, 0.85), 0)) }, g);

  // The ship's side: a long plate standing on the water, with portholes and a rail.
  const [sr, si] = rings(SHIP[0], SHIP[1], SHIP[2], SHIP[3], 5, 1.6);
  put(solid(g), prism(P, front, sr, si, 0, DECK));
  const marks = [], RAIL = DECK + 7;
  for (let k = 0; k < 6; k++) {
    const cx = 13 + k * 25, cz = DECK - 16, pts = [];
    for (let a = 0; a < 12; a++) pts.push(P(cx + 3 * Math.cos((a / 6) * Math.PI), SHIP[3], cz + 3 * Math.sin((a / 6) * Math.PI)));
    marks.push(poly(pts));
  }
  marks.push(open([P(SHIP[0] + 4, SHIP[3], RAIL), P(SHIP[2] - 4, SHIP[3], RAIL)]));
  for (let x = SHIP[0] + 8; x < SHIP[2]; x += 14) marks.push(seg(P(x, SHIP[3], DECK), P(x, SHIP[3], RAIL)));
  mk("path", { class: "lo nf", d: marks.join(" ") }, g);

  // The davits' pedestals and posts stand inboard, behind the boat: paint them first.
  const davEls = DAVITS.map((x) => {
    const [pr, pi] = rings(x - 4.2, DY - 4.2, x + 4.2, DY + 4.2, 2.4, 0.9);
    put(solid(g), prism(P, front, pr, pi, DECK, DECK + 4));
    const line = davitLine(x);
    drawTube(g, tube(line.inboard.map((p) => P(...p)), TUBE * SCALE, false));
    return line;
  });

  // The boat: a hull that narrows to its keel, under a domed canopy.
  const boat = mk("g", {}, g);
  const keel = shape(0.78, 0.42), gun = shape(1, 1), gunIn = shape(0.97, 0.88);
  const cFoot = shape(0.72, 0.78), cTop = shape(0.5, 0.42), cIn = shape(0.46, 0.34);
  const hullEl = solid(boat), canEl = solid(boat);
  const solidOf = (foot, top, inner, z0, z1) => ({
    sil: poly(hull(ringAt(P, foot, z0).concat(ringAt(P, top, z1)))),
    crease: open(ringAt(P, run(inner, front), z1)),
  });

  // The arms and their blocks come after the boat: they reach out above it.
  DAVITS.forEach((x, i) => {
    // The arm starts a little inside the bend, so its fill covers the joint and no seam shows.
    const arm = davEls[i].inboard.slice(-2).concat(davEls[i].arm.slice(1));
    drawTube(g, tube(arm.map((p) => P(...p)), TUBE * SCALE, true));
    const [br, bi] = rings(x - 2.6, BYM - 2.6, x + 2.6, BYM + 2.6, 1.6, 0.6);
    put(solid(g), prism(P, front, br, bi, BLOCK[0], BLOCK[1]));
    mk("path", { class: "sil nf", d: open([P(x, BYM, BLOCK[1]), P(x, BYM, ARM)]) }, g);
  });
  const falls = mk("path", { class: "lo nf" }, g);

  const sp = spring(REST, { eps: 0.002 });
  let drawn = NaN, lit = "";

  function draw() {
    if (sp.x === drawn) return;
    drawn = sp.x;
    const z = keelAt(sp.x);
    put(hullEl, solidOf(keel, gun, gunIn, z, z + BH));
    put(canEl, solidOf(cFoot, cTop, cIn, z + BH, z + BH + CH));
    falls.setAttribute("d", DAVITS.map((x) => seg(P(x, BYM, TIP), P(x, BYM, z + BH + CH))).join(" "));
  }

  /** One bright place: the canopy at rest, the falls while lowering, the hull once afloat. */
  function light() {
    const t = sp.t, now = over === null ? "canopy" : t >= 0.96 ? "hull" : t > 0.04 ? "falls" : "canopy";
    if (now === lit) return;
    lit = now;
    canEl.sil.classList.toggle("hi", now === "canopy");
    hullEl.sil.classList.toggle("hi", now === "hull");
    falls.setAttribute("class", now === "falls" ? "hi nf" : "lo nf");
  }

  const B = register(stage, (dt) => {
    const m = stepS(sp, dt);
    draw();
    return m;
  });
  bag.add(B.unregister);

  // The hit band is fixed on screen, centred between the stowed and the
  // afloat boat; it never moves with the boat (rule 01).
  const mid = (P(CX, BYM, STOWED)[1] + P(CX, BYM, AFLOAT)[1]) / 2;

  function retarget() {
    if (over === null) {
      sp.t = REST;
      read.textContent = "rest";
    } else {
      const f = clamp((over - (mid - band / 2)) / band, 0, 1);
      sp.t = f;
      read.textContent = f >= 0.96 ? "afloat" : f <= 0.04 ? "stowed" : `lowering ${Math.round(f * 100)}%`;
    }
    light();
    B.wake();
  }

  draw();
  light();
  bag.add(pointer(stage, {
    move: (p) => { over = p[1]; retarget(); },
    leave: () => { over = null; retarget(); },
  }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { band = v; if (over !== null) retarget(); },
    destroy: bag.dispose,
  };
}

hairline({
  name: "davits",
  means: "A lifeboat hangs from its davits; the pointer's height lowers it down its falls to the water.",
  rules: [1, 4, 5, 9],
  range: [150, 110, 70],
  tour: [[151, 150], [151, 208], [151, 260], null],
  mount,
});
