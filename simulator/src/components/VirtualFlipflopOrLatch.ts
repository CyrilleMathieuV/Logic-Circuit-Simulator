import {
    ArrayClampOrPad,
    ArrayFillWith, deepEquals,
    EdgeTrigger, HighImpedance,
    isHighImpedance,
    isUnknown,
    LogicValue, LogicValueRepr, toLogicValue,
    typeOrUndefined,
    Unknown,
} from "../utils"

export type VirtualFlipflopOrLatchValue = [LogicValue, LogicValue]

export abstract class VirtualFlipflopOrLatch {
    public outputQ: LogicValue
    public outputQ̅: LogicValue

    protected _isInInvalidState = false

    protected constructor() {
        this.outputQ = false
        this.outputQ̅ = true
    }

    public propagateVirtualValue(newValue: VirtualFlipflopOrLatchValue) {
        this.outputQ = newValue[0]
        this.outputQ̅ = newValue[1]
    }

    public getVirtualOutputsValue() : VirtualFlipflopOrLatchValue {
        return [this.outputQ, this.outputQ̅ ]
    }
}

export interface VirtualSyncComponent<State> {
    trigger: EdgeTrigger
    value: State
    makeVirtualInvalidState(): State
    makeVirtualStateFromMainValue(val: LogicValue): State
    makeVirtualStateAfterClock(): State
}
export abstract class VirtualFlipflop extends VirtualFlipflopOrLatch implements VirtualSyncComponent<VirtualFlipflopOrLatchValue> {
    public inputD: LogicValue

    public inputClock: LogicValue

    public inputClr: LogicValue
    public inputPre: LogicValue

    public value: VirtualFlipflopOrLatchValue

    public _lastClock: LogicValue = Unknown
    public readonly trigger: EdgeTrigger

    protected constructor(trigger: EdgeTrigger) {
        super()
        this.trigger = trigger
        this.value = super.getVirtualOutputsValue()
        this.inputD = false

        this.inputClock = false

        this.inputClr = false
        this.inputPre = false
    }

    public static doRecalcVirtualValueForVirtualSyncComponent<State>(comp: VirtualSyncComponent<State>, prevClock: LogicValue, clock: LogicValue, preset: LogicValue, clear: LogicValue): { isInInvalidState: boolean, newState: State } {
        // handle set and reset signals
        if (preset === true) {
            if (clear === true) {
                return { isInInvalidState: true, newState: comp.makeVirtualInvalidState() }
            } else {
                // preset is true, clear is false, set output to 1
                return { isInInvalidState: false, newState: comp.makeVirtualStateFromMainValue(true) }
            }
        }
        if (clear === true) {
            // clear is true, preset is false, set output to 0
            return { isInInvalidState: false, newState: comp.makeVirtualStateFromMainValue(false) }
        }

        // handle normal operation
        if (!VirtualFlipflop.isVirtualClockTrigger(comp.trigger, prevClock, clock)) {
            return { isInInvalidState: false, newState: comp.value }
        } else {
/*
            if (prevClock) {
                if (!clock) {
                    console.log("Falling")
                    console.log("! ", comp.value)
                }
            }
            if (clock) {
                if (prevClock) {
                    console.log("Rising")
                    console.log("* ", comp.value)
                }
            }
*/
            return { isInInvalidState: false, newState: comp.makeVirtualStateAfterClock() }
        }
    }

    public static isVirtualClockTrigger(trigger: EdgeTrigger, prevClock: LogicValue, clock: LogicValue): boolean {
        return (trigger === EdgeTrigger.rising && prevClock === false && clock === true)
            || (trigger === EdgeTrigger.falling && prevClock === true && clock === false)
    }

    public doRecalcVirtualValue(): VirtualFlipflopOrLatchValue {
        const prevClock = this._lastClock
        const clock = this._lastClock = this.inputClock
        const { isInInvalidState, newState } =
            VirtualFlipflop.doRecalcVirtualValueForVirtualSyncComponent(this, prevClock, clock, this.inputPre, this.inputClr)
        this._isInInvalidState = isInInvalidState
        return newState
    }

    public doSetVirtualValue(newValue: VirtualFlipflopOrLatchValue, forcePropagate = false) {
        const oldValue = this.value
        if (forcePropagate || !deepEquals(newValue, oldValue)) {
            this.value = newValue
            //this.setNeedsPropagate()
            this.propagateVirtualValue(newValue)
        }
    }

    public recalcVirtualValue() {
        this.doSetVirtualValue(this.doRecalcVirtualValue(), false)
    }

    public makeVirtualInvalidState(): VirtualFlipflopOrLatchValue {
        return [false, false]
    }

    public makeVirtualStateFromMainValue(val: LogicValue): VirtualFlipflopOrLatchValue {
        return [val, LogicValue.invert(val)]
    }

    public makeVirtualStateAfterClock(): VirtualFlipflopOrLatchValue {
        //return this.makeVirtualStateFromMainValue(LogicValue.filterHighZ(this.doRecalcValueAfterClock()))
        return this.makeVirtualStateFromMainValue(this.doRecalcValueAfterClock())
    }

    public abstract doRecalcValueAfterClock(): LogicValue

    public getVirtualInputValue(input : LogicValue): LogicValue {
        return input
    }

    public static setVirtualInputValue(input : LogicValue, value: LogicValue) {
        input = value
    }

    public doRecalcVirtualValueIntoDoRecalcValue() {
        const prevClock = this._lastClock
        const clock = this._lastClock = this.inputClock
        const { isInInvalidState, newState } =
            VirtualFlipflop.doRecalcVirtualValueForVirtualSyncComponent(this, prevClock, clock, this.inputPre, this.inputClr)
        this._isInInvalidState = isInInvalidState
        this.propagateVirtualValue(newState)
    }
}
