import { LogicEditor } from "./LogicEditor"
import { isDefined, isString, isUndefined } from "./utils"

import { AdderDef } from "./components/Adder"
import { AdderArrayDef } from "./components/AdderArray"
import { ALUDef } from "./components/ALU"
import { ClockDef } from "./components/Clock"
import { ComparatorDef } from "./components/Comparator"
import { Component, ComponentCategory, Params } from "./components/Component"
import { CounterDef } from "./components/Counter"
import { Decoder16SegDef } from "./components/Decoder16Seg"
import { Decoder7SegDef } from "./components/Decoder7Seg"
import { DecoderBCD4Def } from "./components/DecoderBCD4"
import { DemuxDef } from "./components/Demux"
import { FlipflopDDef } from "./components/FlipflopD"
import { FlipflopJKDef } from "./components/FlipflopJK"
import { FlipflopTDef } from "./components/FlipflopT"
import { Gate1Def, GateNDef } from "./components/Gate"
import { GateArrayDef } from "./components/GateArray"
import { Gate1Types, GateNTypes } from "./components/GateTypes"
import { HalfAdderDef } from "./components/HalfAdder"
import { InputDef } from "./components/Input"
import { InputRandomDef } from "./components/InputRandom"
import { LabelRectDef } from "./components/LabelRect"
import { LabelStringDef } from "./components/LabelString"
import { LatchSRDef } from "./components/LatchSR"
import { MuxDef } from "./components/Mux"
import { OutputDef } from "./components/Output"
import { Output16SegDef } from "./components/Output16Seg"
import { Output7SegDef } from "./components/Output7Seg"
import { OutputAsciiDef } from "./components/OutputAscii"
import { OutputBarDef } from "./components/OutputBar"
import { OutputDisplayDef } from "./components/OutputDisplay"
import { OutputShiftBufferDef } from "./components/OutputShiftBuffer"
import { PassthroughDef } from "./components/Passthrough"
import { RAMDef } from "./components/RAM"
import { RegisterDef } from "./components/Register"
import { ShiftRegisterDef } from "./components/ShiftRegister"
import { SwitchedInverterDef } from "./components/SwitchedInverter"
import { TriStateBufferDef } from "./components/TriStateBuffer"
import { TriStateBufferArrayDef } from "./components/TriStateBufferArray"

type ComponentMaker<TParams extends Record<string, unknown>> = {
    isValid(): boolean,
    category: ComponentCategory,
    type: string | undefined,
    make(editor: LogicEditor, params?: TParams): Component,
    makeFromJSON(editor: LogicEditor, data: Record<string, unknown>): Component | undefined,
}

type GateParams = Params<typeof Gate1Def> | Params<typeof GateNDef> | { type: "TRI" }

const GateAdapter: ComponentMaker<GateParams> = {
    isValid: () => true,
    category: "gate",
    type: undefined,
    make: (editor, params) => {
        const type = params?.type ?? GateNDef.aults.type
        if (Gate1Types.includes(type)) {
            return Gate1Def.make(editor, params as Params<typeof Gate1Def>)
        } else if (GateNTypes.includes(type)) {
            return GateNDef.make(editor, params as Params<typeof GateNDef>)
        } else if (type === "TRI") {
            return TriStateBufferDef.make(editor)
        }
        // never reached
        throw new Error(`Invalid gate type ${type}`)
    },
    makeFromJSON: (editor, data) => {
        if (!isString(data.type)) {
            console.warn(`Missing gate type in ${data}`)
            return undefined
        }
        const type = data.type
        if (Gate1Types.includes(type)) {
            return Gate1Def.makeFromJSON(editor, data)
        } else if (GateNTypes.includes(type)) {
            return GateNDef.makeFromJSON(editor, data)
        } else if (type === "TRI") {
            return TriStateBufferDef.makeFromJSON(editor, data)
        }
        return undefined
    },
}

const AllComponentDefs: ComponentMaker<any>[] = [
    // in
    InputDef,
    ClockDef,
    InputRandomDef,

    // out
    OutputDef,
    OutputDisplayDef,
    Output7SegDef,
    Output16SegDef,
    OutputAsciiDef,
    OutputBarDef,
    OutputShiftBufferDef,

    // gates
    GateAdapter,
    TriStateBufferDef,

    // ic
    SwitchedInverterDef,
    GateArrayDef,
    TriStateBufferArrayDef,
    HalfAdderDef,
    AdderDef,
    AdderArrayDef,
    ALUDef,
    MuxDef,
    DemuxDef,
    LatchSRDef,
    FlipflopJKDef,
    FlipflopTDef,
    FlipflopDDef,
    RegisterDef,
    ShiftRegisterDef,
    RAMDef,
    CounterDef,
    Decoder7SegDef,
    Decoder16SegDef,
    DecoderBCD4Def,
    ComparatorDef,

    // labels
    LabelStringDef,
    LabelRectDef,

    // layout
    PassthroughDef,
]

export type ButtonDataset = {
    category: ComponentCategory,
    type?: string,
    componentId?: string,
    params?: string,
}

class _ComponentFactory {

    private readonly registry = new Map<string, ComponentMaker<any>>()

    public constructor() {
        for (const maker of AllComponentDefs) {
            const key = isDefined(maker.type) ? `${maker.category}.${maker.type}` : maker.category
            if (!maker.isValid()) {
                throw new Error(`Implementation missing for components of type '${key}'`)
            }
            // console.log(`Registering component for '${key}'`)
            if (this.registry.has(key)) {
                throw new Error(`Duplicate component for components of type '${key}'`)
            }
            this.registry.set(key, maker)
        }
    }

    public makeFromJSON(editor: LogicEditor, category: string, obj_: unknown): Component | undefined {
        const obj = obj_ as Record<string, unknown>
        const type = isString(obj.type) ? obj.type : undefined
        const maker = this.getMaker(category, type)
        return maker?.makeFromJSON(editor, obj)
    }

    public makeFromButton(editor: LogicEditor, elem: HTMLElement) {
        const compDataset = elem.dataset as ButtonDataset
        const paramsStr = compDataset.params
        const maker = this.getMaker(compDataset.category, compDataset.type)
        const params = isUndefined(paramsStr) ? undefined : JSON.parse(paramsStr) as Record<string, unknown>
        return maker?.make(editor, params)

        // TODO further general component customisation based on editor options
        // const classId = compDataset.componentId
        // if (isUndefined(classId)) {
        //     console.warn("No class ID linked to elem " + elem.outerHTML)
        // } else {
        //     const compConfig = editor.options.initParams?.[classId]
        //     if (isDefined(compConfig)) {
        //         let val
        //         if (isDefined(val = compConfig.orient)) {
        //             newComp.doSetOrient(val)
        //         }
        //     }

        }

    private getMaker(category: string, type?: string): ComponentMaker<any> | undefined {
        let maker
        if (isDefined(type)) {
            maker = this.registry.get(`${category}.${type}`)
            if (isUndefined(maker)) {
                maker = this.registry.get(category)
            }
        } else {
            maker = this.registry.get(category)
        }
        if (isUndefined(maker)) {
            console.warn(`Unknown component for '${category}.${type}'`)
        }
        return maker
    }

}

export const ComponentFactory = new _ComponentFactory()
