import * as t from "io-ts"
import { COLOR_BACKGROUND, COLOR_COMPONENT_BORDER, COLOR_MOUSE_OVER, displayValuesFromArray, drawWireLineToComponent, strokeAsWireLine, useCompact } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { IconName } from "../images"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { ArrayFillWith, HighImpedance, isUnknown, LogicValue, typeOrUndefined, Unknown } from "../utils"
import { defineParametrizedComponent, groupHorizontal, groupVertical, groupVerticalMulti, param, ParametrizedComponentBase, Repr, ResolvedParams } from "./Component"
import { ContextMenuData, DrawContext, MenuItems } from "./Drawable"
import { WireStyles } from "./Wire"


export const DemuxDef =
    defineParametrizedComponent("ic", "demux", true, true, {
        variantName: ({ from, to }) => `demux-${from}to${to}`,
        button: { imgWidth: 50 },
        repr: {
            from: typeOrUndefined(t.number),
            to: typeOrUndefined(t.number),
            showWiring: typeOrUndefined(t.boolean),
            disconnectedAsHighZ: typeOrUndefined(t.boolean),
        },
        valueDefaults: {
            showWiring: true,
            disconnectedAsHighZ: false,
        },
        params: {
            from: param(4, [1, 2, 4, 8, 16]),
            to: param(8),
        },
        validateParams: ({ from, to }) => {
            // reference is 'from'; 'to' is clamped to be between 2*from and 16*from
            const numTo = Math.min(16 * from, Math.max(2 * from, to))
            const numGroups = Math.ceil(numTo / from)
            const numSel = Math.ceil(Math.log2(numGroups))
            return { numFrom: from, numTo, numGroups, numSel }
        },
        size: ({ numFrom, numTo, numGroups, numSel }) => {
            const gridWidth = 2 * numSel
            const spacing = useCompact(numFrom) ? 1 : 2
            const addByGroupSep = numFrom > 1 ? 1 : 0
            const numLeftSlots = numTo + (numGroups - 1) * addByGroupSep
            const gridHeight = spacing * numLeftSlots
            return { gridWidth, gridHeight }
        },
        makeNodes: ({ numFrom, numGroups, numSel }) => {
            const outX = 1 + numSel
            const inX = -outX

            const groupOfOutputs = groupVerticalMulti("e", outX, 0, numGroups, numFrom)
            const firstInputY = groupOfOutputs[0][0][1]
            const selY = firstInputY - 2

            return {
                ins: {
                    I: groupVertical("w", inX, 0, numFrom),
                    S: groupHorizontal("n", 0, selY, numSel),
                },
                outs: {
                    Z: groupOfOutputs,
                },
            }
        },
        initialValue: (saved, { numTo }) => ArrayFillWith<LogicValue>(false, numTo),
    })


export type DemuxRepr = Repr<typeof DemuxDef>
export type DemuxParams = ResolvedParams<typeof DemuxDef>

export class Demux extends ParametrizedComponentBase<DemuxRepr> {

    public readonly numFrom: number
    public readonly numSel: number
    public readonly numGroups: number
    public readonly numTo: number
    private _showWiring: boolean
    private _disconnectedAsHighZ: boolean

    public constructor(editor: LogicEditor, params: DemuxParams, saved?: DemuxRepr) {
        super(editor, DemuxDef.with(params), saved)

        this.numFrom = params.numFrom
        this.numTo = params.numTo
        this.numGroups = params.numGroups
        this.numSel = params.numSel

        this._showWiring = saved?.showWiring ?? DemuxDef.aults.showWiring
        this._disconnectedAsHighZ = saved?.disconnectedAsHighZ ?? DemuxDef.aults.disconnectedAsHighZ
    }

    public override toJSON() {
        return {
            type: "demux" as const, from: this.numFrom, to: this.numTo,
            ...super.toJSONBase(),
            showWiring: (this._showWiring !== DemuxDef.aults.showWiring) ? this._showWiring : undefined,
            disconnectedAsHighZ: (this._disconnectedAsHighZ !== DemuxDef.aults.disconnectedAsHighZ) ? this._disconnectedAsHighZ : undefined,
        }
    }

    public override makeTooltip() {
        return tooltipContent(undefined, mods(
            div(S.Components.Demux.tooltip.expand({ from: this.numFrom, to: this.numTo })) // TODO better tooltip
        ))
    }

    protected doRecalcValue(): LogicValue[] {
        const sels = this.inputValues(this.inputs.S)
        const sel = displayValuesFromArray(sels, false)[1]

        if (isUnknown(sel)) {
            return ArrayFillWith(Unknown, this.numTo)
        }

        const values: Array<LogicValue> = []
        const disconnected = this._disconnectedAsHighZ ? HighImpedance : false
        for (let g = 0; g < this.numGroups; g++) {
            if (g === sel) {
                const inputs = this.inputValues(this.inputs.I)
                for (const input of inputs) {
                    values.push(input)
                }
            } else {
                for (let i = 0; i < this.numFrom; i++) {
                    values.push(disconnected)
                }
            }
        }

        return values
    }

    protected override propagateValue(newValues: LogicValue[]) {
        this.outputValues(this.outputs._all, newValues)
    }

    protected override doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {
        const { top, left, bottom, right } = this.bounds()
        const dy = (right - left) / 3

        // inputs
        for (const input of this.inputs.I) {
            drawWireLineToComponent(g, input, left, input.posYInParentTransform)
        }

        // selectors
        for (const sel of this.inputs.S) {
            drawWireLineToComponent(g, sel, sel.posXInParentTransform, top + dy)
        }


        // outputs
        for (const outputGroup of this.outputs.Z) {
            for (const output of outputGroup) {
                drawWireLineToComponent(g, output, right, output.posYInParentTransform)
            }
        }

        // background
        const outline = new Path2D()
        outline.moveTo(left, top + dy)
        outline.lineTo(right, top)
        outline.lineTo(right, bottom)
        outline.lineTo(left, bottom - dy)
        outline.closePath()
        g.fillStyle = COLOR_BACKGROUND
        g.fill(outline)

        // wiring
        if (this._showWiring) {
            const neutral = this.editor.options.hideWireColors
            const sels = this.inputValues(this.inputs.S)
            const sel = displayValuesFromArray(sels, false)[1]
            if (!isUnknown(sel)) {
                const selectedOutputs = this.outputs.Z[sel]
                const anchorDiffX = (right - left) / 3
                const wireStyleStraight = this.editor.options.wireStyle === WireStyles.straight

                for (let i = 0; i < this.inputs.I.length; i++) {
                    g.beginPath()
                    const fromNode = this.inputs.I[i]
                    const fromY = fromNode.posYInParentTransform
                    const toY = selectedOutputs[i].posYInParentTransform
                    g.moveTo(left + 1, fromY)
                    if (wireStyleStraight) {
                        g.lineTo(left + 3, fromY)
                        g.lineTo(right - 3, toY)
                        g.lineTo(right - 1, toY)
                    } else {
                        g.bezierCurveTo(
                            left + anchorDiffX, fromY, // anchor left
                            right - anchorDiffX, toY, // anchor right
                            right - 1, toY,
                        )
                    }
                    strokeAsWireLine(g, this.inputs.I[i].value, fromNode.color, false, neutral)
                }
            }
        }

        // outline
        g.lineWidth = 3
        g.strokeStyle = ctx.isMouseOver ? COLOR_MOUSE_OVER : COLOR_COMPONENT_BORDER
        g.stroke(outline)

    }

    private doSetShowWiring(showWiring: boolean) {
        this._showWiring = showWiring
        this.setNeedsRedraw("show wiring changed")
    }

    private doSetDisconnectedAsHighZ(disconnectedAsHighZ: boolean) {
        this._disconnectedAsHighZ = disconnectedAsHighZ
        this.setNeedsRecalc()
    }


    protected override makeComponentSpecificContextMenuItems(): MenuItems {

        const s = S.Components.MuxDemux.contextMenu
        let icon: IconName = this._showWiring ? "check" : "none"
        const toggleShowWiringItem = ContextMenuData.item(icon, s.ShowWiring, () => {
            this.doSetShowWiring(!this._showWiring)
        })

        icon = this._disconnectedAsHighZ ? "check" : "none"
        const toggleUseHighZItem = ContextMenuData.item(icon, s.UseZForDisconnected, () => {
            this.doSetDisconnectedAsHighZ(!this._disconnectedAsHighZ)
        })

        return [
            this.makeChangeParamsContextMenuItem("inputs", s.ParamNumFrom, this.numFrom, "from"),
            this.makeChangeParamsContextMenuItem("outputs", s.ParamNumTo, this.numTo, "to", [2, 4, 8, 16].map(x => x * this.numFrom)),
            ["mid", ContextMenuData.sep()],
            ["mid", toggleShowWiringItem],
            ["mid", toggleUseHighZItem],
            ...this.makeForceOutputsContextMenuItem(true),
        ]
    }

}
DemuxDef.impl = Demux
