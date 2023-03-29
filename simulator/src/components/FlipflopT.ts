import { div, mods, tooltipContent } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { isHighImpedance, isUnknown, LogicValue, Unknown } from "../utils"
import { defineComponent, Repr } from "./Component"
import { Flipflop, FlipflopBaseDef } from "./FlipflopOrLatch"


export const FlipflopTDef =
    defineComponent("ic", "flipflop-t", {
        ...FlipflopBaseDef,
        makeNodes: () => {
            const base = FlipflopBaseDef.makeNodes(2)
            const s = S.Components.FlipflopT
            return {
                ins: {
                    ...base.ins,
                    T: [-4, -2, "w", s.InputTDesc],
                },
                outs: base.outs,
            }
        },
    })

type FlipflopTRepr = Repr<typeof FlipflopTDef>

export class FlipflopT extends Flipflop<FlipflopTRepr> {

    public constructor(editor: LogicEditor, saved?: FlipflopTRepr) {
        super(editor, FlipflopTDef, saved)
    }

    public toJSON() {
        return {
            type: "flipflop-t" as const,
            ...this.toJSONBase(),
        }
    }

    public override makeTooltip() {
        const s = S.Components.FlipflopT.tooltip
        return tooltipContent(s.title, mods(
            div(s.desc) // TODO more info
        ))
    }

    protected doRecalcValueAfterClock(): LogicValue {
        const t = this.inputs.T.value
        if (isUnknown(t) || isHighImpedance(t)) {
            return Unknown
        }
        const q = this.outputs.Q.value
        return t ? LogicValue.invert(q) : q
    }

}
FlipflopTDef.impl = FlipflopT
