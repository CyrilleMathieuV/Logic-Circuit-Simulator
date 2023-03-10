import * as t from "io-ts"
import { LogicEditor } from "../LogicEditor"
import { isString, isUndefined } from "../utils"
import { Adder, AdderDef } from "./Adder"
import { ALU, ALUDef } from "./ALU"
import { Comparator, ComparatorDef } from "./Comparator"
import { Counter, CounterDef } from "./Counter"
import { Decoder16Seg, Decoder16SegDef } from "./Decoder16Seg"
import { Decoder7Seg, Decoder7SegDef } from "./Decoder7Seg"
import { DecoderBCD4, DecoderBCD4Def } from "./DecoderBCD4"
import { Demux1To2, Demux1To2Def, Demux1To4, Demux1To4Def, Demux1To8, Demux1To8Def, Demux2To4, Demux2To4Def, Demux2To8, Demux2To8Def, Demux4To8, Demux4To8Def, Demux8To16, Demux8To16Def } from "./Demux"
import { FlipflopD, FlipflopDDef } from "./FlipflopD"
import { FlipflopJK, FlipflopJKDef } from "./FlipflopJK"
import { FlipflopT, FlipflopTDef } from "./FlipflopT"
import { HalfAdder, HalfAdderDef } from "./HalfAdder"
import { LatchSR, LatchSRDef } from "./LatchSR"
import { Mux16To8, Mux16To8Def, Mux2To1, Mux2To1Def, Mux4To1, Mux4To1Def, Mux4To2, Mux4To2Def, Mux8To1, Mux8To1Def, Mux8To2, Mux8To2Def, Mux8To4, Mux8To4Def } from "./Mux"
import { QuadGate, QuadGateDef } from "./QuadGate"
import { QuadTriState, QuadTriStateDef } from "./QuadTriState"
import { RAM16by4, RAM16x4Def } from "./RAM"
import { RAM16by8, RAM16x8Def } from "./RAM8"
import { Register, RegisterDef } from "./Register"
import { SwitchedInverter, SwitchedInverterDef } from "./SwitchedInverter"

export type IC = Adder

export const ICDef = t.union([
    SwitchedInverterDef.repr,
    QuadGateDef.repr,
    QuadTriStateDef.repr,
    HalfAdderDef.repr,
    AdderDef.repr,
    ALUDef.repr,
    Mux2To1Def.repr,
    Mux4To1Def.repr,
    Mux8To1Def.repr,
    Mux4To2Def.repr,
    Mux8To2Def.repr,
    Mux8To4Def.repr,
    Mux16To8Def.repr,
    Demux1To2Def.repr,
    Demux1To4Def.repr,
    Demux1To8Def.repr,
    Demux2To4Def.repr,
    Demux2To8Def.repr,
    Demux4To8Def.repr,
    Demux8To16Def.repr,
    LatchSRDef.repr,
    FlipflopJKDef.repr,
    FlipflopTDef.repr,
    FlipflopDDef.repr,
    RegisterDef.repr,
    RAM16x4Def.repr,
    RAM16x8Def.repr,
    RAM64x8Def.repr,
    RAM32x12Def.repr,
    CounterDef.repr,
    Decoder7SegDef.repr,
    Decoder16SegDef.repr,
    DecoderBCD4Def.repr,
    ComparatorDef.repr,
], "IC")

type ICRepr = t.TypeOf<typeof ICDef>

export const ICFactory = {

    make: (editor: LogicEditor, savedDataOrType: ICRepr | string | undefined) => {
        if (isUndefined(savedDataOrType)) {
            return undefined
        }

        let blank
        let savedData: ICRepr
        if (isString(savedDataOrType)) {
            blank = true
            savedData = { type: savedDataOrType } as ICRepr
        } else {
            blank = false
            savedData = savedDataOrType
        }

        switch (savedData.type) {
            case "switched-inverter":
                return new SwitchedInverter(editor, blank ? null : savedData)
            case "quad-gate":
                return new QuadGate(editor, blank ? null : savedData)
            case "quad-tristate":
                return new QuadTriState(editor, blank ? null : savedData)
            case "halfadder":
                return new HalfAdder(editor, blank ? null : savedData)
            case "adder":
                return new Adder(editor, blank ? null : savedData)
            case "alu":
                return new ALU(editor, blank ? null : savedData)
            case "mux-2to1":
                return new Mux2To1(editor, blank ? null : savedData)
            case "mux-4to1":
                return new Mux4To1(editor, blank ? null : savedData)
            case "mux-8to1":
                return new Mux8To1(editor, blank ? null : savedData)
            case "mux-4to2":
                return new Mux4To2(editor, blank ? null : savedData)
            case "mux-8to2":
                return new Mux8To2(editor, blank ? null : savedData)
            case "mux-8to4":
                return new Mux8To4(editor, blank ? null : savedData)
            case "mux-16to8":
                return new Mux16To8(editor, blank ? null : savedData)
            case "demux-1to2":
                return new Demux1To2(editor, blank ? null : savedData)
            case "demux-1to4":
                return new Demux1To4(editor, blank ? null : savedData)
            case "demux-1to8":
                return new Demux1To8(editor, blank ? null : savedData)
            case "demux-2to4":
                return new Demux2To4(editor, blank ? null : savedData)
            case "demux-2to8":
                return new Demux2To8(editor, blank ? null : savedData)
            case "demux-4to8":
                return new Demux4To8(editor, blank ? null : savedData)
            case "demux-8to16":
                return new Demux8To16(editor, blank ? null : savedData)
            case "latch-sr":
                return new LatchSR(editor, blank ? null : savedData)
            case "flipflop-jk":
                return new FlipflopJK(editor, blank ? null : savedData)
            case "flipflop-t":
                return new FlipflopT(editor, blank ? null : savedData)
            case "flipflop-d":
                return new FlipflopD(editor, blank ? null : savedData)
            case "register":
                return new Register(editor, blank ? null : savedData)
            case "ram-16x4":
                return new RAM16x4(editor, blank ? null : savedData)
            case "ram-16x8":
                return new RAM16x8(editor, blank ? null : savedData)
            case "ram-64x8":
                return new RAM64x8(editor, blank ? null : savedData)
            case "ram-32x12":
                return new RAM32x12(editor, blank ? null : savedData)
            case "counter":
                return new Counter(editor, blank ? null : savedData)
            case "decoder-7seg":
                return new Decoder7Seg(editor, blank ? null : savedData)
            case "decoder-16seg":
                return new Decoder16Seg(editor, blank ? null : savedData)
            case "decoder-bcd4":
                return new DecoderBCD4(editor, blank ? null : savedData)
            case "comparator":
                return new Comparator(editor, blank ? null : savedData)
        }
    },

}
