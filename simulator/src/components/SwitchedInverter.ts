import * as t from "io-ts"
import { LogicEditor } from "../LogicEditor"
import { COLOR_BACKGROUND, COLOR_COMPONENT_BORDER, COLOR_MOUSE_OVER, COLOR_UNKNOWN, GRID_STEP, circle, colorForBoolean, drawWireLineToComponent } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { ArrayFillWith, LogicValue, Unknown, isHighImpedance, isUnknown } from "../utils"
import { ComponentBase, Repr, defineComponent } from "./Component"
import { DrawContext } from "./Drawable"

export const SwitchedInverterDef =
    defineComponent(true, true, t.type({
        type: t.literal("switched-inverter"),
    }, "SwitchedInverter"))

const INPUT = {
    I: [0, 1, 2, 3] as const,
    S: 4 as const,
}

const GRID_WIDTH = 4
const GRID_HEIGHT = 8

type SwitchedInverterRepr = Repr<typeof SwitchedInverterDef>

export class SwitchedInverter extends ComponentBase<SwitchedInverterRepr, LogicValue[]> {

    public constructor(editor: LogicEditor, savedData: SwitchedInverterRepr | null) {
        super(editor, ArrayFillWith(false, 4), savedData, {
            ins: [
                ["I0", -3, -3, "w", "In"],
                ["I1", -3, -1, "w", "In"],
                ["I2", -3, +1, "w", "In"],
                ["I3", -3, +3, "w", "In"],
                ["S", 0, -5, "n"],
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
            type: "switched-inverter" as const,
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
        const s = S.Components.SwitchedInverter.tooltip
        return tooltipContent(s.title, mods(
            div(s.desc)
        ))
    }

    protected doRecalcValue(): LogicValue[] {
        const input = this.inputValues(INPUT.I)
        const switch_ = this.inputs[INPUT.S].value

        if (isUnknown(switch_) || isHighImpedance(switch_)) {
            return ArrayFillWith(Unknown, 4)
        }

        if (!switch_) {
            return input
        }

        return input.map(LogicValue.invert)
    }

    protected override propagateValue(newValue: LogicValue[]) {
        for (let i = 0; i < 4; i++) {
            this.outputs[i].value = newValue[i]
        }
    }

    protected doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {

        const invert = this.inputs[INPUT.S].value

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
        g.strokeStyle = colorForBoolean(invert)
        g.beginPath()
        g.moveTo(this.posX, top + 3)
        g.lineTo(this.posX, this.posY - 4)
        g.stroke()

        g.strokeStyle = invert === true ? COLOR_COMPONENT_BORDER : COLOR_UNKNOWN
        g.beginPath()
        g.moveTo(left + 12, this.posY - 8)
        g.lineTo(right - 13, this.posY)
        g.lineTo(left + 12, this.posY + 8)
        g.closePath()
        g.stroke()
        g.beginPath()
        circle(g, right - 10, this.posY, 5)
        g.stroke()


        for (const i of INPUT.I) {
            const input = this.inputs[i]
            drawWireLineToComponent(g, input, left - 2, input.posYInParentTransform)
        }

        drawWireLineToComponent(g, this.inputs[INPUT.S], this.inputs[INPUT.S].posXInParentTransform, top - 2)


        for (const output of this.outputs) {
            drawWireLineToComponent(g, output, right + 2, output.posYInParentTransform)
        }
    }
}
