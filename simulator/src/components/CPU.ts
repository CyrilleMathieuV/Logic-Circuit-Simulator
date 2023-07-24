import * as t from "io-ts"
import {
    COLOR_BACKGROUND,
    COLOR_COMPONENT_BORDER,
    COLOR_COMPONENT_INNER_LABELS,
    COLOR_GROUP_SPAN,
    displayValuesFromArray,
    drawLabel,
    drawWireLineToComponent,
    formatWithRadix,
    GRID_STEP,
    useCompact,
} from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import {
    ArrayClampOrPad,
    ArrayFillUsing,
    ArrayFillWith,
    EdgeTrigger, FixedArrayAssert, FixedArrayMap,
    isBoolean,
    isHighImpedance,
    isUnknown,
    LogicValue, LogicValueRepr,
    toLogicValue, toLogicValueRepr,
    typeOrUndefined,
    Unknown, wordFromBinaryOrHexRepr,
} from "../utils"
import {
    ComponentGridSize,
    defineAbstractParametrizedComponent,
    defineParametrizedComponent, ExtractParamDefs, ExtractParams,
    groupHorizontal,
    groupVertical, NodesIn, NodesOut,
    param,
    paramBool,
    ParametrizedComponentBase, ReadonlyGroupedNodeArray,
    Repr,
    ResolvedParams,
    Value,
} from "./Component"
import {
    Drawable,
    DrawableParent,
    DrawContext,
    DrawContextExt,
    GraphicsRendering,
    MenuData,
    MenuItems,
    Orientation,
} from "./Drawable"
import {
    Flipflop,
    FlipflopBaseDef,
    FlipflopOrLatch,
    FlipflopOrLatchDef,
    makeTriggerItems,
    SyncComponent,
} from "./FlipflopOrLatch";
import { Gate1Types, Gate2toNType, Gate2toNTypes } from "./GateTypes"
import {
    Register,
    RegisterBase,
    RegisterBaseDef,
    RegisterBaseParams,
    RegisterBaseRepr,
    RegisterDef, RegisterParams,
    RegisterRepr,
} from "./Register";
import {ALU, ALUDef, ALUParams, ALURepr} from "./ALU"
import { Mux } from "./Mux";
import { FlipflopD } from "./FlipflopD";
import {ShiftRegisterDef} from "./ShiftRegister";
import {NodeOut} from "./Node";
import {ROMDef, ROMRAMBase, ROMRAMDef, ROMRAMParams, ROMRAMRepr, ROMRAMValue, ROMRepr} from "./ROM";
import {RAMDef} from "./RAM";

export const CPUBaseDef =
    defineAbstractParametrizedComponent( {
        button: { imgWidth: 40 },
        repr: {
            instructionBits: typeOrUndefined(t.number),
            addressInstructionBits: typeOrUndefined(t.number),
            dataBits: typeOrUndefined(t.number),
            addressDataBits: typeOrUndefined(t.number),
            showOpCode: typeOrUndefined(t.boolean),
            showOperands: typeOrUndefined(t.boolean),
            trigger: typeOrUndefined(t.keyof(EdgeTrigger)),
            //extOpCode: typeOrUndefined(t.boolean),
        },
        valueDefaults: {
            showOpCode: true,
            showOperands: true,
            //trigger: EdgeTrigger.falling,
        },
        params: {
            instructionBits: param(8, [8]),
            addressInstructionBits: param(8, [2, 4, 8]),
            dataBits: param(4, [4]),
            addressDataBits: param(4, [4]),
            // future use
            // extOpCode: paramBool(), // has the extended opcode
        },
        validateParams: ({ instructionBits, addressInstructionBits, dataBits, addressDataBits}) => ({
            numInstructionBits: instructionBits,
            numAddressInstructionBits: addressInstructionBits,
            numDataBits: dataBits,
            numAddressDataBits: addressDataBits,
            //usesExtendedOpCode: extOpCode,
        }),
        size: ({ numDataBits }) => ({
            //gridWidth: 7,
            //gridHeight: 19 + Math.max(0, numDataBits - 8) * 2,
            gridWidth: 32,
            gridHeight: 32,
        }),
        makeNodes: ({ numInstructionBits, numAddressInstructionBits, numDataBits, numAddressDataBits, /*usesExtendedOpCode*/ gridWidth, gridHeight }) => {
            const bottom = gridHeight / 2
            const top = -bottom
            const right = gridWidth / 2
            const left = -right
            const inputX = right + 1.5
            const inputY = bottom + 1.5
            const midY = bottom / 2
            const midX = right / 2
            // const topGroupDataBits = usesExtendedOpCode ? 5 : 3
            // top group is built together
            // const topGroup = groupHorizontal("n", 0, top, topGroupDataBits)
            // const cin = topGroup.pop()!
            // extracted to be mapped correctly when switching between reduced/extended opcodes
            // const opMode = topGroup.pop()!
            return {
                ins: {
                    Isa: groupVertical("w", -inputX, 0, numInstructionBits),
                    Din: groupHorizontal("s", midX, inputY, numDataBits),
                    Reset: [-15, inputY, "s", "Reset CPU", { prefersSpike: true }],
                    ManStep: [-13, inputY, "s","Man STEP", { prefersSpike: true }],
                    Speed: [-11, inputY, "s", "Select Clock"],
                    ClockS: [-9, inputY, "s", "Slow Clock", { isClock: true }],
                    ClockF: [-7, inputY, "s", "Fast Clock", { isClock: true }],
                    RunStop: [-5, inputY, "s", "Run/Stop", { prefersSpike: true }],
                    //Mode: opCodeMode,
                },
                outs: {
                    Isaadr: groupHorizontal("n", -midX, -inputY, numAddressInstructionBits),
                    Dadr: groupHorizontal("n", midX, -inputY, numAddressDataBits),
                    Dout: groupVertical("e", inputX, -midY, numDataBits),
                    RAMsync: [inputX, 1, "e", "RAM sync"],
                    RAMwe: [inputX, 3, "e", "RAM WE"],
                    ResetSync: [inputX, 5, "e", "Reset sync"],
                    Sync: [inputX, 7, "e", "Sync"],
                    Z: [inputX, 9, "e", "Z (Zero)"],
                    V: [inputX, 11, "e", "V (oVerflow)"],
                    Cout: [inputX, 13, "e", `Cout (${S.Components.CPU.OutputCoutDesc})`],
                    RunningState: [inputX, 15, "e", "Run state"],
                },
            }
        },
        initialValue: (saved, {numAddressInstructionBits, numDataBits}) => {
            /*
            if (saved === undefined) {
                return CPUBase.defaultValue(numAddressInstructionBits, numDataBits)
            }
            */
            const false_ = false as LogicValue
            return {
                isaadr: ArrayFillWith(false_, numAddressInstructionBits),
                dadr: ArrayFillWith(false_, numDataBits),
                dout: ArrayFillWith(false_, numDataBits),
                ramsync: false_,
                ramwe: false_,
                resetsync: false_,
                sync: false_,
                z: false_,
                v: false_,
                cout: false_,
                runningstate: false_,
            }
        },
    })


export type CPUOpCode = typeof CPUOpCodes[number]

export const CPUOpCode = {
    shortName(op: CPUOpCode): string {
        return S.Components.CPU[op][0]
    },
    fullName(op: CPUOpCode): string {
        return S.Components.CPU[op][1]
    },
}

export const CPUOpCodes = [
    "NOP", "DEC", "LDM", "LDK",
    //0000  0001   0010   0011
    "GDW", "GUP", "JIZ", "JIC",
    //0100 0101   0110   0111
    "ADM", "SBM", "HLT", "STM",
    //1000  1001   1010    1011
    "ORM", "ANM", "NOT", "XRM",
    //1100 1101   1110   1111
] as const

// TO DO
// Used to future CISC CPUOpCodes.
// export const CPUOpCodesExtended:
//  "NOP", "EX0", "LDM", "LDK",
//0000  0001   0010   0011
//    "GDW", "GUP", "JIZ", "JIC",
//0100 0101   0110   0111
//    "ADM", "SBM", "HLT", "STM",
//1000  1001   1010    1011
//    "ORM", "ANM", "EX1", "XRM",
//1100 1101   1110   1111
/*
export interface SyncComponent<State> {
    trigger: EdgeTrigger
    value: State
    makeInvalidState(): State
    makeStateFromMainValue(val: LogicValue): State
    makeStateAfterClock(): State
}
*/

//type CPUOperands = Value<typeof CPUOperands>

/*type CPUBaseValue = Value<typeof CPUBaseDef>*/

type CPUBaseValue = {
    isaadr: LogicValue[]
    dadr: LogicValue[]
    dout: LogicValue[]
    ramsync: LogicValue
    ramwe: LogicValue
    resetsync: LogicValue
    sync: LogicValue
    z: LogicValue
    v: LogicValue
    cout: LogicValue
    runningstate: LogicValue
}

export type CPUBaseRepr = Repr<typeof CPUBaseDef>
export type CPUBaseParams = ResolvedParams<typeof CPUBaseDef>

export abstract class CPUBase<TRepr extends CPUBaseRepr> extends ParametrizedComponentBase<TRepr, CPUBaseValue> {
/*
    public static defaultValue(numAddressInstructionBits: number, numDataBits:number) {
        return {
            isaadr: ArrayFillWith(false, numAddressInstructionBits),
            dadr: ArrayFillWith(false, numDataBits),
            dout: ArrayFillWith(false, numDataBits),
            ramsync: false,
            ramwe: false,
            resetsync: false,
            sync: false,
            z: false,
            v: false,
            cout: false,
            runningstate: false,
        }
    }
 */
/*
    export abstract class CPUBase<
    TRepr extends CPUBaseRepr,
    TParamDefs extends ExtractParamDefs<TRepr> = ExtractParamDefs<TRepr>,
> extends ParametrizedComponentBase<
    TRepr,
    LogicValue[],
    TParamDefs,
    ExtractParams<TRepr>,
    NodesIn<TRepr>,
    NodesOut<TRepr>,
    true, true
> {
*/
/*
    public static defaultValue(numAddressInstructionBits: number, numDataBits: number) {
        return CPUBase.valueFilledWith(false, numAddressInstructionBits, numDataBits)
    }
 */
    public readonly numInstructionBits: number
    public readonly numAddressInstructionBits: number

    public readonly numDataBits: number
    public readonly numAddressDataBits: number

    //public readonly usesExtendedOpCode: boolean

    protected _ALU : ALU

    protected _instructionRegister : Register
    protected _accumulatorRegister : Register
    protected _flagsRegister : Register

    protected _instructionMux : Mux

    protected _programCounterALU : ALU

    protected _programCounterRegister : Register
    protected _previousProgramCounterRegister : Register

    protected _programCounterMux : Mux

    protected _runStopFlipflopD : FlipflopD

    protected _runningStateMux : Mux
    protected _clockSpeedMux : Mux
    protected _autoManMux : Mux

    protected _showOpCode: boolean
    protected _showOperands: boolean
    //protected _trigger: EdgeTrigger
    //protected _isInInvalidState = false
    //protected _lastClock: LogicValue = Unknown
    /*
    private isaadr: LogicValue[]
    private dadr: LogicValue[]
    private dout: LogicValue[]
    private ramsync: LogicValue
    private ramwe: LogicValue
    private resetsync: LogicValue
    private sync: LogicValue
    private z: LogicValue
    private v: LogicValue
    private cout: LogicValue
    private runningstate: LogicValue
    */
    protected constructor(parent: DrawableParent, SubclassDef: typeof CPUDef, params: CPUBaseParams, saved?: TRepr) {
        super(parent, CPUDef.with(params) as any, saved)

        this.numInstructionBits = params.numInstructionBits
        this.numAddressInstructionBits = params.numAddressInstructionBits

        this.numDataBits = params.numDataBits
        this.numAddressDataBits = params.numAddressDataBits

        //this.usesExtendedOpCode = params.usesExtendedOpCode

        this._ALU = new ALU(parent,{numBits: this.numDataBits, usesExtendedOp: true},undefined)

        this._instructionRegister = new Register(parent,{numBits : this.numInstructionBits, hasIncDec: false}, undefined)
        this._accumulatorRegister = new Register(parent,{numBits : this.numDataBits, hasIncDec: false}, undefined)
        this._flagsRegister = new Register(parent,{numBits : 4, hasIncDec: false}, undefined)

        this._instructionMux = new Mux (parent, {numFrom: 4 * this.numDataBits, numTo: this.numDataBits, numGroups: 4, numSel: 2}, undefined)

        // MUST change trigger of Registers
        this._instructionRegister.setTrigger(EdgeTrigger.falling)
        this._accumulatorRegister.setTrigger(EdgeTrigger.falling)
        this._flagsRegister.setTrigger(EdgeTrigger.falling)

        this._programCounterRegister = new Register(parent,{numBits : this.numAddressInstructionBits, hasIncDec: false}, undefined)
        this._previousProgramCounterRegister = new Register(parent,{numBits : this.numAddressInstructionBits, hasIncDec: false}, undefined)

        // MUST change trigger of Registers
        this._programCounterRegister.setTrigger(EdgeTrigger.falling)
        this._previousProgramCounterRegister.setTrigger(EdgeTrigger.falling)

        this._programCounterALU = new ALU(parent,{numBits: this.numAddressInstructionBits, usesExtendedOp: true},undefined)

        this._programCounterMux = new Mux (parent, {numFrom: 2 * this.numAddressInstructionBits, numTo: this.numAddressInstructionBits, numGroups: 2, numSel: 1}, undefined)

        this._runStopFlipflopD = new FlipflopD(parent)

        // MUST change trigger of Flipflops
        this._runStopFlipflopD.setTrigger(EdgeTrigger.falling)

        this._runningStateMux = new Mux (parent, {numFrom: 2, numTo: 1, numGroups: 2, numSel: 1}, undefined)
        this._clockSpeedMux = new Mux (parent, {numFrom: 2, numTo: 1, numGroups: 2, numSel: 1}, undefined)
        this._autoManMux = new Mux (parent, {numFrom: 2, numTo: 1, numGroups: 2, numSel: 1}, undefined)

        this._showOpCode = saved?.showOpCode ?? CPUDef.aults.showOpCode
        this._showOperands = saved?.showOperands ?? CPUDef.aults.showOperands
        //this._trigger = saved?.trigger ?? CPUDef.aults.trigger
/*
        this.isaadr = ArrayFillWith(Unknown, this.numAddressInstructionBits)
        this.dadr = ArrayFillWith(Unknown, this.numDataBits)
        this.dout = ArrayFillWith(Unknown, this.numDataBits)
        this.ramsync =  Unknown
        this.ramwe = Unknown
        this.resetsync = Unknown
        this.sync = Unknown
        this.z = Unknown
        this.v = Unknown
        this.cout = Unknown
        this.runningstate= Unknown
 */
    }

    public override toJSONBase() {
        return {
            ...super.toJSONBase(),
            instructionBits: this.numInstructionBits === CPUDef.aults.instructionBits ? undefined : this.numInstructionBits,
            addressInstructionBits: this.numAddressInstructionBits === CPUDef.aults.addressInstructionBits ? undefined : this.numAddressInstructionBits,
            dataBits: this.numDataBits === CPUDef.aults.dataBits ? undefined : this.numDataBits,
            addressDataBits: this.numAddressDataBits === CPUDef.aults.addressDataBits ? undefined : this.numAddressDataBits,
            //extOpCode: this.usesExtendedOpCode === CPUDef.aults.extOpCode ? undefined : this.usesExtendedOpCode,
            showOpCode: (this._showOpCode !== CPUDef.aults.showOpCode) ? this._showOpCode : undefined,
            showOperands: (this._showOperands !== CPUDef.aults.showOperands) ? this._showOperands : undefined,
            //trigger: (this._trigger !== FlipflopBaseDef.aults.trigger) ? this._trigger : undefined,
        }
    }

    public get opCode(): CPUOpCode | Unknown {
        //const opValues = this.inputValues(this.inputs.Isa.reverse()).slice(0,4)
        const opCodeValues = this.getOutputValues(this._instructionRegister.outputs.Q).slice(0,4)
        //opValues.push(this.inputs.Mode.value)
        const opCodeIndex = displayValuesFromArray(opCodeValues, true)[1]
        // TO DO
        //return isUnknown(opCodeIndex) ? Unknown : (this.usesExtendedOpCode ? CPUOpCodes : CPUOpCodes)[opCodeIndex]
        return isUnknown(opCodeIndex) ? Unknown : CPUOpCodes[opCodeIndex]
    }

    public get operands(): LogicValue[] {
        //const opValues = this.inputValues(this.inputs.Isa.reverse()).slice(0,4)
        const operandsValue = this.getOutputValues(this._instructionRegister.outputs.Q).slice(4,8)
        //opValues.push(this.inputs.Mode.value)
        //const operandsIndex = displayValuesFromArray(operandsValue, true)[1]
        // TO DO
        //return isUnknown(opCodeIndex) ? Unknown : (this.usesExtendedOpCode ? CPUOpCodes : CPUOpCodes)[opCodeIndex]
        return operandsValue
    }
    /*
    protected doRecalcValue(): CPUBaseValue {
        const isa = this.inputValues(this.inputs.Isa)

        // Needs to revert all inputs to be compatible with choosen ISA
        this.setInputValues(this._instructionRegister.inputs.D, isa, true)

        //this._instructionRegister.makeStateAfterClock()

        const opCodeValues = this.getOutputValues(this._instructionRegister.outputs.Q).slice(0,4).reverse()
        const opCode = this.opCode

        this._ALU.inputs.Mode.value = opCodeValues[2]
        this._ALU.inputs.Op[2].value = opCodeValues[1]
        this._ALU.inputs.Op[1].value = !opCodeValues[3]
        this._ALU.inputs.Op[0].value = opCodeValues[0]

        const commonInstructionMuxSelect = !opCodeValues[3] && !opCodeValues[2]
        this._instructionMux.inputs.S[1].value = commonInstructionMuxSelect && opCodeValues[1]
        this._instructionMux.inputs.S[0].value = (commonInstructionMuxSelect && opCodeValues[0]) || (opCodeValues[3] && !opCodeValues[1]) || (opCodeValues[3] && opCodeValues[2])

        const operands = this.getOutputValues(this._instructionRegister.outputs.Q).slice(4,8).reverse()

        this.setInputValues(this._instructionMux.inputs.I[3], operands)
        this.setInputValues(this._instructionMux.inputs.I[2], this.inputValues(this.inputs.Din))
        this.setInputValues(this._instructionMux.inputs.I[1], this.getOutputValues(this._ALU.outputs.S))
        this.setInputValues(this._instructionMux.inputs.I[0], this.getOutputValues(this._accumulatorRegister.outputs.Q))

        this.setInputValues(this._accumulatorRegister.inputs.D, this.getOutputValues(this._instructionMux.outputs.Z))

        this.setInputValues(this._ALU.inputs.A, this.getOutputValues(this._accumulatorRegister.outputs.Q))
        this.setInputValues(this._ALU.inputs.B, this.inputValues(this.inputs.Din))

        const z = this.allZeros(this.getOutputValues(this._instructionMux.outputs.Z))
        const c = this.outputs.Cout.value

        const jumpControl = opCodeValues[2] && !opCodeValues[3]
        const noJump = !(((((opCodeValues[0] && z) || (!opCodeValues[0] && c)) && opCodeValues[1]) || !opCodeValues[1]) && jumpControl)
        const backwardJump = (opCodeValues[0] && !opCodeValues[1]) && jumpControl

        this._flagsRegister.inputs.D[1].value = z
        this._flagsRegister.inputs.D[1].value = c

        this._programCounterMux.inputs.S[0].value = !noJump

        this._programCounterALU.inputs.Mode.value = false
        this._programCounterALU.inputs.Op[2].value = false
        this._programCounterALU.inputs.Op[1].value = noJump
        this._programCounterALU.inputs.Op[0].value = backwardJump

        this.setInputValues(this._programCounterMux.inputs.I[1], this.getOutputValues(this._programCounterRegister.outputs.Q))
        this.setInputValues(this._programCounterMux.inputs.I[0], this.getOutputValues(this._previousProgramCounterRegister.outputs.Q))

        this.setInputValues(this._programCounterRegister.inputs.D, this.getOutputValues(this._programCounterALU.outputs.S))
        this.setInputValues(this._previousProgramCounterRegister.inputs.D, this.getOutputValues(this._programCounterRegister.outputs.Q))

        this.setInputValues(this._programCounterALU.inputs.A, this.getOutputValues(this._programCounterMux.outputs.Z))
        // A clone of the array "operands" array is needed cause ArrayClamOrPad returns the array
        const BinputValueProgramCounterALU = operands.slice()
        this.setInputValues(this._programCounterALU.inputs.B, ArrayClampOrPad(BinputValueProgramCounterALU, this.numAddressInstructionBits, false))

        const haltOpCodeSignal = opCodeValues[3] && !opCodeValues[2] && opCodeValues[1] && !opCodeValues[0]

        this._runStopFlipflopD.inputs.Clock.value = (haltOpCodeSignal && this._autoManMux.outputs.Z[0].value) || this.inputs.RunStop.value
        this._runStopFlipflopD.inputs.D.value = this._runStopFlipflopD.outputs.Q̅.value

        this._clockSpeedMux.inputs.S[0].value = this.inputs.Speed.value
        this._clockSpeedMux.inputs.I[1][0].value = this.inputs.ClockF.value
        this._clockSpeedMux.inputs.I[0][0].value = this.inputs.ClockS.value

        this._autoManMux.inputs.S[0].value = this._runStopFlipflopD.outputs.Q.value
        this._autoManMux.inputs.I[1][0].value = this._clockSpeedMux.outputs.Z[0].value
        this._autoManMux.inputs.I[0][0].value = this.inputs.ManStep.value

        this._runningStateMux.inputs.S[0].value = this._runStopFlipflopD.outputs.Q̅.value
        this._runningStateMux.inputs.I[1][0].value = this.inputs.ManStep.value && this._runStopFlipflopD.outputs.Q̅.value
        this._runningStateMux.inputs.I[0][0].value = this._runStopFlipflopD.outputs.Q.value

        const prevClock = this._lastClock
        const clockSync = this._lastClock = this._autoManMux.outputs.Z[0].value
        this._instructionRegister.inputs.Clock.value = clockSync
        this._accumulatorRegister.inputs.Clock.value = clockSync
        this._flagsRegister.inputs.Clock.value = clockSync
        this._programCounterRegister.inputs.Clock.value  = clockSync
        this._previousProgramCounterRegister.inputs.Clock.value = clockSync

        const clrSignal = this.inputs.Reset.value && this._runStopFlipflopD.outputs.Q̅.value

        this._instructionRegister.inputs.Clr.value = clrSignal
        this._accumulatorRegister.inputs.Clr.value = clrSignal
        this._flagsRegister.inputs.Clr.value = clrSignal
        this._programCounterRegister.inputs.Clr.value  = clrSignal
        this._previousProgramCounterRegister.inputs.Clr.value = clrSignal
        this._runStopFlipflopD.inputs.Clr.value = clrSignal

        if (isUnknown(opCode)) {
            return {
                isaadr: ArrayFillWith(Unknown, this.numAddressInstructionBits),
                dadr: ArrayFillWith(Unknown, this.numDataBits),
                dout: ArrayFillWith(Unknown, this.numDataBits),
                ramsync: Unknown,
                ramwe: Unknown,
                resetsync: Unknown,
                sync: Unknown,
                z: Unknown,
                v: Unknown,
                cout: Unknown,
                runningstate: Unknown,
            }
        }

        //return doCPUOpCode(op, din, isa)
        //return doCPUOpCode(opCode, isa, operands, this.numAddressInstructionBits, runstate)
        return {
            isaadr: this.getOutputValues(this._programCounterRegister.outputs.Q),
            dadr: operands,
            dout: this.getOutputValues(this._accumulatorRegister.outputs.Q),
            ramsync: clockSync,
            ramwe: opCodeValues[3] && !opCodeValues[2] && opCodeValues[1] && opCodeValues[0],
            resetsync: clrSignal,
            sync: clockSync,
            z: this._flagsRegister.outputs.Q[0].value,
            v: false,
            cout: this._flagsRegister.outputs.Q[1].value,
            runningstate: this._runningStateMux.outputs.Z[0].value,
        }
    }
*/
    /*
    public makeInvalidState(): CPUBaseValue {
        return {
            isaadr: ArrayFillWith(Unknown, this.numAddressInstructionBits),
            dadr: ArrayFillWith(Unknown, this.numDataBits),
            dout: ArrayFillWith(Unknown, this.numDataBits),
            ramsync: false,
            ramwe: false,
            resetsync: false,
            sync: false,
            z: false,
            v: false,
            cout: false,
            runningstate: false,
        }
    }
*/
/*
    public makeStateFromMainValue(val: LogicValue): CPUBaseValue {
        return {
            isaadr: ArrayFillWith(val, this.numAddressInstructionBits),
            dadr: ArrayFillWith(val, this.numDataBits),
            dout: ArrayFillWith(val, this.numDataBits),
            ramsync: false,
            ramwe: false,
            resetsync: false,
            sync: false,
            z: false,
            v: false,
            cout: false,
            runningstate: false,
        }
    }
 */
/*
    public abstract makeStateAfterClock(): CPUBaseValue

    protected abstract doRecalcValueAfterClock(): LogicValue
*/
    protected override propagateValue(newValue: CPUBaseValue) {
        this.outputValues(this.outputs.Isaadr , newValue.isaadr)
        this.outputValues(this.outputs.Dadr , newValue.dadr)
        this.outputValues(this.outputs.Dout , newValue.dout)
        this.outputs.RAMsync.value = newValue.ramsync
        this.outputs.RAMwe.value = newValue.ramwe
        this.outputs.ResetSync.value = newValue.resetsync
        this.outputs.Sync.value = newValue.sync
        this.outputs.Z.value = newValue.z
        //this.outputs.Z.value = allZeros(newValue.dout)
        this.outputs.V.value = newValue.v
        this.outputs.Cout.value = newValue.cout
        this.outputs.RunningState.value = newValue.runningstate
    }

    private doSetShowOpCode(showOpCode: boolean) {
        this._showOpCode = showOpCode
        this.setNeedsRedraw("show opCodechanged")
    }

    private doSetShowOperands(ShowOperands: boolean) {
        this._showOperands = ShowOperands
        this.setNeedsRedraw("show operdanschanged")
    }
/*
    public get trigger() {
        return this._trigger
    }
    protected doSetTrigger(trigger: EdgeTrigger) {
        this._trigger = trigger
        this.setNeedsRedraw("trigger changed")
    }

    public setTrigger(trigger: EdgeTrigger) {
        this._trigger = trigger
    }
*/
    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {
        const bounds = this.bounds()
        const { left, top, right, bottom } = bounds
        const lowerTop = top - 2 * GRID_STEP
        const lowerBottom = top - 2 * GRID_STEP
        const lowerLeft = left - 2 * GRID_STEP
        const lowerRight = right - 2 * GRID_STEP

        // for debug
        //this._instructionRegister.posX = 100
        //this._instructionRegister.posY = 100
        //this._instructionRegister.doDraw(g, ctx)
        //this._instructionMux.doDraw(g, ctx)
        //this._ALU.doDraw(g, ctx)
        this._accumulatorRegister.doDraw(g, ctx)
        //this._programCounterRegister.doDraw(g, ctx)

        // inputs
        for (const input of this.inputs.Isa) {
            drawWireLineToComponent(g, input, left, input.posYInParentTransform)
        }
        for (const input of this.inputs.Din) {
            drawWireLineToComponent(g, input, input.posXInParentTransform, bottom)
        }
        drawWireLineToComponent(g, this.inputs.Reset, this.inputs.Reset.posXInParentTransform, bottom)
        drawWireLineToComponent(g, this.inputs.ManStep, this.inputs.ManStep.posXInParentTransform, bottom)
        drawWireLineToComponent(g, this.inputs.Speed, this.inputs.Speed.posXInParentTransform, bottom)
        drawWireLineToComponent(g, this.inputs.ClockS, this.inputs.ClockS.posXInParentTransform, bottom)
        drawWireLineToComponent(g, this.inputs.ClockF, this.inputs.ClockF.posXInParentTransform, bottom)
        drawWireLineToComponent(g, this.inputs.RunStop, this.inputs.RunStop.posXInParentTransform, bottom)

        // outputs
        for (const output of this.outputs.Isaadr) {
            drawWireLineToComponent(g, output, output.posXInParentTransform, top)
        }
        for (const output of this.outputs.Dout) {
            drawWireLineToComponent(g, output, right, output.posYInParentTransform)
        }
        for (const output of this.outputs.Dadr) {
            drawWireLineToComponent(g, output, output.posXInParentTransform, top)
        }
        drawWireLineToComponent(g, this.outputs.ResetSync, right, this.outputs.ResetSync.posYInParentTransform)
        drawWireLineToComponent(g, this.outputs.Sync, right, this.outputs.Sync.posYInParentTransform)
        drawWireLineToComponent(g, this.outputs.RAMsync, right, this.outputs.RAMsync.posYInParentTransform)
        drawWireLineToComponent(g, this.outputs.RAMwe, right, this.outputs.RAMwe.posYInParentTransform)
        drawWireLineToComponent(g, this.outputs.Z, right, this.outputs.Z.posYInParentTransform)
        drawWireLineToComponent(g, this.outputs.V, right, this.outputs.V.posYInParentTransform)
        drawWireLineToComponent(g, this.outputs.Cout, right, this.outputs.Cout.posYInParentTransform)
        drawWireLineToComponent(g, this.outputs.RunningState, right, this.outputs.RunningState.posYInParentTransform)

        // outline
        g.fillStyle = COLOR_BACKGROUND
        g.lineWidth = 3
        g.strokeStyle = ctx.borderColor

        g.beginPath()
        g.moveTo(left, top)
        g.lineTo(right, top)
        g.lineTo(right, bottom)
        g.lineTo(left, bottom)
        g.lineTo(left, top)
        g.closePath()
        g.fill()
        g.stroke()

        // groups
        this.drawGroupBox(g, this.inputs.Isa.group, bounds)
        this.drawGroupBox(g, this.inputs.Din.group, bounds)
        this.drawGroupBox(g, this.outputs.Isaadr.group, bounds)
        this.drawGroupBox(g, this.outputs.Dout.group, bounds)
        this.drawGroupBox(g, this.outputs.Dadr.group, bounds)

        // labels
        ctx.inNonTransformedFrame(ctx => {
            g.fillStyle = COLOR_COMPONENT_INNER_LABELS
            g.font = "11px sans-serif"

            // bottom inputs
            const isVertical = Orientation.isVertical(this.orient)
            const carryHOffsetF = isVertical ? 0 : 1
            drawLabel(ctx, this.orient, "Din", "s", this.inputs.Din, bottom)
            drawLabel(ctx, this.orient, "Reset", "s", this.inputs.Reset, bottom)
            drawLabel(ctx, this.orient, "Man Step", "s", this.inputs.ManStep, bottom)
            drawLabel(ctx, this.orient, "Speed", "s", this.inputs.Speed, bottom)
            drawLabel(ctx, this.orient, "Clock S", "s", this.inputs.ClockS, bottom)
            drawLabel(ctx, this.orient, "Clock F", "s", this.inputs.ClockF, bottom)
            drawLabel(ctx, this.orient, "Run/Stop", "s", this.inputs.RunStop, bottom)

            // top outputs
            drawLabel(ctx, this.orient, "IsaAdr", "n", this.outputs.Isaadr, top)
            drawLabel(ctx, this.orient, "DAdr", "n", this.outputs.Dadr, top)

            // left inputs
            drawLabel(ctx, this.orient, "Isa", "w", left, this.inputs.Isa)

            // right outputs
            drawLabel(ctx, this.orient, "Dout", "e", right, this.outputs.Dout)
            drawLabel(ctx, this.orient, "RAM Sync", "e", right, this.outputs.RAMsync)
            drawLabel(ctx, this.orient, "Reset Sync", "e", right, this.outputs.ResetSync)
            drawLabel(ctx, this.orient, "RAM WE", "e", right, this.outputs.RAMwe)
            drawLabel(ctx, this.orient, "Sync", "e", right, this.outputs.Sync)
            drawLabel(ctx, this.orient, "Z", "e", right, this.outputs.Z)
            drawLabel(ctx, this.orient, "V", "e", right, this.outputs.V)
            drawLabel(ctx, this.orient, "Cout", "e", right, this.outputs.Cout)
            drawLabel(ctx, this.orient, "Run state", "e", right, this.outputs.RunningState)

            if (this._showOpCode) {
                const opCodeName = isUnknown(this.opCode) ? "??" : CPUOpCode.shortName(this.opCode)
                const size = opCodeName.length === 1 ? 25 : opCodeName.length === 2 ? 17 : 13
                g.font = `bold ${size}px sans-serif`
                g.fillStyle = COLOR_COMPONENT_BORDER
                g.textAlign = "center"
                g.textBaseline = "middle"
                g.fillText(opCodeName, ...ctx.rotatePoint(this.posX + 5, this.posY))
            }

            if (this._showOperands) {
                const operandsValue = displayValuesFromArray(this.operands, true)[1]
                const operandsString = formatWithRadix(operandsValue, 2, this.numDataBits, true)
                g.font = `bold 13px sans-serif`
                g.fillStyle = COLOR_COMPONENT_BORDER
                g.textAlign = "center"
                g.textBaseline = "top"
                g.fillText(operandsString, ...ctx.rotatePoint(this.posX + 5, this.posY + 20))
            }
        })
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        const s = S.Components.CPU.contextMenu
        const iconOpCode = this._showOpCode ? "check" : "none"
        const toggleShowOpCodeItem = MenuData.item(iconOpCode, s.toggleShowOpCode, () => {
            this.doSetShowOpCode(!this._showOpCode)
        })
        const iconOperands = this._showOperands ? "check" : "none"
        const toggleShowOperandsItem = MenuData.item(iconOperands, s.toggleShowOpCode, () => {
            this.doSetShowOperands(!this._showOperands)
        })

        return [
            //...makeTriggerItems(this._trigger, this.doSetTrigger.bind(this)),
            ["mid", toggleShowOpCodeItem],
            ["mid", toggleShowOperandsItem],
            ["mid", MenuData.sep()],
            this.makeChangeParamsContextMenuItem("inputs", S.Components.Generic.contextMenu.ParamNumAddressBits, this.numAddressInstructionBits, "addressInstructionBits"),
            //this.makeChangeParamsContextMenuItem("inputs", S.Components.Generic.contextMenu.ParamNumBits, this.numInstructionBits, "instructionBits"),
            //this.makeChangeBooleanParamsContextMenuItem(s.ParamUseExtendedOpCode, this.usesExtendedOpCode, "extOpCode"),
            //["mid", MenuData.sep()],
            //...makeTriggerItems(this._trigger, this.doSetTrigger.bind(this)),
            ["mid", MenuData.sep()],
            ...this.makeForceOutputsContextMenuItem(),
        ]
    }

    protected makeCPUSpecificContextMenuItems(): MenuItems {
        return []
    }

    public allZeros(vals: LogicValue[]): LogicValue {
        for (const v of vals) {
            if (isUnknown(v) || isHighImpedance(v)) {
                return Unknown
            }
            if (v === true) {
                return false
            }
        }
        return true
    }

}
/*
export const CPUDef =
    defineParametrizedComponent("rom", true, true, {
        variantName: ({ addressInstructionBits }) => `CPU-${addressInstructionBits}`,
        idPrefix: "CPU",
        ...CPUBaseDef,
    })

*/
export const CPUDef =
    defineParametrizedComponent("CPU", true, true, {
        variantName: ({ addressInstructionBits }) => `CPU-${addressInstructionBits}`,
        idPrefix: "CPU",
        button: { imgWidth: 40 },
        repr: {
            ...CPUBaseDef.repr,
            trigger: typeOrUndefined(t.keyof(EdgeTrigger)),
        },
        valueDefaults: {
            ...CPUBaseDef.valueDefaults,
            trigger: EdgeTrigger.falling,
        },
        params: {
            instructionBits: CPUBaseDef.params.instructionBits,
            addressInstructionBits: CPUBaseDef.params.addressInstructionBits,
            dataBits: CPUBaseDef.params.dataBits,
            addressDataBits: CPUBaseDef.params.addressDataBits,
            //extOpCode: CPUBaseDef.params.extOpCode,
        },
        validateParams: ({ instructionBits, addressInstructionBits, dataBits, addressDataBits}) => ({
            numInstructionBits: instructionBits,
            numAddressInstructionBits: addressInstructionBits,
            numDataBits: dataBits,
            numAddressDataBits: addressDataBits,
            //usesExtendedOpCode: extOpCode,
        }),
        initialValue: (saved, {numAddressInstructionBits, numDataBits}) => {
            /*
            if (saved === undefined) {
                return CPUBase.defaultValue(numAddressInstructionBits, numDataBits)
            }
            */
            const false_ = false as LogicValue
            return {
                isaadr: ArrayFillWith(false_, numAddressInstructionBits),
                dadr: ArrayFillWith(false_, numDataBits),
                dout: ArrayFillWith(false_, numDataBits),
                ramsync: false_,
                ramwe: false_,
                resetsync: false_,
                sync: false_,
                z: false_,
                v: false_,
                cout: false_,
                runningstate: false_,
            }
        },
        size: () => ({
            //gridWidth: 7,
            //gridHeight: 19 + Math.max(0, numDataBits - 8) * 2,
            gridWidth: 32,
            gridHeight: 32,
        }),
        makeNodes: (params, defaults) => {
            const base = CPUBaseDef.makeNodes(params, defaults)
            return {
                ins: {
                    ...base.ins,
                },
                outs: {
                    ...base.outs,
                },
            }
        }
    })

export type CPURepr = Repr<typeof CPUDef>
export type CPUParams = ResolvedParams<typeof CPUDef>

export class CPU extends CPUBase<CPURepr> {

    private _trigger: EdgeTrigger = CPUDef.aults.trigger
    private _lastClock: LogicValue = Unknown

    public constructor(parent: DrawableParent, params: CPUParams, saved?: CPURepr) {
        super(parent, CPUDef.with(params) as any, params, saved)

        this._trigger = saved?.trigger ?? CPUDef.aults.trigger
    }

    public toJSON() {
        return {
            ...this.toJSONBase(),
            trigger: (this._trigger !== CPUDef.aults.trigger) ? this._trigger : undefined,
        }
    }

    protected get moduleName() {
        return "CPU"
    }

    public get trigger() {
        return this._trigger
    }

    protected doSetTrigger(trigger: EdgeTrigger) {
        this._trigger = trigger
        this.setNeedsRedraw("trigger changed")
    }
    /*
    public setTrigger(trigger: EdgeTrigger) {
        this._trigger = trigger
    }
    */

    protected doRecalcValue(): CPUBaseValue {
        const isa = this.inputValues(this.inputs.Isa)

        // Needs to revert all inputs to be compatible with choosen ISA
        this.setInputValues(this._instructionRegister.inputs.D, isa, true)

        //this._instructionRegister.makeStateAfterClock()

        const opCodeValue = this.getOutputValues(this._instructionRegister.outputs.Q).slice(0,4).reverse()
        const opCode = this.opCode

        this._ALU.inputs.Mode.value = opCodeValue[2]
        this._ALU.inputs.Op[2].value = opCodeValue[1]
        this._ALU.inputs.Op[1].value = !opCodeValue[3]
        this._ALU.inputs.Op[0].value = opCodeValue[0]

        const commonInstructionMuxSelect = !opCodeValue[3] && !opCodeValue[2]
        this._instructionMux.inputs.S[1].value = commonInstructionMuxSelect && opCodeValue[1]
        this._instructionMux.inputs.S[0].value = (commonInstructionMuxSelect && opCodeValue[0]) || (opCodeValue[3] && !opCodeValue[1]) || (opCodeValue[3] && opCodeValue[2])

        const operands = this.operands

        this.setInputValues(this._instructionMux.inputs.I[3], operands)
        this.setInputValues(this._instructionMux.inputs.I[2], this.inputValues(this.inputs.Din))
        this.setInputValues(this._instructionMux.inputs.I[1], this.getOutputValues(this._ALU.outputs.S))
        this.setInputValues(this._instructionMux.inputs.I[0], this.getOutputValues(this._accumulatorRegister.outputs.Q))

        this.setInputValues(this._accumulatorRegister.inputs.D, this.getOutputValues(this._instructionMux.outputs.Z))

        this.setInputValues(this._ALU.inputs.A, this.getOutputValues(this._accumulatorRegister.outputs.Q))
        this.setInputValues(this._ALU.inputs.B, this.inputValues(this.inputs.Din))

        const z = this.allZeros(this.getOutputValues(this._instructionMux.outputs.Z))
        const c = this.outputs.Cout.value

        const jumpControl = opCodeValue[2] && !opCodeValue[3]
        const noJump = !(((((opCodeValue[0] && z) || (!opCodeValue[0] && c)) && opCodeValue[1]) || !opCodeValue[1]) && jumpControl)
        const backwardJump = (opCodeValue[0] && !opCodeValue[1]) && jumpControl

        this._flagsRegister.inputs.D[1].value = z
        this._flagsRegister.inputs.D[1].value = c

        this._programCounterMux.inputs.S[0].value = !noJump

        this.setInputValues(this._programCounterMux.inputs.I[1], this.getOutputValues(this._previousProgramCounterRegister.outputs.Q))
        this.setInputValues(this._programCounterMux.inputs.I[0], this.getOutputValues(this._programCounterRegister.outputs.Q))

        this._programCounterALU.inputs.Mode.value = false
        this._programCounterALU.inputs.Op[2].value = false
        this._programCounterALU.inputs.Op[1].value = noJump
        this._programCounterALU.inputs.Op[0].value = backwardJump

        this.setInputValues(this._programCounterALU.inputs.A, this.getOutputValues(this._programCounterMux.outputs.Z))
        // A clone of the array "operands" array is needed cause ArrayClamOrPad returns the array
        const BinputValueProgramCounterALU = operands.slice()
        this.setInputValues(this._programCounterALU.inputs.B, ArrayClampOrPad(BinputValueProgramCounterALU, this.numAddressInstructionBits, false))

        this.setInputValues(this._programCounterRegister.inputs.D, this.getOutputValues(this._programCounterALU.outputs.S))
        this.setInputValues(this._previousProgramCounterRegister.inputs.D, this.getOutputValues(this._programCounterRegister.outputs.Q))

        const haltOpCodeSignal = opCodeValue[3] && !opCodeValue[2] && opCodeValue[1] && !opCodeValue[0]

        this._runStopFlipflopD.inputs.Clock.value = (haltOpCodeSignal && this._autoManMux.outputs.Z[0].value) || this.inputs.RunStop.value
        this._runStopFlipflopD.inputs.D.value = this._runStopFlipflopD.outputs.Q̅.value

        this._clockSpeedMux.inputs.S[0].value = this.inputs.Speed.value
        this._clockSpeedMux.inputs.I[1][0].value = this.inputs.ClockF.value
        this._clockSpeedMux.inputs.I[0][0].value = this.inputs.ClockS.value

        this._autoManMux.inputs.S[0].value = this._runStopFlipflopD.outputs.Q.value
        this._autoManMux.inputs.I[1][0].value = this._clockSpeedMux.outputs.Z[0].value
        this._autoManMux.inputs.I[0][0].value = this.inputs.ManStep.value

        this._runningStateMux.inputs.S[0].value = this._runStopFlipflopD.outputs.Q̅.value
        this._runningStateMux.inputs.I[1][0].value = this.inputs.ManStep.value && this._runStopFlipflopD.outputs.Q̅.value
        this._runningStateMux.inputs.I[0][0].value = this._runStopFlipflopD.outputs.Q.value

        const prevClock = this._lastClock
        //const clockSync = this._lastClock = this._autoManMux.outputs.Z[0].value
        const clockSync = this._autoManMux.outputs.Z[0].value
        this._instructionRegister.inputs.Clock.value = clockSync
        this._accumulatorRegister.inputs.Clock.value = clockSync
        this._flagsRegister.inputs.Clock.value = clockSync
        this._programCounterRegister.inputs.Clock.value  = clockSync
        this._previousProgramCounterRegister.inputs.Clock.value = clockSync

        const clrSignal = this.inputs.Reset.value && this._runStopFlipflopD.outputs.Q̅.value

        this._instructionRegister.inputs.Clr.value = clrSignal
        this._accumulatorRegister.inputs.Clr.value = clrSignal
        this._flagsRegister.inputs.Clr.value = clrSignal
        this._programCounterRegister.inputs.Clr.value  = clrSignal
        this._previousProgramCounterRegister.inputs.Clr.value = clrSignal
        this._runStopFlipflopD.inputs.Clr.value = clrSignal

        if (isUnknown(opCode)) {
            return {
                isaadr: ArrayFillWith(Unknown, this.numAddressInstructionBits),
                dadr: ArrayFillWith(Unknown, this.numDataBits),
                dout: ArrayFillWith(Unknown, this.numDataBits),
                ramsync: Unknown,
                ramwe: Unknown,
                resetsync: Unknown,
                sync: Unknown,
                z: Unknown,
                v: Unknown,
                cout: Unknown,
                runningstate: Unknown,
            }
        }

        //return doCPUOpCode(op, din, isa)
        //return doCPUOpCode(opCode, isa, operands, this.numAddressInstructionBits, runstate)
        return {
            isaadr: this.getOutputValues(this._programCounterRegister.outputs.Q),
            dadr: operands,
            dout: this.getOutputValues(this._accumulatorRegister.outputs.Q),
            ramsync: clockSync,
            ramwe: opCodeValue[3] && !opCodeValue[2] && opCodeValue[1] && opCodeValue[0],
            resetsync: clrSignal,
            sync: clockSync,
            z: this._flagsRegister.outputs.Q[0].value,
            v: false,
            cout: this._flagsRegister.outputs.Q[1].value,
            runningstate: this._runningStateMux.outputs.Z[0].value,
        }
    }

    public override makeTooltip() {
        const opCode = this.opCode
        const s = S.Components.CPU.tooltip
        const opCodeDesc = isUnknown(opCode) ? s.SomeUnknownInstruction : s.ThisInstruction + " " + CPUOpCode.fullName(opCode)
        return tooltipContent(s.title, mods(
            div(`${s.CurrentlyCarriesOut} ${opCodeDesc}.`)
        ))
    }

    public override makeComponentSpecificContextMenuItems(): MenuItems {
        return [
            ...makeTriggerItems(this._trigger, this.doSetTrigger.bind(this)),
            ["mid", MenuData.sep()],
            ...super.makeComponentSpecificContextMenuItems(),
        ]
    }
/*
    public makeStateAfterClock(): CPUBaseValue {
        return this.makeStateFromMainValue(LogicValue.filterHighZ(this.doRecalcValueAfterClock()))
    }

    public doRecalcValueAfterClock(): LogicValue {
        return true
        //return CPUBaseValue.filterHighZ(this.inputs._all)
    }
*/
    protected override() {
        return [
            ...makeTriggerItems(this._trigger, this.doSetTrigger.bind(this)),

            ["mid", MenuData.sep()],
        ]
    }

}

CPUDef.impl = CPU
/*
function allZeros(vals: LogicValue[]): LogicValue {
    for (const v of vals) {
        if (isUnknown(v) || isHighImpedance(v)) {
            return Unknown
        }
        if (v === true) {
            return false
        }
    }
    return true
}
*/
/*
protected doCPUOpCode(opCode: CPUOpCode, isa: readonly LogicValue[], operands: LogicValue[], numAddressInstructionBits: number, runstate: LogicValue):
CPUValue {
    const numDataBits = 4
    const numOpBits = 4
    //const numDataBits = din.length
    switch (opCode) {
        case "NOP":
            return {
                isaadr: ArrayFillWith(false, numAddressInstructionBits),
                dadr: ArrayFillWith(true, numDataBits),
                //dout: ArrayFillWith(true, numDataBits),
                dout: operands,
                ramsync: false,
                ramwe: false,
                resetsync: false,
                sync: false,
                z: false,
                v: false,
                cout: false,
                runningstate: runstate,
            }
        case "DEC":
            break;
        case "LDM":
            break;
        case "LDK":
            break;
        case "GDW":
            break;
        case "GUP":
            break;
        case "JIZ":
            break;
        case "JIC":
            break;
        case "ADM":
            break;
        case "SBM":
            break;
        case "HLT":
            break;
        case "STM":
            break;
        case "ORM":
            break;
        case "ANM":
            break;
        case "NOT":
            break;
        case "XRM":
            break;
        default:
            return {
                isaadr: ArrayFillWith(false, numAddressInstructionBits),
                dadr: ArrayFillWith(false, numDataBits),
                dout: ArrayFillWith(true, numDataBits),
                ramsync: false,
                ramwe: false,
                resetsync: false,
                sync: false,
                z: false,
                v: false,
                cout: false,
                runningstate: false,
            }
    }
    return {
        isaadr: ArrayFillWith(false, numAddressInstructionBits),
        dadr: ArrayFillWith(false, numDataBits),
        dout: ArrayFillWith(true, numDataBits),
        ramsync: false,
        ramwe: false,
        resetsync: false,
        sync: false,
        z: false,
        v: false,
        cout: false,
        runningstate: false,
    }
}
*/
/*
    public get opCode(): CPUOpCode | Unknown {
        //const opValues = this.inputValues(this.inputs.Isa.reverse()).slice(0,4)
        const opCodeValues = this.getOutputValues(this._instructionRegister.outputs.Q).slice(0,4)
        //opValues.push(this.inputs.Mode.value)
        const opCodeIndex = displayValuesFromArray(opCodeValues, true)[1]
        // TO DO
        //return isUnknown(opIndex) ? Unknown : (this.usesExtendedOpCode ? CPUOpCodes : CPUOpCodesExtended)[opIndex]
        return isUnknown(opCodeIndex) ? Unknown : (this.usesExtendedOpCode ? CPUOpCodes : CPUOpCodes)[opCodeIndex]
    }

    public get operands(): CPUoperands | Unknown{
        const operandsValues = this.getOutputValues(this._instructionRegister.outputs.Q).slice(4,8)
        return operandsValues
    }

    protected doRecalcValue(): CPUValue {
        const isa = this.inputValues(this.inputs.Isa)

        // Needs to revert all inputs to be compatible with choosen ISA
        this.setInputValues(this._instructionRegister.inputs.D, isa, true)

        //this._instructionRegister.makeStateAfterClock()

        const opCodeValues = this.getOutputValues(this._instructionRegister.outputs.Q).slice(0,4).reverse()
        const opCode = this.opCode

        this._ALU.inputs.Mode.value = opCodeValues[2]
        this._ALU.inputs.Op[2].value = opCodeValues[1]
        this._ALU.inputs.Op[1].value = !opCodeValues[3]
        this._ALU.inputs.Op[0].value = opCodeValues[0]

        const commonInstructionMuxSelect = !opCodeValues[3] && !opCodeValues[2]
        this._instructionMux.inputs.S[1].value = commonInstructionMuxSelect && opCodeValues[1]
        this._instructionMux.inputs.S[0].value = (commonInstructionMuxSelect && opCodeValues[0]) || (opCodeValues[3] && !opCodeValues[1]) || (opCodeValues[3] && opCodeValues[2])

        const operands = this.getOutputValues(this._instructionRegister.outputs.Q).slice(4,8).reverse()

        this.setInputValues(this._instructionMux.inputs.I[3], operands)
        this.setInputValues(this._instructionMux.inputs.I[2], this.inputValues(this.inputs.Din))
        this.setInputValues(this._instructionMux.inputs.I[1], this.getOutputValues(this._ALU.outputs.S))
        this.setInputValues(this._instructionMux.inputs.I[0], this.getOutputValues(this._accumulatorRegister.outputs.Q))

        this.setInputValues(this._accumulatorRegister.inputs.D, this.getOutputValues(this._instructionMux.outputs.Z))

        this.setInputValues(this._ALU.inputs.A, this.getOutputValues(this._accumulatorRegister.outputs.Q))
        this.setInputValues(this._ALU.inputs.B, this.inputValues(this.inputs.Din))

        const z = allZeros(this.getOutputValues(this._instructionMux.outputs.Z))
        const c = this.outputs.Cout.value

        const jumpControl = opCodeValues[2] && !opCodeValues[3]
        const noJump = !(((((opCodeValues[0] && z) || (!opCodeValues[0] && c)) && opCodeValues[1]) || !opCodeValues[1]) && jumpControl)
        const backwardJump = (opCodeValues[0] && !opCodeValues[1]) && jumpControl

        this._flagsRegister.inputs.D[1].value = z
        this._flagsRegister.inputs.D[1].value = c

        this._programCounterMux.inputs.S[0].value = !noJump

        this._programCounterALU.inputs.Mode.value = false
        this._programCounterALU.inputs.Op[2].value = false
        this._programCounterALU.inputs.Op[1].value = noJump
        this._programCounterALU.inputs.Op[0].value = backwardJump

        this.setInputValues(this._programCounterMux.inputs.I[1], this.getOutputValues(this._programCounterRegister.outputs.Q))
        this.setInputValues(this._programCounterMux.inputs.I[0], this.getOutputValues(this._previousProgramCounterRegister.outputs.Q))

        this.setInputValues(this._programCounterRegister.inputs.D, this.getOutputValues(this._programCounterALU.outputs.S))
        this.setInputValues(this._previousProgramCounterRegister.inputs.D, this.getOutputValues(this._programCounterRegister.outputs.Q))

        this.setInputValues(this._programCounterALU.inputs.A, this.getOutputValues(this._programCounterMux.outputs.Z))
        // A clone of the array "operands" array is needed cause ArrayClamOrPad returns the array
        const BinputValueProgramCounterALU = operands.slice()
        this.setInputValues(this._programCounterALU.inputs.B, ArrayClampOrPad(BinputValueProgramCounterALU, this.numAddressInstructionBits, false))

        const haltOpCodeSignal = opCodeValues[3] && !opCodeValues[2] && opCodeValues[1] && !opCodeValues[0]

        this._runStopFlipflopD.inputs.Clock.value = (haltOpCodeSignal && this._autoManMux.outputs.Z[0].value) || this.inputs.RunStop.value
        this._runStopFlipflopD.inputs.D.value = this._runStopFlipflopD.outputs.Q̅.value

        this._clockSpeedMux.inputs.S[0].value = this.inputs.Speed.value
        this._clockSpeedMux.inputs.I[1][0].value = this.inputs.ClockF.value
        this._clockSpeedMux.inputs.I[0][0].value = this.inputs.ClockS.value

        this._autoManMux.inputs.S[0].value = this._runStopFlipflopD.outputs.Q.value
        this._autoManMux.inputs.I[1][0].value = this._clockSpeedMux.outputs.Z[0].value
        this._autoManMux.inputs.I[0][0].value = this.inputs.ManStep.value

        this._runningStateMux.inputs.S[0].value = this._runStopFlipflopD.outputs.Q̅.value
        this._runningStateMux.inputs.I[1][0].value = this.inputs.ManStep.value && this._runStopFlipflopD.outputs.Q̅.value
        this._runningStateMux.inputs.I[0][0].value = this._runStopFlipflopD.outputs.Q.value

        const prevClock = this._lastClock
        const clockSync = this._lastClock = this._autoManMux.outputs.Z[0].value
        this._instructionRegister.inputs.Clock.value = clockSync
        this._accumulatorRegister.inputs.Clock.value = clockSync
        this._flagsRegister.inputs.Clock.value = clockSync
        this._programCounterRegister.inputs.Clock.value  = clockSync
        this._previousProgramCounterRegister.inputs.Clock.value = clockSync

        const clrSignal = this.inputs.Reset.value && this._runStopFlipflopD.outputs.Q̅.value

        this._instructionRegister.inputs.Clr.value = clrSignal
        this._accumulatorRegister.inputs.Clr.value = clrSignal
        this._flagsRegister.inputs.Clr.value = clrSignal
        this._programCounterRegister.inputs.Clr.value  = clrSignal
        this._previousProgramCounterRegister.inputs.Clr.value = clrSignal
        this._runStopFlipflopD.inputs.Clr.value = clrSignal

        if (isUnknown(opCode)) {
            return {
                    isaadr: ArrayFillWith(Unknown, this.numAddressInstructionBits),
                    dadr: ArrayFillWith(Unknown, this.numDataBits),
                    dout: ArrayFillWith(Unknown, this.numDataBits),
                    ramsync: false,
                    ramwe: false,
                    resetsync: false,
                    sync: false,
                    z: false,
                    v: false,
                    cout: false,
                    runningstate: false,
                }
        }

        //return doCPUOpCode(op, din, isa)
        //return doCPUOpCode(opCode, isa, operands, this.numAddressInstructionBits, runstate)
        return {
            isaadr: this.getOutputValues(this._programCounterRegister.outputs.Q),
            dadr: operands,
            dout: this.getOutputValues(this._accumulatorRegister.outputs.Q),
            ramsync: clockSync,
            ramwe: opCodeValues[3] && !opCodeValues[2] && opCodeValues[1] && opCodeValues[0],
            resetsync: clrSignal,
            sync: clockSync,
            z: this._flagsRegister.outputs.Q[0].value,
            v: false,
            cout: this._flagsRegister.outputs.Q[1].value,
            runningstate: this._runningStateMux.outputs.Z[0].value,
        }
    }

    protected override propagateValue(newValue: CPUValue) {
        this.outputValues(this.outputs.Isaadr , newValue.isaadr)
        this.outputValues(this.outputs.Dadr , newValue.dadr)
        this.outputValues(this.outputs.Dout , newValue.dout)
        this.outputs.RAMsync.value = newValue.ramsync
        this.outputs.RAMwe.value = newValue.ramwe
        this.outputs.ResetSync.value = newValue.resetsync
        this.outputs.Sync.value = newValue.sync
        this.outputs.Z.value = newValue.z
        //this.outputs.Z.value = allZeros(newValue.dout)
        this.outputs.V.value = newValue.v
        this.outputs.Cout.value = newValue.cout
        this.outputs.RunningState.value = newValue.runningstate
    }

    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {
        const bounds = this.bounds()
        const { left, top, right, bottom } = bounds
        const lowerTop = top - 2 * GRID_STEP
        const lowerBottom = top - 2 * GRID_STEP
        const lowerLeft = left - 2 * GRID_STEP
        const lowerRight = right - 2 * GRID_STEP

        // for debug
        //this._instructionRegister.posX = 100
        //this._instructionRegister.posY = 100
        //this._instructionRegister.doDraw(g, ctx)
        //this._instructionMux.doDraw(g, ctx)

        // inputs
        for (const input of this.inputs.Isa) {
            drawWireLineToComponent(g, input, left, input.posYInParentTransform)
        }
        for (const input of this.inputs.Din) {
            drawWireLineToComponent(g, input, input.posXInParentTransform, bottom)
        }
        drawWireLineToComponent(g, this.inputs.Reset, this.inputs.Reset.posXInParentTransform, bottom)
        drawWireLineToComponent(g, this.inputs.ManStep, this.inputs.ManStep.posXInParentTransform, bottom)
        drawWireLineToComponent(g, this.inputs.Speed, this.inputs.Speed.posXInParentTransform, bottom)
        drawWireLineToComponent(g, this.inputs.ClockS, this.inputs.ClockS.posXInParentTransform, bottom)
        drawWireLineToComponent(g, this.inputs.ClockF, this.inputs.ClockF.posXInParentTransform, bottom)
        drawWireLineToComponent(g, this.inputs.RunStop, this.inputs.RunStop.posXInParentTransform, bottom)

        // outputs
        for (const output of this.outputs.Isaadr) {
            drawWireLineToComponent(g, output, output.posXInParentTransform, top)
        }
        for (const output of this.outputs.Dout) {
            drawWireLineToComponent(g, output, right, output.posYInParentTransform)
        }
        for (const output of this.outputs.Dadr) {
            drawWireLineToComponent(g, output, output.posXInParentTransform, top)
        }
        drawWireLineToComponent(g, this.outputs.ResetSync, right, this.outputs.ResetSync.posYInParentTransform)
        drawWireLineToComponent(g, this.outputs.Sync, right, this.outputs.Sync.posYInParentTransform)
        drawWireLineToComponent(g, this.outputs.RAMsync, right, this.outputs.RAMsync.posYInParentTransform)
        drawWireLineToComponent(g, this.outputs.RAMwe, right, this.outputs.RAMwe.posYInParentTransform)
        drawWireLineToComponent(g, this.outputs.Z, right, this.outputs.Z.posYInParentTransform)
        drawWireLineToComponent(g, this.outputs.V, right, this.outputs.V.posYInParentTransform)
        drawWireLineToComponent(g, this.outputs.Cout, right, this.outputs.Cout.posYInParentTransform)
        drawWireLineToComponent(g, this.outputs.RunningState, right, this.outputs.RunningState.posYInParentTransform)

        // outline
        g.fillStyle = COLOR_BACKGROUND
        g.lineWidth = 3
        g.strokeStyle = ctx.borderColor

        g.beginPath()
        g.moveTo(left, top)
        g.lineTo(right, top)
        g.lineTo(right, bottom)
        g.lineTo(left, bottom)
        g.lineTo(left, top)
        g.closePath()
        g.fill()
        g.stroke()

        // groups
        this.drawGroupBox(g, this.inputs.Isa.group, bounds)
        this.drawGroupBox(g, this.inputs.Din.group, bounds)
        this.drawGroupBox(g, this.outputs.Isaadr.group, bounds)
        this.drawGroupBox(g, this.outputs.Dout.group, bounds)
        this.drawGroupBox(g, this.outputs.Dadr.group, bounds)

        // labels
        ctx.inNonTransformedFrame(ctx => {
            g.fillStyle = COLOR_COMPONENT_INNER_LABELS
            g.font = "11px sans-serif"

            // bottom inputs
            const isVertical = Orientation.isVertical(this.orient)
            const carryHOffsetF = isVertical ? 0 : 1
            drawLabel(ctx, this.orient, "Din", "s", this.inputs.Din, bottom)
            drawLabel(ctx, this.orient, "Reset", "s", this.inputs.Reset, bottom)
            drawLabel(ctx, this.orient, "Man Step", "s", this.inputs.ManStep, bottom)
            drawLabel(ctx, this.orient, "Speed", "s", this.inputs.Speed, bottom)
            drawLabel(ctx, this.orient, "Clock S", "s", this.inputs.ClockS, bottom)
            drawLabel(ctx, this.orient, "Clock F", "s", this.inputs.ClockF, bottom)
            drawLabel(ctx, this.orient, "Run/Stop", "s", this.inputs.RunStop, bottom)

            // top outputs
            drawLabel(ctx, this.orient, "IsaAdr", "n", this.outputs.Isaadr, top)
            drawLabel(ctx, this.orient, "DAdr", "n", this.outputs.Dadr, top)

            // left inputs
            drawLabel(ctx, this.orient, "Isa", "w", left, this.inputs.Isa)

            // right outputs
            drawLabel(ctx, this.orient, "Dout", "e", right, this.outputs.Dout)
            drawLabel(ctx, this.orient, "RAM Sync", "e", right, this.outputs.RAMsync)
            drawLabel(ctx, this.orient, "Reset Sync", "e", right, this.outputs.ResetSync)
            drawLabel(ctx, this.orient, "RAM WE", "e", right, this.outputs.RAMwe)
            drawLabel(ctx, this.orient, "Sync", "e", right, this.outputs.Sync)
            drawLabel(ctx, this.orient, "Z", "e", right, this.outputs.Z)
            drawLabel(ctx, this.orient, "V", "e", right, this.outputs.V)
            drawLabel(ctx, this.orient, "Cout", "e", right, this.outputs.Cout)
            drawLabel(ctx, this.orient, "Run state", "e", right, this.outputs.RunningState)

            if (this._showOpCode) {
                const opCodeName = isUnknown(this.opCode) ? "??" : CPUOpCode.shortName(this.opCode)
                const size = opCodeName.length === 1 ? 25 : opCodeName.length === 2 ? 17 : 13
                g.font = `bold ${size}px sans-serif`
                g.fillStyle = COLOR_COMPONENT_BORDER
                g.textAlign = "center"
                g.textBaseline = "middle"
                g.fillText(opCodeName, ...ctx.rotatePoint(this.posX + 5, this.posY))
            }
        })
    }

    private doSetShowOpCode(showOpCode: boolean) {
        this._showOpCode = showOpCode
        this.setNeedsRedraw("show opCodechanged")
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        const s = S.Components.CPU.contextMenu
        const icon = this._showOpCode ? "check" : "none"
        const toggleShowOpItem = MenuData.item(icon, s.toggleShowOpCode, () => {
            this.doSetShowOpCode(!this._showOpCode)
        })

        return [
            ...makeTriggerItems(this._trigger, this.doSetTrigger.bind(this)),
            ["mid", toggleShowOpItem],
            ["mid", MenuData.sep()],
            this.makeChangeParamsContextMenuItem("inputs", S.Components.Generic.contextMenu.ParamNumAddressBits, this.numAddressInstructionBits, "addressInstructionBits"),
            //this.makeChangeParamsContextMenuItem("inputs", S.Components.Generic.contextMenu.ParamNumBits, this.numInstructionBits, "instructionBits"),
            this.makeChangeBooleanParamsContextMenuItem(s.ParamUseExtendedOpCode, this.usesExtendedOpCode, "extOpCode"),
            //["mid", MenuData.sep()],
            //...makeTriggerItems(this._trigger, this.doSetTrigger.bind(this)),
            ["mid", MenuData.sep()],
            ...this.makeForceOutputsContextMenuItem(),
        ]
    }

}



export function doCPUOpCode(opCode: CPUOpCode, isa: readonly LogicValue[], operands: LogicValue[], numAddressInstructionBits: number, runstate: LogicValue):
    CPUValue {
    const numDataBits = 4
    const numOpBits = 4
    //const numDataBits = din.length
    switch (opCode) {
        case "NOP":
            return {
                isaadr: ArrayFillWith(false, numAddressInstructionBits),
                dadr: ArrayFillWith(true, numDataBits),
                //dout: ArrayFillWith(true, numDataBits),
                dout: operands,
                ramsync: false,
                ramwe: false,
                resetsync: false,
                sync: false,
                z: false,
                v: false,
                cout: false,
                runningstate: runstate,
            }
        case "DEC":
            break;
        case "LDM":
            break;
        case "LDK":
            break;
        case "GDW":
            break;
        case "GUP":
            break;
        case "JIZ":
            break;
        case "JIC":
            break;
        case "ADM":
            break;
        case "SBM":
            break;
        case "HLT":
            break;
        case "STM":
            break;
        case "ORM":
            break;
        case "ANM":
            break;
        case "NOT":
            break;
        case "XRM":
            break;
        default:
            return {
                isaadr: ArrayFillWith(false, numAddressInstructionBits),
                dadr: ArrayFillWith(false, numDataBits),
                dout: ArrayFillWith(true, numDataBits),
                ramsync: false,
                ramwe: false,
                resetsync: false,
                sync: false,
                z: false,
                v: false,
                cout: false,
                runningstate: false,
            }
    }
    return {
        isaadr: ArrayFillWith(false, numAddressInstructionBits),
        dadr: ArrayFillWith(false, numDataBits),
        dout: ArrayFillWith(true, numDataBits),
        ramsync: false,
        ramwe: false,
        resetsync: false,
        sync: false,
        z: false,
        v: false,
        cout: false,
        runningstate: false,
    }
}

CPUDef.impl = CPU
        /**
        // J type instructions
        case "GDW": return void
        case "GUP": return void
        case "JIZ": return void
        case "JIC": return void
        case "A+B": return doCPUAdd(a, b, cin)
        case "A*2": return doCPUAdd(a, a, cin)
        case "A+1": return doCPUAdd(a, [true, ...ArrayFillWith(false, numDataBits - 1)], cin)
        case "A/2": return doCPUSub([...a.slice(1), a[numDataBits - 1]], ArrayFillWith(false, numDataBits), cin)
        case "A-1": return doCPUSub(a, [true, ...ArrayFillWith(false, numDataBits - 1)], cin)
        case "A-B": return doCPUSub(a, b, cin)
        case "B-A": return doCPUSub(b, a, cin)
        case "-A": return doCPUSub(ArrayFillWith(false, numDataBits), a, cin)

        // D type instructions
        case "NOP": return void
        case "HLT": return void
        default: {
            let cout: LogicValue = false
            const s: LogicValue[] = (() => {
                switch (op) {
                    case "A|B": return doCPUBinOp("or", a, b)
                    case "A&B": return doCPUBinOp("and", a, b)
                    case "A^B": return doCPUBinOp("xor", a, b)
                    case "A|~B": return doCPUBinOp("or", a, doCPUNot(b))
                    case "A&~B": return doCPUBinOp("and", a, doCPUNot(b))
                    case "~A": return doCPUNot(a)
                    case "A>>": return [...a.slice(1), cin]
                    case "A<<":
                        cout = a[a.length - 1]
                        return [cin, ...a.slice(0, a.length - 1)]
                }
            })()
            return { s, v: false, cout }
        }
        // I type instructions
        case "LDK": return void
        case "DEC": return void
        case "NOT": return void

        // R type instructions
        case "LDM": return void
        case "ADM": return doALUAdd(a, b, cin)
        case "SBM": return void
        case "ORM": return void
        case "ANM": return void
        case "XRM": return void
        case "STM": return void
         **/

/*
export function doCPUAdd(a: readonly LogicValue[], b: readonly LogicValue[], cin: LogicValue): CPUValue {
    const numDataBits = a.length
    const sum3dataBits = (a: LogicValue, b: LogicValue, c: LogicValue): [LogicValue, LogicValue] => {
        const asNumber = (v: LogicValue) => v === true ? 1 : 0
        const numUnset = (isUnknown(a) || isHighImpedance(a) ? 1 : 0) + (isUnknown(b) || isHighImpedance(a) ? 1 : 0) + (isUnknown(c) || isHighImpedance(a) ? 1 : 0)
        const sum = asNumber(a) + asNumber(b) + asNumber(c)

        if (numUnset === 0) {
            // we know exactly
            return [sum % 2 === 1, sum >= 2]
        }
        if (numUnset === 1 && sum >= 2) {
            // carry will always be set
            return [Unknown, true]
        }
        // At this point, could be anything
        return [Unknown, Unknown]
    }

    const s: LogicValue[] = ArrayFillWith(Unknown, numDataBits)
    const cins: LogicValue[] = ArrayFillWith(Unknown, numDataBits + 1)
    cins[0] = cin
    for (let i = 0; i < numDataBits; i++) {
        const [ss, cout] = sum3dataBits(cins[i], a[i], b[i])
        s[i] = ss
        cins[i + 1] = cout
    }
    const cout = cins[numDataBits]
    const v = !isBoolean(cout) || !isBoolean(cins[numDataBits - 2]) ? Unknown : cout !== cins[numDataBits - 1]
    return { s, cout, v }
}

export function doCPUSub(a: readonly LogicValue[], b: readonly LogicValue[], cin: LogicValue): CPUValue {
    const numDataBits = a.length
    const s: LogicValue[] = ArrayFillWith(Unknown, numDataBits)
    const toInt = (vs: readonly LogicValue[]): number | undefined => {
        let s = 0
        let col = 1
        for (const v of vs) {
            if (isUnknown(v)) {
                return undefined
            }
            s += Number(v) * col
            col *= 2
        }
        return s
    }

    const aInt = toInt(a)
    const bInt = toInt(b)
    let cout: LogicValue = Unknown
    let v: LogicValue = Unknown
    if (aInt !== undefined && bInt !== undefined && isBoolean(cin)) {
        // otherwise, stick with default Unset Values everywhere
        let yInt = aInt - bInt - (cin ? 1 : 0)
        // console.log(`${aInt} - ${bInt} = ${yInt}`)
        // we can get anything from (max - (-min)) = 7 - (-8) = 15
        // to (min - max) = -8 - 7 = -15
        if (yInt < 0) {
            yInt += Math.pow(2, numDataBits)
        }
        // now we have everything between 0 and 15
        const yBinStr = (yInt >>> 0).toString(2).padStart(numDataBits, '0')
        const lastIdx = numDataBits - 1
        for (let i = 0; i < numDataBits; i++) {
            s[i] = yBinStr[lastIdx - i] === '1'
        }

        cout = bInt > (aInt - (cin ? 1 : 0))

        const aNeg = a[lastIdx] === true // NOT redundant comparison
        const bNeg = b[lastIdx] === true
        const yNeg = s[lastIdx] === true

        // see https://stackoverflow.com/a/34547815/390581
        // Signed integer overflow of the expression x-y-c (where c is again 0 or 1)
        // occurs if and only if x and y have opposite signs, and the sign of the 
        // result is opposite to that of x (or, equivalently, the same as that of y).
        v = aNeg !== bNeg && aNeg !== yNeg
    }

    return { s, cout, v }
}

function doCPUNot(a: readonly LogicValue[]): LogicValue[] {
    const not = Gate1Types.props.not.out
    return ArrayFillUsing(i => not([a[i]]), a.length)
}

function doCPUBinOp(op: Gate2toNType, a: readonly LogicValue[], b: readonly LogicValue[]) {
    const func = Gate2toNTypes.props[op].out
    return ArrayFillUsing(i => func([a[i], b[i]]), a.length)
}

 */