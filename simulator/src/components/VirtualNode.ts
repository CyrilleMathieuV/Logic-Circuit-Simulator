import { HighImpedance, InteractionResult, isUnknown, LogicValue, Mode, RepeatFunction, toLogicValue, Unknown } from "../utils"
import { VirtualComponent, InputVirtualNodeRepr, VirtualNodeGroup, OutputVirtualNodeRepr } from "./VirtualComponent"
import { VirtualWire } from "./VirtualWire"
import { VirtualCalculable } from "./VirtualCalculable";

export type VirtualNode = VirtualNodeIn | VirtualNodeOut

export abstract class VirtualNodeBase<N extends VirtualNode> extends VirtualCalculable{

    public readonly id: number
    private _isAlive = true
    private _value: LogicValue = false
    protected _initialValue: LogicValue | undefined = undefined
    protected _forceValue: LogicValue | undefined

    public constructor(
        public readonly component: VirtualComponent,
        nodeSpec: InputVirtualNodeRepr | OutputVirtualNodeRepr,
        public readonly group: VirtualNodeGroup<N> | undefined,
        public readonly shortName: string,
        public readonly fullName: string,
    ) {
        super(component.parent)
        this.id = nodeSpec.id
        if ("force" in nodeSpec) {
            this._forceValue = toLogicValue(nodeSpec.force)
        }
        if ("initialValue" in nodeSpec && nodeSpec.initialValue !== undefined) {
            const initialValue = toLogicValue(nodeSpec.initialValue)
            this._initialValue = initialValue
            this._value = initialValue
        }
        this.parent.virtualNodeMgr.addVirtualNode(this.asVirtualNode)
    }

    private get asVirtualNode(): VirtualNode {
        return this as unknown as VirtualNode
    }

    public isVirtualOutput(): this is VirtualNodeOut {
        return VirtualNode.isOutput(this.asVirtualNode)
    }
    
    public get isVirtualAlive() {
        return this._isAlive
    }

    public get value(): LogicValue {
        return this._forceValue !== undefined ? this._forceValue : this._value
    }

    public set value(val: LogicValue) {
        const oldVisibleValue = this.value
        if (val !== this._value) {
            this._value = val
            this.propagateNewValueIfNecessary(oldVisibleValue)
        }
    }

    public get isAlive() {
        return this._isAlive
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

    public abstract get acceptsMoreConnections(): boolean

    public abstract get isDisconnected(): boolean
}

export class VirtualNodeIn extends VirtualNodeBase<VirtualNodeIn> {

    public readonly _tag = "_vnodein"

    private _incomingVirtualWire: VirtualWire | null = null

    public get incomingVirtualWire() {
        return this._incomingVirtualWire
    }

    public set incomingVirtualWire(wire: VirtualWire | null) {
        this._incomingVirtualWire = wire
        if (wire === null) {
            this.value = false
        } else {
            this.value = wire.startVirtualNode.value
        }
    }

    public get acceptsMoreConnections() {
        return this._incomingVirtualWire === null
    }

    public get isDisconnected() {
        return this._incomingVirtualWire === null
    }

    public get forceValue() {
        return undefined
    }

    public get initialValue() {
        return undefined
    }

    protected propagateNewValue(__newValue: LogicValue) {
        this.component.setNeedsRecalc()
    }

}

export class VirtualNodeOut extends VirtualNodeBase<VirtualNodeOut> {

    public readonly _tag = "_vnodeout"

    private readonly _outgoingVirtualWires: VirtualWire[] = []

    public get isClock() {
        return false
    }

    public addOutgoingVirtualWire(wire: VirtualWire) {
        // don't add the same wire twice
        const i = this._outgoingVirtualWires.indexOf(wire)
        if (i === -1) {
            this._outgoingVirtualWires.push(wire)
        }
    }

    public removeOutgoinVirtualWire(wire: VirtualWire) {
        const i = this._outgoingVirtualWires.indexOf(wire)
        if (i !== -1) {
            this._outgoingVirtualWires.splice(i, 1)
        }
    }

    public get outgoingVirtualWires(): readonly VirtualWire[] {
        return this._outgoingVirtualWires
    }

    public get acceptsMoreConnections() {
        return true
    }

    public get isDisconnected() {
        return this._outgoingVirtualWires.length === 0
    }

    public findWireTo(node: VirtualNodeIn): VirtualWire | undefined {
        return this._outgoingVirtualWires.find(wire => wire.endVirtualNode === node)
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

    protected propagateNewValue(newValue: LogicValue) {
        const now = this.parent.editor.timeline.logicalTime()
        for (const wire of this._outgoingVirtualWires) {
            wire.propagateNewValue(newValue, now)
        }
    }
}

export const VirtualNode = {
    isOutput(node: VirtualNode): node is VirtualNodeOut {
        return node._tag === "_vnodeout"
    }
}