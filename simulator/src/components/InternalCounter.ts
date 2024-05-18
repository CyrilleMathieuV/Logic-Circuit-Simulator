import * as t from "io-ts"
import { COLOR_EMPTY, COLOR_LABEL_OFF, displayValuesFromArray, formatWithRadix, useCompact } from "../drawutils"
import {
    ArrayFillWith,
    EdgeTrigger,
    LogicValue,
    Unknown,
    isUnknown,
    typeOrNull,
    typeOrUndefined,
    deepEquals,
} from "../utils"
import {InternalFlipflop} from "./InternalFlipflopOrLatch";
import {Counter} from "./Counter";
import {InternalRegisterBaseValue} from "./InternalRegister";

export class InternalCounter {
    public outputsQ: LogicValue[]
    public outputV: LogicValue

    public inputClr : LogicValue
    public inputClock : LogicValue

    public value : [LogicValue[], LogicValue]

    public readonly numBits: number
    public readonly trigger: EdgeTrigger
    private _lastClock: LogicValue = Unknown
    private _displayRadix: number

    public constructor(numBits: number, trigger: EdgeTrigger, displayRadix: number) {
        this.numBits = numBits

        this.outputsQ = ArrayFillWith(false, this.numBits)
        this.outputV = false

        this.trigger = trigger
        this._displayRadix = displayRadix

        this.inputClr = false
        this.inputClock = false

        this.value = [this.outputsQ, this.outputV]
    }
/*
    public get trigger() {
        return this._trigger
    }
/*

 */
/*
    public static emptyInternalValue(numBits: number) {
        return [ArrayFillWith(false, numBits), false] as const
    }
    */
    public doRecalcInternalValue(): [LogicValue[], LogicValue] {
        const clear = this.inputClr
        if (clear === true) {
            return [ArrayFillWith(false, this.numBits), false]
        }

        const prevClock = this._lastClock
        const clock = this._lastClock = this.inputClock
        const activeOverflowValue = this.trigger === EdgeTrigger.rising ? true : false

        if (this.isInternalClockTrigger(prevClock, clock)) {
            const [__, value] = displayValuesFromArray(this.value[0], false)
            if (isUnknown(value)) {
                return [ArrayFillWith(Unknown, this.numBits), Unknown]
            }
            const newValue = value + 1
            if (newValue >= Math.pow(2, this.numBits)) {
                return [ArrayFillWith(false, this.numBits), activeOverflowValue]
            }

            return [Counter.decimalToNBits(newValue, this.numBits), !activeOverflowValue]

        } else {
            return [this.value[0], !activeOverflowValue]
        }
    }

    protected propagateInternalValue(newValue: readonly [LogicValue[], LogicValue]) {
        const [counter, overflow] = newValue
        this.outputsQ = counter
        this.outputV = overflow
    }

    public doSetInternalValue(newValue: [LogicValue[], LogicValue], forcePropagate = false) {
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

    public isInternalClockTrigger(prevClock: LogicValue, clock: LogicValue): boolean {
        return (this.trigger === EdgeTrigger.rising && prevClock === false && clock === true)
            || (this.trigger === EdgeTrigger.falling && prevClock === true && clock === false)
    }
/*
    protected doSetTrigger(trigger: EdgeTrigger) {
        this._trigger = trigger
    }
 */
}

