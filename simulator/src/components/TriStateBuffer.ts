import { HighImpedance, isHighImpedance, isUnknown, LogicState, Unknown } from "../utils"
import { COLOR_BACKGROUND, COLOR_COMPONENT_BORDER, COLOR_MOUSE_OVER, drawWireLineToComponent, GRID_STEP } from "../drawutils"
import { DrawContext } from "./Drawable"
import { tooltipContent, mods, div } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"
import * as t from "io-ts"
import { ComponentBase, defineComponent } from "./Component"

export const TriStateBufferDef =
    defineComponent(2, 1, t.type({
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

export type TriStateBufferRepr = typeof TriStateBufferDef.reprType

export class TriStateBuffer extends ComponentBase<2, 1, TriStateBufferRepr, LogicState> {

    public constructor(editor: LogicEditor, savedData: TriStateBufferRepr | null) {
        super(editor, HighImpedance, savedData, {
            inOffsets: [[-4, 0, "w"], [0, -3, "n"]],
            outOffsets: [[+4, 0, "e"]],
        })
    }

    toJSON() {
        return {
            type: "TRI" as const,
            ...this.toJSONBase(),
        }
    }

    public get componentType() {
        return "gate" as const
    }

    get unrotatedWidth() {
        return GRID_WIDTH * GRID_STEP
    }

    get unrotatedHeight() {
        return GRID_HEIGHT * GRID_STEP
    }

    override getInputName(i: number): string | undefined {
        switch (i) {
            case INPUT.In: return "In"
            case INPUT.Enable: return "En (enable)"
        }
        return undefined
    }

    override getOutputName(i: number): string | undefined {
        switch (i) {
            case OUTPUT.Out: return "Out"
        }
        return undefined
    }


    public override makeTooltip() {
        return tooltipContent("Sortie à 3 états", mods(
            div("TODO") // TODO
        ))
    }

    protected doRecalcValue(): LogicState {
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

    protected override propagateValue(newValue: LogicState) {
        this.outputs[OUTPUT.Out].value = newValue
    }

    doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {


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
