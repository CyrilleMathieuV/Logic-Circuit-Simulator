import * as t from "io-ts"
import { COLOR_BACKGROUND, COLOR_COMPONENT_BORDER, COLOR_COMPONENT_INNER_LABELS, COLOR_GROUP_SPAN, COLOR_MOUSE_OVER, drawLabel, drawWireLineToComponent, GRID_STEP } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { ArrayFillWith, HighImpedance, isBoolean, isHighImpedance, isUndefined, isUnknown, LogicValue, typeOrUndefined, Unknown } from "../utils"
import { defineParametrizedComponent, groupHorizontal, groupVertical, param, ParametrizedComponentBase, Repr, ResolvedParams, Value } from "./Component"
import { ContextMenuData, DrawContext, MenuItems, Orientation } from "./Drawable"


export const ALUDef =
    defineParametrizedComponent("ic", "alu", true, true, {
        variantName: ({ bits }) => `alu-${bits}`,
        button: { imgWidth: 50 },
        repr: {
            bits: typeOrUndefined(t.number),
            showOp: typeOrUndefined(t.boolean),
        },
        valueDefaults: {
            showOp: true,
        },
        params: {
            bits: param(4, [2, 4, 8, 16]),
        },
        validateParams: ({ bits }) => ({
            numBits: bits,
        }),
        size: ({ numBits }) => ({
            gridWidth: 6, // always enough
            gridHeight: 19 + Math.max(0, numBits - 8) * 2,
        }),
        makeNodes: ({ numBits, gridHeight }) => {
            const inputCenterY = 5 + Math.max(0, (numBits - 8) / 2)
            const bottom = (gridHeight + 1) / 2
            const top = -bottom
            return {
                ins: {
                    A: groupVertical("w", -4, -inputCenterY, numBits),
                    B: groupVertical("w", -4, inputCenterY, numBits),
                    Op: groupHorizontal("n", 1, top, 2),
                    Cin: [-2, top, "n", `Cin (${S.Components.ALU.InputCinDesc})`],
                },
                outs: {
                    S: groupVertical("e", 4, 0, numBits),
                    V: [0, bottom, "s", "V (oVerflow)"],
                    Z: [2, bottom, "s", "Z (Zero)"],
                    Cout: [-2, bottom, "s", `Cout (${S.Components.ALU.OutputCoutDesc})`],
                },
            }
        },
        initialValue: (saved, { numBits }) => {
            const false_ = false as LogicValue
            return { s: ArrayFillWith(false_, numBits), v: false_, z: false_, cout: false_ }
        },
    })

export type ALURepr = Repr<typeof ALUDef>
export type ALUParams = ResolvedParams<typeof ALUDef>

type ALUValue = Value<typeof ALUDef>

export type ALUOp = "add" | "sub" | "and" | "or"
export const ALUOp = {
    shortName(op: ALUOp): string {
        return S.Components.ALU[op][0]
    },
    fullName(op: ALUOp): string {
        return S.Components.ALU[op][1]
    },
}

export class ALU extends ParametrizedComponentBase<ALURepr> {

    public readonly numBits: number
    private _showOp: boolean

    public constructor(editor: LogicEditor, params: ALUParams, saved?: ALURepr) {
        super(editor, ALUDef.with(params), saved)

        this.numBits = params.numBits

        this._showOp = saved?.showOp ?? ALUDef.aults.showOp
    }

    public toJSON() {
        return {
            type: "alu" as const,
            bits: this.numBits === ALUDef.aults.bits ? undefined : this.numBits,
            ...this.toJSONBase(),
            showOp: (this._showOp !== ALUDef.aults.showOp) ? this._showOp : undefined,
        }
    }

    public override makeTooltip() {
        const op = this.op
        const s = S.Components.ALU.tooltip
        const opDesc = isUnknown(op) ? s.SomeUnknownOperation : s.ThisOperation + " " + ALUOp.fullName(op)
        return tooltipContent(s.title, mods(
            div(`${s.CurrentlyCarriesOut} ${opDesc}.`)
        ))
    }

    public get op(): ALUOp | Unknown {
        const op1 = this.inputs.Op[1].value
        const op0 = this.inputs.Op[0].value
        switch (op1) {
            case false: // arithmetic
                switch (op0) {
                    case false: // 00
                        return "add"
                    case true: // 01
                        return "sub"
                    case Unknown:
                    case HighImpedance:
                        return Unknown
                }
                break
            case true: // logic
                switch (op0) {
                    case false: // 10
                        return "or" // opcode logic: "only one 1 needed"
                    case true: // 11
                        return "and"// opcode logic: "two 1s needed"
                    case Unknown:
                    case HighImpedance:
                        return Unknown
                }
                break
            case Unknown:
            case HighImpedance:
                return Unknown
        }
    }

    protected doRecalcValue(): ALUValue {
        const op = this.op

        if (isUnknown(op)) {
            return { s: ArrayFillWith(Unknown, this.numBits), v: Unknown, z: Unknown, cout: Unknown }
        }

        const a = this.inputValues(this.inputs.A)
        const b = this.inputValues(this.inputs.B)
        const cin = this.inputs.Cin.value

        return doALUOp(op, a, b, cin)
    }

    protected override propagateValue(newValue: ALUValue) {
        this.outputValues(this.outputs.S, newValue.s)
        this.outputs.V.value = newValue.v
        this.outputs.Z.value = newValue.z
        this.outputs.Cout.value = newValue.cout
    }

    protected override doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {
        const bounds = this.bounds()
        const { left, top, right, bottom } = bounds

        // inputs
        for (const input of this.inputs.A) {
            drawWireLineToComponent(g, input, left, input.posYInParentTransform)
        }
        for (const input of this.inputs.B) {
            drawWireLineToComponent(g, input, left, input.posYInParentTransform)
        }
        drawWireLineToComponent(g, this.inputs.Op[1], this.inputs.Op[1].posXInParentTransform, top + 9)
        drawWireLineToComponent(g, this.inputs.Op[0], this.inputs.Op[0].posXInParentTransform, top + 17)
        drawWireLineToComponent(g, this.inputs.Cin, this.inputs.Cin.posXInParentTransform, top + 3)

        // outputs
        for (const output of this.outputs.S) {
            drawWireLineToComponent(g, output, right, output.posYInParentTransform)
        }
        drawWireLineToComponent(g, this.outputs.Z, this.outputs.Z.posXInParentTransform, bottom - 17)
        drawWireLineToComponent(g, this.outputs.V, this.outputs.V.posXInParentTransform, bottom - 9)
        drawWireLineToComponent(g, this.outputs.Cout, this.outputs.Cout.posXInParentTransform, bottom - 3)

        // outline
        g.fillStyle = COLOR_BACKGROUND
        g.lineWidth = 3
        g.strokeStyle = ctx.isMouseOver ? COLOR_MOUSE_OVER : COLOR_COMPONENT_BORDER

        g.beginPath()
        g.moveTo(left, top)
        g.lineTo(right, top + 2 * GRID_STEP)
        g.lineTo(right, bottom - 2 * GRID_STEP)
        g.lineTo(left, bottom)
        g.lineTo(left, this.posY + 1 * GRID_STEP)
        g.lineTo(left + 2 * GRID_STEP, this.posY)
        g.lineTo(left, this.posY - 1 * GRID_STEP)
        g.closePath()
        g.fill()
        g.stroke()

        // groups
        this.drawGroupBox(g, this.inputs.A.group, bounds)
        this.drawGroupBox(g, this.inputs.B.group, bounds)
        this.drawGroupBox(g, this.outputs.S.group, bounds)
        // special Op group
        g.beginPath()
        const opGroupLeft = this.inputs.Op[1].posXInParentTransform - 2
        const opGroupRight = this.inputs.Op[0].posXInParentTransform + 2
        g.moveTo(opGroupLeft, top + 9)
        g.lineTo(opGroupLeft, top + 17)
        g.lineTo(opGroupRight, top + 25)
        g.lineTo(opGroupRight, top + 19)
        g.closePath()
        g.fillStyle = COLOR_GROUP_SPAN
        g.fill()

        // labels
        ctx.inNonTransformedFrame(ctx => {
            g.fillStyle = COLOR_COMPONENT_INNER_LABELS
            g.font = "11px sans-serif"

            // bottom outputs
            const carryHOffsetF = Orientation.isVertical(this.orient) ? 0 : 1
            drawLabel(ctx, this.orient, "Z", "s", this.outputs.Z, bottom - 16)
            drawLabel(ctx, this.orient, "V", "s", this.outputs.V.posXInParentTransform + carryHOffsetF * 2, bottom - 10, this.outputs.V)
            drawLabel(ctx, this.orient, "Cout", "s", this.outputs.Cout.posXInParentTransform + carryHOffsetF * 4, bottom - 7, this.outputs.Cout)

            // top inputs
            drawLabel(ctx, this.orient, "Cin", "n", this.inputs.Cin.posXInParentTransform + carryHOffsetF * 2, top + 4, this.inputs.Cin)

            g.font = "bold 11px sans-serif"
            drawLabel(ctx, this.orient, "Op", "n", this.inputs.Op, top + 14)

            // left inputs
            g.font = "bold 12px sans-serif"
            drawLabel(ctx, this.orient, "A", "w", left, this.inputs.A)
            drawLabel(ctx, this.orient, "B", "w", left, this.inputs.B)

            // right outputs
            drawLabel(ctx, this.orient, "S", "e", right, this.outputs.S)

            if (this._showOp) {
                const opName = isUnknown(this.op) ? "??" : ALUOp.shortName(this.op)
                const size = opName.length === 1 ? 25 : 13
                g.font = `bold ${size}px sans-serif`
                g.fillStyle = COLOR_COMPONENT_BORDER
                g.textAlign = "center"
                g.textBaseline = "middle"
                g.fillText(opName, ...ctx.rotatePoint(this.posX + 4, this.posY))
            }
        })
    }

    private doSetShowOp(showOp: boolean) {
        this._showOp = showOp
        this.setNeedsRedraw("show op changed")
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        const icon = this._showOp ? "check" : "none"
        const toggleShowOpItem = ContextMenuData.item(icon, S.Components.ALU.contextMenu.toggleShowOp, () => {
            this.doSetShowOp(!this._showOp)
        })

        return [
            ["mid", toggleShowOpItem],
            ["mid", ContextMenuData.sep()],
            this.makeChangeParamsContextMenuItem("inputs", S.Components.Generic.contextMenu.ParamNumBits, this.numBits, "bits"),
            ["mid", ContextMenuData.sep()],
            ...this.makeForceOutputsContextMenuItem(),
        ]
    }

}


export function doALUOp(op: ALUOp, a: readonly LogicValue[], b: readonly LogicValue[], cin: LogicValue):
    ALUValue {

    function allZeros(vals: LogicValue[]): LogicValue {
        for (const v of vals) {
            if (isUnknown(v) || isHighImpedance(v)) {
                return Unknown
            }
            if (v === true) {
                return false
            }
        }
        return true
    }

    const width = a.length
    const y: LogicValue[] = ArrayFillWith(Unknown, width)
    let v: LogicValue = Unknown
    let cout: LogicValue = Unknown

    switch (op) {
        case "add": {
            const sum3bits = (a: LogicValue, b: LogicValue, c: LogicValue): [LogicValue, LogicValue] => {
                const asNumber = (v: LogicValue) => v === true ? 1 : 0
                const numUnset = (isUnknown(a) || isHighImpedance(a) ? 1 : 0) + (isUnknown(b) || isHighImpedance(a) ? 1 : 0) + (isUnknown(c) || isHighImpedance(a) ? 1 : 0)
                const sum = asNumber(a) + asNumber(b) + asNumber(c)

                if (numUnset === 0) {
                    // we know exactly
                    return [sum % 2 === 1, sum >= 2]
                }
                if (numUnset === 1 && sum >= 2) {
                    // carry will always be set
                    return [Unknown, true]
                }
                // At this point, could be anything
                return [Unknown, Unknown]

            }
            const cins: LogicValue[] = ArrayFillWith(Unknown, width + 1)
            cins[0] = cin
            for (let i = 0; i < width; i++) {
                const [s, cout] = sum3bits(cins[i], a[i], b[i])
                y[i] = s
                cins[i + 1] = cout
            }
            cout = cins[width]
            if (isBoolean(cout) && isBoolean(cins[width - 2])) {
                v = cout !== cins[width - 1]
            }
            break
        }

        case "sub": {
            const toInt = (vs: readonly LogicValue[]): number | undefined => {
                let s = 0
                let col = 1
                for (const v of vs) {
                    if (isUnknown(v)) {
                        return undefined
                    }
                    s += Number(v) * col
                    col *= 2
                }
                return s
            }

            const aInt = toInt(a)
            const bInt = toInt(b)
            if (!isUndefined(aInt) && !isUndefined(bInt) && isBoolean(cin)) {
                // otherwise, stick with default Unset values everywhere
                let yInt = aInt - bInt - (cin ? 1 : 0)
                // console.log(`${aInt} - ${bInt} = ${yInt}`)
                // we can get anything from (max - (-min)) = 7 - (-8) = 15
                // to (min - max) = -8 - 7 = -15
                if (yInt < 0) {
                    yInt += Math.pow(2, width)
                }
                // now we have everything between 0 and 15
                const yBinStr = (yInt >>> 0).toString(2).padStart(width, '0')
                const lastIdx = width - 1
                for (let i = 0; i < width; i++) {
                    y[i] = yBinStr[lastIdx - i] === '1'
                }

                cout = bInt > (aInt - (cin ? 1 : 0))

                const aNeg = a[lastIdx] === true // NOT redundant comparison
                const bNeg = b[lastIdx] === true
                const yNeg = y[lastIdx] === true

                // see https://stackoverflow.com/a/34547815/390581
                // Signed integer overflow of the expression x-y-c (where c is again 0 or 1)
                // occurs if and only if x and y have opposite signs, and the sign of the 
                // result is opposite to that of x (or, equivalently, the same as that of y).
                v = aNeg !== bNeg && aNeg !== yNeg
            }
            break
        }

        // below, we need the '=== true' and '=== false' parts
        // to distinguish also the Unset case
        case "and": {
            for (let i = 0; i < width; i++) {
                if (a[i] === false || b[i] === false) {
                    y[i] = false
                } else if (a[i] === true && b[i] === true) {
                    y[i] = true
                } else {
                    y[i] = Unknown
                }
            }
            cout = false
            v = false
            break
        }

        case "or": {
            for (let i = 0; i < width; i++) {
                if (a[i] === true || b[i] === true) {
                    y[i] = true
                } else if (a[i] === false && b[i] === false) {
                    y[i] = false
                } else {
                    y[i] = Unknown
                }
            }
            cout = false
            v = false
            break
        }
    }

    const z = allZeros(y)
    return { s: y, v, z, cout }
}
ALUDef.impl = ALU
