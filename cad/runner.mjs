// Runs an export script against a live ClassCAD session, through the same @classcad/script session
// and api the agents use (installed in the classcad-ai checkout beside this repo). The MCP's own
// session works: join it as a guest with its invite (CC_WS=ws://127.0.0.1:<port>/session/?invite=<token>).
// The drawing is left as the script leaves it.
//   CC_WS=… node cad/runner.mjs cad/<script>.mjs [args]
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
const require = createRequire(new URL('../../classcad-ai/package.json', import.meta.url))
const { connectSession, buildScriptApi } = await import(pathToFileURL(require.resolve('@classcad/script/node')).href)
const registry = require('@classcad/skill/method-registry.json')
// (a model with its history is a large graphic: the client takes frames of any size, not ws's 100 MiB)
const WS = require('ws')
const setSocket = WS.prototype.setSocket
WS.prototype.setSocket = function (socket, head, options) { return setSocket.call(this, socket, head, { ...options, maxPayload: 0 }) }
const session = await connectSession(process.env.CC_WS ?? 'ws://0.0.0.0:9094/', { connectTimeoutMs: 15000, requestTimeoutMs: +(process.env.CC_TIMEOUT ?? 600000) })
const api = buildScriptApi(session, { registry, strict: true })
const mod = await import(pathToFileURL(path.resolve(process.argv[2])).href)
try { await mod.default(api, process.argv.slice(3)) }
catch (e) { console.error('script error:', e.stack ?? e.message); process.exitCode = 1 }
finally {
  try { await session.close?.() ?? session.disconnect?.() } catch {}
  process.exit(process.exitCode ?? 0)
}
