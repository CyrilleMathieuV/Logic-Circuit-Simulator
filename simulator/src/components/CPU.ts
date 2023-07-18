import * as t from "io-ts"
import { COLOR_BACKGROUND, COLOR_COMPONENT_BORDER, COLOR_COMPONENT_INNER_LABELS, COLOR_GROUP_SPAN, displayValuesFromArray, drawLabel, drawWireLineToComponent, GRID_STEP } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { ArrayFillUsing,  ArrayFillWith, EdgeTrigger, isBoolean, isHighImpedance, isUnknown, LogicValue, typeOrUndefined, Unknown } from "../utils"
import { defineParametrizedComponent, groupHorizontal, groupVertical, param, paramBool, ParametrizedComponentBase, Repr, ResolvedParams, Value } from "./Component"
import { Drawable, DrawableParent, DrawContext, GraphicsRendering, MenuData, MenuItems, Orientation } from "./Drawable"
import { Gate1Types, Gate2toNType, Gate2toNTypes } from "./GateTypes"
import { MuxTypes } from "./Mux"
import { DemuxTypes } from "./Demux"
import { ALU, ALUDef, ALUTypes, doALUAdd} from "./ALU"
import { FlipflopDTypes, FlipflopD, FlipflopDDef } from "./FlipflopD"
import { Register } from "./Register";

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
            showOp: typeOrUndefined(t.boolean),
            trigger: typeOrUndefined(t.keyof(EdgeTrigger)),
        },
        valueDefaults: {
            showOp: true,
            trigger: EdgeTrigger.rising,
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
            usesExtendedOpcode: ext,
        }),
        size: ({ numDataBits }) => ({
            //gridWidth: 7,
            //gridHeight: 19 + Math.max(0, numDataBits - 8) * 2,
            gridWidth: 32,
            gridHeight: 32,
        }),
        makeNodes: ({ numInstructionBits, numAddressInstructionBits, numDataBits, numAddressDataBits, usesExtendedOpcode, gridWidth, gridHeight }) => {
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
                    RunStop: [-5, inputY, "s", "Run/Stop", { prefersSpike: true }],
                    //Mode: opMode,
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

export type CPUOp = typeof CPUOpCodes[number]
export const CPUOp = {
    shortName(op: CPUOp): string {
        return S.Components.CPU[op][0]
    },
    fullName(op: CPUOp): string {
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

export class CPU extends ParametrizedComponentBase<CPURepr> {

    public readonly numInstructionBits: number
    public readonly numAddressInstructionBits: number
    
    public readonly numDataBits: number
    public readonly numAddressDataBits: number

    public readonly usesExtendedOpcode: boolean

    private _showOp: boolean
    private _instructionRegister : Register
    private _ALU : ALU

    private _trigger: EdgeTrigger = CPUDef.aults.trigger
    private _lastClock: LogicValue = Unknown

    public constructor(parent: DrawableParent, params: CPUParams, saved?: CPURepr) {
        super(parent, CPUDef.with(params), saved)

        this.numInstructionBits = params.numInstructionBits
        this.numAddressInstructionBits = params.numAddressInstructionBits
        
        this.numDataBits = params.numDataBits
        this.numAddressDataBits = params.numAddressDataBits

        this.usesExtendedOpcode = params.usesExtendedOpcode

        this._showOp = saved?.showOp ?? CPUDef.aults.showOp
        this._instructionRegister = new Register(parent,{numBits : this.numAddressInstructionBits, hasIncDec: false}, undefined)
        this._ALU = new ALU(parent,{numBits: this.numDataBits, usesExtendedOpcode: true},undefined)

        this._trigger = saved?.trigger ?? CPUDef.aults.trigger
    }

    public toJSON() {
        return {
            instructionBits: this.numInstructionBits === CPUDef.aults.instructionBits ? undefined : this.numInstructionBits,
            addressInstructionBits: this.numAddressInstructionBits === CPUDef.aults.addressInstructionBits ? undefined : this.numAddressInstructionBits,
            dataBits: this.numDataBits === CPUDef.aults.dataBits ? undefined : this.numDataBits,
            addressDataBits: this.numAddressDataBits === CPUDef.aults.addressDataBits ? undefined : this.numAddressDataBits,
            ext: this.usesExtendedOpcode === CPUDef.aults.ext ? undefined : this.usesExtendedOpcode,
            ...this.toJSONBase(),
            showOp: (this._showOp !== CPUDef.aults.showOp) ? this._showOp : undefined,
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

    public override makeTooltip() {
        const op = this.op
        const s = S.Components.CPU.tooltip
        const opDesc = isUnknown(op) ? s.SomeUnknownInstruction : s.ThisInstruction + " " + CPUOp.fullName(op)
        return tooltipContent(s.title, mods(
            div(`${s.CurrentlyCarriesOut} ${opDesc}.`)
        ))
    }

    public get op(): CPUOp | Unknown {
        const opValues = this.inputValues(this.inputs.Isa.slice(0, 3))
        //opValues.push(this.inputs.Mode.value)
        const opIndex = displayValuesFromArray(opValues, false)[1]
        // TO DO
        //return isUnknown(opIndex) ? Unknown : (this.usesExtendedOpcode ? CPUOpCodes : CPUOpCodesExtended)[opIndex]
        return isUnknown(opIndex) ? Unknown : (this.usesExtendedOpcode ? CPUOpCodes : CPUOpCodes)[opIndex]
    }

    protected doRecalcValue(): CPUValue {
        const op = this.op

        const prevClock = this._lastClock
        const clock = this._lastClock = this.inputs.Speed.value ? this.inputs.ClockS.value : this.inputs.ClockF.value

        if (isUnknown(op)) {
            return {
                    dadr: ArrayFillWith(Unknown, this.numDataBits),
                    dout: ArrayFillWith(Unknown, this.numDataBits),
                    isaadr: ArrayFillWith(Unknown, this.numAddressInstructionBits),
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

        const isa = this.inputValues(this.inputs.Isa)
        //const din = this.inputValues(this.inputs.Din)
        //const dadr = this.inputValues(this.inputs.Dadr)
        //const cin = this.inputs.Cin.value

        //return doCPUOp(op, din, isa)
        return doCPUOp(op, isa)
    }

    protected override propagateValue(newValue: CPUValue) {
        //this.outputValues(this.outputs.S, newValue.s)
        this.outputValues(this.outputs.Isaadr , newValue.isaadr)
        this.outputValues(this.outputs.Dadr , newValue.dadr)
        this.outputValues(this.outputs.Dout , newValue.dout)
        this.outputs.RAMsync.value = newValue.ramsync
        this.outputs.RAMwe.value = newValue.ramwe
        this.outputs.ResetSync.value = newValue.resetsync
        this.outputs.Sync.value = newValue.sync
        this.outputs.Z.value = newValue.z
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

            if (this._showOp) {
                const opName = isUnknown(this.op) ? "??" : CPUOp.shortName(this.op)
                const size = opName.length === 1 ? 25 : opName.length === 2 ? 17 : 13
                g.font = `bold ${size}px sans-serif`
                g.fillStyle = COLOR_COMPONENT_BORDER
                g.textAlign = "center"
                g.textBaseline = "middle"
                g.fillText(opName, ...ctx.rotatePoint(this.posX + 5, this.posY))
            }
        })
    }

    private doSetShowOp(showOp: boolean) {
        this._showOp = showOp
        this.setNeedsRedraw("show op changed")
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        const s = S.Components.CPU.contextMenu
        const icon = this._showOp ? "check" : "none"
        const toggleShowOpItem = MenuData.item(icon, s.toggleShowOp, () => {
            this.doSetShowOp(!this._showOp)
        })

        return [
            ["mid", toggleShowOpItem],
            ["mid", MenuData.sep()],
            this.makeChangeParamsContextMenuItem("inputs", S.Components.Generic.contextMenu.ParamNumAddressBits, this.numAddressInstructionBits, "addressInstructionBits"),
            //this.makeChangeParamsContextMenuItem("inputs", S.Components.Generic.contextMenu.ParamNumBits, this.numInstructionBits, "instructionBits"),
            this.makeChangeBooleanParamsContextMenuItem(s.ParamUseExtendedOpcode, this.usesExtendedOpcode, "ext"),
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

export function doCPUOp(op: CPUOp, isa: readonly LogicValue[]):
    CPUValue {
    const numDataBits = 4
    const numAddressInstructionBits = 8
    const numOpBits = 4
    //const numDataBits = din.length
    switch (op) {
        case "NOP":
            break;
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
                dadr: ArrayFillWith(false, numDataBits),
                dout: ArrayFillWith(false, numDataBits),
                isaadr: ArrayFillWith(false, numAddressInstructionBits),
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
        dadr: ArrayFillWith(false, numDataBits),
        dout: ArrayFillWith(false, numDataBits),
        isaadr: ArrayFillWith(false, numAddressInstructionBits),
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