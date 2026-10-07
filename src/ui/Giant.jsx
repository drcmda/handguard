// What a hand is changing, for a moment: in the part's room, in its top left corner, clear of the part.
import { useEffect, useState } from 'react'
import { useShop } from '../store'
import { finishOf } from '../design'

const fraction = v => {
  const w = Math.floor(v + 1e-6)
  const q = Math.round((v - w) * 4)
  return `${w}${['', '¼', '½', '¾'][q]}`
}

export function Giant({ k }) {
  const want = useShop(s => s.want)
  const finish = useShop(s => s.finish)
  const [last, setLast] = useState(null)
  useEffect(() => {
    if (k) setLast(k)
  }, [k])
  // [what it is, the sign before the number, the number, what it is counted in]
  const f = finishOf(finish)
  const say = {
    lengthIn: ['Length', null, fraction(want.lengthIn), 'inches'],
    frontPicSlots: ['Picatinny up front', '×', want.frontPicSlots, 'slots'],
    noseExtIn: ['Shovel nose', null, want.noseExtIn, 'inch out'],
    flowRIn: ['Rear flow', 'R', want.flowRIn, 'inch'],
    finish: ['Finish', null, f.label, f.process],
  }[k ?? last]
  if (!say) return null
  const [label, sign, value, unit] = say
  return (
    <div className={'giant' + (k ? ' on' : '') + (k === 'finish' ? ' word' : '')} aria-hidden>
      <div className="gl">
        <i />
        {label}
      </div>
      <div className="gn">
        {sign && <s>{sign}</s>}
        <span>{value}</span>
        <u>{unit}</u>
      </div>
    </div>
  )
}
