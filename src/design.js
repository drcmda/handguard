// The shop's own rules for the handguard, in the model's own math: its 239 expressions
// (src/model/expressions.json, as cad/handguard.ofb has them) worked out in the page. ClassCAD
// builds the part; this is only what the page must know before ClassCAD answers: which
// configurations the controls allow, what a configuration has (its slots, its weight), the price,
// and the small drawing of a part from its numbers (the cart).
import EXPRESSIONS from './model/expressions.json'
import { evaluate } from './model/exprs'

// The model's parameters, as the shop starts them (and handguard.ofb has them): 10 inches, seven
// Picatinny slots up front, the short shovel nose (0.3″ out), the rear flowing into the middle on the
// long, 0.9″ radius.
export const BASE = { lengthIn: 10, frontPicSlots: 7, noseExtIn: 0.3, flowRIn: 0.9 }
export const PARAMS = Object.keys(BASE)
export const RANGE = { lengthIn: [8.5, 16], frontPicSlots: [5, 11] }
export const LENGTH_STEP = 0.5
export const NOSES = [
  { value: 0.3, label: 'Short' },
  { value: 0.6, label: 'Standard' },
  { value: 1, label: 'Long' },
]
export const FLOWS = [
  { value: 0.25, label: 'Tight' },
  { value: 0.5, label: 'Standard' },
  { value: 0.9, label: 'Long' },
]

// The finishes: the part's colour in each, its swatch, and how a sentence says it.
export const FINISHES = [
  { key: 'black', label: 'Black', word: 'black', process: 'hard anodized', color: '#4b5059', swatch: '#1c1e22' },
  { key: 'fde', label: 'FDE', word: 'flat dark earth', process: 'Cerakote', color: '#ad9472', swatch: '#8b7355' },
]
export const finishOf = key => FINISHES.find(f => f.key === key) ?? FINISHES[0]

// What a configuration has, from the model's own formulas: its length, the slots on the top rail,
// the Picatinny openings up front, the M-LOK slots in a row at 3, 6 and 9 o'clock and on each of
// the four diagonals, and the other pattern counts the model's features are built with; and any
// other of its numbers (at), for drawing it.
const memo = new Map()
export function counts(c) {
  const key = PARAMS.map(k => c[k]).join()
  let v = memo.get(key)
  if (!v) {
    const e = evaluate(EXPRESSIONS, c)
    v = {
      L: e.get('L'),
      top: e.get('nTop'),
      front: e.get('nFrontOpen'),
      rowA: e.get('nA'),
      rowB: e.get('nB'),
      patterns: ['nSH', 'nTS', 'shK0', 'tsK0'].map(n => e.get(n)),
      at: n => e.get(n),
    }
    v.mlok = 3 * v.rowA + 4 * v.rowB
    memo.set(key, v)
  }
  return v
}

// Is a configuration one the model builds? Every row of M-LOK slots has a slot in it, and every
// pattern at least two (a front rail opening patterned once is where the engine gives up).
export function sound(c) {
  const n = counts(c)
  return n.rowA >= 1 && n.rowB >= 1 && n.front >= 2 && n.top >= 2 && n.patterns.every(p => Number.isFinite(p) && p >= 2)
}

// The shortest length a configuration allows, and the most Picatinny slots up front it takes.
export function minLength(c) {
  for (let L = RANGE.lengthIn[0]; L < RANGE.lengthIn[1]; L += LENGTH_STEP) if (sound({ ...c, lengthIn: L })) return L
  return RANGE.lengthIn[1]
}
export function maxFront(c) {
  for (let n = RANGE.frontPicSlots[1]; n > RANGE.frontPicSlots[0]; n--) if (sound({ ...c, frontPicSlots: n })) return n
  return RANGE.frontPicSlots[0]
}

// The weight, in 6061 (2.70 g/cm³), from the volume ClassCAD measures.
export const grams = volume => (volume * 2.7) / 1000
export const ounces = volume => grams(volume) / 28.3495

// The price follows the part: the machining by the aluminium that is left, Cerakote extra.
export const priceOf = (volume, finish) => 89 + (0.85 * volume) / 1000 + (finish === 'fde' ? 35 : 0)
export const chf = v => v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

// A length as a shop says it: 10″, 12½″.
export const inch = v => {
  const w = Math.floor(v + 1e-6)
  const q = Math.round((v - w) * 4)
  return `${w}${['', '¼', '½', '¾'][q]}″`
}
