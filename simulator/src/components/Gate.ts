import * as t from "io-ts"
import { LogicEditor } from "../LogicEditor"
import { COLOR_BACKGROUND, COLOR_COMPONENT_BORDER, COLOR_DARK_RED, COLOR_GATE_NAMES, COLOR_UNKNOWN, ColorString, GRID_STEP, PATTERN_STRIPED_GRAY, circle, drawWireLineToComponent } from "../drawutils"
import { Modifier, ModifierObject, asValue, b, cls, div, emptyMod, mods, table, tbody, td, th, thead, tooltipContent, tr } from "../htmlgen"
import { S } from "../strings"
import { ArrayFillUsing, LogicValue, Mode, Unknown, deepEquals, isDefined, isUndefined, isUnknown, typeOrUndefined } from "../utils"
import { ExtractParamDefs, ExtractParams, InstantiatedComponentDef, NodesIn, NodesOut, ParametrizedComponentBase, Repr, ResolvedParams, SomeParamCompDef, defineParametrizedComponent, groupVertical, param } from "./Component"
import { ContextMenuData, ContextMenuItem, DrawContext, MenuItems } from "./Drawable"
import { Gate1Type, Gate1TypeRepr, Gate1Types, Gate2OnlyTypes, Gate2toNTypes, GateNType, GateNTypeRepr, GateNTypes, GateTypes } from "./GateTypes"

type GateRepr = Gate1Repr | GateNRepr

export abstract class GateBase<
    TRepr extends GateRepr,
    TGateType extends TRepr["type"] = TRepr["type"],
    TParamDefs extends ExtractParamDefs<TRepr> = ExtractParamDefs<TRepr>
> extends ParametrizedComponentBase<
    TRepr,
    LogicValue,
    TParamDefs,
    ExtractParams<TRepr>,
    NodesIn<TRepr>,
    NodesOut<TRepr>,
    true, true
> {

    public abstract get numBits(): number
    private _type: TGateType
    private _poseAs: TGateType | undefined
    private _showAsUnknown: boolean

    protected constructor(editor: LogicEditor, SubclassDef: [InstantiatedComponentDef<TRepr, LogicValue>, SomeParamCompDef<TParamDefs>], type: TGateType, saved?: TRepr) {
        super(editor, SubclassDef, saved)

        this._type = type
        this._poseAs = saved?.poseAs as TGateType ?? undefined
        this._showAsUnknown = saved?.showAsUnknown ?? false
    }

    protected toGateJSON(numBits: number | undefined) {
        return {
            type: this._type,
            bits: numBits,
            ...super.toJSONBase(),
            showAsUnknown: (this._showAsUnknown) ? true : undefined,
            poseAs: this._poseAs,
        }
    }

    protected abstract gateTypes(numBits: number): GateTypes<TGateType>

    public get type() {
        return this._type
    }

    protected doSetType(newType: TGateType) {
        this._type = newType
        this.setNeedsRecalc()
        this.setNeedsRedraw("gate type changed")
    }

    public get poseAs() {
        return this._poseAs
    }

    public set poseAs(newPoseAs: TGateType | undefined) {
        if (newPoseAs !== this._poseAs) {
            this._poseAs = newPoseAs
            this.setNeedsRedraw("gate display changed")
        }
    }

    public get showAsUnknown() {
        return this._showAsUnknown
    }

    private doSetShowAsUnknown(newUnknown: boolean) {
        this._showAsUnknown = newUnknown
        this.setNeedsRedraw("display as unknown changed")
    }

    protected override toStringDetails(): string {
        return this.type
    }

    protected doRecalcValue(): LogicValue {
        const inputs = this.inputValues(this.inputs.In)
        const logicFunc = this.gateTypes(this.numBits).props[this.type].out
        return logicFunc(inputs)
    }

    protected override propagateValue(newValue: LogicValue) {
        this.outputs.Out.value = newValue
    }

    public override makeTooltip() {
        const s = S.Components.Gate.tooltip
        if (this.showAsUnknown) {
            return div(s.UnknownGate)
        }

        const myIns = this.inputValues(this.inputs.In)
        const myOut = this.value

        const gateProps = this.gateTypes(this.numBits).props[this.type]

        const genTruthTableData = () => {
            const header =
                this.numBits === 1 ? [s.Input] :
                    ArrayFillUsing(i => s.Input + " " + (i + 1), this.numBits)
            header.push(s.Output)
            const rows: TruthTableRowData[] = []
            for (const ins of valueCombinations(this.numBits)) {
                const matchesCurrent = deepEquals(myIns, ins)
                const out = gateProps.out(ins)
                ins.push(out)
                rows.push({ matchesCurrent, cells: ins })
            }
            return [header, rows] as const
        }

        const nodeOut = this.outputs.Out.value
        const desc = nodeOut === myOut
            ? s.CurrentlyDelivers
            : s.ShouldCurrentlyDeliver

        const gateIsUnspecified = myIns.includes(Unknown)
        const explanation = gateIsUnspecified
            ? mods(desc + " " + s.UndeterminedOutputBecauseInputUnknown)
            : mods(desc + " " + s.ThisOutput + " ", asValue(myOut), " " + s.BecauseInputIs + " ", ...myIns.map(asValue), ", " + s.AccordingToTruthTable)

        const fullShortDesc = gateProps.fullShortDesc()
        const header = (() => {
            switch (this.type) {
                case "NOT": return mods(s.Inverter[0], b(S.Components.Gate.NOT[0]), s.Inverter[1])
                case "BUF": return mods(s.Buffer[0], b(S.Components.Gate.BUF[0]), s.Buffer[1])
                default: return s.GateTitle(b(fullShortDesc[0]))
            }
        })()

        return makeGateTooltip(this.numBits,
            header,
            fullShortDesc[2],
            explanation,
            makeTruthTable(genTruthTableData())
        )
    }

    protected override doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {
        const gateType = this._showAsUnknown
            ? Unknown
            : this.poseAs ?? this.type
        this.drawGate(g, gateType, gateType !== this.type && !this._showAsUnknown, ctx)
    }

    private drawGate(g: CanvasRenderingContext2D, type: TGateType | Unknown, isFake: boolean, ctx: DrawContext) {
        const numBits = this.numBits
        const output = this.outputs.Out

        const width = this.unrotatedWidth
        const height = this.unrotatedHeight
        const top = this.posY - height / 2
        const bottom = top + height
        const left = this.posX - width / 2
        const pi2 = Math.PI / 2

        if (ctx.isMouseOver) {
            const frameWidth = 2
            const frameMargin = 2
            g.lineWidth = frameWidth
            g.strokeStyle = ctx.borderColor
            g.beginPath()
            g.rect(
                left - frameWidth - frameMargin,
                top - frameWidth - frameMargin,
                width + 2 * (frameWidth + frameMargin),
                height + 2 * (frameWidth + frameMargin)
            )
            g.stroke()
        }

        const gateWidth = (2 * Math.max(2, this.numBits)) * GRID_STEP
        let gateLeft = this.posX - gateWidth / 2
        let gateRight = this.posX + gateWidth / 2
        let nameDeltaX = 0

        const drawRightCircle = () => {
            gateRight += 5
            g.beginPath()
            circle(g, gateRight, this.posY, 8)
            g.fillStyle = COLOR_BACKGROUND
            g.fill()
            g.stroke()
            gateRight += 4
        }
        const drawLeftCircle = (up: boolean) => {
            g.beginPath()
            circle(g, gateLeft - 5, this.posY - (up ? 1 : -1) * GRID_STEP, 8)
            g.fillStyle = COLOR_BACKGROUND
            g.fill()
            g.stroke()
        }
        const drawWireEnds = (shortUp = false, shortDown = false, isORLike = false) => {
            for (let i = 0; i < numBits; i++) {
                const input = this.inputs.In[i]
                const short = i === 0 ? shortUp : shortDown
                let rightEnd = gateLeft - 1
                if (short) {
                    rightEnd -= 9
                }
                if (isORLike) {
                    if (numBits === 3) {
                        rightEnd += 3
                        if (i === 1) {
                            rightEnd += 4
                        }
                    } else if (numBits === 4) {
                        rightEnd += 3
                        if (i === 1 || i === 2) {
                            rightEnd += 8
                        }
                    }
                }
                drawWireLineToComponent(g, input, rightEnd, input.posYInParentTransform)
            }
            drawWireLineToComponent(g, output, gateRight + 1, this.posY)
        }

        const showAsFake = isFake && this.editor.mode >= Mode.FULL
        const gateBorderColor: ColorString = showAsFake ? COLOR_DARK_RED : COLOR_COMPONENT_BORDER
        const gateFill = showAsFake ? PATTERN_STRIPED_GRAY : COLOR_BACKGROUND
        g.lineWidth = 3
        g.strokeStyle = gateBorderColor
        g.fillStyle = gateFill
        g.beginPath()

        switch (type) {
            case "NOT":
            case "BUF":
                g.moveTo(gateLeft, top)
                g.lineTo(gateRight, this.posY)
                g.lineTo(gateLeft, bottom)
                g.closePath()
                g.fill()
                g.stroke()
                if (type === "NOT") {
                    drawRightCircle()
                }
                drawWireEnds()
                nameDeltaX -= 6
                break



            case "AND":
            case "NAND":
            case "NIMPLY":
            case "RNIMPLY": {
                g.moveTo(this.posX, bottom)
                g.lineTo(gateLeft, bottom)
                g.lineTo(gateLeft, top)
                g.lineTo(this.posX, top)
                g.arc(this.posX, this.posY, height / 2, -pi2, pi2)
                g.closePath()
                g.fill()
                g.lineWidth = 1
                g.stroke()
                g.strokeStyle = gateBorderColor
                g.lineWidth = 3
                g.stroke()
                g.beginPath()
                if (type.startsWith("NAND")) {
                    drawRightCircle()
                }
                let shortUp = false, shortDown = false
                if (type === "NIMPLY") {
                    drawLeftCircle(false)
                    shortDown = true
                } else if (type === "RNIMPLY") {
                    drawLeftCircle(true)
                    shortUp = true
                }
                drawWireEnds(shortUp, shortDown)
                nameDeltaX -= 1
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
                g.lineTo(this.posX - 15, top)
                g.bezierCurveTo(this.posX + 10, top, gateRight - 5, this.posY - 8,
                    gateRight, this.posY)
                g.bezierCurveTo(gateRight - 5, this.posY + 8, this.posX + 10, bottom,
                    this.posX - 15, bottom)
                g.lineTo(gateLeft, bottom)
                g.quadraticCurveTo(this.posX - 8, this.posY, gateLeft, top)
                g.closePath()
                g.fill()
                g.stroke()
                const savedGateLeft = gateLeft
                gateLeft += 4
                if (type.startsWith("NOR") || type.startsWith("XNOR")) {
                    drawRightCircle()
                }
                let shortUp = false, shortDown = false
                if (type === "IMPLY") {
                    drawLeftCircle(true)
                    shortUp = true
                } else if (type === "RIMPLY") {
                    drawLeftCircle(false)
                    shortDown = true
                }
                if (type.startsWith("X")) {
                    gateLeft = savedGateLeft - 2
                    g.beginPath()
                    g.moveTo(savedGateLeft - 6, bottom)
                    g.quadraticCurveTo(this.posX - 14, this.posY, savedGateLeft - 6, top)
                    g.lineWidth = 3
                    g.strokeStyle = gateBorderColor
                    g.stroke()
                }
                drawWireEnds(shortUp, shortDown, true)
                nameDeltaX -= 1
                break
            }

            case "TXA":
            case "TXNA": {
                g.beginPath()
                g.moveTo(gateLeft, bottom)
                g.lineTo(gateLeft, top)
                g.lineTo(gateRight, this.posY)
                g.lineTo(gateLeft + 2, this.posY)
                g.fill()
                g.stroke()
                let shortLeft = false
                if (type === "TXNA") {
                    drawLeftCircle(true)
                    shortLeft = true
                }
                drawWireEnds(shortLeft, false)
                break
            }

            case "TXB":
            case "TXNB": {
                g.beginPath()
                g.moveTo(gateLeft, top)
                g.lineTo(gateLeft, bottom)
                g.lineTo(gateRight, this.posY)
                g.lineTo(gateLeft + 2, this.posY)
                g.fill()
                g.stroke()
                let shortLeft = false
                if (type === "TXNB") {
                    drawLeftCircle(false)
                    shortLeft = true
                }
                drawWireEnds(false, shortLeft)
                break
            }

            case "?":
                g.strokeStyle = COLOR_UNKNOWN
                g.beginPath()
                g.moveTo(gateLeft, top)
                g.lineTo(gateRight, top)
                g.lineTo(gateRight, bottom)
                g.lineTo(gateLeft, bottom)
                g.closePath()
                g.fill()
                g.stroke()
                g.lineWidth = 0
                drawWireEnds()

                ctx.inNonTransformedFrame(() => {
                    g.fillStyle = COLOR_UNKNOWN
                    g.textAlign = "center"
                    g.font = "bold 20px sans-serif"
                    g.fillText('?', this.posX, this.posY)
                })
                break
        }

        if (this.editor.options.showGateTypes && !isUnknown(type)) {
            const gateShortName = this.gateTypes(this.numBits).props[type].fullShortDesc()[1]
            if (isDefined(gateShortName)) {
                g.fillStyle = COLOR_GATE_NAMES
                g.textAlign = "center"
                g.font = "bold 13px sans-serif"
                const oldTransform = g.getTransform()
                g.translate(this.posX + nameDeltaX, this.posY)
                g.scale(0.65, 1)
                g.fillText(gateShortName, 0, 0)
                g.setTransform(oldTransform)
            }
        }
    }

    public override mouseDoubleClicked(e: MouseEvent | TouchEvent) {
        if (this.editor.mode >= Mode.FULL && e.altKey) {
            this.doSetShowAsUnknown(!this._showAsUnknown)
            return true
        }
        return false
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        const items: MenuItems = [
            ["start", this.makeReplaceByMenuItem()],
        ]
        if (this.editor.mode >= Mode.FULL) {
            items.push(
                ["mid", this.makePoseAsMenuItem()],
                ...this.makeForceOutputsContextMenuItem()
            )
        }
        return items
    }

    private makeReplaceByMenuItem(): ContextMenuItem {
        const gateTypes = this.gateTypes(this.numBits)
        const s = S.Components.Gate.contextMenu
        const otherTypes = gateTypes.values.filter(t => t !== this._type && gateTypes.props[t].includeInContextMenu)
        return ContextMenuData.submenu("replace", s.ReplaceBy, [
            ...otherTypes.map(newType => {
                const gateProps = gateTypes.props[newType]
                return ContextMenuData.item(undefined, s.GateTempl.expand({ type: gateProps.fullShortDesc()[0] }), () => {
                    this.doSetType(newType)
                })
            }),
            ContextMenuData.sep(),
            ContextMenuData.text(s.VariantChangeDesc),
        ])
    }

    private makePoseAsMenuItem(): ContextMenuItem {
        const gateTypes = this.gateTypes(this.numBits)
        const s = S.Components.Gate.contextMenu
        const otherTypes = gateTypes.values.filter(t => t !== this._type && gateTypes.props[t].includeInPoseAs)
        const currentShowAsUnknown = this._showAsUnknown
        const currentPoseAs = this.poseAs
        return ContextMenuData.submenu("questioncircled", s.ShowAs, [
            ContextMenuData.item(!currentShowAsUnknown && isUndefined(currentPoseAs) ? "check" : "none",
                s.NormalGateTempl.expand({ type: gateTypes.props[this._type].fullShortDesc()[0] }), () => {
                    this.poseAs = undefined
                    this.doSetShowAsUnknown(false)
                }),
            ContextMenuData.item(currentShowAsUnknown ? "check" : "none",
                s.UnknownGate, () => {
                    this.poseAs = undefined
                    this.doSetShowAsUnknown(true)
                }),
            ContextMenuData.sep(),
            ...otherTypes.map(newType => {
                const gateProps = gateTypes.props[newType]
                return ContextMenuData.item(!currentShowAsUnknown && newType === currentPoseAs ? "check" : "none",
                    s.GateTempl.expand({ type: gateProps.fullShortDesc()[0] }), () => {
                        this.doSetShowAsUnknown(false)
                        this.poseAs = newType
                    })
            }),
        ])
    }

}



export const Gate1Def =
    defineParametrizedComponent("gate", undefined, true, true, {
        variantName: ({ type }) => `${type}`,
        button: { imgWidth: 50 },
        repr: {
            type: Gate1TypeRepr,
            poseAs: typeOrUndefined(Gate1TypeRepr),
            showAsUnknown: typeOrUndefined(t.boolean),
        },
        valueDefaults: {},
        params: {
            type: param("NOT" as Gate1Type),
        },
        size: () => ({
            gridWidth: 7, gridHeight: 4,
        }),
        makeNodes: () => ({
            ins: { In: [[-4, 0, "w"]] },
            outs: { Out: [+4, 0, "e"] },
        }),
        initialValue: () => false as LogicValue,
    })

export type Gate1Repr = Repr<typeof Gate1Def>
export type Gate1Params = ResolvedParams<typeof Gate1Def>


export class Gate1 extends GateBase<Gate1Repr> {

    public get numBits() { return 1 }

    public constructor(editor: LogicEditor, params: Gate1Params, saved?: Gate1Repr) {
        super(editor, Gate1Def.with(params), params.type, saved)
    }

    protected gateTypes() { return Gate1Types }

    public toJSON() {
        return this.toGateJSON(undefined)
    }

    public override mouseDoubleClicked(e: MouseEvent | TouchEvent) {
        if (super.mouseDoubleClicked(e)) {
            return true // already handled
        }
        if (this.editor.mode >= Mode.DESIGN) {
            this.doSetType(this.type === "BUF" ? "NOT" : "BUF")
            return true
        }
        return false
    }

}
Gate1Def.impl = Gate1



export const GateNDef =
    defineParametrizedComponent("gate", undefined, true, true, {
        variantName: ({ type }) => `${type}`,
        button: { imgWidth: 50 },
        repr: {
            type: GateNTypeRepr,
            poseAs: typeOrUndefined(GateNTypeRepr),
            showAsUnknown: typeOrUndefined(t.boolean),
        },
        valueDefaults: {},
        params: {
            type: param("NAND" as GateNType),
            bits: param(2, [2, 3, 4, 7, 8, 16]),
        },
        validateParams: ({ type: type_, bits }, defs) => {
            const type = (bits > 2 && !Gate2toNTypes.includes(type_)) ? defs.type.defaultValue : type_
            return { type, numBits: bits }
        },
        size: ({ numBits }) => ({
            gridWidth: 7 + Math.max(0, numBits - 2) * 2,
            gridHeight: 4 + Math.max(0, numBits - 2) * 2,
        }),
        makeNodes: ({ numBits }) => {
            const outX = 4 + (numBits - 2)
            const inX = -outX
            return {
                ins: {
                    In: groupVertical("w", inX, 0, numBits),
                },
                outs: {
                    Out: [outX, 0, "e"],
                },
            }
        },
        initialValue: () => false as LogicValue,
    })

export type GateNRepr = Repr<typeof GateNDef>
export type GateNParams = ResolvedParams<typeof GateNDef>


export class GateN extends GateBase<GateNRepr> {

    public readonly numBits: number

    public constructor(editor: LogicEditor, params: GateNParams, saved?: GateNRepr) {
        super(editor, GateNDef.with(params), params.type, saved)
        this.numBits = params.numBits
    }

    protected gateTypes(numBits: number) {
        return (numBits > 2 ? Gate2toNTypes : GateNTypes) as any
    }

    public toJSON() {
        return this.toGateJSON(
            this.numBits !== GateNDef.aults.bits ? this.numBits : undefined
        )
    }

    public override mouseDoubleClicked(e: MouseEvent | TouchEvent) {
        if (super.mouseDoubleClicked(e)) {
            return true // already handled
        }
        if (this.editor.mode >= Mode.DESIGN) {
            // switch to IMPLY / NIMPLY variant
            const newType = (() => {
                switch (this.type) {
                    case "IMPLY": return "RIMPLY"
                    case "RIMPLY": return "IMPLY"

                    case "NIMPLY": return "RNIMPLY"
                    case "RNIMPLY": return "NIMPLY"

                    case "TXA": return "TXB"
                    case "TXB": return "TXNA"
                    case "TXNA": return "TXNB"
                    case "TXNB": return "TXA"

                    default: return undefined
                }
            })()
            if (isDefined(newType)) {
                this.doSetType(newType)
                return true
            }
        }
        return false
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        const s = S.Components.Generic.contextMenu

        const changeBitsItems: MenuItems = Gate2OnlyTypes.includes(this.type) ? [] : [
            this.makeChangeParamsContextMenuItem("inputs", s.ParamNumInputs, this.numBits, "bits"),
            ["mid", ContextMenuData.sep()],
        ]

        return [
            ...changeBitsItems,
            ...super.makeComponentSpecificContextMenuItems(),
        ]
    }

}
GateNDef.impl = GateN



// Truth table generation helpers

function* valueCombinations(n: number) {
    let curr = 0
    const max = 1 << n
    while (curr < max) {
        const binString = curr.toString(2).padStart(n, "0")
        const valueArray = binString.split("").reverse().map(v => (v === "1") as LogicValue)
        yield valueArray
        curr++
    }
}

type TruthTableRowData = { matchesCurrent: boolean, cells: LogicValue[] }
function makeTruthTable([header, rows]: readonly [string[], TruthTableRowData[]]) {
    const htmlRows = rows.map(({ matchesCurrent, cells }) =>
        tr(matchesCurrent ? cls("current") : emptyMod, ...cells.map(v => td(asValue(v))))
    )
    return table(cls("truth-table"),
        thead(tr(...header.map(title =>
            th(title))
        )),
        tbody(...htmlRows)
    )
}
function makeGateTooltip(nInput: number, title: Modifier, description: Modifier, explanation: Modifier, truthTable: Modifier): ModifierObject {
    const maxWidth = 200 + (Math.max(0, nInput - 2)) * 50
    return tooltipContent(title, mods(div(description), div(explanation), div(truthTable)), maxWidth)
}
