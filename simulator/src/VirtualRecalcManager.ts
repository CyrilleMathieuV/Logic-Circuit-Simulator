import { VirtualComponent } from "./components/VirtualComponent"

export class VirtualRecalcManager {

    private _propagateQueueVirtual: Array<VirtualComponent> = []
    private _recalcQueueVirtual: Array<[VirtualComponent, boolean]> = []
    public debug = false

    public enqueueForPropagateVirtual(virtcomp: VirtualComponent) {
        this._propagateQueueVirtual.push(virtcomp)
        this.log("Enqueued for propagate: " + virtcomp)
    }

    public enqueueForRecalcVirtual(virtcomp: VirtualComponent, forcePropagate: boolean) {
        this._recalcQueueVirtual.push([virtcomp, forcePropagate])
        this.log("Enqueued for recalc: " + virtcomp)
    }

    public queueVirtualIsEmpty(): boolean {
        return this._propagateQueueVirtual.length === 0 && this._recalcQueueVirtual.length === 0
    }

    public recalcAndPropagateIfNeeded(): boolean {
        if (this.queueVirtualIsEmpty()) {
            return false
        }
        this.recalcAndPropagate()
        return true
    }

    private recalcAndPropagate() {
        // We proceed as follows: first, we propagate (from input nodes to components)
        // all pending values. This marks some components as needing recalc, probably, and
        // doing all propagation beforehand allows to wait with recalc until all values are
        // propagated. Then, we recalc all components that need it, and then we loop until
        // no new propagation/recalc is needed. We may need several loops if propagation
        // times are set to 0, and we break out of the loop after a certain number of rounds
        // to avoid infinite loops (e.g., a NOT gate looping back to itself)

        let round = 0
        const roundLimit = 1000
        do {
            round++
            if (round >= roundLimit) {
                console.warn(`ERROR: Circular dependency; suspending updates after ${roundLimit} recalc/propagate rounds`)
                this._propagateQueueVirtual = []
                this._recalcQueueVirtual = []
                break
            }

            this.log(`Recalc/propagate round ${round}: ${this._propagateQueueVirtual.length} propagate, ${this._recalcQueueVirtual.length} recalc.`)

            const propagateQueue = this._propagateQueueVirtual
            this._propagateQueueVirtual = []
            this.log(`  PROPAG (${propagateQueue.length}) – ` + propagateQueue.map((c) => c.toString()).join("; "))
            for (const virtcomp of propagateQueue) {
                try {
                    virtcomp.propagateCurrentValue()
                } catch (e) {
                    console.error("Error while propagating value of " + virtcomp, e)
                }
            }

            const recalcQueue = this._recalcQueueVirtual
            this._recalcQueueVirtual = []
            this.log(`  RECALC (${recalcQueue.length}) – ` + recalcQueue.map((c) => c.toString()).join("; "))
            for (const [virtcomp, forcePropagate] of recalcQueue) {
                try {
                    virtcomp.recalcVirtualValue(forcePropagate)
                } catch (e) {
                    console.error("Error while recalculating value of " + virtcomp, e)
                }
            }

        } while (!this.queueVirtualIsEmpty())

        this.log(`Recalc/propagate done in ${round} rounds.`)
    }

    private log(msg: string) {
        if (this.debug) {
            console.log(msg)
        }
    }

}
