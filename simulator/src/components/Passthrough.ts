import * as t from "io-ts"
import { COLOR_COMPONENT_BORDER, COLOR_NODE_MOUSE_OVER, COLOR_UNKNOWN, drawWireLineToComponent, GRID_STEP } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { FixedArrayFill, FixedArrayFillFactory, FixedArraySize, FixedReadonlyArray, isDefined, isUndefined, LogicValue, Mode, typeOrUndefined } from "../utils"
import { ComponentBase, ComponentRepr, defineComponent, NodeVisuals } from "./Component"
import { ContextMenuData, ContextMenuItem, ContextMenuItemPlacement, DrawContext } from "./Drawable"
import { NodeIn, NodeOut } from "./Node"
import { WireStyle } from "./Wire"


const GRID_WIDTH = 1

const GRID_HEIGHT_1 = 2
const GRID_HEIGHT_4 = 8
const GRID_UPPER_HEIGHT_8 = 4.5
const GRID_LOWER_HEIGHT_8 = 3.5

export const Slant = {
    none: "none",
    up: "up",
    down: "down",
} as const

export type Slant = keyof typeof Slant
const SlantRepr = t.keyof(Slant)

const PassthroughDefaults = {
    slant: Slant.none,
}

type PassthroughRepr<N extends FixedArraySize> = ComponentRepr<N, N> & {
    slant: Slant | undefined
}

abstract class PassthroughBase<N extends FixedArraySize, Repr extends PassthroughRepr<N>> extends ComponentBase<N, N, Repr, FixedReadonlyArray<LogicValue, N>> {

    protected readonly n: N
    private _slant: Slant
    private _hShift: [number, number]

    protected constructor(editor: LogicEditor, n: N, savedData: Repr | null, nodeOffsets: NodeVisuals<N, N>) {
        super(editor, FixedArrayFill(false, n), savedData, nodeOffsets)
        this.n = n
        this._hShift = [0, 0] // updated by updateNodeOffsets
        this._slant = savedData?.slant ?? PassthroughDefaults.slant
        this.updateNodeOffsets()
    }

    protected override toJSONBase(): PassthroughRepr<N> {
        return {
            ...super.toJSONBase(),
            slant: this._slant === PassthroughDefaults.slant ? undefined : this._slant,
        }
    }

    public override destroy(): void {
        type SavedNodeProps = WireStyle | undefined
        type EndNodes = [NodeIn, SavedNodeProps][]

        const savedWireEnds: [NodeOut, EndNodes][] = []
        for (let i = 0; i < this.n; i++) {
            const nodeOut = this.inputs[i].incomingWire?.startNode
            if (isUndefined(nodeOut) || !(nodeOut instanceof NodeOut)) {
                continue
            }
            const nodeIns: EndNodes = []
            for (const wire of this.outputs[i].outgoingWires) {
                const endNode = wire.endNode
                if (endNode !== null) {
                    nodeIns.push([endNode, wire.style])
                }
            }
            if (nodeIns.length > 0) {
                savedWireEnds.push([nodeOut, nodeIns])
            }
        }

        super.destroy()

        if (savedWireEnds.length > 0) {
            const wireMgr = this.editor.wireMgr
            for (const [nodeOut, nodeIns] of savedWireEnds) {
                for (const [nodeIn, style] of nodeIns) {
                    wireMgr.addNode(nodeOut)
                    const wire = wireMgr.addNode(nodeIn)
                    if (isUndefined(wire)) {
                        console.error("Failed to add wire back")
                        continue
                    }
                    // restore wire properties
                    if (isDefined(style)) {
                        wire.doSetStyle(style)
                    }
                }
            }
        }
    }

    public override get alwaysDrawMultiOutNodes() {
        return true
    }

    public get componentType() {
        return "layout" as const
    }

    public get unrotatedWidth() {
        return GRID_WIDTH * GRID_STEP * 2
    }

    protected doRecalcValue(): FixedReadonlyArray<LogicValue, N> {
        const indices = FixedArrayFillFactory(i => i, this.n)
        return this.inputValues<N>(indices)
    }

    protected override propagateValue(newValue: FixedReadonlyArray<LogicValue, N>): void {
        let i = 0
        for (const v of newValue) {
            this.outputs[i++].value = v
        }
    }

    public override isOver(x: number, y: number): boolean {
        if (this._slant === Slant.none) {
            return super.isOver(x, y)
        }

        let yPosWithNoHOffset = 0
        let f = 0
        switch (this._slant) {
            case Slant.up:
                // n - n will always be 0, but this is needed to make the compiler happy
                yPosWithNoHOffset = this.inputs[this.n - this.n].posY
                f = -1
                break
            case Slant.down:
                yPosWithNoHOffset = this.inputs[this.n - 1].posY
                f = 1
                break
        }

        const deltaX = (y - yPosWithNoHOffset) * f
        return super.isOver(x + deltaX, y)
    }

    public override makeTooltip() {
        return tooltipContent(undefined, mods(
            div(S.Components.Passthrough.tooltip)
        ))
    }

    protected doDrawShared(g: CanvasRenderingContext2D, ctx: DrawContext, halfHeightUp: number, halfHeightDown: number) {
        const width = 3
        const left = this.posX - width / 2
        const right = left + width
        const mouseoverMargin = 4
        const [topShift, bottomShift] = this._hShift

        g.beginPath()
        g.moveTo(this.posX + topShift, this.posY - halfHeightUp)
        g.lineTo(this.posX + bottomShift, this.posY + halfHeightDown)

        if (ctx.isMouseOver) {
            g.lineWidth = width + mouseoverMargin * 2
            g.strokeStyle = COLOR_NODE_MOUSE_OVER
            g.stroke()

            g.strokeStyle = COLOR_COMPONENT_BORDER
        } else {
            g.strokeStyle = COLOR_UNKNOWN
        }

        if (this.editor.mode >= Mode.CONNECT) {
            g.lineWidth = width
            g.stroke()
        }

        for (const input of this.inputs) {
            drawWireLineToComponent(g, input, left + 2 + ((input.gridOffsetX + 1) * GRID_STEP), input.posYInParentTransform)
        }

        for (const output of this.outputs) {
            drawWireLineToComponent(g, output, right - 2 + ((output.gridOffsetX - 1) * GRID_STEP), output.posYInParentTransform)
        }
    }

    protected override makeComponentSpecificContextMenuItems(): undefined | [ContextMenuItemPlacement, ContextMenuItem][] {

        if (this.n > 1) {
            const s = S.Components.Passthrough.contextMenu

            const makeItemSetSlant = (desc: string, slant: Slant) => {
                const isCurrent = this._slant === slant
                const icon = isCurrent ? "check" : "none"
                const action = isCurrent ? () => undefined : () => this.doSetSlant(slant)
                return ContextMenuData.item(icon, desc, action)
            }

            return [
                ["mid", ContextMenuData.submenu("slanted", s.Slant, [
                    makeItemSetSlant(s.SlantNone, Slant.none),
                    ContextMenuData.sep(),
                    makeItemSetSlant(s.SlantRight, Slant.down),
                    makeItemSetSlant(s.SlantLeft, Slant.up),
                ])],
            ]
        } else {
            return undefined
        }

    }

    private doSetSlant(slant: Slant) {
        this._slant = slant
        this.updateNodeOffsets()
        this.setNeedsRedraw("slant changed")
    }

    private updateNodeOffsets() {
        const n = this.n
        switch (this._slant) {
            case "none":
                for (let i = 0; i < n; i++) {
                    this.inputs[i].gridOffsetX = -1
                    this.outputs[i].gridOffsetX = +1
                }
                this._hShift = [0, 0]
                break
            case "down": {
                const f = n > 4 ? 1 : 2
                for (let i = 0; i < n; i++) {
                    const shift = f * (n - 1 - i)
                    this.inputs[i].gridOffsetX = -1 + shift
                    this.outputs[i].gridOffsetX = +1 + shift
                }
                this._hShift = [f * (n - 0.5) * GRID_STEP, -f * GRID_STEP / 2]
                break
            }
            case "up": {
                const f = n > 4 ? 1 : 2
                for (let i = 0; i < n; i++) {
                    const shift = f * i
                    this.inputs[i].gridOffsetX = -1 + shift
                    this.outputs[i].gridOffsetX = +1 + shift
                }
                this._hShift = [-f * GRID_STEP / 2, f * (n - 0.5) * GRID_STEP]
                break
            }
        }

    }

}



export const Passthrough1Def =
    defineComponent(1, 1, t.type({
        type: t.literal("pass"),
        slant: typeOrUndefined(SlantRepr),
    }, "Passthrough1"))


export type Passthrough1Repr = typeof Passthrough1Def.reprType

export class Passthrough1 extends PassthroughBase<1, Passthrough1Repr> {

    public constructor(editor: LogicEditor, savedData: Passthrough1Repr | null) {
        super(editor, 1, savedData, {
            ins: [
                [undefined, -1, 0, "w", "In"],
            ],
            outs: [
                [undefined, +1, 0, "e", "Out"],
            ],
        })
    }

    public toJSON() {
        return {
            type: "pass" as const,
            ...this.toJSONBase(),
        }
    }

    public get unrotatedHeight() {
        return GRID_HEIGHT_1 * GRID_STEP
    }

    protected doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {
        const halfHeight = GRID_STEP
        super.doDrawShared(g, ctx, halfHeight, halfHeight)
    }

}





export const Passthrough4Def =
    defineComponent(4, 4, t.type({
        type: t.literal("pass-4"),
        slant: typeOrUndefined(SlantRepr),
    }, "Passthrough4"))


export type Passthrough4Repr = typeof Passthrough4Def.reprType

export class Passthrough4 extends PassthroughBase<4, Passthrough4Repr> {

    public constructor(editor: LogicEditor, savedData: Passthrough4Repr | null) {
        super(editor, 4, savedData, {
            ins: [
                [undefined, -1, -3, "w", "In"],
                [undefined, -1, -1, "w", "In"],
                [undefined, -1, +1, "w", "In"],
                [undefined, -1, +3, "w", "In"],
            ],
            outs: [
                [undefined, +1, -3, "e", "Out"],
                [undefined, +1, -1, "e", "Out"],
                [undefined, +1, +1, "e", "Out"],
                [undefined, +1, +3, "e", "Out"],
            ],
        })
    }

    public toJSON() {
        return {
            type: "pass-4" as const,
            ...this.toJSONBase(),
        }
    }

    public get unrotatedHeight() {
        return GRID_HEIGHT_4 * GRID_STEP
    }

    protected doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {
        const halfHeight = GRID_HEIGHT_4 * GRID_STEP / 2
        super.doDrawShared(g, ctx, halfHeight, halfHeight)
    }

}


export const Passthrough8Def =
    defineComponent(8, 8, t.type({
        type: t.literal("pass-8"),
        slant: typeOrUndefined(SlantRepr),
    }, "Passthrough8"))


export type Passthrough8Repr = typeof Passthrough8Def.reprType

export class Passthrough8 extends PassthroughBase<8, Passthrough8Repr> {

    public constructor(editor: LogicEditor, savedData: Passthrough8Repr | null) {
        super(editor, 8, savedData, {
            ins: [
                [undefined, -1, -4, "w", "In"],
                [undefined, -1, -3, "w", "In"],
                [undefined, -1, -2, "w", "In"],
                [undefined, -1, -1, "w", "In"],
                [undefined, -1, 0, "w", "In"],
                [undefined, -1, 1, "w", "In"],
                [undefined, -1, 2, "w", "In"],
                [undefined, -1, 3, "w", "In"],
            ],
            outs: [
                [undefined, +1, -4, "e", "Out"],
                [undefined, +1, -3, "e", "Out"],
                [undefined, +1, -2, "e", "Out"],
                [undefined, +1, -1, "e", "Out"],
                [undefined, +1, 0, "e", "Out"],
                [undefined, +1, 1, "e", "Out"],
                [undefined, +1, 2, "e", "Out"],
                [undefined, +1, 3, "e", "Out"],
            ],
        })
    }

    public toJSON() {
        return {
            type: "pass-8" as const,
            ...this.toJSONBase(),
        }
    }

    public get unrotatedHeight() {
        return (GRID_UPPER_HEIGHT_8 + GRID_UPPER_HEIGHT_8) * GRID_STEP
    }

    protected doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {
        super.doDrawShared(g, ctx, GRID_UPPER_HEIGHT_8 * GRID_STEP, GRID_LOWER_HEIGHT_8 * GRID_STEP)
    }

}
