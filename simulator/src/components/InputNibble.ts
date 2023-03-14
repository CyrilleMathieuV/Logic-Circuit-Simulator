import * as t from "io-ts"
import { LogicEditor } from "../LogicEditor"
import { COLOR_BACKGROUND, COLOR_COMPONENT_BORDER, COLOR_MOUSE_OVER, GRID_STEP, colorForBoolean, drawComponentName, drawRoundValue, drawWireLineToComponent, inRect } from "../drawutils"
import { mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { ArrayFillWith, LogicValue, LogicValueRepr, Mode, Unknown, isDefined, isNotNull, isNull, toLogicValue, toLogicValueRepr } from "../utils"
import { ComponentBase, ComponentName, ComponentNameRepr, Repr, defineComponent } from "./Component"
import { ContextMenuItem, ContextMenuItemPlacement, DrawContext } from "./Drawable"
import { InputBit } from "./InputBit"

const GRID_WIDTH = 2
const GRID_HEIGHT = 8

export const InputNibbleDef =
    defineComponent(false, true, t.type({
        type: t.literal("nibble"),
        val: t.array(LogicValueRepr),
        name: ComponentNameRepr,
        // radix: typeOrUndefined(t.number),
    }, "InputNibble"))

type InputNibbleRepr = Repr<typeof InputNibbleDef>

export class InputNibble extends ComponentBase<InputNibbleRepr, LogicValue[]> {

    private static savedStateFrom(savedData: { val: LogicValueRepr[] } | null): LogicValue[] {
        if (isNull(savedData)) {
            return [false, false, false, false]
        }
        return savedData.val.map(v => toLogicValue(v))
    }


    private _name: ComponentName = undefined
    // private _radix = DEFAULT_RADIX

    public constructor(editor: LogicEditor, savedData: InputNibbleRepr | null) {
        super(editor, InputNibble.savedStateFrom(savedData), savedData, {
            outs: [
                [undefined, 2, -3, "e", "Out"],
                [undefined, 2, -1, "e", "Out"],
                [undefined, 2, +1, "e", "Out"],
                [undefined, 2, +3, "e", "Out"],
            ],
        })
        if (isNotNull(savedData)) {
            this._name = savedData.name
        }
    }

    public toJSON() {
        return {
            type: "nibble" as const,
            ...this.toJSONBase(),
            val: this.value.map(v => toLogicValueRepr(v)),
            name: this._name,
        }
    }

    public get componentType() {
        return "in" as const
    }

    public override get cursorWhenMouseover() {
        return this.editor.mode === Mode.STATIC ? "not-allowed" : "pointer"
    }

    public get unrotatedWidth() {
        return GRID_WIDTH * GRID_STEP
    }

    public get unrotatedHeight() {
        return GRID_HEIGHT * GRID_STEP
    }

    public override isOver(x: number, y: number) {
        return inRect(this.posX, this.posY, this.width, this.height, x, y)
    }

    public override makeTooltip() {
        return tooltipContent(undefined, mods(S.Components.InputNibble.tooltip))
    }

    protected doRecalcValue(): LogicValue[] {
        // this never changes on its own, just upon user interaction
        return this.value
    }

    protected override propagateValue(newValue: LogicValue[]) {
        for (let i = 0; i < 4; i++) {
            this.outputs[i].value = newValue[i]
        }
    }

    protected doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {

        g.fillStyle = COLOR_BACKGROUND
        const drawMouseOver = ctx.isMouseOver && this.editor.mode !== Mode.STATIC
        g.strokeStyle = drawMouseOver ? COLOR_MOUSE_OVER : COLOR_COMPONENT_BORDER
        g.lineWidth = 4

        const width = GRID_WIDTH * GRID_STEP
        const height = GRID_HEIGHT * GRID_STEP
        const left = this.posX - width / 2
        const right = left + width
        const top = this.posY - height / 2

        g.beginPath()
        g.rect(left, top, width, height)
        g.fill()
        g.stroke()

        const displayValues = this.editor.options.hideInputColors
            ? ArrayFillWith(Unknown, 4) : this.value

        g.lineWidth = 1
        const cellHeight = height / 4
        for (let i = 0; i < 4; i++) {
            const y = top + i * cellHeight
            g.fillStyle = colorForBoolean(displayValues[i])
            g.beginPath()
            g.rect(left, y, width, cellHeight)
            g.fill()
            g.stroke()
        }

        for (const output of this.outputs) {
            drawWireLineToComponent(g, output, right + 2, output.posYInParentTransform, true)
        }

        ctx.inNonTransformedFrame(ctx => {
            if (isDefined(this._name)) {
                const valueString = displayValues.map(toLogicValueRepr).join("")
                drawComponentName(g, ctx, this._name, valueString, this, false)
            }

            for (let i = 0; i < 4; i++) {
                const y = top + cellHeight / 2 + i * cellHeight
                drawRoundValue(g, displayValues[i], ...ctx.rotatePoint(this.posX, y))
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

    public override mouseClicked(e: MouseEvent | TouchEvent) {
        if (super.mouseClicked(e)) {
            return true
        }

        // TODO rotate coordinates here
        const editor = this.editor
        if (editor.mode === Mode.STATIC) {
            return false
        }
        const h = this.unrotatedHeight
        const y = editor.offsetXYForComponent(e, this)[1] - this.posY + h / 2
        const i = Math.floor(y * 4 / h)

        const newValues = [...this.value]
        newValues[i] = InputBit.nextValue(newValues[i], editor.mode, e.altKey)

        this.doSetValue(newValues)
        return true
    }

}
