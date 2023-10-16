import { displayValuesFromArray } from "../drawutils"
import { ArrayFillWith, LogicValue, Unknown, isUnknown } from "../utils"

export class VirtualMux {
    public readonly numFrom: number
    public readonly numTo: number
    public readonly numGroups: number
    public readonly numSel: number

    public inputsI: LogicValue[][]
    public inputsS: LogicValue[]

    public outputsZ: LogicValue[]

    public constructor(from: number, to: number) {
        this.numFrom = Math.min(16 * to, Math.max(2 * to, from))
        this.numGroups = Math.ceil(this.numFrom / to)
        this.numSel = Math.ceil(Math.log2(this.numGroups))
        this.numTo = to

        this.inputsI = new Array(this.numGroups)
        for (let i = 0; i < this.numGroups; i++) {
            this.inputsI[i] = ArrayFillWith(false, this.numTo)
        }
        this.inputsS = ArrayFillWith(false, this.numSel)

        this.outputsZ = ArrayFillWith(false, this.numTo)
    }

    protected doRecalcVirtualValue(): LogicValue[] {
        const sels = this.inputsS
        const sel = displayValuesFromArray(sels, false)[1]

        if (isUnknown(sel)) {
            return ArrayFillWith(Unknown, this.numTo)
        }
        return this.inputsI[sel]
    }

    protected propagateVirtualValue(newValues: LogicValue[]) {
        this.outputsZ = newValues
    }
}
