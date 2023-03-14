import { COLOR_COMPONENT_BORDER, drawLabel, drawWireLineToComponent } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { isDefined, LogicValue } from "../utils"
import { Repr } from "./Component"
import { ContextMenuData, ContextMenuItem, ContextMenuItemPlacement, DrawContext } from "./Drawable"
import { defineFlipflopOrLatch, FlipflopOrLatch, OUTPUT } from "./FlipflopOrLatch"

const enum INPUT {
    Set,
    Reset,
}

export const LatchSRDef =
    defineFlipflopOrLatch("latch-sr", "LatchSR", {})

type LatchSRRepr = Repr<typeof LatchSRDef>

export class LatchSR extends FlipflopOrLatch<LatchSRRepr> {

    public constructor(editor: LogicEditor, savedData: LatchSRRepr | null) {
        super(editor, savedData, {
            ins: [
                [S.Components.Generic.InputSetDesc, -4, -2, "w"],
                [S.Components.Generic.InputResetDesc, -4, 2, "w"],
            ],
        })
        this.setInputsPreferSpike(INPUT.Set, INPUT.Reset)
    }

    public toJSON() {
        return {
            type: "latch-sr" as const,
            ...this.toJSONBase(),
        }
    }

    public override makeTooltip() {
        const s = S.Components.LatchSR.tooltip
        return tooltipContent(s.title, mods(
            div(s.desc) // TODO more info
        ))
    }

    protected doRecalcValue(): [LogicValue, LogicValue] {
        const s = this.inputs[INPUT.Set].value
        const r = this.inputs[INPUT.Reset].value

        // assume this state is valid
        this._isInInvalidState = false

        // handle set and reset signals
        if (s === true) {
            if (r === true) {
                this._isInInvalidState = true
                return [false, false]
            } else {
                // set is true, reset is false, set output to 1
                return [true, false]
            }
        }
        if (r === true) {
            // set is false, reset is true, set output to 0
            return [false, true]
        }

        // no change
        const q = this.outputs[OUTPUT.Q].value
        return [q, LogicValue.invert(q)]
    }

    protected doDrawLatchOrFlipflop(g: CanvasRenderingContext2D, ctx: DrawContext, width: number, height: number, left: number, __right: number) {

        drawWireLineToComponent(g, this.inputs[INPUT.Set], left - 2, this.inputs[INPUT.Set].posYInParentTransform, false)
        drawWireLineToComponent(g, this.inputs[INPUT.Reset], left - 2, this.inputs[INPUT.Reset].posYInParentTransform, false)

        ctx.inNonTransformedFrame(ctx => {
            g.fillStyle = COLOR_COMPONENT_BORDER
            g.font = "12px sans-serif"

            drawLabel(ctx, this.orient, "S", "w", left, this.inputs[INPUT.Set])
            drawLabel(ctx, this.orient, "R", "w", left, this.inputs[INPUT.Reset])
        })
    }

    protected override makeComponentSpecificContextMenuItems(): undefined | [ContextMenuItemPlacement, ContextMenuItem][] {
        const icon = this._showContent ? "check" : "none"
        const toggleShowOpItem = ContextMenuData.item(icon, S.Components.Generic.contextMenu.ShowContent, () => {
            this.doSetShowContent(!this._showContent)
        })

        const items: [ContextMenuItemPlacement, ContextMenuItem][] = [
            ["mid", toggleShowOpItem],
        ]

        const forceOutputItem = this.makeForceOutputsContextMenuItem()
        if (isDefined(forceOutputItem)) {
            items.push(
                ["mid", forceOutputItem]
            )
        }

        return items

    }

}
