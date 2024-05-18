import { ArrayFillWith, InteractionResult, LogicValue, Unknown, allBooleans, binaryStringRepr, hexStringRepr, isAllZeros, isArray, isUnknown, typeOrUndefined, wordFromBinaryOrHexRepr, EdgeTrigger } from "../utils"
import {
    COLOR_COMPONENT_BORDER,
    COLOR_EMPTY,
    colorForLogicValue,
    displayValuesFromArray,
    strokeSingleLine,
} from "../drawutils"
import { ParametrizedComponentBase, Repr, ResolvedParams, defineAbstractParametrizedComponent, defineParametrizedComponent, groupHorizontal, groupVertical, param } from "./Component"
import { InternalRAM } from "./InternalRAM"
import { InternalSyncComponent } from "./InternalFlipflopOrLatch";
import { InternalRegisterBaseValue } from "./InternalRegister";
import { number, string } from "fp-ts";
import {GraphicsRendering} from "./Drawable";


export type InternalROMRAMBaseValue = {
    mem: LogicValue[][]
    out: LogicValue[]
}

export abstract class InternalROMRAMBase {
    public readonly numDataBits: number
    public readonly numAddressBits: number
    public readonly numWords: number

    public inputsAddr: LogicValue[]

    public outputsQ: LogicValue[]

    public constructor(numDataBits: number, numAddressBits: number) {
        this.numDataBits = numDataBits
        this.numAddressBits = numAddressBits
        this.numWords = Math.pow(2, numAddressBits)

        this.inputsAddr = ArrayFillWith(false, this.numAddressBits)

        this.outputsQ = ArrayFillWith(false, this.numDataBits)
    }

    public static defaultInternalValue(numWords: number, numDataBits: number){
        return InternalROMRAMBase.internalValueFilledWith(false, numWords, numDataBits)
    }

    public static internalValueFilledWith(v: LogicValue, numWords: number, numDataBits: number): InternalROMRAMBaseValue {
        const mem: LogicValue[][] = new Array(numWords)
        for (let i = 0; i < numWords; i++) {
            mem[i] = ArrayFillWith(v, numDataBits)
        }
        const out = ArrayFillWith(v, numDataBits)
        return { mem, out }
    }

    public static internalContentsFromString(stringRep: string | string[], numDataBits: number, numWords: number) {
        const splitContent = isArray(stringRep) ? stringRep : stringRep.split(/\s+/)
        const mem: LogicValue[][] = new Array(numWords)
        for (let i = 0; i < numWords; i++) {
            const row = i >= splitContent.length
                ? ArrayFillWith(false, numDataBits)
                : wordFromBinaryOrHexRepr(splitContent[i], numDataBits)
            mem[i] = row
        }
        return mem
    }

    public currentAddress(): number | Unknown {
        const addrBits = this.inputsAddr
        const [__, addr] = displayValuesFromArray(addrBits, false)
        return addr
    }

    public internalOutputs() : LogicValue[] {
        return this.outputsQ
    }

    protected propagateInternalValue(newValue: InternalROMRAMBaseValue) {
        this.outputsQ = newValue.out
    }
}



export class IntenalROM extends InternalROMRAMBase {
    public value: InternalROMRAMBaseValue;

    public constructor(numDataBits: number, numAddressBits: number) {
        super(numDataBits, numAddressBits)
        this.value = IntenalROM.defaultInternalValue(this.numWords, this.numDataBits)
    }

    protected doRecalcInternalValue(): InternalROMRAMBaseValue {
        const { mem } = this.value
        const addr = this.currentAddress()
        const out = isUnknown(addr) ? ArrayFillWith(Unknown, this.numDataBits) : mem[addr]
        return { mem, out }
    }
}
