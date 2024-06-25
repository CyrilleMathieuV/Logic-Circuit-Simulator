import * as t from "io-ts"
import { SubEvent } from 'sub-events'
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
    COLOR_EMPTY, COLOR_LABEL_OFF, COLOR_DARK_RED, colorForLogicValue, strokeSingleLine,
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
import { InternalRAM } from "./InternalRAM";
import { InternalComponent } from "./InternalComponent";
import {number} from "fp-ts";
import {CPUDef_v6} from "./CPU_v6";
import {Clock} from "./Clock";

export const CPUOpCodes = [
    "NOP", "STA", "LDA", "LDK",
    //0000   0001   0010   0011
    "JMD", "JMU", "BRZ", "BRC",
    //0100   0101   0110   0111
    "ADD", "SUB", "JSR", "RET",
    //1000   1001   1010   1011
    "OR_", "AND", "NOT", "XOR",
    //1100   1101   1110   1111
] as const

const unconditionalGoToDownOpCode = ["JMD", "JSR"] as string[]
const conditionalGoToDownOpCode = ["BRZ", "BRC"] as string[]
let goToDownOpCode = unconditionalGoToDownOpCode.concat(conditionalGoToDownOpCode)
const unconditionalGoToUpOpCode = ["JMU"] as string[]
let goToOpCode = goToDownOpCode.concat(unconditionalGoToUpOpCode)

export type CPUOpCode = typeof CPUOpCodes[number]

export const CPUOpCode = {
    shortName(opCode: CPUOpCode): string {
        return S.Components.CPU[opCode][0]
    },
    fullName(opCode: CPUOpCode): string {
        return S.Components.CPU[opCode][1]
    },
}

export const CPUStages = [
    "FETCH", "DECODE", "EXECUTE", "WRITEBACK"
    //    0         1          2            3
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
    black: "black",
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

export const CPUBaseDef =
    defineAbstractParametrizedComponent( {
        button: { imgWidth: 40 },
        repr: {
            instructionAddressBits: typeOrUndefined(t.number),
            dataBits: typeOrUndefined(t.number),
            dataAddressBits: typeOrUndefined(t.number),
            stackBits: typeOrUndefined(t.number),
            showStage: typeOrUndefined(t.boolean),
            showOpCode: typeOrUndefined(t.boolean),
            showOperands: typeOrUndefined(t.boolean),
            //disablePipeline: typeOrUndefined(t.boolean),
            showClockCycle : typeOrUndefined(t.boolean),
            showStack : typeOrUndefined(t.boolean),
            addProgramRAM: typeOrUndefined(t.boolean),
            trigger: typeOrUndefined(t.keyof(EdgeTrigger)),
            //extOpCode: typeOrUndefined(t.boolean),
        },
        valueDefaults: {
            showStage: true,
            showOpCode: true,
            showOperands: true,
            //disablePipeline: false,
            showClockCycle: true,
            showStack: true,
            addProgramRAM: false,
            trigger: EdgeTrigger.falling,
        },
        params: {
            instructionAddressBits: param(4, [4, 8]),
            dataBits: param(4, [4]),
            dataAddressBits: param(4, [4]),
            stackBits: param(2, [1, 2, 3]),
            // future use
            // extOpCode: paramBool(), // has the extended opcode
        },
        validateParams: ({ instructionAddressBits, dataBits, dataAddressBits, stackBits}) => ({
            numInstructionAddressBits: instructionAddressBits,
            numDataBits: dataBits,
            numDataAddressBits: dataAddressBits,
            numStackBits: stackBits,
            //usesExtendedOpCode: extOpCode,
        }),
        size: ({ numDataBits }) => ({
            //gridWidth: 7,
            //gridHeight: 19 + Math.max(0, numDataBits - 8) * 2,
            gridWidth: 32,
            gridHeight: 32,
        }),
        makeNodes: ({ numInstructionAddressBits, numDataBits, numDataAddressBits,numStackBits, /*usesExtendedOpCode*/ gridWidth, gridHeight }) => {
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
                    // DISABLED
                    SequentialExecution: [-15, inputY, "s", "Sequential Execution"],
                    Pipeline: [-13, inputY, "s", "Pipeline"],
                    RunStop: [-11, inputY, "s", "Run/Stop", { prefersSpike: true }],
                    Reset: [-9, inputY, "s", "Reset CPU", { prefersSpike: true }],
                    ManStep: [-7, inputY, "s","Man STEP", { prefersSpike: true }],
                    Speed: [-5, inputY, "s", "Select Clock"],
                    ClockS: [-3, inputY, "s", "Slow Clock", { isClock: true }],
                    ClockF: [-1, inputY, "s", "Fast Clock", { isClock: true }],
                    AddressingMode: [1, inputY, "s", "Addressing Mode"],
                    //Mode: opCodeMode,
                },
                outs: {
                    InstructionAddress: groupHorizontal("n", -midX, -inputY, numInstructionAddressBits),
                    DataAddress: groupHorizontal("n", midX, -inputY, numDataAddressBits),
                    DataOut: groupVertical("e", inputX, -midY, numDataBits),
                    RAMweSync: [inputX, -1, "e", "RAM WE sync"],
                    RAMwe: [inputX, 1, "e", "RAM WE"],
                    ResetSync: [inputX, 3, "e", "Reset sync"],
                    Sync: [inputX, 5, "e", "Sync"],
                    Z: [inputX, 7, "e", "Z (Zero)"],
                    //V: [inputX, 11, "e", "V (oVerflow)"],
                    Cout: [inputX, 9, "e", `Cout`],
                    StackUOflow: [inputX, 11, "e", "Run state"],
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
                dataaddress: ArrayFillWith<LogicValue>(false_, defaults.numDataAddressBits),
                dataout: ArrayFillWith<LogicValue>(false_, defaults.numDataBits),
                ramwesync: false_,
                ramwe: false_,
                resetsync: false_,
                sync: false_,
                z: false_,
                //v: false_,
                cout: false_,
                stackuoflow: false_,
                haltsignal: false_,
                runningstate: false_
            }
            let initialState
            if (saved === undefined) {
                initialState = undefinedState
            } else {
                initialState = {
                    instructionaddress: ArrayFillWith<LogicValue>(false_, defaults.numInstructionAddressBits),
                    dataaddress: ArrayFillWith<LogicValue>(false_, defaults.numDataAddressBits),
                    dataout: ArrayFillWith<LogicValue>(false_, defaults.numDataBits),
                    ramwesync: false_,
                    ramwe: false_,
                    resetsync: false_,
                    sync: false_,
                    z: false_,
                    //v: false_,
                    cout: false_,
                    stackuoflow: false_,
                    haltsignal: false_,
                    runningstate: false_
                }
            }
            //const state = saved.state === undefined ? defaults.state : toLogicValue(saved.state)
            return initialState
        }
    })

type CPUBaseValue = Value<typeof CPUBaseDef>

export type CPUBaseRepr = Repr<typeof CPUBaseDef>
export type CPUBaseParams = ResolvedParams<typeof CPUBaseDef>

export abstract class CPUBase<
    TRepr extends CPUBaseRepr,
    TParamDefs extends ExtractParamDefs<TRepr> = ExtractParamDefs<TRepr>,
> extends ParametrizedComponentBase<
    TRepr,
    CPUBaseValue,
    TParamDefs,
    ExtractParams<TRepr>,
    NodesIn<TRepr>,
    NodesOut<TRepr>,
    true, true
> {
    public readonly numInstructionAddressBits: number

    public readonly numDataBits: number
    public readonly numDataAddressBits: number

    public readonly numStackBits: number

    protected _trigger: EdgeTrigger
    protected _isInInvalidState = false
    protected _lastClock: LogicValue = Unknown
    //public readonly usesExtendedOpCode: boolean

    protected _showStage: boolean

    protected _showOpCode: boolean
    protected _showOperands: boolean

    //protected _disablePipeline: boolean

    protected _showClockCycle: boolean

    protected _showStack: boolean

    protected _addProgramRAM: boolean

    public _opCodeOperandsInStages : any
    public _addressesInStages : any

    protected constructor(parent: DrawableParent, SubclassDef: typeof CPUDef, params: CPUBaseParams, saved?: TRepr) {
        super(parent, SubclassDef.with(params as any) as any /* TODO */, saved)

        this.numInstructionAddressBits = params.numInstructionAddressBits

        this.numDataBits = params.numDataBits
        this.numDataAddressBits = params.numDataAddressBits

        this.numStackBits = params.numStackBits

        this._opCodeOperandsInStages = { FETCH : "", DECODE : "", EXECUTE : "", WRITEBACK : "" }
        this._addressesInStages = { FETCH : -1, DECODE : -1, EXECUTE : -1, WRITEBACK : -1 }

        this._showStage = saved?.showStage ?? CPUDef.aults.showStage

        this._showOpCode = saved?.showOpCode ?? CPUDef.aults.showOpCode
        this._showOperands = saved?.showOperands ?? CPUDef.aults.showOperands

        //this._disablePipeline = saved?.disablePipeline ?? CPUDef.aults.disablePipeline

        this._showClockCycle = saved?.showClockCycle ?? CPUDef.aults.showClockCycle

        this._showStack = saved?.showStack ?? CPUDef.aults.showStack

        this._addProgramRAM = saved?.addProgramRAM ?? CPUDef.aults.addProgramRAM

        this._trigger = saved?.trigger ?? CPUDef.aults.trigger
    }

    protected abstract override doRecalcValue(): CPUBaseValue

    public makeInvalidState(): CPUBaseValue {
        const false_ = false as LogicValue
        let newState : any
        newState = {
            instructionaddress: ArrayFillWith<LogicValue>(false_, this.numInstructionAddressBits),
            dataaddress: ArrayFillWith<LogicValue>(false_, this.numDataBits),
            dataout: ArrayFillWith<LogicValue>(false_, this.numDataBits),
            ramwesync: false_,
            ramwe: false_,
            resetsync: false_,
            sync: false_,
            z: false_,
            //v: false_,
            cout: false_,
            stackuoflow: false_,
            haltsignal: false_,
            runningstate: false_,
        }
        return newState as CPUBaseValue
    }

    public makeStateFromMainValue(val: LogicValue): CPUBaseValue {
        let newState : any
        newState = {
            instructionaddress: ArrayFillWith<LogicValue>(val, this.numInstructionAddressBits),
            dataaddress: ArrayFillWith<LogicValue>(val, this.numDataAddressBits),
            dataout: ArrayFillWith<LogicValue>(val, this.numDataBits),
            ramwesync: val,
            ramwe: val,
            resetsync: val,
            sync: val,
            z: val,
            //v: val,
            cout: val,
            stackuoflow: val,
            haltsignal: val,
            runningstate: val
        }
        return newState as CPUBaseValue
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
            instructionAddressBits: this.numInstructionAddressBits === CPUDef.aults.instructionAddressBits ? undefined : this.numInstructionAddressBits,
            dataBits: this.numDataBits === CPUDef.aults.dataBits ? undefined : this.numDataBits,
            dataAddressBits: this.numDataAddressBits === CPUDef.aults.dataAddressBits ? undefined : this.numDataAddressBits,
            stackBits: this.numStackBits === CPUDef.aults.stackBits ? undefined : this.numStackBits,
            ...super.toJSONBase(),
            //extOpCode: this.usesExtendedOpCode === CPUDef.aults.extOpCode ? undefined : this.usesExtendedOpCode,
            showStage: (this._showStage !== CPUDef.aults.showStage) ? this._showStage : undefined,
            showOpCode: (this._showOpCode !== CPUDef.aults.showOpCode) ? this._showOpCode : undefined,
            showOperands: (this._showOperands !== CPUDef.aults.showOperands) ? this._showOperands : undefined,
            //disablePipeline: (this._disablePipeline !== CPUDef.aults.disablePipeline) ? this._disablePipeline : undefined,
            showClockCycle: (this._showClockCycle !== CPUDef.aults.showClockCycle) ? this._showClockCycle : undefined,
            showStack: (this._showStack !== CPUDef.aults.showStack) ? this._showStack : undefined,
            addProgramRAM: (this._addProgramRAM !== CPUDef.aults.addProgramRAM) ? this._addProgramRAM : undefined,
            trigger: (this._trigger !== CPUDef.aults.trigger) ? this._trigger : undefined,
        }
    }

    protected override propagateValue(newValue: CPUBaseValue) {}

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

    private doSetShowStack(showStack: boolean) {
        this._showStack = showStack
        this.setNeedsRedraw("show stack changed")
    }

    public doAddProgramRAM(addProgramRAM: boolean) {
        this._addProgramRAM = addProgramRAM
        this.setNeedsRedraw("show assembler editor changed")
    }
/*
    private doSetEnablePipeline(enabalePipeline: boolean) {
        this._disablePipeline = enabalePipeline
        this.setNeedsRedraw("show pipeline changed")
    }
*/
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
/*
        const iconEnablePipeline = this._disablePipeline? "check" : "none"
        const toggleEnablePipelineItem = MenuData.item(iconEnablePipeline, s.toggleEnablePipeline, () => {
            this.doSetEnablePipeline(!this._disablePipeline)
        })
*/
        const iconClockCycle = this._showClockCycle ? "check" : "none"
        const toggleShowClockCycleItem = MenuData.item(iconClockCycle, s.toggleShowClockCycle, () => {
            this.doSetShowClockCycle(!this._showClockCycle)
        })

        const iconStack = this._showStack ? "check" : "none"
        const toggleShowStackItem = MenuData.item(iconStack, s.toggleShowStack, () => {
            this.doSetShowStack(!this._showStack)
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
            //["mid", toggleEnablePipelineItem],
            //["mid", MenuData.sep()],
            ["mid", toggleShowClockCycleItem],
            ["mid", MenuData.sep()],
            ["mid", toggleShowStackItem],
            this.makeChangeParamsContextMenuItem("inputs", S.Components.Generic.contextMenu.ParamNumStackBits, this.numStackBits, "stackBits"),
            ["mid", MenuData.sep()],
            //["mid", toggleAddProgramRAMItem],
            //["mid", MenuData.sep()],
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

    public getInstructionParts(instructionString: string | undefined, part :"opCode" | "operands"): string {
        if (instructionString === undefined || instructionString == "") {
            instructionString = "NOP+0"
        }
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

export const CPUDef =
    defineParametrizedComponent("CPU", true, true, {
        variantName: ({ instructionAddressBits }) => `CPU-${instructionAddressBits}`,
        idPrefix: "CPU",
        ...CPUBaseDef,
        repr: {
            ...CPUBaseDef.repr,
            instructionBits: typeOrUndefined(t.number),
            //directAddressingMode: typeOrUndefined(t.boolean),
            //trigger: typeOrUndefined(t.keyof(EdgeTrigger)),
        },
        valueDefaults: {
            ...CPUBaseDef.valueDefaults,
            //directAddressingMode: false,
            //trigger: EdgeTrigger.falling,
        },
        params: {
            instructionAddressBits: CPUBaseDef.params.instructionAddressBits,
            dataBits: CPUBaseDef.params.dataBits,
            dataAddressBits: CPUBaseDef.params.dataAddressBits,
            stackBits: CPUBaseDef.params.stackBits,
            instructionBits: param(8, [8]),
            //extOpCode: CPUBaseDef.params.extOpCode,
        },
        validateParams: ({ instructionAddressBits, dataBits, dataAddressBits, stackBits, instructionBits}) => ({
            numInstructionAddressBits: instructionAddressBits,
            numDataBits: dataBits,
            numDataAddressBits: dataAddressBits,
            numStackBits: stackBits,
            numInstructionBits: instructionBits,
            //usesExtendedOpCode: extOpCode,
        }),
        makeNodes: (params, defaults) => {
            const base = CPUBaseDef.makeNodes(params, defaults)
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

type CPUValue = Value<typeof CPUDef>

export type CPURepr = Repr<typeof CPUDef>
export type CPUParams = ResolvedParams<typeof CPUDef>

export class CPU extends CPUBase<CPURepr> {
    public readonly CPUevent: SubEvent<string> = new SubEvent();

    public CPUeventDispatcher(message: string) {
        this.CPUevent.emit(`${message}`);
    }

    public readonly numInstructionBits: number
    //private _directAddressingMode = CPUDef.aults.directAddressingMode

    private _sequentialExecution: LogicValue
    private _pipeline: LogicValue
    private _addressingMode: LogicValue

    protected _mustGetFetchInstructionAgain : boolean

    protected _fetchStage_SequentialExecutionClock_InternalFlipflopD : InternalFlipflopD
    protected _decodeStage_SequentialExecutionClock_InternalFlipflopD : InternalFlipflopD
    protected _executeStage_SequentialExecutionClock_InternalFlipflopD : InternalFlipflopD
    protected _writebackStage_SequentialExecutionClock_InternalFlipflopD : InternalFlipflopD

    protected _control_SequentialExecutionState_InternalFlipflopD : InternalFlipflopD
    protected _control_PipelineState_InternalFlipflopD : InternalFlipflopD
    protected _control_RunStopState_InternalFlipflopD : InternalFlipflopD
    protected _control_ResetState_InternalFlipflopD : InternalFlipflopD
    protected _control_AddressingModeState_InternalFlipflopD : InternalFlipflopD
    protected _control_HaltState_InternalFlipflopD : InternalFlipflopD

    protected _StackPointer_InternalRegister : InternalRegister
    protected _ProgramCounter_InternalRegister : InternalRegister

    protected _fetchDecodeStage_StackPointer_InternalRegister : InternalRegister
    protected _fetchDecodeStage_StackPointerALUoutputs_InternalRegister : InternalRegister
    protected _fetchDecodeStage_CallStack_InternalRegister : InternalRegister
    protected _fetchDecodeStage_ProgramCounter_InternalRegister : InternalRegister
    protected _fetchDecodeStage_Instruction_InternalRegister : InternalRegister

    protected _CallStack_InternalRAM : InternalRAM
    protected _StackPointerControlUOflow_InternalFlipflopD : InternalFlipflopD
    protected _StackPointerUOflow_InternalFlipflopD : InternalFlipflopD

    protected _decodeExecuteStage_CallStack_InternalRegister : InternalRegister
    protected _decodeExecuteStage_ProgramCounter_InternalRegister : InternalRegister
    protected _decodeExecuteStage_DataRAMAddress_InternalRegister : InternalRegister
    protected _Accumulator_InternalRegister : InternalRegister
    protected _decodeExecuteStage_DataRAMIn_InternalRegister : InternalRegister
    protected _decodeExecuteStage_ALUoperation_InternalRegister : InternalRegister
    protected _decodeExecuteStage_ControlUnit_InternalRegister : InternalRegister

    protected _executeWritebackStage_CallStack_InternalRegister : InternalRegister
    protected _executeWritebackStage_ProgramCounter_InternalRegister : InternalRegister
    protected _executeWritebackStage_DataRAMAddress_InternalRegister : InternalRegister
    protected _executeWritebackStage_DataRAMOut_InternalRegister : InternalRegister
    protected _executeWritebackStage_ALUOuputs_InternalRegister : InternalRegister
    protected _Flags_InternalRegister: InternalRegister
    protected _executeWritebackStage_ControlUnit_InternalRegister : InternalRegister

    protected _Operations_InternalCounter : InternalCounter

    private _jump : LogicValue = Unknown
    private _backwardJump : LogicValue = Unknown
    private _operandValue : LogicValue[] = ArrayFillWith(false, this.numDataBits)

    public constructor(parent: DrawableParent, params: CPUParams, saved?: CPURepr) {
        super(parent, CPUDef, params, saved)

        this.numInstructionBits = params.numInstructionBits
        //this._directAddressingMode = saved?.directAddressingMode ?? CPUDef.aults.directAddressingMode

        this._trigger = saved?.trigger ?? CPUDef.aults.trigger

        this._mustGetFetchInstructionAgain = true

        this._fetchStage_SequentialExecutionClock_InternalFlipflopD = new InternalFlipflopD(EdgeTrigger.falling)
        this._fetchStage_SequentialExecutionClock_InternalFlipflopD.inputPre= true
        //this._fetchStage_SequentialExecutionClock_InternalFlipflopD.recalcInternalValue()
        this._decodeStage_SequentialExecutionClock_InternalFlipflopD = new InternalFlipflopD(EdgeTrigger.falling)
        this._decodeStage_SequentialExecutionClock_InternalFlipflopD.inputClr = true
        this._executeStage_SequentialExecutionClock_InternalFlipflopD = new InternalFlipflopD(EdgeTrigger.falling)
        this._executeStage_SequentialExecutionClock_InternalFlipflopD.inputClr = true
        this._writebackStage_SequentialExecutionClock_InternalFlipflopD = new InternalFlipflopD(EdgeTrigger.falling)
        this._writebackStage_SequentialExecutionClock_InternalFlipflopD.inputClr = true

        this._control_SequentialExecutionState_InternalFlipflopD = new InternalFlipflopD(EdgeTrigger.falling)
        this._control_SequentialExecutionState_InternalFlipflopD.inputClr = true
        this._control_PipelineState_InternalFlipflopD = new InternalFlipflopD(EdgeTrigger.falling)
        this._control_PipelineState_InternalFlipflopD.inputClr = true
        // ????
        this._pipeline = this._control_PipelineState_InternalFlipflopD.outputQ

        this._sequentialExecution = !(this._control_SequentialExecutionState_InternalFlipflopD.outputQ && this._pipeline)

        this._control_RunStopState_InternalFlipflopD = new InternalFlipflopD(EdgeTrigger.falling)
        this._control_RunStopState_InternalFlipflopD.inputClr = true
        this._control_ResetState_InternalFlipflopD = new InternalFlipflopD(EdgeTrigger.falling)
        this._control_ResetState_InternalFlipflopD.inputPre = true
        this._control_ResetState_InternalFlipflopD.recalcInternalValue()
        this._control_AddressingModeState_InternalFlipflopD = new InternalFlipflopD(EdgeTrigger.falling)
        this._control_AddressingModeState_InternalFlipflopD.inputClr = true
        // ????
        this._addressingMode = this._control_AddressingModeState_InternalFlipflopD.outputQ

        this._control_HaltState_InternalFlipflopD = new InternalFlipflopD(EdgeTrigger.falling)
        this._control_HaltState_InternalFlipflopD.inputClr = true

        this._StackPointer_InternalRegister = new InternalRegister(this.numStackBits, EdgeTrigger.falling)
        this._StackPointer_InternalRegister.inputPre = true
        //this._StackPointer_InternalRegister.recalcInternalValue()
        this._ProgramCounter_InternalRegister = new InternalRegister(this.numInstructionAddressBits, EdgeTrigger.falling)
        this._ProgramCounter_InternalRegister.inputClr = true
        //this._ProgramCounter_InternalRegister.recalcInternalValue()

        this._fetchDecodeStage_StackPointer_InternalRegister = new InternalRegister(this.numStackBits, EdgeTrigger.falling)
        this._fetchDecodeStage_StackPointer_InternalRegister.inputPre = true
        //this._fetchDecodeStage_StackPointer_InternalRegister.recalcInternalValue()
        this._fetchDecodeStage_StackPointerALUoutputs_InternalRegister = new InternalRegister(this.numStackBits, EdgeTrigger.falling)
        this._fetchDecodeStage_StackPointerALUoutputs_InternalRegister.inputClr = true
        this._fetchDecodeStage_CallStack_InternalRegister = new InternalRegister(this.numInstructionAddressBits, EdgeTrigger.falling)
        this._fetchDecodeStage_CallStack_InternalRegister.inputClr = true
        this._fetchDecodeStage_ProgramCounter_InternalRegister = new InternalRegister(this.numInstructionAddressBits, EdgeTrigger.falling)
        this._fetchDecodeStage_ProgramCounter_InternalRegister.inputClr = true
        this._fetchDecodeStage_Instruction_InternalRegister = new InternalRegister(this.numInstructionBits, EdgeTrigger.falling)
        this._fetchDecodeStage_Instruction_InternalRegister.inputClr = true

        // const instructionInit = this.inputValues(this.inputs.Instr)
        // Needs to revert all inputs to be compatible with choosen ISA
        // const instructionInit_FETCH = instructionInit.reverse()
        // this._fetchDecodeStage_Instruction_InternalRegister.inputsD = instructionInit_FETCH

        // const instructionInit_FETCH_opCodeValue = instructionInit_FETCH.slice(0, 4).reverse()
        // const instructionInit_FETCH_opCodeIndex = displayValuesFromArray(instructionInit_FETCH_opCodeValue, false)[1]
        // const iinstructionInit_FETCH_opCodeName = isUnknown(instructionInit_FETCH_opCodeIndex) ? Unknown : CPUOpCodes[instructionInit_FETCH_opCodeIndex]

        // const instructionInit_FETCH_operands = instructionInit_FETCH.slice(4, 8).reverse()
        // this._opCodeOperandsInStages = {FETCH: instructionInit_FETCH_opCodeName + "+" + this.getOperandsNumberWithRadix(instructionInit_FETCH_operands, 2), DECODE: "", EXECUTE: ""}
        // this._fetchDecodeStage_Instruction_InternalRegister.inputClr = true
        // this._fetchDecodeStage_Instruction_InternalRegister.recalcInternalValue()

        this._CallStack_InternalRAM = new InternalRAM(this.numInstructionAddressBits, this.numStackBits)
        this._CallStack_InternalRAM.inputClr =true
        this._StackPointerControlUOflow_InternalFlipflopD = new InternalFlipflopD(EdgeTrigger.falling)
        this._StackPointerControlUOflow_InternalFlipflopD.inputClr =true
        this._StackPointerUOflow_InternalFlipflopD = new InternalFlipflopD(EdgeTrigger.falling)
        this._StackPointerUOflow_InternalFlipflopD.inputClr = true

        // this._fetchDecodeStage_Instruction_InternalRegister.recalcInternalValue()
        this._decodeExecuteStage_CallStack_InternalRegister = new InternalRegister(this.numInstructionAddressBits, EdgeTrigger.falling)
        this._decodeExecuteStage_CallStack_InternalRegister.inputClr = true
        this._decodeExecuteStage_ProgramCounter_InternalRegister = new InternalRegister(this.numInstructionAddressBits, EdgeTrigger.falling)
        this._decodeExecuteStage_ProgramCounter_InternalRegister.inputClr = true
        this._decodeExecuteStage_DataRAMAddress_InternalRegister = new InternalRegister(this.numDataBits, EdgeTrigger.falling)
        this._decodeExecuteStage_DataRAMAddress_InternalRegister.inputClr = true
        this._Accumulator_InternalRegister = new InternalRegister(this.numDataBits, EdgeTrigger.falling)
        this._Accumulator_InternalRegister.inputClr = true
        //this._Accumulator_InternalRegister.recalcInternalValue()
        this._decodeExecuteStage_DataRAMIn_InternalRegister = new InternalRegister(this.numDataBits, EdgeTrigger.falling)
        this._decodeExecuteStage_DataRAMIn_InternalRegister.inputClr = true
        this._decodeExecuteStage_ALUoperation_InternalRegister = new InternalRegister(this.numDataBits, EdgeTrigger.falling)
        this._decodeExecuteStage_ALUoperation_InternalRegister.inputClr = true
        this._decodeExecuteStage_ControlUnit_InternalRegister = new InternalRegister(8, EdgeTrigger.falling)
        this._decodeExecuteStage_ControlUnit_InternalRegister.inputClr = true

        // this._Flags_InternalRegister.recalcInternalValue()

        this._executeWritebackStage_CallStack_InternalRegister = new InternalRegister(this.numInstructionAddressBits, EdgeTrigger.falling)
        this._executeWritebackStage_CallStack_InternalRegister.inputClr = true
        this._executeWritebackStage_ProgramCounter_InternalRegister = new InternalRegister(this.numInstructionAddressBits, EdgeTrigger.falling)
        this._executeWritebackStage_ProgramCounter_InternalRegister.inputClr = true
        this._executeWritebackStage_DataRAMAddress_InternalRegister = new InternalRegister(this.numDataAddressBits, EdgeTrigger.falling)
        this._executeWritebackStage_DataRAMAddress_InternalRegister.inputClr = true
        this._executeWritebackStage_DataRAMOut_InternalRegister = new InternalRegister(this.numDataBits, EdgeTrigger.falling)
        this._executeWritebackStage_DataRAMOut_InternalRegister.inputClr = true
        this._executeWritebackStage_ALUOuputs_InternalRegister = new InternalRegister(this.numDataBits, EdgeTrigger.falling)
        this._executeWritebackStage_ALUOuputs_InternalRegister.inputClr = true
        this._Flags_InternalRegister = new InternalRegister(4, EdgeTrigger.falling)
        this._Flags_InternalRegister.inputClr = true
        this._executeWritebackStage_ControlUnit_InternalRegister = new InternalRegister(8, EdgeTrigger.falling)
        this._executeWritebackStage_ControlUnit_InternalRegister.inputClr = true

        //this._internalSpecialVoidProgramCounterFlipflopD = new InternalFlipflopD(EdgeTrigger.falling)

        this._Operations_InternalCounter = new InternalCounter(16, EdgeTrigger.falling, 10)
        this._Operations_InternalCounter.inputClr = true
        // this._Operations_InternalCounter.recalcInternalValue()

        //this._sequentialExecution = this._control_SequentialExecutionState_InternalFlipflopD.outputQ && this._control_PipelineState_InternalFlipflopD.outputQ̅
        //this._pipeline = this._control_PipelineState_InternalFlipflopD.outputQ
        //this._addressingMode = this._control_AddressingModeState_InternalFlipflopD.outputQ

        this._lastClock = Unknown
    }

    public toJSON() {
        return {
            instructionBits: this.numInstructionBits === CPUDef.aults.instructionBits ? undefined : this.numInstructionBits,
            ...this.toJSONBase(),
            //directAddressingMode: (this._directAddressingMode !== CPUDef.aults.directAddressingMode) ? this._directAddressingMode : undefined,
            //trigger: (this._trigger !== CPUDef.aults.trigger) ? this._trigger : undefined,
        }
    }

    protected get moduleName() {
        return "CPU"
    }
    /*
    protected doSetDirectAddressingMode(directAddressingMode: boolean) {
        this._directAddressingMode = directAddressingMode
        this.setNeedsRedraw("directAddressingMode changed")
    }
    */
    public static isClockTrigger(trigger: EdgeTrigger, prevClock: LogicValue, clock: LogicValue): boolean {
        return (trigger === EdgeTrigger.rising && prevClock === false && clock === true)
            || (trigger === EdgeTrigger.falling && prevClock === true && clock === false)
    }
    /*
        protected doRecalcValue(): CPUBaseValue {
            const false_ = false as LogicValue
            const result: any = {
                    instructionaddress: ArrayFillWith<LogicValue>(false_, this.numInstructionAddressBits),
                    dataaddress: ArrayFillWith<LogicValue>(false_, this.numAddressBits),
                    dataout: ArrayFillWith<LogicValue>(false_, this.numDataBits),
                    //instruction: ArrayFillWith<LogicValue>(false_, defaults.numInstructionBits),
                    //datain: ArrayFillWith<LogicValue>(false_, defaults.numDataBits),
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
    protected doRecalcValue(): CPUBaseValue {
        /*
         BE CAREFUL WITH .reverse()
         IT AFFECTS THE OBJECT !!!
         */

        //GET AND SAVE ALL useful INPUTS
        const _SequentialExecution_input= this.inputs.SequentialExecution.value
        const _Pipeline_input= this.inputs.Pipeline.value
        const _RunStop_input= this.inputs.RunStop.value
        const _ManStep_input= this.inputs.ManStep.value
        const _Reset_input= this.inputs.Reset.value
        const _Speed_input= this.inputs.Speed.value
        const _ClockS_input= this.inputs.ClockS.value
        const _ClockF_input= this.inputs.ClockF.value
        const _AddressingMode_input= this.inputs.AddressingMode.value

        const _Instruction_inputs = this.inputs.Instruction
        const _DataIn_inputs = this.inputs.DataIn

        //GET AND SAVE ALL useful OUTPUTS
        const _fetchStage_SequentialExecutionClock_InternalFlipflopD_outputQ = this._fetchStage_SequentialExecutionClock_InternalFlipflopD.outputQ
        const _decodeStage_SequentialExecutionClock_InternalFlipflopD_outputQ = this._decodeStage_SequentialExecutionClock_InternalFlipflopD.outputQ
        const _executeStage_SequentialExecutionClock_InternalFlipflopD_outputQ = this._executeStage_SequentialExecutionClock_InternalFlipflopD.outputQ
        const _writebackStage_SequentialExecutionClock_InternalFlipflopD_outputQ = this._writebackStage_SequentialExecutionClock_InternalFlipflopD.outputQ

        const _control_SequentialExecutionState_InternalFlipflopD_outputQ = this._control_SequentialExecutionState_InternalFlipflopD.outputQ
        const _control_PipelineState_InternalFlipflopD_outputQ = this._control_PipelineState_InternalFlipflopD.outputQ
        const _control_PipelineState_InternalFlipflopD_outputQ̅  = this._control_PipelineState_InternalFlipflopD.outputQ̅
        const _control_RunStopState_InternalFlipflopD_outputQ = this._control_RunStopState_InternalFlipflopD.outputQ
        const _control_RunStopState_InternalFlipflopD_outputQ̅ = this._control_RunStopState_InternalFlipflopD.outputQ̅
        const _control_ResetState_InternalFlipflopD_outputQ = this._control_ResetState_InternalFlipflopD.outputQ
        const _control_ResetState_InternalFlipflopD_outputQ̅ = this._control_ResetState_InternalFlipflopD.outputQ̅
        const _control_AddressingModeState_InternalFlipflopD_outputQ = this._control_AddressingModeState_InternalFlipflopD.outputQ
        const _control_HaltState_InternalFlipflopD_outputQ = this._control_HaltState_InternalFlipflopD.outputQ
        const _control_HaltState_InternalFlipflopD_outputQ̅ = this._control_HaltState_InternalFlipflopD.outputQ̅

        const _StackPointer_InternalRegister_outputsQ = this._StackPointer_InternalRegister.outputsQ.slice()
        const _ProgramCounter_InternalRegister_outputsQ = this._ProgramCounter_InternalRegister.outputsQ.slice()

        const _fetchDecodeStage_StackPointer_InternalRegister_outputsQ = this._fetchDecodeStage_StackPointer_InternalRegister.outputsQ.slice()
        const _fetchDecodeStage_StackPointerALUoutputs_InternalRegister_outputsQ = this._fetchDecodeStage_StackPointerALUoutputs_InternalRegister.outputsQ.slice()
        const _fetchDecodeStage_CallStack_InternalRegister_outputsQ = this._fetchDecodeStage_CallStack_InternalRegister.outputsQ.slice()
        const _fetchDecodeStage_ProgramCounter_InternalRegister_outputsQ = this._fetchDecodeStage_ProgramCounter_InternalRegister.outputsQ.slice()
        const _fetchDecodeStage_Instruction_InternalRegister_outputsQ = this._fetchDecodeStage_Instruction_InternalRegister.outputsQ.slice()

        const _CallStack_InternalRAM_outputsQ = this._CallStack_InternalRAM.outputsQ.slice()
        const _StackPointerControlUOflow_InternalFlipflopD_outputQ = this._StackPointerControlUOflow_InternalFlipflopD.outputQ
        const _StackPointerControlUOflow_InternalFlipflopD_outputQ̅ = this._StackPointerControlUOflow_InternalFlipflopD.outputQ̅
        const _StackPointerUOflow_InternalFlipflopD_outputQ = this._StackPointerUOflow_InternalFlipflopD.outputQ

        const _decodeExecuteStage_CallStack_InternalRegister_outputsQ = this._decodeExecuteStage_CallStack_InternalRegister.outputsQ.slice()
        const _decodeExecuteStage_ProgramCounter_InternalRegister_outputsQ = this._decodeExecuteStage_ProgramCounter_InternalRegister.outputsQ.slice()
        const _decodeExecuteStage_DataRAMAddress_InternalRegister_outputsQ = this._decodeExecuteStage_DataRAMAddress_InternalRegister.outputsQ.slice()
        const _Accumulator_InternalRegister_outputsQ = this._Accumulator_InternalRegister.outputsQ.slice()
        const _decodeExecuteStage_DataRAMIn_InternalRegister_outputsQ = this._decodeExecuteStage_DataRAMIn_InternalRegister.outputsQ.slice()
        const _decodeExecuteStage_ALUoperation_InternalRegister_outputsQ = this._decodeExecuteStage_ALUoperation_InternalRegister.outputsQ.slice()
        const _decodeExecuteStage_ControlUnit_InternalRegister_outputsQ = this._decodeExecuteStage_ControlUnit_InternalRegister.outputsQ.slice()

        const _executeWritebackStage_CallStack_InternalRegister_outputsQ = this._executeWritebackStage_CallStack_InternalRegister.outputsQ.slice()
        const _executeWritebackStage_ProgramCounter_InternalRegister_outputsQ = this._executeWritebackStage_ProgramCounter_InternalRegister.outputsQ.slice()
        const _executeWritebackStage_DataRAMAddress_InternalRegister_outputsQ = this._executeWritebackStage_DataRAMAddress_InternalRegister.outputsQ.slice()
        const _executeWritebackStage_DataRAMOut_InternalRegister_outputsQ = this._executeWritebackStage_DataRAMOut_InternalRegister.outputsQ.slice()
        const _executeWritebackStage_ALUOuputs_InternalRegister_outputsQ = this._executeWritebackStage_ALUOuputs_InternalRegister.outputsQ.slice()
        const _Flags_InternalRegister_outputsQ = this._Flags_InternalRegister.outputsQ.slice()
        const _executeWritebackStage_ControlUnit_InternalRegister_outputsQ = this._executeWritebackStage_ControlUnit_InternalRegister.outputsQ.slice()

        const _Operations_InternalCounter_outputsQ = this._Operations_InternalCounter.outputsQ.slice()

        // RUN CONTROL LOGIC
        const prevClock= this._lastClock
        const clockSpeed= this.inputs.Speed.value ? this.inputs.ClockF.value : this.inputs.ClockS.value
        const clockSync= this._lastClock = (_control_RunStopState_InternalFlipflopD_outputQ̅ ? this.inputs.ManStep.value : clockSpeed) && _control_HaltState_InternalFlipflopD_outputQ̅

        const runningState= _control_RunStopState_InternalFlipflopD_outputQ̅ ? this.inputs.ManStep.value && _control_RunStopState_InternalFlipflopD_outputQ̅ : _control_RunStopState_InternalFlipflopD_outputQ
        const haltSignal= _control_HaltState_InternalFlipflopD_outputQ || (_control_ResetState_InternalFlipflopD_outputQ̅ && this._control_RunStopState_InternalFlipflopD.outputQ̅)
        const directAddressingMode= _control_ResetState_InternalFlipflopD_outputQ && this.inputs.AddressingMode.value

        //console.log((this._control_RunStopState_InternalFlipflopD.outputQ̅ ? this.inputs.ManStep.value : clockSpeed) && this._internalHaltSignalFlipflopD.outputQ̅)
        //console.log(this._control_RunStopState_InternalFlipflopD.outputQ̅ )
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

        // Reset Button

        const resetSignal = this.inputs.Reset.value && _control_RunStopState_InternalFlipflopD_outputQ̅

        this._fetchStage_SequentialExecutionClock_InternalFlipflopD.inputPre = resetSignal
        this._decodeStage_SequentialExecutionClock_InternalFlipflopD.inputClr = resetSignal
        this._executeStage_SequentialExecutionClock_InternalFlipflopD.inputClr = resetSignal
        this._writebackStage_SequentialExecutionClock_InternalFlipflopD.inputClr = resetSignal

        if (this.inputs.SequentialExecution.value) {
            this._control_SequentialExecutionState_InternalFlipflopD.inputPre = resetSignal
        } else {
            this._control_SequentialExecutionState_InternalFlipflopD.inputClr = resetSignal
        }
        if (this.inputs.Pipeline.value) {
            this._control_PipelineState_InternalFlipflopD.inputPre = resetSignal
        } else {
            this._control_PipelineState_InternalFlipflopD.inputClr = resetSignal
        }
        this._control_RunStopState_InternalFlipflopD.inputClr = resetSignal
        this._control_ResetState_InternalFlipflopD.inputPre = resetSignal
        if (this.inputs.AddressingMode.value) {
            this._control_AddressingModeState_InternalFlipflopD.inputPre = resetSignal
        } else {
            this._control_AddressingModeState_InternalFlipflopD.inputClr = resetSignal
        }
        this._control_HaltState_InternalFlipflopD.inputClr = resetSignal

        this._StackPointer_InternalRegister.inputPre = resetSignal
        this._ProgramCounter_InternalRegister.inputClr = resetSignal

        this._fetchDecodeStage_StackPointer_InternalRegister.inputPre = resetSignal
        this._fetchDecodeStage_CallStack_InternalRegister.inputClr = resetSignal
        this._fetchDecodeStage_ProgramCounter_InternalRegister.inputClr = resetSignal
        this._fetchDecodeStage_Instruction_InternalRegister.inputClr = resetSignal

        this._CallStack_InternalRAM.inputClr = resetSignal
        this._StackPointerControlUOflow_InternalFlipflopD.inputClr = resetSignal
        this._StackPointerUOflow_InternalFlipflopD.inputClr = resetSignal

        this._decodeExecuteStage_DataRAMIn_InternalRegister.inputClr = resetSignal
        this._decodeExecuteStage_ALUoperation_InternalRegister.inputClr = resetSignal
        this._decodeExecuteStage_ControlUnit_InternalRegister.inputClr = resetSignal
        this._Accumulator_InternalRegister.inputClr = resetSignal
        this._decodeExecuteStage_DataRAMIn_InternalRegister.inputClr = resetSignal
        this._decodeExecuteStage_ALUoperation_InternalRegister.inputClr = resetSignal
        this._decodeExecuteStage_ControlUnit_InternalRegister.inputClr  = resetSignal

        this._executeWritebackStage_CallStack_InternalRegister.inputClr = resetSignal
        this._executeWritebackStage_ProgramCounter_InternalRegister.inputClr = resetSignal
        this._executeWritebackStage_DataRAMAddress_InternalRegister.inputClr = resetSignal
        this._executeWritebackStage_DataRAMOut_InternalRegister.inputClr = resetSignal
        this._executeWritebackStage_ALUOuputs_InternalRegister.inputClr = resetSignal
        this._Flags_InternalRegister.inputClr = resetSignal
        this._executeWritebackStage_ControlUnit_InternalRegister.inputClr = resetSignal

        // this._Flags_InternalRegister.recalcInternalValue()

        this._Operations_InternalCounter.inputClr = resetSignal

        this._sequentialExecution = _control_SequentialExecutionState_InternalFlipflopD_outputQ && _control_PipelineState_InternalFlipflopD_outputQ̅
        this._pipeline = _control_PipelineState_InternalFlipflopD_outputQ
        this._addressingMode = _control_AddressingModeState_InternalFlipflopD_outputQ

        // FETCH instruction : first because we need all signals to prepare the inputs for the next CPU's state

        const instruction = this.inputValues(this.inputs.Instruction)

        //const instruction = this.inputValues(this.inputs.Instr).map(LogicValue.filterHighZ)
        //console.log(this._internalFetchFlipflopD.outputQ)
        // Needs to revert all inputs to be compatible with choosen ISA
        let instruction_FETCH: LogicValue[]
        //console.log(this.getOperandsNumberWithRadix(instruction_FETCH, 2))
        // naive approach !
        // this._fetchDecodeStage_Instruction_InternalRegister.inputsD = instruction_FETCH
        // console.log("*",this._fetchDecodeStage_Instruction_InternalRegister.inputsD)

        if (this._pipeline) {
            instruction_FETCH = this._fetchDecodeStage_Instruction_InternalRegister.inputsD
        } else {
            instruction_FETCH = instruction.reverse()
        }

        //console.log(instruction_FETCH)

        // const instruction_FETCH_opCodeValue = instruction_FETCH.slice(0, 4).reverse()
        const instruction_FETCH_opCodeValue = instruction_FETCH.slice(0, 4)
        const instruction_FETCH_opCodeIndex = displayValuesFromArray(instruction_FETCH_opCodeValue, true)[1]
        const instruction_FETCH_opCodeName = isUnknown(instruction_FETCH_opCodeIndex) ? Unknown : CPUOpCodes[instruction_FETCH_opCodeIndex]

        // const instruction_FETCH_operands = instruction_FETCH.slice(4, 8).reverse()
        const instruction_FETCH_operands = instruction_FETCH.slice(4, 8)

        const cycle = this.cycle
        const stage = this._pipeline ? CPUStages[(cycle) % CPUStages.length] : CPUStages[(cycle) % CPUStages.length]

        if (resetSignal || cycle == 0) {
            //this._lastClock = Unknown
            this._opCodeOperandsInStages = {
                FETCH: "",
                DECODE: "",
                EXECUTE: "",
                WRITEBACK: ""
            }
            this._addressesInStages = {
                FETCH: -1,
                DECODE: -1,
                EXECUTE: -1,
                WRITEBACK: -1
            }
        }

        if (CPU.isClockTrigger(this._trigger, prevClock, clockSync) || resetSignal) {
            let currentInstructionAddress = displayValuesFromArray(_ProgramCounter_InternalRegister_outputsQ, false)[1]
            if (currentInstructionAddress == Unknown) {
                currentInstructionAddress = -1
            }
            currentInstructionAddress = resetSignal ? -1 : currentInstructionAddress

            console.log("before ", this._addressesInStages)
            if (!this._pipeline) {
                for (let eachStage of CPUStages) {
                    if (eachStage == stage) {
                        console.log(stage)
                        this._opCodeOperandsInStages[eachStage] = instruction_FETCH_opCodeName + "+" + this.getOperandsNumberWithRadix(instruction_FETCH_operands, 2)

                        this._addressesInStages[eachStage] = currentInstructionAddress
                    } else {
                        this._opCodeOperandsInStages[eachStage] = ""

                        this._addressesInStages[eachStage] = -1
                    }
                }
            }
            console.log("after", this._opCodeOperandsInStages)

            let messageForAssemblerEditor = ""

            for (let eachStage of CPUStages) {
                const stageColor = CPUStageColorKey.color(eachStage)
                const stageColorBackground = COLOR_CPUSTAGE_BACKGROUND[stageColor]
                messageForAssemblerEditor += this._addressesInStages[eachStage].toString() + ":" + stageColorBackground + "+"
            }

            this.CPUeventDispatcher(messageForAssemblerEditor)
        }

        // We must get it again, but why ?
        this._opCodeOperandsInStages["FETCH"] = instruction_FETCH_opCodeName + "+" + this.getOperandsNumberWithRadix(instruction_FETCH_operands, 2)

        // ISA_v8

        const opCodeValue = instruction_FETCH.slice(0, 4).reverse()
        const opCodeIndex = displayValuesFromArray(opCodeValue, false)[1]
        const opCodeName = isUnknown(opCodeIndex) ? Unknown : CPUOpCodes[opCodeIndex]

        const operandValue = instruction_FETCH.slice(4, 8).reverse()

        // Control Unit Signals
        let _ALUoperation_controlUnitBit_7: LogicValue
        _ALUoperation_controlUnitBit_7 = (opCodeValue[0] && !opCodeValue[1] && !opCodeValue[2]) || (opCodeValue[0] && opCodeValue[1])
        const __loadToAccumulator = !opCodeValue[0] && !opCodeValue[1] && opCodeValue[2]
        const _loadDataInputToAccumulatorSelector= __loadToAccumulator && !opCodeValue[3]
        let _accumulatorInputSelector: LogicValue
        if (this._pipeline) {
            _accumulatorInputSelector = _executeWritebackStage_ControlUnit_InternalRegister_outputsQ[7]
        } else {
            _accumulatorInputSelector = _ALUoperation_controlUnitBit_7
        }
        let _accumulatorClock = _accumulatorInputSelector || __loadToAccumulator
        const _saveAccumulatorToRAM_controlUnitBit_6 = !opCodeValue[0] && !opCodeValue[1] && !opCodeValue[2] && opCodeValue[3]
        const _subroutineCall = opCodeValue[1] && !opCodeValue[2] && opCodeValue[3]
        const _jumpToSubroutine = _subroutineCall && !opCodeValue[3]
        const _returnFromSubroutine_controlUnitBit_5 = _subroutineCall && opCodeValue[3]
        const __jump = !opCodeValue[0] && opCodeValue[1] && !opCodeValue[2]
        const _jumpUp_controlUnitBit_0 = __jump && opCodeValue[3]
        const _jumpCallDetection_controlUnitBit_4 = _subroutineCall || __jump
        const __branch = !opCodeValue[0] && opCodeValue[1] && opCodeValue[2]
        const _branchOnZ_controlUnitBit_1 = __branch && !opCodeValue[3]
        const _branchOnC_controlUnitBit_2 = __branch && opCodeValue[3]
        const _halt = this.allZeros(operandValue) && __jump
        
        let ramwevalue: LogicValue
        if (this._pipeline) {
            ramwevalue = _executeWritebackStage_ControlUnit_InternalRegister_outputsQ[6]
        } else {
            ramwevalue = _saveAccumulatorToRAM_controlUnitBit_6
        }

        this._executeWritebackStage_ControlUnit_InternalRegister.inputsD = _decodeExecuteStage_ControlUnit_InternalRegister_outputsQ

        // FETCH STACK MANAGEMENT

        const _stackPointerALUinputA = _StackPointer_InternalRegister_outputsQ.slice()
        const _stackPointerALUinputB = [true]
        ArrayClampOrPad(_stackPointerALUinputB, this.numStackBits, false)

        let _stackPointerALUoutputs
        if (_jumpToSubroutine) {
            _stackPointerALUoutputs= doALUOp("A-B", _stackPointerALUinputA, _stackPointerALUinputB,false)
        } else {
            _stackPointerALUoutputs= doALUOp("A+B", _stackPointerALUinputA, _stackPointerALUinputB,false)
        }

        if (_subroutineCall) {
            this._StackPointer_InternalRegister.inputsD = _stackPointerALUoutputs.s
        } else {
            this._StackPointer_InternalRegister.inputsD = _StackPointer_InternalRegister_outputsQ
        }

        // FETCH PROGRAM COUNTER
        const _programCounterALUInputA = _ProgramCounter_InternalRegister_outputsQ.slice()
        const _programCounterALUInputB = [true]
        ArrayClampOrPad(_programCounterALUInputB, this.numInstructionAddressBits, false)

        const _programCounterALUoutputs= doALUOp("A+B", _programCounterALUInputA, _programCounterALUInputB,false)

        // fetchDecode Transition
        this._fetchDecodeStage_StackPointer_InternalRegister.inputsD = _StackPointer_InternalRegister_outputsQ
        this._fetchDecodeStage_StackPointerALUoutputs_InternalRegister.inputsD = _stackPointerALUoutputs.s

        this._fetchDecodeStage_CallStack_InternalRegister.inputsD = _programCounterALUoutputs.s
        this._fetchDecodeStage_ProgramCounter_InternalRegister.inputsD = _ProgramCounter_InternalRegister_outputsQ

        this._fetchDecodeStage_Instruction_InternalRegister.inputsD = this.inputValues(this.inputs.Instruction)

        // DECODE CALL STACK
        if (_returnFromSubroutine_controlUnitBit_5) {
            if (this._pipeline) {
                this._CallStack_InternalRAM.inputsAddr = _fetchDecodeStage_StackPointerALUoutputs_InternalRegister_outputsQ
            } else {
                this._CallStack_InternalRAM.inputsAddr = _stackPointerALUoutputs.s
            }

        } else {
            if (this._pipeline) {
                this._CallStack_InternalRAM.inputsAddr = _fetchDecodeStage_StackPointer_InternalRegister_outputsQ
            } else {
                this._CallStack_InternalRAM.inputsAddr = _StackPointer_InternalRegister_outputsQ
            }
        }

        if (this._pipeline) {
            this._CallStack_InternalRAM.inputsD = _fetchDecodeStage_CallStack_InternalRegister_outputsQ
        } else {
            this._CallStack_InternalRAM.inputsD = _programCounterALUoutputs.s
        }

        this._CallStack_InternalRAM.inputWE = _jumpToSubroutine

        // DECODE PROGRAM COUNTER
        let _programCounterJumpALUInputA : LogicValue[]
        if (this._pipeline) {
            _programCounterJumpALUInputA = _fetchDecodeStage_ProgramCounter_InternalRegister_outputsQ
        } else {
            _programCounterJumpALUInputA = _ProgramCounter_InternalRegister_outputsQ
        }
        // We must make an arrays clone
        const _programCounterJumpALUInputB = operandValue.slice()
        ArrayClampOrPad(_programCounterJumpALUInputB, this.numInstructionAddressBits, false)

        let _ProgramCounterJumpALUoutputs
        if (_jumpUp_controlUnitBit_0) {
            _ProgramCounterJumpALUoutputs= doALUOp("A-B", _programCounterJumpALUInputA, _programCounterJumpALUInputB,false)
        } else {
            _ProgramCounterJumpALUoutputs= doALUOp("A+B", _programCounterJumpALUInputA, _programCounterJumpALUInputB,false)
        }

        let _programCounterJumpValue : LogicValue[]
        if (this._addressingMode) {
            _programCounterJumpValue = _programCounterJumpALUInputB
        } else {
            _programCounterJumpValue = _ProgramCounterJumpALUoutputs.s
        }

        // DECODE STACK UOFLOW
        const _stackPointerRegisterNotOrOnOutputs= !(logicalOROnEveryBits(_StackPointer_InternalRegister_outputsQ))
        const _stackPointerRegisterAndOnOutputs= logicalANDOnEveryBits(_StackPointer_InternalRegister_outputsQ)

        const _stackPointerControlUOflowSelector= (_jumpToSubroutine && _stackPointerRegisterNotOrOnOutputs && _StackPointerControlUOflow_InternalFlipflopD_outputQ̅) || (_returnFromSubroutine_controlUnitBit_5 && _stackPointerRegisterAndOnOutputs && _StackPointerControlUOflow_InternalFlipflopD_outputQ)
        if (_stackPointerControlUOflowSelector) {
            this._StackPointerControlUOflow_InternalFlipflopD.inputD = _StackPointerControlUOflow_InternalFlipflopD_outputQ̅
        } else {
            this._StackPointerControlUOflow_InternalFlipflopD.inputD = _StackPointerControlUOflow_InternalFlipflopD_outputQ
        }
        const _stackPointerUOflowValue= ((_returnFromSubroutine_controlUnitBit_5 && _stackPointerRegisterAndOnOutputs && _StackPointerControlUOflow_InternalFlipflopD_outputQ̅) || (_jumpToSubroutine && _stackPointerRegisterNotOrOnOutputs && _StackPointerControlUOflow_InternalFlipflopD_outputQ)) || _StackPointerUOflow_InternalFlipflopD_outputQ
        this._StackPointerUOflow_InternalFlipflopD.inputD = _stackPointerUOflowValue

        // DECODE DATA ADDRESS
        this._decodeExecuteStage_DataRAMAddress_InternalRegister.inputsD = operandValue.slice()

        // DECODE DATA ACCUMULATOR first step
        let _inputsAccumulatorData: LogicValue[]
        if (_loadDataInputToAccumulatorSelector) {
            _inputsAccumulatorData = this.inputValues(this.inputs.DataIn).reverse()
        } else {
            _inputsAccumulatorData = operandValue.slice()
        }

        // DECODE DATA ALU
        let _dataALUopValue: LogicValue[]
        if (this._pipeline) {
            _dataALUopValue = _decodeExecuteStage_ALUoperation_InternalRegister_outputsQ
        } else {
            _dataALUopValue = [opCodeValue[0], !opCodeValue[3], opCodeValue[1], opCodeValue[2]]
        }
        const _dataALUopIndex = displayValuesFromArray(_dataALUopValue, false)[1]
        const _dataALUop = isUnknown(_dataALUopIndex) ? "A+B" : ALUOps[_dataALUopIndex]

        // EXCUTE DATA ALU
        const _dataALUinputA = _Accumulator_InternalRegister_outputsQ.slice()
        let _dataALUinputB : LogicValue[]
        if (this._pipeline) {
            _dataALUinputB = _decodeExecuteStage_DataRAMIn_InternalRegister_outputsQ.slice()
        } else {
            _dataALUinputB = this.inputValues(this.inputs.DataIn).reverse()
        }

        const _dataALUoutputs = doALUOp(_dataALUop, _dataALUinputA, _dataALUinputB, false)

        this._Flags_InternalRegister.inputsD[0] = this.allZeros(_dataALUoutputs.s)
        this._Flags_InternalRegister.inputsD[1] = _dataALUoutputs.cout

        let _programCounterNonSequentialStep_controlUnitBit_3: LogicValue
        if (this._pipeline) {
            _programCounterNonSequentialStep_controlUnitBit_3 = (_Flags_InternalRegister_outputsQ[0] && _decodeExecuteStage_ControlUnit_InternalRegister_outputsQ[1]) || (_Flags_InternalRegister_outputsQ[1] && _decodeExecuteStage_ControlUnit_InternalRegister_outputsQ[2]) || _decodeExecuteStage_ControlUnit_InternalRegister_outputsQ[4]
        } else {
            _programCounterNonSequentialStep_controlUnitBit_3 = (_Flags_InternalRegister_outputsQ[0] && _branchOnZ_controlUnitBit_1) || (_Flags_InternalRegister_outputsQ[1] && _branchOnC_controlUnitBit_2) || _jumpCallDetection_controlUnitBit_4
        }

        if (this._pipeline) {
            if (_executeWritebackStage_ControlUnit_InternalRegister_outputsQ[3]) {
                if (_executeWritebackStage_ControlUnit_InternalRegister_outputsQ[5]) {
                    this._ProgramCounter_InternalRegister.inputsD = _executeWritebackStage_CallStack_InternalRegister_outputsQ
                } else {
                    this._ProgramCounter_InternalRegister.inputsD = _executeWritebackStage_ProgramCounter_InternalRegister_outputsQ
                }
            } else {
                this._ProgramCounter_InternalRegister.inputsD = _programCounterALUoutputs.s
            }
        } else {
            if (_programCounterNonSequentialStep_controlUnitBit_3) {
                if (_returnFromSubroutine_controlUnitBit_5) {
                    this._ProgramCounter_InternalRegister.inputsD = _CallStack_InternalRAM_outputsQ
                } else {
                    this._ProgramCounter_InternalRegister.inputsD = _programCounterJumpValue
                }
            } else {
                this._ProgramCounter_InternalRegister.inputsD = _programCounterALUoutputs.s
            }
        }

        // DECODE DATA ACCUMULATOR second step
        if (_ALUoperation_controlUnitBit_7) {
            if (this._pipeline) {
                _inputsAccumulatorData = _executeWritebackStage_ALUOuputs_InternalRegister_outputsQ
            } else {
                _inputsAccumulatorData = _dataALUoutputs.s
            }
        }

        // decodeExecute Transition
        this._decodeExecuteStage_CallStack_InternalRegister.inputsD = _CallStack_InternalRAM_outputsQ
        this._decodeExecuteStage_ProgramCounter_InternalRegister.inputsD = _programCounterJumpValue

        this._decodeExecuteStage_DataRAMAddress_InternalRegister.inputsD = operandValue.slice()
        this._Accumulator_InternalRegister.inputsD = _inputsAccumulatorData
        this._decodeExecuteStage_DataRAMIn_InternalRegister.inputsD = this.inputValues(this.inputs.DataIn).reverse()
        this._decodeExecuteStage_ALUoperation_InternalRegister.inputsD = [opCodeValue[0], !opCodeValue[3], opCodeValue[1], opCodeValue[2]]

        this._decodeExecuteStage_ControlUnit_InternalRegister.inputsD[0] = _jumpUp_controlUnitBit_0
        this._decodeExecuteStage_ControlUnit_InternalRegister.inputsD[1] = _branchOnZ_controlUnitBit_1
        this._decodeExecuteStage_ControlUnit_InternalRegister.inputsD[2] = _branchOnC_controlUnitBit_2
        this._decodeExecuteStage_ControlUnit_InternalRegister.inputsD[4] = _jumpCallDetection_controlUnitBit_4
        this._decodeExecuteStage_ControlUnit_InternalRegister.inputsD[5] = _returnFromSubroutine_controlUnitBit_5
        this._decodeExecuteStage_ControlUnit_InternalRegister.inputsD[6] = _saveAccumulatorToRAM_controlUnitBit_6
        this._decodeExecuteStage_ControlUnit_InternalRegister.inputsD[7] = _ALUoperation_controlUnitBit_7

        // executeWriteback Transition
        this._executeWritebackStage_CallStack_InternalRegister.inputsD = _decodeExecuteStage_CallStack_InternalRegister_outputsQ
        this._executeWritebackStage_ProgramCounter_InternalRegister.inputsD = _decodeExecuteStage_ProgramCounter_InternalRegister_outputsQ

        this._executeWritebackStage_DataRAMAddress_InternalRegister.inputsD = _decodeExecuteStage_DataRAMAddress_InternalRegister_outputsQ
        this._executeWritebackStage_DataRAMOut_InternalRegister.inputsD = _Accumulator_InternalRegister_outputsQ
        this._executeWritebackStage_ALUOuputs_InternalRegister.inputsD = _dataALUoutputs.s

        this._executeWritebackStage_ControlUnit_InternalRegister.inputsD[3] = _programCounterNonSequentialStep_controlUnitBit_3
        this._executeWritebackStage_ControlUnit_InternalRegister.inputsD[5] = _decodeExecuteStage_ControlUnit_InternalRegister_outputsQ[5]
        this._executeWritebackStage_ControlUnit_InternalRegister.inputsD[6] = _decodeExecuteStage_ControlUnit_InternalRegister_outputsQ[6]
        this._executeWritebackStage_ControlUnit_InternalRegister.inputsD[7] = _decodeExecuteStage_ControlUnit_InternalRegister_outputsQ[7]

        const ramWESyncValue = this._sequentialExecution ? clockSync : clockSync && _writebackStage_SequentialExecutionClock_InternalFlipflopD_outputQ

        // Compute state after clock
        this._control_HaltState_InternalFlipflopD.inputD = _halt
        this._control_HaltState_InternalFlipflopD.inputClock = clockSync
        this._control_HaltState_InternalFlipflopD.recalcInternalValue()

        this._control_RunStopState_InternalFlipflopD.inputD = _control_RunStopState_InternalFlipflopD_outputQ̅
        this._control_RunStopState_InternalFlipflopD.inputClock = (clockSync && _control_HaltState_InternalFlipflopD_outputQ) || this.inputs.RunStop.value
        this._control_RunStopState_InternalFlipflopD.recalcInternalValue()

        this._control_ResetState_InternalFlipflopD.inputD = false
        this._control_ResetState_InternalFlipflopD.inputClock = clockSync
        this._control_ResetState_InternalFlipflopD.recalcInternalValue()

        this._control_PipelineState_InternalFlipflopD.inputD = this.inputs.Pipeline.value
        this._control_PipelineState_InternalFlipflopD.inputClock = clockSync && _control_ResetState_InternalFlipflopD_outputQ
        this._control_PipelineState_InternalFlipflopD.recalcInternalValue()

        this._control_SequentialExecutionState_InternalFlipflopD.inputD = this.inputs.SequentialExecution.value
        this._control_SequentialExecutionState_InternalFlipflopD.inputClock = clockSync && _control_ResetState_InternalFlipflopD_outputQ
        this._control_SequentialExecutionState_InternalFlipflopD.recalcInternalValue()

        this._fetchStage_SequentialExecutionClock_InternalFlipflopD.inputD = _fetchStage_SequentialExecutionClock_InternalFlipflopD_outputQ
        this._fetchStage_SequentialExecutionClock_InternalFlipflopD.inputClock = clockSync
        this._fetchStage_SequentialExecutionClock_InternalFlipflopD.recalcInternalValue()

        this._decodeStage_SequentialExecutionClock_InternalFlipflopD.inputD = _decodeStage_SequentialExecutionClock_InternalFlipflopD_outputQ
        this._decodeStage_SequentialExecutionClock_InternalFlipflopD.inputClock = clockSync
        this._decodeStage_SequentialExecutionClock_InternalFlipflopD.recalcInternalValue()

        this._executeStage_SequentialExecutionClock_InternalFlipflopD.inputD = _executeStage_SequentialExecutionClock_InternalFlipflopD_outputQ
        this._executeStage_SequentialExecutionClock_InternalFlipflopD.inputClock = clockSync
        this._executeStage_SequentialExecutionClock_InternalFlipflopD.recalcInternalValue()

        this._writebackStage_SequentialExecutionClock_InternalFlipflopD.inputD = _writebackStage_SequentialExecutionClock_InternalFlipflopD_outputQ
        this._writebackStage_SequentialExecutionClock_InternalFlipflopD.inputClock = clockSync
        this._writebackStage_SequentialExecutionClock_InternalFlipflopD.recalcInternalValue()

        this._Operations_InternalCounter.inputClock = clockSync
        this._Operations_InternalCounter.recalcInternalValue()

        if (this._sequentialExecution) {
            const clockSyncFectch =  clockSync && _fetchStage_SequentialExecutionClock_InternalFlipflopD_outputQ
            const clockSyncDecode =  clockSync && _decodeStage_SequentialExecutionClock_InternalFlipflopD_outputQ
            const clockSyncExecute =  clockSync && _executeStage_SequentialExecutionClock_InternalFlipflopD_outputQ
            const clockSyncWriteback =  clockSync && _writebackStage_SequentialExecutionClock_InternalFlipflopD_outputQ

            this._StackPointer_InternalRegister.inputClock = clockSyncFectch
            this._StackPointer_InternalRegister.recalcInternalValue()

            this._ProgramCounter_InternalRegister.inputClock = clockSyncFectch
            this._ProgramCounter_InternalRegister.recalcInternalValue()

            this._fetchDecodeStage_StackPointer_InternalRegister.inputClock = clockSyncDecode
            this._fetchDecodeStage_StackPointer_InternalRegister.recalcInternalValue

            this._fetchDecodeStage_StackPointerALUoutputs_InternalRegister.inputClock = clockSyncDecode
            this._fetchDecodeStage_StackPointerALUoutputs_InternalRegister.recalcInternalValue

            this._fetchDecodeStage_CallStack_InternalRegister.inputClock = clockSyncDecode
            this._fetchDecodeStage_CallStack_InternalRegister.recalcInternalValue

            this._fetchDecodeStage_ProgramCounter_InternalRegister.inputClock = clockSyncDecode
            this._fetchDecodeStage_ProgramCounter_InternalRegister.recalcInternalValue()

            this._fetchDecodeStage_Instruction_InternalRegister.inputClock = clockSyncDecode
            this._fetchDecodeStage_Instruction_InternalRegister.recalcInternalValue()

            this._CallStack_InternalRAM.inputClock = clockSyncDecode
            this._CallStack_InternalRAM.value = this._CallStack_InternalRAM.recalcInternalValue()

            this._StackPointerControlUOflow_InternalFlipflopD.inputClock = clockSyncDecode
            this._StackPointerControlUOflow_InternalFlipflopD.recalcInternalValue()

            this._StackPointerUOflow_InternalFlipflopD.inputClock = clockSyncDecode
            this._StackPointerUOflow_InternalFlipflopD.recalcInternalValue()

            this._decodeExecuteStage_CallStack_InternalRegister.inputClock = clockSyncExecute
            this._decodeExecuteStage_CallStack_InternalRegister.recalcInternalValue()

            this._decodeExecuteStage_ProgramCounter_InternalRegister.inputClock = clockSyncExecute
            this._decodeExecuteStage_ProgramCounter_InternalRegister.recalcInternalValue()

            this._decodeExecuteStage_DataRAMAddress_InternalRegister.inputClock = clockSyncExecute
            this._decodeExecuteStage_DataRAMAddress_InternalRegister.recalcInternalValue()

            this._Accumulator_InternalRegister.inputClock = clockSyncExecute && _accumulatorClock
            this._Accumulator_InternalRegister.recalcInternalValue()

            this._decodeExecuteStage_DataRAMIn_InternalRegister.inputClock = clockSyncExecute
            this._decodeExecuteStage_DataRAMIn_InternalRegister.recalcInternalValue()

            this._decodeExecuteStage_ControlUnit_InternalRegister.inputClock = clockSyncExecute
            this._decodeExecuteStage_ControlUnit_InternalRegister.recalcInternalValue()

            this._Flags_InternalRegister.inputClock = clockSyncWriteback
            this._Flags_InternalRegister.recalcInternalValue()

            this._executeWritebackStage_CallStack_InternalRegister.inputClock = clockSyncWriteback
            this._executeWritebackStage_CallStack_InternalRegister.recalcInternalValue()

            this._executeWritebackStage_ProgramCounter_InternalRegister.inputClock = clockSyncWriteback
            this._executeWritebackStage_ProgramCounter_InternalRegister.recalcInternalValue()

            this._executeWritebackStage_DataRAMAddress_InternalRegister.inputClock = clockSyncWriteback
            this._executeWritebackStage_DataRAMAddress_InternalRegister.recalcInternalValue()

            this._executeWritebackStage_DataRAMOut_InternalRegister.inputClock = clockSyncWriteback
            this._executeWritebackStage_DataRAMOut_InternalRegister.recalcInternalValue()

            this._executeWritebackStage_ALUOuputs_InternalRegister.inputClock = clockSyncWriteback
            this._executeWritebackStage_ALUOuputs_InternalRegister.recalcInternalValue()

            this._executeWritebackStage_ControlUnit_InternalRegister.inputClock = clockSyncWriteback
            this._executeWritebackStage_ControlUnit_InternalRegister.recalcInternalValue()
        } else {
            this._StackPointer_InternalRegister.inputClock = clockSync
            this._StackPointer_InternalRegister.recalcInternalValue()

            this._ProgramCounter_InternalRegister.inputClock = clockSync
            this._ProgramCounter_InternalRegister.recalcInternalValue()

            this._fetchDecodeStage_StackPointer_InternalRegister.inputClock = clockSync
            this._fetchDecodeStage_StackPointer_InternalRegister.recalcInternalValue

            this._fetchDecodeStage_StackPointerALUoutputs_InternalRegister.inputClock = clockSync
            this._fetchDecodeStage_StackPointerALUoutputs_InternalRegister.recalcInternalValue

            this._fetchDecodeStage_CallStack_InternalRegister.inputClock = clockSync
            this._fetchDecodeStage_CallStack_InternalRegister.recalcInternalValue

            this._fetchDecodeStage_ProgramCounter_InternalRegister.inputClock = clockSync
            this._fetchDecodeStage_ProgramCounter_InternalRegister.recalcInternalValue()

            this._fetchDecodeStage_Instruction_InternalRegister.inputClock = clockSync
            this._fetchDecodeStage_Instruction_InternalRegister.recalcInternalValue()

            this._CallStack_InternalRAM.inputClock = clockSync
            this._CallStack_InternalRAM.value = this._CallStack_InternalRAM.recalcInternalValue()

            this._StackPointerControlUOflow_InternalFlipflopD.inputClock = clockSync
            this._StackPointerControlUOflow_InternalFlipflopD.recalcInternalValue()

            this._StackPointerUOflow_InternalFlipflopD.inputClock = clockSync
            this._StackPointerUOflow_InternalFlipflopD.recalcInternalValue()

            this._decodeExecuteStage_CallStack_InternalRegister.inputClock = clockSync
            this._decodeExecuteStage_CallStack_InternalRegister.recalcInternalValue()

            this._decodeExecuteStage_ProgramCounter_InternalRegister.inputClock = clockSync
            this._decodeExecuteStage_ProgramCounter_InternalRegister.recalcInternalValue()

            this._decodeExecuteStage_DataRAMAddress_InternalRegister.inputClock = clockSync
            this._decodeExecuteStage_DataRAMAddress_InternalRegister.recalcInternalValue()

            this._Accumulator_InternalRegister.inputClock = clockSync && _accumulatorClock
            this._Accumulator_InternalRegister.recalcInternalValue()

            this._decodeExecuteStage_DataRAMIn_InternalRegister.inputClock = clockSync
            this._decodeExecuteStage_DataRAMIn_InternalRegister.recalcInternalValue()

            this._decodeExecuteStage_ControlUnit_InternalRegister.inputClock = clockSync
            this._decodeExecuteStage_ControlUnit_InternalRegister.recalcInternalValue()

            this._Flags_InternalRegister.inputClock = clockSync
            this._Flags_InternalRegister.recalcInternalValue()

            this._executeWritebackStage_CallStack_InternalRegister.inputClock = clockSync
            this._executeWritebackStage_CallStack_InternalRegister.recalcInternalValue()

            this._executeWritebackStage_ProgramCounter_InternalRegister.inputClock = clockSync
            this._executeWritebackStage_ProgramCounter_InternalRegister.recalcInternalValue()

            this._executeWritebackStage_DataRAMAddress_InternalRegister.inputClock = clockSync
            this._executeWritebackStage_DataRAMAddress_InternalRegister.recalcInternalValue()

            this._executeWritebackStage_DataRAMOut_InternalRegister.inputClock = clockSync
            this._executeWritebackStage_DataRAMOut_InternalRegister.recalcInternalValue()

            this._executeWritebackStage_ALUOuputs_InternalRegister.inputClock = clockSync
            this._executeWritebackStage_ALUOuputs_InternalRegister.recalcInternalValue()

            this._executeWritebackStage_ControlUnit_InternalRegister.inputClock = clockSync
            this._executeWritebackStage_ControlUnit_InternalRegister.recalcInternalValue()
        }

        if (CPU.isClockTrigger(this._trigger, prevClock, clockSync) || resetSignal) {
            let currentInstructionAddress = displayValuesFromArray(_ProgramCounter_InternalRegister_outputsQ, false)[1]
            if (currentInstructionAddress == Unknown) {
                currentInstructionAddress = -1
            }
            currentInstructionAddress = resetSignal? -1 : currentInstructionAddress

            console.log("before ",this._addressesInStages)
            if (this._pipeline) {
                this._opCodeOperandsInStages["EXECUTE"] = this._opCodeOperandsInStages["DECODE"]
                this._opCodeOperandsInStages["DECODE"] = this._opCodeOperandsInStages["WRITEBACK"]
                this._opCodeOperandsInStages["WRITEBACK"] = this._opCodeOperandsInStages["FETCH"]
                this._opCodeOperandsInStages["FETCH"] = instruction_FETCH_opCodeName
                    + "+" + this.getOperandsNumberWithRadix(instruction_FETCH_operands, 2)

                this._addressesInStages["EXECUTE"] = this._addressesInStages["DECODE"]
                this._addressesInStages["DECODE"] = this._addressesInStages["WRITEBACK"]
                this._addressesInStages["WRITEBACK"] = this._addressesInStages["FETCH"]
                this._addressesInStages["FETCH"] = currentInstructionAddress
            }
            console.log("after", this._opCodeOperandsInStages)

            let messageForAssemblerEditor = ""

            for (let eachStage of CPUStages) {
                const stageColor = CPUStageColorKey.color(eachStage)
                const stageColorBackground = COLOR_CPUSTAGE_BACKGROUND[stageColor]
                messageForAssemblerEditor += this._addressesInStages[eachStage].toString() + ":" + stageColorBackground + "+"
            }

            this.CPUeventDispatcher(messageForAssemblerEditor)
        }

        const false_ = false as LogicValue

        let newState : any

        let dataAddress : LogicValue[]
        if (this._pipeline) {
            if (_executeWritebackStage_ControlUnit_InternalRegister_outputsQ[6]) {
                dataAddress = _executeWritebackStage_DataRAMAddress_InternalRegister_outputsQ
            } else {
                dataAddress = operandValue.slice()
            }
        } else {
            dataAddress = operandValue.slice()
        }

        let dataOut : LogicValue[]
        if (this._pipeline) {
            dataOut = _executeWritebackStage_DataRAMOut_InternalRegister_outputsQ
        } else {
            dataOut = _Accumulator_InternalRegister_outputsQ
        }

        if (isUnknown(opCodeName)) {
            newState = {
                instructionaddress: ArrayFillWith<LogicValue>(false_, this.numInstructionAddressBits),
                dataaddress: ArrayFillWith<LogicValue>(false_, this.numDataBits),
                dataout: ArrayFillWith<LogicValue>(false_, this.numDataBits),
                ramwesync: false_,
                ramwe: false_,
                resetsync: false_,
                sync: false_,
                z: false_,
                //v: false_,
                cout: false_,
                stackuoflow: false_,
                haltsignal: false_,
                runningstate: false_,
            }
        } else {
            newState = {
                instructionaddress: _ProgramCounter_InternalRegister_outputsQ,
                dataaddress: dataAddress,
                dataout: dataOut,
                ramwesync: ramWESyncValue,
                ramwe: ramwevalue,
                resetsync: resetSignal,
                sync: clockSync,
                z: _Flags_InternalRegister_outputsQ[0],
                //v: false_,
                cout: _Flags_InternalRegister_outputsQ[1],
                stackuoflow: _StackPointerUOflow_InternalFlipflopD_outputQ,
                haltsignal: haltSignal,
                runningstate: runningState,
            }
        }

        return newState as CPUBaseValue
    }

    public override propagateValue(newValue: CPUValue) {
        this.outputValues(this.outputs.InstructionAddress, newValue.instructionaddress, true)
        this.outputValues(this.outputs.DataAddress, newValue.dataaddress, true)
        this.outputValues(this.outputs.DataOut, newValue.dataout)
        this.outputs.RAMweSync.value = newValue.ramwesync
        this.outputs.RAMwe.value = newValue.ramwe
        this.outputs.ResetSync.value = newValue.resetsync
        this.outputs.Sync.value = newValue.sync
        this.outputs.Z.value = newValue.z
        //this.outputs.Z.value = allZeros(newValue.dataout)
        //this.outputs.V.value = newValue.v
        this.outputs.Cout.value = newValue.cout
        this.outputs.StackUOflow.value = newValue.stackuoflow
        this.outputs.HaltSignal.value = newValue.haltsignal
        this.outputs.RunningState.value = newValue.runningstate
    }
/*
    public makeStateAfterClock(): CPUBaseValue {
        return []
    }
*/
    public doRecalcValueAfterClock(): [LogicValue[], LogicValue[], LogicValue, LogicValue, LogicValue, LogicValue, LogicValue, LogicValue, LogicValue, LogicValue, LogicValue] {
        return [
            this.inputValues(this.inputs.Instruction).map(LogicValue.filterHighZ),
            this.inputValues(this.inputs.DataIn).map(LogicValue.filterHighZ),
            LogicValue.filterHighZ(this.inputs.SequentialExecution.value),
            LogicValue.filterHighZ(this.inputs.Pipeline.value),
            LogicValue.filterHighZ(this.inputs.RunStop.value),
            LogicValue.filterHighZ(this.inputs.Reset.value),
            LogicValue.filterHighZ(this.inputs.ManStep.value),
            LogicValue.filterHighZ(this.inputs.Speed.value),
            LogicValue.filterHighZ(this.inputs.ClockS.value),
            LogicValue.filterHighZ(this.inputs.ClockF.value),
            LogicValue.filterHighZ(this.inputs.AddressingMode.value)
        ]
    }

    public override makeTooltip() {
        const opCode = this.opCode
        const stage = this.stage
        const s = S.Components.CPU.tooltip
        const opCodeDesc = isUnknown(opCode) ? s.SomeUnknownInstruction : s.ThisInstruction + " " + CPUOpCode.fullName(opCode)
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
        // DISABLED
        drawWireLineToComponent(g, this.inputs.SequentialExecution, this.inputs.SequentialExecution.posXInParentTransform, bottom)
        drawWireLineToComponent(g, this.inputs.Pipeline, this.inputs.Pipeline.posXInParentTransform, bottom)
        drawWireLineToComponent(g, this.inputs.RunStop, this.inputs.RunStop.posXInParentTransform, bottom)
        drawWireLineToComponent(g, this.inputs.Reset, this.inputs.Reset.posXInParentTransform, bottom)
        drawWireLineToComponent(g, this.inputs.ManStep, this.inputs.ManStep.posXInParentTransform, bottom)
        drawWireLineToComponent(g, this.inputs.Speed, this.inputs.Speed.posXInParentTransform, bottom)
        drawWireLineToComponent(g, this.inputs.ClockS, this.inputs.ClockS.posXInParentTransform, bottom)
        drawWireLineToComponent(g, this.inputs.ClockF, this.inputs.ClockF.posXInParentTransform, bottom)
        drawWireLineToComponent(g, this.inputs.AddressingMode, this.inputs.AddressingMode.posXInParentTransform, bottom)

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
        drawWireLineToComponent(g, this.outputs.RAMweSync, right, this.outputs.RAMweSync.posYInParentTransform)
        drawWireLineToComponent(g, this.outputs.RAMwe, right, this.outputs.RAMwe.posYInParentTransform)
        drawWireLineToComponent(g, this.outputs.ResetSync, right, this.outputs.ResetSync.posYInParentTransform)
        drawWireLineToComponent(g, this.outputs.Sync, right, this.outputs.Sync.posYInParentTransform)
        drawWireLineToComponent(g, this.outputs.Z, right, this.outputs.Z.posYInParentTransform)
        //drawWireLineToComponent(g, this.outputs.V, right, this.outputs.V.posYInParentTransform)
        drawWireLineToComponent(g, this.outputs.Cout, right, this.outputs.Cout.posYInParentTransform)
        drawWireLineToComponent(g, this.outputs.StackUOflow, right, this.outputs.StackUOflow.posYInParentTransform)
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
            drawLabel(ctx, this.orient, "DataIn", "s", this.inputs.DataIn, bottom)
            // DISABLED
            drawLabel(ctx, this.orient, "Seq Exec", "s", this.inputs.SequentialExecution, bottom, undefined, true)
            drawLabel(ctx, this.orient, "Pipeline", "s", this.inputs.Pipeline, bottom, undefined, true)
            drawLabel(ctx, this.orient, "Run/Stop", "s", this.inputs.RunStop, bottom, undefined, true)
            drawLabel(ctx, this.orient, "Reset", "s", this.inputs.Reset, bottom, undefined, true)
            drawLabel(ctx, this.orient, "Man Step", "s", this.inputs.ManStep, bottom, undefined, true)
            drawLabel(ctx, this.orient, "Speed", "s", this.inputs.Speed, bottom, undefined, true)
            drawLabel(ctx, this.orient, "Clock S", "s", this.inputs.ClockS, bottom, undefined, true)
            drawLabel(ctx, this.orient, "Clock F", "s", this.inputs.ClockF, bottom, undefined, true)
            drawLabel(ctx, this.orient, "Addr Mode", "s", this.inputs.AddressingMode, bottom, undefined, true)

            // top outputs
            drawLabel(ctx, this.orient, "InstrAddr", "n", this.outputs.InstructionAddress, top)
            drawLabel(ctx, this.orient, "DataAddr", "n", this.outputs.DataAddress, top)

            // left inputs
            drawLabel(ctx, this.orient, "Instr", "w", left, this.inputs.Instruction)

            // right outputs
            drawLabel(ctx, this.orient, "DataOut", "e", right, this.outputs.DataOut)
            drawLabel(ctx, this.orient, "RAM Sync", "e", right, this.outputs.RAMweSync, undefined, true)
            drawLabel(ctx, this.orient, "RAM WE", "e", right, this.outputs.RAMwe, undefined, true)
            drawLabel(ctx, this.orient, "Reset Sync", "e", right, this.outputs.ResetSync, undefined, true)
            drawLabel(ctx, this.orient, "Sync", "e", right, this.outputs.Sync, undefined, true)
            drawLabel(ctx, this.orient, "Z", "e", right, this.outputs.Z, undefined, true)
            //drawLabel(ctx, this.orient, "V", "e", right, this.outputs.V, undefined, true)
            drawLabel(ctx, this.orient, "Cout", "e", right, this.outputs.Cout, undefined, true)
            drawLabel(ctx, this.orient, "Stack UOflow", "e", right, this.outputs.StackUOflow, undefined, true)
            drawLabel(ctx, this.orient, "Halt", "e", right, this.outputs.HaltSignal, undefined, true)
            drawLabel(ctx, this.orient, "Run state", "e", right, this.outputs.RunningState, undefined, true)

            const counter = displayValuesFromArray(this._Operations_InternalCounter.outputsQ, false)[1]
            const stringRep = formatWithRadix(counter, 10, 16, false)
            const stage = (counter == "?") ? 0 : CPUStages[(counter - 1) % CPUStages.length]

            if (this._showStage) {
                for (let eachStage of CPUStages) {
                    const stageColor = CPUStageColorKey.color(eachStage)
                    const stageColorText = COLOR_CPUSTAGE_TEXT[stageColor]
                    const stageColorBackground = COLOR_CPUSTAGE_BACKGROUND[stageColor]

                    const stageName = CPUStageName.shortName(eachStage)
                    const valueCenterDeltaX = (this.orient == "e") ? 75 : (this.orient == "w") ? -75 : 0
                    const valueCenterDeltaY = (this.orient == "n") ? 75 : (this.orient == "s") ? -75 : 0

                    let valueCenterX = this.posX
                    let valueCenterY = Orientation.isVertical(this.orient) ? this.inputs.Instruction.group.posYInParentTransform : this.inputs.Instruction.group.posYInParentTransform - 130
                    switch (eachStage) {
                        case "FETCH":
                            valueCenterX = valueCenterX - 2 * valueCenterDeltaX + (Orientation.isVertical(this.orient) ? (this.orient == "n") ? 50 : 25 : 0) + 37.5
                            valueCenterY = valueCenterY - 2 * valueCenterDeltaY
                            break
                        case "DECODE":
                            valueCenterX = valueCenterX - valueCenterDeltaX + (Orientation.isVertical(this.orient) ? (this.orient == "n") ? 50 : 25 : 0) + 37.5
                            valueCenterY = valueCenterY - valueCenterDeltaY
                            break
                        case "EXECUTE":
                            valueCenterX = valueCenterX + valueCenterDeltaX + (Orientation.isVertical(this.orient) ? (this.orient == "n") ? 50 : 25 : 0) - 37.5
                            valueCenterY = valueCenterY + valueCenterDeltaY
                            break
                        case "WRITEBACK":
                            valueCenterX = valueCenterX + 2 * valueCenterDeltaX + (Orientation.isVertical(this.orient) ? (this.orient == "n") ? 50 : 25 : 0) - 37.5
                            valueCenterY = valueCenterY + 2 * valueCenterDeltaY
                            break
                    }

                    const fontSize = 14
                    const valueCenterBox = ctx.rotatePoint(valueCenterX + (Orientation.isVertical(this.orient) ? (this.orient == "n") ? -fontSize : fontSize : 0
                    ), valueCenterY + (Orientation.isVertical(this.orient) ? 0 : fontSize))
                    g.fillStyle = stageColorBackground
                    const frameWidth = 75
                    FlipflopOrLatch.drawStoredValueFrame(g, ...valueCenterBox, frameWidth, 50, false)

                    const valueCenter = ctx.rotatePoint(valueCenterX, valueCenterY + (Orientation.isVertical(this.orient) ? 0 : (this.orient == "w") ? 28 : 0))
                    g.fillStyle = stageColorText
                    g.font = `bold ${fontSize}px monospace`
                    g.textAlign = "center"
                    g.textBaseline = "middle"
                    if (this._pipeline) {
                        g.fillText(stageName, ...valueCenter)
                    } else {
                        if (eachStage == stage) {
                            g.fillText(stageName, ...valueCenter)
                        }
                    }
                    if (this._showOpCode) {
                        const valueCenterInstruction = ctx.rotatePoint(valueCenterX + (Orientation.isVertical(this.orient) ? (this.orient == "n") ? -30 : 30 : 0), valueCenterY + (Orientation.isVertical(this.orient) ? 0 : (this.orient == "w") ? -2 : 30))
                        //console.log(this._opCodeOperandsInStages)
                        const opCodeName = this.getInstructionParts(this._opCodeOperandsInStages[eachStage], "opCode")
                        const operandsString = this._showOperands ? this.getInstructionParts(this._opCodeOperandsInStages[eachStage], "operands") : ""
                        const instructionDisplay = (opCodeName == "") ? "" : opCodeName + " " + operandsString

                        const fontSize = 15
                        g.font = `bold ${fontSize}px monospace`
                        g.fillStyle = COLOR_COMPONENT_BORDER
                        g.textAlign = "center"
                        g.textBaseline = "middle"
                        if (this._pipeline) {
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
                const valueCenter = ctx.rotatePoint(Orientation.isVertical(this.orient) ? this.inputs.RunStop.posXInParentTransform : this.inputs.ManStep.posXInParentTransform, this.inputs.RunStop.posYInParentTransform - valueCenterDeltaY)

                g.fillStyle = COLOR_EMPTY
                const frameWidth = 100 - fontSize / 2
                FlipflopOrLatch.drawStoredValueFrame(g, ...valueCenter, frameWidth, 28, false)

                g.font = `bold ${fontSize}px sans-serif`
                g.fillStyle = COLOR_LABEL_OFF
                g.textAlign = "center"
                g.textBaseline = "middle"
                g.fillText(stringRep, ...valueCenter)
            }

            if (this._showStack) {
                const addressedContentHeight = 12

                const valueCenterDeltaX = Orientation.isVertical(this.orient) ? (this.orient == "n") ? 55 : -55 : 0
                const valueCenterDeltaY = (this.orient == "n") ? -115 : (this.orient == "s") ? 35 : (this.orient == "e") ? -30 : -50

                const valueCenter = ctx.rotatePoint(Orientation.isVertical(this.orient) ? this.inputs.RunStop.posXInParentTransform : this.inputs.ManStep.posXInParentTransform, this.inputs.Instruction.group.posYInParentTransform)

                const numCellsToDraw = this._CallStack_InternalRAM.numWords
                const numDataBits = this._CallStack_InternalRAM.numDataBits

                const cellWidth = 8 * 10 / numDataBits
                //const cellHeight = 4 * 10 / numCellsToDraw
                const cellHeight = 10

                const valueCenterX = valueCenter[0] + valueCenterDeltaX
                const valueCenterY = valueCenter[1] + valueCenterDeltaY + ((this.orient == "s" || this.orient == "w") ? 0 : (8 * cellHeight - numCellsToDraw * cellHeight))

                const contentLeft = valueCenterX - numDataBits / 2 * cellWidth
                const contentTop = valueCenterY
                const contentBottom = contentTop + numCellsToDraw * cellHeight
                const contentRight = contentLeft + numDataBits * cellWidth

                // by default, paint everything as zero
                g.fillStyle = COLOR_EMPTY
                g.fillRect(contentLeft, contentTop, contentRight - contentLeft, contentBottom - contentTop)

                for (let i = 0; i < numCellsToDraw; i++) {
                    for (let j = 0; j < numDataBits; j++) {
                        const v = this._CallStack_InternalRAM.value.mem[i][numDataBits - j - 1]
                        if (v !== false) {
                            g.fillStyle = colorForLogicValue(v)
                            g.fillRect(contentLeft + j * cellWidth, contentTop + i * cellHeight, cellWidth, cellHeight)
                        }
                    }
                }

                g.strokeStyle = COLOR_COMPONENT_BORDER
                g.lineWidth = 0.5
                for (let i = 1; i < numCellsToDraw; i++) {
                    const y = contentTop + i * cellHeight
                    strokeSingleLine(g, contentLeft, y, contentRight, y)
                }
                for (let j = 1; j < numDataBits; j++) {
                    const x = contentLeft + j * cellWidth
                    strokeSingleLine(g, x, contentTop, x, contentBottom)
                }
                const borderLineWidth = 2
                g.lineWidth = borderLineWidth
                g.strokeRect(contentLeft - borderLineWidth / 2, contentTop - borderLineWidth / 2, contentRight - contentLeft + borderLineWidth, contentBottom - contentTop + borderLineWidth)

                if (!isUnknown(this._CallStack_InternalRAM.currentAddress())) {
                    const currentInternalStackAddress = this._CallStack_InternalRAM.currentAddress() as number
                    if (currentInternalStackAddress >= 0 && currentInternalStackAddress < 4) {
                        const arrowY = contentTop + currentInternalStackAddress * cellHeight + cellHeight / 2
                        const arrowRight = contentLeft - 3
                        const arrowWidth = 8
                        const arrowHalfHeight = 3
                        g.beginPath()
                        g.moveTo(arrowRight, arrowY)
                        g.lineTo(arrowRight - arrowWidth, arrowY + arrowHalfHeight)
                        g.lineTo(arrowRight - arrowWidth + 2, arrowY)
                        g.lineTo(arrowRight - arrowWidth, arrowY - arrowHalfHeight)
                        g.closePath()
                        g.fillStyle = COLOR_COMPONENT_BORDER
                        g.fill()
                    }
                }
/*
                g.fillStyle = COLOR_COMPONENT_INNER_LABELS
                g.font = "11px sans-serif"
                drawLabel(ctx, this.orient, "Stack", "n", valueCenter[0], valueCenter[1], undefined)
 */
            }

            this.doDrawGenericCaption(g, ctx)
        })

        if (this._addProgramRAM) {

        } else {

        }
    }
    /*
    protected override doDrawGenericCaption(g: GraphicsRendering, ctx: DrawContextExt) {
        if (this.numInstructionAddressBits != this.numDataBits) {
            this.doSetDirectAddressingMode(false)
        } else {
            //if (this._directAddressingMode) {
            if (this._addressingMode) {
                    const fontSize = 11
                    g.font = `bold ${fontSize}px sans-serif`
                    g.fillStyle = COLOR_DARK_RED
                    g.textAlign = "center"
                    g.textBaseline = "middle"
                    const valueCenter = ctx.rotatePoint(this.outputs.InstructionAddress.group.posXInParentTransform + (Orientation.isVertical(this.orient)? 15 : 0), this.outputs.InstructionAddress.group.posYInParentTransform + (Orientation.isVertical(this.orient)? 63 : 35))
                    g.fillText("Adressage direct", ...valueCenter)
            }
        }
     */
    protected override doDrawGenericCaption(g: GraphicsRendering, ctx: DrawContextExt) {
        if (this._addressingMode) {
                const fontSize = 11
                g.font = `bold ${fontSize}px sans-serif`
                g.fillStyle = COLOR_DARK_RED
                g.textAlign = "center"
                g.textBaseline = "middle"
                const valueCenter = ctx.rotatePoint(this.outputs.InstructionAddress.group.posXInParentTransform + (Orientation.isVertical(this.orient)? 15 : 0), this.outputs.InstructionAddress.group.posYInParentTransform + (Orientation.isVertical(this.orient)? 63 : 35))
                g.fillText("Adressage direct", ...valueCenter)
        }
    }

    public get opCode(): CPUOpCode | Unknown {
        //const opValues = this.inputValues(this.inputs.Instr.reverse()).slice(0,4)
        const opCodeValues = this._fetchDecodeStage_Instruction_InternalRegister.inputsD.slice(0,4)
        //opValues.push(this.inputs.Mode.value)
        const opCodeIndex = displayValuesFromArray(opCodeValues, true)[1]
        // TO DO
        //return isUnknown(opCodeIndex) ? Unknown : (this.usesExtendedOpCode ? CPUOpCodes : CPUOpCodes)[opCodeIndex]
        return isUnknown(opCodeIndex) ? Unknown : CPUOpCodes[opCodeIndex]
    }

    public get operands(): LogicValue[] {
        return this._fetchDecodeStage_Instruction_InternalRegister.inputsD.slice(4,8)
    }

    public get cycle(): number {
        const cycleValue = displayValuesFromArray(this._Operations_InternalCounter.outputsQ, false)[1]
        return isUnknown(cycleValue) ? 0 : cycleValue
    }

    public get stage(): CPUStage {
        let cycleValue = this.cycle
        return CPUStages[(cycleValue-1) % CPUStages.length]
    }
    /*
    protected override makeCPUSpecificContextMenuItems(): MenuItems {
        const s = S.Components.CPU.contextMenu
        const iconDirectAddressingMode = this._directAddressingMode? "check" : "none"
        const toggleDirectAddressingMode: MenuItems = this.numInstructionAddressBits != this.numDataBits ? [] : [
            ["mid", MenuData.item(iconDirectAddressingMode, s.toggleDirectAddressingMode,
                () => {this.doSetDirectAddressingMode(!this._directAddressingMode)}
            )],
        ]

        return [
            ...toggleDirectAddressingMode,
        ]
    }
    */
}


function logicalOROnEveryBits(logicArray: LogicValue[]): LogicValue {
    let initialValue: boolean | "Z" | "?" = false
    for (let i = 0; i < logicArray.length; i++) {
        initialValue = initialValue || logicArray[i]
    }
    return initialValue
}

function logicalANDOnEveryBits(logicArray: LogicValue[]): LogicValue {
    let initialValue: boolean | "Z" | "?" = true
    for (let i = 0; i < logicArray.length; i++) {
        initialValue = initialValue && logicArray[i]
    }
    return initialValue
}

CPUDef.impl = CPU
