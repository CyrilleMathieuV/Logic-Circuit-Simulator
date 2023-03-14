import * as t from "io-ts"
import { COLOR_BACKGROUND, COLOR_COMPONENT_BORDER, COLOR_COMPONENT_INNER_LABELS, COLOR_MOUSE_OVER, displayValuesFromArray, drawLabel, drawWireLineToComponent, GRID_STEP } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { ArrayFillWith, isUndefined, isUnknown, LogicValue, Unknown } from "../utils"
import { ComponentBase, defineComponent, Repr } from "./Component"
import { ContextMenuItem, ContextMenuItemPlacement, DrawContext } from "./Drawable"

export const DecoderBCD4Def =
    defineComponent(true, true, t.type({
        type: t.literal("decoder-bcd4"),
    }, "DecoderBCD4"))

const INPUT = {
    I: [0, 1, 2, 3] as const,
}

// const OUTPUT = {
//     B: [0, 1, 2, 3, 5] as const,
// }

const GRID_WIDTH = 5
const GRID_HEIGHT = 12

type DecoderBCD4Repr = Repr<typeof DecoderBCD4Def>

export class DecoderBCD4 extends ComponentBase<DecoderBCD4Repr, LogicValue[]> {

    public constructor(editor: LogicEditor, savedData: DecoderBCD4Repr | null) {
        super(editor, ArrayFillWith(false, 5), savedData, {
            ins: [
                ["D", -4, -3, "w", "In"],
                ["C", -4, -1, "w", "In"],
                ["B", -4, +1, "w", "In"],
                ["A", -4, +3, "w", "In"],
            ],
            outs: [
                ["Z0", +4, -5, "e", "Z"],
                ["Z1", +4, -3, "e", "Z"],
                ["Z2", +4, -1, "e", "Z"],
                ["Z3", +4, +1, "e", "Z"],
                ["Z4", +4, +5, "e", "Z"],
            ],
        })
    }

    public toJSON() {
        return {
            type: "decoder-bcd4" as const,
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
        return tooltipContent(undefined, mods(
            div(S.Components.DecoderBCD4.tooltip)
        ))
    }

    protected doRecalcValue(): LogicValue[] {
        const input = this.inputValues(INPUT.I)
        const [__, value] = displayValuesFromArray(input, false)

        let output
        if (isUnknown(value)) {
            output = ArrayFillWith(Unknown, 5)
        } else {
            output = (() => {
                switch (value) {
                    case 0: return [false, false, false, false, false]
                    case 1: return [false, false, false, false, true]
                    case 2: return [false, false, false, true, false]
                    case 3: return [false, false, false, true, true]
                    case 4: return [false, false, true, false, false]
                    case 5: return [false, false, true, false, true]
                    case 6: return [false, false, true, true, false]
                    case 7: return [false, false, true, true, true]
                    case 8: return [false, true, false, false, false]
                    case 9: return [false, true, false, false, true]
                    case 10: return [true, false, false, false, false]
                    case 11: return [true, false, false, false, true]
                    case 12: return [true, false, false, true, false]
                    case 13: return [true, false, false, true, true]
                    case 14: return [true, false, true, false, false]
                    case 15: return [true, false, true, false, true]
                    default: return ArrayFillWith(Unknown, 5)
                }
            })()
        }

        return output
    }

    protected override propagateValue(newValue: LogicValue[]) {
        this.outputs.forEach((output, i) => {
            output.value = newValue[5 - i - 1]
        })
    }

    protected doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {

        g.fillStyle = COLOR_BACKGROUND
        g.strokeStyle = ctx.isMouseOver ? COLOR_MOUSE_OVER : COLOR_COMPONENT_BORDER
        g.lineWidth = 4

        const width = GRID_WIDTH * GRID_STEP
        const height = GRID_HEIGHT * GRID_STEP
        const left = this.posX - width / 2
        const right = left + width

        g.beginPath()
        g.rect(this.posX - width / 2, this.posY - height / 2, width, height)
        g.fill()
        g.stroke()

        for (const input of this.inputs) {
            drawWireLineToComponent(g, input, left - 2, input.posYInParentTransform)
        }

        for (const output of this.outputs) {
            drawWireLineToComponent(g, output, right + 2, output.posYInParentTransform)
        }

        ctx.inNonTransformedFrame(ctx => {
            g.fillStyle = COLOR_COMPONENT_INNER_LABELS
            g.font = "12px sans-serif"

            this.inputs.forEach(input => {
                drawLabel(ctx, this.orient, input.name, "w", left, input)
            })
            this.outputs.forEach(output => {
                drawLabel(ctx, this.orient, output.name, "e", right, output)
            })

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