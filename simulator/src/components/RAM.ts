import * as t from "io-ts"
import { colorForBoolean, COLOR_BACKGROUND, COLOR_COMPONENT_BORDER, COLOR_COMPONENT_INNER_LABELS, COLOR_EMPTY, COLOR_MOUSE_OVER, displayValuesFromArray, drawLabel, drawWireLineToComponent, strokeSingleLine } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { FixedArray, FixedArrayFill, FixedArrayFillFactory, FixedArraySize, FixedReadonlyArray, isDefined, isNotNull, isNull, isUndefined, isUnknown, LogicValue, toLogicValueFromChar, toLogicValueRepr, typeOrUndefined, Unknown } from "../utils"
import { ComponentBaseWithSubclassDefinedNodes, ComponentRepr, defineComponent, NodeVisual, NodeVisuals } from "./Component"
import { ContextMenuData, ContextMenuItem, ContextMenuItemPlacement, DrawContext, Orientation } from "./Drawable"
import { EdgeTrigger, Flipflop, makeTriggerItems } from "./FlipflopOrLatch"

function defineRAM<NumInputs extends FixedArraySize, NumOutputs extends FixedArraySize, N extends string>(numInputs: NumInputs, numOutputs: NumOutputs, jsonName: N, className: string) {
    return defineComponent(numInputs, numOutputs, t.type({
        type: t.literal(jsonName),
        showContent: typeOrUndefined(t.boolean),
        trigger: typeOrUndefined(t.keyof(EdgeTrigger)),
        content: typeOrUndefined(t.union([t.string, t.array(t.string)])),
    }, className))
}

type RAMRepr<NumInputs extends FixedArraySize, NumOutputs extends FixedArraySize> =
    ComponentRepr<NumInputs, NumOutputs> & {
    showContent: boolean | undefined,
    trigger: EdgeTrigger | undefined,
    content: string | string[] | undefined,
}


const RAMDefaults = {
    showContent: true,
    trigger: EdgeTrigger.rising,
}

type RAMValue<BitWidth extends FixedArraySize> = {
    mem: Array<FixedArray<LogicValue, BitWidth>>
    out: FixedReadonlyArray<LogicValue, BitWidth>
}

type RAMInputIndices<NumDataBits extends FixedArraySize, NumAddressBits extends FixedArraySize> = {
    Clock: number,
    WriteEnable: number,
    Clear: number,
    Data: FixedArray<number, NumDataBits>,
    Address: FixedArray<number, NumAddressBits>,
}

type RAMOutputIndices<NumDataBits extends FixedArraySize> = {
    Q: FixedArray<number, NumDataBits>,
}

abstract class RAM<NumInputs extends FixedArraySize,
    NumOutputs extends FixedArraySize,
    NumAddressBits extends FixedArraySize,
    Repr extends RAMRepr<NumInputs, NumOutputs>
>
    extends ComponentBaseWithSubclassDefinedNodes<
        RAMInputIndices<NumOutputs, NumAddressBits>,
        RAMOutputIndices<NumOutputs>,
        NumInputs, NumOutputs, Repr, RAMValue<NumOutputs>
    > {

    private static generateInOffsets(numWords: number, wordWidth: number, numAddressBits: number): NodeVisual[] {
        const gridHeight = RAM.gridHeight(wordWidth)
        const bottomOffset = Math.floor((gridHeight + 1) / 2)
        const topOffset = -bottomOffset
        const clockYOffset = bottomOffset - 2

        const ins: NodeVisual[] = [
            [S.Components.Generic.InputClockDesc, -7, clockYOffset, "w"], // Clock
            [S.Components.Generic.InputWriteEnableDesc, -2, bottomOffset, "s"], // WriteEnable
            [S.Components.Generic.InputClearDesc, +2, bottomOffset, "s"], // Clear
        ]

        // Data in
        const spacing = wordWidth >= 7 ? 1 : 2
        const topInOffset = spacing === 1 ? -Math.round(wordWidth / 2) : -(wordWidth - 1) / 2 * spacing
        for (let i = 0; i < wordWidth; i++) {
            ins.push([`D${i}`, -7, topInOffset + i * spacing, "w", "D"])
        }

        // Address
        const rightAddrOffset = numAddressBits - 1
        for (let i = 0; i < numAddressBits; i++) {
            ins.push([`Addr${i}`, rightAddrOffset - i * 2, topOffset, "n", "Addr"])
        }
        return ins
    }

    private static generateOutOffsets<NumOutputs extends FixedArraySize>(wordWidth: NumOutputs): FixedArray<NodeVisual, NumOutputs> {
        const spacing = wordWidth >= 7 ? 1 : 2
        const topOffset = spacing === 1 ? -Math.round(wordWidth / 2) : -(wordWidth - 1) / 2 * spacing
        return FixedArrayFillFactory(i => [`Q${i}`, +7, topOffset + i * spacing, "e", "Q"], wordWidth)
    }

    protected static generateInputIndices<NumDataBits extends FixedArraySize, NumAddressBits extends FixedArraySize>(numDataBits: NumDataBits, numAdressBits: NumAddressBits): RAMInputIndices<NumDataBits, NumAddressBits> {
        const numFixedInputs = 3
        const Data = FixedArrayFillFactory(i => i + numFixedInputs, numDataBits)
        const Address = FixedArrayFillFactory(i => i + numFixedInputs + numDataBits, numAdressBits)
        return {
            Clock: 0,
            WriteEnable: 1,
            Clear: 2,
            Data,
            Address,
        }
    }

    protected static generateOutputIndices<NumDataBits extends FixedArraySize>(numDataBits: NumDataBits): RAMOutputIndices<NumDataBits> {
        return {
            Q: FixedArrayFillFactory(i => i, numDataBits),
        }
    }

    private static gridHeight(numWords: number): number {
        return numWords <= 16 ? 15 : 21
    }

    private static valueFilledWith<NumOutputs extends FixedArraySize>(v: LogicValue, numWords: number, wordWidth: NumOutputs): RAMValue<NumOutputs> {
        const mem: Array<FixedArray<LogicValue, NumOutputs>> = new Array(numWords)
        for (let i = 0; i < numWords; i++) {
            mem[i] = FixedArrayFill(v, wordWidth)
        }
        const out = FixedArrayFill(v, wordWidth)
        return { mem, out }
    }

    private static savedStateFrom<NumInputs extends FixedArraySize, NumOutputs extends FixedArraySize>(savedData: RAMRepr<NumInputs, NumOutputs> | null, numWords: number, wordWidth: NumOutputs): RAMValue<NumOutputs> {
        if (isNull(savedData) || isUndefined(savedData.content)) {
            return RAM.valueFilledWith(false, numWords, wordWidth)
        }
        const mem: Array<FixedArray<LogicValue, NumOutputs>> = new Array(numWords)
        const savedContent = Array.isArray(savedData.content) ? savedData.content : savedData.content.split(" ")
        for (let i = 0; i < numWords; i++) {
            const row = FixedArrayFill<LogicValue, NumOutputs>(false, wordWidth)
            if (i < savedContent.length) {
                const savedWordRepr = savedContent[i]
                const len = savedWordRepr.length
                const isBinary = len === wordWidth
                const savedBits = isBinary ? savedWordRepr : parseInt(savedWordRepr, 16).toString(2).padStart(wordWidth, "0")

                console.log(savedBits)

                for (let j = 0; j < wordWidth; j++) {
                    const jj = wordWidth - j - 1
                    if (jj >= 0) {
                        row[j] = toLogicValueFromChar(savedBits[jj])
                    } else {
                        break
                    }
                }
            }
            mem[i] = row
        }
        const out = [...mem[0]] as FixedArray<LogicValue, NumOutputs>
        return { mem, out }
    }

    private _numWords: number
    private _wordWidth: NumOutputs
    private _showContent: boolean = RAMDefaults.showContent
    private _trigger: EdgeTrigger = RAMDefaults.trigger
    private _lastClock: LogicValue = Unknown

    protected constructor(editor: LogicEditor, savedData: Repr | null, numWords: number, wordWidth: NumOutputs, numAddressBits: NumAddressBits) {
        super(editor, 11, RAM.gridHeight(numWords), RAM.savedStateFrom<NumInputs, NumOutputs>(savedData, numWords, wordWidth), savedData, {
            ins: RAM.generateInOffsets(numWords, wordWidth, numAddressBits),
            outs: RAM.generateOutOffsets(wordWidth),
        } as unknown as NodeVisuals<NumInputs, NumOutputs>)
        this._numWords = numWords
        this._wordWidth = wordWidth
        if (isNotNull(savedData)) {
            this._showContent = savedData.showContent ?? RAMDefaults.showContent
            this._trigger = savedData.trigger ?? RAMDefaults.trigger
        }
        const INPUT = this.INPUT
        this.setInputsPreferSpike(INPUT.Clock, INPUT.Clear)
    }

    protected override toJSONBase() {
        return {
            ...super.toJSONBase(),
            showContent: (this._showContent !== RAMDefaults.showContent) ? this._showContent : undefined,
            trigger: (this._trigger !== RAMDefaults.trigger) ? this._trigger : undefined,
            content: this.contentRepr(),
        }
    }

    public get componentType() {
        return "ic" as const
    }

    public get trigger() {
        return this._trigger
    }

    private contentRepr(): string | undefined {
        const cells: string[] = []
        const useHex = this._wordWidth >= 8
        const hexWidth = Math.ceil(this._wordWidth / 4)
        for (let addr = 0; addr < this._numWords; addr++) {
            let wordRepr = this.value.mem[addr].map(toLogicValueRepr).reverse().join("")
            if (useHex) {
                wordRepr = parseInt(wordRepr, 2).toString(16).toUpperCase().padStart(hexWidth, "0")
            }
            cells.push(wordRepr)
        }
        let numToSkip = 0
        for (let addr = this._numWords - 1; addr >= 0; addr--) {
            if (isAllZeros(cells[addr])) {
                numToSkip++
            } else {
                if (numToSkip > 0) {
                    cells.splice(addr + 1, numToSkip)
                }
                break
            }
        }
        return cells.length === 0 ? undefined : cells.join(" ")
    }


    protected doRecalcValue(): RAMValue<NumOutputs> {
        const INPUT = this.INPUT
        const clear = this.inputs[INPUT.Clear].value
        const numWords = this._numWords
        if (clear === true) {
            // clear is true, preset is false, set output to 0
            return RAM.valueFilledWith(false, numWords, this._wordWidth)
        }

        // first, determine output
        const addr = this.currentAddress()

        const prevClock = this._lastClock
        const clock = this._lastClock = this.inputs[INPUT.Clock].value

        // handle normal operation
        const oldState = this.value
        const we = this.inputs[INPUT.WriteEnable].value
        if (we !== true || !Flipflop.isClockTrigger(this.trigger, prevClock, clock)) {
            // nothing to write, just update output
            const out = isUnknown(addr) ? FixedArrayFill(Unknown, this._wordWidth) : oldState.mem[addr]
            return { mem: oldState.mem, out }
        }

        // we write
        if (isUnknown(addr)) {
            return RAM.valueFilledWith(Unknown, numWords, this._wordWidth)
        }

        // build new state
        const newData = this.inputValues<NumOutputs>(INPUT.Data)
        const newState: Array<FixedArray<LogicValue, NumOutputs>> = new Array(numWords)
        for (let i = 0; i < numWords; i++) {
            if (i === addr) {
                newState[i] = newData
            } else {
                newState[i] = oldState.mem[i]
            }
        }
        return { mem: newState, out: newData }
    }

    private currentAddress(): number | Unknown {
        const addrBits = this.inputValues<NumAddressBits>(this.INPUT.Address)
        const [__, addr] = displayValuesFromArray(addrBits, false)
        return addr
    }

    protected override propagateValue(newValue: RAMValue<NumOutputs>) {
        const OUTPUT = this.OUTPUT
        for (let i = 0; i < OUTPUT.Q.length; i++) {
            this.outputs[OUTPUT.Q[i]].value = newValue.out[i]
        }
    }

    protected doSetShowContent(showContent: boolean) {
        this._showContent = showContent
        this.setNeedsRedraw("show content changed")
    }

    protected doSetTrigger(trigger: EdgeTrigger) {
        this._trigger = trigger
        this.setNeedsRedraw("trigger changed")
    }


    public override makeTooltip() {
        const s = S.Components.RAM.tooltip
        return tooltipContent(s.title, mods(
            div(s.desc.expand({ numWords: this._numWords, wordWidth: this._wordWidth }))
            // TODO more info
        ))
    }


    protected doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {

        const INPUT = this.INPUT
        const OUTPUT = this.OUTPUT

        const width = this.unrotatedWidth
        const height = this.unrotatedHeight
        const left = this.posX - width / 2
        const right = this.posX + width / 2
        const top = this.posY - height / 2
        const bottom = this.posY + height / 2

        g.fillStyle = COLOR_BACKGROUND
        g.strokeStyle = ctx.isMouseOver ? COLOR_MOUSE_OVER : COLOR_COMPONENT_BORDER
        g.lineWidth = 3

        g.beginPath()
        g.rect(left, top, width, height)
        g.fill()
        g.stroke()
        g.fillStyle = COLOR_BACKGROUND

        Flipflop.drawClockInput(g, left, this.inputs[INPUT.Clock], this._trigger)
        drawWireLineToComponent(g, this.inputs[INPUT.WriteEnable], this.inputs[INPUT.WriteEnable].posXInParentTransform, bottom + 2, false)
        drawWireLineToComponent(g, this.inputs[INPUT.Clear], this.inputs[INPUT.Clear].posXInParentTransform, bottom + 2, false)
        for (const i of INPUT.Data) {
            drawWireLineToComponent(g, this.inputs[i], left - 1, this.inputs[i].posYInParentTransform, false)
        }
        for (const i of INPUT.Address) {
            drawWireLineToComponent(g, this.inputs[i], this.inputs[i].posXInParentTransform, top, false)
        }

        for (const output of this.outputs) {
            drawWireLineToComponent(g, output, right + 1, output.posYInParentTransform, false)
        }


        ctx.inNonTransformedFrame(ctx => {
            if (!this._showContent || this.editor.options.hideMemoryContent) {
                g.font = `bold 18px sans-serif`
                g.fillStyle = COLOR_COMPONENT_BORDER
                g.textAlign = "center"
                g.textBaseline = "middle"
                g.fillText("RAM", this.posX, this.posY - 6)
                g.font = `11px sans-serif`
                g.fillText(`${this._numWords} × ${this._wordWidth} bits`, this.posX, this.posY + 12)
            } else {
                const mem = this.value.mem
                const addr = this.currentAddress()
                const numWords = this._numWords
                const wordWidth = this._wordWidth
                const showSingleVerticalBlock = numWords <= 16 || !Orientation.isVertical(this.orient)
                const cellHeight = numWords <= 16
                    ? Orientation.isVertical(this.orient) ? 4.5 : 6
                    : 2.5

                if (showSingleVerticalBlock) {
                    const cellWidth = wordWidth <= 4 ? 10 : 8
                    drawMemoryCells(g, mem, wordWidth, addr, 0, numWords, this.posX + 2, this.posY, cellWidth, cellHeight)
                } else {
                    const cellWidth = 6.5
                    drawMemoryCells(g, mem, wordWidth, addr, 0, numWords / 2, this.posX + 2 - 38, this.posY, cellWidth, cellHeight)
                    drawMemoryCells(g, mem, wordWidth, addr, numWords / 2, numWords, this.posX + 2 + 38, this.posY, cellWidth, cellHeight)
                }

            }

            g.fillStyle = COLOR_COMPONENT_INNER_LABELS
            g.font = "12px sans-serif"

            drawLabel(ctx, this.orient, "WE", "s", this.inputs[INPUT.WriteEnable], bottom)
            drawLabel(ctx, this.orient, "Clr", "s", this.inputs[INPUT.Clear], bottom)

            g.font = "bold 12px sans-serif"
            const zero = 0 as number
            drawLabel(ctx, this.orient, "Addr", "n", this.posX, top, this.inputs[INPUT.Address[zero]])
            drawLabel(ctx, this.orient, "D", "w", left, this.posY, this.inputs[INPUT.Data[zero]])
            drawLabel(ctx, this.orient, "Q", "e", right, this.posY, this.outputs[OUTPUT.Q[zero]])
        })

    }

    protected override makeComponentSpecificContextMenuItems(): undefined | [ContextMenuItemPlacement, ContextMenuItem][] {
        const icon = this._showContent ? "check" : "none"
        const toggleShowOpItem = ContextMenuData.item(icon, S.Components.Generic.contextMenu.ShowContent,
            () => this.doSetShowContent(!this._showContent))

        const items: [ContextMenuItemPlacement, ContextMenuItem][] = [
            ...makeTriggerItems(this._trigger, this.doSetTrigger.bind(this)),
            ["mid", ContextMenuData.sep()],
            ["mid", toggleShowOpItem]]

        const forceOutputItem = this.makeForceOutputsContextMenuItem()
        if (isDefined(forceOutputItem)) {
            items.push(
                ["mid", forceOutputItem]
            )
        }

        return items
    }


}



export const RAM16x4Def =
    defineRAM(11, 4, "ram-16x4", "RAM16x4")

export type RAM16x4Repr = typeof RAM16x4Def.reprType

export class RAM16x4 extends RAM<11, 4, 4, RAM16x4Repr> {

    protected static INPUT = RAM.generateInputIndices(4, 4)
    protected static OUTPUT = RAM.generateOutputIndices(4)


    public constructor(editor: LogicEditor, savedData: RAM16x4Repr | null) {
        super(editor, savedData, 16, 4, 4)
    }

    public toJSON() {
        return {
            type: "ram-16x4" as const,
            ...this.toJSONBase(),
        }
    }

}



export const RAM16x8Def =
    defineRAM(15, 8, "ram-16x8", "RAM16x8")

export type RAM16x8Repr = typeof RAM16x8Def.reprType

export class RAM16x8 extends RAM<15, 8, 4, RAM16x8Repr> {

    protected static INPUT = RAM.generateInputIndices(8, 4)
    protected static OUTPUT = RAM.generateOutputIndices(8)


    public constructor(editor: LogicEditor, savedData: RAM16x8Repr | null) {
        super(editor, savedData, 16, 8, 4)
    }

    public toJSON() {
        return {
            type: "ram-16x8" as const,
            ...this.toJSONBase(),
        }
    }

}

export const RAM64x8Def =
    defineRAM(17, 8, "ram-64x8", "RAM64x8")

export type RAM64x8Repr = typeof RAM64x8Def.reprType

export class RAM64x8 extends RAM<17, 8, 6, RAM64x8Repr> {

    protected static INPUT = RAM.generateInputIndices(8, 6)
    protected static OUTPUT = RAM.generateOutputIndices(8)


    public constructor(editor: LogicEditor, savedData: RAM64x8Repr | null) {
        super(editor, savedData, 64, 8, 6)
    }

    public toJSON() {
        return {
            type: "ram-64x8" as const,
            ...this.toJSONBase(),
        }
    }

}

export const RAM32x12Def =
    defineRAM(20, 12, "ram-32x12", "RAM32x12")

export type RAM32x12Repr = typeof RAM32x12Def.reprType

export class RAM32x12 extends RAM<20, 12, 5, RAM32x12Repr> {

    protected static INPUT = RAM.generateInputIndices(12, 5)
    protected static OUTPUT = RAM.generateOutputIndices(12)


    public constructor(editor: LogicEditor, savedData: RAM32x12Repr | null) {
        super(editor, savedData, 32, 12, 5)
    }

    public toJSON() {
        return {
            type: "ram-32x12" as const,
            ...this.toJSONBase(),
        }
    }

}

function isAllZeros(s: string) {
    for (let i = 0; i < s.length; i++) {
        if (s[i] !== "0") {
            return false
        }
    }
    return true
}

export function drawMemoryCells<N extends FixedArraySize>(g: CanvasRenderingContext2D, mem: Array<FixedReadonlyArray<LogicValue, N>>, wordWidth: N, addr: number | Unknown, start: number, end: number, centerX: number, centerY: number, cellWidth: number, cellHeight: number,) {
    const numCellsToDraw = end - start
    const contentTop = centerY - numCellsToDraw / 2 * cellHeight
    const contentLeft = centerX - wordWidth / 2 * cellWidth
    const contentRight = contentLeft + wordWidth * cellWidth
    const contentBottom = contentTop + numCellsToDraw * cellHeight

    // by default, paint everything as zero
    g.fillStyle = COLOR_EMPTY
    g.fillRect(contentLeft, contentTop, contentRight - contentLeft, contentBottom - contentTop)

    for (let i = start; i < end; i++) {
        for (let j = 0; j < wordWidth; j++) {
            const v = mem[i][wordWidth - j - 1]
            if (v !== false) {
                g.fillStyle = colorForBoolean(v)
                g.fillRect(contentLeft + j * cellWidth, contentTop + i * cellHeight, cellWidth, cellHeight)
            }
        }
    }

    g.strokeStyle = COLOR_COMPONENT_BORDER
    g.lineWidth = 0.5
    for (let i = 1; i < numCellsToDraw; i++) {
        const y = contentTop + i * cellHeight
        strokeSingleLine(g, contentLeft, y, contentRight, y)
    }
    for (let j = 1; j < wordWidth; j++) {
        const x = contentLeft + j * cellWidth
        strokeSingleLine(g, x, contentTop, x, contentBottom)
    }
    const borderLineWidth = 2
    g.lineWidth = borderLineWidth
    g.strokeRect(contentLeft - borderLineWidth / 2, contentTop - borderLineWidth / 2, contentRight - contentLeft + borderLineWidth, contentBottom - contentTop + borderLineWidth)
    if (!isUnknown(addr) && addr >= start && addr < end) {
        const arrowY = contentTop + (addr - start) * cellHeight + cellHeight / 2
        const arrowRight = contentLeft - 3
        const arrowWidth = 8
        const arrowHalfHeight = 3
        g.beginPath()
        g.moveTo(arrowRight, arrowY)
        g.lineTo(arrowRight - arrowWidth, arrowY + arrowHalfHeight)
        g.lineTo(arrowRight - arrowWidth + 2, arrowY)
        g.lineTo(arrowRight - arrowWidth, arrowY - arrowHalfHeight)
        g.closePath()
        g.fillStyle = COLOR_COMPONENT_BORDER
        g.fill()
    }
}