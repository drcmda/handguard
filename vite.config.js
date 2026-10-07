import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// (dev only: the build bench saves the model it built into cad/out, POST /__save/<name>.ofb)
const save = {
  name: 'save-model',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/__save/', (req, res) => {
      const name = path.basename(decodeURIComponent(req.url.split('?')[0]))
      if (req.method !== 'POST' || !/^[\w.-]+\.ofb$/.test(name)) return (res.statusCode = 400), res.end()
      const chunks = []
      req.on('data', c => chunks.push(c))
      req.on('end', () => {
        const data = Buffer.concat(chunks)
        fs.mkdirSync('cad/out', { recursive: true })
        fs.writeFileSync(path.join('cad/out', name), data)
        res.end(String(data.length))
      })
    })
  },
}

export default defineConfig({
  plugins: [react(), save],
  server: { port: 5175, strictPort: true },
})
