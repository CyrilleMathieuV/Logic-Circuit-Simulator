import * as t from "io-ts"
import { LogicEditor } from "../LogicEditor"
import { COLOR_BACKGROUND, COLOR_COMPONENT_BORDER, COLOR_MOUSE_OVER, GRID_STEP, colorForBoolean, drawComponentName, drawRoundValue, drawWireLineToComponent } from "../drawutils"
import { mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { ArrayFillWith, LogicValue, Mode, Unknown, isDefined, isNotNull, toLogicValueRepr } from "../utils"
import { ComponentBase, ComponentName, ComponentNameRepr, Repr, defineComponent } from "./Component"
import { ContextMenuItem, ContextMenuItemPlacement, DrawContext } from "./Drawable"

const GRID_WIDTH = 2
const GRID_UPPER_HEIGHT = 4.5
const GRID_LOWER_HEIGHT = 3.5

export const OutputByteDef =
    defineComponent(true, false, t.type({
        type: t.literal("byte"),
        name: ComponentNameRepr,
    }, "OutputByte"))

type OutputByteRepr = Repr<typeof OutputByteDef>

export class OutputByte extends ComponentBase<OutputByteRepr, LogicValue[]> {

    private _name: ComponentName = undefined

    public constructor(editor: LogicEditor, savedData: OutputByteRepr | null) {
        super(editor, ArrayFillWith(false, 8), savedData, {
            ins: [
                [undefined, -2, -4, "w", "In"],
                [undefined, -2, -3, "w", "In"],
                [undefined, -2, -2, "w", "In"],
                [undefined, -2, -1, "w", "In"],
                [undefined, -2, 0, "w", "In"],
                [undefined, -2, 1, "w", "In"],
                [undefined, -2, 2, "w", "In"],
                [undefined, -2, 3, "w", "In"],
            ],
        })
        if (isNotNull(savedData)) {
            this._name = savedData.name
        }
    }

    public toJSON() {
        return {
            type: "byte" as const,
            ...this.toJSONBase(),
            name: this._name,
        }
    }

    public get componentType() {
        return "out" as const
    }

    public get unrotatedWidth() {
        return GRID_WIDTH * GRID_STEP
    }

    public get unrotatedHeight() {
        return (GRID_UPPER_HEIGHT + GRID_UPPER_HEIGHT) * GRID_STEP
    }

    public override makeTooltip() {
        return tooltipContent(undefined, mods(S.Components.OutputByte.tooltip))
    }

    protected doRecalcValue(): LogicValue[] {
        // this never changes on its own, just upon user interaction
        return this.inputValues([0, 1, 2, 3, 4, 5, 6, 7])
    }

    protected doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {

        g.fillStyle = COLOR_BACKGROUND
        const drawMouseOver = ctx.isMouseOver && this.editor.mode !== Mode.STATIC
        g.strokeStyle = drawMouseOver ? COLOR_MOUSE_OVER : COLOR_COMPONENT_BORDER
        g.lineWidth = 4

        const width = GRID_WIDTH * GRID_STEP
        const left = this.posX - width / 2
        const top = this.posY - GRID_UPPER_HEIGHT * GRID_STEP
        const bottom = this.posY + GRID_LOWER_HEIGHT * GRID_STEP
        const height = bottom - top

        g.beginPath()
        g.rect(left, top, width, height)
        g.fill()
        g.stroke()

        const displayValues = this.editor.options.hideOutputColors ? ArrayFillWith(Unknown, 8) : this.value

        g.lineWidth = 1
        const cellHeight = GRID_STEP
        for (let i = 0; i < 8; i++) {
            const y = top + i * cellHeight
            g.fillStyle = colorForBoolean(displayValues[i])
            g.beginPath()
            g.rect(left, y, width, cellHeight)
            g.fill()
            g.stroke()
        }

        for (const input of this.inputs) {
            drawWireLineToComponent(g, input, left - 2, input.posYInParentTransform, true)
        }

        ctx.inNonTransformedFrame(ctx => {
            if (isDefined(this._name)) {
                const valueString = displayValues.map(toLogicValueRepr).join("")
                drawComponentName(g, ctx, this._name, valueString, this, true)
            }

            for (let i = 0; i < 8; i++) {
                const y = top + cellHeight / 2 + i * cellHeight
                drawRoundValue(g, displayValues[i], ...ctx.rotatePoint(this.posX, y), { small: true })
            }
        })
    }

    private doSetName(name: ComponentName) {
        this._name = name
        this.setNeedsRedraw("name changed")
    }

    protected override makeComponentSpecificContextMenuItems(): undefined | [ContextMenuItemPlacement, ContextMenuItem][] {

        return [
            ["mid", this.makeSetNameContextMenuItem(this._name, this.doSetName.bind(this))],
        ]
    }


    public override keyDown(e: KeyboardEvent): void {
        if (e.key === "Enter") {
            this.runSetNameDialog(this._name, this.doSetName.bind(this))
        }
    }

}
