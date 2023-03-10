import { COLOR_COMPONENT_INNER_LABELS, drawLabel, drawWireLineToComponent } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { LogicValue } from "../utils"
import { DrawContext } from "./Drawable"
import { defineFlipflop, Flipflop, OUTPUT } from "./FlipflopOrLatch"

const enum INPUT {
    Clock,
    Preset,
    Clear,
    J,
    K,
}

export const FlipflopJKDef =
    defineFlipflop(2, "flipflop-jk", "FlipflopJK", {})

export type FlipflopJKRepr = typeof FlipflopJKDef.reprType

export class FlipflopJK extends Flipflop<2, FlipflopJKRepr> {

    public constructor(editor: LogicEditor, savedData: FlipflopJKRepr | null) {
        super(editor, savedData, {
            ins: [
                [S.Components.FlipflopJK.InputJDesc, -4, -2, "w"],
                [S.Components.FlipflopJK.InputKDesc, -4, 2, "w"],
            ],
            clockYOffset: 0,
        })
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
        const j = this.inputs[INPUT.J].value
        const k = this.inputs[INPUT.K].value
        const q = this.outputs[OUTPUT.Q].value

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

    protected override doDrawLatchOrFlipflop(g: CanvasRenderingContext2D, ctx: DrawContext, width: number, height: number, left: number, right: number) {
        super.doDrawLatchOrFlipflop(g, ctx, width, height, left, right)

        drawWireLineToComponent(g, this.inputs[INPUT.J], left - 2, this.inputs[INPUT.J].posYInParentTransform, false)
        drawWireLineToComponent(g, this.inputs[INPUT.K], left - 2, this.inputs[INPUT.K].posYInParentTransform, false)

        ctx.inNonTransformedFrame(ctx => {
            g.fillStyle = COLOR_COMPONENT_INNER_LABELS
            g.font = "12px sans-serif"

            drawLabel(ctx, this.orient, "J", "w", left, this.inputs[INPUT.J])
            drawLabel(ctx, this.orient, "K", "w", left, this.inputs[INPUT.K])
        })
    }

}