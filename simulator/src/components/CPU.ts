import * as t from "io-ts"
import { COLOR_BACKGROUND, COLOR_COMPONENT_BORDER, COLOR_COMPONENT_INNER_LABELS, COLOR_GROUP_SPAN, displayValuesFromArray, drawLabel, drawWireLineToComponent, GRID_STEP } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import {
    ArrayFillUsing,
    ArrayFillWith,
    EdgeTrigger,
    isBoolean,
    isHighImpedance,
    isUnknown,
    LogicValue,
    toLogicValue,
    typeOrUndefined,
    Unknown,
} from "../utils"
import { defineParametrizedComponent, groupHorizontal, groupVertical, param, paramBool, ParametrizedComponentBase, Repr, ResolvedParams, Value } from "./Component"
import { Drawable, DrawableParent, DrawContext, GraphicsRendering, MenuData, MenuItems, Orientation } from "./Drawable"
import { Gate1Types, Gate2toNType, Gate2toNTypes } from "./GateTypes"
import { Register } from "./Register";
import { ALU, ALUDef, ALUTypes, doALUAdd} from "./ALU"
import {Mux} from "./Mux";
/*
import { MuxTypes } from "./Mux"
import { DemuxTypes } from "./Demux"

import { FlipflopDTypes, FlipflopD, FlipflopDDef } from "./FlipflopD"

import {makeTriggerItems} from "./FlipflopOrLatch";
import {map} from "fp-ts";
*/

export const CPUDef =
    defineParametrizedComponent("CPU", true, true, {
        variantName: ({ dataBits }) => `CPU-${dataBits}`,
        idPrefix: "CPU",
        button: { imgWidth: 40 },
        repr: {
            instructionBits: typeOrUndefined(t.number),
            addressInstructionBits: typeOrUndefined(t.number),
            dataBits: typeOrUndefined(t.number),
            addressDataBits: typeOrUndefined(t.number),
            ext: typeOrUndefined(t.boolean),
            showOpCode: typeOrUndefined(t.boolean),
            //trigger: typeOrUndefined(t.keyof(EdgeTrigger)),
        },
        valueDefaults: {
            showOpCode: true,
            //trigger: EdgeTrigger.rising,
        },
        params: {
            instructionBits: param(8, [8]),
            addressInstructionBits: param(4, [1, 2, 3, 4, 5, 6, 7, 8]),
            dataBits: param(4, [4]),
            addressDataBits: param(4, [4]),
            ext: paramBool(), // has the extended opcode
        },
        validateParams: ({ instructionBits, addressInstructionBits, dataBits, addressDataBits,  ext }) => ({
            numInstructionBits: instructionBits,
            numAddressInstructionBits: addressInstructionBits,
            numDataBits: dataBits,
            numAddressDataBits: addressDataBits,
            usesExtendedOpCode: ext,
        }),
        size: ({ numDataBits }) => ({
            //gridWidth: 7,
            //gridHeight: 19 + Math.max(0, numDataBits - 8) * 2,
            gridWidth: 32,
            gridHeight: 32,
        }),
        makeNodes: ({ numInstructionBits, numAddressInstructionBits, numDataBits, numAddressDataBits, usesExtendedOpCode, gridWidth, gridHeight }) => {
            const bottom = gridHeight / 2
            const top = -bottom
            const right = gridWidth / 2
            const left = -right
            const inputX = right + 1.5
            const inputY = bottom + 1.5
            const midY = bottom / 2
            const midX = right / 2
            // const topGroupDataBits = usesExtendedOpcode ? 5 : 3
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
                    //ClockS: [-9, inputY, "s", "Slow Clock"],
                    //ClockF: [-7, inputY, "s", "Fast Clock"],
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
        initialValue: (saved, { numAddressInstructionBits, numDataBits, numAddressDataBits }) => {
            const false_ = false as LogicValue
            return { isaadr: ArrayFillWith(false_, numAddressInstructionBits), dout: ArrayFillWith(false_, numDataBits), dadr: ArrayFillWith(false_, numAddressDataBits), z: false_, v: false_, cout: false_, resetsync: false_, sync: false_, runningstate: false_, ramsync: false_, ramwe: false_ }
        },
    })

export type CPURepr = Repr<typeof CPUDef>
export type CPUParams = ResolvedParams<typeof CPUDef>

type CPUValue = Value<typeof CPUDef>

export type CPUOpCode = typeof CPUOpCodes[number]
export const CPUOpCode = {
    shortName(op: CPUOpCode): string {
        return S.Components.CPU[op][0]
    },
    fullName(op: CPUOpCode): string {
        return S.Components.CPU[op][1]
    },
}

type CPUoperands = Value<typeof CPUDef>

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

export class CPU extends ParametrizedComponentBase<CPURepr> {

    public readonly numInstructionBits: number
    public readonly numAddressInstructionBits: number
    
    public readonly numDataBits: number
    public readonly numAddressDataBits: number

    public readonly usesExtendedOpCode: boolean

    private _ALU : ALU

    private _instructionRegister : Register
    private _accumulatorRegister : Register
    private _flagsRegister : Register

    private _instructionMux : Mux

    private _programCounterRegisterALU : ALU

    private _programCounterRegister : Register
    private _previousProgramCounterRegister : Register

    private _programCounterRegisterMux : Mux
    private _programCounterRegisterAdderMux : Mux

    private _showOpCode: boolean
    //private _trigger: EdgeTrigger = CPUDef.aults.trigger
    protected _isInInvalidState = false
    protected _lastClock: LogicValue = Unknown

    public constructor(parent: DrawableParent, params: CPUParams, saved?: CPURepr) {
        super(parent, CPUDef.with(params), saved)

        this.numInstructionBits = params.numInstructionBits
        this.numAddressInstructionBits = params.numAddressInstructionBits
        
        this.numDataBits = params.numDataBits
        this.numAddressDataBits = params.numAddressDataBits

        this.usesExtendedOpCode = params.usesExtendedOpCode

        this._ALU = new ALU(parent,{numBits: this.numDataBits, usesExtendedOpcode: true},undefined)

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

        this._programCounterRegisterALU = new ALU(parent,{numBits: this.numDataBits, usesExtendedOpcode: true},undefined)

        this._programCounterRegisterMux = new Mux (parent, {numFrom: 4 * this.numDataBits, numTo: this.numDataBits, numGroups: 4, numSel: 2}, undefined)
        this._programCounterRegisterAdderMux = new Mux (parent, {numFrom: 2 * this.numAddressInstructionBits, numTo: this.numAddressInstructionBits, numGroups: 2, numSel: 1}, undefined)

        // MUST change trigger of Registers
        this._programCounterRegister.setTrigger(EdgeTrigger.falling)
        this._previousProgramCounterRegister.setTrigger(EdgeTrigger.falling)

        this._showOpCode = saved?.showOpCode ?? CPUDef.aults.showOpCode
        //this._trigger = saved?.trigger ?? CPUDef.aults.trigger
    }

    public toJSON() {
        return {
            instructionBits: this.numInstructionBits === CPUDef.aults.instructionBits ? undefined : this.numInstructionBits,
            addressInstructionBits: this.numAddressInstructionBits === CPUDef.aults.addressInstructionBits ? undefined : this.numAddressInstructionBits,
            dataBits: this.numDataBits === CPUDef.aults.dataBits ? undefined : this.numDataBits,
            addressDataBits: this.numAddressDataBits === CPUDef.aults.addressDataBits ? undefined : this.numAddressDataBits,
            ext: this.usesExtendedOpCode === CPUDef.aults.ext ? undefined : this.usesExtendedOpCode,
            ...this.toJSONBase(),
            showOpCode: (this._showOpCode !== CPUDef.aults.showOpCode) ? this._showOpCode : undefined,
            //trigger: (this._trigger !== CPUDef.aults.trigger) ? this._trigger : undefined,
        }
    }

    protected get moduleName() {
        return "CPU"
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
    public override makeTooltip() {
        const opCode= this.opCode
        const s = S.Components.CPU.tooltip
        const opCodeDesc = isUnknown(opCode) ? s.SomeUnknownInstruction : s.ThisInstruction + " " + CPUOpCode.fullName(opCode)
        return tooltipContent(s.title, mods(
            div(`${s.CurrentlyCarriesOut} ${opCodeDesc}.`)
        ))
    }

    public get opCode(): CPUOpCode | Unknown {
        //const opValues = this.inputValues(this.inputs.Isa.reverse()).slice(0,4)
        const opCodeValues = this.getOutputValues(this._instructionRegister.outputs.Q).slice(0,4)
        //opValues.push(this.inputs.Mode.value)
        const opCodeIndex = displayValuesFromArray(opCodeValues, true)[1]
        // TO DO
        //return isUnknown(opIndex) ? Unknown : (this.usesExtendedOpcode ? CPUOpCodes : CPUOpCodesExtended)[opIndex]
        return isUnknown(opCodeIndex) ? Unknown : (this.usesExtendedOpCode ? CPUOpCodes : CPUOpCodes)[opCodeIndex]
    }
    /*
    public get operands(): CPUoperands | Unknown{
        const operandsValues = this.getOutputValues(this._instructionRegister.outputs.Q).slice(4,8)
        return operandsValues
    }
*/
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
        this._instructionMux.inputs.S[0].value = (commonInstructionMuxSelect && opCodeValues[0]) || (opCodeValues[3] && (!opCodeValues[1] || opCodeValues[2]))

        const operands = this.getOutputValues(this._instructionRegister.outputs.Q).slice(4,8).reverse()

        this.setInputValues(this._ALU.inputs.A, this.getOutputValues(this._accumulatorRegister.outputs.Q))
        this.setInputValues(this._ALU.inputs.B, this.inputValues(this.inputs.Din))

        this.setInputValues(this._instructionMux.inputs.I[3], operands)
        this.setInputValues(this._instructionMux.inputs.I[2], this.inputValues(this.inputs.Din))
        this.setInputValues(this._instructionMux.inputs.I[1], this.getOutputValues(this._ALU.outputs.S))
        this.setInputValues(this._instructionMux.inputs.I[0], this.getOutputValues(this._accumulatorRegister.outputs.Q))

        this.setInputValues(this._accumulatorRegister.inputs.D, this.getOutputValues(this._instructionMux.outputs.Z))

        const z = allZeros(this.getOutputValues(this._instructionMux.outputs.Z))
        const c = this.outputs.Cout.value

        const jumpControl = opCodeValues[2] && !opCodeValues[3]
        const noJump = !(((((opCodeValues[0] && z) || (!opCodeValues[0] && c)) && opCodeValues[1]) || !opCodeValues[1]) && jumpControl)
        const backwardJump = (opCodeValues[0] && !opCodeValues[1]) && jumpControl

        this._flagsRegister.inputs.D[1].value = z
        this._flagsRegister.inputs.D[1].value = c

        this._programCounterRegisterAdderMux.inputs.S[0].value = !noJump

        this._programCounterRegisterALU.inputs.Mode.value = false
        this._programCounterRegisterALU.inputs.Op[2].value = false
        this._programCounterRegisterALU.inputs.Op[1].value = noJump
        this._programCounterRegisterALU.inputs.Op[0].value = backwardJump

        this.setInputValues(this._programCounterRegisterAdderMux.inputs.I[1], this.getOutputValues(this._programCounterRegister.outputs.Q))
        this.setInputValues(this._programCounterRegisterAdderMux.inputs.I[0], this.getOutputValues(this._previousProgramCounterRegister.outputs.Q))

        this.setInputValues(this._previousProgramCounterRegister.inputs.D, this.getOutputValues(this._programCounterRegister.outputs.Q))

        this.setInputValues(this._programCounterRegisterALU.inputs.A, this.getOutputValues(this._programCounterRegisterAdderMux.outputs.Z))
        this.setInputValues(this._programCounterRegisterALU.inputs.B, operands)

        const prevClock = this._lastClock
        const clock = this._lastClock = this.inputs.Speed.value ? this.inputs.ClockS.value : this.inputs.ClockF.value
        this._instructionRegister.inputs.Clock.value = clock
        this._accumulatorRegister.inputs.Clock.value = clock
        this._flagsRegister.inputs.Clock.value = clock
        this._programCounterRegister.inputs.Clock.value  = clock
        this._previousProgramCounterRegister.inputs.Clock.value = clock

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
            ramsync: false,
            ramwe: opCodeValues[3] && !opCodeValues[2] && opCodeValues[1] && opCodeValues[0],
            resetsync: false,
            sync: false,
            z: this._flagsRegister.outputs.Q[0].value,
            v: false,
            cout: this._flagsRegister.outputs.Q[1].value,
            runningstate: false,
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
        //this._ALU.doDraw(g, ctx)

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
            ["mid", toggleShowOpItem],
            ["mid", MenuData.sep()],
            this.makeChangeParamsContextMenuItem("inputs", S.Components.Generic.contextMenu.ParamNumAddressBits, this.numAddressInstructionBits, "addressInstructionBits"),
            //this.makeChangeParamsContextMenuItem("inputs", S.Components.Generic.contextMenu.ParamNumBits, this.numInstructionBits, "instructionBits"),
            this.makeChangeBooleanParamsContextMenuItem(s.ParamUseExtendedOpcode, this.usesExtendedOpCode, "ext"),
            //["mid", MenuData.sep()],
            //...makeTriggerItems(this._trigger, this.doSetTrigger.bind(this)),
            ["mid", MenuData.sep()],
            ...this.makeForceOutputsContextMenuItem(),
        ]
    }

}

CPUDef.impl = CPU

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

/**
 *
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

 **/