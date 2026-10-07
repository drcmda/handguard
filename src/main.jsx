// The page starts: ClassCAD's WebAssembly client is set up, and the shop is drawn.
import { createRoot } from 'react-dom/client'
import { init, WASMClient } from '@buerli.io/classcad'
import './fonts/fonts.css'
import './styles.css'
import { App } from './App'
import { useShop } from './store'

// (the page's state, to look at from the console while developing)
if (import.meta.env.DEV) window.shop = useShop

// ClassCAD runs in the page, as WebAssembly. Its key is fetched with the shop's public access token,
// which only yields keys on the shop's own domain and on localhost.
const token = import.meta.env.VITE_CLASSCAD_TOKEN
init(drawingId => new WASMClient(drawingId, { token }))

createRoot(document.getElementById('root')).render(<App />)
