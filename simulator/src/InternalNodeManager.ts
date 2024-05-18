import { InternalComponent } from "./components/InternalComponent"
import { InternalNode } from "./components/InternalNode"

export type InternalNodeMapping = Map<number, number>

export class InternalNodeManager {

    private _lastGivenInternalNodeID = -1
    private _usedIDs = new Set<number>()
    private _allLiveInternalNodes: InternalNode[] = []
    private _currentMapping: InternalNodeMapping | undefined = undefined

    public getFreeId(): number {
        while (this._usedIDs.has(++this._lastGivenInternalNodeID)) {
            // empty block, condition does the increment
        }
        this._usedIDs.add(this._lastGivenInternalNodeID)
        return this._lastGivenInternalNodeID
    }

    public getFreeIdFrom(sourceId: number): number {
        if (!this._usedIDs.has(sourceId)) {
            this._usedIDs.add(sourceId)
            return sourceId
        }

        if (this._currentMapping !== undefined) {
            const newId = this.getFreeId()
            this._currentMapping.set(sourceId, newId)
            return newId
        } else {
            console.error(`Loaded node with id ${sourceId}, which is already taken, with no InternalNodeMapping being built`)
            return sourceId
        }
    }

    public addInternalNode(node: InternalNode) {
        if (!this._usedIDs.has(node.id)) {
            console.error(`Inserting live node with unreserved id ${node.id}`)
        }
        this._allLiveInternalNodes[node.id] = node
    }

    public removeInternalNode(node: InternalNode) {
        delete this._allLiveInternalNodes[node.id]
        this._usedIDs.delete(node.id)
    }

    public clearAll() {
        this._allLiveInternalNodes.splice(0, this._allLiveInternalNodes.length)
        this._usedIDs.clear()
        this._lastGivenInternalNodeID = -1
        this._currentMapping = undefined
    }

    public findInternalNode(id: number, mapping: InternalNodeMapping): InternalNode | undefined {
        const mappedId = mapping.get(id) ?? id
        return this._allLiveInternalNodes[mappedId]
    }

    public recordMappingWhile(f: () => void): InternalNodeMapping {
        if (this._currentMapping !== undefined) {
            console.warn("InternalNodeManager.recordMappingWhile called while already recording a mapping")
        }
        this._currentMapping = new Map()
        f()
        const mapping = this._currentMapping
        this._currentMapping = undefined
        // console.log(`${mapping.size} node mappings were recorded`)
        return mapping
    }
}
