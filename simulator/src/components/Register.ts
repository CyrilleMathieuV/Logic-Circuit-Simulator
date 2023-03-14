import * as t from "io-ts"
import { COLOR_BACKGROUND, COLOR_BACKGROUND_INVALID, COLOR_COMPONENT_BORDER, COLOR_COMPONENT_INNER_LABELS, COLOR_MOUSE_OVER, drawLabel, drawWireLineToComponent, GRID_STEP } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { isDefined, isNotNull, isNull, isUndefined, LogicValue, LogicValueRepr, toLogicValue, toLogicValueRepr, typeOrUndefined, Unknown } from "../utils"
import { ComponentBase, defineComponent, Repr } from "./Component"
import { ContextMenuData, ContextMenuItem, ContextMenuItemPlacement, DrawContext } from "./Drawable"
import { EdgeTrigger, Flipflop, FlipflopOrLatch, makeTriggerItems } from "./FlipflopOrLatch"

const GRID_WIDTH = 7
const GRID_HEIGHT = 15

const INPUT = {
    Clock: 0,
    Preset: 1,
    Clear: 2,
    Data: [3, 4, 5, 6],
} as const

const OUTPUT = {
    Q: [0, 1, 2, 3],
}

export const RegisterDef =
    defineComponent(true, true, t.type({
        type: t.literal("register"),
        state: typeOrUndefined(t.array(LogicValueRepr)),
        showContent: typeOrUndefined(t.boolean),
        trigger: typeOrUndefined(t.keyof(EdgeTrigger)),
    }, "Register"))

type RegisterRepr = Repr<typeof RegisterDef>

const RegisterDefaults = {
    showContent: true,
    trigger: EdgeTrigger.rising,
}

export class Register extends ComponentBase<RegisterRepr, LogicValue[]> {

    protected _showContent: boolean = RegisterDefaults.showContent
    protected _trigger: EdgeTrigger = RegisterDefaults.trigger
    protected _isInInvalidState = false
    protected _lastClock: LogicValue = Unknown

    private static savedStateFrom(savedData: { state: LogicValueRepr[] | undefined } | null): LogicValue[] {
        if (isNull(savedData) || isUndefined(savedData.state)) {
            return [false, false, false, false]
        }
        return savedData.state.map(v => toLogicValue(v))
    }

    public constructor(editor: LogicEditor, savedData: RegisterRepr | null) {
        super(editor, Register.savedStateFrom(savedData), savedData, {
            ins: [
                [S.Components.Generic.InputClockDesc, -5, +6, "w"], // Clock
                [S.Components.Generic.InputPresetDesc, 0, -8, "n"], // Preset
                [S.Components.Generic.InputClearDesc, 0, +8, "s"], // Clear
                // Data in
                ["D0", -5, -3, "w", "D"],
                ["D0", -5, -1, "w", "D"],
                ["D0", -5, +1, "w", "D"],
                ["D0", -5, 3, "w", "D"],
            ],
            outs: [
                // Data out
                ["Q0", +5, -3, "e", "Q"],
                ["Q1", +5, -1, "e", "Q"],
                ["Q2", +5, +1, "e", "Q"],
                ["Q3", +5, 3, "e", "Q"],
            ],
        })
        if (isNotNull(savedData)) {
            this._showContent = savedData.showContent ?? RegisterDefaults.showContent
            this._trigger = savedData.trigger ?? RegisterDefaults.trigger
        }
        this.setInputsPreferSpike(INPUT.Clock, INPUT.Preset, INPUT.Clear)
    }

    public toJSON() {
        return {
            type: "register" as const,
            ...this.toJSONBase(),
            state: this.value.map(v => toLogicValueRepr(v)),
            showContent: (this._showContent !== RegisterDefaults.showContent) ? this._showContent : undefined,
            trigger: (this._trigger !== RegisterDefaults.trigger) ? this._trigger : undefined,
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

    public get trigger() {
        return this._trigger
    }

    public override makeTooltip() {
        const s = S.Components.Register.tooltip
        return tooltipContent(s.title, mods(
            div(s.desc) // TODO more info
        ))
    }

    protected doRecalcValue(): LogicValue[] {
        const prevClock = this._lastClock
        const clock = this._lastClock = this.inputs[INPUT.Clock].value
        const { isInInvalidState, newState } =
            Flipflop.doRecalcValueForSyncComponent(this, prevClock, clock,
                this.inputs[INPUT.Preset].value,
                this.inputs[INPUT.Clear].value)
        this._isInInvalidState = isInInvalidState
        return newState
    }

    public makeInvalidState(): LogicValue[] {
        return [false, false, false, false]
    }

    public makeStateFromMainValue(val: LogicValue): LogicValue[] {
        return [val, val, val, val]
    }

    public makeStateAfterClock(): LogicValue[] {
        return INPUT.Data.map(i => this.inputs[i].value) as LogicValue[]
    }

    protected override propagateValue(newValue: LogicValue[]) {
        for (let i = 0; i < newValue.length; i++) {
            this.outputs[OUTPUT.Q[i]].value = newValue[i]
        }
    }

    protected doSetShowContent(showContent: boolean) {
        this._showContent = showContent
        this.setNeedsRedraw("show content changed")
    }

    protected doSetTrigger(trigger: EdgeTrigger) {
        this._trigger = trigger
        this.setNeedsRedraw("trigger changed")
    }

    protected doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {

        const width = this.unrotatedWidth
        const height = this.unrotatedHeight
        const left = this.posX - width / 2
        const right = this.posX + width / 2
        const top = this.posY - height / 2
        const bottom = this.posY + height / 2

        g.fillStyle = this._isInInvalidState ? COLOR_BACKGROUND_INVALID : COLOR_BACKGROUND
        g.strokeStyle = ctx.isMouseOver ? COLOR_MOUSE_OVER : COLOR_COMPONENT_BORDER
        g.lineWidth = 3

        g.beginPath()
        g.rect(left, top, width, height)
        g.fill()
        g.stroke()
        g.fillStyle = COLOR_BACKGROUND

        Flipflop.drawClockInput(g, left, this.inputs[INPUT.Clock], this._trigger)
        drawWireLineToComponent(g, this.inputs[INPUT.Preset], this.inputs[INPUT.Preset].posXInParentTransform, top - 2, false)
        drawWireLineToComponent(g, this.inputs[INPUT.Clear], this.inputs[INPUT.Clear].posXInParentTransform, bottom + 2, false)
        for (const i of INPUT.Data) {
            drawWireLineToComponent(g, this.inputs[i], left - 2, this.inputs[i].posYInParentTransform, false)
        }

        for (const output of this.outputs) {
            drawWireLineToComponent(g, output, right + 2, output.posYInParentTransform, false)
        }


        ctx.inNonTransformedFrame(ctx => {
            if (this._showContent && !this.editor.options.hideMemoryContent) {
                for (const output of this.outputs) {
                    FlipflopOrLatch.drawStoredValue(g, output.value, this.posX, output.posYInParentTransform, 20)
                }
            } else {
                g.font = `bold 14px sans-serif`
                g.fillStyle = COLOR_COMPONENT_BORDER
                g.textAlign = "center"
                g.textBaseline = "middle"
                g.fillText("Reg.", this.posX, this.posY)
            }

            g.fillStyle = COLOR_COMPONENT_INNER_LABELS
            g.font = "12px sans-serif"

            drawLabel(ctx, this.orient, "Pre", "n", this.inputs[INPUT.Preset], top)
            drawLabel(ctx, this.orient, "Clr", "s", this.inputs[INPUT.Clear], bottom)

            g.font = "bold 12px sans-serif"
            drawLabel(ctx, this.orient, "Q", "e", right, this.posY, this.outputs[OUTPUT.Q[0]])
            drawLabel(ctx, this.orient, "D", "w", left, this.posY, this.inputs[INPUT.Data[0]])
        })

    }



    protected override makeComponentSpecificContextMenuItems(): undefined | [ContextMenuItemPlacement, ContextMenuItem][] {
        const icon = this._showContent ? "check" : "none"
        const toggleShowOpItem = ContextMenuData.item(icon, S.Components.Generic.contextMenu.ShowContent,
            () => this.doSetShowContent(!this._showContent))

        const items: [ContextMenuItemPlacement, ContextMenuItem][] = [
            ...makeTriggerItems(this._trigger, this.doSetTrigger.bind(this)),
            ["mid", ContextMenuData.sep()],
            ["mid", toggleShowOpItem],
        ]

        const forceOutputItem = this.makeForceOutputsContextMenuItem()
        if (isDefined(forceOutputItem)) {
            items.push(
                ["mid", forceOutputItem]
            )
        }

        return items
    }

}
