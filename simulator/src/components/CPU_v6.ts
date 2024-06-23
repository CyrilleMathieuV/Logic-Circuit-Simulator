import * as t from "io-ts"
import {
    COLOR_BACKGROUND,
    COLOR_COMPONENT_BORDER,
    COLOR_COMPONENT_INNER_LABELS,
    COLOR_CPUSTAGE_BACKGROUND,
    COLOR_CPUSTAGE_TEXT,
    displayValuesFromArray,
    drawLabel,
    drawWireLineToComponent,
    formatWithRadix,
    GRID_STEP,
    COLOR_EMPTY, COLOR_LABEL_OFF, COLOR_DARK_RED,
} from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import {
    allBooleans,
    ArrayClampOrPad,
    ArrayFillWith, binaryStringRepr,
    EdgeTrigger, hexStringRepr, isAllZeros,
    isHighImpedance,
    isUnknown,
    LogicValue,
    typeOrUndefined,
    Unknown,
} from "../utils"
import {
    defineAbstractParametrizedComponent,
    defineParametrizedComponent, ExtractParamDefs, ExtractParams,
    groupHorizontal,
    groupVertical, NodesIn, NodesOut,
    param,
    ParametrizedComponentBase,
    Repr,
    ResolvedParams, Value,
} from "./Component"
import {
    DrawableParent,
    DrawContext,
    DrawContextExt,
    GraphicsRendering,
    MenuData, MenuItem, MenuItemPlacement,
    MenuItems,
    Orientation,
} from "./Drawable"
import {
    Flipflop,
    FlipflopOrLatch, SyncComponent,
} from "./FlipflopOrLatch";
import { ALUOps, doALUOp } from "./ALU"
import { InternalFlipflopD } from "./InternalFlipflopD";
import { InternalRegister } from "./InternalRegister";
import { InternalCounter } from "./InternalCounter";
import { InternalComponent } from "./InternalComponent";


export const CPUOpCodes_v6 = [
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

export type CPUOpCode_v6 = typeof CPUOpCodes_v6[number]

export const CPUOpCode_v6 = {
    shortName(opCode: CPUOpCode_v6): string {
        return S.Components.CPU_v6[opCode][0]
    },
    fullName(opCode: CPUOpCode_v6): string {
        return S.Components.CPU_v6[opCode][1]
    },
}

export const CPUStages = [
    "FETCH", "DECODE", "EXECUTE",
    //0      1         2
] as const

export type CPUStage = typeof CPUStages[number]

export const CPUStageName = {
    shortName(stage: CPUStage): string {
        return S.Components.CPU.StageName[stage][0]
    },
    fullName(stage: CPUStage): string {
        return S.Components.CPU.StageName[stage][1]
    },
}

export const CPUStageColors = {
    green: "green",
    blue: "blue",
    orange: "orange",
    grey: "grey"
} as const

export type CPUStageColor = keyof typeof CPUStageColors

export const CPUStageColorList = Object.keys(CPUStageColors) as CPUStageColor[]

// Tricky thing : https://stackoverflow.com/questions/57086672/element-implicitly-has-an-any-type-because-expression-of-type-string-cant-b

export const CPUStageColorKey = {
    color: function (stage: CPUStage): CPUStageColor {
        const stageColor = S.Components.CPU.StageColor[stage]
        return CPUStageColors[stageColor as CPUStageColor]
    }
}

/*
export const CPUStageColorKey2 = {
    color: function (stage: CPUStage): string {
        return S.Components.CPU.StageColor[stage]
    }
}
*/

export const CPUBaseDef_v6 =
    defineAbstractParametrizedComponent( {
        button: { imgWidth: 40 },
        repr: {
            instructionAddressBits: typeOrUndefined(t.number),
            dataBits: typeOrUndefined(t.number),
            dataAddressBits: typeOrUndefined(t.number),
            showStage: typeOrUndefined(t.boolean),
            showOpCode: typeOrUndefined(t.boolean),
            showOperands: typeOrUndefined(t.boolean),
            disablePipeline: typeOrUndefined(t.boolean),
            showClockCycle : typeOrUndefined(t.boolean),
            addProgramRAM: typeOrUndefined(t.boolean),
            trigger: typeOrUndefined(t.keyof(EdgeTrigger)),
            //extOpCode: typeOrUndefined(t.boolean),
        },
        valueDefaults: {
            showStage: true,
            showOpCode: true,
            showOperands: true,
            disablePipeline: false,
            showClockCycle: true,
            addProgramRAM: false,
            trigger: EdgeTrigger.falling,
        },
        params: {
            instructionAddressBits: param(4, [4, 8]),
            dataBits: param(4, [4]),
            dataAddressBits: param(4, [4]),
            // future use
            // extOpCode: paramBool(), // has the extended opcode
        },
        validateParams: ({ instructionAddressBits, dataBits, dataAddressBits}) => ({
            numInstructionAddressBits: instructionAddressBits,
            numDataBits: dataBits,
            numDataAddressBits: dataAddressBits,
            //usesExtendedOpCode: extOpCode,
        }),
        size: ({ numDataBits }) => ({
            //gridWidth: 7,
            //gridHeight: 19 + Math.max(0, numDataBits - 8) * 2,
            gridWidth: 32,
            gridHeight: 32,
        }),
        makeNodes: ({ numInstructionAddressBits: numInstructionAddressBits, numDataBits, numDataAddressBits: numDataAddressBits, /*usesExtendedOpCode*/ gridWidth, gridHeight }) => {
            const bottom = gridHeight / 2
            const top = -bottom
            const right = gridWidth / 2
            const left = -right
            const inputX = right + 1.5
            const inputY = bottom + 1.5
            const midY = bottom / 2
            const midX = right / 2

            return {
                ins: {
                    RunStop: [-15, inputY, "s", "Run/Stop", { prefersSpike: true }],
                    Reset: [-13, inputY, "s", "Reset CPU", { prefersSpike: true }],
                    ManStep: [-11, inputY, "s","Man STEP", { prefersSpike: true }],
                    Speed: [-9, inputY, "s", "Select Clock"],
                    ClockS: [-7, inputY, "s", "Slow Clock", { isClock: true }],
                    ClockF: [-5, inputY, "s", "Fast Clock", { isClock: true }],
                    //Mode: opCodeMode,
                },
                outs: {
                    InstructionAddress: groupHorizontal("n", -midX, -inputY, numInstructionAddressBits),
                    DataAddress: groupHorizontal("n", midX, -inputY, numDataAddressBits),
                    DataOut: groupVertical("e", inputX, -midY, numDataBits),
                    RAMweSync: [inputX, 1, "e", "RAM WE sync"],
                    RAMwe: [inputX, 3, "e", "RAM WE"],
                    ResetSync: [inputX, 5, "e", "Reset sync"],
                    Sync: [inputX, 7, "e", "Sync"],
                    Z: [inputX, 9, "e", "Z (Zero)"],
                    //V: [inputX, 11, "e", "V (oVerflow)"],
                    Cout: [inputX, 11, "e", `Cout`],
                    HaltSignal: [inputX, 13, "e", `Halt`],
                    RunningState: [inputX, 15, "e", "Run state"],
                },
            }
        },
        //initialValue: (saved, defaults): [LogicValue, LogicValue] => {
        initialValue: (saved, defaults) => {
            const false_ = false as LogicValue
            const undefinedState = {
                instructionaddress: ArrayFillWith<LogicValue>(false_, defaults.numInstructionAddressBits),
                dataaddress: ArrayFillWith<LogicValue>(false_, defaults.numDataBits),
                dataout: ArrayFillWith<LogicValue>(false_, defaults.numDataBits),
                ramwesync: false_,
                ramwe: false_,
                resetsync: false_,
                sync: false_,
                z: false_,
                //v: false_,
                cout: false_,
                haltsignal: false,
                runningstate: false_,
            }
            let initialState
            if (saved === undefined) {
                initialState = undefinedState
            } else {
                initialState = {
                    instructionaddress: ArrayFillWith<LogicValue>(false_, defaults.numInstructionAddressBits),
                    dataaddress: ArrayFillWith<LogicValue>(false_, defaults.numDataBits),
                    dataout: ArrayFillWith<LogicValue>(false_, defaults.numDataBits),
                    ramwesync: false_,
                    ramwe: false_,
                    resetsync: false_,
                    sync: false_,
                    z: false_,
                    //v: false_,
                    cout: false_,
                    haltsignal: false,
                    runningstate: false_,
                }
            }
            //const state = saved.state === undefined ? defaults.state : toLogicValue(saved.state)
            return initialState
        }
    })

type CPUBaseValue_v6 = Value<typeof CPUBaseDef_v6>

export type CPUBaseRepr_v6 = Repr<typeof CPUBaseDef_v6>
export type CPUBaseParams_v6 = ResolvedParams<typeof CPUBaseDef_v6>

export abstract class CPUBase_v6<
    TRepr extends CPUBaseRepr_v6,
    TParamDefs extends ExtractParamDefs<TRepr> = ExtractParamDefs<TRepr>,
> extends ParametrizedComponentBase<
    TRepr,
    CPUBaseValue_v6,
    TParamDefs,
    ExtractParams<TRepr>,
    NodesIn<TRepr>,
    NodesOut<TRepr>,
    true, true
> {
    public readonly numInstructionAddressBits: number

    public readonly numDataBits: number
    public readonly numDataAddressBits: number

    protected _trigger: EdgeTrigger
    protected _isInInvalidState = false
    protected _lastClock: LogicValue = Unknown
    //public readonly usesExtendedOpCode: boolean

    protected _showStage: boolean

    protected _showOpCode: boolean
    protected _showOperands: boolean

    protected _enablePipeline: boolean

    protected _showClockCycle: boolean

    protected _addProgramRAM: boolean

    public _opCodeOperandsInStages : any

    protected constructor(parent: DrawableParent, SubclassDef: typeof CPUDef_v6, params: CPUBaseParams_v6, saved?: TRepr) {
        super(parent, SubclassDef.with(params as any) as any /* TODO */, saved)

        this.numInstructionAddressBits = params.numInstructionAddressBits

        this.numDataBits = params.numDataBits
        this.numDataAddressBits = params.numDataAddressBits

        this._opCodeOperandsInStages = { FETCH : "", DECODE : "", EXECUTE : ""}

        this._showStage = saved?.showStage ?? CPUDef_v6.aults.showStage

        this._showOpCode = saved?.showOpCode ?? CPUDef_v6.aults.showOpCode
        this._showOperands = saved?.showOperands ?? CPUDef_v6.aults.showOperands

        this._enablePipeline = saved?.disablePipeline ?? CPUDef_v6.aults.disablePipeline

        this._showClockCycle = saved?.showClockCycle ?? CPUDef_v6.aults.showClockCycle

        this._addProgramRAM = saved?.addProgramRAM ?? CPUDef_v6.aults.addProgramRAM


        this._trigger = saved?.trigger ?? CPUDef_v6.aults.trigger
    }

    protected abstract override doRecalcValue(): CPUBaseValue_v6

    public makeInvalidState(): CPUBaseValue_v6 {
        const false_ = false as LogicValue
        let newState : any
        newState = {
            instructionaddress: ArrayFillWith<LogicValue>(false_, this.numInstructionAddressBits),
            dataaddress: ArrayFillWith<LogicValue>(false_, this.numDataAddressBits),
            dataout: ArrayFillWith<LogicValue>(false_, this.numDataBits),
            ramwesync: false_,
            ramwe: false_,
            resetsync: false_,
            sync: false_,
            z: false_,
            //v: false_,
            cout: false_,
            haltsignal: false_,
            runningstate: false_
        }
        return newState as CPUBaseValue_v6
    }

    public makeStateFromMainValue(val: LogicValue): CPUBaseValue_v6 {
        let newState : any
        newState = {
            instructionaddress: ArrayFillWith<LogicValue>(val, this.numInstructionAddressBits),
            dataaddress: ArrayFillWith<LogicValue>(val, this.numDataAddressBits),
            datatout: ArrayFillWith<LogicValue>(val, this.numDataBits),
            ramwesync: val,
            ramwe: val,
            resetsync: val,
            sync: val,
            z: val,
            //v: val,
            cout: val,
            haltsignal: val,
            runningstate: val
        }
        return newState as CPUBaseValue_v6
    }

    //protected abstract makeStateAfterClock(): CPUBaseValue

    public get trigger() {
        return this._trigger
    }

    protected doSetTrigger(trigger: EdgeTrigger) {
        this._trigger = trigger
        this.setNeedsRedraw("trigger changed")
    }

    public override toJSONBase() {
        return {
            instructionAddressBits: this.numInstructionAddressBits === CPUDef_v6.aults.instructionAddressBits ? undefined : this.numInstructionAddressBits,
            dataBits: this.numDataBits === CPUDef_v6.aults.dataBits ? undefined : this.numDataBits,
            dataAddressBits: this.numDataAddressBits === CPUDef_v6.aults.dataAddressBits ? undefined : this.numDataAddressBits,
            ...super.toJSONBase(),
            //extOpCode: this.usesExtendedOpCode === CPUDef.aults.extOpCode ? undefined : this.usesExtendedOpCode,
            showStage: (this._showStage !== CPUDef_v6.aults.showStage) ? this._showStage : undefined,
            showOpCode: (this._showOpCode !== CPUDef_v6.aults.showOpCode) ? this._showOpCode : undefined,
            showOperands: (this._showOperands !== CPUDef_v6.aults.showOperands) ? this._showOperands : undefined,
            disablePipeline: (this._enablePipeline !== CPUDef_v6.aults.disablePipeline) ? this._enablePipeline : undefined,
            showClockCycle: (this._showClockCycle !== CPUDef_v6.aults.showClockCycle) ? this._showClockCycle : undefined,
            addProgramRAM: (this._addProgramRAM !== CPUDef_v6.aults.addProgramRAM) ? this._addProgramRAM : undefined,
            trigger: (this._trigger !== CPUDef_v6.aults.trigger) ? this._trigger : undefined,
        }
    }

    protected override propagateValue(newValue: CPUBaseValue_v6) {}

    private doSetShowStage(ShowStage: boolean) {
        this._showStage = ShowStage
        this.setNeedsRedraw("show stage changed")
    }

    private doSetShowOpCode(showOpCode: boolean) {
        this._showOpCode = showOpCode
        this.setNeedsRedraw("show opCode changed")
    }

    private doSetShowOperands(showOperands: boolean) {
        this._showOperands = showOperands
        this.setNeedsRedraw("show operands changed")
    }

    private doSetShowClockCycle(showClockCycle: boolean) {
        this._showClockCycle = showClockCycle
        this.setNeedsRedraw("show clockCycle changed")
    }

    public doAddProgramRAM(addProgramRAM: boolean) {
        this._addProgramRAM = addProgramRAM
        this.setNeedsRedraw("show assembler editor changed")
    }

    private doSetEnablePipeline(enabalePipeline: boolean) {
        this._enablePipeline = enabalePipeline
        this.setNeedsRedraw("show pipeline changed")
    }

    protected abstract doDrawGenericCaption(g: GraphicsRendering, ctx: DrawContextExt): void

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        const s = S.Components.CPU.contextMenu

        const iconStage = this._showStage ? "check" : "none"
        const toggleShowStageItem = MenuData.item(iconStage, s.toggleShowStage, () => {
            this.doSetShowStage(!this._showStage)
            this._showOpCode ? this.doSetShowOpCode(!this._showOpCode) : {}
        })
        const iconOpCode = this._showOpCode ? "check" : "none"
        const toggleShowOpCodeItem: MenuItems = !this._showStage ? [] : [
            ["mid", MenuData.item(iconOpCode, s.toggleShowOpCode,
                () => {this.doSetShowOpCode(!this._showOpCode)}
            )],
        ]
        const iconOperands = this._showOperands ? "check" : "none"
        const toggleShowOperandsItem: MenuItems = (!this._showStage || !this._showOpCode) ? [] : [
            ["mid", MenuData.item(iconOperands, s.toggleShowOperands,
                () => {this.doSetShowOperands(!this._showOperands)}
            )],
        ]

        const iconEnablePipeline = this._enablePipeline? "check" : "none"
        const toggleEnablePipelineItem = MenuData.item(iconEnablePipeline, s.toggleEnablePipeline, () => {
            this.doSetEnablePipeline(!this._enablePipeline)
        })

        const iconClockCycle = this._showClockCycle ? "check" : "none"
        const toggleShowClockCycleItem = MenuData.item(iconClockCycle, s.toggleShowClockCycle, () => {
            this.doSetShowClockCycle(!this._showClockCycle)
        })

        const iconAddProgramRAM = this._addProgramRAM ? "add" : "none"
        const toggleAddProgramRAMItem = MenuData.item(iconAddProgramRAM, s.toggleAddProgramRAM, () => {
            this.doAddProgramRAM(!this._addProgramRAM)
        })

        return [
            ["mid", toggleShowStageItem],
            ...toggleShowOpCodeItem,
            ...toggleShowOperandsItem,
            ["mid", MenuData.sep()],
            ["mid", toggleEnablePipelineItem],
            ["mid", MenuData.sep()],
            ["mid", toggleShowClockCycleItem],
            ["mid", MenuData.sep()],
            ["mid", toggleAddProgramRAMItem],
            ["mid", MenuData.sep()],
            this.makeChangeParamsContextMenuItem("inputs", S.Components.Generic.contextMenu.ParamNumAddressBits, this.numInstructionAddressBits, "instructionAddressBits"),
            ...this.makeCPUSpecificContextMenuItems(),
            ["mid", MenuData.sep()],
            //this.makeChangeBooleanParamsContextMenuItem(s.ParamUseExtendedOpCode, this.usesExtendedOpCode, "extOpCode"),
            //["mid", MenuData.sep()],
            ...this.makeForceOutputsContextMenuItem(),
        ]
    }

    protected makeCPUSpecificContextMenuItems(): MenuItems {
        return []
    }

    public getInstructionParts(instructionString: string, part :"opCode" | "operands"): string {
        const instructionParts = instructionString.split(/\++/)
        switch (part) {
            case "opCode":
                return instructionParts[0]
            case "operands":
                return instructionParts[1]
        }
    }

    public getOperandsNumberWithRadix(operands: LogicValue[], radix: number ) : string {
        const operandsValue = displayValuesFromArray(operands, true)[1]
        return formatWithRadix(operandsValue, radix, operands.length, true)
    }

    public allZeros(vals: LogicValue[]): LogicValue {
        for (const val of vals) {
            if (isUnknown(val) || isHighImpedance(val)) {
                return Unknown
            }
            if (val === true) {
                return false
            }
        }
        return true
    }

    private innerStateRepr<TrimEnd extends boolean>(innerComponent : InternalComponent, trimEnd : TrimEnd): TrimEnd extends false ? string : string | undefined {
        const result: string[] = []
        if (trimEnd) {
            let numToSkip = 0
        }
        return result as any
    }

}

export const CPUDef_v6 =
    defineParametrizedComponent("CPU", true, true, {
        variantName: ({ instructionAddressBits }) => `CPU-${instructionAddressBits}`,
        idPrefix: "CPU",
        ...CPUBaseDef_v6,
        repr: {
            ...CPUBaseDef_v6.repr,
            instructionBits: typeOrUndefined(t.number),
            directAddressingMode: typeOrUndefined(t.boolean),
            //trigger: typeOrUndefined(t.keyof(EdgeTrigger)),
        },
        valueDefaults: {
            ...CPUBaseDef_v6.valueDefaults,
            directAddressingMode: false,
            trigger: EdgeTrigger.falling,
        },
        params: {
            instructionAddressBits: CPUBaseDef_v6.params.instructionAddressBits,
            dataBits: CPUBaseDef_v6.params.dataBits,
            dataAddressBits: CPUBaseDef_v6.params.dataAddressBits,
            instructionBits: param(8, [8]),
            //extOpCode: CPUBaseDef.params.extOpCode,
        },
        validateParams: ({ instructionAddressBits, dataBits, dataAddressBits, instructionBits}) => ({
            numInstructionAddressBits: instructionAddressBits,
            numDataBits: dataBits,
            numDataAddressBits: dataAddressBits,
            numInstructionBits: instructionBits,
            //usesExtendedOpCode: extOpCode,
        }),
        makeNodes: (params, defaults) => {
            const base = CPUBaseDef_v6.makeNodes(params, defaults)
            const bottom = params.gridHeight / 2
            const top = -bottom
            const right = params.gridWidth / 2
            const left = -right
            const inputX = right + 1.5
            const inputY = bottom + 1.5
            const midY = bottom / 2
            const midX = right / 2
            return {
                ins: {
                    ...base.ins,
                    Instruction: groupVertical("w", -inputX, 0, params.numInstructionBits),
                    DataIn: groupHorizontal("s", midX, inputY, params.numDataBits),
                },
                outs: base.outs,
            }
        }
    })

type CPUValue_v6 = Value<typeof CPUDef_v6>

export type CPURepr_v6 = Repr<typeof CPUDef_v6>
export type CPUParams_v6 = ResolvedParams<typeof CPUDef_v6>

export class CPU_v6 extends CPUBase_v6<CPURepr_v6> {
    public readonly numInstructionBits: number
    private _directAddressingMode = CPUDef_v6.aults.directAddressingMode

    protected _mustGetFetchInstructionAgain : boolean

    protected _internalRunStopFlipflopD : InternalFlipflopD

    protected _internalInstructionRegister : InternalRegister

    protected _internalAccumulatorRegister : InternalRegister
    protected _internalFlagsRegister: InternalRegister

    protected _internalProgramCounterRegister : InternalRegister
    protected _internalPreviousProgramCounterRegister : InternalRegister

    //protected _internalSpecialVoidProgramCounterFlipflopD : InternalFlipflopD

    protected _internalFetchFlipflopD : InternalFlipflopD
    protected _internalDecodeFlipflopD : InternalFlipflopD
    protected _internalExecuteFlipflopD : InternalFlipflopD

    protected _internalHaltSignalFlipflopD : InternalFlipflopD

    protected _internalOperationStageCounter : InternalCounter

    private _noJump : LogicValue = true
    private _backwardJump : LogicValue = Unknown
    private _operandsValue : LogicValue[] = ArrayFillWith(false, this.numDataBits)

    public _currentAddressEvent : CustomEvent

    public constructor(parent: DrawableParent, params: CPUParams_v6, saved?: CPURepr_v6) {
        super(parent, CPUDef_v6, params, saved)

        this.numInstructionBits = params.numInstructionBits
        this._directAddressingMode = saved?.directAddressingMode ?? CPUDef_v6.aults.directAddressingMode
        this._trigger = saved?.trigger ?? CPUDef_v6.aults.trigger

        this._mustGetFetchInstructionAgain = true

        this._internalRunStopFlipflopD = new InternalFlipflopD(EdgeTrigger.falling)
        // this._control_RunStopState_InternalFlipflopD.inputClr = true
        // this._control_RunStopState_InternalFlipflopD.recalcInternalValue()

        this._internalHaltSignalFlipflopD = new InternalFlipflopD(EdgeTrigger.falling)
        // this._internalHaltSignalFlipflopD.inputClr = true
        // this._internalHaltSignalFlipflopD.recalcInternalValue()

        this._internalInstructionRegister = new InternalRegister(this.numInstructionBits, EdgeTrigger.falling)
        // const isaInit = this.inputValues(this.inputs.Instr)
        // Needs to revert all inputs to be compatible with choosen ISA
        // const isaInit_FETCH = isaInit.reverse()
        // this._fetchDecodeStage_Instruction_InternalRegister.inputsD = isaInit_FETCH

        // const isaInit_FETCH_opCodeValue = isaInit_FETCH.slice(0, 4).reverse()
        // const isaInit_FETCH_opCodeIndex = displayValuesFromArray(isaInit_FETCH_opCodeValue, false)[1]
        // const isaInit_FETCH_opCodeName = isUnknown(isaInit_FETCH_opCodeIndex) ? Unknown : CPUOpCodes[isaInit_FETCH_opCodeIndex]

        // const isaInit_FETCH_operands = isaInit_FETCH.slice(4, 8).reverse()
        // this._opCodeOperandsInStages = {FETCH: isaInit_FETCH_opCodeName + "+" + this.getOperandsNumberWithRadix(isaInit_FETCH_operands, 2), DECODE: "", EXECUTE: ""}
        // this._fetchDecodeStage_Instruction_InternalRegister.inputClr = true
        // this._fetchDecodeStage_Instruction_InternalRegister.recalcInternalValue()

        this._internalAccumulatorRegister = new InternalRegister(this.numDataBits, EdgeTrigger.falling)
        // this._Accumulator_InternalRegister.inputClr = true
        // this._fetchDecodeStage_Instruction_InternalRegister.recalcInternalValue()
        this._internalFlagsRegister = new InternalRegister(4, EdgeTrigger.falling)
        // this._Flags_InternalRegister.inputClr = true
        // this._Flags_InternalRegister.recalcInternalValue()

        this. _internalProgramCounterRegister = new InternalRegister(this.numInstructionAddressBits, EdgeTrigger.falling)
        // this. _ProgramCounterInternalRegister.inputClr = true
        // this. _ProgramCounterInternalRegister.recalcInternalValue()
        this. _internalPreviousProgramCounterRegister = new InternalRegister(this.numInstructionAddressBits, EdgeTrigger.falling)
        // this. _internalPreviousProgramCounterRegister.inputClr = true
        // this. _internalPreviousProgramCounterRegister.recalcInternalValue()


        //this._internalSpecialVoidProgramCounterFlipflopD = new InternalFlipflopD(EdgeTrigger.falling)

        this._internalFetchFlipflopD = new InternalFlipflopD(EdgeTrigger.falling)
        this._internalDecodeFlipflopD = new InternalFlipflopD(EdgeTrigger.falling)
        this._internalExecuteFlipflopD = new InternalFlipflopD(EdgeTrigger.falling)

        this._internalFetchFlipflopD.inputPre = true
        this._internalFetchFlipflopD.recalcInternalValue()
        this._internalDecodeFlipflopD.inputClr = true
        this._internalDecodeFlipflopD.recalcInternalValue()
        this._internalExecuteFlipflopD.inputClr = true
        this._internalExecuteFlipflopD.recalcInternalValue()

        this._internalOperationStageCounter = new InternalCounter(16, EdgeTrigger.falling, 10)
        // this._Operations_InternalCounter.inputClr = true
        // this._Operations_InternalCounter.recalcInternalValue()

        this._lastClock = Unknown

        this._currentAddressEvent = new CustomEvent("instructionAddress", {
            bubbles: true,
            detail: { text: () => this.outputs.InstructionAddress },
        });
    }

    public toJSON() {
        return {
            instructionBits: this.numInstructionBits === CPUDef_v6.aults.instructionBits ? undefined : this.numInstructionBits,
            ...this.toJSONBase(),
            directAddressingMode: (this._directAddressingMode !== CPUDef_v6.aults.directAddressingMode) ? this._directAddressingMode : undefined,
            trigger: (this._trigger !== CPUDef_v6.aults.trigger) ? this._trigger : undefined,
        }
    }

    protected get moduleName() {
        return "CPU_v6"
    }

    protected doSetDirectAddressingMode(directAddressingMode: boolean) {
        this._directAddressingMode = directAddressingMode
        this.setNeedsRedraw("directAddressingMode changed")
    }

    public static isClockTrigger(trigger: EdgeTrigger, prevClock: LogicValue, clock: LogicValue): boolean {
        return (trigger === EdgeTrigger.rising && prevClock === false && clock === true)
            || (trigger === EdgeTrigger.falling && prevClock === true && clock === false)
    }
    /*
        protected doRecalcValue(): CPUBaseValue {
            const false_ = false as LogicValue
            const result: any = {
                    instructionaddress: ArrayFillWith<LogicValue>(false_, this.numInstructionAddressBits),
                    dataaddress: ArrayFillWith<LogicValue>(false_, this.numDataAddressBits),
                    dataout: ArrayFillWith<LogicValue>(false_, this.numDataBits),
                    //instruction: ArrayFillWith<LogicValue>(false_, defaults.numInstructionBits),
                    //datatin: ArrayFillWith<LogicValue>(false_, defaults.numDataBits),
                    ramwesync: false_,
                    ramwe: false_,
                    resetsync: false_,
                    sync: false_,
                    z: false_,
                    //v: false_,
                    cout: false_,
                    haltsignal: false_,
                    runningstate: false_
                }
                return result as CPUBaseValue
        }
    */
    /*
    public static doRecalcValueForSyncComponent(trigger: EdgeTrigger, prevClock: LogicValue, clock: LogicValue, value: CPUBaseValue): CPUBaseValue {
        if (!CPU.isClockTrigger(trigger, prevClock, clock)) {
            return value
        } else {
            return this.makeStateAfterClock()
        }
    }
    */
    protected doRecalcValue(): CPUBaseValue_v6 {
        /*
         BE CAREFUL WITH .reverse()
         IT AFFECTS THE OBJECT !!!
          */
        // RUN CONTROL LOGIC
        const prevClock = this._lastClock
        const clockSpeed = this.inputs.Speed.value ? this.inputs.ClockF.value : this.inputs.ClockS.value
        const clockSync = this._lastClock = (this._internalRunStopFlipflopD.outputQ̅? this.inputs.ManStep.value : clockSpeed) && this._internalHaltSignalFlipflopD.outputQ̅
        const clrSignal = this.inputs.Reset.value && this._internalRunStopFlipflopD.outputQ̅

        const runningState = this._internalRunStopFlipflopD.outputQ̅ ? this.inputs.ManStep.value && !this._internalRunStopFlipflopD.outputQ̅: this._internalRunStopFlipflopD.outputQ
        //console.log((this._control_RunStopState_InternalFlipflopD.outputQ̅ ? this.inputs.ManStep.value : clockSpeed) && this._internalHaltSignalFlipflopD.outputQ̅)

        this._internalRunStopFlipflopD.inputD = this._internalRunStopFlipflopD.outputQ̅
        //console.log(this._internalHaltSignalFlipflopD.outputQ && clockSync)
        this._internalRunStopFlipflopD.inputClock = (this._internalHaltSignalFlipflopD.outputQ && clockSync) || this.inputs.RunStop.value

        this._internalRunStopFlipflopD.recalcInternalValue()

        /*
        if (InternalFlipflop.isInternalClockTrigger(this._control_RunStopState_InternalFlipflopD.trigger, prevClock, clockSync)) {
            if (prevClock) {
                if (!clockSync) {
                    console.log("Falling")
                    console.log("! ", this._control_RunStopState_InternalFlipflopD.value)
                }
            }
            if (clockSync) {
                if (prevClock) {
                    console.log("Rising")
                    console.log("* ", this._control_RunStopState_InternalFlipflopD.value)
                }
            }
            const newValue : LogicValue = LogicValue.filterHighZ(this._control_RunStopState_InternalFlipflopD.inputD)
            this._control_RunStopState_InternalFlipflopD.propagateInternalValue([newValue, !newValue])
        }
*/

        // CLR Button

        this._internalRunStopFlipflopD.inputClr = clrSignal
        this._internalHaltSignalFlipflopD.inputClr = clrSignal

        this._internalProgramCounterRegister.inputClr = clrSignal
        if (this._enablePipeline) {
            this._internalPreviousProgramCounterRegister.inputClr = clrSignal
        } else {
            this._internalFetchFlipflopD.inputPre = clrSignal
            this._internalDecodeFlipflopD.inputClr = clrSignal
            this._internalExecuteFlipflopD.inputClr = clrSignal
        }

        this._internalInstructionRegister.inputClr = clrSignal
        this._internalAccumulatorRegister.inputClr = clrSignal
        this._internalFlagsRegister.inputClr = clrSignal

        this._internalOperationStageCounter.inputClr = clrSignal

        // FETCH Stage

        const instruction = this.inputValues(this.inputs.Instruction)

        //const instruction = this.inputValues(this.inputs.Instr).map(LogicValue.filterHighZ)
        //console.log(this._internalFetchFlipflopD.outputQ)
        // Needs to revert all inputs to be compatible with choosen ISA
        const isa_FETCH = instruction.reverse()
        //console.log(this.getOperandsNumberWithRadix(isa_FETCH, 2))
        // naive approach !
        // this._fetchDecodeStage_Instruction_InternalRegister.inputsD = isa_FETCH
        InternalRegister.setInputValues(this._internalInstructionRegister.inputsD, isa_FETCH)
        // console.log("*",this._fetchDecodeStage_Instruction_InternalRegister.inputsD)

        const isa_FETCH_opCodeValue = isa_FETCH.slice(0, 4).reverse()
        const isa_FETCH_opCodeIndex = displayValuesFromArray(isa_FETCH_opCodeValue, false)[1]
        const isa_FETCH_opCodeName = isUnknown(isa_FETCH_opCodeIndex) ? Unknown : CPUOpCodes_v6[isa_FETCH_opCodeIndex]

        const isa_FETCH_operands = isa_FETCH.slice(4, 8).reverse()

        const cycle = this.cycle
        const stage = this._enablePipeline ? CPUStages[(cycle) % 3] : CPUStages[(cycle) % 3]

        if (clrSignal || cycle == 0) {
            //this._lastClock = Unknown
            this._opCodeOperandsInStages = {
                FETCH: isa_FETCH_opCodeName + "+" + this.getOperandsNumberWithRadix(isa_FETCH_operands, 2),
                DECODE: "",
                EXECUTE: ""
            }
        }

        if (CPU_v6.isClockTrigger(this._trigger, prevClock, clockSync)) {
            console.log(cycle, "-", stage, " * ", this.getOperandsNumberWithRadix(isa_FETCH, 2))
            console.log("before ",this._opCodeOperandsInStages)
            //this._mustGetFetchInstructionAgain = true
            if (this._enablePipeline) {
                this._opCodeOperandsInStages["EXECUTE"] = this._opCodeOperandsInStages["DECODE"]
                this._opCodeOperandsInStages["DECODE"] = this._opCodeOperandsInStages["FETCH"]
                this._opCodeOperandsInStages["FETCH"] = isa_FETCH_opCodeName + "+" + this.getOperandsNumberWithRadix(isa_FETCH_operands, 2)
            } else {
                for (let eachStage of CPUStages) {
                    if (eachStage == stage) {
                        console.log(stage)
                        this._opCodeOperandsInStages[eachStage] = isa_FETCH_opCodeName + "+" + this.getOperandsNumberWithRadix(isa_FETCH_operands, 2)
                    } else {
                        this._opCodeOperandsInStages[eachStage] = ""
                    }
                }
            }
            console.log("after", this._opCodeOperandsInStages)
        }

        // We must get it again, but why ?
        this._opCodeOperandsInStages["FETCH"] = isa_FETCH_opCodeName + "+" + this.getOperandsNumberWithRadix(isa_FETCH_operands, 2)


        // no pipelined mode must forward instruction to decode
        if (!this._enablePipeline) {
            this._internalInstructionRegister.inputClock= clockSync && this._internalFetchFlipflopD.outputQ
            this._internalInstructionRegister.recalcInternalValue()
        }

        // DECCODE Stage
        const opCodeValue = this._internalInstructionRegister.outputsQ.slice(0, 4).reverse()
        const opCodeIndex = displayValuesFromArray(opCodeValue, false)[1]
        const opCodeName = isUnknown(opCodeIndex) ? Unknown : CPUOpCodes_v6[opCodeIndex]

        const _ALUopValue = [opCodeValue[0], !opCodeValue[3], opCodeValue[1], opCodeValue[2]]
        const _ALUopIndex = displayValuesFromArray(_ALUopValue, false)[1]
        const _ALUop = isUnknown(_ALUopIndex) ? "A+B" : ALUOps[_ALUopIndex]

        const ramwevalue = opCodeValue[3] && !opCodeValue[2] && opCodeValue[1] && opCodeValue[0]
        /*
ISA5
        const _operandsDataCommonSelect = !opCodeValue[3] && !opCodeValue[2]
        const _operandsDataSelectValue = [
            (_operandsDataCommonSelect && opCodeValue[0]) || (opCodeValue[3] && !opCodeValue[1]) || (opCodeValue[3] && opCodeValue[2]),
            _operandsDataCommonSelect && opCodeValue[1]
        ]
        let _operandsDataSelectValueIndex = displayValuesFromArray(_operandsDataSelectValue, false)[1]

        _operandsDataSelectValueIndex = isUnknown(_operandsDataSelectValueIndex) ? 0 : _operandsDataSelectValueIndex

        this._operandsValue = this._fetchDecodeStage_Instruction_InternalRegister.outputsQ.slice(4, 8).reverse()

        const _ALUoutputs = doALUOp(_ALUop, this._Accumulator_InternalRegister.outputsQ, this.inputValues(this.inputs.DataIn).reverse(), false)

        let _operandsData : LogicValue[]
        if (_operandsDataSelectValueIndex === 0) {
            _operandsData = this._Accumulator_InternalRegister.outputsQ
        } else if (_operandsDataSelectValueIndex === 1) {
            //console.log(this._Accumulator_InternalRegister.outputsQ, " ", _ALUop, " ", this.inputValues(this.inputs.DataIn).reverse())
            _operandsData = _ALUoutputs.s
        } else if (_operandsDataSelectValueIndex === 2) {
            _operandsData = this.inputValues(this.inputs.DataIn).reverse()
            //console.log(_operandsData)
        } else if (_operandsDataSelectValueIndex === 3) {
            _operandsData = this._operandsValue
        } else {
            _operandsData = this._Accumulator_InternalRegister.outputsQ
        }

*/
        // ISA_v6
        //const _operandsDataCommonSelect = !opCodeValue[2] && !opCodeValue[3]
        const _operandsDataSelectValue = [
            (!opCodeValue[3] && opCodeValue[2]) || (!opCodeValue[3] && !opCodeValue[0]) || (opCodeValue[3] && !opCodeValue[2] && opCodeValue[1]),
            (opCodeValue[3] && opCodeValue[2]) || (opCodeValue[3] && !opCodeValue[0]) || (!opCodeValue[2] && !opCodeValue[1] && opCodeValue[0]) || (!opCodeValue[3] && !opCodeValue[2] && opCodeValue[1] && !opCodeValue[0])
        ]
        let _operandsDataSelectValueIndex = displayValuesFromArray(_operandsDataSelectValue, false)[1]

        _operandsDataSelectValueIndex = isUnknown(_operandsDataSelectValueIndex) ? 3 : _operandsDataSelectValueIndex

        this._operandsValue = this._internalInstructionRegister.outputsQ.slice(4, 8).reverse()

        const _ALUoutputs = doALUOp(_ALUop, this._internalAccumulatorRegister.outputsQ, this.inputValues(this.inputs.DataIn).reverse(), false)
        //console.log(_operandsDataSelectValueIndex)
        let _operandsData : LogicValue[]
        if (_operandsDataSelectValueIndex === 0) {
            _operandsData = this._operandsValue
        } else if (_operandsDataSelectValueIndex === 1) {
            //console.log(this._Accumulator_InternalRegister.outputsQ, " ", _ALUop, " ", this.inputValues(this.inputs.DataIn).reverse())
            _operandsData = this._internalAccumulatorRegister.outputsQ
        } else if (_operandsDataSelectValueIndex === 2) {
            _operandsData = _ALUoutputs.s
            //console.log(_operandsData)
        } else if (_operandsDataSelectValueIndex === 3) {
            _operandsData = this.inputValues(this.inputs.DataIn).reverse()
        } else {
            _operandsData = this._internalAccumulatorRegister.outputsQ
        }

        this._internalAccumulatorRegister.inputsD = _operandsData

        this._internalFlagsRegister.inputsD[1] = _ALUoutputs.cout
        this._internalFlagsRegister.inputsD[0] = this.allZeros(_operandsData)

        const c = this._internalFlagsRegister.outputsQ[1]
        const z = this._internalFlagsRegister.outputsQ[0]

        const jumpControl = opCodeValue[2] && !opCodeValue[3]
        this._noJump = !(((((opCodeValue[0] && c) || (!opCodeValue[0] && z)) && opCodeValue[1]) || !opCodeValue[1]) && jumpControl)
        this._backwardJump = (opCodeValue[0] && !opCodeValue[1]) && jumpControl

        this._internalHaltSignalFlipflopD.inputD = opCodeValue[3] && !opCodeValue[2] && opCodeValue[1] && !opCodeValue[0]

        if (this._enablePipeline) {
            this._internalAccumulatorRegister.inputClock = clockSync
            this._internalAccumulatorRegister.recalcInternalValue()
            this._internalFlagsRegister.inputClock = clockSync
            this._internalFlagsRegister.recalcInternalValue()
            this._internalHaltSignalFlipflopD.inputClock = clockSync
            this._internalHaltSignalFlipflopD.recalcInternalValue()
        } else {
            this._internalAccumulatorRegister.inputClock = clockSync && this._internalDecodeFlipflopD.outputQ
            this._internalAccumulatorRegister.recalcInternalValue()
            this._internalFlagsRegister.inputClock = clockSync && this._internalDecodeFlipflopD.outputQ
            this._internalFlagsRegister.recalcInternalValue()
            this._internalHaltSignalFlipflopD.inputClock = clockSync && this._internalDecodeFlipflopD.outputQ
            this._internalHaltSignalFlipflopD.recalcInternalValue()
        }
        // EXECUTE STAGE

        // PROGRAM COUNTER LOGIC
        this._internalProgramCounterRegister.inputInc = this._noJump

        //console.log(noJump)
        const _programCounterALUop = this._backwardJump? "A-B" : "A+B"
        //console.log(this._backwardJump)
        const _programCounterALUinputA = this._enablePipeline ? this._internalPreviousProgramCounterRegister.outputsQ : this._internalProgramCounterRegister.outputsQ
        //console.log(_programCounterALUinputA)
        // A clone of the array "operands" array is needed cause ArrayClamOrPad returns the array
        const _programCounterALUinputB = this._operandsValue.slice()
        ArrayClampOrPad(_programCounterALUinputB, this.numInstructionAddressBits, false)
        if (!this._noJump) {
            if (this._directAddressingMode) {
                this._internalProgramCounterRegister.inputsD = _programCounterALUinputB
            } else {
                //console.log(_programCounterALUinputB)
                let _programCounterALUoutputs = doALUOp(_programCounterALUop, _programCounterALUinputA, _programCounterALUinputB, false)
                //console.log(_programCounterALUoutputs.s)
                // We must go back of one step cylcle
                if (this._enablePipeline) {
                    _programCounterALUoutputs = doALUOp("A-1", _programCounterALUoutputs.s, _programCounterALUinputB, false)
                }
                this._internalProgramCounterRegister.inputsD = _programCounterALUoutputs.s
            }
        }

        if (this._enablePipeline) {
            this._internalInstructionRegister.inputClock = clockSync
            this._internalInstructionRegister.recalcInternalValue()

            this._internalProgramCounterRegister.inputClock = clockSync
            this._internalProgramCounterRegister.recalcInternalValue()
            this._internalPreviousProgramCounterRegister.inputsD = this._internalProgramCounterRegister.outputsQ
            this._internalPreviousProgramCounterRegister.inputClock = clockSync
            this._internalPreviousProgramCounterRegister.recalcInternalValue()
        } else {
            const _internalFetchFlipflopDoutputQ = this._internalFetchFlipflopD.outputQ
            const _internalDecodeFlipflopDoutputQ = this._internalDecodeFlipflopD.outputQ
            const _internalExecuteFlipflopDoutputQ = this._internalExecuteFlipflopD.outputQ

            this._internalFetchFlipflopD.inputD = _internalExecuteFlipflopDoutputQ
            this._internalFetchFlipflopD.inputClock = clockSync
            this._internalFetchFlipflopD.recalcInternalValue()

            this._internalDecodeFlipflopD.inputD = _internalFetchFlipflopDoutputQ
            this._internalDecodeFlipflopD.inputClock = clockSync
            this._internalDecodeFlipflopD.recalcInternalValue()

            this._internalExecuteFlipflopD.inputD = _internalDecodeFlipflopDoutputQ
            this._internalExecuteFlipflopD.inputClock = clockSync
            this._internalExecuteFlipflopD.recalcInternalValue()

            this._internalProgramCounterRegister.inputClock  = clockSync && this._internalExecuteFlipflopD.outputQ
            this._internalProgramCounterRegister.recalcInternalValue()
        }

        const ramwesyncvalue = this._enablePipeline ? clockSync : clockSync && this._internalDecodeFlipflopD.outputQ

        if (!this._internalHaltSignalFlipflopD.outputQ) {
            this._internalOperationStageCounter.inputClock = clockSync
            this._internalOperationStageCounter.recalcInternalValue()
        }

        const false_ = false as LogicValue

        let newState : any

        if (isUnknown(opCodeName)) {
            newState = {
                isaadr: ArrayFillWith<LogicValue>(false_, this.numInstructionAddressBits),
                dadr: ArrayFillWith<LogicValue>(false_, this.numDataAddressBits),
                dout: ArrayFillWith<LogicValue>(false_, this.numDataBits),
                ramwesync: false_,
                ramwe: false_,
                resetsync: false_,
                sync: false_,
                z: false_,
                //v: false_,
                cout: false_,
                haltsignal: false,
                runningstate: false_
            }
        } else {
            newState = {
                isaadr: this._internalProgramCounterRegister.outputsQ,
                dadr: this._operandsValue,
                dout: this._internalAccumulatorRegister.outputsQ,
                ramwesync: ramwesyncvalue,
                ramwe: ramwevalue,
                resetsync: clrSignal,
                sync: clockSync,
                z: this._internalFlagsRegister.outputsQ[0],
                //v: false_,
                cout: this._internalFlagsRegister.outputsQ[1],
                haltsignal: this._internalHaltSignalFlipflopD.outputQ,
                runningstate: runningState,
            }
        }

        return newState as CPUBaseValue_v6
    }

    public override propagateValue(newValue: CPUValue_v6) {
        this.outputValues(this.outputs.InstructionAddress , newValue.instructionaddress, true)
        this.outputValues(this.outputs.DataAddress , newValue.dataaddress, true)
        this.outputValues(this.outputs.DataOut , newValue.dataout)
        this.outputs.RAMweSync.value = newValue.ramwesync
        this.outputs.RAMwe.value = newValue.ramwe
        this.outputs.ResetSync.value = newValue.resetsync
        this.outputs.Sync.value = newValue.sync
        this.outputs.Z.value = newValue.z
        //this.outputs.Z.value = allZeros(newValue.dataout)
        //this.outputs.V.value = newValue.v
        this.outputs.Cout.value = newValue.cout
        this.outputs.HaltSignal.value = newValue.haltsignal
        this.outputs.RunningState.value = newValue.runningstate
    }
    /*
        public makeStateAfterClock(): CPUBaseValue {
            return []
        }
    */
    public doRecalcValueAfterClock(): [LogicValue[], LogicValue[], LogicValue,LogicValue,LogicValue,LogicValue,LogicValue,LogicValue] {
        return [
            this.inputValues(this.inputs.Instruction).map(LogicValue.filterHighZ),
            this.inputValues(this.inputs.DataIn).map(LogicValue.filterHighZ),
            LogicValue.filterHighZ(this.inputs.Reset.value),
            LogicValue.filterHighZ(this.inputs.ManStep.value),
            LogicValue.filterHighZ(this.inputs.Speed.value),
            LogicValue.filterHighZ(this.inputs.ClockS.value),
            LogicValue.filterHighZ(this.inputs.ClockF.value),
            LogicValue.filterHighZ(this.inputs.RunStop.value)
        ]
    }

    public override makeTooltip() {
        const opCode = this.opCode
        const stage = this.stage
        const s = S.Components.CPU.tooltip
        const opCodeDesc = isUnknown(opCode) ? s.SomeUnknownInstruction : s.ThisInstruction + " " + CPUOpCode_v6.fullName(opCode)
        return tooltipContent(s.title,
            mods(
                div(`${s.CurrentlyCarriesOut} ${opCodeDesc}.`)
            )
        )
    }

    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {
        const bounds = this.bounds()
        const {left, top, right, bottom} = bounds
        const lowerTop = top - 2 * GRID_STEP
        const lowerBottom = top - 2 * GRID_STEP
        const lowerLeft = left - 2 * GRID_STEP
        const lowerRight = right - 2 * GRID_STEP

        // inputs
        for (const input of this.inputs.Instruction) {
            drawWireLineToComponent(g, input, left, input.posYInParentTransform)
        }
        for (const input of this.inputs.DataIn) {
            drawWireLineToComponent(g, input, input.posXInParentTransform, bottom)
        }
        drawWireLineToComponent(g, this.inputs.RunStop, this.inputs.RunStop.posXInParentTransform, bottom)
        drawWireLineToComponent(g, this.inputs.Reset, this.inputs.Reset.posXInParentTransform, bottom)
        drawWireLineToComponent(g, this.inputs.ManStep, this.inputs.ManStep.posXInParentTransform, bottom)
        drawWireLineToComponent(g, this.inputs.Speed, this.inputs.Speed.posXInParentTransform, bottom)
        drawWireLineToComponent(g, this.inputs.ClockS, this.inputs.ClockS.posXInParentTransform, bottom)
        drawWireLineToComponent(g, this.inputs.ClockF, this.inputs.ClockF.posXInParentTransform, bottom)

        // outputs
        for (const output of this.outputs.InstructionAddress) {
            drawWireLineToComponent(g, output, output.posXInParentTransform, top)
        }
        for (const output of this.outputs.DataOut) {
            drawWireLineToComponent(g, output, right, output.posYInParentTransform)
        }
        for (const output of this.outputs.DataAddress) {
            drawWireLineToComponent(g, output, output.posXInParentTransform, top)
        }
        drawWireLineToComponent(g, this.outputs.ResetSync, right, this.outputs.ResetSync.posYInParentTransform)
        drawWireLineToComponent(g, this.outputs.Sync, right, this.outputs.Sync.posYInParentTransform)
        drawWireLineToComponent(g, this.outputs.RAMweSync, right, this.outputs.RAMweSync.posYInParentTransform)
        drawWireLineToComponent(g, this.outputs.RAMwe, right, this.outputs.RAMwe.posYInParentTransform)
        drawWireLineToComponent(g, this.outputs.Z, right, this.outputs.Z.posYInParentTransform)
        //drawWireLineToComponent(g, this.outputs.V, right, this.outputs.V.posYInParentTransform)
        drawWireLineToComponent(g, this.outputs.Cout, right, this.outputs.Cout.posYInParentTransform)
        drawWireLineToComponent(g, this.outputs.HaltSignal, right, this.outputs.HaltSignal.posYInParentTransform)
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
        this.drawGroupBox(g, this.inputs.Instruction.group, bounds)
        this.drawGroupBox(g, this.inputs.DataIn.group, bounds)
        this.drawGroupBox(g, this.outputs.InstructionAddress.group, bounds)
        this.drawGroupBox(g, this.outputs.DataOut.group, bounds)
        this.drawGroupBox(g, this.outputs.DataAddress.group, bounds)

        // labels
        ctx.inNonTransformedFrame(ctx => {
            g.fillStyle = COLOR_COMPONENT_INNER_LABELS
            g.font = "11px sans-serif"

            // bottom inputs
            drawLabel(ctx, this.orient, "Din", "s", this.inputs.DataIn, bottom)
            drawLabel(ctx, this.orient, "Run/Stop", "s", this.inputs.RunStop, bottom, undefined, true)
            drawLabel(ctx, this.orient, "Reset", "s", this.inputs.Reset, bottom, undefined, true)
            drawLabel(ctx, this.orient, "Man Step", "s", this.inputs.ManStep, bottom, undefined, true)
            drawLabel(ctx, this.orient, "Speed", "s", this.inputs.Speed, bottom, undefined, true)
            drawLabel(ctx, this.orient, "Clock S", "s", this.inputs.ClockS, bottom, undefined, true)
            drawLabel(ctx, this.orient, "Clock F", "s", this.inputs.ClockF, bottom, undefined, true)

            // top outputs
            drawLabel(ctx, this.orient, "IsaAdr", "n", this.outputs.InstructionAddress, top)
            drawLabel(ctx, this.orient, "DAdr", "n", this.outputs.DataAddress, top)

            // left inputs
            drawLabel(ctx, this.orient, "Isa", "w", left, this.inputs.Instruction)

            // right outputs
            drawLabel(ctx, this.orient, "Dout", "e", right, this.outputs.DataOut)
            drawLabel(ctx, this.orient, "RAM Sync", "e", right, this.outputs.RAMweSync, undefined, true)
            drawLabel(ctx, this.orient, "Reset Sync", "e", right, this.outputs.ResetSync, undefined, true)
            drawLabel(ctx, this.orient, "RAM WE", "e", right, this.outputs.RAMwe, undefined, true)
            drawLabel(ctx, this.orient, "Sync", "e", right, this.outputs.Sync, undefined, true)
            drawLabel(ctx, this.orient, "Z", "e", right, this.outputs.Z, undefined, true)
            //drawLabel(ctx, this.orient, "V", "e", right, this.outputs.V, undefined, true)
            drawLabel(ctx, this.orient, "Cout", "e", right, this.outputs.Cout, undefined, true)
            drawLabel(ctx, this.orient, "Halt", "e", right, this.outputs.HaltSignal, undefined, true)
            drawLabel(ctx, this.orient, "Run state", "e", right, this.outputs.RunningState, undefined, true)

            const counter = displayValuesFromArray(this._internalOperationStageCounter.outputsQ, false)[1]
            const stringRep = formatWithRadix(counter, 10, 16, false)
            const stage = (counter == "?") ? 0 : CPUStages[(counter - 1) % 3]

            if (this._showStage) {
                for (let eachStage of CPUStages) {
                    const stageColor = CPUStageColorKey.color(eachStage)
                    const stageColorText = COLOR_CPUSTAGE_TEXT[stageColor]
                    const stageColorBackground = COLOR_CPUSTAGE_BACKGROUND[stageColor]

                    const stageName = CPUStageName.shortName(eachStage)
                    const valueCenterDeltaX = (this.orient == "e") ? 100 : (this.orient == "w") ? -100 : 0
                    const valueCenterDeltaY = (this.orient == "n") ? 100 : (this.orient == "s") ? -100 : 0

                    let valueCenterX = this.posX
                    let valueCenterY = Orientation.isVertical(this.orient) ? this.inputs.Instruction.group.posYInParentTransform : this.inputs.Instruction.group.posYInParentTransform - 50
                    switch (eachStage) {
                        case "FETCH":
                            valueCenterX = valueCenterX - valueCenterDeltaX + (Orientation.isVertical(this.orient) ? (this.orient == "n") ? 20 : -20 : 0)
                            valueCenterY = valueCenterY - valueCenterDeltaY
                            break
                        case "DECODE":
                            valueCenterX = valueCenterX + (Orientation.isVertical(this.orient) ? (this.orient == "n") ? 20 : -20 : 0)
                            break
                        case "EXECUTE":
                            valueCenterX = valueCenterX + valueCenterDeltaX + (Orientation.isVertical(this.orient) ? (this.orient == "n") ? 20 : -20 : 0)
                            valueCenterY = valueCenterY + valueCenterDeltaY
                            break
                    }

                    const fontSize = 14
                    const valueCenterBox = ctx.rotatePoint(valueCenterX + (Orientation.isVertical(this.orient) ? (this.orient == "n") ? -fontSize : fontSize : 0), valueCenterY + (Orientation.isVertical(this.orient) ? 0 : fontSize))
                    g.fillStyle = stageColorBackground
                    const frameWidth = 100
                    FlipflopOrLatch.drawStoredValueFrame(g, ...valueCenterBox, frameWidth, 50, false)

                    const valueCenter = ctx.rotatePoint(valueCenterX, valueCenterY)
                    g.fillStyle = stageColorText
                    g.font = `bold ${fontSize}px monospace`
                    g.textAlign = "center"
                    g.textBaseline = "middle"
                    if (this._enablePipeline) {
                        g.fillText(stageName, ...valueCenter)
                    } else {
                        if (eachStage == stage) {
                            g.fillText(stageName, ...valueCenter)
                        }
                    }
                    if (this._showOpCode) {
                        const valueCenterInstruction = ctx.rotatePoint(valueCenterX + (Orientation.isVertical(this.orient) ? (this.orient == "n") ? -30 : 30 : 0), valueCenterY + (Orientation.isVertical(this.orient) ? 0 : 30))
                        //console.log(this._opCodeOperandsInStages)
                        const opCodeName = this.getInstructionParts(this._opCodeOperandsInStages[eachStage], "opCode")
                        const operandsString = this._showOperands ? this.getInstructionParts(this._opCodeOperandsInStages[eachStage], "operands") : ""
                        const instructionDisplay = (opCodeName == "") ? "" : opCodeName + " " + operandsString

                        const fontSize = 15
                        g.font = `bold ${fontSize}px monospace`
                        g.fillStyle = COLOR_COMPONENT_BORDER
                        g.textAlign = "center"
                        g.textBaseline = "middle"
                        if (this._enablePipeline) {
                            g.fillText(instructionDisplay, ...valueCenterInstruction)
                        } else {
                            if (eachStage == stage) {
                                g.fillText(instructionDisplay, ...valueCenterInstruction)
                            }
                        }
                    }
                }
            }

            if (this._showClockCycle) {
                const fontSize = 20
                const valueCenterDeltaY = Orientation.isVertical(this.orient) ? 120 : 90
                const valueCenter = ctx.rotatePoint(this.inputs.ManStep.posXInParentTransform + 10, this.inputs.ManStep.posYInParentTransform - valueCenterDeltaY)

                g.fillStyle = COLOR_EMPTY
                const frameWidth = 100 - fontSize / 2
                FlipflopOrLatch.drawStoredValueFrame(g, ...valueCenter, frameWidth, 28, false)

                g.font = `bold ${fontSize}px sans-serif`
                g.fillStyle = COLOR_LABEL_OFF
                g.textAlign = "center"
                g.textBaseline = "middle"
                g.fillText(stringRep, ...valueCenter)
            }
            this.doDrawGenericCaption(g, ctx)
        })
        if (this._addProgramRAM) {

        } else {

        }
    }

    protected override doDrawGenericCaption(g: GraphicsRendering, ctx: DrawContextExt) {
        if (this._directAddressingMode) {
            const fontSize = 11
            g.font = `bold ${fontSize}px sans-serif`
            g.fillStyle = COLOR_DARK_RED
            g.textAlign = "center"
            g.textBaseline = "middle"
            const valueCenter = ctx.rotatePoint(this.outputs.InstructionAddress.group.posXInParentTransform + (Orientation.isVertical(this.orient)? 15 : 0), this.outputs.InstructionAddress.group.posYInParentTransform + (Orientation.isVertical(this.orient)? 63 : 35))
            g.fillText("Adressage direct", ...valueCenter)
        }
    }

    public get opCode(): CPUOpCode_v6 | Unknown {
        //const opValues = this.inputValues(this.inputs.Instr.reverse()).slice(0,4)
        const opCodeValues = this._internalInstructionRegister.inputsD.slice(0,4)
        //opValues.push(this.inputs.Mode.value)
        const opCodeIndex = displayValuesFromArray(opCodeValues, true)[1]
        // TO DO
        //return isUnknown(opCodeIndex) ? Unknown : (this.usesExtendedOpCode ? CPUOpCodes : CPUOpCodes)[opCodeIndex]
        return isUnknown(opCodeIndex) ? Unknown : CPUOpCodes_v6[opCodeIndex]
    }

    public get operands(): LogicValue[] {
        return this._internalInstructionRegister.inputsD.slice(4,8)
    }

    public get cycle(): number {
        const cycleValue = displayValuesFromArray(this._internalOperationStageCounter.outputsQ, false)[1]
        return isUnknown(cycleValue) ? 0 : cycleValue
    }

    public get stage(): CPUStage {
        let cycleValue = this.cycle
        return CPUStages[(cycleValue-1) % 3]
    }

    protected override makeCPUSpecificContextMenuItems(): MenuItems {
        const s = S.Components.CPU.contextMenu
        const iconDirectAddressingMode = this._directAddressingMode? "check" : "none"
        const toggleDirectAddressingMode: MenuItems = this.numInstructionAddressBits != 4 ? [] : [
            ["mid", MenuData.item(iconDirectAddressingMode, s.toggleDirectAddressingMode,
                () => {this.doSetDirectAddressingMode(!this._directAddressingMode)}
            )],
        ]

        return [
            ...toggleDirectAddressingMode,
        ]
    }
}

CPUDef_v6.impl = CPU_v6
