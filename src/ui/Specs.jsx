// What the part has, under it: its length, the slots on its top rail, its M-LOK slots, its weight.
// The counts are the model's own formulas, worked out at once; the weight follows the last rebuild.
import { useShop } from '../store'
import { counts, inch, ounces } from '../design'

export function Specs() {
  const want = useShop(s => s.want)
  const volume = useShop(s => s.volume)
  const n = counts(want)
  const specs = [
    [inch(want.lengthIn), 'long'],
    [n.top, 'top slots'],
    [n.mlok, 'M-LOK'],
    [volume != null ? ounces(volume).toFixed(1) : '—', 'oz'],
  ]
  return (
    <div className="specs">
      {specs.map(([v, k]) => (
        <div key={k}>
          <b>{v}</b>
          <span>{k}</span>
        </div>
      ))}
    </div>
  )
}
