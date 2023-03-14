import { COLOR_COMPONENT_INNER_LABELS, drawLabel, drawWireLineToComponent } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { LogicValue } from "../utils"
import { Repr } from "./Component"
import { DrawContext } from "./Drawable"
import { defineFlipflop, Flipflop } from "./FlipflopOrLatch"


const enum INPUT {
    Clock,
    Preset,
    Clear,
    D,
}

export const FlipflopDDef =
    defineFlipflop("flipflop-d", "FlipflopD", {})

type FlipflopDRepr = Repr<typeof FlipflopDDef>

export class FlipflopD extends Flipflop<FlipflopDRepr> {

    public constructor(editor: LogicEditor, savedData: FlipflopDRepr | null) {
        super(editor, savedData, {
            ins: [[S.Components.Generic.InputDataDesc, -4, -2, "w"]],
            clockYOffset: 2,
        })
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
        return this.inputs[INPUT.D].value
    }

    protected override doDrawLatchOrFlipflop(g: CanvasRenderingContext2D, ctx: DrawContext, width: number, height: number, left: number, right: number) {
        super.doDrawLatchOrFlipflop(g, ctx, width, height, left, right)

        drawWireLineToComponent(g, this.inputs[INPUT.D], left - 2, this.inputs[INPUT.D].posYInParentTransform, false)

        ctx.inNonTransformedFrame(ctx => {
            g.fillStyle = COLOR_COMPONENT_INNER_LABELS
            g.font = "12px sans-serif"

            drawLabel(ctx, this.orient, "D", "w", left, this.inputs[INPUT.D])
        })
    }

}