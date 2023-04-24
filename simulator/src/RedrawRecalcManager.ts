import { Component } from "./components/Component"
import { Drawable } from "./components/Drawable"
import { Dict, isDefined, isUndefined } from "./utils"

export class RedrawManager {

    private _canvasRedrawReasons: Dict<unknown[]> = {}
    private _isEmpty = true

    public addReason(reason: string, comp: Drawable | null) {
        const compObj = comp
        const compList = this._canvasRedrawReasons[reason]
        if (isUndefined(compList)) {
            this._canvasRedrawReasons[reason] = [compObj]
        } else {
            compList.push(compObj)
        }
        this._isEmpty = false
    }

    public getReasonsAndClear(): string | undefined {
        if (this._isEmpty) {
            return undefined
        }

        const reasonParts: string[] = []
        for (const reason of Object.keys(this._canvasRedrawReasons)) {
            reasonParts.push(reason)
            const linkedComps = this._canvasRedrawReasons[reason]!
            reasonParts.push(" (", String(linkedComps.length), "×)", ": ")
            for (const comp of linkedComps) {
                if (comp !== null) {
                    const compAny = comp as any
                    reasonParts.push(compAny.constructor?.name ?? "Component")
                    if (isDefined(compAny.type)) {
                        reasonParts.push("_", compAny.type)
                    }
                    if (isDefined(compAny.name)) {
                        reasonParts.push("('", compAny.name, "')")
                    }
                    reasonParts.push("; ")
                }
            }
            reasonParts.pop()
            reasonParts.push("\n    ")
        }
        reasonParts.pop()

        this._canvasRedrawReasons = {}
        this._isEmpty = true
        return reasonParts.join("")
    }

    public hasReasons(): boolean {
        return !this._isEmpty
    }
}

const RECALC = "recalc"
const PROPAGATE = "propagate"

type UpdateType = typeof RECALC | typeof PROPAGATE

export class RecalcManager {

    private _queue: Array<[Component, UpdateType, boolean]> = []

    public enqueueForRecalc(comp: Component, forcePropagate: boolean) {
        this._queue.push([comp, RECALC, forcePropagate])
    }

    public enqueueForPropagate(comp: Component) {
        this._queue.push([comp, PROPAGATE, false])
    }

    public recalcAndPropagateIfNeeded(): boolean {
        if (this._queue.length !== 0) {
            this.recalcAndPropagate()
            return true
        }
        return false
    }

    private recalcAndPropagate() {
        let round = 1
        do {
            const currentQueue = [...this._queue]
            // console.log(`Recalc/propagate round ${round}: ` + currentQueue.map((c) => c.toString()).join(", "))
            this._queue = []
            for (const [comp, udpateType, forcePropagate] of currentQueue) {
                switch (udpateType) {
                    case RECALC:
                        // console.log(` -> Recalc ${comp}`)
                        comp.recalcValue(forcePropagate)
                        break
                    case PROPAGATE:
                        // console.log(` -> Propagate ${comp}`)
                        comp.propagateCurrentValue()
                        break
                }
            }

            round++

            // TODO smarter circular dependency tracking
            if (round > 1000) {
                console.log("ERROR circular dependency; suspending updates after 1000 recalc/propagate rounds")
                break
            }
        } while (this._queue.length !== 0)

        // console.log(`Recalc/propagate done in ${round - 1} rounds.`)
    }

}
