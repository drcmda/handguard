// What the page knows: how far the engine is, what the controls want, what the model is (as the
// engine last built it), how long a rebuild takes, and the cart.
import { create } from 'zustand'
import { BASE } from './design'

const CART = 'handguard.cart'
const loadCart = () => {
  try {
    const c = JSON.parse(localStorage.getItem(CART) ?? '[]')
    return Array.isArray(c) ? c : []
  } catch {
    return []
  }
}
const saveCart = cart => {
  try {
    localStorage.setItem(CART, JSON.stringify(cart))
  } catch {}
}

export const useShop = create((set, get) => ({
  // the engine: booting, loading the model, ready (or not)
  status: 'boot',
  note: 'Starting ClassCAD',
  error: null,
  busy: false,
  // a rebuild under way: when it began, and how long the last ones took (for its progress bar)
  since: null,
  took: 2800,
  // what the controls want, and what the model is
  want: BASE,
  solved: null,
  body: null,
  volume: null,
  finish: 'fde',
  // how the part is shown: path traced ('photo', where the browser has WebGPU) or drawn
  look: 'photo',
  photoOK: null,
  photoCanvas: null,
  // what was just changed, and when (the page shows it, large, for a moment)
  touch: null,
  // the cart
  cart: loadCart(),
  cartOpen: false,

  setFinish: finish => set({ finish, touch: { key: 'finish', at: performance.now() } }),
  openCart: open => set({ cartOpen: open }),
  addToCart: item => {
    const cart = [...get().cart]
    const same = cart.find(i => i.key === item.key)
    if (same) same.qty += 1
    else cart.push({ ...item, qty: 1 })
    saveCart(cart)
    set({ cart })
  },
  setQty: (key, qty) => {
    const cart = get()
      .cart.map(i => (i.key === key ? { ...i, qty } : i))
      .filter(i => i.qty > 0)
    saveCart(cart)
    set({ cart })
  },
}))
