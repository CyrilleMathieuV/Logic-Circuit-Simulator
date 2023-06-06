import { Add } from "ts-arithmetic"
import { group, InOutRecs, NodeDesc, NodeGroupDesc, NodeRec } from "./components/Component"

//
// Bits and pieces, currently unused attempts that may be useful later
//

// Statically counting the number of nodes in a NodeRec

type Length<T extends readonly any[]> = T["length"]

type NodeCount<T>
    = T extends NodeDesc ? 1
    : T extends NodeGroupDesc<any> ? Length<T>
    : 0

type MappedNodeCountOf<TRec extends NodeRec<any>> = {
    [K in keyof TRec]: NodeCount<TRec[K]>
}

// oh boy don't do this - https://stackoverflow.com/questions/55127004/how-to-transform-union-type-to-tuple-type
type UnionToIntersection<U> =
    (U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I : never
type LastOf<T> =
    UnionToIntersection<T extends any ? () => T : never> extends () => (infer R) ? R : never

type Push<T extends any[], V> = [...T, V]

type TuplifyUnion<T, L = LastOf<T>, N = [T] extends [never] ? true : false> =
    true extends N ? [] : Push<TuplifyUnion<Exclude<T, L>>, L>

type _SumUp<T extends Record<string, number>, Keys, Result extends number = 0> =
    Keys extends [infer First extends keyof T, ...infer Rest]
    ? _SumUp<T, Rest, Add<Result, T[First]>>
    : Result
type SumUp<T extends Record<string, number>> = _SumUp<T, TuplifyUnion<keyof T>>

type CountNodes<TRec extends NodeRec<any>> = SumUp<MappedNodeCountOf<TRec>>

const ALUNodes = {
    ins: {
        A: group("w", [
            [-4, -8],
            [-4, -6],
            [-4, -4],
            [-4, -2],
        ]),
        B: group("w", [
            [-4, 2],
            [-4, 4],
            [-4, 6],
            [-4, 8],
        ]),
        Op: group("n", [
            [2, -10],
            [0, -10],
        ]),
        Cin: [-2, -10, "n"],
    },
    outs: {
        S: group("e", [
            [4, -3],
            [4, -1],
            [4, 1],
            [4, 3],
        ]),
        V: [0, 10, "s"],
        Z: [2, 10, "s"],
        Cout: [-2, 10, "s"],
    },
} satisfies InOutRecs

type __ShouldBeLiteralTypeWithTS5 = CountNodes<typeof ALUNodes["ins"]>
