import { div, mods, tooltipContent } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { LogicValue } from "../utils"
import { defineComponent, Repr } from "./Component"
import { Flipflop, FlipflopBaseDef } from "./FlipflopOrLatch"


export const FlipflopJKDef =
    defineComponent("ic", "flipflop-jk", {
        ...FlipflopBaseDef,
        makeNodes: () => {
            const base = FlipflopBaseDef.makeNodes(0)
            const s = S.Components.FlipflopJK
            return {
                ins: {
                    ...base.ins,
                    J: [-4, -2, "w", s.InputJDesc],
                    K: [-4, 2, "w", s.InputKDesc],
                },
                outs: base.outs,
            }
        },
    })

type FlipflopJKRepr = Repr<typeof FlipflopJKDef>

export class FlipflopJK extends Flipflop<FlipflopJKRepr> {

    public constructor(editor: LogicEditor, saved?: FlipflopJKRepr) {
        super(editor, FlipflopJKDef, saved)
    }

    public toJSON() {
        return {
            type: "flipflop-jk" as const,
            ...this.toJSONBase(),
        }
    }

    public override makeTooltip() {
        const s = S.Components.FlipflopJK.tooltip
        return tooltipContent(s.title, mods(
            div(s.desc) // TODO more info
        ))
    }

    protected doRecalcValueAfterClock(): LogicValue {
        const j = this.inputs.J.value
        const k = this.inputs.K.value
        const q = this.outputs.Q.value

        if (j === true) {
            if (k === true) {
                return LogicValue.invert(q)
            } else {
                return true
            }
        }
        if (k === true) {
            return false
        } else {
            return q
        }
    }

}
FlipflopJKDef.impl = FlipflopJK
