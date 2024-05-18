import { HighImpedance, InteractionResult, isUnknown, LogicValue, Mode, RepeatFunction, toLogicValue, Unknown } from "../utils"
import { InternalComponent, InputInternalNodeRepr, InternalNodeGroup, OutputInternalNodeRepr } from "./InternalComponent"
import { InternalWire } from "./InternalWire"
import { InternalCalculable } from "./InternalCalculable";

export type InternalNode = InternalNodeIn | InternalNodeOut

export abstract class InternalNodeBase<N extends InternalNode> extends InternalCalculable{

    public readonly id: number
    private _isAlive = true
    private _value: LogicValue = false
    protected _initialValue: LogicValue | undefined = undefined
    protected _forceValue: LogicValue | undefined

    public constructor(
        public readonly component: InternalComponent,
        nodeSpec: InputInternalNodeRepr | OutputInternalNodeRepr,
        public readonly group: InternalNodeGroup<N> | undefined,
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
        this.parent.internalNodeMgr.addInternalNode(this.asInternalNode)
    }

    private get asInternalNode(): InternalNode {
        return this as unknown as InternalNode
    }

    public isInternalOutput(): this is InternalNodeOut {
        return InternalNode.isOutput(this.asInternalNode)
    }
    
    public get isInternalAlive() {
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

export class InternalNodeIn extends InternalNodeBase<InternalNodeIn> {

    public readonly _tag = "_vnodein"

    private _incomingInternalWire: InternalWire | null = null

    public get incomingInternalWire() {
        return this._incomingInternalWire
    }

    public set incomingInternalWire(wire: InternalWire | null) {
        this._incomingInternalWire = wire
        if (wire === null) {
            this.value = false
        } else {
            this.value = wire.startInternalNode.value
        }
    }

    public get acceptsMoreConnections() {
        return this._incomingInternalWire === null
    }

    public get isDisconnected() {
        return this._incomingInternalWire === null
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

export class InternalNodeOut extends InternalNodeBase<InternalNodeOut> {

    public readonly _tag = "_vnodeout"

    private readonly _outgoingInternalWires: InternalWire[] = []

    public get isClock() {
        return false
    }

    public addOutgoingInternalWire(wire: InternalWire) {
        // don't add the same wire twice
        const i = this._outgoingInternalWires.indexOf(wire)
        if (i === -1) {
            this._outgoingInternalWires.push(wire)
        }
    }

    public removeOutgoinInternalWire(wire: InternalWire) {
        const i = this._outgoingInternalWires.indexOf(wire)
        if (i !== -1) {
            this._outgoingInternalWires.splice(i, 1)
        }
    }

    public get outgoingInternalWires(): readonly InternalWire[] {
        return this._outgoingInternalWires
    }

    public get acceptsMoreConnections() {
        return true
    }

    public get isDisconnected() {
        return this._outgoingInternalWires.length === 0
    }

    public findWireTo(node: InternalNodeIn): InternalWire | undefined {
        return this._outgoingInternalWires.find(wire => wire.endInternalNode === node)
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
        for (const wire of this._outgoingInternalWires) {
            wire.propagateNewValue(newValue, now)
        }
    }
}

export const InternalNode = {
    isOutput(node: InternalNode): node is InternalNodeOut {
        return node._tag === "_vnodeout"
    }
}