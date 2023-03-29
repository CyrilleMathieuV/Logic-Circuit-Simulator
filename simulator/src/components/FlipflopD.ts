import { div, mods, tooltipContent } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { LogicValue } from "../utils"
import { defineComponent, Repr } from "./Component"
import { Flipflop, FlipflopBaseDef } from "./FlipflopOrLatch"


export const FlipflopDDef =
    defineComponent("ic", "flipflop-d", {
        ...FlipflopBaseDef,
        makeNodes: () => {
            const base = FlipflopBaseDef.makeNodes(2)
            const s = S.Components.Generic
            return {
                ins: {
                    ...base.ins,
                    D: [-4, -2, "w", s.InputDataDesc],
                },
                outs: base.outs,
            }
        },
    })

type FlipflopDRepr = Repr<typeof FlipflopDDef>

export class FlipflopD extends Flipflop<FlipflopDRepr> {

    public constructor(editor: LogicEditor, saved?: FlipflopDRepr) {
        super(editor, FlipflopDDef, saved)
    }

    public toJSON() {
        return {
            type: "flipflop-d" as const,
            ...this.toJSONBase(),
        }
    }

    public override makeTooltip() {
        const s = S.Components.FlipflopD.tooltip
        return tooltipContent(s.title, mods(
            div(s.desc) // TODO more info
        ))
    }

    protected doRecalcValueAfterClock(): LogicValue {
        return this.inputs.D.value
    }

}
FlipflopDDef.impl = FlipflopD
