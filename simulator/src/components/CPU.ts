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
    ArrayClampOrPad,
    ArrayFillWith, deepEquals,
    EdgeTrigger, HighImpedance,
    isHighImpedance,
    isUnknown,
    LogicValue, LogicValueRepr, toLogicValue,
    typeOrUndefined,
    Unknown,
} from "../utils"
import {
    ComponentBase,
    defineAbstractComponent,
    defineAbstractParametrizedComponent,
    defineParametrizedComponent,
    groupHorizontal,
    groupVertical, InstantiatedComponentDef, NodeGroup, NodesIn, NodesOut,
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
import {FlipflopD, FlipflopDDef} from "./FlipflopD";
import {Register, RegisterBase, RegisterBaseParams, RegisterDef} from "./Register";
import { Counter } from "./Counter";
import { ALU, ALUDef, ALUOps, doALUOp } from "./ALU"
import { Mux } from "./Mux";
import {
    Flipflop,
    FlipflopBaseRepr,
    FlipflopOrLatch,
    FlipflopOrLatchDef, FlipflopOrLatchRepr,
    FlipflopOrLatchValue,
    SyncComponent,
} from "./FlipflopOrLatch";
import { Input } from "./Input";
import { Wire } from "./Wire";
import { Output } from "./Output";
import {NodeIn, NodeOut} from "./Node";
import {ShiftRegisterDef} from "./ShiftRegister";
import {VirtualFlipflopD} from "./VirtualFlipflopD";
import {VirtualRegister} from "./VirtualRegister";

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
            instructionBits: typeOrUndefined(t.number),
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
            instructionBits: param(8, [8]),
            addressInstructionBits: param(4, [4, 8]),
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

            return {
                ins: {
                    Isa: groupVertical("w", -inputX, 0, numInstructionBits),
                    Din: groupHorizontal("s", midX, inputY, numDataBits),
                    Reset: [-15, inputY, "s", "Reset CPU", { prefersSpike: true }],
                    ManStep: [-13, inputY, "s","Man STEP", { prefersSpike: true }],
                    Speed: [-11, inputY, "s", "Select Clock"],
                    ClockS: [-9, inputY, "s", "Slow Clock", { isClock: true, hasTriangle: true }],
                    ClockF: [-7, inputY, "s", "Fast Clock", { isClock: true, hasTriangle: true }],
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
                    Cout: [inputX, 13, "e", `Cout (${S.Components.CPU.OutputCoutDesc})`],
                    RunningState: [inputX, 15, "e", "Run state"],
                },
            }
        },
        initialValue: (saved, {numAddressInstructionBits, numDataBits}) => {
            const false_ = false as LogicValue
            return {
                isaadr: ArrayFillWith(false_, numAddressInstructionBits),
                dadr: ArrayFillWith(false_, numDataBits),
                dout: ArrayFillWith(false_, numDataBits),
                ramwesync: false_,
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



/*type CPUBaseValue = Value<typeof CPUBaseDef>*/

type CPUBaseValue = {
    isaadr: LogicValue[]
    dadr: LogicValue[]
    dout: LogicValue[]
    ramwesync: LogicValue
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

export abstract class CPUBase<
    TRepr extends CPUBaseRepr
> extends ParametrizedComponentBase<
    TRepr,
    CPUBaseValue
> {
    public readonly numInstructionBits: number
    public readonly numAddressInstructionBits: number

    public readonly numDataBits: number
    public readonly numAddressDataBits: number

    protected _trigger: EdgeTrigger = CPUDef.aults.trigger
    //public readonly usesExtendedOpCode: boolean

    //protected _runStopFlipflopD : FlipflopD
    protected _virtualRunStopFlipflopD : VirtualFlipflopD

    //protected _ALU : ALU

    protected _instructionRegister : Register
    protected _accumulatorRegister : Register
    protected _flagsRegister : Register

    //protected _instructionMux : Mux

    //protected _programCounterALU : ALU

    protected _programCounterRegister : Register
    protected _previousProgramCounterRegister : Register

    protected _specialVoidProgramCounterFlipflopD : FlipflopD

    protected _specialProgramCounterInput : Input
    protected _specialProgramCounterOutput : Output
    protected _specialProgramCounterWire : Wire

    protected _programCounterMux : Mux

    protected _fetchFlipflopD : FlipflopD
    protected _decodeFlipflopD : FlipflopD
    protected _executeFlipflopD : FlipflopD

    //protected _runningStateMux : Mux
    //protected _clockSpeedMux : Mux
    //protected _autoManMux : Mux

    //protected _haltSignalFlipflopD : FlipflopD
    protected _virtualHaltSignalFlipflopD : VirtualFlipflopD

    protected _operationStageCounter : Counter

    protected _showStage: boolean

    protected _showOpCode: boolean
    protected _showOperands: boolean

    protected _enablePipeline: boolean

    protected _showClockCycle: boolean

    public _opCodeOperandsInStages : any

    protected constructor(parent: DrawableParent, SubclassDef: typeof CPUDef, params: CPUBaseParams, saved?: TRepr) {
        super(parent, CPUDef.with(params) as any, saved)

        this.numInstructionBits = params.numInstructionBits
        this.numAddressInstructionBits = params.numAddressInstructionBits

        this.numDataBits = params.numDataBits
        this.numAddressDataBits = params.numAddressDataBits

        this._opCodeOperandsInStages = { FETCH : "", DECODE : "", EXECUTE : ""}

        //this._runStopFlipflopD = new FlipflopD(parent)
        this._virtualRunStopFlipflopD = new VirtualFlipflopD(EdgeTrigger.falling)

        // MUST change trigger of Flipflops
        // this._runStopFlipflopD.doSetTrigger(EdgeTrigger.falling)

        //this._haltSignalFlipflopD = new FlipflopD(parent)
        this._virtualHaltSignalFlipflopD = new VirtualFlipflopD(EdgeTrigger.falling)

        // MUST change trigger of Flipflops
        //this._haltSignalFlipflopD.doSetTrigger(EdgeTrigger.falling)

        //this.usesExtendedOpCode = params.usesExtendedOpCode

        //this._ALU = new ALU(parent,{numBits: this.numDataBits, usesExtendedOpcode: true},undefined)

        this._instructionRegister = new Register(parent,{numBits : this.numInstructionBits, hasIncDec: false}, undefined)
        this._accumulatorRegister = new Register(parent,{numBits : this.numDataBits, hasIncDec: false}, undefined)
        this._flagsRegister = new Register(parent,{numBits : 4, hasIncDec: false}, undefined)

        //this._instructionMux = new Mux (parent, {numFrom: 4 * this.numDataBits, numTo: this.numDataBits, numGroups: 4, numSel: 2}, undefined)

        // MUST change trigger of Registers
        this._instructionRegister.doSetTrigger(EdgeTrigger.falling)
        this._accumulatorRegister.doSetTrigger(EdgeTrigger.falling)
        this._flagsRegister.doSetTrigger(EdgeTrigger.falling)

        this._programCounterRegister = new Register(parent,{numBits : this.numAddressInstructionBits, hasIncDec: true}, undefined)
        this._previousProgramCounterRegister = new Register(parent,{numBits : this.numAddressInstructionBits, hasIncDec: false}, undefined)

        // MUST change trigger of Registers
        this._programCounterRegister.doSetTrigger(EdgeTrigger.falling)
        this._previousProgramCounterRegister.doSetTrigger(EdgeTrigger.falling)

        this._specialProgramCounterInput = new Input(parent, {numBits : 1})
        this._specialProgramCounterOutput = new Output(parent, {numBits : 1})
        this._specialProgramCounterWire = new Wire(this._specialProgramCounterInput.outputs.Out[0], (this._previousProgramCounterRegister.inputs.Inc === undefined)? this._specialProgramCounterOutput.inputs.In[0] : this._previousProgramCounterRegister.inputs.Inc)
        this._specialProgramCounterInput.outputs.Out[0].value = true

        this._specialVoidProgramCounterFlipflopD = new FlipflopD(parent)

        //this._programCounterALU = new ALU(parent,{numBits: this.numAddressInstructionBits, usesExtendedOpcode: false},undefined)

        this._programCounterMux = new Mux (parent, {numFrom: 2 * this.numAddressInstructionBits, numTo: this.numAddressInstructionBits, numGroups: 2, numSel: 1}, undefined)

        this._fetchFlipflopD = new FlipflopD(parent)
        this._decodeFlipflopD = new FlipflopD(parent)
        this._executeFlipflopD = new FlipflopD(parent)

        // MUST change trigger of Flipflops
        this._fetchFlipflopD.doSetTrigger(EdgeTrigger.falling)
        this._decodeFlipflopD.doSetTrigger(EdgeTrigger.falling)
        this._executeFlipflopD.doSetTrigger(EdgeTrigger.falling)

        //this._runningStateMux = new Mux (parent, {numFrom: 2, numTo: 1, numGroups: 2, numSel: 1}, undefined)
        //this._clockSpeedMux = new Mux (parent, {numFrom: 2, numTo: 1, numGroups: 2, numSel: 1}, undefined)
        //this._autoManMux = new Mux (parent, {numFrom: 2, numTo: 1, numGroups: 2, numSel: 1}, undefined)

        this._operationStageCounter = new Counter(parent, {numBits: 16}, undefined)

        this._showStage = saved?.showStage ?? CPUDef.aults.showStage

        this._showOpCode = saved?.showOpCode ?? CPUDef.aults.showOpCode
        this._showOperands = saved?.showOperands ?? CPUDef.aults.showOperands

        this._enablePipeline = saved?.enablePipeline ?? CPUDef.aults.enablePipeline

        this._showClockCycle = saved?.showClockCycle ?? CPUDef.aults.showClockCycle

        this._trigger = saved?.trigger ?? CPUDef.aults.trigger
    }

    public get trigger() {
        return this._trigger
    }

    protected doSetTrigger(trigger: EdgeTrigger) {
        this._trigger = trigger
        this.setNeedsRedraw("trigger changed")
    }

    public override toJSONBase() {
        return {
            ...super.toJSONBase(),
            instructionBits: this.numInstructionBits === CPUDef.aults.instructionBits ? undefined : this.numInstructionBits,
            addressInstructionBits: this.numAddressInstructionBits === CPUDef.aults.addressInstructionBits ? undefined : this.numAddressInstructionBits,
            dataBits: this.numDataBits === CPUDef.aults.dataBits ? undefined : this.numDataBits,
            addressDataBits: this.numAddressDataBits === CPUDef.aults.addressDataBits ? undefined : this.numAddressDataBits,
            //extOpCode: this.usesExtendedOpCode === CPUDef.aults.extOpCode ? undefined : this.usesExtendedOpCode,
            showStage: (this._showStage !== CPUDef.aults.showStage) ? this._showStage : undefined,
            showOpCode: (this._showOpCode !== CPUDef.aults.showOpCode) ? this._showOpCode : undefined,
            showOperands: (this._showOperands !== CPUDef.aults.showOperands) ? this._showOperands : undefined,
            enablePipeline: (this._enablePipeline !== CPUDef.aults.enablePipeline) ? this._enablePipeline : undefined,
            showClockCycle: (this._showClockCycle !== CPUDef.aults.showClockCycle) ? this._showClockCycle : undefined,
            trigger: (this._trigger !== CPUDef.aults.trigger) ? this._trigger : undefined,
        }
    }

    public get opCode(): CPUOpCode | Unknown {
        //const opValues = this.inputValues(this.inputs.Isa.reverse()).slice(0,4)
        const opCodeValues = this.inputValues(this._instructionRegister.inputs.D).slice(0,4)
        //opValues.push(this.inputs.Mode.value)
        const opCodeIndex = displayValuesFromArray(opCodeValues, true)[1]
        // TO DO
        //return isUnknown(opCodeIndex) ? Unknown : (this.usesExtendedOpCode ? CPUOpCodes : CPUOpCodes)[opCodeIndex]
        return isUnknown(opCodeIndex) ? Unknown : CPUOpCodes[opCodeIndex]
    }

    public get operands(): LogicValue[] {
        return this.inputValues(this._instructionRegister.inputs.D).slice(4,8)
    }

    public get cycle(): number {
        const cycleValue = displayValuesFromArray(this.getOutputValues(this._operationStageCounter.outputs.Q), false)[1]
        return isUnknown(cycleValue) ? 0 : cycleValue
    }

    public get stage(): CPUStage {
        const stageIndex = this.cycle
        return CPUStages[stageIndex % 3]
    }

    //public abstract makeStateAfterClock(): LogicValue[]

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

    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {
        const bounds = this.bounds()
        const {left, top, right, bottom} = bounds
        const lowerTop = top - 2 * GRID_STEP
        const lowerBottom = top - 2 * GRID_STEP
        const lowerLeft = left - 2 * GRID_STEP
        const lowerRight = right - 2 * GRID_STEP

        // for debug (works only with "npm run bundle-watch")
        //this._runStopFlipflopD.doDraw(g, ctx)

        this._programCounterRegister.doDraw(g, ctx)
        //this._instructionRegister.doDraw(g, ctx)
        //this._ALU.doDraw(g, ctx)
        //this._instructionMux.doDraw(g, ctx)
        //this._accumulatorRegister.doDraw(g, ctx)

        //this._programCounterALU.doDraw(g, ctx)
        //this._clockSpeedMux.doDraw(g, ctx)
        //this._autoManMux.doDraw(g, ctx)
        //this._fetchFlipflopD.doDraw(g, ctx)
        //this._operationStageCounter.doDraw(g, ctx)

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
            const isVertical = Orientation.isVertical(this.orient)
            const carryHOffsetF = isVertical ? 0 : 1
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
                const counter = displayValuesFromArray(this.getOutputValues(this._operationStageCounter.outputs.Q), false)[1]
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

}

export const CPUDef =
    defineParametrizedComponent("CPU", true, true, {
        variantName: ({ addressInstructionBits }) => `CPU-${addressInstructionBits}`,
        idPrefix: "CPU",
        button: { imgWidth: 40 },
        repr: {
            ...CPUBaseDef.repr,
            directAddressingMode: typeOrUndefined(t.boolean),
            //trigger: typeOrUndefined(t.keyof(EdgeTrigger)),
        },
        valueDefaults: {
            ...CPUBaseDef.valueDefaults,
            directAddressingMode: false,
            //trigger: EdgeTrigger.falling,
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
            const false_ = false as LogicValue
            return {
                isaadr: ArrayFillWith(false_, numAddressInstructionBits),
                dadr: ArrayFillWith(false_, numDataBits),
                dout: ArrayFillWith(false_, numDataBits),
                ramwesync: false_,
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

    private _directAddressingMode = CPUDef.aults.directAddressingMode
    //private _trigger: EdgeTrigger = CPUDef.aults.trigger
    private _noJump : LogicValue = true
    private _backwardJump : LogicValue = Unknown
    private _operandsValue : LogicValue[] = ArrayFillWith(false, this.numDataBits)
    private _lastClock: LogicValue = Unknown

    public constructor(parent: DrawableParent, params: CPUParams, saved?: CPURepr) {
        super(parent, CPUDef.with(params) as any, params, saved)

        this._directAddressingMode = saved?.directAddressingMode ?? CPUDef.aults.directAddressingMode
        //this._trigger = saved?.trigger ?? CPUDef.aults.trigger
    }

    public toJSON() {
        return {
            ...this.toJSONBase(),
            directAddressingMode: (this._directAddressingMode !== CPUDef.aults.directAddressingMode) ? this._directAddressingMode : undefined,
            //trigger: (this._trigger !== CPUDef.aults.trigger) ? this._trigger : undefined,
        }
    }

    protected get moduleName() {
        return "CPU"
    }

    protected doSetDirectAddressingMode(directAddressingMode: boolean) {
        this._directAddressingMode = directAddressingMode
        this.setNeedsRedraw("directAddressingMode changed")
    }
    /*
    public get trigger() {
        return this._trigger
    }

    protected doSetTrigger(trigger: EdgeTrigger) {
        this._trigger = trigger
        this.setNeedsRedraw("trigger changed")
    }
    */
    protected doRecalcValue(): CPUBaseValue {
        /*
        BE CAREFUL WITH .reverse()
        IT AFFECTS THE OBJECT !!!
         */
        // RUN CONTROL LOGIC
        //this._runStopFlipflopD.inputs.Clock.value = (this._haltSignalFlipflopD.outputs.Q.value && this._autoManMux.outputs.Z[0].value) || this.inputs.RunStop.value
        const prevClock = this._lastClock
        const clockSpeed =  this.inputs.Speed.value? this.inputs.ClockF.value : this.inputs.ClockS.value
        //const clockSync = this._lastClock = this._runStopFlipflopD.outputs.Q.value? clockSpeed : this.inputs.ManStep.value && !this._haltSignalFlipflopD.outputs.Q.value
        //const clockSync = this._lastClock = this._virtualRunStopFlipflopD.outputsQ[0]? clockSpeed : this.inputs.ManStep.value && !this._haltSignalFlipflopD.outputs.Q.value
        //const clockSync = this._lastClock = this.inputs.ManStep.value && !this._haltSignalFlipflopD.outputs.Q.value
        const clockSync = this._lastClock = this._virtualRunStopFlipflopD.outputQ̅  ? this.inputs.ManStep.value && this._virtualHaltSignalFlipflopD.outputQ̅  : clockSpeed
        const clrSignal = this.inputs.Reset.value && this._virtualRunStopFlipflopD.outputQ̅

        const runningState = this._virtualRunStopFlipflopD.outputQ̅  ? this.inputs.ManStep.value && !this._virtualRunStopFlipflopD.outputQ̅  : this._virtualRunStopFlipflopD.outputQ

        //this._runStopFlipflopD.inputs.Clock.value = (this._haltSignalFlipflopD.outputs.Q.value && clockSync) || this.inputs.RunStop.value
        //this._runStopFlipflopD.inputs.D.value = this._runStopFlipflopD.outputs.Q̅.value

        //console.log("pClk : ", prevClock, " | Clk : ", clockSync)
        //this._virtualRunStopFlipflopD.inputsD[0] = !(this._virtualRunStopFlipflopD.outputsQ[0])

        //VirtualFlipflopD.setVirtualInputValue(this._virtualRunStopFlipflopD.inputD, this._virtualRunStopFlipflopD.outputQ̅)
        //VirtualFlipflopD.setVirtualInputValue(this._virtualRunStopFlipflopD.inputClock,(this._haltSignalFlipflopD.outputs.Q.value && clockSync) || this.inputs.RunStop.value)
        //VirtualFlipflopD.setVirtualInputValue(this._virtualRunStopFlipflopD.inputClr, clrSignal)
        //console.log("Db : ",this._virtualRunStopFlipflopD.inputD)
        this._virtualRunStopFlipflopD.inputD = this._virtualRunStopFlipflopD.outputQ̅
        //console.log("D : ",this._virtualRunStopFlipflopD.inputD)
        //console.log("Clk : ",this._virtualRunStopFlipflopD._lastClock)
        //this._virtualRunStopFlipflopD.inputClock = (this._haltSignalFlipflopD.outputs.Q.value && clockSync) || this.inputs.RunStop.value
        this._virtualRunStopFlipflopD.inputClock = (this._virtualHaltSignalFlipflopD.outputQ && clockSync) || this.inputs.RunStop.value
        //console.log("Clk : ",this._virtualRunStopFlipflopD.inputClock)
        this._virtualRunStopFlipflopD.inputClr = clrSignal
        this._virtualHaltSignalFlipflopD.inputClr = clrSignal

        this._virtualRunStopFlipflopD.recalcVirtualValue()
        //console.log("Qrun : ",this._virtualRunStopFlipflopD.outputQ)
        this._virtualHaltSignalFlipflopD.inputD = clockSync

        //Flipflop.doRecalcValueForSyncComponent(this._runStopFlipflopD, prevClock, (this._haltSignalFlipflopD.outputs.Q.value && clockSync) || this.inputs.RunStop.value,  this._runStopFlipflopD.inputs.Pre.value, this._runStopFlipflopD.inputs.Clr.value)
        //const runningState = false
        //const clrSignal = false
        // const runningState = this._runStopFlipflopD.outputs.Q̅.value? this.inputs.ManStep.value && this._runStopFlipflopD.outputs.Q̅.value : this._runStopFlipflopD.outputs.Q.value
        //const clrSignal = this.inputs.Reset.value && this._runStopFlipflopD.outputs.Q̅.value
        //const clrSignal = this.inputs.Reset.value && !this._virtualRunStopFlipflopD.outputQ

        const noJump = this._noJump
        // PROGRAM COUNTER LOGIC
        if (this._enablePipeline) {
            this._programCounterMux.inputs.S[0].value = !noJump
            this.setInputValues(this._programCounterMux.inputs.I[1], this.getOutputValues(this._previousProgramCounterRegister.outputs.Q))
            this.setInputValues(this._programCounterMux.inputs.I[0], this.getOutputValues(this._programCounterRegister.outputs.Q))
        }

        //this._programCounterRegister.inputs.D[0].value = true
        //this._programCounterRegister.inputs.Inc = this._programCounterRegister.hasIncDec? this._specialVoidProgramCounterFlipflopD.inputs.D : this._specialVoidProgramCounterFlipflopD.inputs.D
        //Flipflop.doRecalcValueForSyncComponent(this._specialVoidProgramCounterFlipflopD, true, false, this._specialVoidProgramCounterFlipflopD.inputs.Pre.value, this._specialVoidProgramCounterFlipflopD.inputs.Clr.value)

        //this.setInputValues(this._programCounterRegister.inputs.Inc.value, noJump)
        /*
        this._programCounterALU.inputs.Mode.value = false
        this._programCounterALU.inputs.Op[0].value = this._backwardJump
        */
        this._programCounterRegister.inputs.Clr.value = clrSignal
        this._programCounterRegister.inputs.Clock.value = clockSync
        const _programCounterALUop = this._backwardJump? "A-B" : "A+B"
        /*
        if (this._enablePipeline) {
            this.setInputValues(this._programCounterALU.inputs.A, this.getOutputValues(this._programCounterMux.outputs.Z))
        } else {
            this.setInputValues(this._programCounterALU.inputs.A, this.getOutputValues(this._programCounterRegister.outputs.Q))
        }
        */
        const _programCounterALUinputA = this._enablePipeline? this.getOutputValues(this._programCounterMux.outputs.Z) : this.getOutputValues(this._programCounterRegister.outputs.Q)
        // A clone of the array "operands" array is needed cause ArrayClamOrPad returns the array
        // const BinputValueProgramCounterALU = this._operandsValue.slice()
        const _programCounterALUinputB = this._operandsValue.slice().reverse()
        if (this._directAddressingMode) {
            if (!noJump) {
                this.setInputValues(this._programCounterRegister.inputs.D, ArrayClampOrPad(_programCounterALUinputB, this.numAddressInstructionBits, false))
            }
        } else {
            /*
            this.setInputValues(this._programCounterALU.inputs.B, ArrayClampOrPad(BinputValueProgramCounterALU, this.numAddressInstructionBits, false))
            this.setInputValues(this._programCounterRegister.inputs.D, this.getOutputValues(this._programCounterALU.outputs.S))
            */
            const _programCounterALUoutputs = doALUOp(_programCounterALUop, _programCounterALUinputA, _programCounterALUinputB, true)
            this.setInputValues(this._programCounterRegister.inputs.D, _programCounterALUoutputs.s)
        }

        if (this._enablePipeline) {
            this.setInputValues(this._previousProgramCounterRegister.inputs.D, this.getOutputValues(this._programCounterRegister.outputs.Q))
        }

        Flipflop.doRecalcValueForSyncComponent(this._programCounterRegister, prevClock, clockSync,  this._programCounterRegister.inputs.Pre.value, this._programCounterRegister.inputs.Clr.value)
        this._programCounterRegister.makeStateAfterClock()
        Flipflop.doRecalcValueForSyncComponent(this._previousProgramCounterRegister, prevClock, clockSync,  this._previousProgramCounterRegister.inputs.Pre.value, this._previousProgramCounterRegister.inputs.Clr.value)

        /*
        this._clockSpeedMux.inputs.S[0].value = this.inputs.Speed.value
        this._clockSpeedMux.inputs.I[1][0].value = this.inputs.ClockF.value
        this._clockSpeedMux.inputs.I[0][0].value = this.inputs.ClockS.value
        */

        /*
        this._autoManMux.inputs.S[0].value = this._runStopFlipflopD.outputs.Q.value
        this._autoManMux.inputs.I[1][0].value = this._clockSpeedMux.outputs.Z[0].value
        this._autoManMux.inputs.I[0][0].value = this.inputs.ManStep.value && !this._haltSignalFlipflopD.outputs.Q.value
        */

        /*
        this._runningStateMux.inputs.S[0].value = this._runStopFlipflopD.outputs.Q̅.value
        this._runningStateMux.inputs.I[1][0].value = this.inputs.ManStep.value && this._runStopFlipflopD.outputs.Q̅.value
        this._runningStateMux.inputs.I[0][0].value = this._runStopFlipflopD.outputs.Q.value
        */




        //this._runStopFlipflopD.inputs.Clr.value = clrSignal


        this._instructionRegister.inputs.Clr.value = clrSignal
        this._accumulatorRegister.inputs.Clr.value = clrSignal
        this._flagsRegister.inputs.Clr.value = clrSignal

        this._fetchFlipflopD.inputs.Pre.value = clrSignal
        this._decodeFlipflopD.inputs.Clr.value = clrSignal
        this._executeFlipflopD.inputs.Clr.value = clrSignal
        this._operationStageCounter.inputs.Clr.value = clrSignal

        if (clrSignal) {
            //this._lastClock = Unknown
            this._opCodeOperandsInStages = { FETCH: "", DECODE : "", EXECUTE : "" }
        }

        //const clockSync = this._autoManMux.outputs.Z[0].value
        /*
                if (!this._haltSignalFlipflopD.outputs.Q.value) {
                    this._operationStageCounter.inputs.Clock.value = clockSync
                }
                if (this._enablePipeline) {
                    this._instructionRegister.inputs.Clock.value = clockSync

                    this._accumulatorRegister.inputs.Clock.value = clockSync
                    this._flagsRegister.inputs.Clock.value = clockSync
                    this._haltSignalFlipflopD.inputs.Clock.value = clockSync

                    this._programCounterRegister.inputs.Clock.value = clockSync
                    this._previousProgramCounterRegister.inputs.Clock.value = clockSync
                } else {
                    this._decodeFlipflopD.inputs.D.value = this._fetchFlipflopD.outputs.Q.value
                    this._executeFlipflopD.inputs.D.value = this._decodeFlipflopD.outputs.Q.value
                    this._fetchFlipflopD.inputs.D.value = this._executeFlipflopD.outputs.Q.value

                    this._fetchFlipflopD.inputs.Clock.value = clockSync
                    this._decodeFlipflopD.inputs.Clock.value = clockSync
                    this._executeFlipflopD.inputs.Clock.value = clockSync

                    this._instructionRegister.inputs.Clock.value = clockSync && this._fetchFlipflopD.outputs.Q.value

                    this._accumulatorRegister.inputs.Clock.value = clockSync && this._decodeFlipflopD.outputs.Q.value
                    this._flagsRegister.inputs.Clock.value = clockSync && this._decodeFlipflopD.outputs.Q.value
                    this._haltSignalFlipflopD.inputs.Clock.value = clockSync && this._decodeFlipflopD.outputs.Q.value

                    this._programCounterRegister.inputs.Clock.value  = clockSync && this._executeFlipflopD.outputs.Q.value
                }
          */

        //this._virtualRunStopFlipflopD.outputsQ = this._virtualRunStopFlipflopD.doRecalcValueForSync(prevClock, clockSync)

        Flipflop.doRecalcValueForSyncComponent(this._fetchFlipflopD, prevClock, clockSync,  this._fetchFlipflopD.inputs.Pre.value, this._fetchFlipflopD.inputs.Clr.value)
        Flipflop.doRecalcValueForSyncComponent(this._decodeFlipflopD, prevClock, clockSync,  this._decodeFlipflopD.inputs.Pre.value, this._decodeFlipflopD.inputs.Clr.value)
        Flipflop.doRecalcValueForSyncComponent(this._executeFlipflopD, prevClock, clockSync,  this._executeFlipflopD.inputs.Pre.value, this._executeFlipflopD.inputs.Clr.value)

        // FETCH Stage
        const isa = this.inputValues(this.inputs.Isa)
        // Needs to revert all inputs to be compatible with choosen ISA
        this.setInputValues(this._instructionRegister.inputs.D, isa, true)
        Flipflop.doRecalcValueForSyncComponent(this._instructionRegister, prevClock, clockSync,  this._instructionRegister.inputs.Pre.value, this._instructionRegister.inputs.Clr.value)

        // DECCODE Stage
        const opCodeValue = this.getOutputValues(this._instructionRegister.outputs.Q).slice(0, 4).reverse()
        const opCodeIndex = displayValuesFromArray(opCodeValue, true)[1]
        const opCodeName = isUnknown(opCodeIndex) ? Unknown : CPUOpCodes[opCodeIndex]

        this._operandsValue = this.getOutputValues(this._instructionRegister.outputs.Q).slice(4, 8).reverse()

        /*
        this._ALU.inputs.Mode.value = opCodeValue[2]
        this._ALU.inputs.Op[2].value = opCodeValue[1]
        this._ALU.inputs.Op[1].value = !opCodeValue[3]
        this._ALU.inputs.Op[0].value = opCodeValue[0]
        */

        const _ALUopValue = [opCodeValue[0], !opCodeValue[3], opCodeValue[1], opCodeValue[2]]
        const _ALUopIndex = displayValuesFromArray(_ALUopValue, false)[1]
        const _ALUop = isUnknown(_ALUopIndex) ? "A+B" : ALUOps[_ALUopIndex]

        const ramwevalue = opCodeValue[3] && !opCodeValue[2] && opCodeValue[1] && opCodeValue[0]

        /*
        const commonInstructionMuxSelect = !opCodeValue[3] && !opCodeValue[2]
        this._instructionMux.inputs.S[1].value = commonInstructionMuxSelect && opCodeValue[1]
        this._instructionMux.inputs.S[0].value = (commonInstructionMuxSelect && opCodeValue[0]) || (opCodeValue[3] && !opCodeValue[1]) || (opCodeValue[3] && opCodeValue[2])
        */

        const _operandsDataCommonSelect = !opCodeValue[3] && !opCodeValue[2]
        const _operandsDataSelectValue = [(_operandsDataCommonSelect && opCodeValue[0]) || (opCodeValue[3] && !opCodeValue[1]) || (opCodeValue[3] && opCodeValue[2]), _operandsDataCommonSelect && opCodeValue[1]]
        let _operandsDataSelectValueIndex = displayValuesFromArray(_operandsDataSelectValue, false)[1]
        _operandsDataSelectValueIndex = isUnknown(_operandsDataSelectValueIndex) ? 0 : _operandsDataSelectValueIndex

        //this.setInputValues(this._ALU.inputs.A, this.getOutputValues(this._accumulatorRegister.outputs.Q).reverse())
        //this.setInputValues(this._ALU.inputs.B, this.inputValues(this.inputs.Din).reverse())
        const _ALUoutputs = doALUOp(_ALUop, this.getOutputValues(this._accumulatorRegister.outputs.Q).reverse(), this.inputValues(this.inputs.Din).reverse(), false)
        /*
        this.setInputValues(this._instructionMux.inputs.I[3], this._operandsValue)
        this.setInputValues(this._instructionMux.inputs.I[2], this.inputValues(this.inputs.Din))
        //this.setInputValues(this._instructionMux.inputs.I[1], this.getOutputValues(this._ALU.outputs.S).reverse())
        this.setInputValues(this._instructionMux.inputs.I[1], _ALUoutputs.s.reverse())
        this.setInputValues(this._instructionMux.inputs.I[0], this.getOutputValues(this._accumulatorRegister.outputs.Q))
        */

        let _operandsData : LogicValue[]
        if (_operandsDataSelectValueIndex === 0) {
            _operandsData = this.getOutputValues(this._accumulatorRegister.outputs.Q)
        } else if (_operandsDataSelectValueIndex === 1) {
            _operandsData = _ALUoutputs.s.reverse()
        } else if (_operandsDataSelectValueIndex === 2) {
            _operandsData = this.inputValues(this.inputs.Din)
        } else if (_operandsDataSelectValueIndex === 3) {
            _operandsData = this._operandsValue
        } else {
            _operandsData = this.getOutputValues(this._accumulatorRegister.outputs.Q)
        }

        this.setInputValues(this._accumulatorRegister.inputs.D, _operandsData)

        //this._flagsRegister.inputs.D[1].value = this._ALU.outputs.Cout.value
        this._flagsRegister.inputs.D[1].value = _ALUoutputs.cout
        this._flagsRegister.inputs.D[0].value = this.allZeros(_operandsData)

        const c = this._flagsRegister.outputs.Q[1].value
        const z = this._flagsRegister.outputs.Q[0].value

        const jumpControl = opCodeValue[2] && !opCodeValue[3]
        this._noJump = !(((((opCodeValue[0] && c) || (!opCodeValue[0] && z)) && opCodeValue[1]) || !opCodeValue[1]) && jumpControl)
        this._backwardJump = (opCodeValue[0] && !opCodeValue[1]) && jumpControl


        this._virtualHaltSignalFlipflopD.inputD = opCodeValue[3] && !opCodeValue[2] && opCodeValue[1] && !opCodeValue[0]

        Flipflop.doRecalcValueForSyncComponent(this._accumulatorRegister, prevClock, clockSync,  this._accumulatorRegister.inputs.Pre.value, this._accumulatorRegister.inputs.Clr.value)
        Flipflop.doRecalcValueForSyncComponent(this._flagsRegister, prevClock, clockSync,  this._flagsRegister.inputs.Pre.value, this._flagsRegister.inputs.Clr.value)
        Flipflop.doRecalcValueForSyncComponent(this._specialVoidProgramCounterFlipflopD, prevClock, clockSync,  this._specialVoidProgramCounterFlipflopD.inputs.Pre.value, this._specialVoidProgramCounterFlipflopD.inputs.Clr.value)
        //Flipflop.doRecalcValueForSyncComponent(this._haltSignalFlipflopD, prevClock, clockSync,  this._haltSignalFlipflopD.inputs.Pre.value, this._haltSignalFlipflopD.inputs.Clr.value)
        this._virtualHaltSignalFlipflopD.recalcVirtualValue()

        // EXECUTE STAGE
        const ramwesyncvalue = this._enablePipeline ? clockSync : clockSync && this._decodeFlipflopD.outputs.Q.value

        const opCode = isHighImpedance(opCodeValue) ? "?" : this.opCode
        const operands = this.operands

        if (this._enablePipeline) {
            if (Flipflop.isClockTrigger(this._trigger, prevClock, clockSync)) {
                //console.log("clock : ",clockSync, " prevlck : ", prevClock, " change : ",clockSync)
                this._opCodeOperandsInStages = this.shiftOpCodeOperandsInStages(this._opCodeOperandsInStages, this.stage, opCode, operands, this._enablePipeline)
            }
        } else {
            if (!Flipflop.isClockTrigger(this._trigger, prevClock, clockSync)) {
                this._opCodeOperandsInStages = this.shiftOpCodeOperandsInStages(this._opCodeOperandsInStages, this.stage, opCode, operands, this._enablePipeline)
            }
        }

        if (isUnknown(opCodeName)) {
            return {
                isaadr: ArrayFillWith(Unknown, this.numAddressInstructionBits).reverse(),
                dadr: ArrayFillWith(Unknown, this.numDataBits).reverse(),
                dout: ArrayFillWith(Unknown, this.numDataBits).reverse(),
                ramwesync: Unknown,
                ramwe: Unknown,
                resetsync: Unknown,
                sync: Unknown,
                z: Unknown,
                v: Unknown,
                cout: Unknown,
                runningstate: Unknown,
            }
        }

        return {
            isaadr: this.getOutputValues(this._programCounterRegister.outputs.Q).reverse(),
            dadr: this._operandsValue.reverse(),
            dout: this.getOutputValues(this._accumulatorRegister.outputs.Q).reverse(),
            ramwesync: ramwesyncvalue,
            ramwe: ramwevalue,
            resetsync: clrSignal,
            sync: clockSync,
            z: this._flagsRegister.outputs.Q[0].value,
            v: false,
            cout: this._flagsRegister.outputs.Q[1].value,
            runningstate: runningState,
        }

    }

    public override propagateValue(newValue: CPUBaseValue) {
        this.outputValues(this.outputs.Isaadr , newValue.isaadr)
        this.outputValues(this.outputs.Dadr , newValue.dadr)
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
    /*
        public makeStateAfterClock(): LogicValue[] {
            return this.inputValues(this.inputs.Isa).map(LogicValue.filterHighZ)
            return this.inputValues(this.inputs.Din).map(LogicValue.filterHighZ)
        }
    */

    public shiftOpCodeOperandsInStages(previousOpCodeOperandsInStages: any, cpuStage: CPUStage, opCode: string, operands: LogicValue[], isPipelineEnabled: boolean) {
        //console.log(previousOpCodeOperandsInStages)
        let opCodeOperandsInStages = { FETCH: "", DECODE : "", EXECUTE : "" }
        if (isPipelineEnabled) {
            opCodeOperandsInStages["FETCH"] = opCode + "+" + this.getOperandsNumberWithRadix(operands, 2)
            opCodeOperandsInStages["DECODE"] = previousOpCodeOperandsInStages["FETCH"]
            opCodeOperandsInStages["EXECUTE"] = previousOpCodeOperandsInStages["DECODE"]
        } else {
            opCodeOperandsInStages[cpuStage] = opCode + "+" + this.getOperandsNumberWithRadix(operands, 2)
        }
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
