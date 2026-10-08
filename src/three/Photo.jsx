// The photo, in the drawing's frame loop: the same camera, the same part where the drawing puts it,
// handed to the path tracer (src/photo) each frame, which draws into its own canvas over the drawing's.
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useShop } from '../store'
import { createPhoto } from '../photo/renderer'
import { MASK } from './Frame'

export function Photo() {
  const canvas = useShop(s => s.photoCanvas)
  const scene = useThree(s => s.scene)
  const ref = useRef({ photo: null, body: null })
  if (import.meta.env.DEV) window.__photo = ref // (for checking the picture from the console)

  // (WebGPU, where the browser has it; the drawing everywhere else)
  useEffect(() => {
    if (!canvas) return
    let dead = false
    createPhoto(canvas)
      .then(photo => {
        if (dead) return
        ref.current = { photo, body: null }
        useShop.setState({ photoOK: !!photo })
      })
      .catch(() => !dead && useShop.setState({ photoOK: false }))
    return () => {
      dead = true
    }
  }, [canvas])

  useFrame(({ camera }) => {
    const { photo } = ref.current
    const s = useShop.getState()
    if (!photo || s.look !== 'photo' || !s.body) return
    if (photo.lost) return useShop.setState({ photoOK: false })
    // the part as the drawing has it, once the drawing has the new one
    let mesh = null
    scene.traverse(o => o.isMesh && o.layers.isEnabled(MASK) && (mesh = o))
    if (!mesh || mesh.geometry !== s.body.geometry) return
    if (ref.current.body !== s.body) {
      mesh.updateWorldMatrix(true, false)
      photo.setScene(s.body, mesh.matrixWorld)
      ref.current.body = s.body
    }
    photo.setFinish(s.finish)
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    photo.resize(Math.round(canvas.clientWidth * dpr), Math.round(canvas.clientHeight * dpr))
    // (the drawing's render brings the camera's matrices up to date; with the drawing resting, the
    // controls have only moved it, turned it half: its matrices are brought up to date here)
    camera.updateMatrixWorld()
    photo.render(camera)
  }, 2)
  return null
}
