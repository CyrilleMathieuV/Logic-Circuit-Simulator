import * as t from "io-ts"
import { COLOR_BACKGROUND, COLOR_COMPONENT_BORDER, COLOR_COMPONENT_INNER_LABELS, COLOR_MOUSE_OVER, drawLabel, drawWireLineToComponent, GRID_STEP } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { isHighImpedance, isUndefined, isUnknown, LogicValue, Unknown } from "../utils"
import { ComponentBase, defineComponent, Repr } from "./Component"
import { ContextMenuItem, ContextMenuItemPlacement, DrawContext } from "./Drawable"

const GRID_WIDTH = 5
const GRID_HEIGHT = 7

const enum INPUT {
    A, B, E
}

const enum OUTPUT {
    G, Eq
}

export const ComparatorDef =
    defineComponent(true, true, t.type({
        type: t.literal("comparator"),
    }, "Compatator"))

type ComparatorRepr = Repr<typeof ComparatorDef>

export class Comparator extends ComponentBase<ComparatorRepr, [LogicValue, LogicValue]> {

    public constructor(editor: LogicEditor, savedData: ComparatorRepr | null) {
        super(editor, [false, false], savedData, {
            ins: [
                ["A", -4, 2, "w"],
                ["B", -4, -2, "w"],
                ["E", 0, 5, "s"],
            ],
            outs: [
                ["G", 4, 0, "e"],
                ["Eq", 0, -5, "n"],
            ],
        })
    }

    public toJSON() {
        return {
            type: "comparator" as const,
            ...this.toJSONBase(),
        }
    }

    public get componentType() {
        return "ic" as const
    }

    public get unrotatedWidth() {
        return GRID_WIDTH * GRID_STEP
    }

    public get unrotatedHeight() {
        return GRID_HEIGHT * GRID_STEP
    }

    public override makeTooltip() {
        return tooltipContent(S.Components.Comparator.caption, mods(
            div(S.Components.Comparator.tooltip),
        ))
    }

    protected doRecalcValue(): [LogicValue, LogicValue] {
        const a = this.inputs[INPUT.A].value
        const b = this.inputs[INPUT.B].value
        const e = this.inputs[INPUT.E].value

        if (isUnknown(a) || isUnknown(b) || isUnknown(e) || isHighImpedance(a) || isHighImpedance(b) || isHighImpedance(e)) {
            return [Unknown, Unknown]
        }

        if ((+e) === 0) {
            return [false, false]
        }

        const g = ((+a) > (+b))
        const eq = ((+a) === (+b))

        return [g, eq]
    }

    protected override propagateValue(newValue: [LogicValue, LogicValue]) {
        this.outputs[OUTPUT.G].value = newValue[OUTPUT.G]
        this.outputs[OUTPUT.Eq].value = newValue[OUTPUT.Eq]
    }

    protected doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {

        const width = GRID_WIDTH * GRID_STEP
        const height = GRID_HEIGHT * GRID_STEP

        g.fillStyle = COLOR_BACKGROUND
        g.lineWidth = 3
        if (ctx.isMouseOver) {
            g.strokeStyle = COLOR_MOUSE_OVER
        } else {
            g.strokeStyle = COLOR_COMPONENT_BORDER
        }

        g.beginPath()
        g.rect(this.posX - width / 2, this.posY - height / 2, width, height)
        g.fill()
        g.stroke()

        drawWireLineToComponent(g, this.inputs[INPUT.A], this.posX - width / 2 - 2, this.inputs[INPUT.A].posYInParentTransform, true)
        drawWireLineToComponent(g, this.inputs[INPUT.B], this.posX - width / 2 - 2, this.inputs[INPUT.B].posYInParentTransform, true)
        drawWireLineToComponent(g, this.inputs[INPUT.E], this.inputs[INPUT.E].posXInParentTransform, this.posY + height / 2 + 6, true)


        drawWireLineToComponent(g, this.outputs[OUTPUT.G], this.posX + width / 2 + 2, this.outputs[OUTPUT.G].posYInParentTransform, true)
        drawWireLineToComponent(g, this.outputs[OUTPUT.Eq], this.outputs[OUTPUT.Eq].posXInParentTransform, this.posY - height / 2 - 2, true)


        ctx.inNonTransformedFrame(ctx => {
            g.fillStyle = COLOR_COMPONENT_INNER_LABELS
            g.textAlign = "center"
            g.font = "11px sans-serif"

            const top = this.posY - height / 2
            const bottom = this.posY + height / 2
            const right = this.posX + width / 2
            const left = this.posX - width / 2

            drawLabel(ctx, this.orient, "A", "w", left, this.inputs[INPUT.A])
            drawLabel(ctx, this.orient, "B", "w", left, this.inputs[INPUT.B])
            drawLabel(ctx, this.orient, "E", "s", this.inputs[INPUT.E], bottom)

            drawLabel(ctx, this.orient, ">", "e", right, this.outputs[OUTPUT.G])
            drawLabel(ctx, this.orient, "=", "n", this.outputs[OUTPUT.Eq], top)

            g.fillStyle = COLOR_COMPONENT_BORDER
            g.font = "bold 11px sans-serif"
            g.textAlign = "center"
            g.textBaseline = "middle"
            g.fillText("CMP", this.posX, this.posY)
        })
    }

    protected override makeComponentSpecificContextMenuItems(): undefined | [ContextMenuItemPlacement, ContextMenuItem][] {
        const forceOutputItem = this.makeForceOutputsContextMenuItem()
        if (isUndefined(forceOutputItem)) {
            return []
        }
        return [
            ["mid", forceOutputItem],
        ]
    }


}
