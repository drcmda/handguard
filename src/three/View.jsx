// The part's room in the page: no walls, no floor, the page itself behind it. The part is shaded with
// ambient occlusion; it stands still until a hand turns it, and stops where the hand lets go (no easing
// out: the photo starts gathering the moment it rests); while the engine rebuilds, a sweep of light runs
// along it.
import { useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Part } from './Part'
import { Frame } from './Frame'
import { Photo } from './Photo'
import { useShop } from '../store'
import { finishOf } from '../design'

// The camera keeps the part framed whatever shape the room has (wide, tall, small): it aims at the
// part's middle, and stands back so that its length spans a good part of the room's width, and,
// turned towards the camera, still fits its height. A longer part still looks longer, only not by as
// much as it is.
function Rig() {
  const length = useShop(s => (s.solved?.lengthIn ?? 10) * 25.4)
  const camera = useThree(s => s.camera)
  const size = useThree(s => s.size)
  const controls = useThree(s => s.controls)
  useFrame((_, dt) => {
    const k = 1 - Math.exp(-dt * 4)
    // (eased, and once within a hair of where it is going, there: a camera that has arrived does not
    // creep on by ever smaller steps, which the photo would gather as blur)
    if (controls) {
      const t = controls.target
      const gap = length / 2 - t.x
      const dx = Math.abs(gap) < 0.01 ? gap : gap * k
      t.x += dx
      camera.position.x += dx
    }
    const aspect = size.width / Math.max(1, size.height)
    const tv = Math.tan((camera.fov * Math.PI) / 360)
    const fill = 0.72 * Math.pow(length / 254, 0.3)
    // (the width it spans across the view; the height it takes, seen end on from above: 0.4 of its
    // length, and its own height)
    const want = Math.max((length * 0.5) / fill / (tv * aspect), ((0.4 * length + 64) * 0.5) / 0.86 / tv)
    const target = controls?.target
    if (!target) return
    const off = camera.position.clone().sub(target)
    const d = off.length()
    if (Math.abs(want - d) < 0.02) return
    camera.position.copy(target).addScaledVector(off, (d + (want - d) * k) / d)
  })
  return null
}

export function View() {
  const body = useShop(s => s.body)
  const photo = useShop(s => s.look === 'photo' && s.photoOK)
  const finish = useShop(s => s.finish)
  // the sweep of light while a rebuild runs: from the rear face to the muzzle, again and again
  const scan = useRef(() => {
    const s = useShop.getState()
    if (!s.busy || s.since == null) return null
    const L = (s.solved?.lengthIn ?? 10) * 25.4
    const u = ((performance.now() - s.since) / 1400) % 1
    return { x: -20 + u * (L + 40), k: 0.32 * Math.sin(Math.PI * u) }
  }).current
  return (
    <Canvas
      className="canvas"
      // (under the photo the drawing's canvas shows nothing, whatever WebGL was last told to clear to:
      // invisible, but still the surface a hand turns the part on)
      style={{ opacity: photo ? 0 : 1 }}
      flat
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      camera={{ fov: 26, near: 10, far: 6000, position: [127 + 330, 260, 500] }}>
      <Part body={body} color={finishOf(finish).color} scan={scan} />
      <Rig />
      <Frame body={body} />
      <Photo />
      <OrbitControls
        makeDefault
        target={[127, 0, 0]}
        enableDamping={false}
        enablePan={false}
        enableZoom={false}
        minPolarAngle={0.35}
        maxPolarAngle={photo ? 1.5 : 1.75}
      />
    </Canvas>
  )
}
