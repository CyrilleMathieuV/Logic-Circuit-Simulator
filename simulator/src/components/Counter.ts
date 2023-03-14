import * as t from "io-ts"
import { COLOR_BACKGROUND, COLOR_COMPONENT_BORDER, COLOR_COMPONENT_INNER_LABELS, COLOR_EMPTY, COLOR_LABEL_OFF, COLOR_MOUSE_OVER, displayValuesFromArray, drawLabel, drawWireLineToComponent, formatWithRadix, GRID_STEP } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { ArrayFillWith, isDefined, isNotNull, isNull, isUndefined, isUnknown, LogicValue, typeOrNull, typeOrUndefined, Unknown } from "../utils"
import { ComponentBase, defineComponent, Repr } from "./Component"
import { ContextMenuData, ContextMenuItem, ContextMenuItemPlacement, DrawContext } from "./Drawable"
import { EdgeTrigger, Flipflop, FlipflopOrLatch, makeTriggerItems } from "./FlipflopOrLatch"

const GRID_WIDTH = 5
const GRID_HEIGHT = 11

const enum INPUT { Clock, Clear }

const OUTPUT = {
    Q: [0, 1, 2, 3] as const,
    V: 4,
}

const COUNTER_WIDTH = OUTPUT.Q.length
const COUNTER_RESET_VALUE = Math.pow(2, COUNTER_WIDTH)

export const CounterDef =
    defineComponent(true, true, t.type({
        type: t.literal("counter"),
        count: typeOrUndefined(t.number),
        trigger: typeOrUndefined(t.keyof(EdgeTrigger)),
        displayRadix: typeOrUndefined(typeOrNull(t.number)), // undefined means default, null means no display
    }, "Counter"))

type CounterRepr = Repr<typeof CounterDef>

const CounterDefaults = {
    trigger: EdgeTrigger.rising,
    displayRadix: 10,
}

export class Counter extends ComponentBase<CounterRepr, [LogicValue[], LogicValue]> {

    private _trigger: EdgeTrigger = CounterDefaults.trigger
    private _lastClock: LogicValue = Unknown
    private _displayRadix: number | undefined = CounterDefaults.displayRadix

    private static savedStateFrom(savedData: { count: number | undefined } | null, width: number): [LogicValue[], LogicValue] {
        if (isNull(savedData) || isUndefined(savedData.count)) {
            return [[false, false, false, false], false]
        }
        return [Counter.decimalToNBits(savedData.count, width), false]
    }

    private static decimalToNBits(value: number, width: number): LogicValue[] {
        value = value % COUNTER_RESET_VALUE
        const binStr = value.toString(2).padStart(width, "0")
        const asBits = ArrayFillWith(false, width)
        for (let i = 0; i < width; i++) {
            asBits[i] = binStr[width - i - 1] === "1"
        }
        return asBits
    }

    public constructor(editor: LogicEditor, savedData: CounterRepr | null) {
        super(editor, Counter.savedStateFrom(savedData, COUNTER_WIDTH), savedData, {
            ins: [
                [S.Components.Generic.InputClockDesc, -4, +4, "w"],
                [S.Components.Generic.InputClearDesc, 0, +6, "s"],
            ],
            outs: [
                ["Q0", +4, -4, "e", "Q"],
                ["Q1", +4, -2, "e", "Q"],
                ["Q2", +4, 0, "e", "Q"],
                ["Q3", +4, +2, "e", "Q"],
                ["V (oVerflow)", +4, +4, "e"],
            ],
        })
        if (isNotNull(savedData)) {
            this._trigger = savedData.trigger ?? CounterDefaults.trigger
            this._displayRadix = isUndefined(savedData.displayRadix) ? CounterDefaults.displayRadix :
                (savedData.displayRadix === null ? undefined : savedData.displayRadix) // convert null in the repr to undefined
        }
        this.setInputsPreferSpike(INPUT.Clock, INPUT.Clear)
    }

    public toJSON() {
        const [__, currentCountOrUnknown] = displayValuesFromArray(this.value[0], false)
        const currentCount = isUnknown(currentCountOrUnknown) ? 0 : currentCountOrUnknown
        const displayRadix = isUndefined(this._displayRadix) ? null : this._displayRadix
        return {
            type: "counter" as const,
            ...this.toJSONBase(),
            count: currentCount === 0 ? undefined : currentCount,
            trigger: (this._trigger !== CounterDefaults.trigger) ? this._trigger : undefined,
            displayRadix: (displayRadix !== CounterDefaults.displayRadix) ? displayRadix : undefined,
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
        const s = S.Components.Counter.tooltip
        return tooltipContent(s.title, mods(
            div(s.desc) // TODO more info
        ))
    }

    protected doRecalcValue(): [LogicValue[], LogicValue] {
        const clear = this.inputs[INPUT.Clear].value
        if (clear === true) {
            return [ArrayFillWith(false, COUNTER_WIDTH), false]
        }

        const prevClock = this._lastClock
        const clock = this._lastClock = this.inputs[INPUT.Clock].value
        const activeOverflowValue = this._trigger === EdgeTrigger.rising ? true : false

        if (Flipflop.isClockTrigger(this._trigger, prevClock, clock)) {
            const [__, value] = displayValuesFromArray(this.value[0], false)
            if (isUnknown(value)) {
                return [[Unknown, Unknown, Unknown, Unknown], Unknown]
            }
            const newValue = value + 1
            if (newValue >= COUNTER_RESET_VALUE) {
                return [ArrayFillWith(false, COUNTER_WIDTH), activeOverflowValue]
            }

            return [Counter.decimalToNBits(newValue, COUNTER_WIDTH), !activeOverflowValue]

        } else {
            return [this.value[0], !activeOverflowValue]
        }
    }

    protected override propagateValue(newValue: [LogicValue[], LogicValue]) {
        for (let i = 0; i < newValue[0].length; i++) {
            this.outputs[OUTPUT.Q[i]].value = newValue[0][i]
        }
        this.outputs[OUTPUT.V].value = newValue[1]
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

        g.fillStyle = COLOR_BACKGROUND
        g.strokeStyle = ctx.isMouseOver ? COLOR_MOUSE_OVER : COLOR_COMPONENT_BORDER
        g.lineWidth = 3

        g.beginPath()
        g.rect(left, top, width, height)
        g.fill()
        g.stroke()
        g.fillStyle = COLOR_BACKGROUND

        Flipflop.drawClockInput(g, left, this.inputs[INPUT.Clock], this._trigger)
        drawWireLineToComponent(g, this.inputs[INPUT.Clear], this.inputs[INPUT.Clear].posXInParentTransform, bottom + 2, false)

        for (const output of this.outputs) {
            drawWireLineToComponent(g, output, right + 2, output.posYInParentTransform, false)
        }


        ctx.inNonTransformedFrame(ctx => {
            g.fillStyle = COLOR_COMPONENT_INNER_LABELS
            g.font = "12px sans-serif"

            drawLabel(ctx, this.orient, "Clr", "s", this.inputs[INPUT.Clear], bottom)

            drawLabel(ctx, this.orient, "V", "e", right, this.outputs[OUTPUT.V])
            g.font = "bold 12px sans-serif"

            const offsetY = (this.outputs[OUTPUT.Q[1]].posYInParentTransform + this.outputs[OUTPUT.Q[2]].posYInParentTransform) / 2
            drawLabel(ctx, this.orient, "Q", "e", right, offsetY, this.outputs[OUTPUT.Q[0]])

            if (isDefined(this._displayRadix)) {
                g.font = "bold 20px sans-serif"
                const [__, currentCount] = displayValuesFromArray(this.value[0], false)
                const stringRep = formatWithRadix(currentCount, this._displayRadix, 1, false)
                const valueCenter = ctx.rotatePoint(this.posX - 5, offsetY)

                g.fillStyle = COLOR_EMPTY
                FlipflopOrLatch.drawStoredValueFrame(g, ...valueCenter, 28, 28)

                g.textAlign = "center"
                g.textBaseline = "middle"
                g.fillStyle = COLOR_LABEL_OFF
                g.fillText(stringRep, ...valueCenter)
            }

        })
    }

    private doSetDisplayRadix(displayRadix: number | undefined) {
        this._displayRadix = displayRadix
        this.setNeedsRedraw("display radix changed")
    }


    protected override makeComponentSpecificContextMenuItems(): undefined | [ContextMenuItemPlacement, ContextMenuItem][] {

        const s = S.Components.Counter.contextMenu
        const makeItemShowRadix = (displayRadix: number | undefined, desc: string) => {
            const icon = this._displayRadix === displayRadix ? "check" : "none"
            const caption = s.DisplayTempl.expand({ desc })
            const action = () => this.doSetDisplayRadix(displayRadix)
            return ContextMenuData.item(icon, caption, action)
        }

        const items: [ContextMenuItemPlacement, ContextMenuItem][] = [
            ...makeTriggerItems(this._trigger, this.doSetTrigger.bind(this)),
            ["mid", ContextMenuData.sep()],
            ["mid", makeItemShowRadix(undefined, s.DisplayNone)],
            ["mid", makeItemShowRadix(10, s.DisplayDecimal)],
            ["mid", makeItemShowRadix(16, s.DisplayHex)],
        ]

        const forceOutputItem = this.makeForceOutputsContextMenuItem()
        if (isDefined(forceOutputItem)) {
            items.push(
                ["mid", ContextMenuData.sep()],
                ["mid", forceOutputItem],
            )
        }

        return items
    }

}