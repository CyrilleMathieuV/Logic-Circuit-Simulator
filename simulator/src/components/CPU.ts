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
    MenuData,
    MenuItems,
    Orientation,
} from "./Drawable"
import {
    Flipflop,
    FlipflopOrLatch, SyncComponent,
} from "./FlipflopOrLatch";
import { ALUOps, doALUOp } from "./ALU"
import { VirtualFlipflopD } from "./VirtualFlipflopD";
import { VirtualRegister } from "./VirtualRegister";
import { VirtualCounter } from "./VirtualCounter";
import {VirtualComponent} from "./VirtualComponent";


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

export const CPUBaseDef =
    defineAbstractParametrizedComponent( {
        button: { imgWidth: 40 },
        repr: {
            addressInstructionBits: typeOrUndefined(t.number),
            dataBits: typeOrUndefined(t.number),
            addressDataBits: typeOrUndefined(t.number),
            showStage: typeOrUndefined(t.boolean),
            showOpCode: typeOrUndefined(t.boolean),
            showOperands: typeOrUndefined(t.boolean),
            enablePipeline: typeOrUndefined(t.boolean),
            showClockCycle : typeOrUndefined(t.boolean),
            trigger: typeOrUndefined(t.keyof(EdgeTrigger)),
            //extOpCode: typeOrUndefined(t.boolean),
        },
        valueDefaults: {
            showStage: true,
            showOpCode: true,
            showOperands: true,
            enablePipeline: true,
            showClockCycle: true,
            trigger: EdgeTrigger.falling,
        },
        params: {
            addressInstructionBits: param(4, [4, 8]),
            dataBits: param(4, [4]),
            addressDataBits: param(4, [4]),
            // future use
            // extOpCode: paramBool(), // has the extended opcode
        },
        validateParams: ({ addressInstructionBits, dataBits, addressDataBits}) => ({
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
        makeNodes: ({ numAddressInstructionBits, numDataBits, numAddressDataBits, /*usesExtendedOpCode*/ gridWidth, gridHeight }) => {
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
                    RAMweSync: [inputX, 1, "e", "RAM WE sync"],
                    RAMwe: [inputX, 3, "e", "RAM WE"],
                    ResetSync: [inputX, 5, "e", "Reset sync"],
                    Sync: [inputX, 7, "e", "Sync"],
                    Z: [inputX, 9, "e", "Z (Zero)"],
                    V: [inputX, 11, "e", "V (oVerflow)"],
                    Cout: [inputX, 13, "e", `Cout`],
                    RunningState: [inputX, 15, "e", "Run state"],
                },
            }
        },
        //initialValue: (saved, defaults): [LogicValue, LogicValue] => {
        initialValue: (saved, defaults) => {
            const false_ = false as LogicValue
            const undefinedState = {
                isaadr: ArrayFillWith<LogicValue>(false_, defaults.numAddressInstructionBits),
                dadr: ArrayFillWith<LogicValue>(false_, defaults.numDataBits),
                dout: ArrayFillWith<LogicValue>(false_, defaults.numDataBits),
                ramwesync: false_,
                ramwe: false_,
                resetsync: false_,
                sync: false_,
                z: false_,
                v: false_,
                cout: false_,
                runningstate: false_,
            }
            let initialState
            if (saved === undefined) {
                initialState = undefinedState
            } else {
                initialState = {
                    isaadr: ArrayFillWith<LogicValue>(false_, defaults.numAddressInstructionBits),
                    dadr: ArrayFillWith<LogicValue>(false_, defaults.numDataBits),
                    dout: ArrayFillWith<LogicValue>(false_, defaults.numDataBits),
                    ramwesync: false_,
                    ramwe: false_,
                    resetsync: false_,
                    sync: false_,
                    z: false_,
                    v: false_,
                    cout: false_,
                    runningstate: false_,
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
    public readonly numAddressInstructionBits: number

    public readonly numDataBits: number
    public readonly numAddressDataBits: number

    protected _trigger: EdgeTrigger
    protected _isInInvalidState = false
    protected _lastClock: LogicValue = Unknown
    //public readonly usesExtendedOpCode: boolean

    protected _showStage: boolean

    protected _showOpCode: boolean
    protected _showOperands: boolean

    protected _enablePipeline: boolean

    protected _showClockCycle: boolean

    public _opCodeOperandsInStages : any

    protected constructor(parent: DrawableParent, SubclassDef: typeof CPUDef, params: CPUBaseParams, saved?: TRepr) {
        super(parent, SubclassDef.with(params as any) as any /* TODO */, saved)

        this.numAddressInstructionBits = params.numAddressInstructionBits

        this.numDataBits = params.numDataBits
        this.numAddressDataBits = params.numAddressDataBits

        this._opCodeOperandsInStages = { FETCH : "", DECODE : "", EXECUTE : ""}

        this._showStage = saved?.showStage ?? CPUDef.aults.showStage

        this._showOpCode = saved?.showOpCode ?? CPUDef.aults.showOpCode
        this._showOperands = saved?.showOperands ?? CPUDef.aults.showOperands

        this._enablePipeline = saved?.enablePipeline ?? CPUDef.aults.enablePipeline

        this._showClockCycle = saved?.showClockCycle ?? CPUDef.aults.showClockCycle

        this._trigger = saved?.trigger ?? CPUDef.aults.trigger
    }
    /*
        public doRecalcValue(): CPUBaseValue {
            const prevClock = this._lastClock
            const clockSpeed =  this.inputs.Speed.value? this.inputs.ClockF.value : this.inputs.ClockS.value
            //const clock = this._lastClock = this._virtualRunStopFlipflopD.outputQ̅  ? this.inputs.ManStep.value && this._virtualHaltSignalFlipflopD.outputQ̅  : clockSpeed
            const clock = this._lastClock = this._lastClock
            const { isInInvalidState, newState } =
                Flipflop.doRecalcValueForSyncComponent(this, prevClock, clock, Unknown, this.inputs.Reset)
            this._isInInvalidState = isInInvalidState
            return newState as CPUBaseValue
        }

     */

    //protected abstract override doRecalcValue(): CPUBaseValue

    public makeInvalidState(): CPUBaseValue {
        const false_ = false as LogicValue
        let newState : any
        newState = {
            isaadr: ArrayFillWith<LogicValue>(false_, this.numAddressInstructionBits),
            dadr: ArrayFillWith<LogicValue>(false_, this.numDataBits),
            dout: ArrayFillWith<LogicValue>(false_, this.numDataBits),
            ramwesync: false_,
            ramwe: false_,
            resetsync: false_,
            sync: false_,
            z: false_,
            v: false_,
            cout: false_,
            runningstate: false_
        }
        return newState as CPUBaseValue
    }

    public makeStateFromMainValue(val: LogicValue): CPUBaseValue {
        let newState : any
        newState = {
            isaadr: ArrayFillWith<LogicValue>(val, this.numAddressInstructionBits),
            dadr: ArrayFillWith<LogicValue>(val, this.numDataBits),
            dout: ArrayFillWith<LogicValue>(val, this.numDataBits),
            ramwesync: val,
            ramwe: val,
            resetsync: val,
            sync: val,
            z: val,
            v: val,
            cout: val,
            runningstate: val
        }
        return newState as CPUBaseValue
    }

    //public abstract makeStateAfterClock(): [LogicValue[], LogicValue[], LogicValue[], LogicValue,LogicValue,LogicValue,LogicValue,LogicValue,LogicValue,LogicValue,LogicValue]

    public get trigger() {
        return this._trigger
    }

    protected doSetTrigger(trigger: EdgeTrigger) {
        this._trigger = trigger
        this.setNeedsRedraw("trigger changed")
    }

    public override toJSONBase() {
        return {
            addressInstructionBits: this.numAddressInstructionBits === CPUDef.aults.addressInstructionBits ? undefined : this.numAddressInstructionBits,
            dataBits: this.numDataBits === CPUDef.aults.dataBits ? undefined : this.numDataBits,
            addressDataBits: this.numAddressDataBits === CPUDef.aults.addressDataBits ? undefined : this.numAddressDataBits,
            ...super.toJSONBase(),
            //extOpCode: this.usesExtendedOpCode === CPUDef.aults.extOpCode ? undefined : this.usesExtendedOpCode,
            showStage: (this._showStage !== CPUDef.aults.showStage) ? this._showStage : undefined,
            showOpCode: (this._showOpCode !== CPUDef.aults.showOpCode) ? this._showOpCode : undefined,
            showOperands: (this._showOperands !== CPUDef.aults.showOperands) ? this._showOperands : undefined,
            enablePipeline: (this._enablePipeline !== CPUDef.aults.enablePipeline) ? this._enablePipeline : undefined,
            showClockCycle: (this._showClockCycle !== CPUDef.aults.showClockCycle) ? this._showClockCycle : undefined,
            trigger: (this._trigger !== CPUDef.aults.trigger) ? this._trigger : undefined,
        }
    }

    protected override propagateValue(newValue: CPUBaseValue) {    }

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

        return [
            ["mid", toggleShowStageItem],
            ...toggleShowOpCodeItem,
            ...toggleShowOperandsItem,
            ["mid", MenuData.sep()],
            ["mid", toggleEnablePipelineItem],
            ["mid", MenuData.sep()],
            ["mid", toggleShowClockCycleItem],
            ["mid", MenuData.sep()],
            this.makeChangeParamsContextMenuItem("inputs", S.Components.Generic.contextMenu.ParamNumAddressBits, this.numAddressInstructionBits, "addressInstructionBits"),
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

    private innerStateRepr<TrimEnd extends boolean>(innerComponent : VirtualComponent, trimEnd : TrimEnd): TrimEnd extends false ? string : string | undefined {
        const result: string[] = []
        if (trimEnd) {
            let numToSkip = 0
        }
        return result as any
    }

}

export const CPUDef =
    defineParametrizedComponent("CPU", true, true, {
        variantName: ({ addressInstructionBits }) => `CPU-${addressInstructionBits}`,
        idPrefix: "CPU",
        ...CPUBaseDef,
        repr: {
            ...CPUBaseDef.repr,
            instructionBits: typeOrUndefined(t.number),
            directAddressingMode: typeOrUndefined(t.boolean),
            //trigger: typeOrUndefined(t.keyof(EdgeTrigger)),
        },
        valueDefaults: {
            ...CPUBaseDef.valueDefaults,
            directAddressingMode: false,
            trigger: EdgeTrigger.falling,
        },
        params: {
            addressInstructionBits: CPUBaseDef.params.addressInstructionBits,
            dataBits: CPUBaseDef.params.dataBits,
            addressDataBits: CPUBaseDef.params.addressDataBits,
            instructionBits: param(8, [8]),
            //extOpCode: CPUBaseDef.params.extOpCode,
        },
        validateParams: ({ addressInstructionBits, dataBits, addressDataBits, instructionBits}) => ({
            numAddressInstructionBits: addressInstructionBits,
            numDataBits: dataBits,
            numAddressDataBits: addressDataBits,
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
                    Isa: groupVertical("w", -inputX, 0, params.numInstructionBits),
                    Din: groupHorizontal("s", midX, inputY, params.numDataBits),
                },
                outs: base.outs,
            }
        }
    })

type CPUValue = Value<typeof CPUDef>

export type CPURepr = Repr<typeof CPUDef>
export type CPUParams = ResolvedParams<typeof CPUDef>

export class CPU extends CPUBase<CPURepr> {
    public readonly numInstructionBits: number
    private _directAddressingMode = CPUDef.aults.directAddressingMode
    //private _trigger: EdgeTrigger = CPUDef.aults.trigger

    protected _virtualRunStopFlipflopD : VirtualFlipflopD

    protected _virtualInstructionRegister : VirtualRegister

    protected _virtualAccumulatorRegister : VirtualRegister
    protected _virtualFlagsRegister: VirtualRegister

    protected _virtualBufferDataAddressRegister: VirtualRegister
    protected _virtualBufferRAMWEFlipflopD: VirtualFlipflopD

    protected _virtualProgramCounterRegister : VirtualRegister
    protected _virtualPreviousProgramCounterRegister : VirtualRegister

    //protected _virtualSpecialVoidProgramCounterFlipflopD : VirtualFlipflopD

    protected _virtualFetchFlipflopD : VirtualFlipflopD
    protected _virtualDecodeFlipflopD : VirtualFlipflopD
    protected _virtualExecuteFlipflopD : VirtualFlipflopD

    protected _virtualHaltSignalFlipflopD : VirtualFlipflopD

    protected _virtualOperationStageCounter : VirtualCounter

    private _noJump : LogicValue = true
    private _backwardJump : LogicValue = Unknown
    private _operandsValue : LogicValue[] = ArrayFillWith(false, this.numDataBits)

    public constructor(parent: DrawableParent, params: CPUParams, saved?: CPURepr) {
        super(parent, CPUDef, params, saved)

        this.numInstructionBits = params.numInstructionBits
        this._directAddressingMode = saved?.directAddressingMode ?? CPUDef.aults.directAddressingMode
        this._trigger = saved?.trigger ?? CPUDef.aults.trigger

        this._virtualRunStopFlipflopD = new VirtualFlipflopD(EdgeTrigger.falling)
        // this._virtualRunStopFlipflopD.inputClr = true
        // this._virtualRunStopFlipflopD.recalcVirtualValue()

        this._virtualHaltSignalFlipflopD = new VirtualFlipflopD(EdgeTrigger.falling)
        // this._virtualHaltSignalFlipflopD.inputClr = true
        // this._virtualHaltSignalFlipflopD.recalcVirtualValue()

        this._virtualInstructionRegister = new VirtualRegister(this.numInstructionBits, EdgeTrigger.falling)
        // const isaInit = this.inputValues(this.inputs.Isa)
        // Needs to revert all inputs to be compatible with choosen ISA
        // const isaInit_FETCH = isaInit.reverse()
        // this._virtualInstructionRegister.inputsD = isaInit_FETCH

        // const isaInit_FETCH_opCodeValue = isaInit_FETCH.slice(0, 4).reverse()
        // const isaInit_FETCH_opCodeIndex = displayValuesFromArray(isaInit_FETCH_opCodeValue, false)[1]
        // const isaInit_FETCH_opCodeName = isUnknown(isaInit_FETCH_opCodeIndex) ? Unknown : CPUOpCodes[isaInit_FETCH_opCodeIndex]

        // const isaInit_FETCH_operands = isaInit_FETCH.slice(4, 8).reverse()
        // this._opCodeOperandsInStages = {FETCH: isaInit_FETCH_opCodeName + "+" + this.getOperandsNumberWithRadix(isaInit_FETCH_operands, 2), DECODE: "", EXECUTE: ""}
        // this._virtualInstructionRegister.inputClr = true
        // this._virtualInstructionRegister.recalcVirtualValue()

        this._virtualAccumulatorRegister = new VirtualRegister(this.numDataBits, EdgeTrigger.falling)
        // this._virtualAccumulatorRegister.inputClr = true
        // this._virtualInstructionRegister.recalcVirtualValue()
        this._virtualFlagsRegister = new VirtualRegister(4, EdgeTrigger.falling)
        // this._virtualFlagsRegister.inputClr = true
        // this._virtualFlagsRegister.recalcVirtualValue()

        this._virtualBufferDataAddressRegister = new VirtualRegister(this.numDataBits, EdgeTrigger.falling)
        this._virtualBufferRAMWEFlipflopD = new VirtualFlipflopD(EdgeTrigger.falling)

        this. _virtualProgramCounterRegister = new VirtualRegister(this.numAddressInstructionBits, EdgeTrigger.falling)
        // this. _virtualProgramCounterRegister.inputClr = true
        // this. _virtualProgramCounterRegister.recalcVirtualValue()
        this. _virtualPreviousProgramCounterRegister = new VirtualRegister(this.numAddressInstructionBits, EdgeTrigger.falling)
        // this. _virtualPreviousProgramCounterRegister.inputClr = true
        // this. _virtualPreviousProgramCounterRegister.recalcVirtualValue()


        //this._virtualSpecialVoidProgramCounterFlipflopD = new VirtualFlipflopD(EdgeTrigger.falling)

        this._virtualFetchFlipflopD = new VirtualFlipflopD(EdgeTrigger.falling)
        this._virtualDecodeFlipflopD = new VirtualFlipflopD(EdgeTrigger.falling)
        this._virtualExecuteFlipflopD = new VirtualFlipflopD(EdgeTrigger.falling)

        this._virtualFetchFlipflopD.inputPre = true
        this._virtualFetchFlipflopD.recalcVirtualValue()
        this._virtualDecodeFlipflopD.inputClr = true
        this._virtualDecodeFlipflopD.recalcVirtualValue()
        this._virtualExecuteFlipflopD.inputClr = true
        this._virtualExecuteFlipflopD.recalcVirtualValue()

        this._virtualOperationStageCounter = new VirtualCounter(16, EdgeTrigger.falling, 10)
        // this._virtualOperationStageCounter.inputClr = true
        // this._virtualOperationStageCounter.recalcVirtualValue()

        this._lastClock = Unknown
    }

    public toJSON() {
        return {
            instructionBits: this.numInstructionBits === CPUDef.aults.instructionBits ? undefined : this.numInstructionBits,
            ...this.toJSONBase(),
            directAddressingMode: (this._directAddressingMode !== CPUDef.aults.directAddressingMode) ? this._directAddressingMode : undefined,
            trigger: (this._trigger !== CPUDef.aults.trigger) ? this._trigger : undefined,
        }
    }

    protected get moduleName() {
        return "CPU"
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
                    isaadr: ArrayFillWith<LogicValue>(false_, this.numAddressInstructionBits),
                    dadr: ArrayFillWith<LogicValue>(false_, this.numDataBits),
                    dout: ArrayFillWith<LogicValue>(false_, this.numDataBits),
                    //isa: ArrayFillWith<LogicValue>(false_, defaults.numInstructionBits),
                    //din: ArrayFillWith<LogicValue>(false_, defaults.numDataBits),
                    ramwesync: false_,
                    ramwe: false_,
                    resetsync: false_,
                    sync: false_,
                    z: false_,
                    v: false_,
                    cout: false_,
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
        const prevClock = this._lastClock
        const clockSpeed = this.inputs.Speed.value ? this.inputs.ClockF.value : this.inputs.ClockS.value
        const clockSync = this._lastClock = (this._virtualRunStopFlipflopD.outputQ̅? this.inputs.ManStep.value : clockSpeed) && this._virtualHaltSignalFlipflopD.outputQ̅
        const newState = this.doRecalcValueForSyncComponent(this._trigger, prevClock, clockSync, this.value)
        return newState
    }

    public doRecalcValueForSyncComponent(trigger: EdgeTrigger, prevClock: LogicValue, clockSync: LogicValue, value: CPUBaseValue): CPUBaseValue {
        /*
        BE CAREFUL WITH .reverse()
        IT AFFECTS THE OBJECT !!!
         */
        // RUN CONTROL LOGIC
        //const prevClock = this._lastClock
        //const clockSpeed = this.inputs.Speed.value ? this.inputs.ClockF.value : this.inputs.ClockS.value
        //const clockSync = this._lastClock = (this._virtualRunStopFlipflopD.outputQ̅? this.inputs.ManStep.value : clockSpeed) && this._virtualHaltSignalFlipflopD.outputQ̅
        //const clockSync = (this._virtualRunStopFlipflopD.outputQ̅? this.inputs.ManStep.value : clockSpeed) && this._virtualHaltSignalFlipflopD.outputQ̅
        const clrSignal = this.inputs.Reset.value && this._virtualRunStopFlipflopD.outputQ̅

        const runningState = this._virtualRunStopFlipflopD.outputQ̅ ? this.inputs.ManStep.value && !this._virtualRunStopFlipflopD.outputQ̅: this._virtualRunStopFlipflopD.outputQ
        //console.log((this._virtualRunStopFlipflopD.outputQ̅ ? this.inputs.ManStep.value : clockSpeed) && this._virtualHaltSignalFlipflopD.outputQ̅)
        this._virtualRunStopFlipflopD.inputD = this._virtualRunStopFlipflopD.outputQ̅
        //console.log(this._virtualHaltSignalFlipflopD.outputQ && clockSync)
        this._virtualRunStopFlipflopD.inputClock = (this._virtualHaltSignalFlipflopD.outputQ && clockSync) || this.inputs.RunStop.value
/*
        if (VirtualFlipflop.isVirtualClockTrigger(this._virtualRunStopFlipflopD.trigger, prevClock, clockSync)) {
            if (prevClock) {
                if (!clockSync) {
                    console.log("Falling")
                    console.log("! ", this._virtualRunStopFlipflopD.value)
                }
            }
            if (clockSync) {
                if (prevClock) {
                    console.log("Rising")
                    console.log("* ", this._virtualRunStopFlipflopD.value)
                }
            }
            const newValue : LogicValue = LogicValue.filterHighZ(this._virtualRunStopFlipflopD.inputD)
            this._virtualRunStopFlipflopD.propagateVirtualValue([newValue, !newValue])
        }
*/

        this._virtualRunStopFlipflopD.inputClr = clrSignal
        this._virtualHaltSignalFlipflopD.inputClr = clrSignal

        this._virtualProgramCounterRegister.inputClr = clrSignal
        if (this._enablePipeline) {
            this._virtualPreviousProgramCounterRegister.inputClr = clrSignal
        } else {
            this._virtualFetchFlipflopD.inputPre = clrSignal
            this._virtualDecodeFlipflopD.inputClr = clrSignal
            this._virtualExecuteFlipflopD.inputClr = clrSignal
        }

        this._virtualInstructionRegister.inputClr = clrSignal
        this._virtualAccumulatorRegister.inputClr = clrSignal
        this._virtualFlagsRegister.inputClr = clrSignal

        this._virtualOperationStageCounter.inputClr = clrSignal

        this._virtualRunStopFlipflopD.recalcVirtualValue()

        // FETCH Stage
        const isa = this.inputValues(this.inputs.Isa)
        //const isa = this.inputValues(this.inputs.Isa).map(LogicValue.filterHighZ)
        //console.log(this._virtualFetchFlipflopD.outputQ)
        // Needs to revert all inputs to be compatible with choosen ISA
        const isa_FETCH = isa.reverse()
        // console.log(isa_FETCH)
        // naive approach !
        // this._virtualInstructionRegister.inputsD = isa_FETCH
        VirtualRegister.setInputValues(this._virtualInstructionRegister.inputsD, isa_FETCH)
        // console.log("*",this._virtualInstructionRegister.inputsD)

        const isa_FETCH_opCodeValue = isa_FETCH.slice(0, 4).reverse()
        const isa_FETCH_opCodeIndex = displayValuesFromArray(isa_FETCH_opCodeValue, false)[1]
        const isa_FETCH_opCodeName = isUnknown(isa_FETCH_opCodeIndex) ? Unknown : CPUOpCodes[isa_FETCH_opCodeIndex]

        const isa_FETCH_operands = isa_FETCH.slice(4, 8).reverse()

        if (CPU.isClockTrigger(this._trigger, prevClock, clockSync)) {
            this._opCodeOperandsInStages = this.shiftOpCodeOperandsInStages(this._opCodeOperandsInStages, this.stage, isa_FETCH_opCodeName, isa_FETCH_operands, this._enablePipeline)
        } else {
            if (clrSignal || this.cycle == 0) {
                //this._lastClock = Unknown
                this._opCodeOperandsInStages = {FETCH: isa_FETCH_opCodeName + "+" + this.getOperandsNumberWithRadix(isa_FETCH_operands, 2), DECODE: "", EXECUTE: ""}
            }
        }

        if (!this._enablePipeline) {
            this._virtualInstructionRegister.inputClock= clockSync && this._virtualFetchFlipflopD.outputQ
            this._virtualInstructionRegister.recalcVirtualValue()
        }

        // DECCODE Stage
        const opCodeValue = this._virtualInstructionRegister.outputsQ.slice(0, 4).reverse()
        const opCodeIndex = displayValuesFromArray(opCodeValue, false)[1]
        const opCodeName = isUnknown(opCodeIndex) ? Unknown : CPUOpCodes[opCodeIndex]

        const _ALUopValue = [opCodeValue[0], !opCodeValue[3], opCodeValue[1], opCodeValue[2]]
        const _ALUopIndex = displayValuesFromArray(_ALUopValue, false)[1]
        const _ALUop = isUnknown(_ALUopIndex) ? "A+B" : ALUOps[_ALUopIndex]

        const ramwevalue = opCodeValue[3] && !opCodeValue[2] && opCodeValue[1] && opCodeValue[0]

        this._virtualBufferRAMWEFlipflopD.inputD = ramwevalue

        const _operandsDataCommonSelect = !opCodeValue[3] && !opCodeValue[2]
        const _operandsDataSelectValue = [(_operandsDataCommonSelect && opCodeValue[0]) || (opCodeValue[3] && !opCodeValue[1]) || (opCodeValue[3] && opCodeValue[2]), _operandsDataCommonSelect && opCodeValue[1]]
        let _operandsDataSelectValueIndex = displayValuesFromArray(_operandsDataSelectValue, false)[1]

        _operandsDataSelectValueIndex = isUnknown(_operandsDataSelectValueIndex) ? 0 : _operandsDataSelectValueIndex

        this._operandsValue = this._virtualInstructionRegister.outputsQ.slice(4, 8).reverse()

        const _ALUoutputs = doALUOp(_ALUop, this._virtualAccumulatorRegister.outputsQ, this.inputValues(this.inputs.Din).reverse(), false)

        let _operandsData : LogicValue[]
        if (_operandsDataSelectValueIndex === 0) {
            _operandsData = this._virtualAccumulatorRegister.outputsQ
        } else if (_operandsDataSelectValueIndex === 1) {
            //console.log(this._virtualAccumulatorRegister.outputsQ, " ", _ALUop, " ", this.inputValues(this.inputs.Din).reverse())
            _operandsData = _ALUoutputs.s
        } else if (_operandsDataSelectValueIndex === 2) {
            _operandsData = this.inputValues(this.inputs.Din).reverse()
            //console.log(_operandsData)
        } else if (_operandsDataSelectValueIndex === 3) {
            _operandsData = this._operandsValue
        } else {
            _operandsData = this._virtualAccumulatorRegister.inputsD
        }

        this._virtualAccumulatorRegister.inputsD = _operandsData

        if (this._enablePipeline) {
            this._virtualBufferDataAddressRegister.inputsD = this._operandsValue
        }

        this._virtualFlagsRegister.inputsD[1] = _ALUoutputs.cout
        this._virtualFlagsRegister.inputsD[0] = this.allZeros(_operandsData)

        const c = this._virtualFlagsRegister.outputsQ[1]
        const z = this._virtualFlagsRegister.outputsQ[0]

        const jumpControl = opCodeValue[2] && !opCodeValue[3]
        this._noJump = !(((((opCodeValue[0] && c) || (!opCodeValue[0] && z)) && opCodeValue[1]) || !opCodeValue[1]) && jumpControl)
        this._backwardJump = (opCodeValue[0] && !opCodeValue[1]) && jumpControl

        this._virtualHaltSignalFlipflopD.inputD = opCodeValue[3] && !opCodeValue[2] && opCodeValue[1] && !opCodeValue[0]

        if (this._enablePipeline) {
            this._virtualAccumulatorRegister.inputClock = clockSync
            this._virtualAccumulatorRegister.recalcVirtualValue()
            this._virtualFlagsRegister.inputClock = clockSync
            this._virtualFlagsRegister.recalcVirtualValue()
            this._virtualHaltSignalFlipflopD.inputClock = clockSync
            this._virtualHaltSignalFlipflopD.recalcVirtualValue()
            //this._virtualBufferDataAddressRegister.inputClock = clockSync
            //this._virtualBufferDataAddressRegister.recalcVirtualValue()
            //this._virtualBufferRAMWEFlipflopD.inputClock = clockSync
            //this._virtualBufferRAMWEFlipflopD.recalcVirtualValue()
        } else {
            this._virtualAccumulatorRegister.inputClock = clockSync && this._virtualDecodeFlipflopD.outputQ
            this._virtualAccumulatorRegister.recalcVirtualValue()
            this._virtualFlagsRegister.inputClock = clockSync && this._virtualDecodeFlipflopD.outputQ
            this._virtualFlagsRegister.recalcVirtualValue()
            this._virtualHaltSignalFlipflopD.inputClock = clockSync && this._virtualDecodeFlipflopD.outputQ
            this._virtualHaltSignalFlipflopD.recalcVirtualValue()
        }
        // EXECUTE STAGE

        // PROGRAM COUNTER LOGIC
        this._virtualProgramCounterRegister.inputInc = this._noJump

        //console.log(noJump)
        const _programCounterALUop = this._backwardJump? "A-B" : "A+B"
        //console.log(this._backwardJump)
        const _programCounterALUinputA = this._enablePipeline ? (!this._noJump ? this._virtualPreviousProgramCounterRegister.outputsQ : this._virtualProgramCounterRegister.outputsQ) : this._virtualProgramCounterRegister.outputsQ
        //console.log(_programCounterALUinputA)
        // A clone of the array "operands" array is needed cause ArrayClamOrPad returns the array
        const _programCounterALUinputB = this._operandsValue.slice()
        ArrayClampOrPad(_programCounterALUinputB, this.numAddressInstructionBits, false)
        if (!this._noJump) {
            if (this._directAddressingMode) {
                this._virtualProgramCounterRegister.inputsD = _programCounterALUinputB
            } else {
                //console.log(_programCounterALUinputB)
                const _programCounterALUoutputs = doALUOp(_programCounterALUop, _programCounterALUinputA, _programCounterALUinputB, false)
                //console.log(_programCounterALUoutputs.s)
                this._virtualProgramCounterRegister.inputsD = _programCounterALUoutputs.s
            }
        }

        if (this._enablePipeline) {
            this._virtualInstructionRegister.inputClock = clockSync
            this._virtualInstructionRegister.recalcVirtualValue()

            this._virtualProgramCounterRegister.inputClock = clockSync
            this._virtualProgramCounterRegister.recalcVirtualValue()
            this._virtualPreviousProgramCounterRegister.inputsD = this._virtualProgramCounterRegister.outputsQ
            this._virtualPreviousProgramCounterRegister.inputClock = clockSync
            this._virtualPreviousProgramCounterRegister.recalcVirtualValue()


        } else {
            const _virtualFetchFlipflopDoutputQ = this._virtualFetchFlipflopD.outputQ
            const _virtualDecodeFlipflopDoutputQ = this._virtualDecodeFlipflopD.outputQ
            const _virtualExecuteFlipflopDoutputQ = this._virtualExecuteFlipflopD.outputQ

            //console.log("*",_virtualFetchFlipflopDoutputQ, _virtualDecodeFlipflopDoutputQ, _virtualExecuteFlipflopDoutputQ)

            this._virtualFetchFlipflopD.inputD = _virtualExecuteFlipflopDoutputQ
            this._virtualFetchFlipflopD.inputClock = clockSync
            this._virtualFetchFlipflopD.recalcVirtualValue()

            this._virtualDecodeFlipflopD.inputD = _virtualFetchFlipflopDoutputQ
            this._virtualDecodeFlipflopD.inputClock = clockSync
            this._virtualDecodeFlipflopD.recalcVirtualValue()

            this._virtualExecuteFlipflopD.inputD = _virtualDecodeFlipflopDoutputQ
            this._virtualExecuteFlipflopD.inputClock = clockSync
            this._virtualExecuteFlipflopD.recalcVirtualValue()

            //console.log(this._virtualFetchFlipflopD.outputQ, this._virtualDecodeFlipflopD.outputQ, this._virtualExecuteFlipflopD.outputQ)

            this._virtualProgramCounterRegister.inputClock  = clockSync && this._virtualExecuteFlipflopD.outputQ
            //console.log(this._virtualProgramCounterRegister.outputsQ)
            this._virtualProgramCounterRegister.recalcVirtualValue()
        }

        const ramwesyncvalue = this._enablePipeline ? clockSync : clockSync && this._virtualDecodeFlipflopD.outputQ

        if (!this._virtualHaltSignalFlipflopD.outputQ) {
            this._virtualOperationStageCounter.inputClock = clockSync
            this._virtualOperationStageCounter.recalcVirtualValue()
        }

        const false_ = false as LogicValue

        let newState : any

        if (isUnknown(opCodeName)) {
            newState = {
                isaadr: ArrayFillWith<LogicValue>(false_, this.numAddressInstructionBits),
                dadr: ArrayFillWith<LogicValue>(false_, this.numDataBits),
                dout: ArrayFillWith<LogicValue>(false_, this.numDataBits),
                ramwesync: false_,
                ramwe: false_,
                resetsync: false_,
                sync: false_,
                z: false_,
                v: false_,
                cout: false_,
                runningstate: false_
            }
        } else {
            newState = {
                isaadr: this._virtualProgramCounterRegister.outputsQ,
                dadr: this._operandsValue,
                dout: this._virtualAccumulatorRegister.outputsQ,
                ramwesync: ramwesyncvalue,
                ramwe: ramwevalue,
                resetsync: clrSignal,
                sync: clockSync,
                z: this._virtualFlagsRegister.outputsQ[0],
                v: false_,
                cout: this._virtualFlagsRegister.outputsQ[1],
                runningstate: runningState,
            }
        }

        return newState as CPUBaseValue
    }

    public override propagateValue(newValue: CPUValue) {
        this.outputValues(this.outputs.Isaadr , newValue.isaadr, true)
        this.outputValues(this.outputs.Dadr , newValue.dadr, true)
        this.outputValues(this.outputs.Dout , newValue.dout)
        this.outputs.RAMweSync.value = newValue.ramwesync
        this.outputs.RAMwe.value = newValue.ramwe
        this.outputs.ResetSync.value = newValue.resetsync
        this.outputs.Sync.value = newValue.sync
        this.outputs.Z.value = newValue.z
        //this.outputs.Z.value = allZeros(newValue.dout)
        this.outputs.V.value = newValue.v
        this.outputs.Cout.value = newValue.cout
        this.outputs.RunningState.value = newValue.runningstate
    }
/*
    public makeStateAfterClock(): CPUBaseValue {
        return []
    }
*/
    public doRecalcValueAfterClock(): [LogicValue[], LogicValue[], LogicValue,LogicValue,LogicValue,LogicValue,LogicValue,LogicValue] {
        return [
            this.inputValues(this.inputs.Isa).map(LogicValue.filterHighZ),
            this.inputValues(this.inputs.Din).map(LogicValue.filterHighZ),
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
        drawWireLineToComponent(g, this.outputs.RAMweSync, right, this.outputs.RAMweSync.posYInParentTransform)
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
            drawLabel(ctx, this.orient, "Din", "s", this.inputs.Din, bottom)
            drawLabel(ctx, this.orient, "Reset", "s", this.inputs.Reset, bottom, undefined, true)
            drawLabel(ctx, this.orient, "Man Step", "s", this.inputs.ManStep, bottom, undefined, true)
            drawLabel(ctx, this.orient, "Speed", "s", this.inputs.Speed, bottom, undefined, true)
            drawLabel(ctx, this.orient, "Clock S", "s", this.inputs.ClockS, bottom, undefined, true)
            drawLabel(ctx, this.orient, "Clock F", "s", this.inputs.ClockF, bottom, undefined, true)
            drawLabel(ctx, this.orient, "Run/Stop", "s", this.inputs.RunStop, bottom, undefined, true)

            // top outputs
            drawLabel(ctx, this.orient, "IsaAdr", "n", this.outputs.Isaadr, top)
            drawLabel(ctx, this.orient, "DAdr", "n", this.outputs.Dadr, top)

            // left inputs
            drawLabel(ctx, this.orient, "Isa", "w", left, this.inputs.Isa)

            // right outputs
            drawLabel(ctx, this.orient, "Dout", "e", right, this.outputs.Dout)
            drawLabel(ctx, this.orient, "RAM Sync", "e", right, this.outputs.RAMweSync, undefined, true)
            drawLabel(ctx, this.orient, "Reset Sync", "e", right, this.outputs.ResetSync, undefined, true)
            drawLabel(ctx, this.orient, "RAM WE", "e", right, this.outputs.RAMwe, undefined, true)
            drawLabel(ctx, this.orient, "Sync", "e", right, this.outputs.Sync, undefined, true)
            drawLabel(ctx, this.orient, "Z", "e", right, this.outputs.Z, undefined, true)
            drawLabel(ctx, this.orient, "V", "e", right, this.outputs.V, undefined, true)
            drawLabel(ctx, this.orient, "Cout", "e", right, this.outputs.Cout, undefined, true)
            drawLabel(ctx, this.orient, "Run state", "e", right, this.outputs.RunningState, undefined, true)

            if (this._showStage) {
                for (let eachStage of CPUStages) {
                    const stageColor = CPUStageColorKey.color(eachStage)
                    const stageColorText = COLOR_CPUSTAGE_TEXT[stageColor]
                    const stageColorBackground = COLOR_CPUSTAGE_BACKGROUND[stageColor]

                    const stageName = CPUStageName.shortName(eachStage)
                    const valueCenterDeltaX = (this.orient == "e") ? 100 : (this.orient == "w") ? -100 : 0
                    const valueCenterDeltaY = (this.orient == "n") ? 100 : (this.orient == "s") ? -100 : 0

                    let valueCenterX = this.posX
                    let valueCenterY = Orientation.isVertical(this.orient) ? this.inputs.Isa.group.posYInParentTransform : this.inputs.Isa.group.posYInParentTransform - 50
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
                        const stage = this.stage
                        if (eachStage == stage) {
                            g.fillText(stageName, ...valueCenter)
                        }
                    }
                    if (this._showOpCode) {
                        const valueCenterInstruction = ctx.rotatePoint(valueCenterX + (Orientation.isVertical(this.orient) ? (this.orient == "n") ? -30 : 30 : 0), valueCenterY + (Orientation.isVertical(this.orient) ? 0 : 30))

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
                            const stage = this.stage
                            if (eachStage == stage) {
                                g.fillText(instructionDisplay, ...valueCenterInstruction)
                            }
                        }
                    }
                }
            }

            if (this._showClockCycle) {
                const counter = displayValuesFromArray(this._virtualOperationStageCounter.outputsQ, false)[1]
                const stringRep = formatWithRadix(counter, 10, 16, false)

                const fontSize = 20
                const valueCenterDeltaY = Orientation.isVertical(this.orient) ? 120 : 90
                const valueCenter = ctx.rotatePoint(this.inputs.Speed.posXInParentTransform + 10, this.inputs.Speed.posYInParentTransform - valueCenterDeltaY)

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
    }

    protected override doDrawGenericCaption(g: GraphicsRendering, ctx: DrawContextExt) {
        if (this._directAddressingMode) {
            const fontSize = 11
            g.font = `bold ${fontSize}px sans-serif`
            g.fillStyle = COLOR_DARK_RED
            g.textAlign = "center"
            g.textBaseline = "middle"
            const valueCenter = ctx.rotatePoint(this.outputs.Isaadr.group.posXInParentTransform + (Orientation.isVertical(this.orient)? 15 : 0), this.outputs.Isaadr.group.posYInParentTransform + (Orientation.isVertical(this.orient)? 63 : 35))
            g.fillText("Adressage direct", ...valueCenter)
        }
    }

    public get opCode(): CPUOpCode | Unknown {
        //const opValues = this.inputValues(this.inputs.Isa.reverse()).slice(0,4)
        const opCodeValues = this._virtualInstructionRegister.inputsD.slice(0,4)
        //opValues.push(this.inputs.Mode.value)
        const opCodeIndex = displayValuesFromArray(opCodeValues, true)[1]
        // TO DO
        //return isUnknown(opCodeIndex) ? Unknown : (this.usesExtendedOpCode ? CPUOpCodes : CPUOpCodes)[opCodeIndex]
        return isUnknown(opCodeIndex) ? Unknown : CPUOpCodes[opCodeIndex]
    }

    public get operands(): LogicValue[] {
        return this._virtualInstructionRegister.inputsD.slice(4,8)
    }

    public get cycle(): number {
        const cycleValue = displayValuesFromArray(this._virtualOperationStageCounter.outputsQ, false)[1]
        return isUnknown(cycleValue) ? 0 : cycleValue
    }

    public get stage(): CPUStage {
        const stageIndex = this.cycle
        return CPUStages[stageIndex % 3]
    }

    public shiftOpCodeOperandsInStages(previousOpCodeOperandsInStages: any, cpuStage: CPUStage, opCode: string, operands: LogicValue[], isPipelineEnabled: boolean) {
        //console.log(previousOpCodeOperandsInStages)
        let opCodeOperandsInStages = { FETCH: "", DECODE : "", EXECUTE : "" }
        //if (isPipelineEnabled) {
            //
            opCodeOperandsInStages["DECODE"] = previousOpCodeOperandsInStages["FETCH"]
            opCodeOperandsInStages["EXECUTE"] = previousOpCodeOperandsInStages["DECODE"]
            opCodeOperandsInStages["FETCH"] = opCode + "+" + this.getOperandsNumberWithRadix(operands, 2)
        //
        //    opCodeOperandsInStages[cpuStage] = opCode + "+" + this.getOperandsNumberWithRadix(operands, 2)
        //}
        return opCodeOperandsInStages
    }

    protected override makeCPUSpecificContextMenuItems(): MenuItems {
        const s = S.Components.CPU.contextMenu
        const iconDirectAddressingMode = this._directAddressingMode? "check" : "none"
        const toggleDirectAddressingMode: MenuItems = this.numAddressInstructionBits != 4 ? [] : [
            ["mid", MenuData.item(iconDirectAddressingMode, s.toggleDirectAddressingMode,
                () => {this.doSetDirectAddressingMode(!this._directAddressingMode)}
            )],
        ]

        return [
            ...toggleDirectAddressingMode,
        ]
    }
}

CPUDef.impl = CPU
