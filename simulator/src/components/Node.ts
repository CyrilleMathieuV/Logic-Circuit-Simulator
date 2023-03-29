import { drawWaypoint, GRID_STEP, isOverWaypoint, NodeStyle, WAYPOINT_DIAMETER } from "../drawutils"
import { LogicEditor } from "../LogicEditor"
import { HighImpedance, InteractionResult, isDefined, isUndefined, isUnknown, LogicValue, Mode, RepeatFunction, toLogicValue, Unknown } from "../utils"
import { ComponentState, InputNodeRepr, NodeGroup, OutputNodeRepr } from "./Component"
import { DrawableWithPosition, DrawContext, Orientation } from "./Drawable"
import { Wire } from "./Wire"



// This should just be Component, but it then has some cyclic 
// type definition issue which causes problems
type NodeParent = DrawableWithPosition & { isMoving: boolean, state: ComponentState, setNeedsRecalc(): void, allowsForcedOutputs: boolean, alwaysDrawMultiOutNodes: boolean }

export type Node = NodeIn | NodeOut


export const WireColor = {
    black: "black",
    red: "red",
    blue: "blue",
    yellow: "yellow",
    green: "green",
    white: "white",
} as const

export const DEFAULT_WIRE_COLOR = WireColor.black

export type WireColor = keyof typeof WireColor

export abstract class NodeBase<N extends Node> extends DrawableWithPosition {

    public readonly id: number
    private _isAlive = true
    private _value: LogicValue = false
    protected _initialValue: LogicValue | undefined = undefined
    protected _forceValue: LogicValue | undefined
    protected _color: WireColor = DEFAULT_WIRE_COLOR

    public constructor(
        editor: LogicEditor,
        nodeSpec: InputNodeRepr | OutputNodeRepr,
        public readonly parent: NodeParent,
        public readonly group: NodeGroup<N> | undefined,
        public readonly shortName: string,
        public readonly fullName: string,
        private _gridOffsetX: number,
        private _gridOffsetY: number,
        public readonly hasTriangle: boolean,
        relativePosition: Orientation,
    ) {
        super(editor)
        this.id = nodeSpec.id
        if ("force" in nodeSpec) {
            this._forceValue = toLogicValue(nodeSpec.force)
        }
        if ("color" in nodeSpec && isDefined(nodeSpec.color)) {
            this._color = nodeSpec.color
        }
        if ("initialValue" in nodeSpec && isDefined(nodeSpec.initialValue)) {
            const initialValue = toLogicValue(nodeSpec.initialValue)
            this._initialValue = initialValue
            this._value = initialValue
        }
        this.editor.nodeMgr.addLiveNode(this.asNode)
        this.updatePositionFromParent()
        this.doSetOrient(relativePosition)
    }

    private get asNode(): Node {
        return this as unknown as Node
    }

    public get isOutput(): boolean {
        return Node.isOutput(this.asNode)
    }

    public abstract get isClock(): boolean

    public get unrotatedWidth() {
        return WAYPOINT_DIAMETER
    }

    public get unrotatedHeight() {
        return WAYPOINT_DIAMETER
    }

    public get color(): WireColor {
        return this._color
    }

    public doSetColor(color: WireColor) {
        this._color = color
        this.propagateColor(color)
        this.setNeedsRedraw("color changed")
    }

    protected propagateColor(__color: WireColor) {
        // nothing by default; overridden in NodeOut
    }

    public override isOver(x: number, y: number) {
        return this.editor.mode >= Mode.CONNECT
            && this.acceptsMoreConnections
            && isOverWaypoint(x, y, this.posX, this.posY)
    }

    public destroy() {
        this.preDestroy()
        this._isAlive = false
        this.editor.nodeMgr.removeLiveNode(this.asNode)
    }

    protected abstract preDestroy(): void

    protected forceDraw() {
        return false
    }

    protected doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {
        const mode = this.editor.mode
        if (mode < Mode.CONNECT && !this.forceDraw()) {
            return
        }

        const showForced = isDefined(this._forceValue) && mode >= Mode.FULL
        const showForcedWarning = mode >= Mode.FULL && !isUnknown(this._value) && !isUnknown(this.value) && this._value !== this.value
        const parentOrientIsVertical = Orientation.isVertical(this.parent.orient)
        const neutral = this.editor.options.hideWireColors
        drawWaypoint(g, ctx, this.posX, this.posY, this.nodeDisplayStyle, this.value, ctx.isMouseOver, neutral, showForced, showForcedWarning, parentOrientIsVertical)
    }

    protected abstract get nodeDisplayStyle(): NodeStyle

    public get isAlive() {
        return this._isAlive
    }

    public get value(): LogicValue {
        return isDefined(this._forceValue) ? this._forceValue : this._value
    }

    public set value(val: LogicValue) {
        const oldVisibleValue = this.value
        if (val !== this._value) {
            this._value = val
            this.propagateNewValueIfNecessary(oldVisibleValue)
        }
    }

    protected propagateNewValueIfNecessary(oldVisibleValue: LogicValue) {
        const newVisibleValue = this.value
        if (newVisibleValue !== oldVisibleValue) {
            this.propagateNewValue(newVisibleValue)
        }
    }

    protected abstract propagateNewValue(newValue: LogicValue): void

    public abstract get forceValue(): LogicValue | undefined

    public abstract get initialValue(): LogicValue | undefined

    public get gridOffsetX() {
        return this._gridOffsetX
    }

    public set gridOffsetX(newVal: number) {
        this._gridOffsetX = newVal
        this.updatePositionFromParent()
    }

    public get gridOffsetY() {
        return this._gridOffsetY
    }

    public set gridOffsetY(newVal: number) {
        this._gridOffsetY = newVal
        this.updatePositionFromParent()
    }

    public abstract get acceptsMoreConnections(): boolean

    public abstract get isDisconnected(): boolean

    public get posXInParentTransform() {
        return this.parent.posX + this._gridOffsetX * GRID_STEP
    }

    public get posYInParentTransform() {
        return this.parent.posY + this._gridOffsetY * GRID_STEP
    }

    public updatePositionFromParent() {
        const [appliedGridOffsetX, appliedGridOffsetY] = (() => {
            switch (this.parent.orient) {
                case "e": return [+this._gridOffsetX, +this._gridOffsetY]
                case "w": return [-this._gridOffsetX, -this._gridOffsetY]
                case "s": return [-this._gridOffsetY, +this._gridOffsetX]
                case "n": return [+this._gridOffsetY, -this._gridOffsetX]
            }
        })()
        return super.trySetPosition(
            this.parent.posX + appliedGridOffsetX * GRID_STEP,
            this.parent.posY + appliedGridOffsetY * GRID_STEP,
            false
        ) ?? [this.posX, this.posY]
    }

    public get wireProlongDirection(): Orientation {
        switch (this.parent.orient) {
            case "e":
                switch (this.orient) {
                    case "e": return "w"
                    case "w": return "e"
                    case "s": return "n"
                    case "n": return "s"
                }
                break
            case "w": return this.orient
            case "s":
                switch (this.orient) {
                    case "e": return "n"
                    case "w": return "s"
                    case "s": return "e"
                    case "n": return "w"
                }
                break
            case "n":
                switch (this.orient) {
                    case "e": return "s"
                    case "w": return "n"
                    case "s": return "w"
                    case "n": return "e"
                }
        }
    }

    public override get cursorWhenMouseover() {
        return "crosshair"
    }

    public override mouseDown(__: MouseEvent | TouchEvent) {
        this.editor.wireMgr.addNode(this.asNode)
        return { wantsDragEvents: false }
    }

    public override mouseUp(__: MouseEvent | TouchEvent) {
        const newWire = this.editor.wireMgr.addNode(this.asNode)
        if (isUndefined(newWire)) {
            return InteractionResult.NoChange
        }
        return this.tryMakeRepeatableConnection(newWire)
    }

    private tryMakeRepeatableConnection(newWire: Wire) {
        // if we just connected a group, we can repeat if there are
        // more free nodes in the group
        const startGroup = newWire.startNode.group
        const endGroup = newWire.endNode?.group
        if (isUndefined(startGroup) || isUndefined(endGroup)) {
            return InteractionResult.SimpleChange
        }

        const startNodeIndex = startGroup.indexOf(newWire.startNode)
        const endNodeIndex = endGroup.indexOf(newWire.endNode!)

        const wireMgr = this.editor.wireMgr
        const makeRepeatFunction = function makeRepeatFunction(startNodeIndex: number, endNodeIndex: number): RepeatFunction | undefined {
            if (startNodeIndex >= startGroup.nodes.length - 1 ||
                !startGroup.nodes[startNodeIndex + 1].acceptsMoreConnections ||
                endNodeIndex >= endGroup.nodes.length - 1 ||
                !endGroup.nodes[endNodeIndex + 1].acceptsMoreConnections) {
                return undefined
            }

            return () => {
                wireMgr.addNode(startGroup.nodes[startNodeIndex + 1])
                const newWire = wireMgr.addNode(endGroup.nodes[endNodeIndex + 1])
                if (isUndefined(newWire)) {
                    return undefined
                }
                return makeRepeatFunction(startNodeIndex + 1, endNodeIndex + 1)
            }

        }

        const repeat = makeRepeatFunction(startNodeIndex, endNodeIndex)
        if (isUndefined(repeat)) {
            return InteractionResult.SimpleChange
        }

        return InteractionResult.RepeatableChange(repeat)
    }

}

export class NodeIn extends NodeBase<NodeIn> {

    public readonly _tag = "_nodein"

    private _incomingWire: Wire | null = null
    public prefersSpike = false
    public isClock = false

    public get incomingWire() {
        return this._incomingWire
    }

    public set incomingWire(wire: Wire | null) {
        this._incomingWire = wire
        if (wire === null) {
            this.value = false
        } else {
            this.value = wire.startNode.value
        }
    }

    protected preDestroy() {
        if (this._incomingWire !== null) {
            this.editor.wireMgr.deleteWire(this._incomingWire)
        }
    }

    public get acceptsMoreConnections() {
        return this._incomingWire === null
    }

    public get isDisconnected() {
        return this._incomingWire === null
    }

    public get forceValue() {
        return undefined
    }

    public get initialValue() {
        return undefined
    }

    protected propagateNewValue(__newValue: LogicValue) {
        this.parent.setNeedsRecalc()
    }

    protected get nodeDisplayStyle() {
        const disconnected = this._incomingWire === null
        return disconnected ? NodeStyle.IN_DISCONNECTED : NodeStyle.IN_CONNECTED
    }

}


export class NodeOut extends NodeBase<NodeOut> {

    public readonly _tag = "_nodeout"

    private readonly _outgoingWires: Wire[] = []

    public get isClock() {
        return false
    }

    public addOutgoingWire(wire: Wire) {
        // don't add the same wire twice
        const i = this._outgoingWires.indexOf(wire)
        if (i === -1) {
            this._outgoingWires.push(wire)
        }
    }

    public removeOutgoingWire(wire: Wire) {
        const i = this._outgoingWires.indexOf(wire)
        if (i !== -1) {
            this._outgoingWires.splice(i, 1)
        }
    }

    public get outgoingWires(): readonly Wire[] {
        return this._outgoingWires
    }

    protected preDestroy() {
        // we need to make a copy of the array because the wires will remove themselves from the array
        for (const wire of [...this._outgoingWires]) {
            this.editor.wireMgr.deleteWire(wire)
        }
    }

    public get acceptsMoreConnections() {
        return true
    }

    public get isDisconnected() {
        return this._outgoingWires.length === 0
    }

    public findWireTo(node: NodeIn): Wire | undefined {
        return this._outgoingWires.find(wire => wire.endNode === node)
    }

    public get forceValue() {
        return this._forceValue
    }

    public set forceValue(newForceValue: LogicValue | undefined) {
        const oldVisibleValue = this.value
        this._forceValue = newForceValue
        this.propagateNewValueIfNecessary(oldVisibleValue)
        this.setNeedsRedraw("changed forced output value")
    }

    public get initialValue() {
        return this._initialValue
    }

    protected override propagateColor(color: WireColor) {
        for (const wire of this._outgoingWires) {
            wire.endNode?.doSetColor(color)
        }
    }

    protected propagateNewValue(newValue: LogicValue) {
        const now = this.editor.timeline.adjustedTime()
        for (const wire of this._outgoingWires) {
            wire.propageNewValue(newValue, now)
        }
    }

    protected override forceDraw() {
        return this._outgoingWires.length > 1 && this.parent.alwaysDrawMultiOutNodes
    }

    protected get nodeDisplayStyle() {
        const disconnected = this._outgoingWires.length === 0
        return disconnected ? NodeStyle.OUT_DISCONNECTED : NodeStyle.OUT_CONNECTED
    }

    public override mouseDoubleClicked(e: MouseEvent | TouchEvent) {
        if (super.mouseDoubleClicked(e)) {
            return true // already handled
        }
        if (this.editor.mode >= Mode.FULL && e.altKey && this.isOutput && this.parent.allowsForcedOutputs) {
            this.forceValue = (() => {
                switch (this._forceValue) {
                    case undefined: return Unknown
                    case Unknown: return HighImpedance
                    case HighImpedance: return false
                    case false: return true
                    case true: return undefined
                }
            })()
            return true
        }
        return false
    }

}

export const Node = {
    isOutput(node: Node): node is NodeOut {
        return node._tag === "_nodeout"
    },
}
