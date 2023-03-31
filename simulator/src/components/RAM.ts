import * as t from "io-ts"
import { colorForBoolean, COLOR_COMPONENT_BORDER, COLOR_EMPTY, displayValuesFromArray, formatWithRadix, strokeSingleLine } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { allBooleans, ArrayFillWith, binaryStringRepr, EdgeTrigger, hexStringRepr, isAllZeros, isArray, isDefined, isUndefined, isUnknown, LogicValue, typeOrUndefined, Unknown, wordFromBinaryOrHexRepr } from "../utils"
import { defineParametrizedComponent, groupHorizontal, groupVertical, param, ParametrizedComponentBase, Repr, ResolvedParams } from "./Component"
import { ContextMenuData, ContextMenuItem, ContextMenuItemPlacement, DrawContext, MenuItems, Orientation } from "./Drawable"
import { Flipflop, makeTriggerItems } from "./FlipflopOrLatch"


export const RAMDef =
    defineParametrizedComponent("ic", "ram", true, true, {
        variantName: ({ bits, lines }) => `ram-${lines}x${bits}`,
        button: { imgWidth: 50 },
        repr: {
            bits: typeOrUndefined(t.number),
            lines: typeOrUndefined(t.number),
            showContent: typeOrUndefined(t.boolean),
            displayRadix: typeOrUndefined(t.number),
            trigger: typeOrUndefined(t.keyof(EdgeTrigger)),
            content: typeOrUndefined(t.union([t.string, t.array(t.string)])),
        },
        valueDefaults: {
            showContent: true,
            displayRadix: undefined as number | undefined,
            trigger: EdgeTrigger.rising,
        },
        params: {
            bits: param(4, [4, 8, 16, 32]),
            lines: param(16, [8, 16, 32, 64, 128, 256, 512, 1024, 2048]),
        },
        validateParams: ({ bits, lines }) => {
            const numAddressBits = Math.ceil(Math.log2(lines))
            const numWords = Math.pow(2, numAddressBits)
            return { numDataBits: bits, numAddressBits, numWords }
        },
        size: ({ numWords, numDataBits }) => ({
            gridWidth: 11, // always wide enough even for 256 lines
            gridHeight: Math.max(numWords <= 16 ? 16 : 22, numDataBits + 4),
        }),
        makeNodes: ({ numDataBits, numAddressBits, gridHeight }) => {
            const bottomOffset = Math.ceil((gridHeight + 1) / 2)
            const addrTopOffset = -bottomOffset
            const clockYOffset = bottomOffset - 2
            const s = S.Components.Generic

            return {
                ins: {
                    Clock: [-7, clockYOffset, "w", s.InputClockDesc, { isClock: true }],
                    WE: [-2, bottomOffset, "s", s.InputWriteEnableDesc],
                    Clr: [+2, bottomOffset, "s", s.InputClearDesc, { prefersSpike: true }],
                    D: groupVertical("w", -7, 0, numDataBits),
                    Addr: groupHorizontal("n", 0, addrTopOffset, numAddressBits),
                },
                outs: {
                    Q: groupVertical("e", 7, 0, numDataBits),
                },
            }
        },
        initialValue: (saved, { numDataBits, numWords }) => {
            if (isUndefined(saved) || isUndefined(saved.content)) {
                return RAM.defaultValue(numWords, numDataBits)
            }
            const mem: LogicValue[][] = new Array(numWords)
            const savedContent = isArray(saved.content) ? saved.content : saved.content.split(" ")
            for (let i = 0; i < numWords; i++) {
                const row = i >= savedContent.length
                    ? ArrayFillWith(false, numDataBits)
                    : wordFromBinaryOrHexRepr(savedContent[i], numDataBits)
                mem[i] = row
            }
            const out = [...mem[0]]
            return { mem, out }
        },
    })


export type RAMRepr = Repr<typeof RAMDef>
export type RAMParams = ResolvedParams<typeof RAMDef>

type RAMValue = {
    mem: LogicValue[][]
    out: LogicValue[]
}

export class RAM extends ParametrizedComponentBase<RAMRepr, RAMValue> {

    public static defaultValue(numWords: number, numDataBits: number) {
        return RAM.valueFilledWith(false, numWords, numDataBits)
    }

    public static valueFilledWith(v: LogicValue, numWords: number, numDataBits: number): RAMValue {
        const mem: LogicValue[][] = new Array(numWords)
        for (let i = 0; i < numWords; i++) {
            mem[i] = ArrayFillWith(v, numDataBits)
        }
        const out = ArrayFillWith(v, numDataBits)
        return { mem, out }
    }

    public readonly numDataBits: number
    public readonly numAddressBits: number
    public readonly numWords: number
    private _showContent: boolean
    private _displayRadix: number | undefined
    private _trigger: EdgeTrigger = RAMDef.aults.trigger
    private _lastClock: LogicValue = Unknown

    public constructor(editor: LogicEditor, params: RAMParams, saved?: RAMRepr) {
        super(editor, RAMDef.with(params), saved)

        this.numDataBits = params.numDataBits
        this.numAddressBits = params.numAddressBits
        this.numWords = params.numWords

        this._showContent = saved?.showContent ?? (!this.canShowContent() ? false : RAMDef.aults.showContent)
        this._displayRadix = saved?.displayRadix ?? RAMDef.aults.displayRadix
        this._trigger = saved?.trigger ?? RAMDef.aults.trigger
    }

    public toJSON() {
        return {
            type: "ram" as const,
            bits: this.numDataBits === RAMDef.aults.bits ? undefined : this.numDataBits,
            lines: this.numWords === RAMDef.aults.lines ? undefined : this.numWords,
            ...super.toJSONBase(),
            showContent: (!this.canShowContent()) ? undefined : (this._showContent !== RAMDef.aults.showContent) ? this._showContent : undefined,
            displayRadix: this._displayRadix !== RAMDef.aults.displayRadix ? this._displayRadix : undefined,
            trigger: (this._trigger !== RAMDef.aults.trigger) ? this._trigger : undefined,
            content: this.contentRepr(),
        }
    }

    public get trigger() {
        return this._trigger
    }

    private contentRepr(): string | undefined {
        const cells: string[] = []
        const useHex = this.numDataBits >= 8
        const hexWidth = Math.ceil(this.numDataBits / 4)
        for (let addr = 0; addr < this.numWords; addr++) {
            const word = this.value.mem[addr]
            const wordRepr = useHex && allBooleans(word) ? hexStringRepr(word, hexWidth) : binaryStringRepr(word)
            cells.push(wordRepr)
        }
        let numToSkip = 0
        for (let addr = this.numWords - 1; addr >= 0; addr--) {
            if (isAllZeros(cells[addr])) {
                numToSkip++
            } else {
                break
            }
        }
        if (numToSkip > 0) {
            // remove last numToSkip cells
            cells.splice(this.numWords - numToSkip, numToSkip)
        }
        return cells.length === 0 ? undefined : cells.join(" ")
    }


    protected doRecalcValue(): RAMValue {
        const clear = this.inputs.Clr.value
        const numWords = this.numWords
        if (clear === true) {
            // clear is true, preset is false, set output to 0
            return RAM.valueFilledWith(false, numWords, this.numDataBits)
        }

        // first, determine output
        const addr = this.currentAddress()

        const prevClock = this._lastClock
        const clock = this._lastClock = this.inputs.Clock.value

        // handle normal operation
        const oldState = this.value
        const we = this.inputs.WE.value
        if (we !== true || !Flipflop.isClockTrigger(this.trigger, prevClock, clock)) {
            // nothing to write, just update output
            const out = isUnknown(addr) ? ArrayFillWith(Unknown, this.numDataBits) : oldState.mem[addr]
            return { mem: oldState.mem, out }
        }

        // we write
        if (isUnknown(addr)) {
            return RAM.valueFilledWith(Unknown, numWords, this.numDataBits)
        }

        // build new state
        const newData = this.inputValues(this.inputs.D)
        const newState: LogicValue[][] = new Array(numWords)
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
        const addrBits = this.inputValues(this.inputs.Addr)
        const [__, addr] = displayValuesFromArray(addrBits, false)
        return addr
    }

    protected override propagateValue(newValue: RAMValue) {
        this.outputValues(this.outputs.Q, newValue.out)
    }

    private canShowContent() {
        return this.numWords <= 64 && this.numDataBits <= 16
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
            div(s.desc.expand({ numWords: this.numWords, numDataBits: this.numDataBits }))
            // TODO more info
        ))
    }


    protected override doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {
        this.doDrawDefault(g, ctx, (ctx, { width, height }) => {

            const mem = this.value.mem
            const addr = this.currentAddress()
            let contentBottom, labelCenter

            if (!this._showContent || !this.canShowContent() || this.editor.options.hideMemoryContent) {
                g.font = `bold 18px sans-serif`
                g.fillStyle = COLOR_COMPONENT_BORDER
                g.textAlign = "center"
                g.textBaseline = "middle"
                g.fillText("RAM", this.posX, this.posY - 6)
                g.font = `11px sans-serif`
                const numWordsStr = this.numWords >= 1024 ? `${this.numWords / 1024}k` : this.numWords.toString()
                g.fillText(`${numWordsStr} × ${this.numDataBits} bits`, this.posX, this.posY + 12)
                labelCenter = this.posX
                contentBottom = this.posY + 25
            } else {
                const isVertical = Orientation.isVertical(this.orient)
                const canUseTwoCols = isVertical
                const addressedContentHeight = isDefined(this._displayRadix) ? 12 : 0
                const contentCenterY = this.posY - addressedContentHeight / 2
                const [availWidth, availHeight] = !isVertical
                    ? [width - 42, height - 30 - addressedContentHeight]
                    : [height - 66, width - 30 - addressedContentHeight]
                const arrowWidth = 10

                let useTwoCols = false
                let cellHeight = Math.floor((availHeight - addressedContentHeight) * 2 / this.numWords) / 2
                if (cellHeight <= 2 && canUseTwoCols) {
                    useTwoCols = true
                    cellHeight = Math.floor((availHeight - addressedContentHeight) * 4 / this.numWords) / 2
                }
                if (!useTwoCols) {
                    const cellWidth = Math.floor((availWidth - arrowWidth) * 2 / this.numDataBits) / 2
                    labelCenter = this.posX + 3
                    contentBottom = drawMemoryCells(g, mem, this.numDataBits, addr, 0, this.numWords, labelCenter, contentCenterY, cellWidth, cellHeight)
                } else {
                    const cellWidth = Math.floor((availWidth / 2 - 2 * arrowWidth) * 2 / this.numDataBits) / 2
                    labelCenter = this.posX
                    contentBottom = drawMemoryCells(g, mem, this.numDataBits, addr, 0, this.numWords / 2, this.posX + 2 - 38, contentCenterY, cellWidth, cellHeight)
                    drawMemoryCells(g, mem, this.numDataBits, addr, this.numWords / 2, this.numWords, this.posX + 2 + 38, contentCenterY, cellWidth, cellHeight)
                }
            }

            if (isDefined(this._displayRadix)) {
                g.textAlign = "center"
                g.textBaseline = "top"
                const word = isUnknown(addr) ? Unknown : displayValuesFromArray(mem[addr], false)[1]
                const repr = formatWithRadix(word, this._displayRadix, this.numDataBits, true)
                g.fillStyle = COLOR_COMPONENT_BORDER
                g.fillText(`${repr}`, labelCenter, contentBottom + 3)
            }
        })
    }

    private doSetDisplayRadix(additionalReprRadix: number | undefined) {
        this._displayRadix = additionalReprRadix
        this.setNeedsRedraw("additional display radix changed")
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        const s = S.Components.RAM.contextMenu
        const sg = S.Components.Generic.contextMenu
        const ss = S.Components.OutputDisplay.contextMenu

        const makeItemShowRadix = (radix: number | undefined, desc: string) => {
            const icon = this._displayRadix === radix ? "check" : "none"
            return ContextMenuData.item(icon, desc, () => this.doSetDisplayRadix(radix))
        }

        const additionalDisplayItems: [ContextMenuItemPlacement, ContextMenuItem] =
            ["mid", ContextMenuData.submenu("eye", s.SelectedDataDisplay, [
                makeItemShowRadix(undefined, ss.DisplayNone),
                ContextMenuData.sep(),
                makeItemShowRadix(2, ss.DisplayAsBinary),
                makeItemShowRadix(16, ss.DisplayAsHexadecimal),
                makeItemShowRadix(10, ss.DisplayAsDecimal),
                makeItemShowRadix(-10, ss.DisplayAsSignedDecimal),
                makeItemShowRadix(8, ss.DisplayAsOctal),
            ])]


        const icon = this._showContent ? "check" : "none"
        const toggleShowContentItems: MenuItems =
            !this.canShowContent() ? [] : [
                ["mid", ContextMenuData.item(icon, sg.ShowContent,
                    () => this.doSetShowContent(!this._showContent))],
            ]

        return [
            ...makeTriggerItems(this._trigger, this.doSetTrigger.bind(this)),
            ["mid", ContextMenuData.sep()],
            ...toggleShowContentItems,
            additionalDisplayItems,
            ["mid", ContextMenuData.sep()],
            this.makeChangeParamsContextMenuItem("memlines", sg.ParamNumWords, this.numWords, "lines"),
            this.makeChangeParamsContextMenuItem("outputs", S.Components.Generic.contextMenu.ParamNumBits, this.numDataBits, "bits"),
            ...this.makeForceOutputsContextMenuItem(true),
        ]
    }

}
RAMDef.impl = RAM


function drawMemoryCells(g: CanvasRenderingContext2D, mem: LogicValue[][], numDataBits: number, addr: number | Unknown, start: number, end: number, centerX: number, centerY: number, cellWidth: number, cellHeight: number): number {
    const numCellsToDraw = end - start
    const contentTop = centerY - numCellsToDraw / 2 * cellHeight
    const contentLeft = centerX - numDataBits / 2 * cellWidth
    const contentRight = contentLeft + numDataBits * cellWidth
    const contentBottom = contentTop + numCellsToDraw * cellHeight

    // by default, paint everything as zero
    g.fillStyle = COLOR_EMPTY
    g.fillRect(contentLeft, contentTop, contentRight - contentLeft, contentBottom - contentTop)

    for (let i = start; i < end; i++) {
        for (let j = 0; j < numDataBits; j++) {
            const v = mem[i][numDataBits - j - 1]
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
    for (let j = 1; j < numDataBits; j++) {
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

    return contentBottom
}