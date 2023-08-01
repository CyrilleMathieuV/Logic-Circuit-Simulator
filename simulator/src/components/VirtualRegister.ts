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
import {Counter} from "./Counter";
import {VirtualFlipflop,VirtualSyncComponent} from "./VirtualFlipflopOrLatch";

export type VirtualRegisterBaseValue = LogicValue[]

export abstract class VirtualRegisterBase {
    public readonly numBits : number

    public inputClock: LogicValue

    public inputClr: LogicValue
    public inputPre: LogicValue

    public outputsQ: LogicValue[]

    public readonly trigger: EdgeTrigger

    protected _isInInvalidState = false
    protected _lastClock: LogicValue = Unknown

    //private _isShift: LogicValue
    //private _isCounter: LogicValue

    public constructor(numBits: number, trigger: EdgeTrigger) {
        this.numBits = numBits

        this.inputClock = false

        this.inputClr = false
        this.inputPre = false

        this.outputsQ = ArrayFillWith(false, this.numBits)

        this.trigger = trigger

        this._lastClock = false
    }

    public makeVirtualInvalidState(): LogicValue[] {
        return ArrayFillWith(false, this.numBits)
    }

    public makeVirtualStateFromMainValue(val: LogicValue): LogicValue[] {
        return ArrayFillWith(val, this.numBits)
    }

    public abstract makeVirtualStateAfterClock(): LogicValue[]

    public virtualOutputs() : LogicValue[] {
        return this.outputsQ
    }

    protected propagateVirtualValue(newValue: VirtualRegisterBaseValue) {
        this.outputsQ = newValue
    }
}
/*
    protected getOutputVirtualValues(output: readonly LogicValue[]): LogicValue[] {
        return output.map(node => output.value)
    }
*/
export class VirtualRegister extends VirtualRegisterBase implements VirtualSyncComponent<VirtualRegisterBaseValue>{
    public inputsD: LogicValue[]

    public inputInc: LogicValue
    public inputDec: LogicValue

    public value: VirtualRegisterBaseValue

    private _saturating: LogicValue

    //_isShift: LogicValue
    //_isCounter: LogicValue

    public constructor(numBits: number, trigger: EdgeTrigger) {
        super(numBits, trigger)
        this.value = super.virtualOutputs()
        this.inputInc = false
        this.inputDec = false
        this._saturating = false
        this.inputsD = ArrayFillWith(false, this.numBits)

        //extension to all Registers
        //this._isShift = isShifted
        //this._isCounter = isCounter
    }

    public getVirtualValueFromArray(values: readonly LogicValue[]): number | Unknown {
        // lowest significant bit is the first bit
        let binaryStringRep = ""
        let hasUnset = false
        const add: (v: any) => void = false
            ? v => binaryStringRep = binaryStringRep + v
            : v => binaryStringRep = v + binaryStringRep

        for (const value of values) {
            if (isUnknown(value) || isHighImpedance(value)) {
                hasUnset = true
                add(value)
            } else {
                add(+value)
            }
        }
        const value = hasUnset ? Unknown : parseInt(binaryStringRep, 2)
        return value
    }

    public makeVirtualStateAfterClock(): LogicValue[] {
        const inc = this.inputInc ?? false
        const dec = this.inputDec ?? false
        if (isUnknown(inc) || isUnknown(dec) || isHighImpedance(inc) || isHighImpedance(dec)) {
            return ArrayFillWith(false, this.numBits)
        }
        if (inc || dec) {
            if (inc && dec) {
                // no change
                return (this.numBits > 1) ? this.inputsD : [this.inputsD[0], this.inputsD[0]]
            }

            // inc or dec
            const val = this.getVirtualValueFromArray(this.inputsD)
            if (isUnknown(val)) {
                return ArrayFillWith(Unknown, this.numBits)
            }

            let newVal: number
            if (inc) {
                // increment
                newVal = val + 1
                if (newVal >= 2 ** this.numBits) {
                    return ArrayFillWith(false, this.numBits)
                }
            } else {
                // decrement
                newVal = val - 1
                if (newVal < 0) {
                    if (this._saturating) {
                        return ArrayFillWith(false, this.numBits)
                    }
                    return ArrayFillWith(true, this.numBits)
                }
            }
            return Counter.decimalToNBits(newVal, this.numBits)
        }

        // else, just a regular load from D
        return this.inputsD.map(LogicValue.filterHighZ)
    }

    public doRecalcVirtualValue(): LogicValue[] {
        const prevClock = this._lastClock
        const clock = this._lastClock = this.inputClock
        const { isInInvalidState, newState } =
            VirtualFlipflop.doRecalcVirtualValueForVirtualSyncComponent(this, prevClock, clock, this.inputPre, this.inputClr)
        this._isInInvalidState = isInInvalidState
        return newState
    }

    public doSetVirtualValue(newValue: VirtualRegisterBaseValue, forcePropagate = false) {
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

    public isVirtualClockTrigger(prevClock: LogicValue, clock: LogicValue): boolean {
        return (this.trigger === EdgeTrigger.rising && prevClock === false && clock === true)
            || (this.trigger === EdgeTrigger.falling && prevClock === true && clock === false)
    }

    public getInputValue(input : LogicValue): LogicValue {
        return input
    }

    public static setInputValue(input : LogicValue, value: LogicValue) {
        input = value
    }

    protected getVirtualInputsValues(inputs: LogicValue[]): LogicValue[] {
        return inputs
    }

    protected setVirtualInputsValues(inputs: LogicValue[], values: LogicValue[], reverse = false) {
        const num = inputs.length
        if (values.length !== num) {
            throw new Error(`inputValues: expected ${num} values, got ${values.length}`)
        }
        for (let i = 0; i < num; i++) {
            const j = reverse ? num - i - 1 : i
            inputs[i] = values[j]
        }
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
