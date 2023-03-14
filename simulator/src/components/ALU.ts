import * as t from "io-ts"
import { COLOR_BACKGROUND, COLOR_COMPONENT_BORDER, COLOR_COMPONENT_INNER_LABELS, COLOR_MOUSE_OVER, drawLabel, drawWireLineToComponent, GRID_STEP } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { ArrayFillWith, HighImpedance, isBoolean, isDefined, isHighImpedance, isNotNull, isUndefined, isUnknown, LogicValue, typeOrUndefined, Unknown } from "../utils"
import { ComponentBase, defineComponent, Repr } from "./Component"
import { ContextMenuData, ContextMenuItem, ContextMenuItemPlacement, DrawContext, Orientation } from "./Drawable"

const GRID_WIDTH = 6
const GRID_HEIGHT = 19

const INPUT = {
    A: [0, 1, 2, 3] as const,
    B: [4, 5, 6, 7] as const,
    Op: [8, 9] as const,
    Cin: 10,
}

const OUTPUT = {
    S: [0, 1, 2, 3] as const,
    V: 4,
    Z: 5,
    Cout: 6,
}

export const ALUDef =
    defineComponent(true, true, t.type({
        type: t.literal("alu"),
        showOp: typeOrUndefined(t.boolean),
    }, "ALU"))

type ALURepr = Repr<typeof ALUDef>


export type ALUOp = "add" | "sub" | "and" | "or"
export const ALUOp = {
    shortName(op: ALUOp): string {
        return S.Components.ALU[op][0]
    },
    fullName(op: ALUOp): string {
        return S.Components.ALU[op][1]
    },
}

const ALUDefaults = {
    showOp: true,
}

export class ALU extends ComponentBase<ALURepr, [LogicValue[], LogicValue, LogicValue, LogicValue]> {

    private _showOp = ALUDefaults.showOp

    public constructor(editor: LogicEditor, savedData: ALURepr | null) {
        super(editor, [[false, false, false, false], false, true, false], savedData, {
            ins: [
                // A
                ["A0", -4, -8, "w", "A"],
                ["A1", -4, -6, "w", "A"],
                ["A2", -4, -4, "w", "A"],
                ["A3", -4, -2, "w", "A"],
                // B
                ["B0", -4, 2, "w", "B"],
                ["B1", -4, 4, "w", "B"],
                ["B2", -4, 6, "w", "B"],
                ["B3", -4, 8, "w", "B"],
                ["Op0", 2, -10, "n", "Op"],
                ["Op1", 0, -10, "n", "Op"],
                [`Cin (${S.Components.ALU.InputCinDesc})`, -2, -10, "n"],
            ],
            outs: [
                ["S0", 4, -3, "e", "S"],
                ["S1", 4, -1, "e", "S"],
                ["S2", 4, 1, "e", "S"],
                ["S3", 4, 3, "e", "S"],
                ["V (oVerflow)", 0, 10, "s"],
                ["Z (Zero)", 2, 10, "s"],
                [`Cout (${S.Components.ALU.OutputCoutDesc})`, -2, 10, "s"],
            ],
        })
        if (isNotNull(savedData)) {
            this._showOp = savedData.showOp ?? ALUDefaults.showOp
        }
    }

    public toJSON() {
        return {
            type: "alu" as const,
            ...this.toJSONBase(),
            showOp: (this._showOp !== ALUDefaults.showOp) ? this._showOp : undefined,
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

    public override makeTooltip() {
        const op = this.op
        const s = S.Components.ALU.tooltip
        const opDesc = isUnknown(op) ? s.SomeUnknownOperation : s.ThisOperation + " " + ALUOp.fullName(op)
        return tooltipContent(s.title, mods(
            div(`${s.CurrentlyCarriesOut} ${opDesc}.`)
        ))
    }

    public get op(): ALUOp | Unknown {
        const op1 = this.inputs[INPUT.Op[1]].value
        const op0 = this.inputs[INPUT.Op[0]].value
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

    protected doRecalcValue(): [LogicValue[], LogicValue, LogicValue, LogicValue] {
        const op = this.op

        if (isUnknown(op)) {
            return [[Unknown, Unknown, Unknown, Unknown], Unknown, Unknown, Unknown]
        }

        const a = this.inputValues(INPUT.A)
        const b = this.inputValues(INPUT.B)
        const cin = this.inputs[INPUT.Cin].value

        return doALUOp(op, a, b, cin)
    }

    protected override propagateValue(newValue: [[LogicValue, LogicValue, LogicValue, LogicValue], LogicValue, LogicValue, LogicValue]) {
        for (let i = 0; i < OUTPUT.S.length; i++) {
            this.outputs[OUTPUT.S[i]].value = newValue[0][i]
        }
        this.outputs[OUTPUT.V].value = newValue[1]
        this.outputs[OUTPUT.Z].value = newValue[2]
        this.outputs[OUTPUT.Cout].value = newValue[3]
    }

    protected doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {

        const width = GRID_WIDTH * GRID_STEP
        const height = GRID_HEIGHT * GRID_STEP
        const left = this.posX - width / 2
        const right = this.posX + width / 2
        const top = this.posY - height / 2
        const bottom = this.posY + height / 2

        // inputs
        for (let i = 0; i < INPUT.A.length; i++) {
            const inputi = this.inputs[INPUT.A[i]]
            drawWireLineToComponent(g, inputi, left, inputi.posYInParentTransform)
        }
        for (let i = 0; i < INPUT.B.length; i++) {
            const inputi = this.inputs[INPUT.B[i]]
            drawWireLineToComponent(g, inputi, left, inputi.posYInParentTransform)
        }
        drawWireLineToComponent(g, this.inputs[INPUT.Op[1]], this.inputs[INPUT.Op[1]].posXInParentTransform, top + 9)
        drawWireLineToComponent(g, this.inputs[INPUT.Op[0]], this.inputs[INPUT.Op[0]].posXInParentTransform, top + 17)
        drawWireLineToComponent(g, this.inputs[INPUT.Cin], this.inputs[INPUT.Cin].posXInParentTransform, top + 3)

        // outputs
        for (let i = 0; i < OUTPUT.S.length; i++) {
            const outputi = this.outputs[OUTPUT.S[i]]
            drawWireLineToComponent(g, outputi, right, outputi.posYInParentTransform)
        }
        drawWireLineToComponent(g, this.outputs[OUTPUT.Z], this.outputs[OUTPUT.Z].posXInParentTransform, bottom - 17)
        drawWireLineToComponent(g, this.outputs[OUTPUT.V], this.outputs[OUTPUT.V].posXInParentTransform, bottom - 9)
        drawWireLineToComponent(g, this.outputs[OUTPUT.Cout], this.outputs[OUTPUT.Cout].posXInParentTransform, bottom - 3)


        // outline
        g.fillStyle = COLOR_BACKGROUND
        g.lineWidth = 3
        if (ctx.isMouseOver) {
            g.strokeStyle = COLOR_MOUSE_OVER
        } else {
            g.strokeStyle = COLOR_COMPONENT_BORDER
        }

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

        ctx.inNonTransformedFrame(ctx => {
            g.fillStyle = COLOR_COMPONENT_INNER_LABELS
            g.font = "12px sans-serif"

            // bottom outputs
            const carryHOffsetF = Orientation.isVertical(this.orient) ? 0 : 1
            drawLabel(ctx, this.orient, "Z", "s", this.outputs[OUTPUT.Z], bottom - 17)
            drawLabel(ctx, this.orient, "V", "s", this.outputs[OUTPUT.V].posXInParentTransform + carryHOffsetF * 2, bottom - 11, this.outputs[OUTPUT.V])
            drawLabel(ctx, this.orient, "Cout", "s", this.outputs[OUTPUT.Cout].posXInParentTransform + carryHOffsetF * 4, bottom - 8, this.outputs[OUTPUT.Cout])

            // top inputs
            drawLabel(ctx, this.orient, "Cin", "n", this.inputs[INPUT.Cin].posXInParentTransform + carryHOffsetF * 2, top + 5, this.inputs[INPUT.Cin])

            g.font = "bold 12px sans-serif"
            drawLabel(ctx, this.orient, "Op", "n", this.inputs[INPUT.Op[0]].posXInParentTransform - GRID_STEP, top + 15, this.inputs[INPUT.Op[0]])

            // left inputs
            g.font = "bold 14px sans-serif"
            drawLabel(ctx, this.orient, "A", "w", left, top + 4 * GRID_STEP + 6, this.inputs[INPUT.A[0]])
            drawLabel(ctx, this.orient, "B", "w", left, bottom - 4 * GRID_STEP - 6, this.inputs[INPUT.B[0]])

            // right outputs
            drawLabel(ctx, this.orient, "S", "e", right, this.posY, this.outputs[OUTPUT.S[0]])

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


    protected override makeComponentSpecificContextMenuItems(): undefined | [ContextMenuItemPlacement, ContextMenuItem][] {

        const icon = this._showOp ? "check" : "none"
        const toggleShowOpItem = ContextMenuData.item(icon, S.Components.ALU.contextMenu.toggleShowOp, () => {
            this.doSetShowOp(!this._showOp)
        })

        const items: [ContextMenuItemPlacement, ContextMenuItem][] = [
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


export function doALUOp(op: string, a: readonly LogicValue[], b: readonly LogicValue[], cin: LogicValue):
    [res: LogicValue[], v: LogicValue, z: LogicValue, cout: LogicValue] {

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
    return [y, v, z, cout]
}

