import * as t from "io-ts"
import { circle, COLOR_BACKGROUND, COLOR_COMPONENT_BORDER, COLOR_MOUSE_OVER, COLOR_UNKNOWN, drawWireLineToComponent, GRID_STEP } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { ArrayFillWith, isDefined, isNotNull, LogicValue, Mode, typeOrUndefined, Unknown } from "../utils"
import { ComponentBase, defineComponent, Repr } from "./Component"
import { ContextMenuData, ContextMenuItem, ContextMenuItemPlacement, DrawContext } from "./Drawable"
import { Gate2Type, Gate2Types_ } from "./Gate"

const GRID_WIDTH = 4
const GRID_HEIGHT = 19

const INPUT = {
    A: [0, 1, 2, 3] as const,
    B: [4, 5, 6, 7] as const,
}

const OUTPUT = {
    S: [0, 1, 2, 3] as const,
}


export const QuadGateDef =
    defineComponent(true, true, t.type({
        type: t.literal("quad-gate"),
        subtype: t.keyof(Gate2Types_),
        showAsUnknown: typeOrUndefined(t.boolean),
    }, "QuadGate"))

type QuadGateRepr = Repr<typeof QuadGateDef>

const QuadGateDefaults = {
    subtype: "AND",
    showAsUnknown: false,
} as const

export class QuadGate extends ComponentBase<QuadGateRepr, LogicValue[]> {

    private _subtype: Gate2Type
    private _showAsUnknown: boolean

    public constructor(editor: LogicEditor, savedData: QuadGateRepr | null) {
        super(editor, ArrayFillWith(false, 4), savedData, {
            ins: [
                // A
                ["A0", -3, -8, "w", "A"],
                ["A1", -3, -6, "w", "A"],
                ["A2", -3, -4, "w", "A"],
                ["A3", -3, -2, "w", "A"],
                // B
                ["B0", -3, 2, "w", "B"],
                ["B1", -3, 4, "w", "B"],
                ["B2", -3, 6, "w", "B"],
                ["B3", -3, 8, "w", "B"],
            ],
            outs: [
                ["S0", 3, -3, "e", "S"],
                ["S1", 3, -1, "e", "S"],
                ["S2", 3, 1, "e", "S"],
                ["S3", 3, 3, "e", "S"],
            ],
        })
        if (isNotNull(savedData)) {
            this._subtype = savedData.subtype
            this._showAsUnknown = savedData.showAsUnknown ?? QuadGateDefaults.showAsUnknown
        } else {
            this._subtype = QuadGateDefaults.subtype
            this._showAsUnknown = QuadGateDefaults.showAsUnknown
        }
    }

    public toJSON() {
        return {
            type: "quad-gate" as const,
            subtype: this._subtype,
            ...this.toJSONBase(),
            showAsUnknown: this._showAsUnknown === QuadGateDefaults.showAsUnknown ? undefined : this._showAsUnknown,
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
        const s = S.Components.QuadGate.tooltip
        const opDesc = S.Components.Gate[this._subtype][0]
        return tooltipContent(s.title, mods(
            div(s.desc.expand({ op: opDesc })),
        ))
    }

    protected doRecalcValue(): LogicValue[] {
        const out = Gate2Types_[this._subtype].out

        const a = this.inputValues(INPUT.A)
        const b = this.inputValues(INPUT.B)

        const s = ArrayFillWith(Unknown as LogicValue, 4)
        for (let i = 0; i < 4; i++) {
            const ai = a[i]
            const bi = b[i]
            if (typeof ai === "boolean" && typeof bi === "boolean") {
                s[i] = out(ai, bi)
            }
        }
        return s
    }

    protected override propagateValue(newValue: LogicValue[]) {
        for (let i = 0; i < OUTPUT.S.length; i++) {
            this.outputs[OUTPUT.S[i]].value = newValue[i]
        }
    }

    protected doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {

        const width = GRID_WIDTH * GRID_STEP
        const height = GRID_HEIGHT * GRID_STEP
        const left = this.posX - width / 2
        const right = this.posX + width / 2
        let top = this.posY - height / 2
        let bottom = this.posY + height / 2

        // inputs
        for (let i = 0; i < INPUT.A.length; i++) {
            const inputi = this.inputs[INPUT.A[i]]
            drawWireLineToComponent(g, inputi, left, inputi.posYInParentTransform)
        }
        for (let i = 0; i < INPUT.B.length; i++) {
            const inputi = this.inputs[INPUT.B[i]]
            drawWireLineToComponent(g, inputi, left, inputi.posYInParentTransform)
        }
        // outputs
        for (let i = 0; i < OUTPUT.S.length; i++) {
            const outputi = this.outputs[OUTPUT.S[i]]
            drawWireLineToComponent(g, outputi, right, outputi.posYInParentTransform)
        }


        // outline
        g.fillStyle = COLOR_BACKGROUND
        g.strokeStyle = ctx.isMouseOver ? COLOR_MOUSE_OVER : COLOR_COMPONENT_BORDER
        g.lineWidth = 3

        g.beginPath()
        g.rect(left, top, width, height)
        g.fill()
        g.stroke()

        if (this._showAsUnknown) {
            ctx.inNonTransformedFrame(() => {
                g.fillStyle = COLOR_UNKNOWN
                g.textAlign = "center"
                g.font = "bold 20px sans-serif"
                g.fillText('?', this.posX, this.posY)
            })
        } else {
            // draw gate type
            g.lineWidth = 2
            g.strokeStyle = COLOR_COMPONENT_BORDER
            g.beginPath()

            top = this.posY - GRID_STEP
            bottom = this.posY + GRID_STEP
            let gateLeft = left + 10
            const gateRight = right - 10
            const pi2 = Math.PI / 2
            const type = this._subtype

            const drawRightCircle = () => {
                g.beginPath()
                circle(g, gateRight + 3, this.posY, 5)
                g.stroke()
            }
            const drawLeftCircle = (up: boolean) => {
                g.beginPath()
                circle(g, gateLeft - 3, this.posY - (up ? 1 : -1) * 4, 5)
                g.stroke()
            }


            switch (type) {
                case "AND":
                case "NAND":
                case "NIMPLY":
                case "RNIMPLY": {
                    g.moveTo(this.posX, bottom)
                    g.lineTo(gateLeft, bottom)
                    g.lineTo(gateLeft, top)
                    g.lineTo(this.posX, top)
                    g.arc(this.posX, this.posY, GRID_STEP, -pi2, pi2)
                    g.closePath()
                    g.stroke()
                    g.beginPath()
                    if (type.startsWith("NAND")) {
                        drawRightCircle()
                    }
                    if (type === "NIMPLY") {
                        drawLeftCircle(false)
                    } else if (type === "RNIMPLY") {
                        drawLeftCircle(true)
                    }
                    break
                }



                case "OR":
                case "NOR":
                case "XOR":
                case "XNOR":
                case "IMPLY":
                case "RIMPLY": {
                    g.beginPath()
                    g.moveTo(gateLeft, top)
                    g.lineTo(this.posX - 5, top)
                    g.bezierCurveTo(this.posX + 2, top, gateRight - 5, this.posY - 8,
                        gateRight, this.posY)
                    g.bezierCurveTo(gateRight - 5, this.posY + 8, this.posX + 2, bottom,
                        this.posX - 5, bottom)
                    g.lineTo(gateLeft, bottom)
                    g.quadraticCurveTo(this.posX - 4, this.posY, gateLeft, top)
                    g.closePath()
                    g.stroke()
                    const savedGateLeft = gateLeft
                    gateLeft += 2
                    if (type.startsWith("NOR") || type.startsWith("XNOR")) {
                        drawRightCircle()
                    }
                    if (type === "IMPLY") {
                        drawLeftCircle(true)
                    } else if (type === "RIMPLY") {
                        drawLeftCircle(false)
                    }
                    if (type.startsWith("X")) {
                        g.beginPath()
                        g.moveTo(savedGateLeft - 4, bottom)
                        g.quadraticCurveTo(this.posX - 8, this.posY, savedGateLeft - 4, top)
                        g.stroke()
                    }
                    break
                }

                case "TXA":
                case "TXNA": {
                    g.beginPath()
                    g.moveTo(gateLeft, bottom)
                    g.lineTo(gateLeft, top)
                    g.lineTo(gateRight, this.posY)
                    g.lineTo(gateLeft + 2, this.posY)
                    g.stroke()
                    if (type === "TXNA") {
                        drawLeftCircle(true)
                    }
                    break
                }

                case "TXB":
                case "TXNB": {
                    g.beginPath()
                    g.moveTo(gateLeft, top)
                    g.lineTo(gateLeft, bottom)
                    g.lineTo(gateRight, this.posY)
                    g.lineTo(gateLeft + 2, this.posY)
                    g.stroke()
                    if (type === "TXNB") {
                        drawLeftCircle(false)
                    }
                    break
                }
            }
        }

    }

    private doSetSubtype(newSubtype: Gate2Type) {
        this._subtype = newSubtype
        this.setNeedsRecalc()
        this.setNeedsRedraw("quad gate type changed")
    }

    private doSetShowAsUnknown(showAsUnknown: boolean) {
        this._showAsUnknown = showAsUnknown
        this.setNeedsRedraw("display as unknown changed")
    }


    protected override makeComponentSpecificContextMenuItems(): undefined | [ContextMenuItemPlacement, ContextMenuItem][] {
        const s = S.Components.QuadGate.contextMenu

        const typeItems: ContextMenuData = []
        for (const subtype of ["AND", "OR", "XOR", "NAND", "NOR", "XNOR"] as const) {
            const icon = this._subtype === subtype ? "check" : "none"
            typeItems.push(ContextMenuData.item(icon, subtype, () => {
                this.doSetSubtype(subtype)
            }))
        }

        const items: [ContextMenuItemPlacement, ContextMenuItem][] = [
            ["mid", ContextMenuData.submenu("settings", s.Type, typeItems)],
        ]

        if (this.editor.mode >= Mode.FULL) {
            const showAsUnknownItem = ContextMenuData.item(this._showAsUnknown ? "check" : "none", s.ShowAsUnknown, () => {
                this.doSetShowAsUnknown(!this._showAsUnknown)
            })

            items.push(
                ["mid", showAsUnknownItem],
            )
        }

        const forceOutputItem = this.makeForceOutputsContextMenuItem()
        if (isDefined(forceOutputItem)) {
            items.push(
                ["mid", ContextMenuData.sep()],
                ["mid", forceOutputItem]
            )
        }

        return items
    }

}
