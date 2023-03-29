import * as t from "io-ts"
import { colorForBoolean, COLOR_COMPONENT_BORDER } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { ArrayFillWith, HighImpedance, isHighImpedance, isUnknown, LogicValue, typeOrUndefined, Unknown } from "../utils"
import { defineParametrizedComponent, groupVertical, param, ParametrizedComponentBase, Repr, ResolvedParams } from "./Component"
import { DrawContext, MenuItems } from "./Drawable"
import { SwitchedInverterDef } from "./SwitchedInverter"


export const TriStateBufferArrayDef =
    defineParametrizedComponent("ic", "tristate-array", true, true, {
        variantName: ({ bits }) => `tristate-array-${bits}`,
        button: { imgWidth: 50 },
        repr: {
            bits: typeOrUndefined(t.number),
        },
        valueDefaults: {},
        params: {
            bits: param(4, [2, 4, 8, 16]),
        },
        validateParams: ({ bits }) => ({
            numBits: bits,
        }),
        size: SwitchedInverterDef.size,
        makeNodes: ({ numBits, gridHeight }) => ({
            ins: {
                I: groupVertical("w", -3, 0, numBits),
                E: [0, -(gridHeight / 2 + 1), "n", "E (Enable)"],
            },
            outs: {
                O: groupVertical("e", 3, 0, numBits),
            },
        }),
        initialValue: (saved, { numBits }) => ArrayFillWith<LogicValue>(HighImpedance, numBits),
    })


export type TriStateBufferArrayRepr = Repr<typeof TriStateBufferArrayDef>
export type TriStateBufferArrayParams = ResolvedParams<typeof TriStateBufferArrayDef>

export class TriStateBufferArray extends ParametrizedComponentBase<TriStateBufferArrayRepr> {

    public readonly numBits: number

    public constructor(editor: LogicEditor, params: TriStateBufferArrayParams, saved?: TriStateBufferArrayRepr) {
        super(editor, TriStateBufferArrayDef.with(params), saved)
        this.numBits = params.numBits
    }

    public toJSON() {
        return {
            type: "tristate-array" as const,
            bits: this.numBits === TriStateBufferArrayDef.aults.bits ? undefined : this.numBits,
            ...this.toJSONBase(),
        }
    }

    public override makeTooltip() {
        const s = S.Components.TriStateBufferArray.tooltip
        return tooltipContent(s.title, mods(
            div(s.desc)
        ))
    }

    protected doRecalcValue(): LogicValue[] {
        const enable = this.inputs.E.value

        if (isUnknown(enable) || isHighImpedance(enable)) {
            return ArrayFillWith(Unknown, this.numBits)
        }

        if (!enable) {
            return ArrayFillWith(HighImpedance, this.numBits)
        }

        return this.inputValues(this.inputs.I)
    }

    protected override propagateValue(newValue: LogicValue[]) {
        this.outputValues(this.outputs.O, newValue)
    }

    protected override doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {
        this.doDrawDefault(g, ctx, {
            skipLabels: true,
            drawInside: ({ top, left, right }) => {
                const enable = this.inputs.E.value

                g.lineWidth = 2
                g.strokeStyle = colorForBoolean(enable)
                g.beginPath()
                g.moveTo(this.posX, top)
                g.lineTo(this.posX, this.posY - 4)
                g.stroke()

                g.strokeStyle = COLOR_COMPONENT_BORDER
                g.beginPath()
                g.moveTo(left + 12, this.posY - 8)
                g.lineTo(right - 13, this.posY)
                g.lineTo(left + 12, this.posY + 8)
                g.closePath()
                g.stroke()
            },
        })
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        return [
            this.makeChangeParamsContextMenuItem("inputs", S.Components.Generic.contextMenu.ParamNumBits, this.numBits, "bits"),
            ...this.makeForceOutputsContextMenuItem(true),
        ]
    }

}
TriStateBufferArrayDef.impl = TriStateBufferArray
