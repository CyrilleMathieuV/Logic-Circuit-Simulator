import * as t from "io-ts"
import { COLOR_COMPONENT_BORDER, GRID_STEP, useCompact } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { allBooleans, ArrayFillWith, binaryStringRepr, EdgeTrigger, hexStringRepr, isAllZeros, isUndefined, LogicValue, typeOrUndefined, Unknown, wordFromBinaryOrHexRepr } from "../utils"
import { defineAbstractParametrizedComponent, defineParametrizedComponent, ExtractParamDefs, ExtractParams, groupVertical, NodesIn, NodesOut, param, ParametrizedComponentBase, ReadonlyGroupedNodeArray, Repr, ResolvedParams } from "./Component"
import { ContextMenuData, DrawContext, DrawContextExt, MenuItems, Orientation } from "./Drawable"
import { Flipflop, FlipflopOrLatch, makeTriggerItems } from "./FlipflopOrLatch"
import { NodeOut } from "./Node"
import { type ShiftRegisterDef } from "./ShiftRegister"


export const RegisterBaseDef =
    defineAbstractParametrizedComponent({
        button: { imgWidth: 50 },
        repr: {
            bits: typeOrUndefined(t.number),
            showContent: typeOrUndefined(t.boolean),
            trigger: typeOrUndefined(t.keyof(EdgeTrigger)),
            content: typeOrUndefined(t.string),
        },
        valueDefaults: {
            showContent: true,
            trigger: EdgeTrigger.rising,
        },
        params: {
            bits: param(4, [4, 8, 16]),
        },
        validateParams: ({ bits }) => ({
            numBits: bits,
        }),
        size: ({ numBits }) => ({
            gridWidth: 7,
            gridHeight: Math.max(16, 5 + numBits),
        }),
        makeNodes: ({ numBits, gridHeight }) => {
            const bottomOffset = Math.ceil((gridHeight + 1) / 2)
            const clockYOffset = bottomOffset - 2
            const topOffset = -bottomOffset
            const s = S.Components.Generic

            return {
                ins: {
                    Clock: [-5, clockYOffset, "w", s.InputClockDesc, { isClock: true }],
                    Pre: [0, topOffset, "n", s.InputPresetDesc, { prefersSpike: true }],
                    Clr: [0, bottomOffset, "s", s.InputClearDesc, { prefersSpike: true }],
                },
                outs: {
                    Q: groupVertical("e", 5, 0, numBits),
                },
            }
        },
        initialValue: (saved, { numBits }) => {
            let content
            if (isUndefined(saved) || isUndefined(content = saved.content)) {
                return ArrayFillWith(false, numBits)
            }
            return wordFromBinaryOrHexRepr(content, numBits)
        },
    })

export type RegisterBaseRepr = Repr<typeof RegisterBaseDef>
export type RegisterBaseParams = ResolvedParams<typeof RegisterBaseDef>

export abstract class RegisterBase<
    TRepr extends RegisterBaseRepr,
    TParamDefs extends ExtractParamDefs<TRepr> = ExtractParamDefs<TRepr>,
> extends ParametrizedComponentBase<
    TRepr,
    LogicValue[],
    TParamDefs,
    ExtractParams<TRepr>,
    NodesIn<TRepr>,
    NodesOut<TRepr>,
    true, true
> {

    public readonly numBits: number
    protected _showContent: boolean
    protected _trigger: EdgeTrigger
    protected _isInInvalidState = false
    protected _lastClock: LogicValue = Unknown

    protected constructor(editor: LogicEditor, SubclassDef: typeof RegisterDef | typeof ShiftRegisterDef, params: RegisterBaseParams, saved?: TRepr) {
        super(editor, SubclassDef.with(params) as any /* TODO */, saved)

        this.numBits = params.numBits

        this._showContent = saved?.showContent ?? RegisterDef.aults.showContent
        this._trigger = saved?.trigger ?? RegisterDef.aults.trigger
    }

    protected override toJSONBase() {
        return {
            bits: this.numBits === RegisterDef.aults.bits ? undefined : this.numBits,
            ...super.toJSONBase(),
            showContent: (this._showContent !== RegisterDef.aults.showContent) ? this._showContent : undefined,
            trigger: (this._trigger !== RegisterDef.aults.trigger) ? this._trigger : undefined,
            content: this.contentRepr(),
        }
    }

    private contentRepr(): string | undefined {
        const content = this.value
        const hexWidth = Math.ceil(this.numBits / 4)
        const repr = allBooleans(content) ? hexStringRepr(content, hexWidth) : binaryStringRepr(content)
        return isAllZeros(repr) ? undefined : repr
    }

    public get trigger() {
        return this._trigger
    }

    protected doRecalcValue(): LogicValue[] {
        const prevClock = this._lastClock
        const clock = this._lastClock = this.inputs.Clock.value
        const { isInInvalidState, newState } =
            Flipflop.doRecalcValueForSyncComponent(this, prevClock, clock,
                this.inputs.Pre.value,
                this.inputs.Clr.value)
        this._isInInvalidState = isInInvalidState
        return newState
    }

    public makeInvalidState(): LogicValue[] {
        return ArrayFillWith(false, this.numBits)
    }

    public makeStateFromMainValue(val: LogicValue): LogicValue[] {
        return ArrayFillWith(val, this.numBits)
    }

    public abstract makeStateAfterClock(): LogicValue[]

    protected override propagateValue(newValue: LogicValue[]) {
        this.outputValues(this.outputs.Q, newValue)
    }

    protected doSetShowContent(showContent: boolean) {
        this._showContent = showContent
        this.setNeedsRedraw("show content changed")
    }

    protected doSetTrigger(trigger: EdgeTrigger) {
        this._trigger = trigger
        this.setNeedsRedraw("trigger changed")
    }

    protected override doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {
        this.doDrawDefault(g, ctx, (ctx) => {
            if (this._showContent && !this.editor.options.hideMemoryContent) {
                RegisterBase.drawStoredValues(g, ctx, this.outputs.Q, this.posX, Orientation.isVertical(this.orient))
            } else {
                this.doDrawGenericCaption(g)
            }
        })
    }

    public static drawStoredValues(g: CanvasRenderingContext2D, ctx: DrawContextExt, outputs: ReadonlyGroupedNodeArray<NodeOut>, posX: number, swapHeightWidth: boolean) {
        const cellHeight = useCompact(outputs.length) ? GRID_STEP : 2 * GRID_STEP
        for (const output of outputs) {
            FlipflopOrLatch.drawStoredValue(g, output.value, ...ctx.rotatePoint(posX, output.posYInParentTransform), cellHeight, swapHeightWidth)
        }
    }

    protected abstract doDrawGenericCaption(g: CanvasRenderingContext2D): void

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        const s = S.Components.Generic.contextMenu
        const icon = this._showContent ? "check" : "none"
        const toggleShowContentItem = ContextMenuData.item(icon, s.ShowContent,
            () => this.doSetShowContent(!this._showContent))

        return [
            this.makeChangeParamsContextMenuItem("outputs", s.ParamNumBits, this.numBits, "bits"),
            ["mid", ContextMenuData.sep()],
            ...makeTriggerItems(this._trigger, this.doSetTrigger.bind(this)),
            ["mid", ContextMenuData.sep()],
            ["mid", toggleShowContentItem],
            ...this.makeForceOutputsContextMenuItem(true),
        ]
    }

}

export const RegisterDef =
    defineParametrizedComponent("ic", "register", true, true, {
        variantName: ({ bits }) => `register-${bits}`,
        ...RegisterBaseDef,
        makeNodes: (params, defaults) => {
            const base = RegisterBaseDef.makeNodes(params, defaults)
            return {
                ins: {
                    ...base.ins,
                    D: groupVertical("w", -5, 0, params.numBits),
                },
                outs: base.outs,
            }
        },
    })

export type RegisterRepr = Repr<typeof RegisterDef>
export type RegisterParams = ResolvedParams<typeof RegisterDef>

export class Register extends RegisterBase<RegisterRepr> {

    public constructor(editor: LogicEditor, params: RegisterParams, saved?: RegisterRepr) {
        super(editor, RegisterDef, params, saved)
    }

    public toJSON() {
        return {
            type: "register" as const,
            ...this.toJSONBase(),
        }
    }

    public override makeTooltip() {
        const s = S.Components.Register.tooltip

        return tooltipContent(s.title, mods(
            div(s.desc.expand({ numBits: this.numBits })) // TODO more info
        ))
    }

    public makeStateAfterClock(): LogicValue[] {
        return this.inputValues(this.inputs.D)
    }

    protected override doDrawGenericCaption(g: CanvasRenderingContext2D) {
        g.font = `bold 15px sans-serif`
        g.fillStyle = COLOR_COMPONENT_BORDER
        g.textAlign = "center"
        g.textBaseline = "middle"
        g.fillText("Reg.", this.posX, this.posY - 8)
        g.font = `11px sans-serif`
        g.fillText(`${this.numBits} bits`, this.posX, this.posY + 10)
    }

}
RegisterDef.impl = Register
