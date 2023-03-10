import * as t from "io-ts"
import { COLOR_BACKGROUND, COLOR_COMPONENT_BORDER, COLOR_MOUSE_OVER, displayValuesFromArray, drawWireLineToComponent, GRID_STEP, strokeAsWireLine } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { FixedArray, FixedArrayFill, FixedArraySize, FixedReadonlyArray, isDefined, isNotNull, isUnknown, LogicValue, typeOrUndefined, Unknown } from "../utils"
import { ComponentBaseWithSubclassDefinedNodes, ComponentRepr, defineComponent, NodeVisual, NodeVisuals } from "./Component"
import { ContextMenuData, ContextMenuItem, ContextMenuItemPlacement, DrawContext } from "./Drawable"
import { WireStyles } from "./Wire"


function defineMux<NumInputs extends FixedArraySize, NumOutputs extends FixedArraySize, N extends string>(numInputs: NumInputs, numOutputs: NumOutputs, jsonName: N, className: string) {
    return defineComponent(numInputs, numOutputs, t.type({
        type: t.literal(jsonName),
        showWiring: typeOrUndefined(t.boolean),
    }, className))
}

type MuxRepr<NumInputs extends FixedArraySize, NumOutputs extends FixedArraySize> =
    ComponentRepr<NumInputs, NumOutputs> & {
        showWiring: boolean | undefined,
    }

const MuxDefaults = {
    showWiring: true,
}

type MuxInputIndices<NumInputs extends FixedArraySize> = {
    I: ReadonlyArray<FixedReadonlyArray<number, NumInputs>>, // array of arrays of input indices
    S: ReadonlyArray<number>, // array of indices of selectors
}

type MuxOutputIndices<NumOutputs extends FixedArraySize> = {
    Z: FixedReadonlyArray<number, NumOutputs>, // array of output indices
}

abstract class Mux<
    NumInputs extends FixedArraySize,
    NumOutputs extends FixedArraySize,
    Repr extends MuxRepr<NumInputs, NumOutputs>
    >
    extends ComponentBaseWithSubclassDefinedNodes<
    MuxInputIndices<NumOutputs>,
    MuxOutputIndices<NumOutputs>,
    NumInputs, NumOutputs, Repr, FixedArray<LogicValue, NumOutputs>
    > {

    private static generateInOffsets(numFrom: number, numSel: number, numTo: number): NodeVisual[] {
        const offsets: NodeVisual[] = []

        const compact = numTo >= 7
        const spacing = compact ? 1 : 2

        // left inputs
        const numGroups = numFrom / numTo
        const addByGroupSep = numTo > 1 ? 1 : 0
        const numLeftSlots = (numFrom * spacing) / 2 + (numGroups - 1) * addByGroupSep
        let x = -2 - numSel
        let y = -(numLeftSlots - 1)
        const selY = y - 2
        let groupLetter = "A"
        for (let i = 0; i < numFrom; i++) {
            if (i !== 0 && i % numTo === 0) {
                y += addByGroupSep * spacing
                groupLetter = String.fromCharCode(groupLetter.charCodeAt(0) + 1)
            }
            offsets.push([groupLetter + (i % numTo), x, y, "w", groupLetter])
            y += spacing
        }

        // top input selectors
        x = (numSel - 1)
        for (let s = 0; s < numSel; s++) {
            offsets.push([`S${s}`, x - 2 * s, selY, "n", "S"])
        }
        return offsets
    }

    private static generateOutOffsets<NumOutputs extends FixedArraySize>(numSel: number, numTo: NumOutputs): FixedArray<NodeVisual, NumOutputs> {
        const offsets: NodeVisual[] = []

        // right outputs
        const compact = numTo >= 7
        const spacing = compact ? 1 : 2
        const topOffset = spacing === 1 ? -Math.round(numTo / 2) : -(numTo - 1) / 2 * spacing
        const x = 2 + numSel
        for (let i = 0; i < numTo; i++) {
            offsets.push([`Z${i}`, x, topOffset + spacing * i, "e", "Z"])
        }
        return offsets as FixedArray<NodeVisual, NumOutputs>
    }

    protected static generateInputIndices<NumOutputs extends FixedArraySize>(numFrom: number, numSel: number, numTo: NumOutputs): MuxInputIndices<NumOutputs> {
        let ind = 0
        const I: Array<FixedArray<number, NumOutputs>> = []
        const numGroups = Math.ceil(numFrom / numTo)
        for (let g = 0; g < numGroups; g++) {
            const inds: Array<number> = []
            for (let o = 0; o < numTo; o++) {
                inds.push(ind++)
            }
            I.push(inds as FixedArray<number, NumOutputs>)
        }
        const S: Array<number> = []
        for (let s = 0; s < numSel; s++) {
            S.push(ind++)
        }
        return { I, S }
    }

    protected static generateOutputIndices<NumOutputs extends FixedArraySize>(numTo: NumOutputs): MuxOutputIndices<NumOutputs> {
        let ind = 0
        const Z: Array<number> = []
        for (let o = 0; o < numTo; o++) {
            Z.push(ind++)
        }
        return { Z: Z as FixedArray<number, NumOutputs> }
    }

    private static gridWidth(numSel: number): number {
        return 1 + 2 * numSel
    }

    private static gridHeight(numFrom: number, numTo: number): number {
        const compact = numTo >= 7
        const spacing = compact ? 1 : 2
        const numGroups = numFrom / numTo
        const addByGroupSep = numTo > 1 ? 1 : 0
        const numLeftSlots = numFrom + (numGroups - 1) * addByGroupSep
        return 1 + spacing * numLeftSlots
    }

    private _showWiring = MuxDefaults.showWiring

    protected constructor(editor: LogicEditor, savedData: Repr | null,
        public readonly numFrom: number,
        public readonly numSel: number,
        public readonly numTo: NumOutputs,
    ) {
        super(editor, Mux.gridWidth(numSel), Mux.gridHeight(numFrom, numTo), FixedArrayFill(false as LogicValue, numTo), savedData, {
            ins: Mux.generateInOffsets(numFrom, numSel, numTo),
            outs: Mux.generateOutOffsets(numSel, numTo),
        } as unknown as NodeVisuals<NumInputs, NumOutputs>)
        if (isNotNull(savedData)) {
            this._showWiring = savedData.showWiring ?? MuxDefaults.showWiring
        }
    }

    protected override toJSONBase() {
        return {
            ...super.toJSONBase(),
            showWiring: (this._showWiring !== MuxDefaults.showWiring) ? this._showWiring : undefined,
        }
    }

    public get componentType() {
        return "ic" as const
    }

    public override makeTooltip() {
        return tooltipContent(undefined, mods(
            div(S.Components.Mux.tooltip.expand({ from: this.numFrom, to: this.numTo }))
        ))
    }

    protected doRecalcValue(): FixedArray<LogicValue, NumOutputs> {
        const sels = this.inputValues(this.INPUT.S as any)
        const sel = displayValuesFromArray(sels, false)[1]

        if (isUnknown(sel)) {
            return FixedArrayFill(Unknown, this.numTo)
        }
        return this.inputValues<NumOutputs>(this.INPUT.I[sel])
    }

    protected override propagateValue(newValues: FixedArray<LogicValue, NumOutputs>) {
        const Z = this.OUTPUT.Z
        for (let i = 0; i < Z.length; i++) {
            this.outputs[Z[i]].value = newValues[i]
        }
    }

    protected doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {

        const width = this.gridWidth * GRID_STEP
        const height = this.gridHeight * GRID_STEP
        const left = this.posX - width / 2
        const right = this.posX + width / 2
        const top = this.posY - height / 2
        const bottom = this.posY + height / 2

        // inputs
        for (const GROUP of this.INPUT.I) {
            for (let i = 0; i < GROUP.length; i++) {
                const inputi = this.inputs[GROUP[i]]
                drawWireLineToComponent(g, inputi, left, inputi.posYInParentTransform)
            }
        }

        // selectors
        for (let i = 0; i < this.INPUT.S.length; i++) {
            const seli = this.inputs[this.INPUT.S[i]]
            drawWireLineToComponent(g, seli, seli.posXInParentTransform, top + 20)
        }

        // outputs
        for (let i = 0; i < this.OUTPUT.Z.length; i++) {
            const outputi = this.outputs[this.OUTPUT.Z[i]]
            drawWireLineToComponent(g, outputi, right, outputi.posYInParentTransform)
        }

        // outline
        g.fillStyle = COLOR_BACKGROUND
        g.lineWidth = 3
        if (ctx.isMouseOver) {
            g.strokeStyle = COLOR_MOUSE_OVER
        } else {
            g.strokeStyle = COLOR_COMPONENT_BORDER
        }
        const dy = (right - left) / 3
        g.beginPath()
        g.moveTo(left, top)
        g.lineTo(right, top + dy)
        g.lineTo(right, bottom - dy)
        g.lineTo(left, bottom)
        g.closePath()
        g.fill()
        g.stroke()

        // wiring
        if (this._showWiring) {
            const sels = this.inputValues(this.INPUT.S as any)
            const sel = displayValuesFromArray(sels, false)[1]
            if (!isUnknown(sel)) {
                const neutral = this.editor.options.hideWireColors
                const from = this.INPUT.I[sel]
                const to = this.OUTPUT.Z
                const anchorDiffX = (right - left) / 3
                const wireStyleStraight = this.editor.options.wireStyle === WireStyles.straight

                for (let i = 0; i < from.length; i++) {
                    this.editor.options.wireStyle
                    g.beginPath()
                    const fromY = this.inputs[from[i]].posYInParentTransform
                    const toNode = this.outputs[to[i]]
                    const toY = toNode.posYInParentTransform
                    g.moveTo(left + 2, fromY)
                    if (wireStyleStraight) {
                        g.lineTo(left + 4, fromY)
                        g.lineTo(right - 4, toY)
                        g.lineTo(right - 2, toY)
                    } else {
                        g.bezierCurveTo(
                            left + anchorDiffX, fromY, // anchor left
                            right - anchorDiffX, toY, // anchor right
                            right - 2, toY,
                        )
                    }
                    strokeAsWireLine(g, this.inputs[from[i]].value, toNode.color, false, neutral)
                }
            }
        }

    }

    private doSetShowWiring(showWiring: boolean) {
        this._showWiring = showWiring
        this.setNeedsRedraw("show wiring changed")
    }


    protected override makeComponentSpecificContextMenuItems(): undefined | [ContextMenuItemPlacement, ContextMenuItem][] {
        const icon = this._showWiring ? "check" : "none"
        const toggleShowWiringItem = ContextMenuData.item(icon, S.Components.Mux.contextMenu.ShowWiring, () => {
            this.doSetShowWiring(!this._showWiring)
        })

        const items: [ContextMenuItemPlacement, ContextMenuItem][] = [
            ["mid", toggleShowWiringItem],
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



export const Mux2To1Def = defineMux(3, 1, "mux-2to1", "Mux2To1")
export type Mux2To1Repr = typeof Mux2To1Def.reprType
export class Mux2To1 extends Mux<3, 1, Mux2To1Repr> {

    protected static INPUT = Mux.generateInputIndices(2, 1, 1)
    protected static OUTPUT = Mux.generateOutputIndices(1)

    public constructor(editor: LogicEditor, savedData: Mux2To1Repr | null) {
        super(editor, savedData, 2, 1, 1)
    }

    public toJSON() {
        return {
            type: "mux-2to1" as const,
            ...this.toJSONBase(),
        }
    }
}

export const Mux4To1Def = defineMux(6, 1, "mux-4to1", "Mux4To1")
export type Mux4To1Repr = typeof Mux4To1Def.reprType
export class Mux4To1 extends Mux<6, 1, Mux4To1Repr> {

    protected static INPUT = Mux.generateInputIndices(4, 2, 1)
    protected static OUTPUT = Mux.generateOutputIndices(1)

    public constructor(editor: LogicEditor, savedData: Mux4To1Repr | null) {
        super(editor, savedData, 4, 2, 1)
    }

    public toJSON() {
        return {
            type: "mux-4to1" as const,
            ...this.toJSONBase(),
        }
    }
}

export const Mux8To1Def = defineMux(11, 1, "mux-8to1", "Mux8To1")
export type Mux8To1Repr = typeof Mux8To1Def.reprType
export class Mux8To1 extends Mux<11, 1, Mux8To1Repr> {

    protected static INPUT = Mux.generateInputIndices(8, 3, 1)
    protected static OUTPUT = Mux.generateOutputIndices(1)

    public constructor(editor: LogicEditor, savedData: Mux8To1Repr | null) {
        super(editor, savedData, 8, 3, 1)
    }

    public toJSON() {
        return {
            type: "mux-8to1" as const,
            ...this.toJSONBase(),
        }
    }
}

export const Mux4To2Def = defineMux(5, 2, "mux-4to2", "Mux4To2")
export type Mux4To2Repr = typeof Mux4To2Def.reprType
export class Mux4To2 extends Mux<5, 2, Mux4To2Repr> {

    protected static INPUT = Mux.generateInputIndices(4, 1, 2)
    protected static OUTPUT = Mux.generateOutputIndices(2)

    public constructor(editor: LogicEditor, savedData: Mux4To2Repr | null) {
        super(editor, savedData, 4, 1, 2)
    }

    public toJSON() {
        return {
            type: "mux-4to2" as const,
            ...this.toJSONBase(),
        }
    }
}

export const Mux8To2Def = defineMux(10, 2, "mux-8to2", "Mux8To2")
export type Mux8To2Repr = typeof Mux8To2Def.reprType
export class Mux8To2 extends Mux<10, 2, Mux8To2Repr> {

    protected static INPUT = Mux.generateInputIndices(8, 2, 2)
    protected static OUTPUT = Mux.generateOutputIndices(2)

    public constructor(editor: LogicEditor, savedData: Mux8To2Repr | null) {
        super(editor, savedData, 8, 2, 2)
    }

    public toJSON() {
        return {
            type: "mux-8to2" as const,
            ...this.toJSONBase(),
        }
    }
}

export const Mux8To4Def = defineMux(9, 4, "mux-8to4", "Mux8To4")
export type Mux8To4Repr = typeof Mux8To4Def.reprType
export class Mux8To4 extends Mux<9, 4, Mux8To4Repr> {

    protected static INPUT = Mux.generateInputIndices(8, 1, 4)
    protected static OUTPUT = Mux.generateOutputIndices(4)

    public constructor(editor: LogicEditor, savedData: Mux8To4Repr | null) {
        super(editor, savedData, 8, 1, 4)
    }

    public toJSON() {
        return {
            type: "mux-8to4" as const,
            ...this.toJSONBase(),
        }
    }
}


export const Mux16To8Def = defineMux(17, 8, "mux-16to8", "Mux16To8")
export type Mux16To8Repr = typeof Mux16To8Def.reprType
export class Mux16To8 extends Mux<17, 8, Mux16To8Repr> {

    protected static INPUT = Mux.generateInputIndices(16, 1, 8)
    protected static OUTPUT = Mux.generateOutputIndices(8)

    public constructor(editor: LogicEditor, savedData: Mux16To8Repr | null) {
        super(editor, savedData, 16, 1, 8)
    }

    public toJSON() {
        return {
            type: "mux-16to8" as const,
            ...this.toJSONBase(),
        }
    }
}
