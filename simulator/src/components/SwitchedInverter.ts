import * as t from "io-ts"
import { circle, colorForBoolean, COLOR_COMPONENT_BORDER, COLOR_UNKNOWN } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { ArrayFillWith, isHighImpedance, isUnknown, LogicValue, typeOrUndefined, Unknown } from "../utils"
import { defineParametrizedComponent, groupVertical, param, ParametrizedComponentBase, Repr, ResolvedParams } from "./Component"
import { DrawContext, MenuItems } from "./Drawable"


export const SwitchedInverterDef =
    defineParametrizedComponent("ic", "switched-inverter", true, true, {
        variantName: ({ bits }) => `switched-inverter-${bits}`,
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

        size: ({ numBits }) => ({
            gridWidth: 4,
            gridHeight: 8 + Math.max(0, numBits - 8),
        }),
        makeNodes: ({ numBits, gridHeight }) => ({
            ins: {
                I: groupVertical("w", -3, 0, numBits),
                S: [0, -(gridHeight / 2 + 1), "n"],
            },
            outs: {
                O: groupVertical("e", +3, 0, numBits),
            },
        }),
        initialValue: (saved, { numBits }) => ArrayFillWith<LogicValue>(false, numBits),
    })


export type SwitchedInverterRepr = Repr<typeof SwitchedInverterDef>
export type SwitchedInverterParams = ResolvedParams<typeof SwitchedInverterDef>


export class SwitchedInverter extends ParametrizedComponentBase<SwitchedInverterRepr> {

    public readonly numBits: number

    public constructor(editor: LogicEditor, params: SwitchedInverterParams, saved?: SwitchedInverterRepr) {
        super(editor, SwitchedInverterDef.with(params), saved)
        this.numBits = params.numBits
    }

    public toJSON() {
        return {
            type: "switched-inverter" as const,
            bits: this.numBits === SwitchedInverterDef.aults.bits ? undefined : this.numBits,
            ...this.toJSONBase(),
        }
    }

    public override makeTooltip() {
        const s = S.Components.SwitchedInverter.tooltip
        return tooltipContent(s.title, mods(
            div(s.desc)
        ))
    }

    protected doRecalcValue(): LogicValue[] {
        const input = this.inputValues(this.inputs.I)
        const switch_ = this.inputs.S.value

        if (isUnknown(switch_) || isHighImpedance(switch_)) {
            return ArrayFillWith(Unknown, this.numBits)
        }

        if (!switch_) {
            return input
        }

        return input.map(LogicValue.invert)
    }

    protected override propagateValue(newValue: LogicValue[]) {
        this.outputValues(this.outputs.O, newValue)
    }

    protected override doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {
        this.doDrawDefault(g, ctx, {
            skipLabels: true,
            drawInside: ({ top, left, right }) => {
                const invert = this.inputs.S.value

                g.lineWidth = 2
                g.strokeStyle = colorForBoolean(invert)
                g.beginPath()
                g.moveTo(this.posX, top)
                g.lineTo(this.posX, this.posY - 4)
                g.stroke()

                g.strokeStyle = invert === true ? COLOR_COMPONENT_BORDER : COLOR_UNKNOWN
                g.beginPath()
                g.moveTo(left + 12, this.posY - 8)
                g.lineTo(right - 13, this.posY)
                g.lineTo(left + 12, this.posY + 8)
                g.closePath()
                g.stroke()
                g.beginPath()
                circle(g, right - 10, this.posY, 5)
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
SwitchedInverterDef.impl = SwitchedInverter
