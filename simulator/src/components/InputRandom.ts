import * as t from "io-ts"
import { COLOR_COMPONENT_INNER_LABELS, displayValuesFromArray, drawLabel, useCompact } from "../drawutils"
import { tooltipContent } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { ArrayFillUsing, ArrayFillWith, EdgeTrigger, isDefined, LogicValue, typeOrUndefined, Unknown } from "../utils"
import { ComponentName, ComponentNameRepr, defineParametrizedComponent, groupVertical, param, ParametrizedComponentBase, Repr, ResolvedParams } from "./Component"
import { ContextMenuData, DrawContext, MenuItems, Orientation } from "./Drawable"
import { Flipflop, FlipflopOrLatch } from "./FlipflopOrLatch"
import { RegisterBase } from "./Register"


export const InputRandomDef =
    defineParametrizedComponent("in", "random", true, true, {
        variantName: ({ bits }) => `random-${bits}`,
        button: { imgWidth: 32 },
        repr: {
            bits: typeOrUndefined(t.number),
            prob1: typeOrUndefined(t.number),
            showProb: typeOrUndefined(t.boolean),
            trigger: typeOrUndefined(t.keyof(EdgeTrigger)),
            name: ComponentNameRepr,
        },
        valueDefaults: {
            prob1: 0.5,
            showProb: false,
            trigger: EdgeTrigger.rising,
        },
        params: {
            bits: param(1, [1, 2, 3, 4, 7, 8, 16]),
        },
        validateParams: ({ bits }) => ({
            numBits: bits,
        }),
        size: ({ numBits }) => ({
            gridWidth: 4,
            gridHeight: 4 + (useCompact(numBits) ? numBits / 2 : numBits) * 2,
        }),
        makeNodes: ({ numBits, gridHeight }) => {
            const s = S.Components.Generic
            const clockY = gridHeight / 2 - 1
            return {
                ins: {
                    Clock: [-3, clockY, "w", s.InputClockDesc, { isClock: true }],
                },
                outs: {
                    Out: groupVertical("e", 3, 0, numBits),
                },
            }
        },
        initialValue: (saved, { numBits }) => ArrayFillWith<LogicValue>(false, numBits),
    })

export type InputRandomRepr = Repr<typeof InputRandomDef>
export type InputRandomParams = ResolvedParams<typeof InputRandomDef>


export class InputRandom extends ParametrizedComponentBase<InputRandomRepr> {

    public readonly numBits: number
    private _prob1: number
    private _showProb: boolean
    private _lastClock: LogicValue = Unknown
    private _trigger: EdgeTrigger
    private _name: ComponentName

    public constructor(editor: LogicEditor, params: InputRandomParams, saved?: InputRandomRepr) {
        super(editor, InputRandomDef.with(params), saved)

        this.numBits = params.numBits

        this._prob1 = isDefined(saved?.prob1)
            ? Math.max(0, Math.min(1, saved!.prob1)) : InputRandomDef.aults.prob1
        this._showProb = saved?.showProb ?? InputRandomDef.aults.showProb
        this._trigger = saved?.trigger ?? InputRandomDef.aults.trigger
        this._name = saved?.name ?? undefined
    }

    public override toJSON() {
        return {
            type: "random" as const,
            bits: this.numBits === InputRandomDef.aults.bits ? undefined : this.numBits,
            ...super.toJSONBase(),
            name: this._name,
            prob1: (this._prob1 !== InputRandomDef.aults.prob1) ? this._prob1 : undefined,
            showProb: (this._showProb !== InputRandomDef.aults.showProb) ? this._showProb : undefined,
            trigger: (this._trigger !== InputRandomDef.aults.trigger) ? this._trigger : undefined,
        }
    }

    public override get allowsForcedOutputs() {
        return false
    }

    public override makeTooltip() {
        const s = S.Components.InputRandom.tooltip
        return tooltipContent(s.title,
            s.desc[0] + this._prob1 + s.desc[1]
        )
    }

    protected doRecalcValue(): LogicValue[] {
        const prevClock = this._lastClock
        const clock = this._lastClock = this.inputs.Clock.value
        if (!Flipflop.isClockTrigger(this._trigger, prevClock, clock)) {
            // no change
            return this.value
        }
        const randBool = () => {
            return Math.random() < this._prob1
        }
        return ArrayFillUsing(randBool, this.numBits)
    }

    protected override propagateValue(newValue: LogicValue[]) {
        this.outputValues(this.outputs.Out, newValue)
    }

    protected override doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {
        const outputValues = this.value
        const [__, value] = displayValuesFromArray(outputValues, false)

        this.doDrawDefault(g, ctx, {
            name: [this._name, value, false],
            skipLabels: true,
            drawLabels: (ctx, { top }) => {
                if (this.numBits === 1) {
                    const output = this.outputs.Out[0]
                    FlipflopOrLatch.drawStoredValue(g, output.value, ...ctx.rotatePoint(this.posX, output.posYInParentTransform), 26, false)
                } else {
                    RegisterBase.drawStoredValues(g, ctx, this.outputs.Out, this.posX, Orientation.isVertical(this.orient))
                }

                if (this._showProb) {
                    const isVertical = Orientation.isVertical(this.orient)

                    g.fillStyle = COLOR_COMPONENT_INNER_LABELS
                    g.font = "9px sans-serif"
                    g.textAlign = "center"
                    g.textBaseline = "middle"
                    const probTextLastPart = String(Math.round(this._prob1 * 100) / 100).substring(1)
                    const probTextParts = ["P(1)", "=", probTextLastPart]
                    if (isVertical) {
                        let currentOffset = -10
                        let offset = Math.abs(currentOffset)
                        if (this.orient === "s") {
                            currentOffset = -currentOffset
                            offset = -offset
                        }
                        for (const part of probTextParts) {
                            drawLabel(ctx, this.orient, part, "n", this.posX - currentOffset, top - 1, undefined)
                            currentOffset += offset
                        }
                    } else {
                        const probText = probTextParts.join(" ")
                        drawLabel(ctx, this.orient, probText, "n", this.posX, top, undefined)
                    }
                }
            },
        })
    }

    private doSetName(name: ComponentName) {
        this._name = name
        this.setNeedsRedraw("name changed")
    }

    private doSetShowProb(showProb: boolean) {
        this._showProb = showProb
        this.setNeedsRedraw("show probability changed")
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        const s = S.Components.InputRandom.contextMenu
        const icon = this._showProb ? "check" : "none"
        const toggleShowProbItem = ContextMenuData.item(icon, s.ShowProb,
            () => this.doSetShowProb(!this._showProb))

        return [
            ["mid", toggleShowProbItem],
            ["mid", ContextMenuData.sep()],
            this.makeChangeParamsContextMenuItem("inputs", S.Components.Generic.contextMenu.ParamNumBits, this.numBits, "bits"),
            ["mid", ContextMenuData.sep()],
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
InputRandomDef.impl = InputRandom
