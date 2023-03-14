import * as t from "io-ts"
import { LogicEditor } from "../LogicEditor"
import { COLOR_BACKGROUND, COLOR_COMPONENT_BORDER, COLOR_MOUSE_OVER, GRID_STEP, colorForBoolean, drawWireLineToComponent } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { ArrayFillWith, HighImpedance, LogicValue, Unknown, isHighImpedance, isUnknown } from "../utils"
import { ComponentBase, Repr, defineComponent } from "./Component"
import { DrawContext } from "./Drawable"

export const QuadTriStateDef =
    defineComponent(true, true, t.type({
        type: t.literal("quad-tristate"),
    }, "QuadTriState"))

const INPUT = {
    I: [0, 1, 2, 3] as const,
    E: 4 as const,
}

const GRID_WIDTH = 4
const GRID_HEIGHT = 8

type QuadTriStateRepr = Repr<typeof QuadTriStateDef>

export class QuadTriState extends ComponentBase<QuadTriStateRepr, LogicValue[]> {

    public constructor(editor: LogicEditor, savedData: QuadTriStateRepr | null) {
        super(editor, ArrayFillWith(HighImpedance, 4), savedData, {
            ins: [
                ["I0", -3, -3, "w", "In"],
                ["I1", -3, -1, "w", "In"],
                ["I2", -3, +1, "w", "In"],
                ["I3", -3, +3, "w", "In"],
                ["E (Enable)", 0, -5, "n"],
            ],
            outs: [
                ["O0", +3, -3, "e", "Out"],
                ["O1", +3, -1, "e", "Out"],
                ["O2", +3, +1, "e", "Out"],
                ["O3", +3, +3, "e", "Out"],
            ],
        })
    }

    public toJSON() {
        return {
            type: "quad-tristate" as const,
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
        const s = S.Components.QuadTriState.tooltip
        return tooltipContent(s.title, mods(
            div(s.desc)
        ))
    }

    protected doRecalcValue(): LogicValue[] {
        const input = this.inputValues(INPUT.I)
        const enable = this.inputs[INPUT.E].value

        if (isUnknown(enable) || isHighImpedance(enable)) {
            return ArrayFillWith(Unknown, 4)
        }

        if (!enable) {
            return ArrayFillWith(HighImpedance, 4)
        }

        return input
    }

    protected override propagateValue(newValue: LogicValue[]) {
        for (let i = 0; i < 4; i++) {
            this.outputs[i].value = newValue[i]
        }
    }

    protected doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {
        const enable = this.inputs[INPUT.E].value

        const width = GRID_WIDTH * GRID_STEP
        const height = GRID_HEIGHT * GRID_STEP
        const left = this.posX - width / 2
        const right = left + width
        const top = this.posY - height / 2
        // const bottom = top + height

        g.fillStyle = COLOR_BACKGROUND
        g.strokeStyle = ctx.isMouseOver ? COLOR_MOUSE_OVER : COLOR_COMPONENT_BORDER
        g.lineWidth = 3

        g.beginPath()
        g.rect(this.posX - width / 2, this.posY - height / 2, width, height)
        g.fill()
        g.stroke()

        g.lineWidth = 2
        g.strokeStyle = colorForBoolean(enable)
        g.beginPath()
        g.moveTo(this.posX, top + 3)
        g.lineTo(this.posX, this.posY - 4)
        g.stroke()

        g.strokeStyle = COLOR_COMPONENT_BORDER
        g.beginPath()
        g.moveTo(left + 12, this.posY - 8)
        g.lineTo(right - 13, this.posY)
        g.lineTo(left + 12, this.posY + 8)
        g.closePath()
        g.stroke()


        for (const i of INPUT.I) {
            const input = this.inputs[i]
            drawWireLineToComponent(g, input, left - 2, input.posYInParentTransform)
        }

        drawWireLineToComponent(g, this.inputs[INPUT.E], this.inputs[INPUT.E].posXInParentTransform, top - 2)


        for (const output of this.outputs) {
            drawWireLineToComponent(g, output, right + 2, output.posYInParentTransform)
        }
    }
}
