import { ArrayFillWith, InteractionResult, LogicValue, Unknown, allBooleans, binaryStringRepr, hexStringRepr, isAllZeros, isArray, isUnknown, typeOrUndefined, wordFromBinaryOrHexRepr, EdgeTrigger } from "../utils"
import {
    COLOR_COMPONENT_BORDER,
    COLOR_EMPTY,
    colorForBoolean,
    displayValuesFromArray,
    strokeSingleLine,
} from "../drawutils"
import { ParametrizedComponentBase, Repr, ResolvedParams, defineAbstractParametrizedComponent, defineParametrizedComponent, groupHorizontal, groupVertical, param } from "./Component"
import { VirtualRAM } from "./VirtualRAM"
import { VirtualSyncComponent } from "./VirtualFlipflopOrLatch";
import { VirtualRegisterBaseValue } from "./VirtualRegister";
import { number, string } from "fp-ts";
import {GraphicsRendering} from "./Drawable";


export type VirtualROMRAMBaseValue = {
    mem: LogicValue[][]
    out: LogicValue[]
}

export abstract class VirtualROMRAMBase {
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

    public static defaultVirtualValue(numWords: number, numDataBits: number){
        return VirtualROMRAMBase.virtualValueFilledWith(false, numWords, numDataBits)
    }

    public static virtualValueFilledWith(v: LogicValue, numWords: number, numDataBits: number): VirtualROMRAMBaseValue {
        const mem: LogicValue[][] = new Array(numWords)
        for (let i = 0; i < numWords; i++) {
            mem[i] = ArrayFillWith(v, numDataBits)
        }
        const out = ArrayFillWith(v, numDataBits)
        return { mem, out }
    }

    public static virtualContentsFromString(stringRep: string | string[], numDataBits: number, numWords: number) {
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

    public virtualOutputs() : LogicValue[] {
        return this.outputsQ
    }

    protected propagateVirtualValue(newValue: VirtualROMRAMBaseValue) {
        this.outputsQ = newValue.out
    }
}



export class VirtualROM extends VirtualROMRAMBase {
    public value: VirtualROMRAMBaseValue;

    public constructor(numDataBits: number, numAddressBits: number) {
        super(numDataBits, numAddressBits)
        this.value = VirtualROM.defaultVirtualValue(this.numWords, this.numDataBits)
    }

    protected doRecalcVirtualValue(): VirtualROMRAMBaseValue {
        const { mem } = this.value
        const addr = this.currentAddress()
        const out = isUnknown(addr) ? ArrayFillWith(Unknown, this.numDataBits) : mem[addr]
        return { mem, out }
    }
}
