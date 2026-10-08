# Handguard

**Size it. Rail it. Order it.** A web shop for a parametric part, built on one OFB file.

An AR-15 free-float handguard, made to order. Set its length, how much Picatinny it carries up
front, its shovel nose and how the thick rear flows into the body; pick a finish (flat dark earth,
or black); order it. Every control on the page is a parameter of the model in
[`cad/handguard.ofb`](cad/handguard.ofb). ClassCAD runs in the page as WebAssembly and
rebuilds the part from that model at every change; the page draws what it built, and the weight and
the price follow the volume ClassCAD measures.

## From file to part

The whole round trip, with [buerli.io](https://buerli.io)'s `@buerli.io/classcad`:

```js
import { init, WASMClient, BuerliCadFacade } from '@buerli.io/classcad'

// ClassCAD, in the page
init(drawingId => new WASMClient(drawingId, { token: import.meta.env.VITE_CLASSCAD_TOKEN }))
const facade = new BuerliCadFacade()
await facade.connect('handguard')
const api = facade.api.v1

// the model, with its history (it travels gzipped: 6.8 MB of history packs into 640 kB)
const packed = (await fetch('/handguard.ofb.gz')).body
const data = await new Response(packed.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
const { id: part } = await api.common.load({ data, format: 'OFB', doClear: true })

// a parameter changed: the part is rebuilt from its history
await api.part.updateExpression({ id: part, toUpdate: [{ name: 'lengthIn', value: 12 }] })

// what was built: its volume, and its faces and edges, ready for three.js
const { volume } = await api.part.calculateMassProperties({ id: part })
const { containers } = await facade.graphic()
```

That is the heart of [`src/engine.js`](src/engine.js). Changes are queued so that ClassCAD always
works on the newest one: a slider swept across its track is a rebuild or two, and the part changes
once more, to where the hand lets go.

## The model

[`cad/handguard.ofb`](cad/handguard.ofb) is the whole model (the page fetches it gzipped, as
`public/handguard.ofb.gz`), built by [`cad/build.js`](cad/build.js): an octagonal body with a MIL-STD-1913 rail on top, a thick rear
section round the barrel nut that flows into the body on S-curves, a split clamp with two 1/4-28
screws on spot faces and a keel, Picatinny sections at 3, 6 and 9 o'clock up front, a shovel nose,
M-LOK slots on every face but the top, four QD sockets, lightening slots and holes along every rail,
and lightening bores in the rear face round the barrel nut. It has 239 named expressions; four of them are the shop's controls, and the rest follow from those, in the
model itself: how many rail slots there are, how many M-LOK slots fit in each row, where the QD
sockets and the thick rear end.

| Expression      | What it is                                                         | Starts at |
| --------------- | ------------------------------------------------------------------ | --------: |
| `lengthIn`      | the overall length, rear face to the nose tip (inch)               |        10 |
| `frontPicSlots` | slots in each Picatinny section up front (the 3/9 ones: 3 under the QD pad) |  7 |
| `noseExtIn`     | how far the shovel nose reaches past the end of the top rail (inch) |      0.3 |
| `flowRIn`       | the radius on which the thick rear flows into the body (inch)      |       0.9 |

The page works the model's expressions out itself too ([`src/model/exprs.js`](src/model/exprs.js),
over [`src/model/expressions.json`](src/model/expressions.json)), to know what a configuration has
before ClassCAD answers (its slots, at once), and which configurations the model builds: the
controls stop where a row of M-LOK slots would come out empty or a slot pattern would have a single
slot. The price is made up for the demo (CHF 89, plus 0.85 per cm³ of part, plus 35 for the
Cerakote), and there is no checkout.

### Built to rebuild fast

The model is rebuilt on every change, so it is built for that. Compared with the first build of the
same part, rev 3:

- makes the thick rear one intersection of its four slabs, and joins it to the body at once;
- cuts the clamp bore, the cavity and the gas-block passage in one subtraction;
- collects every other cut (nose, rail reliefs, clamp split and screws, rail slots, lightening,
  M-LOK, QD) and makes them in a single subtraction at the end;
- cuts the front rails' lightening and relief channels into the rails before they join the part,
  and joins them after the large subtraction, with the few cuts that touch them (the nose, the
  channels' openings, the front QD sockets) in a small one of their own;
- draws the lightening slots and holes and the M-LOK slots with flat sides: their round ends and
  corners as tangent facets. A boolean cuts flat faces several times faster than round ones; the
  slots come out a hair larger at the corners (the part 0.03 % lighter), which no accessory notices.

In the browser that took a rebuild of the first build's part at 8½–12″ from 2.6–3.3 s to
1.7–2.0 s, and at 16″ from 4.7–5.4 s to 3.1–3.6 s, for every one of the four parameters. The part
has more to it since (the front rails' lightening, the spot faces, the rear-face bores): it rebuilds
in 2.2–3.2 s at 10–12″ and in about 4.5 s at 16″ (the shop goes from 10″ to 15″). `bench-build.html` measured it: it
replays a build script in the page's own engine (`?build=build`, or `?build=original` for the first
build, in `cad/builds`), times every rebuild of a sequence of changes (`?seq=lengthIn:12,…`), and
can save the model it built (`?save=handguard.ofb`, into `cad/out`, with `npm run dev`).
`bench.html` times the shop's own file the same way.

## The photo

Where the browser has WebGPU, the part is shown as a photo: path traced in the page, by compute
shaders of the shop's own ([`src/photo`](src/photo)), over the drawing. The drawing stays a click
away, and is what browsers without WebGPU show.

- **The part**: ClassCAD's triangles (about nine thousand) in a bounding volume hierarchy, built in a
  few milliseconds whenever a rebuild lands ([`bvh.js`](src/photo/bvh.js)).
- **The light**: a studio of three softboxes (one large overhead, a long strip either side along the
  part) over a soft grey surround, and a floor that bounces light back up into the slots.
  Softboxes are sampled directly and weighed against the material's own sampling (multiple
  importance sampling); paths go up to six bounces.
- **The finishes**: a microfacet material (GGX, its visible normals sampled) over a diffuse base.
  Hard anodized black is satin and a little metallic; Cerakote flat dark earth is matte, with a fine
  orange peel in its normal.
- **The edges**: a machined part's edges are broken, a model's are knives. Each triangle knows which
  of its edges are the part's sharp edges and the face across them
  ([`mesh.js`](src/photo/mesh.js)), and the tracer turns the normal toward that face within half a
  millimetre of the edge, so the edges catch the light as a real part's do.
- **The shadow**: rays that pass the part and meet the floor measure how much of the light the part
  keeps from that point; that is laid over the page as the shadow, and the page shows everywhere else.
- **The picture**: Khronos PBR Neutral tone mapping (the finish's own colour kept). While the camera
  moves, the picture is made at half size, a few samples a frame, through an edge-aware à-trous
  filter; once it rests, at full size, until it has 768 samples a pixel, and then nothing is drawn.

## Run it

```bash
npm install
npm run dev
```

Then open <http://localhost:5175>. The first start downloads the engine.

ClassCAD's key is fetched with the public access token in `.env` (`VITE_CLASSCAD_TOKEN`). A `ccpk_`
token is made to sit in a web page: it only yields keys on its account's registered domains, and on
localhost. To publish on a domain of your own, use a token from your own ClassCAD account.

`npm run build` builds the static site into `dist/`, and `npm run format` formats the code
(Prettier). `npm run deploy` builds it and publishes it on Firebase Hosting (project
`awv-informatik`, site `handguard-classcad-ai`).

## How the code is laid out

- `cad/handguard.ofb`: the model (`public/handguard.ofb.gz`, as the page fetches it);
  `cad/build.js`, the script that builds it.
- `src/engine.js`: the CAD session: the calls above, the queue, and a new session should the old
  one ever die.
- `src/main.jsx`, `src/Session.jsx`: ClassCAD started in the page (buerli's React hook,
  `useBuerliCadFacade`), and its session handed to the engine.
- `src/store.js`: the page's state (zustand): how far the engine is, what the controls want, what
  was last built, the finish, and the cart.
- `src/design.js`: the shop's own rules: the controls' ranges, which configurations the model
  builds, what a configuration has, the weight and the price.
- `src/photo/`: the photo: the path tracer (WGSL), its hierarchy, its passes; `src/three/Photo.jsx`
  hands it the camera and the part each frame.
- `src/three/`: the part, drawn from ClassCAD's tessellation in a dark CAD look. `body.js` turns it
  into faces, edges and silhouettes; `Part.jsx` draws them in the chosen finish;
  `Frame.jsx` adds the frame's passes: ambient occlusion, and the orange outline the CAD app draws
  round what is in hand; `View.jsx` is the
  turning view, which keeps the part framed whatever its length.
- `src/ui/`: the page. `Card` is the configurator, `Stage` holds the part (and draws the model's
  first sketch while the engine starts), `Specs` is what the part has, under it, and `Giant`,
  `Cart` and `Nav` are the rest. The
  layout fits any screen, from a phone held upright to a wide monitor.
