import * as t from "io-ts"
import { COLOR_BACKGROUND, COLOR_COMPONENT_BORDER, COLOR_COMPONENT_INNER_LABELS, COLOR_MOUSE_OVER, displayValuesFromArray, drawLabel, drawWireLineToComponent, GRID_STEP } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { FixedArrayFill, FixedReadonlyArray, isUndefined, isUnknown, LogicValue, Unknown } from "../utils"
import { ComponentBase, defineComponent } from "./Component"
import { ContextMenuItem, ContextMenuItemPlacement, DrawContext } from "./Drawable"

export const Decoder7SegDef =
    defineComponent(4, 7, t.type({
        type: t.literal("decoder-7seg"),
    }, "Decoder7Seg"))

const INPUT = {
    I: [0, 1, 2, 3] as const,
}

const enum OUTPUT {
    a, b, c, d, e, f, g
}

const GRID_WIDTH = 4
const GRID_HEIGHT = 8

export type Decoder7SegRepr = typeof Decoder7SegDef.reprType

export class Decoder7Seg extends ComponentBase<4, 7, Decoder7SegRepr, FixedReadonlyArray<LogicValue, 7>> {

    public constructor(editor: LogicEditor, savedData: Decoder7SegRepr | null) {
        super(editor, FixedArrayFill(false, 7), savedData, {
            ins: [
                ["A", -3, -3, "w", "In"],
                ["B", -3, -1, "w", "In"],
                ["C", -3, +1, "w", "In"],
                ["D", -3, +3, "w", "In"],
            ],
            outs: [
                ["a", +3, -3, "e", "Out"],
                ["b", +3, -2, "e", "Out"],
                ["c", +3, -1, "e", "Out"],
                ["d", +3, 0, "e", "Out"],
                ["e", +3, +1, "e", "Out"],
                ["f", +3, +2, "e", "Out"],
                ["g", +3, +3, "e", "Out"],
            ],
        })
    }

    public toJSON() {
        return {
            type: "decoder-7seg" as const,
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
            div(S.Components.Decoder7Seg.tooltip) // TODO better info
        ))
    }

    protected doRecalcValue(): FixedReadonlyArray<LogicValue, 7> {
        const input = this.inputValues<4>(INPUT.I)
        const [__, value] = displayValuesFromArray(input, false)

        let output
        if (isUnknown(value)) {
            output = FixedArrayFill(Unknown, 7)
        } else {
            output = (() => {
                switch (value) {
                    case 0: return [true, true, true, true, true, true, false] as const
                    case 1: return [false, true, true, false, false, false, false] as const
                    case 2: return [true, true, false, true, true, false, true] as const
                    case 3: return [true, true, true, true, false, false, true] as const
                    case 4: return [false, true, true, false, false, true, true] as const
                    case 5: return [true, false, true, true, false, true, true] as const
                    case 6: return [true, false, true, true, true, true, true] as const
                    case 7: return [true, true, true, false, false, false, false] as const
                    case 8: return [true, true, true, true, true, true, true] as const
                    case 9: return [true, true, true, true, false, true, true] as const
                    case 10: return [true, true, true, false, true, true, true] as const
                    case 11: return [false, false, true, true, true, true, true] as const
                    case 12: return [true, false, false, true, true, true, false] as const
                    case 13: return [false, true, true, true, true, false, true] as const
                    case 14: return [true, false, false, true, true, true, true] as const
                    case 15: return [true, false, false, false, true, true, true] as const
                    default: return FixedArrayFill(Unknown, 7)
                }
            })()
        }

        return output
    }

    protected override propagateValue(newValue: FixedReadonlyArray<LogicValue, 7>) {
        this.outputs[OUTPUT.a].value = newValue[0]
        this.outputs[OUTPUT.b].value = newValue[1]
        this.outputs[OUTPUT.c].value = newValue[2]
        this.outputs[OUTPUT.d].value = newValue[3]
        this.outputs[OUTPUT.e].value = newValue[4]
        this.outputs[OUTPUT.f].value = newValue[5]
        this.outputs[OUTPUT.g].value = newValue[6]
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