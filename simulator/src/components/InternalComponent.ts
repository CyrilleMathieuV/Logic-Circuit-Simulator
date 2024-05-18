import * as t from "io-ts"
import type { DefAndParams } from "../ComponentMenu"
import JSON5 from "json5"
import { DrawParams, LogicEditor } from "../LogicEditor"
import { COLOR_BACKGROUND, COLOR_GROUP_SPAN, DrawingRect, GRID_STEP, drawClockInput, drawComponentName, drawLabel, drawWireLineToComponent, isTrivialNodeName, shouldShowNode, useCompact } from "../drawutils"
import { ArrayFillUsing, ArrayOrDirect, EdgeTrigger, Expand, FixedArrayMap, HasField, HighImpedance, InteractionResult, LogicValue, LogicValueRepr, Mode, Unknown, brand, deepEquals, isArray, isBoolean, isNumber, isRecord, isString, mergeWhereDefined, toLogicValueRepr, typeOrUndefined, validateJson } from "../utils"
import {
    InternalCalculableParent,
    InternalCalculable,
    PositionSupportRepr,
    InternalCalculableSaved,
} from "./InternalCalculable"
import { InternalNode, InternalNodeBase, InternalNodeIn, InternalNodeOut } from "./InternalNode"
import {Component} from "./Component";


type InternalNodeSeqRepr<TFullInternalNodeRepr> =
    ArrayOrDirect<number | string | TFullInternalNodeRepr>

export const InternalNodeSeqRepr = <T>(fullInternalNodeRepr: t.Type<T>) =>
    t.union([
        t.number, // just the ID
        t.string, // a range of IDs as string
        fullInternalNodeRepr,
        t.array(t.union([
            t.number,
            t.string,
            fullInternalNodeRepr,
        ])),
    ], "InternalNodeSeqRepr")

export const InputInternalNodeRepr = t.type({
    id: t.number,
}, "InputInternalNode")
export type InputInternalNodeRepr = t.TypeOf<typeof InputInternalNodeRepr>

export const OutputInternalNodeRepr = t.intersection([
    t.type({ id: t.number }),
    t.partial({
        force: LogicValueRepr,
        initialValue: LogicValueRepr,
    })], "OutputInternalNode")
export type OutputInternalNodeRepr = t.TypeOf<typeof OutputInternalNodeRepr>

export const InputInternalNodeSeqRepr = InternalNodeSeqRepr(InputInternalNodeRepr)
type InputInternalNodeSeqRepr = t.TypeOf<typeof InputInternalNodeSeqRepr>

export const OutputInternalNodeSeqRepr = InternalNodeSeqRepr(OutputInternalNodeRepr)
type OutputInternalNodeSeqRepr = t.TypeOf<typeof OutputInternalNodeSeqRepr>

// Defines how the JSON looks like depending on the number of inputs and outputs.
// If only inputs or only outputs, all IDs are put into an "id" field.
// If both inputs and outputs are present, we have separate "in" and "out" fields.

// These are just 3 intermediate types
const OnlyInInternalNodeIds = t.partial({ id: InputInternalNodeSeqRepr })
type OnlyInInternalNodeIds = t.TypeOf<typeof OnlyInInternalNodeIds>

const OnlyOutInternalNodeIds = t.partial({ id: OutputInternalNodeSeqRepr })
type OnlyOutInternalNodeIds = t.TypeOf<typeof OnlyOutInternalNodeIds>

const InAndOutInternalNodeIds = t.partial({
    in: InputInternalNodeSeqRepr,
    out: OutputInternalNodeSeqRepr,
})
type InAndOutInternalNodeIds = t.TypeOf<typeof InAndOutInternalNodeIds>

const NoInternalNodeIds = t.type({})
type NoInternalNodeIds = t.TypeOf<typeof NoInternalNodeIds>


// This is the final conditional type showing what the JSON representation
// will look like depending on number of inputs and outputs
export const InternalNodeIDsRepr = <THasIn extends boolean, THasOut extends boolean>(hasIn: THasIn, hasOut: THasOut)
    : THasIn extends true
    ? (THasOut extends true ? typeof InAndOutInternalNodeIds : typeof OnlyInInternalNodeIds)
    : (THasOut extends true ? typeof OnlyOutInternalNodeIds : typeof NoInternalNodeIds) => (
    hasIn ? (hasOut ? InAndOutInternalNodeIds : OnlyInInternalNodeIds)
        : (hasOut ? OnlyOutInternalNodeIds : NoInternalNodeIds)
) as any

type InternalNodeIDsRepr<THasIn extends boolean, THasOut extends boolean>
    = THasIn extends true
    ? THasOut extends true ? InAndOutInternalNodeIds : OnlyInInternalNodeIds
    : THasOut extends true ? OnlyOutInternalNodeIds : NoInternalNodeIds


/**
 * Base representation of a InternalComponent: position & repr of InternalNodes
 */
export type InternalComponentRepr<THasIn extends boolean, THasOut extends boolean> =
    { type: string } & PositionSupportRepr & InternalNodeIDsRepr<THasIn, THasOut>

export const InternalComponentRepr = <THasIn extends boolean, THasOut extends boolean>(hasIn: THasIn, hasOut: THasOut) =>
    t.intersection([
        t.type({
            type: t.string,
        }),
        PositionSupportRepr,
        InternalNodeIDsRepr(hasIn, hasOut),
    ], "InternalComponent")

export function isInternalNodeArray<TInternalNode extends InternalNode>(obj: undefined | number | InternalNode | ReadonlyGroupedInternalNodeArray<TInternalNode>): obj is ReadonlyGroupedInternalNodeArray<TInternalNode> {
    return isArray(obj)
}

export class InternalNodeGroup<TInternalNode extends InternalNode> {

    private _InternalNodes: GroupedInternalNodeArray<TInternalNode>
    public hasNameOverrides: boolean = false

    public constructor(
        public readonly parent: InternalComponent,
        public readonly name: string,
    ) {
        this._InternalNodes = [] as unknown as GroupedInternalNodeArray<TInternalNode>
        this._InternalNodes.group = this
    }

    public get InternalNodes(): ReadonlyGroupedInternalNodeArray<TInternalNode> {
        return this._InternalNodes
    }

    public addInternalNode(InternalNode: TInternalNode) {
        this._InternalNodes.push(InternalNode)
    }

    // allows the InternalNode type (rather than N for group.InternalNodes.indexOf(...))
    public indexOf(InternalNode: InternalNode): number {
        for (let i = 0; i < this._InternalNodes.length; i++) {
            if (this._InternalNodes[i] === InternalNode) {
                return i
            }
        }
        return -1
    }
}

export enum InternalComponentState {
    SPAWNING, // during placement drag
    SPAWNED,  // regular use
    DEAD,     // after deletion
    INVALID,  // if cannot be updated because of circular dependencies
}

// Simplified, generics-free representation of a InternalComponent
export type InternalComponent = InternalComponentBase<any, any, NamedInternalNodes<InternalNodeIn>, NamedInternalNodes<InternalNodeOut>, any, any>

export type DynamicName = Record<string | number, string>
export function isDynamicName(obj: unknown): obj is DynamicName {
    if (!isRecord(obj)) {
        return false
    }
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key) && typeof obj[key] !== "string") {
            return false
        }
    }
    return true
}
export type InternalComponentName = string | DynamicName | undefined
export const InternalComponentNameRepr = typeOrUndefined(
    t.union([
        t.string,
        t.record(t.union([t.string, t.number]), t.string),
    ])
)

export type InternalNodeOutDesc = readonly [fullName: string]
export type InternalNodeInDesc = readonly [fullName: string]
export type InternalNodeDesc = InternalNodeOutDesc | InternalNodeInDesc
export type InternalNodeDescInGroup = readonly [shortNameOverride: string]
export type InternalNodeGroupDesc<D extends InternalNodeDesc> = ReadonlyArray<D>
export type InternalNodeGroupMultiDesc<D extends InternalNodeDesc> = ReadonlyArray<InternalNodeGroupDesc<D>>
export type InternalNodeRec<D extends InternalNodeDesc> = Record<string, D | InternalNodeGroupDesc<D> | InternalNodeGroupMultiDesc<D>>

function isInternalNodeDesc<D extends InternalNodeDesc>(desc: D | InternalNodeGroupDesc<D> | InternalNodeGroupMultiDesc<D>): desc is D {
    return isNumber(desc[0])
}

type GroupedInternalNodeArray<TInternalNode extends InternalNode> = TInternalNode[] & { group: InternalNodeGroup<TInternalNode> }
export type ReadonlyGroupedInternalNodeArray<TInternalNode extends InternalNode> = readonly TInternalNode[] & { group: InternalNodeGroup<TInternalNode> }

type MapDescToInternalNode<TDesc, TInternalNode extends InternalNode>
    = TDesc extends InternalNodeDesc ? TInternalNode
    : TDesc extends Array<InternalNodeDesc> ? GroupedInternalNodeArray<TInternalNode>
        : TDesc extends Array<Array<InternalNodeDesc>> ? GroupedInternalNodeArray<TInternalNode>[]
            : never

type MapRecToInternalNodes<TRec, TInternalNode extends InternalNode> = {
    [K in keyof TRec]: MapDescToInternalNode<TRec[K], TInternalNode>
}


// Named InternalNodes according to the InternalNode description always have
// an '_all' array of all InternalNodes in addition to the names
type NamedInternalNodes<TInternalNode> = { _all: readonly TInternalNode[] }

type ExtractInternalNodes<TRepr, TField extends "ins" | "outs", TInternalNode extends InternalNode> = Expand<
    (TRepr extends { _META?: { InternalNodeRecs: { [K in TField]: infer TInternalNodeRec } } }
        ? MapRecToInternalNodes<TInternalNodeRec, TInternalNode> : { _empty: true })
    & NamedInternalNodes<TInternalNode>>

export type InternalNodesIn<TRepr> = ExtractInternalNodes<TRepr, "ins", InternalNodeIn>
export type InternalNodesOut<TRepr> = ExtractInternalNodes<TRepr, "outs", InternalNodeOut>

export type IsNonEmpty<TNamedInternalNodes> = TNamedInternalNodes extends { _empty: true } ? false : true

export type ExtractValue<TRepr> = TRepr extends { _META?: { value: infer TValue } } ? TValue : never

export type ExtractParams<TRepr> = TRepr extends { _META?: { params: infer TParams } } ? TParams : {}

export type ExtractParamDefs<TRepr> = TRepr extends { _META?: { paramDefs: infer TParamDefs extends Record<string, ParamDef<unknown>> } } ? TParamDefs : Record<string, ParamDef<unknown>>



export type InOutRecs = {
    ins?: InternalNodeRec<InternalNodeInDesc>
    outs?: InternalNodeRec<InternalNodeOutDesc>
}



//
// Base class for all InternalComponents
//

export abstract class InternalComponentBase<
    TRepr extends InternalComponentRepr<THasIn, THasOut>, // JSON representation
    TValue = ExtractValue<TRepr>, // internal value recomputed when inputs change
    TInputInternalNodes extends NamedInternalNodes<InternalNodeIn> = InternalNodesIn<TRepr>,
    TOutputInternalNodes extends NamedInternalNodes<InternalNodeOut> = InternalNodesOut<TRepr>,
    THasIn extends boolean = IsNonEmpty<TInputInternalNodes>,
    THasOut extends boolean = IsNonEmpty<TOutputInternalNodes>, // in-out InternalNode presence
> extends InternalCalculableSaved {

    public readonly def: InstantiatedInternalComponentDef<TRepr, TValue>
    private _state!: InternalComponentState
    private _value: TValue
    public readonly inputs: TInputInternalNodes
    public readonly outputs: TOutputInternalNodes
    public readonly inputGroups: Map<string, InternalNodeGroup<InternalNodeIn>>
    public readonly outputGroups: Map<string, InternalNodeGroup<InternalNodeOut>>

    protected constructor(
        parent: InternalCalculableParent,
        def: InstantiatedInternalComponentDef<TRepr, TValue>,
        saved: TRepr | undefined
    ) {
        super(parent, saved)

        this.def = def
        this._value = def.initialValue(saved)

        const ins = def.InternalNodeRecs.ins
        const outs = def.InternalNodeRecs.outs

        function countInternalNodes(rec: InternalNodeRec<InternalNodeDesc> | undefined) {
            if (rec === undefined) {
                return 0
            }
            let count = 0
            for (const desc of Object.values(rec)) {
                if (isInternalNodeDesc(desc)) {
                    count++
                } else {
                    for (const innerDesc of desc) {
                        if (isInternalNodeDesc(innerDesc)) {
                            count++
                        } else {
                            count += innerDesc.length
                        }
                    }
                }
            }
            return count
        }

        const numInputs = countInternalNodes(ins)
        const numOutputs = countInternalNodes(outs)

        if (saved !== undefined) {
            // restoring
            this._state = InternalComponentState.SPAWNED
        } else {
            // newly placed
            this.setSpawning()
        }

        // build InternalNode specs either from scratch if new or from saved data
        const [inputSpecs, outputSpecs, hasAnyPrecomputedInitialValues] =
            this.InternalNodeSpecsFromRepr(saved, numInputs, numOutputs);

        // so, hasAnyPrecomputedInitialValues is true if ANY of the outputs was built
        // with "initialValue" in the JSON. This is used to stabilize circuits (such as
        // an SR latch) that would otherwise oscillate. But this also means that NO OTHER
        // OUTPUT from this InternalComponent would be recomputed (even if they are always
        // propagated). So, it is a good idea to either set no initial values at all, or
        // to set all of them.

        // generate the input and output InternalNodes
        [this.inputs, this.inputGroups] = this.makeInternalNodes(ins, inputSpecs, InternalNodeIn) as [TInputInternalNodes, Map<string, InternalNodeGroup<InternalNodeIn>>];
        [this.outputs, this.outputGroups] = this.makeInternalNodes(outs, outputSpecs, InternalNodeOut) as [TOutputInternalNodes, Map<string, InternalNodeGroup<InternalNodeOut>>]

        // setNeedsInternalRecalc with a force propadation is needed:
        // * the forced propagation allows the current value (e.g. for InputBits)
        //   to be set to the outputs, if the "new" value is the same as the current one
        // * setNeedsInternalRecalc schedules a recalculation (e.g. for Gates)
        if (!hasAnyPrecomputedInitialValues) {
            this.setNeedsRecalc(true)
        } else {
            this.setNeedsPropagate()
        }
    }

    public setSpawning() {
        this._state = InternalComponentState.SPAWNING
    }

    public setSpawned() {
        this._state = InternalComponentState.SPAWNED
    }

    public setInvalid() {
        this._state = InternalComponentState.INVALID
    }

    public abstract toJSON(): TRepr

    /**
     * Returns the JSON representation of this InternalComponent, but without InternalNodes
     * and without the id. This is useful to clone a InternalComponent. InternalNodes and ids
     * can then be restored on the clone.
     */
    protected toInternalNodelessJSON(): TRepr {
        // useful to clone a InternalComponent without its InternalNode numbers,
        // which will be reobtained when the new InternalComponent is created
        const repr = this.toJSON()
        delete repr.ref
        delete (repr as InternalComponentRepr<true, true>).in
        delete (repr as InternalComponentRepr<true, true>).out
        delete (repr as InternalComponentRepr<true, false>).id
        return repr
    }

    /**
     * Returns the JSON representation of the fields this superclass knows
     * about. Typically used by subclasses to provide only their specific JSON,
     * splatting in the result of super.toJSONBase() in the object.
     */
    protected override toJSONBase(): InternalComponentRepr<THasIn, THasOut> {
        const typeHolder = {
            // not sure why we need a separate object to splat in just
            // a few lines below, but this makes the compiler happy
            type: this.jsonType(),
        }
        return {
            ...typeHolder,
            ...super.toJSONBase(),
            ...this.buildInternalNodesRepr(),
        }
    }

    protected jsonType(): string {
        return this.def.type
    }

    // creates the input/output InternalNodes based on array of offsets (provided
    // by subclass) and spec (either loaded from JSON repr or newly generated)
    private makeInternalNodes<TInternalNode extends InternalNode, TDesc extends (TInternalNode extends InternalNodeIn ? InternalNodeInDesc : InternalNodeOutDesc)>(
        InternalNodeRec: InternalNodeRec<TDesc> | undefined,
        specs: readonly (InputInternalNodeRepr | OutputInternalNodeRepr)[],
        InternalNode: new (
            parent: InternalComponent,
            InternalNodeSpec: InputInternalNodeRepr | OutputInternalNodeRepr,
            group: InternalNodeGroup<TInternalNode> | undefined,
            shortName: string,
            fullName: string,
        ) => TInternalNode) {

        const InternalNodes: Record<string, TInternalNode | ReadonlyArray<TInternalNode> | ReadonlyArray<ReadonlyArray<TInternalNode>>> = {}
        const allInternalNodes: TInternalNode[] = []
        const InternalNodeGroups: Map<string, InternalNodeGroup<TInternalNode>> = new Map()
// TO DO
/*
        if (InternalNodeRec !== undefined) {
            const makeInternalNode = (group: InternalNodeGroup<TInternalNode> | undefined, shortName: string, desc: TDesc) => {
                const spec = specs[nextSpecIndex++]
                const options = options_ as InternalNodeInDesc[0] // bleh
                if (group !== undefined && nameOverride !== undefined) {
                    // names in groups are considered short names to be used as labels
                    shortName = nameOverride
                    group.hasNameOverrides = true
                } else if (options?.labelName !== undefined) {
                    shortName = options.labelName
                }
                const fullName = nameOverride === undefined ? shortName : nameOverride
                const newInternalNode = new InternalNode(
                    this,
                    spec,
                    group,
                    shortName,
                    fullName,
                )
                allInternalNodes.push(newInternalNode)
                return newInternalNode
            }
            let nextSpecIndex = 0
            for (const [fieldName, desc] of Object.entries(InternalNodeRec)) {
                if (isInternalNodeDesc(desc)) {
                    // single
                    InternalNodes[fieldName] = makeInternalNode(undefined, fieldName, desc)
                } else {
                    // group
                    const makeInternalNodesForGroup = (groupDesc: InternalNodeGroupDesc<TDesc>) => {
                        const group = new InternalNodeGroup<TInternalNode>(this, fieldName)
                        InternalNodeGroups.set(fieldName, group)
                        for (let i = 0; i < groupDesc.length; i++) {
                            group.addInternalNode(makeInternalNode(group, `${fieldName}${i}`, groupDesc[i]))
                        }
                        return group.InternalNodes
                    }

                    if (isInternalNodeDesc(desc[0])) {
                        // normal group
                        const groupDesc = desc as InternalNodeGroupDesc<TDesc>
                        InternalNodes[fieldName] = makeInternalNodesForGroup(groupDesc)
                    } else {
                        // nested group
                        const groupMultiDesc = desc as InternalNodeGroupMultiDesc<TDesc>
                        InternalNodes[fieldName] = groupMultiDesc.map(makeInternalNodesForGroup)
                    }
                }
            }
        }
*/
        InternalNodes._all = allInternalNodes
        return [InternalNodes, InternalNodeGroups]
    }

    // generates two arrays of normalized InternalNode specs either as loaded from
    // JSON or obtained with default values when _repr is null and we're
    // creating a new InternalComponent from scratch
    private InternalNodeSpecsFromRepr(_repr: InternalNodeIDsRepr<THasIn, THasOut> | undefined, numInputs: number, numOutputs: number): [
        inputSpecs: Array<InputInternalNodeRepr>,
        outputSpecs: Array<OutputInternalNodeRepr>,
        hasAnyPrecomputedInitialValues: boolean
    ] {
        const internalNodeMgr = this.parent.internalNodeMgr
        const makeDefaultSpec = () => ({ id: internalNodeMgr.getFreeId() })
        const makeDefaultSpecArray = (len: number) => ArrayFillUsing(makeDefaultSpec, len)

        if (_repr === undefined) {
            return [
                makeDefaultSpecArray(numInputs),
                makeDefaultSpecArray(numOutputs),
                false,
            ]
        }

        let inputSpecs: InputInternalNodeRepr[] = []
        let outputSpecs: OutputInternalNodeRepr[] = []

        const makeNormalizedSpecs = <TInternalNodeRepr extends InputInternalNodeRepr | OutputInternalNodeRepr>(
            num: number,
            seqRepr?: ArrayOrDirect<string | number | TInternalNodeRepr>,
        ) => {
            if (seqRepr === undefined) {
                return makeDefaultSpecArray(num)
            }

            const specs: Array<TInternalNodeRepr> = []
            function pushId(sourceId: number) {
                const id = internalNodeMgr.getFreeIdFrom(sourceId)
                specs.push({ id } as TInternalNodeRepr)
            }

            for (const spec of (isArray(seqRepr) ? seqRepr : [seqRepr])) {
                if (isNumber(spec)) {
                    pushId(spec)
                } else if (isString(spec)) {
                    const [start, end] = spec.split('-').map(s => parseInt(s))
                    for (let i = start; i <= end; i++) {
                        pushId(i)
                    }
                } else {
                    spec.id = internalNodeMgr.getFreeIdFrom(spec.id)
                    specs.push(spec)
                }
            }
            return specs
        }

        // manually distinguishing the cases where we have no inputs or no
        // outputs as we then have a more compact JSON representation
        if (numInputs !== 0) {
            if (numOutputs !== 0) {
                const repr = _repr as InAndOutInternalNodeIds
                inputSpecs = makeNormalizedSpecs(numInputs, repr.in)
                outputSpecs = makeNormalizedSpecs(numOutputs, repr.out)
            } else {
                const repr = _repr as OnlyInInternalNodeIds
                inputSpecs = makeNormalizedSpecs(numInputs, repr.id)
            }
        } else if (numOutputs !== 0) {
            const repr = _repr as OnlyOutInternalNodeIds
            outputSpecs = makeNormalizedSpecs(numOutputs, repr.id)
        }

        const hasAnyPrecomputedInitialValues =
            outputSpecs.some(spec => spec.initialValue !== undefined)

        return [inputSpecs, outputSpecs, hasAnyPrecomputedInitialValues]
    }

    // from the known InternalNodes, builds the JSON representation of them,
    // using the most compact form available
    private buildInternalNodesRepr(): InternalNodeIDsRepr<THasIn, THasOut> {
        const numInputs = this.inputs._all.length
        const numOutputs = this.outputs._all.length

        // these two functions return either an array of JSON
        // representations, or just the element skipping the array
        // if there is only one
        function inInternalNodeReprs(InternalNodes: readonly InternalNode[]): ArrayOrDirect<number | string> {
            const reprOne = (InternalNode: InternalNode) => InternalNode.id
            if (InternalNodes.length === 1) {
                return reprOne(InternalNodes[0])
            } else {
                return compactRepr(InternalNodes.map(reprOne))
            }
        }
        function outInternalNodeReprs(InternalNodes: readonly InternalNode[]): ArrayOrDirect<number | string | OutputInternalNodeRepr> {
            const reprOne = (InternalNode: InternalNode) => {
                const valueNotForced = InternalNode.forceValue === undefined
                const noInitialValue = InternalNode.initialValue === undefined
                if (valueNotForced && noInitialValue) {
                    return InternalNode.id
                } else {
                    return {
                        id: InternalNode.id,
                        intialValue: noInitialValue ? undefined : toLogicValueRepr(InternalNode.initialValue),
                        force: valueNotForced ? undefined : toLogicValueRepr(InternalNode.forceValue),
                    }
                }
            }
            if (InternalNodes.length === 1) {
                return reprOne(InternalNodes[0])
            } else {
                return compactRepr(InternalNodes.map(reprOne))
            }
        }

        function compactRepr<TFullInternalNodeRepr>(reprs: Array<number | TFullInternalNodeRepr>): ArrayOrDirect<number | string | TFullInternalNodeRepr> {
            // collapses consecutive numbers intro a string of the form "start-end" to save JSON space
            const newArray: Array<number | string | TFullInternalNodeRepr> = []
            let currentRangeStart: number | undefined = undefined
            let currentRangeEnd: number | undefined = undefined
            function pushRange() {
                if (currentRangeStart !== undefined && currentRangeEnd !== undefined) {
                    if (currentRangeStart === currentRangeEnd) {
                        newArray.push(currentRangeStart)
                    } else if (currentRangeEnd === currentRangeStart + 1) {
                        newArray.push(currentRangeStart)
                        newArray.push(currentRangeEnd)
                    } else {
                        newArray.push(`${currentRangeStart}-${currentRangeEnd}`)
                    }
                    currentRangeStart = undefined
                    currentRangeEnd = undefined
                }
            }
            for (const repr of reprs) {
                if (isNumber(repr)) {
                    if (currentRangeStart !== undefined && repr - 1 === currentRangeEnd) {
                        currentRangeEnd = repr
                    } else {
                        pushRange()
                        currentRangeStart = currentRangeEnd = repr
                    }
                } else {
                    pushRange()
                    newArray.push(repr)
                }
            }
            pushRange()

            if (newArray.length === 1) {
                return newArray[0]
            }
            return newArray
        }

        return (
            numInputs !== 0
                ? numOutputs !== 0
                    ? { in: inInternalNodeReprs(this.inputs._all), out: outInternalNodeReprs(this.outputs._all) }
                    : { id: inInternalNodeReprs(this.inputs._all) }
                : numOutputs !== 0
                    ? { id: outInternalNodeReprs(this.outputs._all) }
                    : {}
        ) as InternalNodeIDsRepr<THasIn, THasOut>
    }

    protected override toStringDetails(): string {
        const maybeName = (this as any)._name
        const name = maybeName !== undefined ? `name='${maybeName}', ` : ''
        return name + String(this.value)
    }

    public get state() {
        return this._state
    }

    public get allowsForcedOutputs() {
        return true
    }

    public get alwaysDrawMultiOutInternalNodes() {
        return false
    }

    public *allInternalNodes() {
        for (const InternalNode of this.inputs._all) {
            yield InternalNode
        }
        for (const InternalNode of this.outputs._all) {
            yield InternalNode
        }
    }

    public *allInternalNodeGroups() {
        for (const group of this.inputGroups.values()) {
            yield group
        }
        for (const group of this.outputGroups.values()) {
            yield group
        }
    }

    public get value(): TValue {
        return this._value
    }

    protected doSetValue(newValue: TValue, forcePropagate = false) {
        const oldValue = this._value
        if (forcePropagate || !deepEquals(newValue, oldValue)) {
            this._value = newValue
            this.setNeedsRedraw("value changed")
            this.setNeedsPropagate()
        }
    }

    public recalcValue(forcePropagate: boolean) {
        this.doSetValue(this.doRecalcValue(), forcePropagate)
    }

    protected abstract doRecalcValue(): TValue

    public propagateCurrentValue() {
        this.propagateValue(this._value)
    }

    protected propagateValue(__newValue: TValue) {
        // by default, do nothing
    }

    protected inputValues(InternalNodes: readonly InternalNodeIn[]): LogicValue[] {
        return InternalNodes.map(InternalNode => InternalNode.value)
    }

    protected setInputValues(InternalNodes: readonly InternalNodeIn[], values: LogicValue[], reverse = false) {
        const num = InternalNodes.length
        if (values.length !== num) {
            throw new Error(`inputValues: expected ${num} values, got ${values.length}`)
        }
        for (let i = 0; i < num; i++) {
            const j = reverse ? num - i - 1 : i
            InternalNodes[i].value = values[j]
        }
    }

    protected getOutputValues(InternalNodes: readonly InternalNodeOut[]): LogicValue[] {
        return InternalNodes.map(InternalNode => InternalNode.value)
    }

    protected outputValues(InternalNodes: readonly InternalNodeOut[], values: LogicValue[], reverse = false) {
        const num = InternalNodes.length
        if (values.length !== num) {
            throw new Error(`outputValues: expected ${num} values, got ${values.length}`)
        }
        for (let i = 0; i < num; i++) {
            const j = reverse ? num - i - 1 : i
            InternalNodes[i].value = values[j]
        }
    }

    public setNeedsRecalc(forcePropagate = false) {
        this.parent.recalcMgr.enqueueForRecalc(this, forcePropagate)
    }

    private setNeedsPropagate() {
        this.parent.recalcMgr.enqueueForPropagate(this)
    }

    protected replaceWithInternalComponent(newComp: InternalComponent): InternalComponent {
        // any InternalComponent will work, but only inputs and outputs with
        // the same names will be reconnected and others will be lost

        const saveInternalWires = <TInternalNode extends InternalNodeBase<any>, TInternalWires>(InternalNodes: readonly TInternalNode[], getInternalWires: (InternalNode: TInternalNode) => null | TInternalWires): Map<string, TInternalWires> => {
            const savedInternalWires: Map<string, TInternalWires> = new Map()
            for (const InternalNode of InternalNodes) {
                const group = InternalNode.group
                const InternalWires = getInternalWires(InternalNode)
                if (InternalWires === null) {
                    continue
                }
                const keyName = group === undefined ? InternalNode.shortName : `${group.name}[${group.InternalNodes.indexOf(InternalNode)}]`
                savedInternalWires.set(keyName, InternalWires)
            }
            return savedInternalWires
        }

        const savedInternalWiresIn = saveInternalWires(this.inputs._all, InternalNode => InternalNode.incomingInternalWire)
        const savedInternalWiresOut = saveInternalWires(this.outputs._all, InternalNode => InternalNode.outgoingInternalWires)

        const restoreInternalNodes = <TInternalNode extends InternalNodeBase<any>, TInternalWires>(savedInternalWires: Map<string, TInternalWires>, InternalNodes: readonly TInternalNode[], setInternalWires: (InternalWires: TInternalWires, InternalNode: TInternalNode) => void) => {
            for (const InternalNode of InternalNodes) {
                const group = InternalNode.group
                if (group === undefined) {
                    // single InternalNode
                    let InternalWires = savedInternalWires.get(InternalNode.shortName)
                    if (InternalWires === undefined) {
                        // try to restore from array version
                        InternalWires = savedInternalWires.get(InternalNode.shortName + "[0]")
                    }
                    if (InternalWires !== undefined) {
                        setInternalWires(InternalWires, InternalNode)
                    }
                } else {
                    // InternalNode group
                    const i = group.InternalNodes.indexOf(InternalNode)
                    let InternalWires = savedInternalWires.get(`${group.name}[${i}]`)
                    if (InternalWires === undefined && i === 0) {
                        // try to restore from single version
                        InternalWires = savedInternalWires.get(group.name)
                    }
                    if (InternalWires !== undefined) {
                        setInternalWires(InternalWires, InternalNode)
                    }
                }
            }
        }

        restoreInternalNodes(savedInternalWiresIn, newComp.inputs._all, (InternalWire, InternalNode) => {
            InternalWire.setEndInternalNode(InternalNode)
        })

        const now = this.parent.editor.timeline.logicalTime()
        restoreInternalNodes(savedInternalWiresOut, newComp.outputs._all, (InternalWires, InternalNode) => {
            for (const InternalWire of [...InternalWires]) {
                InternalWire.setStartInternalNode(InternalNode, now)
            }
        })

        // do this after restoring InternalWires, otherwise InternalWires are deleted
        const InternalComponentList = this.parent.internalComponents
        const deleted = InternalComponentList.tryDelete(this)
        if (!deleted) {
            console.warn("Could not delete old InternalComponent")
        }

        // restore InternalComponent properties
        if (this.ref !== undefined) {
            InternalComponentList.changeIdOf(newComp, this.ref)
        }
        newComp.setSpawned()

        return newComp
    }

    protected autoConnected(__newLinks: [InternalNode, InternalComponent, InternalNode][]) {
        // by default, do nothing
    }
}


export abstract class ParametrizedInternalComponentBase<
    TRepr extends InternalComponentRepr<THasIn, THasOut>, // JSON representation
    TValue = ExtractValue<TRepr>, // internal value recomputed when inputs change
    TParamDefs extends ExtractParamDefs<TRepr> = ExtractParamDefs<TRepr>,
    TParams extends ExtractParams<TRepr> = ExtractParams<TRepr>,
    TInputInternalNodes extends NamedInternalNodes<InternalNodeIn> = InternalNodesIn<TRepr>,
    TOutputInternalNodes extends NamedInternalNodes<InternalNodeOut> = InternalNodesOut<TRepr>,
    THasIn extends boolean = IsNonEmpty<TInputInternalNodes>,
    THasOut extends boolean = IsNonEmpty<TOutputInternalNodes>,// in-out InternalNode presence
> extends InternalComponentBase<
    TRepr,
    TValue,
    TInputInternalNodes,
    TOutputInternalNodes,
    THasIn,
    THasOut
> {

    private readonly _defP: SomeParamCompDef<TParamDefs>

    protected constructor(
        parent: InternalCalculableParent,
        [instance, def]: [
            InstantiatedInternalComponentDef<TRepr, TValue>,
            SomeParamCompDef<TParamDefs>,
        ],
        saved: TRepr | undefined
    ) {
        super(parent, instance, saved)
        this._defP = def
    }

    protected replaceWithNewParams(newParams: Partial<TParams>): InternalComponent | undefined {
        const currentRepr = this.toInternalNodelessJSON()
        const newRepr = { ...currentRepr, ...newParams }

        const newComp = this._defP.makeFromJSON(this.parent, newRepr)
        if (newComp === undefined) {
            console.warn("Could not create InternalComponent variant")
            return undefined
        }

        return this.replaceWithInternalComponent(newComp)
    }

    private tryChangeParam(paramIndex: number, increase: boolean): void {
        const params = Object.keys(this._defP.defaultParams)
        const numParams = params.length
        if (paramIndex >= numParams) {
            return
        }
        const paramName = params[paramIndex]
        let currentParamValue = (this.toJSON() as any)[paramName]
        const paramDef = this._defP.paramDefs[paramName]
        if (currentParamValue === undefined) {
            currentParamValue = paramDef.defaultValue
        }

        let newParamValue: number | boolean | undefined
        if (isNumber(currentParamValue)) {
            newParamValue = (paramDef as ParamDef<number>).nextValue(currentParamValue, increase)
            if (newParamValue === undefined || newParamValue === currentParamValue) {
                return
            }
        } else if (isBoolean(currentParamValue)) {
            newParamValue = !currentParamValue
        }
        if (newParamValue === undefined) {
            return
        }

        const newComp = this.replaceWithNewParams({ [paramName]: newParamValue } as Partial<TParams>)
        if (newComp !== undefined) {
        }
    }

}



//
// InternalNode definition helpers
//

export function group<const TDescArr extends readonly InternalNodeDescInGroup[]>(InternalNodes: TDescArr) {
    return FixedArrayMap(InternalNodes, ([name]) => [name] as const)
}
/*
export function groupInternal(num: number) {
    return group("e",
        ArrayFillUsing(i => num, [0, i])
    )
}
*/
//
// Repr and friends
//

/** Represents the JSON object holding properties from the passed InternalComponent def */
export type Repr<TDef>
// case: Parameterized InternalComponent def
    = TDef extends ParametrizedInternalComponentDef<infer THasIn, infer THasOut, infer TProps, infer TParamDefs, infer TInOutRecs, infer TValue, infer __TValueDefaults, infer TParams, infer __TResolvedParams, infer __TWeakRepr>
    ? t.TypeOf<t.TypeC<TProps>> & InternalComponentRepr<THasIn, THasOut> & {
    _META?: {
        InternalNodeRecs: TInOutRecs,
        value: TValue,
        paramDefs: TParamDefs,
        params: TParams,
    }
}
    // case: Unparameterized InternalComponent def
    : TDef extends InternalComponentDef<infer TInOutRecs, infer TValue, infer __TValueDefaults, infer TProps, infer THasIn, infer THasOut, infer __TWeakRepr>
        ? t.TypeOf<t.TypeC<TProps>> & InternalComponentRepr<THasIn, THasOut> & {
        _META?: {
            InternalNodeRecs: TInOutRecs,
            value: TValue,
            paramDefs: {},
            params: {},
        }
    }
        // case: Abstract parameterized InternalComponent def
        : TDef extends {
                repr: infer TProps extends t.Props,
                params: infer TParamDefs extends Record<string, ParamDef<unknown>>,
                makeInternalNodes: (...args: any) => infer TInOutRecs,
                initialValue?: (...args: any) => infer TValue,
            }
            ? Expand<t.TypeOf<t.TypeC<TProps>> & InternalComponentRepr<true, true> & {
                _META?: {
                    InternalNodeRecs: TInOutRecs,
                    value: TValue,
                    paramDefs: TParamDefs,
                    params: ParamsFromDefs<TParamDefs>,
                }
            }>
            // case: Abstract InternalComponent def
            : TDef extends {
                    repr: infer TProps extends t.Props,
                    makeInternalNodes: (...args: any) => infer TInOutRecs,
                    initialValue?: (...args: any) => infer TValue,
                }
                ? Expand<t.TypeOf<t.TypeC<TProps>> & InternalComponentRepr<true, true> & {
                    _META?: {
                        InternalNodeRecs: TInOutRecs,
                        value: TValue,
                        paramDefs: {},
                        params: {},
                    }
                }>
                : never

export type Value<TDef>
    = TDef extends ParametrizedInternalComponentDef<infer __THasIn, infer __THasOut, infer __TProps, infer __TParamDefs, infer __TInOutRecs, infer TValue, infer __TValueDefaults, infer __TParams, infer __TResolvedParams, infer __TWeakRepr>
    ? TValue : never


function makeInternalComponentRepr<
    TProps extends t.Props,
    THasIn extends boolean,
    THasOut extends boolean,
>(type: string, hasIn: THasIn, hasOut: THasOut, props: TProps) {
    return t.intersection([t.type({
        type: t.string,
        ...props,
    }), InternalComponentRepr(hasIn, hasOut)], type)
}



//
// InternalComponentDef and friends
//


export type InstantiatedInternalComponentDef<
    TRepr extends t.TypeOf<t.Mixed>,
    TValue,
> = {
    type: string,
    idPrefix: string | ((self: any) => string),
    InternalNodeRecs: InOutRecs,
    initialValue: (saved: TRepr | undefined) => TValue,
    makeFromJSON: (parent: InternalCalculableParent, data: Record<string, unknown>) => InternalComponent | undefined,
}

export class InternalComponentDef<
    TInOutRecs extends InOutRecs,
    TValue,
    TValueDefaults extends Record<string, unknown> = Record<string, unknown>,
    TProps extends t.Props = {},
    THasIn extends boolean = HasField<TInOutRecs, "ins">,
    THasOut extends boolean = HasField<TInOutRecs, "outs">,
    TRepr extends ReprWith<THasIn, THasOut, TProps> = ReprWith<THasIn, THasOut, TProps>,
> implements InstantiatedInternalComponentDef<TRepr, TValue> {

    public readonly InternalNodeRecs: TInOutRecs
    public readonly repr: t.Decoder<Record<string, unknown>, TRepr>

    public impl: (new (parent: InternalCalculableParent, saved?: TRepr) => InternalComponent) = undefined as any

    public constructor(
        public readonly type: string,
        public readonly idPrefix: string,
        public readonly aults: TValueDefaults,
        private readonly _initialValue: (saved: t.TypeOf<t.TypeC<TProps>> | undefined, defaults: TValueDefaults) => TValue,
        makeInternalNodes: (defaults: TValueDefaults) => TInOutRecs,
        repr?: TProps,
    ) {
        const InternalNodes = makeInternalNodes(aults)
        this.InternalNodeRecs = InternalNodes

        const hasIn = ("ins" in InternalNodes) as THasIn
        const hasOut = ("outs" in InternalNodes) as THasOut
        this.repr = makeInternalComponentRepr(type, hasIn, hasOut, repr ?? ({} as TProps)) as any
    }

    public isValid() {
        return this.impl !== undefined
    }

    public initialValue(saved?: TRepr): TValue {
        return this._initialValue(saved, this.aults)
    }

    public make<TInternalComp extends InternalComponent>(parent: InternalCalculableParent): TInternalComp {
        const comp = new this.impl(parent)
        parent.internalComponents.add(comp)
        return comp as TInternalComp
    }

    public makeFromJSON(parent: InternalCalculableParent, data: Record<string, unknown>): InternalComponent | undefined {
        const validated = validateJson(data, this.repr, this.impl!.name ?? "InternalComponent")
        if (validated === undefined) {
            return undefined
        }
        const comp = new this.impl(parent, validated)
        parent.internalComponents.add(comp)
        return comp
    }
}


export function defineInternalComponent<
    TInOutRecs extends InOutRecs,
    TValue,
    TValueDefaults extends Record<string, unknown> = Record<string, unknown>,
    TProps extends t.Props = {},
>(
    type: string,
    { idPrefix, repr, valueDefaults, makeInternalNodes, initialValue }: {
        idPrefix: string,
        repr?: TProps,
        valueDefaults: TValueDefaults,
        makeInternalNodes: ( defaults: TValueDefaults) => TInOutRecs,
        initialValue?: (saved: t.TypeOf<t.TypeC<TProps>> | undefined, defaults: TValueDefaults) => TValue
    }
) {
    return new InternalComponentDef(type, idPrefix, valueDefaults, initialValue ?? (() => undefined as TValue), makeInternalNodes, repr)
}



export function defineAbstractInternalComponent<
    TProps extends t.Props,
    TValueDefaults extends Record<string, unknown>,
    TArgs extends any[],
    TInOutRecs extends InOutRecs,
    TValue,
    TRepr extends t.TypeOf<t.TypeC<TProps>> = t.TypeOf<t.TypeC<TProps>>,
>(
    items: {
        button: { imgWidth: number },
        repr: TProps,
        valueDefaults: TValueDefaults,
        makeInternalNodes: (...args: TArgs) => TInOutRecs,
        initialValue: (saved: TRepr | undefined, defaults: TValueDefaults) => TValue
    },
) {
    return {
        ...items,
        aults: items.valueDefaults,
    }
}



//
// ParameterizedInternalComponentDef and friends
//

export type SomeParamCompDef<TParamDefs extends Record<string, ParamDef<unknown>>> = ParametrizedInternalComponentDef<boolean, boolean, t.Props, TParamDefs, InOutRecs, unknown, any, ParamsFromDefs<TParamDefs>, any, any>

export class ParamDef<T> {

    public constructor(
        public readonly defaultValue: T,
        public readonly range: readonly T[],
        public readonly isAllowed: (val: unknown) => boolean,
    ) { }

    public validate(n: T, context: string) {
        if (this.isAllowed(n)) {
            return n
        } else {
            console.warn(`Using default value ${this.defaultValue} for ${context} instead of invalid value ${n}; allowed values are: ${this.range.join(", ")}`)
            return this.defaultValue
        }
    }

    public nextValue(value: T, increase: boolean): T | undefined {
        const i = this.range.indexOf(value)
        if (i === -1) {
            return this.defaultValue
        }
        const j = i + (increase ? 1 : -1)
        if (j < 0 || j >= this.range.length) {
            return undefined
        }
        return this.range[j]
    }

}

export function param<T>(defaultValue: T, range?: readonly T[]): ParamDef<T> {
    if (range === undefined) {
        return new ParamDef(defaultValue, [], () => true)
    }
    return new ParamDef(defaultValue, range, val => range.includes(val as T))
}

export function paramBool(): ParamDef<boolean> {
    return new ParamDef(false, [false, true], isBoolean)
}

export type ParamsFromDefs<TDefs extends Record<string, ParamDef<unknown>>> = {
    [K in keyof TDefs]: TDefs[K] extends ParamDef<infer T> ? T : never
}

function paramDefaults<TParamDefs extends Record<string, ParamDef<unknown>>>(defs: TParamDefs): ParamsFromDefs<TParamDefs> {
    return Object.fromEntries(Object.entries(defs).map(([k, v]) => [k, v.defaultValue])) as any
}

export class ParametrizedInternalComponentDef<
    THasIn extends boolean,
    THasOut extends boolean,
    TProps extends t.Props,
    TParamDefs extends Record<string, ParamDef<unknown>>,
    TInOutRecs extends InOutRecs,
    TValue,
    TValueDefaults extends Record<string, unknown> = Record<string, unknown>,
    TParams extends ParamsFromDefs<TParamDefs> = ParamsFromDefs<TParamDefs>,
    TResolvedParams extends Record<string, unknown> = TParams,
    TRepr extends ReprWith<THasIn, THasOut, TProps> = ReprWith<THasIn, THasOut, TProps>,
> {

    public readonly defaultParams: TParams
    public readonly aults: TValueDefaults & TParams
    public readonly repr: t.Decoder<Record<string, unknown>, TRepr>

    public impl: (new (parent: InternalCalculableParent, params: TResolvedParams, saved?: TRepr) => InternalComponent & TResolvedParams) = undefined as any

    public constructor(
        public readonly type: string,
        public readonly idPrefix: string | ((params: TResolvedParams) => string),
        hasIn: THasIn,
        hasOut: THasOut,
        public readonly variantName: (params: TParams) => string | string[],
        repr: TProps,
        valueDefaults: TValueDefaults,
        public readonly paramDefs: TParamDefs,
        private readonly _makeInternalNodes: (params: TResolvedParams, valueDefaults: TValueDefaults) => TInOutRecs,
        private readonly _initialValue: (saved: TRepr | undefined, params: TResolvedParams) => TValue,
        private readonly _validateParams: (params: TParams, jsonType: string | undefined, defaults: TParamDefs) => TResolvedParams,
    ) {
        this.defaultParams = paramDefaults(paramDefs) as TParams
        this.aults = { ...valueDefaults, ...this.defaultParams }
        this.repr = makeInternalComponentRepr(type, hasIn, hasOut, repr ?? ({} as TProps)) as any
    }

    public isValid() {
        return this.impl !== undefined
    }

    public with(params: TResolvedParams): [InstantiatedInternalComponentDef<TRepr, TValue>, this] {
        const InternalNodes = this._makeInternalNodes({ ...params }, this.aults)
        return [{
            type: this.type,
            idPrefix: this.idPrefix,
            InternalNodeRecs: InternalNodes,
            initialValue: (saved: TRepr | undefined) => this._initialValue(saved, params),
            makeFromJSON: this.makeFromJSON.bind(this),
        }, this]
    }

    public make<TInternalComp extends InternalComponent>(parent: InternalCalculableParent, params?: TParams): TInternalComp {
        const fullParams = params === undefined ? this.defaultParams : mergeWhereDefined(this.defaultParams, params)
        const resolvedParams = this.doValidate(fullParams, undefined)
        const comp = new this.impl(parent, resolvedParams)
        parent.internalComponents.add(comp)
        return comp as unknown as TInternalComp
    }

    public makeFromJSON(parent: InternalCalculableParent, data: Record<string, unknown>): InternalComponent | undefined {
        const validated = validateJson(data, this.repr, this.impl!.name ?? "InternalComponent")
        if (validated === undefined) {
            return undefined
        }
        const fullParams = mergeWhereDefined(this.defaultParams, validated)
        const resolvedParams = this.doValidate(fullParams, validated.type)
        const comp = new this.impl(parent, resolvedParams, validated)
        parent.internalComponents.add(comp)
        return comp
    }

    private doValidate(fullParams: TParams, jsonType: string | undefined) {
        const className = this.impl?.name ?? "InternalComponent"
        // auto validate params
        fullParams = Object.fromEntries(Object.entries(this.paramDefs).map(([paramName, paramDef]) => {
            const paramValue = fullParams[paramName] ?? paramDef.defaultValue
            if (paramName === "type") {
                // skip type param, validated separately for Gate and GateArray
                return [paramName, paramValue]
            } else {
                const validatedValue = paramDef.validate(paramValue, `${className}.${paramName}`)
                return [paramName, validatedValue]
            }
        })) as TParams
        return this._validateParams(fullParams, jsonType, this.paramDefs)
    }

}

export type Params<TDef>
// case: Parameterized InternalComponent def
    = TDef extends ParametrizedInternalComponentDef<infer __THasIn, infer __THasOut, infer __TProps, infer __TParamDefs, infer __TInOutRecs, infer __TValue, infer __TValueDefaults, infer TParams, infer __TResolvedParams, infer __TWeakRepr> ? TParams
    // case: Abstract base InternalComponent def
    : TDef extends { paramDefs: infer TParamDefs extends Record<string, ParamDef<unknown>> } ? ParamsFromDefs<TParamDefs>
        : never

export type ResolvedParams<TDef>
// case: Parameterized InternalComponent def
    = TDef extends ParametrizedInternalComponentDef<infer __THasIn, infer __THasOut, infer __TProps, infer __TParamDefs, infer __TInOutRecs, infer __TValue, infer __TValueDefaults, infer __TParams, infer TResolvedParams, infer __TWeakRepr> ? TResolvedParams
    // case: Abstract base InternalComponent def
    : TDef extends { validateParams?: infer TFunc } ?
        TFunc extends (...args: any) => any ? ReturnType<TFunc> : never
        : never


type ReprWith<
    THasIn extends boolean,
    THasOut extends boolean,
    TProps extends t.Props,
> = t.TypeOf<t.TypeC<TProps>> & InternalComponentRepr<THasIn, THasOut>


export function defineParametrizedInternalComponent<
    THasIn extends boolean,
    THasOut extends boolean,
    TProps extends t.Props,
    TValueDefaults extends Record<string, unknown>,
    TParamDefs extends Record<string, ParamDef<unknown>>,
    TInOutRecs extends InOutRecs,
    TValue,
    TParams extends ParamsFromDefs<TParamDefs> = ParamsFromDefs<TParamDefs>,
    TResolvedParams extends Record<string, unknown> = TParams,
    TRepr extends ReprWith<THasIn, THasOut, TProps> = ReprWith<THasIn, THasOut, TProps>,
>(
    type: string, hasIn: THasIn, hasOut: THasOut,
    { variantName, idPrefix, repr, valueDefaults, params, validateParams, makeInternalNodes, initialValue }: {
        variantName: (params: TParams) => string | string[],
        idPrefix: string | ((params: TResolvedParams) => string),
        repr: TProps,
        valueDefaults: TValueDefaults,
        params: TParamDefs,
        validateParams?: (params: TParams, jsonType: string | undefined, defaults: TParamDefs) => TResolvedParams,
        makeInternalNodes: (params: TResolvedParams, valueDefaults: TValueDefaults) => TInOutRecs,
        initialValue: (saved: TRepr | undefined, params: TResolvedParams) => TValue,
    },
) {
    return new ParametrizedInternalComponentDef(type, idPrefix, hasIn, hasOut, variantName, repr, valueDefaults, params, makeInternalNodes, initialValue, validateParams ?? ((params: TParams) => params as unknown as TResolvedParams))
}

export function defineAbstractParametrizedInternalComponent<
    TProps extends t.Props,
    TValueDefaults extends Record<string, unknown>,
    TParamDefs extends Record<string, ParamDef<unknown>>,
    TInOutRecs extends InOutRecs,
    TValue,
    TParams extends ParamsFromDefs<TParamDefs> = ParamsFromDefs<TParamDefs>,
    TResolvedParams extends Record<string, unknown> = TParams,
    TRepr extends t.TypeOf<t.TypeC<TProps>> = t.TypeOf<t.TypeC<TProps>>,
>(
    items: {
        button: { imgWidth: number },
        repr: TProps,
        valueDefaults: TValueDefaults,
        params: TParamDefs,
        validateParams?: (params: TParams, jsonType: string | undefined, defaults: TParamDefs) => TResolvedParams
        makeInternalNodes: (params: TResolvedParams, valueDefaults: TValueDefaults) => TInOutRecs,
        initialValue: (saved: TRepr | undefined, params: TResolvedParams) => TValue,
    },
) {
    return items
}
