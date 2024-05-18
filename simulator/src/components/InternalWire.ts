import { Timestamp } from "../Timeline"
import { InteractionResult, LogicValue, Mode, isArray, toLogicValueRepr, typeOrUndefined } from "../utils"
import { InternalComponent, InternalNodeGroup } from "./InternalComponent"
import { InternalCalculableParent, InternalCalculable } from "./InternalCalculable"
import { InternalNode, InternalNodeIn, InternalNodeOut } from "./InternalNode"
import {Drawable} from "./Drawable";



export class InternalWire extends InternalCalculable {

    private _startInternalNode: InternalNodeOut
    private _endInternalNode: InternalNodeIn
    private _propagatingValues: [LogicValue, Timestamp][] = []
    public customPropagationDelay: number | undefined = undefined

    public constructor(startInternalNode: InternalNodeOut, endInternalNode: InternalNodeIn) {
        const parent = startInternalNode.parent
        super(parent)

        this._startInternalNode = startInternalNode
        this._endInternalNode = endInternalNode

        const longAgo = -1 - parent.editor.options.propagationDelay // make sure it is fully propagated no matter what
        this._propagatingValues.push([startInternalNode.value, longAgo])

        this.setStartInternalNode(startInternalNode)
        this.setEndInternalNode(endInternalNode)
    }

    public get startInternalNode(): InternalNodeOut {
        return this._startInternalNode
    }

    public get endInternalNode(): InternalNodeIn {
        return this._endInternalNode
    }
    
    public setStartInternalNode(startInternalNode: InternalNodeOut, now?: Timestamp) {
        if (this._startInternalNode !== undefined) {
        }

        this._startInternalNode = startInternalNode

        if (now !== undefined) {
            this.propagateNewValue(this._startInternalNode.value, now)
        }
    }

    public setEndInternalNode(endInternalNode: InternalNodeIn) {
        if (this._endInternalNode !== undefined) {
        }
        this._endInternalNode = endInternalNode
        if (endInternalNode.incomingInternalWire !== null && endInternalNode.incomingInternalWire !== undefined) {
            console.warn(`Unexpectedly replacing existing incoming internalwire on node ${this._endInternalNode.id}`)
        }
        endInternalNode.value = this._startInternalNode.value
    }

    public propagateNewValue(newValue: LogicValue, logicalTime: Timestamp) {
        // TODO this just keeps growing for internalwires inside custom components;
        // find a way to not enqueue values over and over again
        if (this._propagatingValues[this._propagatingValues.length - 1][0] !== newValue) {
            this._propagatingValues.push([newValue, logicalTime])
        }
        const propagationDelay = this.customPropagationDelay ?? this.parent.editor.options.propagationDelay
        this.endInternalNode.value = newValue
    }

    public get isAlive() {
        // the start node should be alive and the end node
        // should either be null (internalwire being drawn) or alive
        // (internalwire set) for the internalwire to be alive
        return this.startInternalNode.isAlive && this.endInternalNode.isAlive
    }

    private prunePropagatingValues(now: Timestamp, propagationDelay: number): LogicValue {
        // first, prune obsolete values if needed
        let removeBefore = 0
        for (let i = 1; i < this._propagatingValues.length; i++) {
            if (now >= this._propagatingValues[i][1] + propagationDelay) {
                // item i has fully propagated
                removeBefore = i
            } else {
                // item i is still propagating
                break
            }
        }
        if (removeBefore > 0) {
            this._propagatingValues.splice(0, removeBefore)
        }
        return this._propagatingValues[0][0]
    }

    

}

export class InternalRibbon extends InternalCalculable {

    private _startInternalGroupStartIndex = Number.MAX_SAFE_INTEGER
    private _startInternalGroupEndIndex = Number.MIN_SAFE_INTEGER
    private _endInternalGroupStartIndex = Number.MAX_SAFE_INTEGER
    private _endInternalGroupEndIndex = Number.MIN_SAFE_INTEGER
    private _coveredInternalWires: InternalWire[] = []
    // private _startInternalNodes: InternalNodeOut[] = []
    // private _endInternalNodes: InternalNodeIn[] = []

    public constructor(parent: InternalCalculableParent,
        public readonly startInternalNodeInternalGroup: InternalNodeGroup<InternalNodeOut>,
        public readonly endInternalNodeInternalGroup: InternalNodeGroup<InternalNodeIn>,
    ) {
        super(parent)
    }

    public isEmpty() {
        return this._coveredInternalWires.length === 0
    }

    public addCoveredInternalWire(internalwire: InternalWire, newInternalNodeInternalGroupStartIndex: number, newInternalNodeInternalGroupEndIndex: number) {
        this._coveredInternalWires.push(internalwire)
        this.updateIndices(newInternalNodeInternalGroupStartIndex, newInternalNodeInternalGroupEndIndex)
    }

    private updateIndices(newInternalNodeInternalGroupStartIndex: number, newInternalNodeInternalGroupEndIndex: number) {
        this._startInternalGroupStartIndex = Math.min(this._startInternalGroupStartIndex, newInternalNodeInternalGroupStartIndex)
        this._startInternalGroupEndIndex = Math.max(this._startInternalGroupEndIndex, newInternalNodeInternalGroupStartIndex)
        this._endInternalGroupStartIndex = Math.min(this._endInternalGroupStartIndex, newInternalNodeInternalGroupEndIndex)
        this._endInternalGroupEndIndex = Math.max(this._endInternalGroupEndIndex, newInternalNodeInternalGroupEndIndex)
    }
}


export class InternalWireManager {

    public readonly parent: InternalCalculableParent
    private readonly _internalwires: InternalWire[] = []
    private readonly _internalribbons: InternalRibbon[] = []
    private _internalwireBeingAddedFrom: InternalNode | undefined = undefined

    public constructor(parent: InternalCalculableParent) {
        this.parent = parent
    }

    public get internalwires(): readonly InternalWire[] {
        return this._internalwires
    }

    public get internalribbons(): readonly InternalRibbon[] {
        return this._internalribbons
    }

    public get isAddingInternalWire() {
        return this._internalwireBeingAddedFrom !== undefined
    }

    public addInternalWire(startInternalNode: InternalNodeOut, endInternalNode: InternalNodeIn, tryOffset: boolean): InternalWire | undefined {
        if (!startInternalNode.acceptsMoreConnections || !endInternalNode.acceptsMoreConnections) {
            return undefined
        }
        const internalwire = new InternalWire(startInternalNode, endInternalNode)
        this._internalwires.push(internalwire)
        return internalwire
    }
}
