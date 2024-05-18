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

export type InternalFlipflopOrLatchValue = [LogicValue, LogicValue]

export abstract class InternalFlipflopOrLatch {
    public outputQ: LogicValue
    public outputQ̅: LogicValue

    protected _isInInvalidState = false

    protected constructor() {
        this.outputQ = false
        this.outputQ̅ = true
    }

    public propagateInternalValue(newValue: InternalFlipflopOrLatchValue) {
        this.outputQ = newValue[0]
        this.outputQ̅ = newValue[1]
    }

    public getInternalOutputsValue() : InternalFlipflopOrLatchValue {
        return [this.outputQ, this.outputQ̅ ]
    }
}

export interface InternalSyncComponent<State> {
    trigger: EdgeTrigger
    value: State
    makeInternalInvalidState(): State
    makeInternalStateFromMainValue(val: LogicValue): State
    makeInternalStateAfterClock(): State
}
export abstract class InternalFlipflop extends InternalFlipflopOrLatch implements InternalSyncComponent<InternalFlipflopOrLatchValue> {
    public inputD: LogicValue

    public inputClock: LogicValue

    public inputClr: LogicValue
    public inputPre: LogicValue

    public value: InternalFlipflopOrLatchValue

    public _lastClock: LogicValue = Unknown
    public readonly trigger: EdgeTrigger

    protected constructor(trigger: EdgeTrigger) {
        super()
        this.trigger = trigger
        this.value = super.getInternalOutputsValue()
        this.inputD = false

        this.inputClock = false

        this.inputClr = false
        this.inputPre = false
    }

    public static doRecalcInternalValueForInternalSyncComponent<State>(comp: InternalSyncComponent<State>, prevClock: LogicValue, clock: LogicValue, preset: LogicValue, clear: LogicValue): { isInInvalidState: boolean, newState: State } {
        // handle set and reset signals
        if (preset === true) {
            if (clear === true) {
                return { isInInvalidState: true, newState: comp.makeInternalInvalidState() }
            } else {
                // preset is true, clear is false, set output to 1
                return { isInInvalidState: false, newState: comp.makeInternalStateFromMainValue(true) }
            }
        }
        if (clear === true) {
            // clear is true, preset is false, set output to 0
            return { isInInvalidState: false, newState: comp.makeInternalStateFromMainValue(false) }
        }

        // handle normal operation
        if (!InternalFlipflop.isInternalClockTrigger(comp.trigger, prevClock, clock)) {
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
            return { isInInvalidState: false, newState: comp.makeInternalStateAfterClock() }
        }
    }

    public static isInternalClockTrigger(trigger: EdgeTrigger, prevClock: LogicValue, clock: LogicValue): boolean {
        return (trigger === EdgeTrigger.rising && prevClock === false && clock === true)
            || (trigger === EdgeTrigger.falling && prevClock === true && clock === false)
    }

    public doRecalcInternalValue(): InternalFlipflopOrLatchValue {
        const prevClock = this._lastClock
        const clock = this._lastClock = this.inputClock
        const { isInInvalidState, newState } =
            InternalFlipflop.doRecalcInternalValueForInternalSyncComponent(this, prevClock, clock, this.inputPre, this.inputClr)
        this._isInInvalidState = isInInvalidState
        return newState
    }

    public doSetInternalValue(newValue: InternalFlipflopOrLatchValue, forcePropagate = false) {
        const oldValue = this.value
        if (forcePropagate || !deepEquals(newValue, oldValue)) {
            this.value = newValue
            //this.setNeedsPropagate()
            this.propagateInternalValue(newValue)
        }
    }

    public recalcInternalValue() {
        this.doSetInternalValue(this.doRecalcInternalValue(), false)
    }

    public makeInternalInvalidState(): InternalFlipflopOrLatchValue {
        return [false, false]
    }

    public makeInternalStateFromMainValue(val: LogicValue): InternalFlipflopOrLatchValue {
        return [val, LogicValue.invert(val)]
    }

    public makeInternalStateAfterClock(): InternalFlipflopOrLatchValue {
        //return this.makeInternalStateFromMainValue(LogicValue.filterHighZ(this.doRecalcValueAfterClock()))
        return this.makeInternalStateFromMainValue(this.doRecalcValueAfterClock())
    }

    public abstract doRecalcValueAfterClock(): LogicValue

    public getInternalInputValue(input : LogicValue): LogicValue {
        return input
    }

    public static setInternalInputValue(input : LogicValue, value: LogicValue) {
        input = value
    }

    public doRecalcInternalValueIntoDoRecalcValue() {
        const prevClock = this._lastClock
        const clock = this._lastClock = this.inputClock
        const { isInInvalidState, newState } =
            InternalFlipflop.doRecalcInternalValueForInternalSyncComponent(this, prevClock, clock, this.inputPre, this.inputClr)
        this._isInInvalidState = isInInvalidState
        this.propagateInternalValue(newState)
    }
}
