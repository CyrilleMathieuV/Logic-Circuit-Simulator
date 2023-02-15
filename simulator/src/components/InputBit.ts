import * as t from "io-ts"
import { circle, colorForBoolean, COLOR_COMPONENT_BORDER, COLOR_MOUSE_OVER, dist, drawComponentName, drawRoundValueCentered, drawWireLineToComponent, GRID_STEP, INPUT_OUTPUT_DIAMETER, triangle } from "../drawutils"
import { emptyMod, mods, tooltipContent } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { HighImpedance, isDefined, isNotNull, isUndefined, isUnknown, LogicValue, LogicValueRepr, Mode, toLogicValue, toLogicValueRepr, typeOrUndefined, Unknown } from "../utils"
import { Component, ComponentBase, ComponentName, ComponentNameRepr, defineComponent, extendComponent } from "./Component"
import { ContextMenuData, ContextMenuItem, ContextMenuItemPlacement, DrawContext, Orientation } from "./Drawable"
import { Node, NodeIn } from "./Node"

export const InputBitBaseDef =
    defineComponent(0, 1, t.type({
        name: ComponentNameRepr,
    }, "InputBitBase"))

export type InputBitBaseRepr = typeof InputBitBaseDef.reprType

export abstract class InputBitBase<Repr extends InputBitBaseRepr> extends ComponentBase<0, 1, Repr, LogicValue> {

    private _name: ComponentName = undefined

    protected constructor(editor: LogicEditor, initialValue: LogicValue, savedData: Repr | null) {
        super(editor, initialValue, savedData, { outs: [[undefined, +3, 0, "e"]] })
        if (isNotNull(savedData)) {
            this._name = savedData.name
        }
    }

    public override toJSONBase() {
        return {
            ...super.toJSONBase(),
            name: this._name,
        }
    }

    protected override toStringDetails(): string {
        return "" + this.value
    }

    public get unrotatedWidth() {
        return INPUT_OUTPUT_DIAMETER
    }

    public get unrotatedHeight() {
        return INPUT_OUTPUT_DIAMETER
    }

    public override isOver(x: number, y: number) {
        return dist(x, y, this.posX, this.posY) < INPUT_OUTPUT_DIAMETER / 2
    }

    public override get allowsForcedOutputs() {
        return false
    }

    protected override propagateValue(newValue: LogicValue) {
        this.outputs[0].value = newValue
    }

    protected shouldDrawBorder() {
        return true
    }

    protected doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {
        drawWireLineToComponent(g, this.outputs[0], this.posX + 8, this.posY)

        const displayValue = this.editor.options.hideInputColors ? Unknown : this.value

        const shouldDrawBorder = this.shouldDrawBorder()
        if (shouldDrawBorder) {
            const drawMouseOver = ctx.isMouseOver && this.editor.mode !== Mode.STATIC

            if (drawMouseOver) {
                g.strokeStyle = COLOR_MOUSE_OVER
                g.fillStyle = COLOR_MOUSE_OVER
            } else {
                g.strokeStyle = COLOR_COMPONENT_BORDER
                g.fillStyle = COLOR_COMPONENT_BORDER
            }
            g.lineWidth = 3
            g.beginPath()
            triangle(g,
                this.posX + INPUT_OUTPUT_DIAMETER / 2 - 1, this.posY - 7,
                this.posX + INPUT_OUTPUT_DIAMETER / 2 - 1, this.posY + 7,
                this.posX + INPUT_OUTPUT_DIAMETER / 2 + 5, this.posY,
            )
            g.fill()
            g.stroke()

            g.fillStyle = colorForBoolean(displayValue)
            g.lineWidth = 4
            g.beginPath()
            circle(g, this.posX, this.posY, INPUT_OUTPUT_DIAMETER)
            g.fill()
            g.stroke()
        }

        ctx.inNonTransformedFrame(ctx => {
            if (isDefined(this._name)) {
                drawComponentName(g, ctx, this._name, toLogicValueRepr(displayValue), this, false)
            }
            const forcedFillStyle = !shouldDrawBorder ? g.fillStyle = COLOR_COMPONENT_BORDER : undefined
            drawRoundValueCentered(g, displayValue, this, { fillStyle: forcedFillStyle })
        })
    }

    protected override autoConnected(newLinks: [Node, Component, Node][]) {
        if (newLinks.length !== 1) {
            return
        }
        const [outNode, comp, inNode] = newLinks[0]
        if (inNode instanceof NodeIn && this instanceof InputBit) {
            if (inNode._prefersSpike) {
                this.doSetIsPushButton(true)
            }
            if (isUndefined(this._name) && isDefined(inNode.name)) {
                this.doSetName(inNode.name)
            }
        }
        if (outNode.orient !== "e") {
            return
        }
        switch (Orientation.add(comp.orient, inNode.orient)) {
            case "w":
                // nothing to do
                return
            case "e":
                this.doSetOrient("w")
                this.setPosition(this.posX + GRID_STEP * 6, this.posY)
                return
            case "s":
                this.doSetOrient("n")
                this.setPosition(this.posX + GRID_STEP * 3, this.posY + GRID_STEP * 3)
                return
            case "n":
                this.doSetOrient("s")
                this.setPosition(this.posX + GRID_STEP * 3, this.posY - GRID_STEP * 3)
                return
        }
    }

    protected doSetName(name: ComponentName) {
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


export const InputBitDef =
    extendComponent(InputBitBaseDef, t.type({
        val: LogicValueRepr,
        isPushButton: typeOrUndefined(t.boolean),
        isConstant: typeOrUndefined(t.boolean),
    }, "InputBit"))

export type InputBitRepr = typeof InputBitDef.reprType

const InputBitDefaults = {
    isPushButton: false,
    isConstant: false,
}


export class InputBit extends InputBitBase<InputBitRepr> {

    public static nextValue(value: LogicValue, mode: Mode, altKey: boolean): LogicValue {
        switch (value) {
            case true: return (mode >= Mode.FULL && altKey) ? Unknown : false
            case false: return (mode >= Mode.FULL && altKey) ? Unknown : true
            case Unknown: return mode >= Mode.FULL ? (altKey ? HighImpedance : false) : Unknown
            case HighImpedance: return mode >= Mode.FULL ? (altKey ? Unknown : false) : HighImpedance
        }
    }

    private _isPushButton = InputBitDefaults.isPushButton
    private _isConstant = InputBitDefaults.isConstant

    public constructor(editor: LogicEditor, savedData: InputBitRepr | null) {
        super(
            editor,
            // initial value may be given by saved data
            isNotNull(savedData) ? toLogicValue(savedData.val) : false,
            savedData,
        )
        if (isNotNull(savedData)) {
            this._isPushButton = savedData.isPushButton ?? InputBitDefaults.isPushButton
            this._isConstant = savedData.isConstant ?? InputBitDefaults.isConstant
        }

    }

    public toJSON() {
        return {
            ...super.toJSONBase(),
            val: toLogicValueRepr(this.value),
            isPushButton: (this._isPushButton !== InputBitDefaults.isPushButton) ? this._isPushButton : undefined,
            isConstant: (this._isConstant !== InputBitDefaults.isConstant) ? this._isConstant : undefined,
        }
    }

    public get componentType() {
        return "in" as const
    }

    public override get cursorWhenMouseover() {
        const mode = this.editor.mode
        if (mode === Mode.STATIC) {
            // signal we can't switch it here
            return "not-allowed"
        }
        if (this._isConstant) {
            if (mode >= Mode.DESIGN) {
                // we can still move it
                return "grab"
            } else {
                // no special pointer change, it's constant and static
                return undefined
            }
        }
        // we can switch it
        return "pointer"
    }

    public override makeTooltip() {
        const s = S.Components.InputBit.tooltip
        return tooltipContent(undefined, mods(s.title, isUnknown(this.value) ? " " + s.WhoseValueIsUnknown : emptyMod))
    }

    protected doRecalcValue(): LogicValue {
        // this never changes on its own, just upon user interaction
        return this.value
    }

    protected override shouldDrawBorder() {
        return !this._isConstant
    }

    public override mouseClicked(e: MouseEvent | TouchEvent) {
        if (super.mouseClicked(e)) {
            return true
        }

        if (this.editor.mode === Mode.STATIC || this._isPushButton || this._isConstant) {
            // do nothing for normal push button
            return false
        }
        this.doSetValue(InputBit.nextValue(this.value, this.editor.mode, e.altKey))
        return true
    }

    public override mouseDown(e: MouseEvent | TouchEvent) {
        if (this.editor.mode !== Mode.STATIC && this._isPushButton && !this._isConstant) {
            this.doSetValue(true)
        }
        return super.mouseDown(e)
    }

    public override mouseUp(e: MouseEvent | TouchEvent) {
        const result = super.mouseUp(e)
        if (this.editor.mode !== Mode.STATIC && this._isPushButton && !this._isConstant) {
            this.doSetValue(false)
        }
        return result
    }


    public doSetIsPushButton(isPushButton: boolean) {
        this._isPushButton = isPushButton
        if (isPushButton) {
            this.doSetValue(false)
        }
    }

    private doSetIsConstant(isConstant: boolean) {
        this._isConstant = isConstant
        this.setNeedsRedraw("constant changed")
    }

    protected override makeComponentSpecificContextMenuItems(): undefined | [ContextMenuItemPlacement, ContextMenuItem][] {
        const s = S.Components.InputBit.contextMenu

        const makeItemBehaveAs = (desc: string, value: boolean) => {
            const isCurrent = this._isPushButton === value
            const icon = isCurrent ? "check" : "none"
            const action = isCurrent ? () => undefined : () => this.doSetIsPushButton(value)
            return ContextMenuData.item(icon, desc, action)
        }

        const makeToggleConstantItem = () => {
            const icon = this._isConstant ? "check" : "none"
            const action = () => this.doSetIsConstant(!this._isConstant)
            return ContextMenuData.item(icon, s.LockValue + ` (${toLogicValueRepr(this.value)})`, action)
        }

        const newItems: [ContextMenuItemPlacement, ContextMenuItem][] = [
            ["mid", makeItemBehaveAs(s.ToggleButton, false)],
            ["mid", makeItemBehaveAs(s.PushButton, true)],
            ["mid", ContextMenuData.sep()],
            ["mid", makeToggleConstantItem()],
            ["mid", ContextMenuData.sep()],
        ]

        const superItems = super.makeComponentSpecificContextMenuItems()
        if (isDefined(superItems)) {
            newItems.push(...superItems)
        }

        return newItems
    }


}
