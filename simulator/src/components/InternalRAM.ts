import { ArrayFillWith, EdgeTrigger, LogicValue, Unknown, isUnknown, typeOrUndefined } from "../utils"
import { Flipflop, makeTriggerItems } from "./FlipflopOrLatch"
import { InternalROMRAMBase, InternalROMRAMBaseValue } from "./IntenalROM"
import { InternalSyncComponent } from "./InternalFlipflopOrLatch";


export class InternalRAM extends InternalROMRAMBase {
    public inputClock: LogicValue

    public inputWE: LogicValue

    public inputClr: LogicValue

    public inputsD: LogicValue[]

    public value: InternalROMRAMBaseValue;

    private _trigger: EdgeTrigger
    protected _lastClock: LogicValue = Unknown

    public constructor(numDataBits: number, numAddressBits: number) {
        super(numDataBits, numAddressBits)

        this.inputClock = false

        this.inputWE = false

        this.inputClr = false

        this.inputsD = ArrayFillWith(false, this.numDataBits)

        this._trigger = EdgeTrigger.falling

        this.value = InternalRAM.defaultInternalValue(this.numWords, this.numDataBits)
    }

    public get trigger() {
        return this._trigger
    }

    protected doSetTrigger(trigger: EdgeTrigger) {
        this._trigger = trigger
    }

    public recalcInternalValue(): InternalROMRAMBaseValue {
        const clear = this.inputClr
        const numWords = this.numWords
        if (clear === true) {
            // clear is true, preset is false, set output to 0
            //console.log("RAM RST !!!")
            return InternalRAM.internalValueFilledWith(false, numWords, this.numDataBits)
        }

        // first, determine output
        const addr = this.currentAddress()

        const prevClock = this._lastClock
        const clock = this._lastClock = this.inputClock

        // handle normal operation
        const oldState = this.value
        const we = this.inputWE
        if (we !== true || !Flipflop.isClockTrigger(this.trigger, prevClock, clock)) {
            // nothing to write, just update output
            const out = isUnknown(addr) ? ArrayFillWith(Unknown, this.numDataBits) : oldState.mem[addr]
            //console.log("! RAM SDT !")
            return { mem: oldState.mem, out }
        }

        // we write
        if (isUnknown(addr)) {
            //console.log("! RAM ADR ???")
            return InternalRAM.internalValueFilledWith(Unknown, numWords, this.numDataBits)
        }

        // build new state
        const newData = this.inputsD.map(LogicValue.filterHighZ)
        const newState: LogicValue[][] = new Array(numWords)
        for (let i = 0; i < numWords; i++) {
            if (i === addr) {
                newState[i] = newData
            } else {
                newState[i] = oldState.mem[i]
            }
        }
        //console.log("!!! RAM UPDATED !!!!!!!")
        return { mem: newState, out: newData }
    }
}
