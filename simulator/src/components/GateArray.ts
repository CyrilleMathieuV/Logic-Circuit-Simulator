import * as t from "io-ts"
import { circle, COLOR_COMPONENT_BORDER, COLOR_UNKNOWN, GRID_STEP } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { ArrayFillWith, LogicValue, Mode, typeOrUndefined, Unknown } from "../utils"
import { ALUDef } from "./ALU"
import { defineParametrizedComponent, groupVertical, param, ParametrizedComponentBase, Repr, ResolvedParams } from "./Component"
import { ContextMenuData, DrawContext, MenuItems } from "./Drawable"
import { GateNType, GateNTypeRepr, GateNTypes } from "./GateTypes"


export const GateArrayDef =
    defineParametrizedComponent("ic", "gate-array", true, true, {
        variantName: ({ bits }) => `gate-array-${bits}`,
        button: { imgWidth: 50 },
        repr: {
            bits: typeOrUndefined(t.number),
            subtype: GateNTypeRepr,
            showAsUnknown: typeOrUndefined(t.boolean),
        },
        valueDefaults: {
            subtype: "AND" as GateNType,
            showAsUnknown: false,
        },
        params: {
            bits: param(4, [2, 4, 8, 16]),
        },
        validateParams: ({ bits }) => ({
            numBits: bits,
        }),
        size: ({ numBits }) => ({
            gridWidth: 4, // constant
            gridHeight: ALUDef.size({ numBits }).gridHeight, // mimic ALU
        }),
        makeNodes: ({ numBits }) => {
            const inputCenterY = 5 + Math.max(0, (numBits - 8) / 2)
            return {
                ins: {
                    A: groupVertical("w", -3, -inputCenterY, numBits),
                    B: groupVertical("w", -3, inputCenterY, numBits),
                },
                outs: {
                    S: groupVertical("e", 3, 0, numBits),
                },
            }
        },
        initialValue: (saved, { numBits }) => ArrayFillWith<LogicValue>(false, numBits),
    })


export type GateArrayRepr = Repr<typeof GateArrayDef>
export type GateArrayParams = ResolvedParams<typeof GateArrayDef>

export class GateArray extends ParametrizedComponentBase<GateArrayRepr> {

    public readonly numBits: number
    private _subtype: GateNType
    private _showAsUnknown: boolean

    public constructor(editor: LogicEditor, params: GateArrayParams, saved?: GateArrayRepr) {
        super(editor, GateArrayDef.with(params), saved)

        this.numBits = params.numBits
        this._subtype = saved?.subtype ?? GateArrayDef.aults.subtype
        this._showAsUnknown = saved?.showAsUnknown ?? GateArrayDef.aults.showAsUnknown
    }

    public toJSON() {
        return {
            type: "gate-array" as const,
            subtype: this._subtype,
            bits: this.numBits === GateArrayDef.aults.bits ? undefined : this.numBits,
            ...this.toJSONBase(),
            showAsUnknown: this._showAsUnknown === GateArrayDef.aults.showAsUnknown ? undefined : this._showAsUnknown,
        }
    }

    public override makeTooltip() {
        const s = S.Components.GateArray.tooltip
        const opDesc = S.Components.Gate[this._subtype][0]
        return tooltipContent(s.title, mods(
            div(s.desc.expand({ op: opDesc })),
        ))
    }

    protected doRecalcValue(): LogicValue[] {
        const out = GateNTypes.props[this._subtype].out

        const a = this.inputValues(this.inputs.A)
        const b = this.inputValues(this.inputs.B)

        const s = ArrayFillWith(Unknown as LogicValue, this.numBits)
        for (let i = 0; i < this.numBits; i++) {
            const ai = a[i]
            const bi = b[i]
            s[i] = out([ai, bi])
        }
        return s
    }

    protected override propagateValue(newValue: LogicValue[]) {
        this.outputValues(this.outputs.S, newValue)
    }

    protected override doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {
        this.doDrawDefault(g, ctx, {
            skipLabels: true,
            drawInside: ({left, right}) => {
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

                    const top = this.posY - GRID_STEP
                    const bottom = this.posY + GRID_STEP
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
            },
        })
    }

    private doSetSubtype(newSubtype: GateNType) {
        this._subtype = newSubtype
        this.setNeedsRecalc()
        this.setNeedsRedraw("quad gate type changed")
    }

    private doSetShowAsUnknown(showAsUnknown: boolean) {
        this._showAsUnknown = showAsUnknown
        this.setNeedsRedraw("display as unknown changed")
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        const s = S.Components.GateArray.contextMenu

        const typeItems: ContextMenuData = []
        for (const subtype of ["AND", "OR", "XOR", "NAND", "NOR", "XNOR", "-", "IMPLY", "RIMPLY", "NIMPLY", "RNIMPLY"] as const) {
            if (subtype === "-") {
                typeItems.push(ContextMenuData.sep())
            } else {
                const icon = this._subtype === subtype ? "check" : "none"
                typeItems.push(ContextMenuData.item(icon, subtype, () => {
                    this.doSetSubtype(subtype)
                }))
            }
        }

        const items: MenuItems = [
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

        items.push(
            ["mid", ContextMenuData.sep()],
            this.makeChangeParamsContextMenuItem("inputs", S.Components.Generic.contextMenu.ParamNumBits, this.numBits, "bits"),
            ...this.makeForceOutputsContextMenuItem(true)
        )

        return items
    }

}
GateArrayDef.impl = GateArray
