import * as t from "io-ts"
import { circle, colorForBoolean, COLOR_BACKGROUND, COLOR_COMPONENT_BORDER, COLOR_MOUSE_OVER, dist, drawComponentName, drawValueText, drawValueTextCentered, drawWireLineToComponent, GRID_STEP, INPUT_OUTPUT_DIAMETER, inRect, triangle, useCompact } from "../drawutils"
import { mods, tooltipContent } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { ArrayClampOrPad, ArrayFillWith, HighImpedance, isArray, isDefined, isNumber, isUndefined, LogicValue, LogicValueRepr, Mode, toLogicValue, toLogicValueFromChar, toLogicValueRepr, typeOrUndefined, Unknown } from "../utils"
import { ClockDef, ClockRepr } from "./Clock"
import { Component, ComponentName, ComponentNameRepr, defineParametrizedComponent, ExtractParamDefs, ExtractParams, groupVertical, InstantiatedComponentDef, NodesIn, NodesOut, param, ParametrizedComponentBase, Repr, ResolvedParams, SomeParamCompDef } from "./Component"
import { ContextMenuData, DrawContext, MenuItems, Orientation } from "./Drawable"
import { Node, NodeIn, NodeOut } from "./Node"


type InputBaseRepr = InputRepr | ClockRepr

export abstract class InputBase<
    TRepr extends InputBaseRepr,
    TParamDefs extends ExtractParamDefs<TRepr> = ExtractParamDefs<TRepr>,
    TParams extends ExtractParams<TRepr> = ExtractParams<TRepr>
> extends ParametrizedComponentBase<
    TRepr,
    LogicValue[],
    TParamDefs,
    TParams,
    NodesIn<TRepr>,
    NodesOut<TRepr>,
    false, true
> {

    public abstract get numBits(): number
    protected _name: ComponentName

    protected constructor(editor: LogicEditor, SubclassDef: [InstantiatedComponentDef<TRepr, LogicValue[]>, SomeParamCompDef<TParamDefs>], saved?: TRepr) {
        super(editor, SubclassDef, saved)
        this._name = saved?.name ?? undefined
    }

    protected override toJSONBase() {
        return {
            ...super.toJSONBase(),
            name: this._name,
        }
    }

    public override isOver(x: number, y: number) {
        if (this.numBits === 1) {
            return dist(x, y, this.posX, this.posY) < INPUT_OUTPUT_DIAMETER / 2
        }
        return inRect(this.posX, this.posY, this.width, this.height, x, y)
    }

    public override get allowsForcedOutputs() {
        return false
    }

    protected doRecalcValue(): LogicValue[] {
        // this never changes on its own, just upon user interaction
        // or automatically for clocks
        return this.value
    }

    protected override propagateValue(newValue: LogicValue[]) {
        this.outputValues(this.outputs.Out, newValue)
    }

    protected shouldDrawBorder() {
        return true
    }

    protected override doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {
        if (this.numBits === 1) {
            this.doDrawSingle(g, ctx, this.outputs.Out[0])
        } else {
            this.doDrawMulti(g, ctx, this.outputs.Out)
        }
    }

    private doDrawSingle(g: CanvasRenderingContext2D, ctx: DrawContext, output: NodeOut) {
        drawWireLineToComponent(g, output, this.posX + 8, this.posY)

        const displayValue = this.editor.options.hideInputColors ? Unknown : output.value

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
            drawValueTextCentered(g, displayValue, this, { fillStyle: forcedFillStyle })
        })
    }

    private doDrawMulti(g: CanvasRenderingContext2D, ctx: DrawContext, outputs: NodeOut[]) {
        const bounds = this.bounds()
        const { left, top, width, right } = bounds
        const outline = bounds.outline

        // background
        g.fillStyle = COLOR_BACKGROUND
        g.fill(outline)

        // outputs
        for (const output of outputs) {
            drawWireLineToComponent(g, output, right + 3, output.posYInParentTransform, true)
        }

        const displayValues = this.editor.options.hideInputColors
            ? ArrayFillWith(Unknown, this.numBits) : this.value

        // cells
        const drawMouseOver = ctx.isMouseOver && this.editor.mode !== Mode.STATIC
        g.strokeStyle = drawMouseOver ? COLOR_MOUSE_OVER : COLOR_COMPONENT_BORDER
        g.lineWidth = 1
        const cellHeight = useCompact(this.numBits) ? GRID_STEP : 2 * GRID_STEP
        for (let i = 0; i < this.numBits; i++) {
            const y = top + i * cellHeight
            g.fillStyle = colorForBoolean(displayValues[i])
            g.beginPath()
            g.rect(left, y, width, cellHeight)
            g.fill()
            g.stroke()
        }

        // outline
        g.lineWidth = 3
        g.stroke(outline)

        // labels
        ctx.inNonTransformedFrame(ctx => {
            if (isDefined(this._name)) {
                const valueString = displayValues.map(toLogicValueRepr).join("")
                drawComponentName(g, ctx, this._name, valueString, this, false)
            }

            for (let i = 0; i < this.numBits; i++) {
                const y = top + cellHeight / 2 + i * cellHeight
                drawValueText(g, displayValues[i], ...ctx.rotatePoint(this.posX, y), { small: useCompact(this.numBits) })
            }
        })
    }

    protected override autoConnected(newLinks: [Node, Component, Node][]) {
        if (newLinks.length !== 1) {
            return
        }
        const [outNode, comp, inNode] = newLinks[0]
        if (inNode instanceof NodeIn) {
            if (inNode.prefersSpike) {
                this.doSetIsPushButton(true) // will do nothing for clocks
            }
            if (isUndefined(this._name)) {
                this.doSetName(inNode.shortName)
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

    public doSetIsPushButton(__isPushButton: boolean): void {
        // overridden in normal Input, not in Clock
    }

    private doSetName(name: ComponentName) {
        this._name = name
        this.setNeedsRedraw("name changed")
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        return [
            ["mid", this.makeSetNameContextMenuItem(this._name, this.doSetName.bind(this))],
        ]
    }

    public override keyDown(e: KeyboardEvent): void {
        if (e.key === "Enter") {
            this.runSetNameDialog(this._name, this.doSetName.bind(this))
        } else {
            super.keyDown(e)
        }
    }


}


export const InputDef =
    defineParametrizedComponent("in", undefined, false, true, {
        variantName: ({ bits }) => `in-${bits}`,
        button: { imgWidth: 32 },
        repr: {
            bits: typeOrUndefined(t.number),
            val: typeOrUndefined(t.union([
                LogicValueRepr,
                t.string,
                t.array(LogicValueRepr),
            ])),
            isPushButton: typeOrUndefined(t.boolean),
            isConstant: typeOrUndefined(t.boolean),
            name: ComponentNameRepr,
        },
        valueDefaults: {
            isPushButton: false,
            isConstant: false,
        },
        params: {
            bits: param(1, [1, 2, 3, 4, 8, 16, 32]),
        },
        validateParams: ({ bits }) => ({
            numBits: bits,
        }),
        size: ({ numBits }) => {
            if (numBits === 1) {
                const d = INPUT_OUTPUT_DIAMETER / GRID_STEP
                return { gridWidth: d, gridHeight: d }
            }
            return {
                gridWidth: 2,
                gridHeight: useCompact(numBits) ? numBits : 2 * numBits,
            }
        },
        makeNodes: ({ numBits }) => ({
            outs: {
                Out: groupVertical("e", numBits === 1 ? 3 : 2, 0, numBits),
            },
        }),
        initialValue: (saved, { numBits }) => {
            const allFalse = () => ArrayFillWith<LogicValue>(false, numBits)
            if (isUndefined(saved)) {
                return allFalse()
            }
            let val
            if (isDefined(val = saved.val)) {
                if (isArray(val)) {
                    return ArrayClampOrPad(val.map(v => toLogicValue(v)), numBits, false)
                } else if (isNumber(val)) {
                    return ArrayFillWith<LogicValue>(toLogicValue(val), numBits)
                } else if (val.length === 0) {
                    return allFalse()
                } else {
                    return ArrayClampOrPad(Array.from(val).reverse().map(v => toLogicValueFromChar(v)), numBits, false)
                }
            }
            return allFalse()
        },
    })

export type InputRepr = Repr<typeof InputDef>
export type InputParams = ResolvedParams<typeof InputDef>


export class Input extends InputBase<InputRepr> {

    public readonly numBits: number
    private _isPushButton: boolean
    private _isConstant: boolean

    public constructor(editor: LogicEditor, params: InputParams, saved?: InputRepr) {
        super(editor, InputDef.with(params), saved)

        this.numBits = params.numBits

        this._isPushButton = saved?.isPushButton ?? InputDef.aults.isPushButton
        this._isConstant = saved?.isConstant ?? InputDef.aults.isConstant
    }

    public toJSON() {
        return {
            bits: this.numBits === InputDef.aults.bits ? undefined : this.numBits,
            ...this.toJSONBase(),
            val: this.contentRepr(),
            isPushButton: (this._isPushButton !== InputDef.aults.isPushButton) ? this._isPushButton : undefined,
            isConstant: (this._isConstant !== InputDef.aults.isConstant) ? this._isConstant : undefined,
        }
    }

    private contentRepr(): LogicValueRepr | string | undefined {
        if (this.numBits === 1) {
            const value = this.value[0]
            return value === false ? undefined : toLogicValueRepr(value)
        }
        const value = this.value
        let nontrivial = false
        for (let i = 0; i < this.numBits; i++) {
            if (value[i] !== false) {
                nontrivial = true
                break
            }
        }
        if (!nontrivial) {
            return undefined
        }

        return this.value.map(toLogicValueRepr).reverse().join("")
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
        const s = S.Components.Input.tooltip
        return tooltipContent(undefined, mods(s.title.expand({ numBits: 1 })))
    }

    protected override shouldDrawBorder() {
        return !this._isConstant
    }

    public override mouseClicked(e: MouseEvent | TouchEvent) {
        if (super.mouseClicked(e)) {
            return true
        }

        if (this.editor.mode === Mode.STATIC || this._isPushButton || this._isConstant) {
            return false
        }

        const i = this.clickedBitIndex(e)
        if (i !== -1) {
            this.doSetValueChangingBit(i, nextValue(this.value[i], this.editor.mode, e.altKey))
        }
        return true
    }

    public override mouseDown(e: MouseEvent | TouchEvent) {
        this.trySetPushButtonBit(true, e)
        return super.mouseDown(e)
    }

    public override mouseUp(e: MouseEvent | TouchEvent) {
        const result = super.mouseUp(e)
        this.trySetPushButtonBit(false, e)
        return result
    }

    private clickedBitIndex(e: MouseEvent | TouchEvent): number {
        const h = this.unrotatedHeight
        const y = this.editor.offsetXYForComponent(e, this)[1] - this.posY + h / 2
        const i = Math.floor(y * this.numBits / h)
        if (i >= 0 && i < this.numBits) {
            return i
        }
        return -1
    }

    private trySetPushButtonBit(v: LogicValue, e: MouseEvent | TouchEvent) {
        let i
        if (this.editor.mode !== Mode.STATIC
            && this._isPushButton
            && !this._isConstant
            && (i = this.clickedBitIndex(e)) !== -1) {
            this.doSetValueChangingBit(i, v)
        }
    }

    private doSetValueChangingBit(i: number, v: LogicValue) {
        const newValues = [...this.value]
        newValues[i] = v
        this.doSetValue(newValues)
    }

    public override doSetIsPushButton(isPushButton: boolean) {
        this._isPushButton = isPushButton
        if (isPushButton) {
            this.doSetValue(ArrayFillWith(false, this.numBits))
        }
    }

    private doSetIsConstant(isConstant: boolean) {
        this._isConstant = isConstant
        this.setNeedsRedraw("constant changed")
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        const s = S.Components.Input.contextMenu

        const makeItemBehaveAs = (desc: string, value: boolean) => {
            const isCurrent = this._isPushButton === value
            const icon = isCurrent ? "check" : "none"
            const action = isCurrent ? () => undefined : () => this.doSetIsPushButton(value)
            return ContextMenuData.item(icon, desc, action)
        }

        const newItems: MenuItems = [
            ["mid", makeItemBehaveAs(s.ToggleButton, false)],
            ["mid", makeItemBehaveAs(s.PushButton, true)],
            ["mid", ContextMenuData.sep()],
            this.makeChangeParamsContextMenuItem("outputs", S.Components.Generic.contextMenu.ParamNumBits, this.numBits, "bits"),
            ["mid", ContextMenuData.sep()],

        ]

        if (this.numBits === 1) {
            const makeToggleConstantItem = () => {
                const icon = this._isConstant ? "check" : "none"
                const action = () => this.doSetIsConstant(!this._isConstant)
                return ContextMenuData.item(icon, s.LockValue + ` (${toLogicValueRepr(this.value[0])})`, action)
            }
            const replaceWithClockItem =
                ContextMenuData.item("timer", s.ReplaceWithClock, () => {
                    this.replaceWithComponent(ClockDef.make(this.editor))
                })

            newItems.push(
                ["mid", makeToggleConstantItem()],
                ["mid", ContextMenuData.sep()],
                ["mid", replaceWithClockItem],
                ["mid", ContextMenuData.sep()],
            )
        }

        newItems.push(...super.makeComponentSpecificContextMenuItems())

        return newItems
    }

}
InputDef.impl = Input

function nextValue(value: LogicValue, mode: Mode, altKey: boolean): LogicValue {
    switch (value) {
        case true: return (mode >= Mode.FULL && altKey) ? Unknown : false
        case false: return (mode >= Mode.FULL && altKey) ? Unknown : true
        case Unknown: return mode >= Mode.FULL ? (altKey ? HighImpedance : false) : Unknown
        case HighImpedance: return mode >= Mode.FULL ? (altKey ? Unknown : false) : HighImpedance
    }
}