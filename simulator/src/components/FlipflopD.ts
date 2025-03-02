import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import {LogicValue, RichStringEnum} from "../utils"
import { Repr, defineComponent } from "./Component"
import { DrawableParent } from "./Drawable"
import { Flipflop, FlipflopBaseDef } from "./FlipflopOrLatch"

export type FlipflopDTypeProps = {
    includeInContextMenu: boolean
    includeInPoseAs: boolean
    fullShortDesc: () => [string, string | undefined, string]
    out: (ins: LogicValue[]) => LogicValue
}

export type FlipflopDTypes<TFlipflopDType extends string> = RichStringEnum<TFlipflopDType, FlipflopDTypeProps>

export const FlipflopDDef =
    defineComponent("ff-d", {
        idPrefix: "ff",
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

    public constructor(parent: DrawableParent, saved?: FlipflopDRepr) {
        super(parent, FlipflopDDef, saved)
    }

    public toJSON() {
        return this.toJSONBase()
    }

    public override makeTooltip() {
        const s = S.Components.FlipflopD.tooltip
        return tooltipContent(s.title, mods(
            div(s.desc) // TODO more info
        ))
    }

    protected doRecalcValueAfterClock(): LogicValue {
        return LogicValue.filterHighZ(this.inputs.D.value)
    }

}
FlipflopDDef.impl = FlipflopD
