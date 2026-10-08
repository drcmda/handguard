// =====================================================================================
// AR-15 free-float handguard — fully parametric ClassCAD build script (rev 3, the shop's)
//
// Model units: mm.  Master parameters are named expressions, in inches (suffix "In")
// unless noted.  Everything downstream (rail slot count, M-LOK rows, front Picatinny
// sections, QD positions, thick rear section, shovel nose) is derived from them, so after
// the build you can change e.g. the length with:
//
//   api.v1.part.updateExpression({ id: partId, toUpdate: [{ name: 'lengthIn', value: 15 }] })
//
// Coordinate system: X = bore axis (rear face at x=0, +X toward the muzzle),
// Z = up, +Y = shooter's LEFT (right-handed).
//
// Standards used:
//   MIL-STD-1913 profile (Figure 1): .835 width, .748 datum @ 45° flanks, .617 neck,
//     .164 line B, .108 basic, .367 min height; slots .206 wide, .394 pitch, .118 deep.
//   M-LOK: 32 x 7 mm slots, R2.38 corners, 8 mm web (40 mm pitch).
//
// Rev 3 builds for fast rebuilds (handguard.parts changes it live, in the browser): the thick rear
// is one intersection, the bore, cavity and gas-block passage one subtraction, every other cut
// (nose, reliefs, clamp, slots, M-LOK, QD) a single subtraction at the end; the M-LOK slots are
// drawn with flat sides (their round corners as tangent facets), which the boolean cuts several
// times faster than round ones. No lightening cuts in the rails or along the boss: each was a pattern
// of small cuts every rebuild paid for.
// =====================================================================================
const T0 = Date.now()
const report = {}
const partId = (await api.v1.part.create({ name: 'AR15_Handguard' })).result

const E = [
  // ---------------- master parameters (inch unless noted) ----------------
  ['lengthIn', 10],            // overall length: rear face -> shovel-nose tip
  ['railTopIn', 1.23],         // top of Picatinny over bore axis (= AR-15 flat-top upper)
  ['bodyAFIn', 1.75],          // octagon across flats
  ['wallIn', 0.125],           // wall thickness at the M-LOK faces
  ['bossWIn', 1.16],           // width of the Picatinny boss under the top rail
  ['gbChWIn', 0.94],           // gas-block channel width
  ['gbChTopIn', 0.80],         // gas-block channel top over bore
  ['gbSlotWIn', 0.40],         // gas-block slot up into the rail boss: width
  ['gbSlotTopIn', 0.98],       // gas-block slot top over bore (stays under the dovetail flanks)
  ['nutDiaIn', 1.375],         // barrel nut OD (= clamp bore)
  ['nutLenIn', 1.50],          // barrel nut length (clamp screws must sit over it)
  ['clampLenIn', 1.55],        // length of the round clamp bore
  ['screwX1In', 0.32],         // first clamp screw from the rear face
  ['screwSpacingIn', 0.90],    // clamp screw pitch
  ['screwEdgeIn', 0.13],       // material between clamp bore and screw
  ['keelFloorIn', 0.10],       // material below the counterbores
  ['keelScrewMarginIn', 0.15], // flat keel ahead of the last counterbore
  ['keelRearRIn', 0.20],       // rear-bottom radius of the clamp keel
  ['keelSweepRIn', 0.50],      // S-sweep radii of the keel into the bottom face
  ['keelSweepBetaDeg', 12],    // angle at which the sweep runs into the bottom face
  ['thickTIn', 0.125],         // thick rear (barrel-nut) section: extra wall below the rail boss
  ['thickMarginIn', 0.08],     // full thickness continues this far past the rear QD ring
  ['flowRIn', 0.90],           // S-curve radii of the flow from the thick rear into the body
  ['flowBetaDeg', 12],         // angle at which the flow runs into the body faces
  ['splitWIn', 0.06],          // clamp split width (6 o'clock)
  ['splitReliefDiaIn', 0.15],  // stress-relief hole at the split end
  ['noseExtIn', 0.30],         // shovel nose: tip (bottom rail face) this far past the top-rail end
  ['noseBreakIn', 0.10],       // ...rake starts this far below the bore axis
  ['frontPicSlots', 7],        // slots in each front 3/6/9 Picatinny section
  ['frontQdClosed', 3],        // slots closed (flush pad) for the front QD on the 3/9 sections
  ['frontRampIn', 0.35],       // merge ramp at the rear of each front section
  ['frReliefWIn', 0.40],       // internal relief channels under the front 3/6/9 rails (like the gas-block slot): width
  ['frReliefMarginIn', 0.02],  // ...stop this far under the rail's dovetail flanks; open through the front end
  ['qdBoreIn', 0.375],         // QD socket bore
  ['qdLockDepthIn', 0.25],     // depth at which the swivel balls lock (verify with your swivel!)
  ['qdGrooveDiaIn', 0.43],     // ball-lock undercut
  ['qdGrooveWIn', 0.085],
  ['qdPadDiaIn', 0.65],        // rear QD boss ring diameter
  ['qdRingHIn', 0.06],         // rear QD boss ring height (on the thick rear wall)
  ['qdRearOffsetIn', 0.25],    // rear QD centre, measured from the clamp-bore end
  ['mlokFrontGapIn', 0.15], ['mlokEndMarginIn', 0.25],
  ['tabLenIn', 0.20], ['tabGapIn', 0.96],      // anti-rotation tabs (fit to your upper!)
  ['rbDiaIn', 0.16], ['rbDepthIn', 1.40],      // lightening bores into the rear face, round the barrel nut, in the thick wall:
  ['rbPhi0Deg', -38], ['rbPhi1Deg', 42], ['rbCount', 6],  // per side, from below the 3/9 line (clear of the screws) up to the gas-block passage
  ['spotDiaIn', 0.55], ['spotDepth', 0.25],    // spot faces on both keel sides: flat round seats for the screw heads and the tapped exits
  // MIL-STD-1913 (inch)
  ['picPitchIn', 0.394], ['picSlotWIn', 0.206], ['picSlotDIn', 0.118], ['picHIn', 0.367], ['picWIn', 0.835],
  ['picNeckIn', 0.617], ['picDatumIn', 0.748], ['picLineBIn', 0.164], ['picLineABIn', 0.108],
  // M-LOK (mm)
  ['mlokL', 32], ['mlokW', 7], ['mlokR', 2.38], ['mlokGap', 8],
  // 1/4-28 socket head cap screws (inch)
  ['screwDiaIn', 0.25], ['screwClearIn', 0.266], ['tapDiaIn', 0.213], ['cbDiaIn', 0.42], ['cbDepthIn', 0.26],

  // ---------------- derived (mm) ----------------
  ['inch', 25.4], ['L', 'lengthIn*inch'], ['noseExt', 'noseExtIn*inch'], ['Lrail', 'L - noseExt'], ['Lbody', 'L + 2'],
  ['ao', 'bodyAFIn*inch/2'], ['ai', 'ao - wallIn*inch'], ['octT', 0.414213562373095], ['sq2', 1.414213562373095],
  ['ao_t', 'ao*octT'], ['ai_t', 'ai*octT'], ['aoD', 'ao*sq2'], ['aiD', 'ai*sq2'],
  ['thickT', 'thickTIn*inch'], ['aoR', 'ao + thickT'],
  ['rt', 'railTopIn*inch'], ['picH', 'picHIn*inch'], ['railBase', 'rt - picH'],
  ['picTopHalf', '(picDatumIn/2 - (picLineBIn - picLineABIn))*inch'], ['picMaxHalf', 'picWIn/2*inch'], ['picNeckHalf', 'picNeckIn/2*inch'],
  ['picZ1', 'rt - (picMaxHalf - picTopHalf)'], ['picZ2', 'rt - (picLineBIn - (picWIn/2 - picDatumIn/2))*inch'],
  ['picZ3', 'rt - (picLineBIn + (picDatumIn/2 - picNeckIn/2))*inch'],
  ['bossHalf', 'bossWIn*inch/2'], ['bossWallBot', 'aoD - bossHalf'],
  ['chHalf', 'gbChWIn*inch/2'], ['chTop', 'gbChTopIn*inch'], ['chWallBot', 'aiD - chHalf'],
  ['gsHalf', 'gbSlotWIn*inch/2'], ['gsTop', 'gbSlotTopIn*inch'],
  ['nutDia', 'nutDiaIn*inch'], ['nutR', 'nutDia/2'], ['clampLen', 'clampLenIn*inch'],
  ['picPitch', 'picPitchIn*inch'], ['picSlotW', 'picSlotWIn*inch'], ['picSlotD', 'picSlotDIn*inch'], ['picTooth', 'picPitch - picSlotW'],
  ['nTop', 'div((Lrail - picTooth)/picPitch, 1)'], ['xg0', 'Lrail/2 - (nTop - 1)*picPitch/2'],
  // front Picatinny sections: run to the nose (trimmed by the shovel cut), slots laid out from the front
  ['frontRamp', 'frontRampIn*inch'], ['frontEnd', 'L + 5'], ['noseSlope', 'noseExt/(ao + picH - noseBreak)'],
  ['xLastS', 'Lrail - picTooth - picSlotW/2'], ['xf0', 'xLastS - (frontPicSlots - 1)*picPitch'],
  ['segStart', 'xf0 - picSlotW/2 - picTooth - frontRamp'],
  ['nFrontOpen', 'frontPicSlots - frontQdClosed'], ['xf0open', 'xf0 + frontQdClosed*picPitch'], ['xQdF', 'xf0 + (frontQdClosed - 1)*picPitch/2'],
  ['xLastB', 'Lrail + (ao + picH - picSlotD - noseBreak)*noseSlope - picTooth - picSlotW/2'], ['xf0B', 'xLastB - (frontPicSlots - 1)*picPitch'],
  // internal relief channels under the front rails (cut from the cavity up into the rail neck)
  ['frReliefW', 'frReliefWIn*inch'], ['frReliefH', 'picZ3 - railBase - frReliefMarginIn*inch'], ['frRelDepth', 'ao + frReliefH - ai + 1'],
  ['frRelS0', 'xf0open - picPitch/2'], ['frRelS1', 'L + 10'], ['frRelSLen', 'frRelS1 - frRelS0'],
  ['frRelB0', 'xf0B - picPitch/2'], ['frRelB1', 'L + 10'], ['frRelBLen', 'frRelB1 - frRelB0'],
  // (the channels are cut into the rails before they join the part; the part then only gets the body wall
  // under them opened, a hair narrower, up a little into the rail's channel)
  ['frRelBodyDepth', 'ao - ai + 1.5'], ['frRelBodyW', 'frReliefW - 0.4'],
  // QD
  ['qdBore', 'qdBoreIn*inch'], ['qdLock', 'qdLockDepthIn*inch'], ['qdGrooveDia', 'qdGrooveDiaIn*inch'], ['qdGrooveW', 'qdGrooveWIn*inch'],
  ['qdPadDia', 'qdPadDiaIn*inch'], ['qdPadR', 'qdPadDia/2'], ['qdRingH', 'qdRingHIn*inch'], ['qdRearX', 'clampLen + qdRearOffsetIn*inch'],
  // thick rear section + S-curve flow into the body (s = distance from the axis along a face normal)
  ['thickEnd', 'qdRearX + qdPadR + thickMarginIn*inch'], ['thickClipZ', 'railBase - 0.5'],
  ['fR', 'flowRIn*inch'], ['fBeta', 'flowBetaDeg*C:PI/180'], ['fPhi', 'acos((1 + cos(fBeta) - thickT/fR)/2)'],
  ['fPmX', 'thickEnd + fR*sin(fPhi)'], ['fPmS', 'aoR - fR*(1 - cos(fPhi))'], ['fC1S', 'aoR - fR'],
  ['fC2X', 'thickEnd + 2*fR*sin(fPhi)'], ['fC2S', 'ao + fR*cos(fBeta)'], ['fPtS', 'ao - fR*(1 - cos(fBeta))'], ['flowEnd', 'fC2X'],
  // M-LOK layout
  ['mlokPitch', 'mlokL + mlokGap'], ['mStart', 'flowEnd + 2'], ['mEndA', 'segStart - mlokFrontGapIn*inch'],
  ['nA', 'div((mEndA - mStart + mlokGap)/mlokPitch, 1)'], ['xA0', '(mStart + mEndA)/2 - (nA - 1)*mlokPitch/2'],
  ['mEndB', 'Lrail - mlokEndMarginIn*inch'], ['xB0', 'xA0 + mlokPitch/2'], ['nB', 'div((mEndB - mlokL/2 - xB0)/mlokPitch, 1) + 1'],
  ['dUpper', '(ao*(1 - octT - sq2) + 2*bossHalf)/(2*sq2)'],
  ['mlA', 'mlokL/2'], ['mlB', 'mlokL/2 - mlokR'], ['mlC', 'mlokW/2'], ['mlD', 'mlokW/2 - mlokR'], ['mlCutDepth', '2*(wallIn*inch + 1.5)'],
  // shovel nose: vertical at the top-rail end above noseBreak, raked down to the bottom-rail face at L
  ['noseBreak', 'noseBreakIn*inch'], ['noseTop', 'rt + 10'], ['noseZ3', 'ao + picH'], ['noseX4', 'L + 10'], ['noseZ4', 'ao + picH + 10'],
  // clamp screws + keel (keel is flush with the thick rear bottom face)
  ['screwDia', 'screwDiaIn*inch'], ['screwClear', 'screwClearIn*inch'], ['tapDia', 'tapDiaIn*inch'], ['cbDia', 'cbDiaIn*inch'], ['cbDepth', 'cbDepthIn*inch'],
  ['screwX1', 'screwX1In*inch'], ['screwSpacing', 'screwSpacingIn*inch'],
  ['screwZ', 'nutR + screwEdgeIn*inch + screwDia/2'], ['keelBot', 'screwZ + cbDia/2 + keelFloorIn*inch'],
  ['keelHalf', 'aoR*octT'], ['keelW', '2*keelHalf'], ['keelTopZ', 'aoR - 1'],
  ['keelD', 'keelBot - aoR'], ['ksR', 'keelSweepRIn*inch'], ['ksBeta', 'keelSweepBetaDeg*C:PI/180'],
  ['ksPhi', 'acos((1 + cos(ksBeta) - keelD/ksR)/2)'],
  ['xk', 'screwX1 + screwSpacing + cbDia/2 + keelScrewMarginIn*inch'], ['keelRR', 'keelRearRIn*inch'], ['keelRearC', 'keelBot - keelRR'],
  ['ksPmX', 'xk + ksR*sin(ksPhi)'], ['ksPmZ', 'keelBot - ksR*(1 - cos(ksPhi))'],
  ['ksC1Z', 'keelBot - ksR'], ['ksC2X', 'xk + 2*ksR*sin(ksPhi)'], ['ksC2Z', 'aoR + ksR*cos(ksBeta)'], ['ksPtZ', 'aoR - ksR*(1 - cos(ksBeta))'],
  ['splitW', 'splitWIn*inch'], ['splitEnd', 'ksC2X + 2'], ['splitZ0', '-(keelBot + 5)'], ['splitH', 'keelBot + 5 - (nutR - 2)'], ['splitLenX', 'splitEnd + 5'],
  ['reliefDia', 'splitReliefDiaIn*inch'], ['reliefZ0', '-(keelBot + 5)'], ['reliefH', 'keelBot + 5 - (ai - 1)'],
  ['tabLen', 'tabLenIn*inch'], ['tabY0', 'tabGapIn*inch/2'],
  // lightening
  ['rbDia', 'rbDiaIn*inch'], ['rbDepth', 'rbDepthIn*inch'], ['rbR', '(nutR + aoR)/2'], ['rbPhi0', 'rbPhi0Deg*C:PI/180'],
  ['rbY0', 'rbR*cos(rbPhi0)'], ['rbZ0', 'rbR*sin(rbPhi0)'], ['rbStep', '(rbPhi1Deg - rbPhi0Deg)/(rbCount - 1)*C:PI/180'],
  ['spotDia', 'spotDiaIn*inch'],
  ['rampX2', 'frontRamp*(picH + 2)/picH'], ['rampY1', '5*picH/frontRamp'], ['rampYtop', 'picH + 2'],
  ['rpX0', '-(tabLen + 2)'], ['rpX1', 'clampLen + 1'], ['rpBot', 'nutR*0.5'],
]
const er = await api.v1.part.expression({ id: partId, toCreate: E.map(([name, value]) => ({ name, value })) })
if (er.result !== 1) return { exprFail: er.messages }
const ev = {}
for (const [n] of E) ev[n] = (await api.v1.part.getExpression({ id: partId, name: n })).result.value
const badExpr = Object.entries(ev).filter(([, v]) => v === null || !isFinite(v))
if (badExpr.length) return { badExpr }

// ---------------- helpers ----------------
const X = n => '@expr.' + n
const W = name => api.v1.part.getWorkGeometry({ id: partId, name }).then(r => r.result)
const right = await W('Right'), front = await W('Front'), top = await W('Top')
const xAxis = await W('XAxis'), yAxis = await W('YAxis'), zAxis = await W('ZAxis')
const vol = async () => { try { return (await api.v1.part.calculateMassProperties({ id: partId })).result.volume } catch (e) { return 'ERR' } }
const lv = r => r.maxLevel
const rightLocal = w => [w[2], -w[1]]   // Right plane: local (Z, -Y)
const frontLocal = w => [w[0], -w[2]]   // Front plane: local (X, -Z)
const topLocal = w => [w[0], w[1]]      // Top plane:   local (X, Y)
const shoelace = pts => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1] } return Math.abs(a) / 2 }

// closed polygon; every vertex pinned by HD/VD dims from the fixed sketch origin, bound to expressions
async function polySketch(planeId, name, verts, toLocal) {
  const sk = (await api.v1.sketch.create({ id: partId, planeId, name })).result
  const o = (await api.v1.sketch.point({ id: sk, pos: [0, 0, 0] })).result
  await api.v1.sketch.constraint({ id: sk, type: 'FIXATION', geomIds: [o] })
  const loc = verts.map(v => toLocal(v.w))
  const lines = (await api.v1.sketch.line(loc.map((p, i) => ({
    id: sk, startPos: [p[0], p[1], 0], endPos: [loc[(i + 1) % loc.length][0], loc[(i + 1) % loc.length][1], 0],
    genFixation: false, genVertAndHoriz: false, genTangency: false, genIncidence: true,
  })))).result
  const dims = []
  for (let i = 0; i < lines.length; i++) {
    const sp = (await api.v1.sketch.getPoints({ id: lines[i] })).result.startId
    dims.push({ id: sk, name: `${name}_v${i + 1}_h`, type: 'HORIZONTAL_DISTANCE', geomIds: [o, sp], value: verts[i].hd })
    dims.push({ id: sk, name: `${name}_v${i + 1}_v`, type: 'VERTICAL_DISTANCE', geomIds: [o, sp], value: verts[i].vd })
  }
  const dr = await api.v1.sketch.dimension(dims)
  let maxErr = 0
  for (let i = 0; i < lines.length; i++) {
    const q = (await api.v1.sketch.getPositions({ id: lines[i] })).result.startPos
    const w = verts[i].w
    maxErr = Math.max(maxErr, Math.hypot(q.x - w[0], q.y - w[1], q.z - w[2]))
  }
  return { sk, lines, dimLevel: dr.maxLevel, maxErr }
}
// closed profile of lines + 3-point arcs; every named vertex and arc centre pinned by HD/VD dims
// P: { key: { w: [x,y,z] world, hd, vd } }, curves: [{ a, b }] lines / [{ a, b, c: centreKey, m: [x,y,z] on-arc }] arcs
async function profileSketch(planeId, name, P, curves, toLocal) {
  const sk = (await api.v1.sketch.create({ id: partId, planeId, name })).result
  const o = (await api.v1.sketch.point({ id: sk, pos: [0, 0, 0] })).result
  await api.v1.sketch.constraint({ id: sk, type: 'FIXATION', geomIds: [o] })
  const L3 = w => { const l = toLocal(w); return [l[0], l[1], 0] }
  const lines = curves.filter(c => !c.c), arcs = curves.filter(c => c.c)
  const g = await api.v1.sketch.geometry({ id: sk, genFixation: false, genVertAndHoriz: false, genTangency: false, genIncidence: true,
    lines: lines.map(c => ({ startPos: L3(P[c.a].w), endPos: L3(P[c.b].w) })),
    arcsBy3Points: arcs.map(c => ({ startPos: L3(P[c.a].w), endPos: L3(P[c.b].w), midPos: L3(c.m) })) })
  const ids = [...g.result.lines, ...g.result.arcsBy3Points], all = [...lines, ...arcs]
  const ptOf = {}
  for (let i = 0; i < all.length; i++) {
    const pts = (await api.v1.sketch.getPoints({ id: ids[i] })).result
    if (!(all[i].a in ptOf)) ptOf[all[i].a] = pts.startId
    if (!(all[i].b in ptOf)) ptOf[all[i].b] = pts.endId
    if (all[i].c && !(all[i].c in ptOf)) ptOf[all[i].c] = pts.centerId
  }
  const dims = []
  for (const [k, pid] of Object.entries(ptOf)) {
    dims.push({ id: sk, name: `${name}_${k}_h`, type: 'HORIZONTAL_DISTANCE', geomIds: [o, pid], value: P[k].hd })
    dims.push({ id: sk, name: `${name}_${k}_v`, type: 'VERTICAL_DISTANCE', geomIds: [o, pid], value: P[k].vd })
  }
  const dr = await api.v1.sketch.dimension(dims)
  let maxErr = 0
  for (const [k, pid] of Object.entries(ptOf)) {
    const q = (await api.v1.sketch.getPositions({ id: pid })).result.pos
    const w = P[k].w
    maxErr = Math.max(maxErr, Math.hypot(q.x - w[0], q.y - w[1], q.z - w[2]))
  }
  return { sk, ids, level: Math.max(g.maxLevel, dr.maxLevel), maxErr }
}
// symmetric (about Z axis) profile in world (Y,Z) from its +Y half: [Y, Z, exprY, exprZ]
const mirrorHalf = half => [...half.map(h => ({ Y: h[0], Z: h[1], ey: h[2], ez: h[3] })),
                            ...half.slice().reverse().map(h => ({ Y: -h[0], Z: h[1], ey: h[2], ez: h[3] }))]
const yzVerts = (pts, x = 0) => pts.map(v => ({ w: [x, v.Y, v.Z], hd: X(v.ez), vd: X(v.ey) }))

// parametric M-LOK slot (32x7, R2.38) centred on the plane origin, long axis = world X
async function mlokSketch(planeId, name) {
  const sk = (await api.v1.sketch.create({ id: partId, planeId, name })).result
  const { mlA: A, mlB: B, mlC: C, mlD: D, mlokR: R } = ev
  const e = R * Math.tan(Math.PI / 8)
  const pts = [[-B - e, -C], [B + e, -C], [A, -D - e], [A, D + e], [B + e, C], [-B - e, C], [-A, D + e], [-A, -D - e]]
  const lines = (await api.v1.sketch.line(pts.map((p, i) => ({ id: sk, startPos: [p[0], p[1], 0], endPos: [pts[(i + 1) % 8][0], pts[(i + 1) % 8][1], 0], genFixation: false, genVertAndHoriz: false, genTangency: false, genIncidence: true })))).result
  for (const l of lines) { const p = (await api.v1.sketch.getPoints({ id: l })).result; await api.v1.sketch.constraint({ id: sk, type: 'FIXATION', geomIds: [p.startId] }) }
  return { sk, ids: lines, level: 31 }
}
let body = null, bodyVol = null   // bodyVol: volume of the handguard body alone (all tools consumed)
const CUTS = []
// (a cut is collected, and made with all the others in one subtraction at the end; the few that touch
// the front rails are made after those have joined, in a small subtraction of their own: the rails'
// many holes stay out of the large one)
async function cut(name, tools) { CUTS.push(...tools); report[name] = 'deferred' }
const LATE = []
async function late(name, tools) { LATE.push(...tools); report[name] = 'deferred, with the rails' }

// =========================== 1. body: octagon + boss + MIL-STD-1913 head ===========================
const outerYZ = mirrorHalf([
  [ev.picTopHalf, ev.rt, 'picTopHalf', 'rt'], [ev.picMaxHalf, ev.picZ1, 'picMaxHalf', 'picZ1'],
  [ev.picMaxHalf, ev.picZ2, 'picMaxHalf', 'picZ2'], [ev.picNeckHalf, ev.picZ3, 'picNeckHalf', 'picZ3'],
  [ev.picNeckHalf, ev.railBase, 'picNeckHalf', 'railBase'], [ev.bossHalf, ev.railBase, 'bossHalf', 'railBase'],
  [ev.bossHalf, ev.bossWallBot, 'bossHalf', 'bossWallBot'], [ev.ao, ev.ao_t, 'ao', 'ao_t'],
  [ev.ao, -ev.ao_t, 'ao', 'ao_t'], [ev.ao_t, -ev.ao, 'ao_t', 'ao']])
const outer = await polySketch(right, 'OuterProfile', yzVerts(outerYZ), rightLocal)
const Aout = shoelace(outerYZ.map(v => [v.Y, v.Z]))
const bodyEx = await api.v1.part.extrusion({ id: partId, name: 'Body', references: outer.lines, type: 'UP', limit2: X('Lbody') })
body = bodyEx.result
bodyVol = await vol()
report.body = { sketch: [outer.dimLevel, outer.maxErr], vol: bodyVol, expected: Aout * ev.Lbody }

// =========================== 1b. thick rear (barrel-nut) section with S-curve flow ===========================
// intersection of four slabs (3/9, both diagonals, bottom + top clip), each bounded by the same S-profile s(x)
{
  const R = ev.fR, ph = ev.fPhi, sh = Math.sin(ph / 2), ch = Math.cos(ph / 2)
  const PY = {}, sgnNames = [['p', 1], ['m', -1]]
  for (const [n, sg] of sgnNames) {
    PY['A' + n] = { w: [0, sg * ev.aoR, 0], hd: 0, vd: X('aoR') }
    PY['B' + n] = { w: [ev.thickEnd, sg * ev.aoR, 0], hd: X('thickEnd'), vd: X('aoR') }
    PY['M' + n] = { w: [ev.fPmX, sg * ev.fPmS, 0], hd: X('fPmX'), vd: X('fPmS') }
    PY['T' + n] = { w: [ev.fC2X, sg * ev.fPtS, 0], hd: X('fC2X'), vd: X('fPtS') }
    PY['C1' + n] = { w: [ev.thickEnd, sg * ev.fC1S, 0], hd: X('thickEnd'), vd: X('fC1S') }
    PY['C2' + n] = { w: [ev.fC2X, sg * ev.fC2S, 0], hd: X('fC2X'), vd: X('fC2S') }
  }
  const m1 = sg => [ev.thickEnd + R * sh, sg * (ev.fC1S + R * ch), 0]
  const m2 = sg => [ev.fC2X - R * sh, sg * (ev.fC2S - R * ch), 0]
  const CY = [{ a: 'Am', b: 'Ap' }, { a: 'Ap', b: 'Bp' }, { a: 'Bp', b: 'Mp', c: 'C1p', m: m1(1) }, { a: 'Mp', b: 'Tp', c: 'C2p', m: m2(1) },
              { a: 'Tp', b: 'Tm' }, { a: 'Tm', b: 'Mm', c: 'C2m', m: m2(-1) }, { a: 'Mm', b: 'Bm', c: 'C1m', m: m1(-1) }, { a: 'Bm', b: 'Am' }]
  const skY = await profileSketch(top, 'ThickRearPlanProfile', PY, CY, topLocal)
  const PZ = {
    A: { w: [0, 0, ev.thickClipZ], hd: 0, vd: X('thickClipZ') }, D: { w: [0, 0, -ev.aoR], hd: 0, vd: X('aoR') },
    B: { w: [ev.thickEnd, 0, -ev.aoR], hd: X('thickEnd'), vd: X('aoR') }, M: { w: [ev.fPmX, 0, -ev.fPmS], hd: X('fPmX'), vd: X('fPmS') },
    T: { w: [ev.fC2X, 0, -ev.fPtS], hd: X('fC2X'), vd: X('fPtS') }, E: { w: [ev.fC2X, 0, ev.thickClipZ], hd: X('fC2X'), vd: X('thickClipZ') },
    C1: { w: [ev.thickEnd, 0, -ev.fC1S], hd: X('thickEnd'), vd: X('fC1S') }, C2: { w: [ev.fC2X, 0, -ev.fC2S], hd: X('fC2X'), vd: X('fC2S') } }
  const CZ = [{ a: 'A', b: 'D' }, { a: 'D', b: 'B' }, { a: 'B', b: 'M', c: 'C1', m: [ev.thickEnd + R * sh, 0, -(ev.fC1S + R * ch)] },
              { a: 'M', b: 'T', c: 'C2', m: [ev.fC2X - R * sh, 0, -(ev.fC2S - R * ch)] }, { a: 'T', b: 'E' }, { a: 'E', b: 'A' }]
  const skZ = await profileSketch(front, 'ThickRearSideProfile', PZ, CZ, frontLocal)
  const sY = await api.v1.part.extrusion({ id: partId, name: 'ThickSlab_3_9', references: skY.ids, type: 'SYMMETRIC', limit2: 120 })
  const d1e = await api.v1.part.extrusion({ id: partId, name: 'ThickSlab_Diag1', references: skY.ids, type: 'SYMMETRIC', limit2: 120 })
  const d1 = await api.v1.part.rotation({ id: partId, name: 'ThickSlab_Diag1_rot', targets: [d1e.result], references: [xAxis], angle: Math.PI / 4 })
  const d2e = await api.v1.part.extrusion({ id: partId, name: 'ThickSlab_Diag2', references: skY.ids, type: 'SYMMETRIC', limit2: 120 })
  const d2 = await api.v1.part.rotation({ id: partId, name: 'ThickSlab_Diag2_rot', targets: [d2e.result], references: [xAxis], angle: -Math.PI / 4 })
  const sZ = await api.v1.part.extrusion({ id: partId, name: 'ThickSlab_6', references: skZ.ids, type: 'SYMMETRIC', limit2: 120 })
  const th = await api.v1.part.boolean({ id: partId, name: 'ThickRear', type: 'INTERSECTION', target: sY.result, tools: [d1.result, d2.result, sZ.result] })
  { const u = await api.v1.part.boolean({ id: partId, name: 'BodyThickRear', type: 'UNION', target: body, tools: [th.result] }); body = u.result }
  report.thickRear = { ops: [sY, d1e, d1, d2e, d2, sZ, th].map(lv) }
}

// =========================== 2. clamp bore, cavity (+gas-block channel & slot), rear passage, rear-face bores ===========================
const skB = (await api.v1.sketch.create({ id: partId, planeId: right, name: 'ClampBoreProfile' })).result
const cB = (await api.v1.sketch.circle({ id: skB, centerPos: [0, 0, 0], radius: ev.nutR })).result
await api.v1.sketch.constraint({ id: skB, type: 'FIXATION', geomIds: [(await api.v1.sketch.getPoints({ id: cB })).result.centerId] })
await api.v1.sketch.dimension({ id: skB, name: 'ClampBore_D', type: 'DIAMETER', geomIds: [cB], value: X('nutDia') })
const boreEx = await api.v1.part.extrusion({ id: partId, name: 'ClampBoreTool', references: [cB], type: 'CUSTOM', direction: [0, 0, 1], limit1: -5, limit2: '@expr.clampLen + 1' })
const wpCav = (await api.v1.part.workPlane({ id: partId, name: 'CavityStart', type: 'PLANE', references: [right], offset: X('clampLen') })).result
const cavYZ = mirrorHalf([
  [ev.gsHalf, ev.gsTop, 'gsHalf', 'gsTop'], [ev.gsHalf, ev.chTop, 'gsHalf', 'chTop'], [ev.chHalf, ev.chTop, 'chHalf', 'chTop'],
  [ev.chHalf, ev.chWallBot, 'chHalf', 'chWallBot'], [ev.ai, ev.ai_t, 'ai', 'ai_t'], [ev.ai, -ev.ai_t, 'ai', 'ai_t'], [ev.ai_t, -ev.ai, 'ai_t', 'ai']])
const cav = await polySketch(wpCav, 'CavityProfile', yzVerts(cavYZ, ev.clampLen), rightLocal)
const cavEx = await api.v1.part.extrusion({ id: partId, name: 'CavityTool', references: cav.lines, type: 'UP', limit2: '@expr.Lbody - @expr.clampLen + 5' })
report.cavitySketch = [cav.dimLevel, cav.maxErr]
// gas-block passage through clamp section + tab zone (handguard slides on over the installed gas block)
const pasYZ = mirrorHalf([[ev.chHalf, ev.rpBot, 'chHalf', 'rpBot'], [ev.chHalf, ev.chTop, 'chHalf', 'chTop'],
  [ev.gsHalf, ev.chTop, 'gsHalf', 'chTop'], [ev.gsHalf, ev.gsTop, 'gsHalf', 'gsTop']])
const pas = await polySketch(right, 'GasBlockPassageProfile', yzVerts(pasYZ), rightLocal)
const pasEx = await api.v1.part.extrusion({ id: partId, name: 'GasBlockPassageTool', references: pas.lines, type: 'CUSTOM', direction: [0, 0, 1], limit1: X('rpX0'), limit2: X('rpX1') })
// lightening bores into the rear face: round the barrel nut, in the thick wall, clear of the gas-block
// passage (top), the clamp screws (bottom), the cavity and the rear QD sockets (deeper in)
const rbCS = (await api.v1.part.workCSys({ id: partId, name: 'RearBoreCS', offset: '[-1, @expr.rbY0, @expr.rbZ0]', rotation: [0, Math.PI / 2, 0] })).result // csys z -> world +X
const rb = await api.v1.part.cylinder({ id: partId, name: 'RearBore', references: [rbCS], diameter: X('rbDia'), height: '@expr.rbDepth + 1' })
const rbP = await api.v1.part.circularPattern({ id: partId, name: 'RearBoreArc', targets: [rb.result], references: [xAxis], angle: X('rbStep'), count: X('rbCount'), merged: 1 })
const rbM = await api.v1.part.mirror({ id: partId, name: 'RearBores', targets: [rbP.result], references: [front] })
{ const s = await api.v1.part.boolean({ id: partId, name: 'Hollow', type: 'SUBTRACTION', target: body, tools: [boreEx.result, cavEx.result, pasEx.result, rbM.result] }); body = s.result }

// =========================== 3. added material: keel, tabs, front rails, rear QD rings ===========================
// --- clamp keel: side profile (rear radius, flat, S-sweep into the thick bottom face), extruded to that face's width
const keelP = {
  K1: { w: [0, 0, -ev.keelTopZ], hd: 0, vd: X('keelTopZ') }, K2: { w: [0, 0, -ev.keelRearC], hd: 0, vd: X('keelRearC') },
  K3: { w: [ev.keelRR, 0, -ev.keelBot], hd: X('keelRR'), vd: X('keelBot') }, Pa: { w: [ev.xk, 0, -ev.keelBot], hd: X('xk'), vd: X('keelBot') },
  Pm: { w: [ev.ksPmX, 0, -ev.ksPmZ], hd: X('ksPmX'), vd: X('ksPmZ') }, Pt: { w: [ev.ksC2X, 0, -ev.ksPtZ], hd: X('ksC2X'), vd: X('ksPtZ') },
  K6: { w: [ev.ksC2X, 0, -ev.keelTopZ], hd: X('ksC2X'), vd: X('keelTopZ') },
  Cr: { w: [ev.keelRR, 0, -ev.keelRearC], hd: X('keelRR'), vd: X('keelRearC') },
  C1: { w: [ev.xk, 0, -ev.ksC1Z], hd: X('xk'), vd: X('ksC1Z') }, C2: { w: [ev.ksC2X, 0, -ev.ksC2Z], hd: X('ksC2X'), vd: X('ksC2Z') } }
const kR = ev.ksR, kph = ev.ksPhi, rr = ev.keelRR
const keelC = [{ a: 'K1', b: 'K2' }, { a: 'K2', b: 'K3', c: 'Cr', m: [rr - rr * Math.SQRT1_2, 0, -ev.keelRearC - rr * Math.SQRT1_2] },
  { a: 'K3', b: 'Pa' }, { a: 'Pa', b: 'Pm', c: 'C1', m: [ev.xk + kR * Math.sin(kph / 2), 0, -ev.ksC1Z - kR * Math.cos(kph / 2)] },
  { a: 'Pm', b: 'Pt', c: 'C2', m: [ev.ksC2X - kR * Math.sin(kph / 2), 0, -ev.ksC2Z + kR * Math.cos(kph / 2)] },
  { a: 'Pt', b: 'K6' }, { a: 'K6', b: 'K1' }]
const keelSk = await profileSketch(front, 'KeelProfile', keelP, keelC, frontLocal)
report.keelSketch = [keelSk.level, keelSk.maxErr]
const keelEx = await api.v1.part.extrusion({ id: partId, name: 'ClampKeel', references: keelSk.ids, type: 'SYMMETRIC', limit2: X('keelW') })
const keelBottomZ = x => {
  if (x < ev.keelRR) return -ev.keelRearC - Math.sqrt(Math.max(0, ev.keelRR ** 2 - (ev.keelRR - x) ** 2))
  if (x < ev.xk) return -ev.keelBot
  if (x < ev.ksPmX) return -ev.ksC1Z - Math.sqrt(Math.max(0, ev.ksR ** 2 - (x - ev.xk) ** 2))
  return -ev.ksC2Z + Math.sqrt(Math.max(0, ev.ksR ** 2 - (ev.ksC2X - x) ** 2)) }
let keelNet = 0; { const N = 20000; for (let i = 0; i < N; i++) { const x = ev.ksC2X * (i + 0.5) / N; keelNet += Math.max(0, -ev.aoR - keelBottomZ(x)) * ev.ksC2X / N } }
keelNet *= ev.keelW

// --- anti-rotation tabs
const tabCS = (await api.v1.part.workCSys({ id: partId, name: 'TabCS', offset: '[-@expr.tabLen, @expr.tabY0, @expr.bossWallBot]' })).result
const tab = await api.v1.part.box({ id: partId, name: 'AntiRotTab', references: [tabCS], length: '@expr.tabLen + 1', width: '@expr.bossHalf - @expr.tabY0', height: '@expr.railBase - @expr.bossWallBot' })
const tabs = await api.v1.part.mirror({ id: partId, name: 'AntiRotTabs', targets: [tab.result], references: [front] })
const tabsNet = 2 * ev.tabLen * (ev.bossHalf - ev.tabY0) * (ev.railBase - ev.bossWallBot)

// --- front Picatinny sections: 3/9 (flush QD pad + 4 open slots at the front), 6 o'clock (7 slots at the front)
const hU = ev.picZ1 - ev.railBase, hF = ev.picZ2 - ev.railBase, hN = ev.picZ3 - ev.railBase
const railHalf = [[ev.picH, ev.picTopHalf, X('picH'), X('picTopHalf')], [hU, ev.picMaxHalf, '@expr.picZ1 - @expr.railBase', X('picMaxHalf')],
  [hF, ev.picMaxHalf, '@expr.picZ2 - @expr.railBase', X('picMaxHalf')], [hN, ev.picNeckHalf, '@expr.picZ3 - @expr.railBase', X('picNeckHalf')],
  [-1, ev.picNeckHalf, 1, X('picNeckHalf')]]
const railPts = [...railHalf.map(r => ({ w: [0, r[0], r[1]], vd: r[2], hd: r[3] })), ...railHalf.slice().reverse().map(r => ({ w: [0, r[0], -r[1]], vd: r[2], hd: r[3] }))]
const railSk = await polySketch(right, 'FrontRailProfile', railPts, rightLocal)
const wedgePts = [{ w: [-5, -ev.rampY1, 0], hd: 5, vd: X('rampY1') }, { w: [ev.rampX2, ev.rampYtop, 0], hd: X('rampX2'), vd: X('rampYtop') }, { w: [-5, ev.rampYtop, 0], hd: 5, vd: X('rampYtop') }]
const wedgeSk = await polySketch(top, 'FrontRailRampProfile', wedgePts, topLocal)
// In the rail's own frame (X along it, Y up from the body face, Z across): its slots and its relief
// channel (open at the front end) cut before the rail joins the part.
async function frontRail(tag, slotStartExpr, countExpr, reliefStart, reliefLen) {
  const r = await api.v1.part.extrusion({ id: partId, name: `FrontRail${tag}`, references: railSk.lines, type: 'CUSTOM', direction: [0, 0, 1], limit1: X('segStart'), limit2: X('frontEnd') })
  const w = await api.v1.part.extrusion({ id: partId, name: `FrontRail${tag}Ramp`, references: wedgeSk.lines, type: 'SYMMETRIC', limit2: 40 })
  const wt = await api.v1.part.translation({ id: partId, name: `FrontRail${tag}RampAtStart`, targets: [w.result], references: [xAxis], distance: X('segStart') })
  const cs = (await api.v1.part.workCSys({ id: partId, name: `FrontRail${tag}SlotCS`, offset: `[@expr.${slotStartExpr} - @expr.picSlotW/2, @expr.picH - @expr.picSlotD, -20]` })).result
  const c = await api.v1.part.box({ id: partId, name: `FrontRail${tag}SlotCutter`, references: [cs], length: X('picSlotW'), width: '@expr.picSlotD + 3', height: 40 })
  const p = await api.v1.part.linearPattern({ id: partId, name: `FrontRail${tag}Slots`, targets: [c.result], dir1: { references: [xAxis], distance: X('picPitch'), count: X(countExpr), merged: 1 } })
  const ccs = (await api.v1.part.workCSys({ id: partId, name: `FrontRail${tag}ReliefCS`, offset: `[@expr.${reliefStart}, -2, -@expr.frReliefW/2]` })).result
  const ch = await api.v1.part.box({ id: partId, name: `FrontRail${tag}Relief`, references: [ccs], length: X(reliefLen), width: '@expr.frReliefH + 2', height: X('frReliefW') })
  const s = await api.v1.part.boolean({ id: partId, name: `FrontRail${tag}Cut`, type: 'SUBTRACTION', target: r.result, tools: [wt.result, p.result, ch.result] })
  const m = await api.v1.part.translation({ id: partId, name: `FrontRail${tag}ToFace`, targets: [s.result], references: [yAxis], distance: X('ao') })
  return { id: m.result, levels: [r, w, wt, c, p, s, m].map(lv) }
}
const fs = await frontRail('Side', 'xf0open', 'nFrontOpen', 'frRelS0', 'frRelSLen')
const fsPair = await api.v1.part.mirror({ id: partId, name: 'FrontRails_3_9', targets: [fs.id], references: [front] })
const fb = await frontRail('Bottom', 'xf0B', 'frontPicSlots', 'frRelB0', 'frRelBLen')
const fbRot = await api.v1.part.rotation({ id: partId, name: 'FrontRail_6', targets: [fb.id], references: [xAxis], angle: -Math.PI / 2 })
const widthAt = h => h > ev.picH || h < -1 ? 0 : h >= hU ? 2 * (ev.picTopHalf + (ev.picH - h)) : h >= hF ? 2 * ev.picMaxHalf : h >= hN ? 2 * (ev.picNeckHalf + (h - hN)) : 2 * ev.picNeckHalf
const areaAbove = h0 => { const N = 600; let a = 0; const lo = Math.max(h0, -1); for (let i = 0; i < N; i++) a += widthAt(lo + (ev.picH - lo) * (i + 0.5) / N) * (ev.picH - lo) / N; return a }
let wedgeVol = 0; { const N = 600; for (let i = 0; i < N; i++) { const x = ev.frontRamp * (i + 0.5) / N; wedgeVol += areaAbove(x * ev.picH / ev.frontRamp) * ev.frontRamp / N } }
const railLen = ev.frontEnd - ev.segStart, Arail = shoelace(railPts.map(p => [p.w[2], p.w[1]]))
const railNet = n => Arail * railLen - wedgeVol - n * ev.picSlotW * areaAbove(ev.picH - ev.picSlotD) - 2 * ev.picNeckHalf * 1 * (ev.Lbody - ev.segStart)

// --- boss rings for the rear QD sockets, on the thick rear wall (3/9 o'clock)
const rot = [-Math.PI / 2, 0, 0] // csys z -> world +Y
const ringCS = (await api.v1.part.workCSys({ id: partId, name: 'RearQdRingCS', offset: '[@expr.qdRearX, @expr.aoR - 1, 0]', rotation: rot })).result
const ring = await api.v1.part.cylinder({ id: partId, name: 'RearQdRing', references: [ringCS], diameter: X('qdPadDia'), height: '@expr.qdRingH + 1' })
const rings = await api.v1.part.mirror({ id: partId, name: 'RearQdRings', targets: [ring.result], references: [front] })
const ringsNet = 2 * Math.PI * ev.qdPadR ** 2 * ev.qdRingH

{
  const u = await api.v1.part.boolean({ id: partId, name: 'Handguard', type: 'UNION', target: body, tools: [keelEx.result, tabs.result, rings.result] })
  body = u.result
  const after = await vol()
  const exp = { keel: keelNet, tabs: tabsNet, rings: ringsNet }
  report.union = { level: u.maxLevel, added: typeof after === 'number' ? +(after - bodyVol).toFixed(3) : after, expected: +Object.values(exp).reduce((a, b) => a + b, 0).toFixed(3), parts: exp,
    levels: { tabs: [lv(tab), lv(tabs)], fs: fs.levels, fsPair: lv(fsPair), fb: fb.levels, fbRot: lv(fbRot), rings: [lv(ring), lv(rings)] } }
  if (typeof after !== 'number') return report
  bodyVol = after
}

// =========================== 4. shovel nose (also trims the front rails) ===========================
const nosePts = [
  { w: [ev.Lrail, 0, ev.noseTop], hd: X('Lrail'), vd: X('noseTop') }, { w: [ev.Lrail, 0, -ev.noseBreak], hd: X('Lrail'), vd: X('noseBreak') },
  { w: [ev.L, 0, -ev.noseZ3], hd: X('L'), vd: X('noseZ3') }, { w: [ev.noseX4, 0, -ev.noseZ4], hd: X('noseX4'), vd: X('noseZ4') },
  { w: [ev.noseX4, 0, ev.noseTop], hd: X('noseX4'), vd: X('noseTop') }]
const noseSk = await polySketch(front, 'ShovelNoseProfile', nosePts, frontLocal)
const noseEx = await api.v1.part.extrusion({ id: partId, name: 'ShovelNoseTool', references: noseSk.lines, type: 'SYMMETRIC', limit2: 100 })
await late('ShovelNose', [noseEx.result])

// =========================== 4b. internal relief channels under the front 3/9 and 6 o'clock rails ===========================
// like the gas-block slot under the top rail: from the cavity through the wall up into the rail neck, open through the front end
const relSCS = (await api.v1.part.workCSys({ id: partId, name: 'FrontRailReliefSideCS', offset: '[@expr.frRelS0, @expr.ai - 1, -@expr.frRelBodyW/2]' })).result
const relS = await api.v1.part.box({ id: partId, name: 'FrontRailReliefSide', references: [relSCS], length: X('frRelSLen'), width: X('frRelBodyDepth'), height: X('frRelBodyW') })
const relSPair = await api.v1.part.mirror({ id: partId, name: 'FrontRailRelief_3_9', targets: [relS.result], references: [front] })
const relBCS = (await api.v1.part.workCSys({ id: partId, name: 'FrontRailReliefBottomCS', offset: '[@expr.frRelB0, -@expr.frRelBodyW/2, -(@expr.ao + 0.5)]' })).result
const relB = await api.v1.part.box({ id: partId, name: 'FrontRailRelief_6', references: [relBCS], length: X('frRelBLen'), width: X('frRelBodyW'), height: X('frRelBodyDepth') })
await late('FrontRailReliefs', [relSPair.result, relB.result])

// =========================== 5. clamp: split + relief, 2x 1/4-28 screws ===========================
const spCS = (await api.v1.part.workCSys({ id: partId, name: 'SplitCS', offset: '[-5, -@expr.splitW/2, @expr.splitZ0]' })).result
const split = await api.v1.part.box({ id: partId, name: 'ClampSplitTool', references: [spCS], length: X('splitLenX'), width: X('splitW'), height: X('splitH') })
const relCS = (await api.v1.part.workCSys({ id: partId, name: 'SplitReliefCS', offset: '[@expr.splitEnd, 0, @expr.reliefZ0]' })).result
const relief = await api.v1.part.cylinder({ id: partId, name: 'SplitReliefTool', references: [relCS], diameter: X('reliefDia'), height: X('reliefH') })
await cut('ClampSplit', [split.result, relief.result])
const screwParts = [['Counterbore', '[@expr.screwX1, @expr.keelHalf - @expr.cbDepth, -@expr.screwZ]', 'cbDia', '@expr.cbDepth + 5'],
                    ['Clearance', '[@expr.screwX1, -1, -@expr.screwZ]', 'screwClear', '@expr.keelHalf + 1'],
                    ['TapDrill', '[@expr.screwX1, -@expr.keelHalf - 2, -@expr.screwZ]', 'tapDia', '@expr.keelHalf + 2']]
for (const [tag, off, dia, h] of screwParts) {  // separate tools: coaxial merged cylinders broke the boolean
  const cs = (await api.v1.part.workCSys({ id: partId, name: `Screw${tag}CS`, offset: off, rotation: rot })).result
  const c = await api.v1.part.cylinder({ id: partId, name: `Screw${tag}`, references: [cs], diameter: X(dia), height: h })
  const p = await api.v1.part.linearPattern({ id: partId, name: `Screw${tag}Pattern`, targets: [c.result], dir1: { references: [xAxis], distance: X('screwSpacing'), count: 2, merged: 1 } })
  await cut(`ClampScrew${tag}`, [p.result])
}
// spot faces: the screws sit higher than the keel's flat sides reach, so each gets a flat round seat on
// both sides, a hair into the keel side, through the corner where the keel meets the lower diagonal face
{
  const cs = (await api.v1.part.workCSys({ id: partId, name: 'ScrewSpotFaceCS', offset: '[@expr.screwX1, @expr.keelHalf - @expr.spotDepth, -@expr.screwZ]', rotation: rot })).result
  const c = await api.v1.part.cylinder({ id: partId, name: 'ScrewSpotFace', references: [cs], diameter: X('spotDia'), height: 20 })
  const p = await api.v1.part.linearPattern({ id: partId, name: 'ScrewSpotFacePattern', targets: [c.result], dir1: { references: [xAxis], distance: X('screwSpacing'), count: 2, merged: 1 } })
  const m = await api.v1.part.mirror({ id: partId, name: 'ScrewSpotFaces', targets: [p.result], references: [front] })
  await cut('ScrewSpotFaces', [m.result])
}

// =========================== 6. top rail: MIL-STD-1913 cross slots ===========================
const gCS = (await api.v1.part.workCSys({ id: partId, name: 'TopRailSlotCS', offset: '[@expr.xg0 - @expr.picSlotW/2, -15, @expr.rt - @expr.picSlotD]' })).result
const gBox = await api.v1.part.box({ id: partId, name: 'TopRailSlotCutter', references: [gCS], length: X('picSlotW'), width: 30, height: '@expr.picSlotD + 2' })
const gPat = await api.v1.part.linearPattern({ id: partId, name: 'TopRailSlotPattern', targets: [gBox.result], dir1: { references: [xAxis], distance: X('picPitch'), count: X('nTop'), merged: 1 } })
await cut('TopRailSlots', [gPat.result])

// =========================== 7. M-LOK: 3/6/9 rows + offset diagonal rows ===========================
const wpA = (await api.v1.part.workPlane({ id: partId, name: 'MlokSidePlane', type: 'PLANE', references: [front], offset: X('ao') })).result
const skA = await mlokSketch(wpA, 'MlokSlotA')
const eA = await api.v1.part.extrusion({ id: partId, name: 'MlokCutterA', references: skA.ids, type: 'SYMMETRIC', limit2: X('mlCutDepth') })
const tA = await api.v1.part.translation({ id: partId, name: 'MlokCutterA_toFirst', targets: [eA.result], references: [xAxis], distance: X('xA0') })
const pA = await api.v1.part.linearPattern({ id: partId, name: 'MlokRowA', targets: [tA.result], dir1: { references: [xAxis], distance: X('mlokPitch'), count: X('nA'), merged: 1 } })
const cA = await api.v1.part.circularPattern({ id: partId, name: 'MlokRows_3_6_9', targets: [pA.result], references: [xAxis], angle: -Math.PI / 2, count: 3, merged: 1 })
await cut('MlokCut_3_6_9', [cA.result])
const wpBL = (await api.v1.part.workPlane({ id: partId, name: 'MlokLowerDiagPlane', normal: [0, Math.SQRT1_2, -Math.SQRT1_2], position: [0, 0, 0], offset: X('ao') })).result
const skBL = await mlokSketch(wpBL, 'MlokSlotBL')
const eBL = await api.v1.part.extrusion({ id: partId, name: 'MlokCutterBL', references: skBL.ids, type: 'SYMMETRIC', limit2: X('mlCutDepth') })
const tBL = await api.v1.part.translation({ id: partId, name: 'MlokCutterBL_toFirst', targets: [eBL.result], references: [xAxis], distance: X('xB0') })
const pBL = await api.v1.part.linearPattern({ id: partId, name: 'MlokRowBL', targets: [tBL.result], dir1: { references: [xAxis], distance: X('mlokPitch'), count: X('nB'), merged: 1 } })
const mBL = await api.v1.part.mirror({ id: partId, name: 'MlokRowsLowerDiag', targets: [pBL.result], references: [front] })
await cut('MlokCut_LowerDiag', [mBL.result])
const wpBU = (await api.v1.part.workPlane({ id: partId, name: 'MlokUpperDiagPlane', normal: [0, Math.SQRT1_2, Math.SQRT1_2], position: [0, 0, 0], offset: X('ao') })).result
const skBU = await mlokSketch(wpBU, 'MlokSlotBU')
const eBU = await api.v1.part.extrusion({ id: partId, name: 'MlokCutterBU', references: skBU.ids, type: 'SYMMETRIC', limit2: X('mlCutDepth') })
const axU = (await api.v1.part.workAxis({ id: partId, name: 'UpperDiagFaceDir', position: [0, 0, 0], direction: [0, Math.SQRT1_2, -Math.SQRT1_2] })).result
const sBU = await api.v1.part.translation({ id: partId, name: 'MlokCutterBU_shift', targets: [eBU.result], references: [axU], distance: X('dUpper') })
const tBU = await api.v1.part.translation({ id: partId, name: 'MlokCutterBU_toFirst', targets: [sBU.result], references: [xAxis], distance: X('xB0') })
const pBU = await api.v1.part.linearPattern({ id: partId, name: 'MlokRowBU', targets: [tBU.result], dir1: { references: [xAxis], distance: X('mlokPitch'), count: X('nB'), merged: 1 } })
const mBU = await api.v1.part.mirror({ id: partId, name: 'MlokRowsUpperDiag', targets: [pBU.result], references: [front] })
await cut('MlokCut_UpperDiag', [mBU.result])
report.mlokSketches = [skA.level, skBL.level, skBU.level]

// =========================== 8. QD sockets: 2 front (3/9 rail pads), 2 rear (3/9 rings on the thick wall) ===========================
async function qdPair(tag, offset, dia, height, into = cut) {
  const cs = (await api.v1.part.workCSys({ id: partId, name: `${tag}CS`, offset, rotation: rot })).result
  const c = await api.v1.part.cylinder({ id: partId, name: tag, references: [cs], diameter: X(dia), height })
  const m = await api.v1.part.mirror({ id: partId, name: `${tag}Pair`, targets: [c.result], references: [front] })
  await into(`${tag}Cut`, [m.result])
}
await qdPair('FrontQdBore', '[@expr.xQdF, @expr.ai - 1, 0]', 'qdBore', '@expr.wallIn*@expr.inch + @expr.picH + 2', late)
await qdPair('FrontQdLockGroove', '[@expr.xQdF, @expr.ao + @expr.picH - @expr.qdLock - @expr.qdGrooveW, 0]', 'qdGrooveDia', X('qdGrooveW'), late)
await qdPair('RearQdBore', '[@expr.qdRearX, @expr.ai - 1, 0]', 'qdBore', '@expr.aoR + @expr.qdRingH + 2 - @expr.ai')
await qdPair('RearQdLockGroove', '[@expr.qdRearX, @expr.aoR + @expr.qdRingH - @expr.qdLock - @expr.qdGrooveW, 0]', 'qdGrooveDia', X('qdGrooveW'))

{ const s = await api.v1.part.boolean({ id: partId, name: 'Cuts', type: 'SUBTRACTION', target: body, tools: CUTS }); body = s.result }
// the front rails join, and the cuts that touch them are made: the nose, the channels' openings, the front QD sockets
{ const u = await api.v1.part.boolean({ id: partId, name: 'FrontRails', type: 'UNION', target: body, tools: [fsPair.result, fbRot.result] }); body = u.result }
{ const s = await api.v1.part.boolean({ id: partId, name: 'RailCuts', type: 'SUBTRACTION', target: body, tools: LATE }); body = s.result }
const mp = (await api.v1.part.calculateMassProperties({ id: partId })).result
report.final = { volume_mm3: mp.volume, cog: mp.cog, mass_6061_g: mp.volume * 2.70e-3, mass_6061_oz: mp.volume * 2.70e-3 / 28.3495 }
report.counts = { topRailSlots: ev.nTop, mlok_3_6_9_perRow: ev.nA, mlok_diag_perRow: ev.nB, 
  frontSideOpenSlots: ev.nFrontOpen, frontBottomSlots: ev.frontPicSlots }
report.layout_in = Object.fromEntries(['qdRearX', 'thickEnd', 'flowEnd', 'mStart', 'xA0', 'segStart', 'xf0', 'xf0B', 'xQdF', 'frRelS0', 'frRelB0', 'Lrail', 'L'].map(k => [k, +(ev[k] / 25.4).toFixed(3)]))
report.seconds = (Date.now() - T0) / 1000
return report
