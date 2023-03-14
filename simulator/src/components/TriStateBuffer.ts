import * as t from "io-ts"
import { COLOR_BACKGROUND, COLOR_COMPONENT_BORDER, COLOR_MOUSE_OVER, drawWireLineToComponent, GRID_STEP } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { HighImpedance, isHighImpedance, isUnknown, LogicValue, Unknown } from "../utils"
import { ComponentBase, defineComponent, Repr } from "./Component"
import { DrawContext } from "./Drawable"

export const TriStateBufferDef =
    defineComponent(true, true, t.type({
        type: t.literal("TRI"),
    }, "TriStateBuffer"))

const enum INPUT {
    In, Enable,
}

const enum OUTPUT {
    Out
}

const GRID_WIDTH = 7
const GRID_HEIGHT = 4

type TriStateBufferRepr = Repr<typeof TriStateBufferDef>

export class TriStateBuffer extends ComponentBase<TriStateBufferRepr, LogicValue> {

    public constructor(editor: LogicEditor, savedData: TriStateBufferRepr | null) {
        super(editor, HighImpedance, savedData, {
            ins: [
                ["In", -4, 0, "w"],
                ["E (Enable)", 0, -3, "n"],
            ],
            outs: [["Out", +4, 0, "e"]],
        })
    }

    public toJSON() {
        return {
            type: "TRI" as const,
            ...this.toJSONBase(),
        }
    }

    public get componentType() {
        return "gate" as const
    }

    public get unrotatedWidth() {
        return GRID_WIDTH * GRID_STEP
    }

    public get unrotatedHeight() {
        return GRID_HEIGHT * GRID_STEP
    }

    public override makeTooltip() {
        return tooltipContent(undefined, mods(
            div(S.Components.TriStateBuffer.tooltip) // TODO
        ))
    }

    protected doRecalcValue(): LogicValue {
        const en = this.inputs[INPUT.Enable].value
        if (isUnknown(en) || isHighImpedance(en)) {
            return Unknown
        }
        if (!en) {
            return HighImpedance
        }
        const i = this.inputs[INPUT.In].value
        if (isHighImpedance(i)) {
            return Unknown
        }
        return i
    }

    protected override propagateValue(newValue: LogicValue) {
        this.outputs[OUTPUT.Out].value = newValue
    }

    protected doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {


        const width = GRID_WIDTH * GRID_STEP
        const height = GRID_HEIGHT * GRID_STEP
        const left = this.posX - width / 2
        // const right = left + width
        const top = this.posY - height / 2
        const bottom = top + height

        if (ctx.isMouseOver) {
            const frameWidth = 2
            const frameMargin = 2
            g.lineWidth = frameWidth
            g.strokeStyle = COLOR_MOUSE_OVER
            g.beginPath()
            g.rect(
                left - frameWidth - frameMargin,
                top - frameWidth - frameMargin,
                width + 2 * (frameWidth + frameMargin),
                height + 2 * (frameWidth + frameMargin)
            )
            g.stroke()
        }


        g.fillStyle = COLOR_BACKGROUND
        g.strokeStyle = COLOR_COMPONENT_BORDER
        g.lineWidth = 3

        const gateWidth = (2 * Math.max(2, this.inputs.length)) * GRID_STEP
        const gateLeft = this.posX - gateWidth / 2
        const gateRight = this.posX + gateWidth / 2

        g.beginPath()
        g.moveTo(gateLeft, top)
        g.lineTo(gateRight, this.posY)
        g.lineTo(gateLeft, bottom)
        g.closePath()
        g.stroke()

        drawWireLineToComponent(g, this.inputs[INPUT.In], gateLeft - 1, this.inputs[INPUT.In].posYInParentTransform)
        drawWireLineToComponent(g, this.inputs[INPUT.Enable], this.inputs[INPUT.Enable].posXInParentTransform, this.posY - height / 4 - 1)
        drawWireLineToComponent(g, this.outputs[OUTPUT.Out], gateRight + 1, this.posY)
    }


}
