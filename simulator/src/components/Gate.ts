import * as t from "io-ts"
import { LogicEditor } from "../LogicEditor"
import { COLOR_BACKGROUND, COLOR_COMPONENT_BORDER, COLOR_DARK_RED, COLOR_GATE_NAMES, COLOR_MOUSE_OVER, COLOR_UNKNOWN, ColorString, GRID_STEP, PATTERN_STRIPED_GRAY, circle, drawWireLineToComponent } from "../drawutils"
import { Modifier, ModifierObject, asValue, b, cls, div, emptyMod, mods, table, tbody, td, th, thead, tooltipContent, tr } from "../htmlgen"
import { S } from "../strings"
import { LogicValue, Mode, RichStringEnum, Unknown, isDefined, isHighImpedance, isString, isUndefined, isUnknown } from "../utils"
import { ComponentBase, ComponentRepr, NodeVisuals, defineComponent } from "./Component"
import { ContextMenuData, ContextMenuItem, ContextMenuItemPlacement, DrawContext } from "./Drawable"
import { TriStateBuffer, TriStateBufferDef } from "./TriStateBuffer"


export type GateProps = {
    includeInContextMenu: boolean
    includeInPoseAs: boolean
    fullShortDesc: () => [string, string | undefined, string]
}


// Gates with one input

const Gate1Types_ = {
    NOT: {
        out: (in1: boolean) => !in1,
        includeInContextMenu: true, includeInPoseAs: true,
        fullShortDesc: () => S.Components.Gate.NOT,
    },
    BUF: {
        out: (in1: boolean) => in1,
        includeInContextMenu: true, includeInPoseAs: true,
        fullShortDesc: () => S.Components.Gate.BUF,
    },
} as const

export const Gate1Types = RichStringEnum.withProps<GateProps & {
    out: (in1: boolean) => boolean
}>()(Gate1Types_)

export type Gate1Type = typeof Gate1Types.type

const Gate1MandatoryParams = t.type({
    type: t.keyof(Gate1Types_),
})
type Gate1MandatoryParams = t.TypeOf<typeof Gate1MandatoryParams>


// Gates with two inputs

export const Gate2Types_ = {
    // usual suspects
    AND: {
        out: (in1: boolean, in2: boolean) => in1 && in2,
        includeInContextMenu: true, includeInPoseAs: true,
        fullShortDesc: () => S.Components.Gate.AND,
    },
    OR: {
        out: (in1: boolean, in2: boolean) => in1 || in2,
        includeInContextMenu: true, includeInPoseAs: true,
        fullShortDesc: () => S.Components.Gate.OR,
    },
    XOR: {
        out: (in1: boolean, in2: boolean) => in1 !== in2,
        includeInContextMenu: true, includeInPoseAs: true,
        fullShortDesc: () => S.Components.Gate.XOR,
    },
    NAND: {
        out: (in1: boolean, in2: boolean) => !(in1 && in2),
        includeInContextMenu: true, includeInPoseAs: true,
        fullShortDesc: () => S.Components.Gate.NAND,
    },
    NOR: {
        out: (in1: boolean, in2: boolean) => !(in1 || in2),
        includeInContextMenu: true, includeInPoseAs: true,
        fullShortDesc: () => S.Components.Gate.NOR,
    },
    XNOR: {
        out: (in1: boolean, in2: boolean) => in1 === in2,
        includeInContextMenu: true, includeInPoseAs: true,
        fullShortDesc: () => S.Components.Gate.XNOR,
    },

    // less common gates
    IMPLY: {
        out: (in1: boolean, in2: boolean) => !in1 || in2,
        includeInContextMenu: true, includeInPoseAs: true,
        fullShortDesc: () => S.Components.Gate.IMPLY,
    },
    RIMPLY: {
        out: (in1: boolean, in2: boolean) => in1 || !in2,
        includeInContextMenu: false, includeInPoseAs: true,
        fullShortDesc: () => S.Components.Gate.RIMPLY,
    },
    NIMPLY: {
        out: (in1: boolean, in2: boolean) => in1 && !in2,
        includeInContextMenu: true, includeInPoseAs: true,
        fullShortDesc: () => S.Components.Gate.NIMPLY,
    },
    RNIMPLY: {
        out: (in1: boolean, in2: boolean) => !in1 && in2,
        includeInContextMenu: false, includeInPoseAs: true,
        fullShortDesc: () => S.Components.Gate.RNIMPLY,
    },

    // observing only one input
    TXA: {
        out: (in1: boolean, __: boolean) => in1,
        includeInContextMenu: true, includeInPoseAs: false,
        fullShortDesc: () => S.Components.Gate.TXA,
    },
    TXB: {
        out: (__: boolean, in2: boolean) => in2,
        includeInContextMenu: false, includeInPoseAs: false,
        fullShortDesc: () => S.Components.Gate.TXB,
    },
    TXNA: {
        out: (in1: boolean, __: boolean) => !in1,
        includeInContextMenu: false, includeInPoseAs: false,
        fullShortDesc: () => S.Components.Gate.TXNA,
    },
    TXNB: {
        out: (__: boolean, in2: boolean) => !in2,
        includeInContextMenu: false, includeInPoseAs: false,
        fullShortDesc: () => S.Components.Gate.TXNB,
    },
} as const

export type Gate2Props = GateProps & {
    out: (in1: boolean, in2: boolean) => boolean
}

export const Gate2Types = RichStringEnum.withProps<Gate2Props>()(Gate2Types_)

export type Gate2Type = typeof Gate2Types.type

const Gate2MandatoryParams = t.type({
    type: t.keyof(Gate2Types_),
})
type Gate2MandatoryParams = t.TypeOf<typeof Gate2MandatoryParams>



// Gates with three inputs

const Gate3Types_ = {
    AND3: {
        out: (in1: boolean, in2: boolean, in3: boolean) => in1 && in2 && in3,
        includeInContextMenu: true, includeInPoseAs: true,
        fullShortDesc: () => S.Components.Gate.AND3,
    },
    OR3: {
        out: (in1: boolean, in2: boolean, in3: boolean) => in1 || in2 || in3,
        includeInContextMenu: true, includeInPoseAs: true,
        fullShortDesc: () => S.Components.Gate.OR3,
    },
    XOR3: {
        out: (in1: boolean, in2: boolean, in3: boolean) => (Number(in1) + Number(in2) + Number(in3)) % 2 === 1,
        includeInContextMenu: true, includeInPoseAs: true,
        fullShortDesc: () => S.Components.Gate.XOR3,
    },
    NAND3: {
        out: (in1: boolean, in2: boolean, in3: boolean) => !(in1 && in2 && in3),
        includeInContextMenu: true, includeInPoseAs: true,
        fullShortDesc: () => S.Components.Gate.NAND3,
    },
    NOR3: {
        out: (in1: boolean, in2: boolean, in3: boolean) => !(in1 || in2 || in3),
        includeInContextMenu: true, includeInPoseAs: true,
        fullShortDesc: () => S.Components.Gate.NOR3,
    },
    XNOR3: {
        out: (in1: boolean, in2: boolean, in3: boolean) => (Number(in1) + Number(in2) + Number(in3)) % 2 === 0,
        includeInContextMenu: true, includeInPoseAs: true,
        fullShortDesc: () => S.Components.Gate.XNOR3,
    },
} as const

export const Gate3Types = RichStringEnum.withProps<GateProps & {
    out: (in1: boolean, in2: boolean, in3: boolean) => boolean
}>()(Gate3Types_)

export type Gate3Type = typeof Gate3Types.type

const Gate3MandatoryParams = t.type({
    type: t.keyof(Gate3Types_),
})
type Gate3MandatoryParams = t.TypeOf<typeof Gate3MandatoryParams>



// Gates with four inputs

const Gate4Types_ = {
    AND4: {
        out: (in1: boolean, in2: boolean, in3: boolean, in4: boolean) => in1 && in2 && in3 && in4,
        includeInContextMenu: true, includeInPoseAs: true,
        fullShortDesc: () => S.Components.Gate.AND4,
    },
    OR4: {
        out: (in1: boolean, in2: boolean, in3: boolean, in4: boolean) => in1 || in2 || in3 || in4,
        includeInContextMenu: true, includeInPoseAs: true,
        fullShortDesc: () => S.Components.Gate.OR4,
    },
    XOR4: {
        out: (in1: boolean, in2: boolean, in3: boolean, in4: boolean) => (Number(in1) + Number(in2) + Number(in3) + Number(in4)) % 2 === 1,
        includeInContextMenu: true, includeInPoseAs: true,
        fullShortDesc: () => S.Components.Gate.XOR4,
    },
    NAND4: {
        out: (in1: boolean, in2: boolean, in3: boolean, in4: boolean) => !(in1 && in2 && in3 && in4),
        includeInContextMenu: true, includeInPoseAs: true,
        fullShortDesc: () => S.Components.Gate.NAND4,
    },
    NOR4: {
        out: (in1: boolean, in2: boolean, in3: boolean, in4: boolean) => !(in1 || in2 || in3 || in4),
        includeInContextMenu: true, includeInPoseAs: true,
        fullShortDesc: () => S.Components.Gate.NOR4,
    },
    XNOR4: {
        out: (in1: boolean, in2: boolean, in3: boolean, in4: boolean) => (Number(in1) + Number(in2) + Number(in3) + Number(in4)) % 2 === 0,
        includeInContextMenu: true, includeInPoseAs: true,
        fullShortDesc: () => S.Components.Gate.XNOR4,
    },
} as const

export const Gate4Types = RichStringEnum.withProps<GateProps & {
    out: (in1: boolean, in2: boolean, in3: boolean, in4: boolean) => boolean
}>()(Gate4Types_)

export type Gate4Type = typeof Gate4Types.type

const Gate4MandatoryParams = t.type({
    type: t.keyof(Gate4Types_),
})
type Gate4MandatoryParams = t.TypeOf<typeof Gate4MandatoryParams>


// Putting all gates together

export type GateType = Gate2Type | Gate1Type | Gate3Type | Gate4Type
export const GateTypes = {
    isValue: (str: string | null | undefined): str is GateType => {
        return Gate2Types.isValue(str) || Gate1Types.isValue(str) || Gate3Types.isValue(str) || Gate4Types.isValue(str)
    },
}



type GateMandatoryParams<G extends GateType> = { type: G }

const Gate2Def = defineComponent(true, true, Gate2MandatoryParams)
const Gate1Def = defineComponent(true, true, Gate1MandatoryParams)
const Gate3Def = defineComponent(true, true, Gate3MandatoryParams)
const Gate4Def = defineComponent(true, true, Gate4MandatoryParams)

export const GateDef = t.union([
    Gate2Def.repr,
    Gate1Def.repr,
    Gate3Def.repr,
    Gate4Def.repr,
    TriStateBufferDef.repr,
], "Gate")


type GateRepr<G extends GateType> = ComponentRepr<true, true> & GateMandatoryParams<G> & {
    poseAs?: G | undefined
    showAsUnknown: boolean | undefined
}

const GRID_WIDTH_1_2 = 7
const GRID_HEIGHT_1_2 = 4

const GRID_WIDTH_3 = 9
const GRID_HEIGHT_3 = 6

const GRID_WIDTH_4 = 11
const GRID_HEIGHT_4 = 8

export type Gate = GateBase<GateType, GateRepr<GateType>>

export abstract class GateBase<
    G extends GateType,
    Repr extends GateRepr<G>
    > extends ComponentBase<Repr, LogicValue, true, true> {

    private _type: G
    private _poseAs: G | undefined = undefined
    private _showAsUnknown = false

    protected constructor(editor: LogicEditor, savedData: Repr | GateMandatoryParams<G>, nodeOffsets: NodeVisuals<true, true>) {
        super(editor, false, "in" in savedData ? savedData : null, nodeOffsets)
        this._type = savedData.type
        if ("poseAs" in savedData) {
            this._poseAs = savedData.poseAs
        }
        if ("showAsUnknown" in savedData) {
            this._showAsUnknown = savedData.showAsUnknown ?? false
        }
    }

    protected override toJSONBase() {
        return {
            type: this._type,
            ...super.toJSONBase(),
            showAsUnknown: (this._showAsUnknown) ? true : undefined,
            poseAs: this._poseAs,
        }
    }

    public get componentType() {
        return "gate" as const
    }

    public get type() {
        return this._type
    }

    protected doSetType(newType: G) {
        this._type = newType
        this.setNeedsRecalc()
        this.setNeedsRedraw("gate type changed")
    }

    public get poseAs() {
        return this._poseAs
    }

    public set poseAs(newPoseAs: G | undefined) {
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

    public get unrotatedWidth() {
        return GRID_WIDTH_1_2 * GRID_STEP
    }

    public get unrotatedHeight() {
        return GRID_HEIGHT_1_2 * GRID_STEP
    }

    protected override propagateValue(newValue: LogicValue) {
        this.outputs[0].value = newValue
    }

    protected doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {
        const gateType = this._showAsUnknown
            ? Unknown
            : this.poseAs ?? this.type
        this.drawGate(g, gateType, gateType !== this.type && !this._showAsUnknown, ctx)
    }

    public override mouseDoubleClicked(e: MouseEvent | TouchEvent) {
        if (this.editor.mode >= Mode.FULL && e.altKey) {
            this.doSetShowAsUnknown(!this._showAsUnknown)
            return true
        }
        return false
    }

    protected drawGate(g: CanvasRenderingContext2D, type: G | Unknown, isFake: boolean, ctx: DrawContext) {
        const output = this.outputs[0]

        const width = this.unrotatedWidth
        const height = this.unrotatedHeight
        const left = this.posX - width / 2
        const top = this.posY - height / 2
        const bottom = this.posY + height / 2
        const pi2 = Math.PI / 2

        if (ctx.isMouseOver) {
            const frameWidth = 2
            const frameMargin = 2
            g.lineWidth = frameWidth
            g.strokeStyle = COLOR_MOUSE_OVER
            g.beginPath()
            g.rect(
                left - frameWidth - frameMargin,
                top - frameWidth - frameMargin,
                width + 2 * (frameWidth + frameMargin),
                height + 2 * (frameWidth + frameMargin)
            )
            g.stroke()
        }

        const gateWidth = (2 * Math.max(2, this.inputs.length)) * GRID_STEP
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
            const numInputs = this.inputs.length
            for (let i = 0; i < numInputs; i++) {
                const input = this.inputs[i]
                const short = i === 0 ? shortUp : shortDown
                let rightEnd = gateLeft - 1
                if (short) {
                    rightEnd -= 9
                }
                if (isORLike) {
                    if (numInputs === 3) {
                        rightEnd += 3
                        if (i === 1) {
                            rightEnd += 4
                        }
                    } else if (numInputs === 4) {
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
            case "AND3":
            case "AND4":
            case "NAND":
            case "NAND3":
            case "NAND4":
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
            case "OR3":
            case "OR4":
            case "NOR":
            case "NOR3":
            case "NOR4":
            case "XOR":
            case "XOR3":
            case "XOR4":
            case "XNOR":
            case "XNOR3":
            case "XNOR4":
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
            const gateShortName = this.gateTypeEnum.propsOf(type).fullShortDesc()[1]
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

    protected override makeComponentSpecificContextMenuItems(): undefined | [ContextMenuItemPlacement, ContextMenuItem][] {
        const items: [ContextMenuItemPlacement, ContextMenuItem][] = [
            ["start", this.makeReplaceByMenuItem()],
        ]
        if (this.editor.mode >= Mode.FULL) {
            items.push(
                ["mid", this.makePoseAsMenuItem()],
            )
            const forceOutputItem = this.makeForceOutputsContextMenuItem()
            if (isDefined(forceOutputItem)) {
                items.push(
                    ["mid", forceOutputItem]
                )
            }
        }
        return items
    }

    protected abstract get gateTypeEnum(): RichStringEnum<G, GateProps>

    private makeReplaceByMenuItem(): ContextMenuItem {
        const enumDef = this.gateTypeEnum
        const s = S.Components.Gate.contextMenu
        const otherTypes = enumDef.values.filter(t => t !== this._type && enumDef.propsOf(t).includeInContextMenu)
        return ContextMenuData.submenu("replace", s.ReplaceBy, [
            ...otherTypes.map(newType => {
                const gateProps = enumDef.propsOf(newType)
                return ContextMenuData.item(undefined, s.GateTempl.expand({ type: gateProps.fullShortDesc()[0] }), () => {
                    this.doSetType(newType)
                })
            }),
            ContextMenuData.sep(),
            ContextMenuData.text(s.VariantChangeDesc),
        ])
    }

    private makePoseAsMenuItem(): ContextMenuItem {
        const enumDef = this.gateTypeEnum
        const s = S.Components.Gate.contextMenu
        const otherTypes = enumDef.values.filter(t => t !== this._type && enumDef.propsOf(t).includeInPoseAs)
        const currentShowAsUnknown = this._showAsUnknown
        const currentPoseAs = this.poseAs
        return ContextMenuData.submenu("questioncircled", s.ShowAs, [
            ContextMenuData.item(!currentShowAsUnknown && isUndefined(currentPoseAs) ? "check" : "none",
                s.NormalGateTempl.expand({ type: enumDef.propsOf(this._type).fullShortDesc()[0] }), () => {
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
                const gateProps = enumDef.propsOf(newType)
                return ContextMenuData.item(!currentShowAsUnknown && newType === currentPoseAs ? "check" : "none",
                    s.GateTempl.expand({ type: gateProps.fullShortDesc()[0] }), () => {
                        this.doSetShowAsUnknown(false)
                        this.poseAs = newType
                    })
            }),
        ])
    }

}



type Gate1Repr = GateRepr<Gate1Type>
export class Gate1 extends GateBase<Gate1Type, Gate1Repr> {

    public constructor(editor: LogicEditor, savedData: Gate1Repr | Gate1MandatoryParams) {
        super(editor, savedData, {
            ins: [[undefined, -4, 0, "w"]],
            outs: [[undefined, +4, 0, "e"]],
        })
    }

    public toJSON() {
        return super.toJSONBase()
    }

    protected get gateTypeEnum() {
        return Gate1Types
    }

    protected doRecalcValue(): LogicValue {
        const in0 = this.inputs[0].value
        if (isUnknown(in0) || isHighImpedance(in0)) {
            return Unknown
        }
        const gateProps = Gate1Types.propsOf(this.type)
        return gateProps.out(in0)
    }

    public override makeTooltip() {
        const s = S.Components.Gate.tooltip
        if (this.showAsUnknown) {
            return div(s.UnknownGate)
        }

        const myIn = this.inputs[0].value
        const myOut = this.value

        const gateProps = Gate1Types.propsOf(this.type)

        const genTruthTableData = () => {
            const header = [s.Input, s.Output]
            const rows: TruthTableRowData[] = []
            for (const in0 of [false, true]) {
                const matchesCurrent = myIn === in0
                const out = gateProps.out(in0)
                rows.push({ matchesCurrent, cells: [in0, out] })
            }
            return [header, rows] as const
        }

        const nodeOut = this.outputs[0].value
        const desc = nodeOut === myOut
            ? s.CurrentlyDelivers
            : s.ShouldCurrentlyDeliver

        const explanation = isUnknown(myIn)
            ? mods(desc + " " + s.UndeterminedOutputBecauseInputUnknown)
            : mods(desc + " " + s.ThisOutput + " ", asValue(myOut), " " + s.BecauseInputIs + " ", asValue(myIn), ", " + s.AccordingToTruthTable)

        const header = (() => {
            switch (this.type) {
                case "NOT": return mods(s.Inverter[0], b(S.Components.Gate.NOT[0]), s.Inverter[1])
                case "BUF": return mods(s.Buffer[0], b(S.Components.Gate.BUF[0]), s.Buffer[1])
            }
        })()

        return makeGateTooltip(1,
            header,
            Gate1Types.propsOf(this.type).fullShortDesc()[2],
            explanation,
            makeTruthTable(genTruthTableData())
        )
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

type Gate2Repr = GateRepr<Gate2Type>
export class Gate2 extends GateBase<Gate2Type, Gate2Repr> {

    public constructor(editor: LogicEditor, savedData: Gate2Repr | Gate2MandatoryParams) {
        super(editor, savedData, {
            ins: [
                [undefined, -4, -1, "w", "In"],
                [undefined, -4, +1, "w", "In"],
            ],
            outs: [[undefined, +4, 0, "e"]],
        })
    }

    public toJSON() {
        return super.toJSONBase()
    }

    protected get gateTypeEnum() {
        return Gate2Types
    }

    public override makeTooltip() {
        const s = S.Components.Gate.tooltip
        if (this.showAsUnknown) {
            return div(s.UnknownGate)
        }

        const gateProps = Gate2Types.propsOf(this.type)
        const myIn0 = this.inputs[0].value
        const myIn1 = this.inputs[1].value
        const myOut = this.value

        const genTruthTableData = () => {
            const header = [s.Input + " 1", s.Input + " 2", s.Output]
            const rows: TruthTableRowData[] = []
            for (const in0 of [false, true]) {
                for (const in1 of [false, true]) {
                    const matchesCurrent = myIn0 === in0 && myIn1 === in1
                    const out = gateProps.out(in0, in1)
                    rows.push({ matchesCurrent, cells: [in0, in1, out] })
                }
            }
            return [header, rows] as const
        }

        const nodeOut = this.outputs[0].value
        const desc = nodeOut === myOut
            ? s.CurrentlyDelivers
            : s.ShouldCurrentlyDeliver

        const gateIsUnspecified = isUnknown(myIn0) || isUnknown(myIn1)
        const explanation = gateIsUnspecified
            ? mods(desc + " " + s.UndeterminedOutputBecauseInputsUnknown)
            : mods(desc + " " + s.ThisOutput + " ", asValue(myOut), " " + s.AccordingToTruthTable)

        const fullShortDesc = gateProps.fullShortDesc()
        return makeGateTooltip(2,
            s.GateTitle(b(fullShortDesc[0])),
            fullShortDesc[2],
            explanation,
            makeTruthTable(genTruthTableData())
        )

    }

    protected doRecalcValue(): LogicValue {
        const in1 = this.inputs[0].value
        const in2 = this.inputs[1].value
        if (isUnknown(in1) || isUnknown(in2) || isHighImpedance(in1) || isHighImpedance(in2)) {
            return Unknown
        }
        const gateProps = Gate2Types.propsOf(this.type)
        return gateProps.out(in1, in2)
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

}



type Gate3Repr = GateRepr<Gate3Type>
export class Gate3 extends GateBase<Gate3Type, Gate3Repr> {

    public constructor(editor: LogicEditor, savedData: Gate3Repr | Gate3MandatoryParams) {
        super(editor, savedData, {
            ins: [
                [undefined, -5, -2, "w", "In"],
                [undefined, -5, 0, "w", "In"],
                [undefined, -5, +2, "w", "In"],
            ],
            outs: [[undefined, +5, 0, "e"]],
        })
    }

    public toJSON() {
        return super.toJSONBase()
    }

    protected get gateTypeEnum() {
        return Gate3Types
    }

    public override get unrotatedWidth() {
        return GRID_WIDTH_3 * GRID_STEP
    }

    public override get unrotatedHeight() {
        return GRID_HEIGHT_3 * GRID_STEP
    }

    public override makeTooltip() {
        const s = S.Components.Gate.tooltip
        if (this.showAsUnknown) {
            return div(s.UnknownGate)
        }

        const gateProps = Gate3Types.propsOf(this.type)
        const myIn0 = this.inputs[0].value
        const myIn1 = this.inputs[1].value
        const myIn2 = this.inputs[2].value
        const myOut = this.value

        const genTruthTableData = () => {
            const header = [s.Input + " 1", s.Input + " 2", s.Input + " 3", s.Output]

            const rows: TruthTableRowData[] = []
            for (const in0 of [false, true]) {
                for (const in1 of [false, true]) {
                    for (const in2 of [false, true]) {
                        const matchesCurrent = myIn0 === in0 && myIn1 === in1 && myIn2 === in2
                        const out = gateProps.out(in0, in1, in2)
                        rows.push({ matchesCurrent, cells: [in0, in1, in2, out] })
                    }
                }
            }
            return [header, rows] as const
        }

        const nodeOut = this.outputs[0].value
        const desc = nodeOut === myOut
            ? s.CurrentlyDelivers
            : s.ShouldCurrentlyDeliver

        const gateIsUnspecified = isUnknown(myIn0) || isUnknown(myIn1)
        const explanation = gateIsUnspecified
            ? mods(desc + " " + s.UndeterminedOutputBecauseInputsUnknown)
            : mods(desc + " " + s.ThisOutput + " ", asValue(myOut), " " + s.AccordingToTruthTable)

        const fullShortDesc = gateProps.fullShortDesc()
        return makeGateTooltip(3,
            s.GateTitle(b(fullShortDesc[0])),
            fullShortDesc[2],
            explanation,
            makeTruthTable(genTruthTableData())
        )

    }

    protected doRecalcValue(): LogicValue {
        const in0 = this.inputs[0].value
        const in1 = this.inputs[1].value
        const in2 = this.inputs[2].value
        if (isUnknown(in0) || isUnknown(in1) || isUnknown(in2) || isHighImpedance(in0) || isHighImpedance(in1) || isHighImpedance(in2)) {
            return Unknown
        }
        const gateProps = Gate3Types.propsOf(this.type)
        return gateProps.out(in0, in1, in2)
    }

}



type Gate4Repr = GateRepr<Gate4Type>
export class Gate4 extends GateBase<Gate4Type, Gate4Repr> {

    public constructor(editor: LogicEditor, savedData: Gate4Repr | Gate4MandatoryParams) {
        super(editor, savedData, {
            ins: [
                [undefined, -6, -3, "w", "In"],
                [undefined, -6, -1, "w", "In"],
                [undefined, -6, +1, "w", "In"],
                [undefined, -6, +3, "w", "In"],
            ],
            outs: [[undefined, +6, 0, "e"]],
        })
    }

    public toJSON() {
        return super.toJSONBase()
    }

    protected get gateTypeEnum() {
        return Gate4Types
    }

    public override get unrotatedWidth() {
        return GRID_WIDTH_4 * GRID_STEP
    }

    public override get unrotatedHeight() {
        return GRID_HEIGHT_4 * GRID_STEP
    }

    public override makeTooltip() {
        const s = S.Components.Gate.tooltip
        if (this.showAsUnknown) {
            return div(s.UnknownGate)
        }

        const gateProps = Gate4Types.propsOf(this.type)
        const myIn0 = this.inputs[0].value
        const myIn1 = this.inputs[1].value
        const myIn2 = this.inputs[2].value
        const myIn3 = this.inputs[3].value
        const myOut = this.value

        const genTruthTableData = () => {
            const header = [s.Input + " 1", s.Input + " 2", s.Input + " 3", s.Input + " 4", s.Output]
            const rows: TruthTableRowData[] = []
            for (const in0 of [false, true]) {
                for (const in1 of [false, true]) {
                    for (const in2 of [false, true]) {
                        for (const in3 of [false, true]) {
                            const matchesCurrent = myIn0 === in0 && myIn1 === in1 && myIn2 === in2 && myIn3 === in3
                            const out = gateProps.out(in0, in1, in2, in3)
                            rows.push({ matchesCurrent, cells: [in0, in1, in2, in3, out] })
                        }
                    }
                }
            }
            return [header, rows] as const
        }

        const nodeOut = this.outputs[0].value
        const desc = nodeOut === myOut
            ? s.CurrentlyDelivers
            : s.ShouldCurrentlyDeliver

        const gateIsUnspecified = isUnknown(myIn0) || isUnknown(myIn1)
        const explanation = gateIsUnspecified
            ? mods(desc + " " + s.UndeterminedOutputBecauseInputsUnknown)
            : mods(desc + " " + s.ThisOutput + " ", asValue(myOut), " " + s.AccordingToTruthTable)

        const fullShortDesc = gateProps.fullShortDesc()
        return makeGateTooltip(4,
            s.GateTitle(b(fullShortDesc[0])),
            fullShortDesc[2],
            explanation,
            makeTruthTable(genTruthTableData())
        )
    }

    protected doRecalcValue(): LogicValue {
        const in0 = this.inputs[0].value
        const in1 = this.inputs[1].value
        const in2 = this.inputs[2].value
        const in3 = this.inputs[3].value
        if (isUnknown(in0) || isUnknown(in1) || isUnknown(in2) || isUnknown(in3) || isHighImpedance(in0) || isHighImpedance(in1) || isHighImpedance(in2) || isHighImpedance(in3)) {
            return Unknown
        }
        const gateProps = Gate4Types.propsOf(this.type)
        return gateProps.out(in0, in1, in2, in3)
    }

}


// Truth table generation helpers

type TruthTableRowData = { matchesCurrent: boolean, cells: boolean[] }
const makeTruthTable = ([header, rows]: readonly [string[], TruthTableRowData[]]) => {
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
const makeGateTooltip = (nInput: number, title: Modifier, description: Modifier, explanation: Modifier, truthTable: Modifier): ModifierObject => {
    const maxWidth = 200 + (Math.max(0, nInput - 2)) * 50
    return tooltipContent(title, mods(div(description), div(explanation), div(truthTable)), maxWidth)
}

export const GateFactory = {

    make: (editor: LogicEditor, savedDataOrType: GateRepr<GateType> | string | undefined) => {
        let gateParams
        let blank = true
        if (isUndefined(savedDataOrType)) {
            gateParams = { type: "NAND" }
        } else if (isString(savedDataOrType)) {
            gateParams = { type: savedDataOrType }
        } else {
            gateParams = savedDataOrType
            blank = false
        }
        if (Gate1Types.isValue(gateParams.type)) {
            const sameSavedDataWithBetterTyping = { ...gateParams, type: gateParams.type }
            return new Gate1(editor, sameSavedDataWithBetterTyping)
        } else if (Gate2Types.isValue(gateParams.type)) {
            const sameSavedDataWithBetterTyping = { ...gateParams, type: gateParams.type }
            return new Gate2(editor, sameSavedDataWithBetterTyping)
        } else if (Gate3Types.isValue(gateParams.type)) {
            const sameSavedDataWithBetterTyping = { ...gateParams, type: gateParams.type }
            return new Gate3(editor, sameSavedDataWithBetterTyping)
        } else if (Gate4Types.isValue(gateParams.type)) {
            const sameSavedDataWithBetterTyping = { ...gateParams, type: gateParams.type }
            return new Gate4(editor, sameSavedDataWithBetterTyping)
        } else if (gateParams.type === "TRI") {
            return new TriStateBuffer(editor, blank ? null : savedDataOrType as any)
        }
        return undefined
    },

}
