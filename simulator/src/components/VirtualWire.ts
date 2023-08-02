import { Timestamp } from "../Timeline"
import { InteractionResult, LogicValue, Mode, isArray, toLogicValueRepr, typeOrUndefined } from "../utils"
import { VirtualComponent, VirtualNodeGroup } from "./VirtualComponent"
import { VirtualCalculableParent, VirtualCalculable } from "./VirtualCalculable"
import { VirtualNode, VirtualNodeIn, VirtualNodeOut } from "./VirtualNode"
import {Drawable} from "./Drawable";



export class VirtualWire extends VirtualCalculable {

    private _startVirtualNode: VirtualNodeOut
    private _endVirtualNode: VirtualNodeIn
    private _propagatingValues: [LogicValue, Timestamp][] = []
    public customPropagationDelay: number | undefined = undefined

    public constructor(startVirtualNode: VirtualNodeOut, endVirtualNode: VirtualNodeIn) {
        const parent = startVirtualNode.parent
        super(parent)

        this._startVirtualNode = startVirtualNode
        this._endVirtualNode = endVirtualNode

        const longAgo = -1 - parent.editor.options.propagationDelay // make sure it is fully propagated no matter what
        this._propagatingValues.push([startVirtualNode.value, longAgo])

        this.setStartVirtualNode(startVirtualNode)
        this.setEndVirtualNode(endVirtualNode)
    }

    public get startVirtualNode(): VirtualNodeOut {
        return this._startVirtualNode
    }

    public get endVirtualNode(): VirtualNodeIn {
        return this._endVirtualNode
    }
    
    public setStartVirtualNode(startVirtualNode: VirtualNodeOut, now?: Timestamp) {
        if (this._startVirtualNode !== undefined) {
        }

        this._startVirtualNode = startVirtualNode

        if (now !== undefined) {
            this.propagateNewValue(this._startVirtualNode.value, now)
        }
    }

    public setEndVirtualNode(endVirtualNode: VirtualNodeIn) {
        if (this._endVirtualNode !== undefined) {
        }
        this._endVirtualNode = endVirtualNode
        if (endVirtualNode.incomingVirtualWire !== null && endVirtualNode.incomingVirtualWire !== undefined) {
            console.warn(`Unexpectedly replacing existing incoming virtualwire on node ${this._endVirtualNode.id}`)
        }
        endVirtualNode.value = this._startVirtualNode.value
    }

    public propagateNewValue(newValue: LogicValue, logicalTime: Timestamp) {
        // TODO this just keeps growing for virtualwires inside custom components;
        // find a way to not enqueue values over and over again
        if (this._propagatingValues[this._propagatingValues.length - 1][0] !== newValue) {
            this._propagatingValues.push([newValue, logicalTime])
        }
        const propagationDelay = this.customPropagationDelay ?? this.parent.editor.options.propagationDelay
        this.endVirtualNode.value = newValue
    }

    public get isAlive() {
        // the start node should be alive and the end node
        // should either be null (virtualwire being drawn) or alive
        // (virtualwire set) for the virtualwire to be alive
        return this.startVirtualNode.isAlive && this.endVirtualNode.isAlive
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

export class VirtualRibbon extends VirtualCalculable {

    private _startVirtualGroupStartIndex = Number.MAX_SAFE_INTEGER
    private _startVirtualGroupEndIndex = Number.MIN_SAFE_INTEGER
    private _endVirtualGroupStartIndex = Number.MAX_SAFE_INTEGER
    private _endVirtualGroupEndIndex = Number.MIN_SAFE_INTEGER
    private _coveredVirtualWires: VirtualWire[] = []
    // private _startVirtualNodes: VirtualNodeOut[] = []
    // private _endVirtualNodes: VirtualNodeIn[] = []

    public constructor(parent: VirtualCalculableParent,
        public readonly startVirtualNodeVirtualGroup: VirtualNodeGroup<VirtualNodeOut>,
        public readonly endVirtualNodeVirtualGroup: VirtualNodeGroup<VirtualNodeIn>,
    ) {
        super(parent)
    }

    public isEmpty() {
        return this._coveredVirtualWires.length === 0
    }

    public addCoveredVirtualWire(virtualwire: VirtualWire, newVirtualNodeVirtualGroupStartIndex: number, newVirtualNodeVirtualGroupEndIndex: number) {
        this._coveredVirtualWires.push(virtualwire)
        this.updateIndices(newVirtualNodeVirtualGroupStartIndex, newVirtualNodeVirtualGroupEndIndex)
    }

    private updateIndices(newVirtualNodeVirtualGroupStartIndex: number, newVirtualNodeVirtualGroupEndIndex: number) {
        this._startVirtualGroupStartIndex = Math.min(this._startVirtualGroupStartIndex, newVirtualNodeVirtualGroupStartIndex)
        this._startVirtualGroupEndIndex = Math.max(this._startVirtualGroupEndIndex, newVirtualNodeVirtualGroupStartIndex)
        this._endVirtualGroupStartIndex = Math.min(this._endVirtualGroupStartIndex, newVirtualNodeVirtualGroupEndIndex)
        this._endVirtualGroupEndIndex = Math.max(this._endVirtualGroupEndIndex, newVirtualNodeVirtualGroupEndIndex)
    }
}


export class VirtualWireManager {

    public readonly parent: VirtualCalculableParent
    private readonly _virtualwires: VirtualWire[] = []
    private readonly _virtualribbons: VirtualRibbon[] = []
    private _virtualwireBeingAddedFrom: VirtualNode | undefined = undefined

    public constructor(parent: VirtualCalculableParent) {
        this.parent = parent
    }

    public get virtualwires(): readonly VirtualWire[] {
        return this._virtualwires
    }

    public get virtualribbons(): readonly VirtualRibbon[] {
        return this._virtualribbons
    }

    public get isAddingVirtualWire() {
        return this._virtualwireBeingAddedFrom !== undefined
    }

    public addVirtualWire(startVirtualNode: VirtualNodeOut, endVirtualNode: VirtualNodeIn, tryOffset: boolean): VirtualWire | undefined {
        if (!startVirtualNode.acceptsMoreConnections || !endVirtualNode.acceptsMoreConnections) {
            return undefined
        }
        const virtualwire = new VirtualWire(startVirtualNode, endVirtualNode)
        this._virtualwires.push(virtualwire)
        return virtualwire
    }
}
