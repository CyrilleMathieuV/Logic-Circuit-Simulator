import * as t from "io-ts"
import { colorForBoolean, COLOR_BACKGROUND, COLOR_BACKGROUND_INVALID, COLOR_COMPONENT_BORDER, COLOR_COMPONENT_INNER_LABELS, COLOR_MOUSE_OVER, drawLabel, drawRoundValue, drawWireLineToComponent, GRID_STEP } from "../drawutils"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { FixedArraySize, FixedArraySizeNonZero, isDefined, isNotNull, isNull, LogicValue, LogicValueRepr, Plus3, toLogicValue, toLogicValueRepr, typeOrUndefined, Unknown } from "../utils"
import { ComponentBase, ComponentRepr, defineComponent, NodeVisuals } from "./Component"
import { ContextMenuData, ContextMenuItem, ContextMenuItemPlacement, DrawContext } from "./Drawable"
import { NodeIn } from "./Node"

const GRID_WIDTH = 5
const GRID_HEIGHT = 7

export function defineFlipflopOrLatch<NumInputs extends FixedArraySize, N extends string, P extends t.Props>(numInputs: NumInputs, jsonName: N, className: string, props: P) {
    return defineComponent(numInputs, 2, t.type({
        type: t.literal(jsonName),
        state: typeOrUndefined(LogicValueRepr),
        showContent: typeOrUndefined(t.boolean),
        ...props,
    }, className))
}

export type FlipflopOrLatchRepr<NumInputs extends FixedArraySize> =
    ComponentRepr<NumInputs, 2> & {
        state: LogicValueRepr | undefined
        showContent: boolean | undefined
    }

const FlipflorOrLatchDefaults = {
    showContent: true,
}

export const enum OUTPUT {
    Q, Qb
}

export abstract class FlipflopOrLatch<
    NumInputs extends FixedArraySize,
    Repr extends FlipflopOrLatchRepr<NumInputs>,
> extends ComponentBase<NumInputs, 2, Repr, [LogicValue, LogicValue]> {

    private static savedStateFrom(savedData: { state: LogicValueRepr | undefined } | null): [LogicValue, LogicValue] {
        if (isNull(savedData)) {
            return [false, true]
        }
        const state = toLogicValue(savedData.state ?? 0)
        return [state, LogicValue.invert(state)]
    }

    protected _showContent: boolean = FlipflorOrLatchDefaults.showContent
    protected _isInInvalidState = false

    protected constructor(editor: LogicEditor, savedData: Repr | null, nodeInOffsets: NodeVisuals<NumInputs, 0>) {
        super(editor, FlipflopOrLatch.savedStateFrom(savedData), savedData, {
            ins: (nodeInOffsets as any).ins,
            outs: [
                [S.Components.Generic.OutputQDesc, +4, -2, "e"],
                [S.Components.Generic.OutputQBarDesc, +4, 2, "e"],
            ],
        } as any)
        if (isNotNull(savedData)) {
            this._showContent = savedData.showContent ?? FlipflorOrLatchDefaults.showContent
        }
    }

    protected override toJSONBase() {
        return {
            ...super.toJSONBase(),
            state: toLogicValueRepr(this.value[0]),
            showContent: (this._showContent !== FlipflorOrLatchDefaults.showContent) ? this._showContent : undefined,
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

    protected override propagateValue(newValue: [LogicValue, LogicValue]) {
        this.outputs[OUTPUT.Q].value = newValue[OUTPUT.Q]
        this.outputs[OUTPUT.Qb].value = newValue[OUTPUT.Qb]
    }

    protected doSetShowContent(showContent: boolean) {
        this._showContent = showContent
        this.setNeedsRedraw("show content changed")
    }

    protected doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {

        const width = this.unrotatedWidth
        const height = this.unrotatedHeight
        const left = this.posX - width / 2
        const right = this.posX + width / 2

        g.fillStyle = this._isInInvalidState ? COLOR_BACKGROUND_INVALID : COLOR_BACKGROUND
        g.strokeStyle = ctx.isMouseOver ? COLOR_MOUSE_OVER : COLOR_COMPONENT_BORDER
        g.lineWidth = 3

        g.beginPath()
        g.rect(left, this.posY - height / 2, width, height)
        g.fill()
        g.stroke()
        g.fillStyle = COLOR_BACKGROUND

        drawWireLineToComponent(g, this.outputs[OUTPUT.Q], right + 2, this.outputs[OUTPUT.Q].posYInParentTransform, false)
        drawWireLineToComponent(g, this.outputs[OUTPUT.Qb], right + 2, this.outputs[OUTPUT.Qb].posYInParentTransform, false)

        this.doDrawLatchOrFlipflop(g, ctx, width, height, left, right)

        ctx.inNonTransformedFrame(ctx => {
            if (this._showContent && !this.editor.options.hideMemoryContent) {
                FlipflopOrLatch.drawStoredValue(g, this.value[OUTPUT.Q], this.posX, this.posY, 26)
            }

            g.fillStyle = COLOR_COMPONENT_INNER_LABELS
            g.font = "12px sans-serif"

            drawLabel(ctx, this.orient, "Q", "e", right, this.outputs[OUTPUT.Q])
            drawLabel(ctx, this.orient, "Q̅", "e", right, this.outputs[OUTPUT.Qb])

            // TODO bar placement is not great
            // const [qbarCenterX, qbarCenterY] = ctx.rotatePoint(right - 7, this.outputs[OUTPUT.Qb].posYInParentTransform)
            // const barY = qbarCenterY - 8
            // g.strokeStyle = g.fillStyle
            // strokeSingleLine(g, qbarCenterX - 4, barY, qbarCenterX + 3, barY)
        })

    }

    protected abstract doDrawLatchOrFlipflop(g: CanvasRenderingContext2D, ctx: DrawContext, width: number, height: number, left: number, right: number): void


    public static drawStoredValueFrame(g: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
        g.strokeStyle = COLOR_COMPONENT_BORDER
        g.lineWidth = 2
        g.beginPath()
        g.rect(x - width / 2, y - height / 2, width, height)
        g.fill()
        g.stroke()
    }

    public static drawStoredValue(g: CanvasRenderingContext2D, value: LogicValue, x: number, y: number, cellHeight: number) {
        g.fillStyle = colorForBoolean(value)
        FlipflopOrLatch.drawStoredValueFrame(g, x, y, 20, cellHeight)
        drawRoundValue(g, value, x, y)
    }

}


// Flip-flop base class

export const EdgeTrigger = {
    rising: "rising",
    falling: "falling",
} as const
export type EdgeTrigger = keyof typeof EdgeTrigger

export function defineFlipflop<NumInputs extends FixedArraySize, N extends string, P extends t.Props>(numExtraInputs: NumInputs, jsonName: N, className: string, props: P) {
    return defineFlipflopOrLatch(3 + numExtraInputs as Plus3<NumInputs>, jsonName, className, {
        trigger: typeOrUndefined(t.keyof(EdgeTrigger)),
        ...props,
    })
}

export type FlipflopRepr<NumInputs extends FixedArraySize> =
    FlipflopOrLatchRepr<NumInputs> & {
        trigger: keyof typeof EdgeTrigger | undefined
    }

const FlipflopDefaults = {
    trigger: EdgeTrigger.rising,
}

const enum INPUT {
    Clock,
    Preset,
    Clear,
}

interface SyncComponent<State> {
    trigger: EdgeTrigger
    value: State
    makeInvalidState(): State
    makeStateFromMainValue(val: LogicValue): State
    makeStateAfterClock(): State
}

export function makeTriggerItems(currentTrigger: EdgeTrigger, handler: (trigger: EdgeTrigger) => void): [ContextMenuItemPlacement, ContextMenuItem][] {
    const s = S.Components.Generic.contextMenu

    const makeTriggerItem = (trigger: EdgeTrigger, desc: string) => {
        const isCurrent = currentTrigger === trigger
        const icon = isCurrent ? "check" : "none"
        const caption = s.TriggerOn + " " + desc
        const action = isCurrent ? () => undefined :
            () => handler(trigger)
        return ContextMenuData.item(icon, caption, action)
    }

    return [
        ["mid", makeTriggerItem(EdgeTrigger.rising, s.TriggerRisingEdge)],
        ["mid", makeTriggerItem(EdgeTrigger.falling, s.TriggerFallingEdge)],
    ]
}

export abstract class Flipflop<
    NumInputs extends FixedArraySizeNonZero,
    Repr extends FlipflopRepr<Plus3<NumInputs>>,
> extends FlipflopOrLatch<Plus3<NumInputs>, Repr> implements SyncComponent<[LogicValue, LogicValue]> {

    protected _lastClock: LogicValue = Unknown
    protected _trigger: EdgeTrigger = FlipflopDefaults.trigger

    protected constructor(editor: LogicEditor, savedData: Repr | null, nodeInOffsets: NodeVisuals<NumInputs, 0> & { clockYOffset: number }) {
        super(editor, savedData, {
            ins: [
                [S.Components.Generic.InputClockDesc, -4, nodeInOffsets.clockYOffset, "w"], // Clock
                [S.Components.Generic.InputPresetDesc, 0, -4, "n"], // Preset
                [S.Components.Generic.InputClearDesc, 0, +4, "s"], // Clear
                ...nodeInOffsets.ins, // subclass
            ],
        } as any)
        if (isNotNull(savedData)) {
            this._trigger = savedData.trigger ?? FlipflopDefaults.trigger
        }
        this.setInputsPreferSpike(INPUT.Clock, INPUT.Preset, INPUT.Clear)
    }

    protected override toJSONBase() {
        return {
            ...super.toJSONBase(),
            trigger: (this._trigger !== FlipflopDefaults.trigger) ? this._trigger : undefined,
        }
    }

    public get trigger() {
        return this._trigger
    }

    public static doRecalcValueForSyncComponent<State>(comp: SyncComponent<State>, prevClock: LogicValue, clock: LogicValue, preset: LogicValue, clear: LogicValue): { isInInvalidState: boolean, newState: State } {
        // handle set and reset signals
        if (preset === true) {
            if (clear === true) {
                return { isInInvalidState: true, newState: comp.makeInvalidState() }
            } else {
                // preset is true, clear is false, set output to 1
                return { isInInvalidState: false, newState: comp.makeStateFromMainValue(true) }
            }
        }
        if (clear === true) {
            // clear is true, preset is false, set output to 0
            return { isInInvalidState: false, newState: comp.makeStateFromMainValue(false) }
        }

        // handle normal operation
        if (!Flipflop.isClockTrigger(comp.trigger, prevClock, clock)) {
            return { isInInvalidState: false, newState: comp.value }
        } else {
            return { isInInvalidState: false, newState: comp.makeStateAfterClock() }
        }
    }

    public static isClockTrigger(trigger: EdgeTrigger, prevClock: LogicValue, clock: LogicValue): boolean {
        return (trigger === EdgeTrigger.rising && prevClock === false && clock === true)
            || (trigger === EdgeTrigger.falling && prevClock === true && clock === false)
    }

    protected doRecalcValue(): [LogicValue, LogicValue] {
        const prevClock = this._lastClock
        const clock = this._lastClock = this.inputs[INPUT.Clock].value
        const { isInInvalidState, newState } =
            Flipflop.doRecalcValueForSyncComponent(this, prevClock, clock,
                this.inputs[INPUT.Preset].value,
                this.inputs[INPUT.Clear].value)
        this._isInInvalidState = isInInvalidState
        return newState
    }

    public makeInvalidState(): [LogicValue, LogicValue] {
        return [false, false]
    }

    public makeStateFromMainValue(val: LogicValue): [LogicValue, LogicValue] {
        return [val, LogicValue.invert(val)]
    }

    public makeStateAfterClock(): [LogicValue, LogicValue] {
        return this.makeStateFromMainValue(this.doRecalcValueAfterClock())
    }

    protected abstract doRecalcValueAfterClock(): LogicValue

    protected doSetTrigger(trigger: EdgeTrigger) {
        this._trigger = trigger
        this.setNeedsRedraw("trigger changed")
    }

    public static drawClockInput(g: CanvasRenderingContext2D, left: number, clockNode: NodeIn, trigger: EdgeTrigger) {
        const clockY = clockNode.posYInParentTransform
        const clockLineOffset = 1
        g.strokeStyle = COLOR_COMPONENT_BORDER
        g.lineWidth = 2

        // if (trigger === EdgeTrigger.falling) {
        //     clockLineOffset += 7
        //     g.beginPath()
        //     circle(g, left - 5, clockY, 6)
        //     g.fillStyle = COLOR_BACKGROUND
        //     g.fill()
        //     g.stroke()
        // }
        g.beginPath()
        g.moveTo(left + 1, clockY - 4)
        g.lineTo(left + 9, clockY)
        g.lineTo(left + 1, clockY + 4)
        g.stroke()
        if (trigger === EdgeTrigger.falling) {
            g.fillStyle = COLOR_COMPONENT_BORDER
            g.closePath()
            g.fill()
        }

        drawWireLineToComponent(g, clockNode, left - clockLineOffset, clockY, false)
    }

    protected override doDrawLatchOrFlipflop(g: CanvasRenderingContext2D, ctx: DrawContext, width: number, height: number, left: number, __right: number) {

        const top = this.posY - height / 2
        const bottom = this.posY + height / 2

        Flipflop.drawClockInput(g, left, this.inputs[INPUT.Clock], this._trigger)

        drawWireLineToComponent(g, this.inputs[INPUT.Preset], this.inputs[INPUT.Preset].posXInParentTransform, top - 2, false)
        drawWireLineToComponent(g, this.inputs[INPUT.Clear], this.inputs[INPUT.Clear].posXInParentTransform, bottom + 2, false)

        ctx.inNonTransformedFrame(ctx => {
            g.fillStyle = COLOR_COMPONENT_INNER_LABELS
            g.font = "11px sans-serif"

            drawLabel(ctx, this.orient, "Pre", "n", this.inputs[INPUT.Preset], top)
            drawLabel(ctx, this.orient, "Clr", "s", this.inputs[INPUT.Clear], bottom)
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
