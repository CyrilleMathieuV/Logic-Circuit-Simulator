import * as t from "io-ts"
import { S } from "../strings"
import { HighImpedance, LogicValue, RichStringEnum, Unknown } from "../utils"

export type GateTypeProps = {
    includeInContextMenu: boolean
    includeInPoseAs: boolean
    fullShortDesc: () => [string, string | undefined, string]
    out: (ins: LogicValue[]) => LogicValue
}

export type GateTypes<TGateType extends string> = RichStringEnum<TGateType, GateTypeProps>


export const Gate1Types = RichStringEnum.withProps<GateTypeProps>()({
    NOT: {
        out: ([in_]) => (in_ === false) ? true : (in_ === true) ? false : Unknown,
        includeInContextMenu: true, includeInPoseAs: true,
        fullShortDesc: () => S.Components.Gate.NOT,
    },
    BUF: {
        out: ([in_]) => (in_ === true) ? true : (in_ === false) ? false : Unknown,
        includeInContextMenu: true, includeInPoseAs: true,
        fullShortDesc: () => S.Components.Gate.BUF,
    },
})
export type Gate1Type = typeof Gate1Types.type
export const Gate1TypeRepr = t.keyof(Gate1Types.props)


export const Gate2toNTypes = RichStringEnum.withProps<GateTypeProps>()({
    AND: {
        out: logicAnd,
        includeInContextMenu: true, includeInPoseAs: true,
        fullShortDesc: () => S.Components.Gate.AND,
    },
    OR: {
        out: logicOr,
        includeInContextMenu: true, includeInPoseAs: true,
        fullShortDesc: () => S.Components.Gate.OR,
    },
    XOR: {
        out: logicXor,
        includeInContextMenu: true, includeInPoseAs: true,
        fullShortDesc: () => S.Components.Gate.XOR,
    },
    NAND: {
        out: ins => LogicValue.invert(logicAnd(ins)),
        includeInContextMenu: true, includeInPoseAs: true,
        fullShortDesc: () => S.Components.Gate.NAND,
    },
    NOR: {
        out: ins => LogicValue.invert(logicOr(ins)),
        includeInContextMenu: true, includeInPoseAs: true,
        fullShortDesc: () => S.Components.Gate.NOR,
    },
    XNOR: {
        out: ins => LogicValue.invert(logicXor(ins)),
        includeInContextMenu: true, includeInPoseAs: true,
        fullShortDesc: () => S.Components.Gate.XNOR,
    },
})
/** Gate types applicable to gates with inputs 2 to N (_not_ all gate 2 inputs) */
export type Gate2toNType = typeof Gate2toNTypes.type
export const Gate2toNTypeRepr = t.keyof(Gate2toNTypes.props)


export const Gate2OnlyTypes = RichStringEnum.withProps<GateTypeProps>()({
    // less common gates
    IMPLY: {
        out: ins => logicImply(ins[0], ins[1]),
        includeInContextMenu: true, includeInPoseAs: true,
        fullShortDesc: () => S.Components.Gate.IMPLY,
    },
    RIMPLY: {
        out: ins => logicImply(ins[1], ins[0]),
        includeInContextMenu: false, includeInPoseAs: true,
        fullShortDesc: () => S.Components.Gate.RIMPLY,
    },
    NIMPLY: {
        out: ins => LogicValue.invert(logicImply(ins[0], ins[1])),
        includeInContextMenu: true, includeInPoseAs: true,
        fullShortDesc: () => S.Components.Gate.NIMPLY,
    },
    RNIMPLY: {
        out: ins => LogicValue.invert(logicImply(ins[1], ins[0])),
        includeInContextMenu: false, includeInPoseAs: true,
        fullShortDesc: () => S.Components.Gate.RNIMPLY,
    },

    // observing only one input
    TXA: {
        out: ins => ins[0],
        includeInContextMenu: true, includeInPoseAs: false,
        fullShortDesc: () => S.Components.Gate.TXA,
    },
    TXB: {
        out: ins => ins[1],
        includeInContextMenu: false, includeInPoseAs: false,
        fullShortDesc: () => S.Components.Gate.TXB,
    },
    TXNA: {
        out: ins => LogicValue.invert(ins[0]),
        includeInContextMenu: false, includeInPoseAs: false,
        fullShortDesc: () => S.Components.Gate.TXNA,
    },
    TXNB: {
        out: ins => LogicValue.invert(ins[1]),
        includeInContextMenu: false, includeInPoseAs: false,
        fullShortDesc: () => S.Components.Gate.TXNB,
    },
})
/** Some special gate types applicable to gates with 2 inputs only (_not_ all gate 2 inputs) */
export type Gate2OnlyType = typeof Gate2OnlyTypes.type
export const Gate2OnlyTypeRepr = t.keyof(Gate2OnlyTypes.props)


/** All gate types applicable to 2 or more inputs (some of them _only_ for 2 inputs) */
export const GateNTypes = RichStringEnum.withProps<GateTypeProps>()({ 
    ...Gate2toNTypes.props,
    ...Gate2OnlyTypes.props,
})

export type GateNType
    = typeof Gate2toNTypes.type
    | typeof Gate2OnlyTypes.type

export const GateNTypeRepr = t.union([
    Gate2toNTypeRepr,
    Gate2OnlyTypeRepr,
])


// Logic functions

function logicAnd(ins: LogicValue[]): LogicValue {
    if (ins.includes(false)) {
        return false
    }
    if (ins.includes(Unknown) || ins.includes(HighImpedance)) {
        return Unknown
    }
    return true
}

function logicOr(ins: LogicValue[]): LogicValue {
    if (ins.includes(true)) {
        return true
    }
    if (ins.includes(Unknown) || ins.includes(HighImpedance)) {
        return Unknown
    }
    return false
}

function logicXor(ins: LogicValue[]): LogicValue {
    let count = 0
    for (const in1 of ins) {
        if (in1 === true) {
            count++
        } else if (in1 === Unknown || in1 === HighImpedance) {
            return Unknown
        }
    }
    return count % 2 === 1
}

function logicImply(in0: LogicValue, in1: LogicValue): LogicValue {
    // A => B is the same as !A || B
    return logicOr([LogicValue.invert(in0), in1])
}
