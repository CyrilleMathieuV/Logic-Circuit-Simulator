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
    groupVertical, InputNodeRepr, NodesIn, NodesOut,
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
import { Flipflop, makeTriggerItems } from "./FlipflopOrLatch";
import { Register } from "./Register";
import { ALU } from "./ALU"
import { Mux } from "./Mux";
import { FlipflopD } from "./FlipflopD";
import { NodeIn } from "./Node";

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
            enablePipeline: typeOrUndefined(t.boolean),
            //trigger: typeOrUndefined(t.keyof(EdgeTrigger)),
            //extOpCode: typeOrUndefined(t.boolean),
        },
        valueDefaults: {
            showOpCode: true,
            showOperands: true,
            enablePipeline: true,
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

    protected _specialVoidProgramCounterFlipflopD : FlipflopD

    protected _programCounterMux : Mux

    protected _fetchFlipflopD : FlipflopD
    protected _decodeFlipflopD : FlipflopD
    protected _executeFlipflopD : FlipflopD

    protected _runStopFlipflopD : FlipflopD

    protected _runningStateMux : Mux
    protected _clockSpeedMux : Mux
    protected _autoManMux : Mux

    protected _showOpCode: boolean
    protected _showOperands: boolean
    protected _enablePipeline: boolean

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

        this._programCounterRegister = new Register(parent,{numBits : this.numAddressInstructionBits, hasIncDec: true}, undefined)
        this._previousProgramCounterRegister = new Register(parent,{numBits : this.numAddressInstructionBits, hasIncDec: false}, undefined)

        // MUST change trigger of Registers
        this._programCounterRegister.setTrigger(EdgeTrigger.falling)
        this._previousProgramCounterRegister.setTrigger(EdgeTrigger.falling)

        this._specialVoidProgramCounterFlipflopD = new FlipflopD(parent)

        this._programCounterALU = new ALU(parent,{numBits: this.numAddressInstructionBits, usesExtendedOp: false},undefined)

        this._programCounterMux = new Mux (parent, {numFrom: 2 * this.numAddressInstructionBits, numTo: this.numAddressInstructionBits, numGroups: 2, numSel: 1}, undefined)

        this._fetchFlipflopD = new FlipflopD(parent)
        this._decodeFlipflopD = new FlipflopD(parent)
        this._executeFlipflopD = new FlipflopD(parent)

        // MUST change trigger of Flipflops
        this._fetchFlipflopD.setTrigger(EdgeTrigger.falling)
        this._decodeFlipflopD.setTrigger(EdgeTrigger.falling)
        this._executeFlipflopD.setTrigger(EdgeTrigger.falling)

        this._runStopFlipflopD = new FlipflopD(parent)

        // MUST change trigger of Flipflops
        this._runStopFlipflopD.setTrigger(EdgeTrigger.falling)

        this._runningStateMux = new Mux (parent, {numFrom: 2, numTo: 1, numGroups: 2, numSel: 1}, undefined)
        this._clockSpeedMux = new Mux (parent, {numFrom: 2, numTo: 1, numGroups: 2, numSel: 1}, undefined)
        this._autoManMux = new Mux (parent, {numFrom: 2, numTo: 1, numGroups: 2, numSel: 1}, undefined)

        this._showOpCode = saved?.showOpCode ?? CPUDef.aults.showOpCode
        this._showOperands = saved?.showOperands ?? CPUDef.aults.showOperands
        this._enablePipeline = saved?.enablePipeline ?? CPUDef.aults.enablePipeline
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
            enablePipeline: (this._enablePipeline !== CPUDef.aults.enablePipeline) ? this._enablePipeline : undefined,
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
        // const operandsValue =
        //opValues.push(this.inputs.Mode.value)
        //const operandsIndex = displayValuesFromArray(operandsValue, true)[1]
        // TO DO
        //return isUnknown(opCodeIndex) ? Unknown : (this.usesExtendedOpCode ? CPUOpCodes : CPUOpCodes)[opCodeIndex]
        return this.getOutputValues(this._instructionRegister.outputs.Q).slice(4,8)
    }

    //public abstract makeStateAfterClock(): LogicValue[]

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

    private doSetShowOperands(showOperands: boolean) {
        this._showOperands = showOperands
        this.setNeedsRedraw("show operdanschanged")
    }

    private doSetEnablePipeline(enabalePipeline: boolean) {
        this._enablePipeline = enabalePipeline
        this.setNeedsRedraw("show pipelinechanged")
    }

    protected override doDraw(g: GraphicsRendering, ctx: DrawContext) {
        const bounds = this.bounds()
        const { left, top, right, bottom } = bounds
        const lowerTop = top - 2 * GRID_STEP
        const lowerBottom = top - 2 * GRID_STEP
        const lowerLeft = left - 2 * GRID_STEP
        const lowerRight = right - 2 * GRID_STEP

        // for debug (works only with "npm run bundle-watch")
        //this._instructionRegister.doDraw(g, ctx)
        //this._instructionMux.doDraw(g, ctx)
        //this._ALU.doDraw(g, ctx)
        //this._accumulatorRegister.doDraw(g, ctx)
        //this._programCounterRegister.doDraw(g, ctx)
        //this._programCounterALU.doDraw(g, ctx)
        //this._clockSpeedMux.doDraw(g, ctx)
        //this._autoManMux.doDraw(g, ctx)
        //this._fetchFlipflopD.doDraw(g, ctx)

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
        const toggleShowOperandsItem = MenuData.item(iconOperands, s.toggleShowOperands, () => {
            this.doSetShowOperands(!this._showOperands)
        })
        const iconEnablePipeline = this._enablePipeline? "check" : "none"
        const toggleEnablePipelineItem = MenuData.item(iconEnablePipeline, s.toggleEnablePipeline, () => {
            this.doSetEnablePipeline(!this._enablePipeline)
        })

        return [
            ["mid", toggleShowOpCodeItem],
            ["mid", toggleShowOperandsItem],
            ["mid", MenuData.sep()],
            ["mid", toggleEnablePipelineItem],
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
            trigger: typeOrUndefined(t.keyof(EdgeTrigger)),
        },
        valueDefaults: {
            ...CPUBaseDef.valueDefaults,
            directAddressingMode: false,
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

    private _directAddressingMode = CPUDef.aults.directAddressingMode
    private _trigger: EdgeTrigger = CPUDef.aults.trigger
    //private _lastClock: LogicValue = Unknown

    public constructor(parent: DrawableParent, params: CPUParams, saved?: CPURepr) {
        super(parent, CPUDef.with(params) as any, params, saved)

        this._directAddressingMode = saved?.directAddressingMode ?? CPUDef.aults.directAddressingMode
        this._trigger = saved?.trigger ?? CPUDef.aults.trigger
    }

    public toJSON() {
        return {
            ...this.toJSONBase(),
            directAddressingMode: (this._directAddressingMode !== CPUDef.aults.directAddressingMode) ? this._directAddressingMode : undefined,
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

    protected doSetDirectAddressingMode(directAddressingMode: boolean) {
        this._directAddressingMode = directAddressingMode
        this.setNeedsRedraw("directAddressingMode changed")
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

        const opCodeValue = this.getOutputValues(this._instructionRegister.outputs.Q).slice(0, 4).reverse()
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

        this._flagsRegister.inputs.D[1].value = c
        this._flagsRegister.inputs.D[0].value = z

        const jumpControl = opCodeValue[2] && !opCodeValue[3]
        const noJump = !(((((opCodeValue[0] && c) || (!opCodeValue[0] && z)) && opCodeValue[1]) || !opCodeValue[1]) && jumpControl)
        const backwardJump = (opCodeValue[0] && !opCodeValue[1]) && jumpControl

        this._specialVoidProgramCounterFlipflopD.inputs.D.value = noJump

        if (this._enablePipeline) {
            this._programCounterMux.inputs.S[0].value = !noJump
            this.setInputValues(this._programCounterMux.inputs.I[1], this.getOutputValues(this._previousProgramCounterRegister.outputs.Q))
            this.setInputValues(this._programCounterMux.inputs.I[0], this.getOutputValues(this._programCounterRegister.outputs.Q))
        }

        this._programCounterALU.inputs.Mode.value = false
        this._programCounterALU.inputs.Op[0].value = backwardJump

        if (this._enablePipeline) {
            this.setInputValues(this._programCounterALU.inputs.A, this.getOutputValues(this._programCounterMux.outputs.Z))
        } else {
            this.setInputValues(this._programCounterALU.inputs.A, this.getOutputValues(this._programCounterRegister.outputs.Q))
        }

        this._programCounterRegister.inputs.Inc = this._programCounterRegister.hasIncDec? this._specialVoidProgramCounterFlipflopD.inputs.D : this._specialVoidProgramCounterFlipflopD.inputs.D

        // A clone of the array "operands" array is needed cause ArrayClamOrPad returns the array
        const BinputValueProgramCounterALU = operands.slice().reverse()
        if (this._directAddressingMode) {
            if (!noJump) {
                this.setInputValues(this._programCounterRegister.inputs.D, ArrayClampOrPad(BinputValueProgramCounterALU, this.numAddressInstructionBits, false))
            }
        } else {
            this.setInputValues(this._programCounterALU.inputs.B, ArrayClampOrPad(BinputValueProgramCounterALU, this.numAddressInstructionBits, false))
            this.setInputValues(this._programCounterRegister.inputs.D, this.getOutputValues(this._programCounterALU.outputs.S))
        }

        if (this._enablePipeline) {
            this.setInputValues(this._previousProgramCounterRegister.inputs.D, this.getOutputValues(this._programCounterRegister.outputs.Q))
        }

        const haltOpCodeSignal = opCodeValue[3] && !opCodeValue[2] && opCodeValue[1] && !opCodeValue[0]

        this._runStopFlipflopD.inputs.Clock.value = (haltOpCodeSignal && this._autoManMux.outputs.Z[0].value) || this.inputs.RunStop.value
        this._runStopFlipflopD.inputs.D.value = this._runStopFlipflopD.outputs.Q̅.value

        this._clockSpeedMux.inputs.S[0].value = this.inputs.Speed.value
        this._clockSpeedMux.inputs.I[1][0].value = this.inputs.ClockF.value
        this._clockSpeedMux.inputs.I[0][0].value = this.inputs.ClockS.value

        this._autoManMux.inputs.S[0].value = this._runStopFlipflopD.outputs.Q.value
        this._autoManMux.inputs.I[1][0].value = this._clockSpeedMux.outputs.Z[0].value
        this._autoManMux.inputs.I[0][0].value = this.inputs.ManStep.value && !haltOpCodeSignal

        this._runningStateMux.inputs.S[0].value = this._runStopFlipflopD.outputs.Q̅.value
        this._runningStateMux.inputs.I[1][0].value = this.inputs.ManStep.value && this._runStopFlipflopD.outputs.Q̅.value
        this._runningStateMux.inputs.I[0][0].value = this._runStopFlipflopD.outputs.Q.value

        //const prevClock = this._lastClock
        //const clockSync = this._lastClock = this._autoManMux.outputs.Z[0].value
        const clockSync = this._autoManMux.outputs.Z[0].value
        if (this._enablePipeline) {
            const ramClockSync = clockSync
            this._instructionRegister.inputs.Clock.value = clockSync
            this._accumulatorRegister.inputs.Clock.value = clockSync
            this._flagsRegister.inputs.Clock.value = clockSync
            this._programCounterRegister.inputs.Clock.value  = clockSync
            this._previousProgramCounterRegister.inputs.Clock.value = clockSync
        } else {
            this._fetchFlipflopD.inputs.Clock.value = clockSync
            this._decodeFlipflopD.inputs.Clock.value = clockSync
            this._executeFlipflopD.inputs.Clock.value = clockSync

            this._decodeFlipflopD.inputs.D.value = this._fetchFlipflopD.outputs.Q.value
            this._executeFlipflopD.inputs.D.value = this._decodeFlipflopD.outputs.Q.value
            this._fetchFlipflopD.inputs.D.value = this._executeFlipflopD.outputs.Q.value

            this._instructionRegister.inputs.Clock.value = clockSync && this._fetchFlipflopD.outputs.Q.value

            this._accumulatorRegister.inputs.Clock.value = clockSync && this._fetchFlipflopD.outputs.Q.value
            this._flagsRegister.inputs.Clock.value = clockSync && this._fetchFlipflopD.outputs.Q.value

            this._programCounterRegister.inputs.Clock.value  = clockSync && this._executeFlipflopD.outputs.Q.value
        }
        const ramClockSync = this._enablePipeline ? clockSync : clockSync && this._fetchFlipflopD.outputs.Q.value

        const clrSignal = this.inputs.Reset.value && this._runStopFlipflopD.outputs.Q̅.value

        this._instructionRegister.inputs.Clr.value = clrSignal
        this._accumulatorRegister.inputs.Clr.value = clrSignal
        this._flagsRegister.inputs.Clr.value = clrSignal
        this._programCounterRegister.inputs.Clr.value  = clrSignal
        if (this._enablePipeline) {
            this._previousProgramCounterRegister.inputs.Clr.value = clrSignal
        }
        this._runStopFlipflopD.inputs.Clr.value = clrSignal
        if (!this._enablePipeline) {
            this._fetchFlipflopD.inputs.Pre.value = clrSignal
            this._decodeFlipflopD.inputs.Clr.value = clrSignal
            this._executeFlipflopD.inputs.Clr.value = clrSignal
        }

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
/*
        if (Flipflop.isClockTrigger(this._trigger, prevClock, clockSync)) {
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
        } else {
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
*/
        return {
            isaadr: this.getOutputValues(this._programCounterRegister.outputs.Q),
            dadr: operands,
            dout: this.getOutputValues(this._accumulatorRegister.outputs.Q),
            ramsync: ramClockSync,
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
        return tooltipContent(s.title,
            mods(
                div(`${s.CurrentlyCarriesOut} ${opCodeDesc}.`)
            )
        )
    }
/*
    public makeStateAfterClock(): LogicValue[] {
        return this.inputValues(this.inputs.Isa).map(LogicValue.filterHighZ)
        return this.inputValues(this.inputs.Din).map(LogicValue.filterHighZ)
    }
*/
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
