import { VirtualComponent } from "./components/VirtualComponent"
import { VirtualNode } from "./components/VirtualNode"

export type VirtualNodeMapping = Map<number, number>

export class VirtualNodeManager {

    private _lastGivenVirtualNodeID = -1
    private _usedIDs = new Set<number>()
    private _allLiveVirtualNodes: VirtualNode[] = []
    private _currentMapping: VirtualNodeMapping | undefined = undefined

    public getFreeId(): number {
        while (this._usedIDs.has(++this._lastGivenVirtualNodeID)) {
            // empty block, condition does the increment
        }
        this._usedIDs.add(this._lastGivenVirtualNodeID)
        return this._lastGivenVirtualNodeID
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
            console.error(`Loaded node with id ${sourceId}, which is already taken, with no VirtualNodeMapping being built`)
            return sourceId
        }
    }

    public addVirtualNode(node: VirtualNode) {
        if (!this._usedIDs.has(node.id)) {
            console.error(`Inserting live node with unreserved id ${node.id}`)
        }
        this._allLiveVirtualNodes[node.id] = node
    }

    public removeVirtualNode(node: VirtualNode) {
        delete this._allLiveVirtualNodes[node.id]
        this._usedIDs.delete(node.id)
    }

    public clearAll() {
        this._allLiveVirtualNodes.splice(0, this._allLiveVirtualNodes.length)
        this._usedIDs.clear()
        this._lastGivenVirtualNodeID = -1
        this._currentMapping = undefined
    }

    public findVirtualNode(id: number, mapping: VirtualNodeMapping): VirtualNode | undefined {
        const mappedId = mapping.get(id) ?? id
        return this._allLiveVirtualNodes[mappedId]
    }

    public recordMappingWhile(f: () => void): VirtualNodeMapping {
        if (this._currentMapping !== undefined) {
            console.warn("VirtualNodeManager.recordMappingWhile called while already recording a mapping")
        }
        this._currentMapping = new Map()
        f()
        const mapping = this._currentMapping
        this._currentMapping = undefined
        // console.log(`${mapping.size} node mappings were recorded`)
        return mapping
    }
}
