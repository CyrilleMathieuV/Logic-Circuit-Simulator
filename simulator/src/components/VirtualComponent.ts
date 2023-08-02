import * as t from "io-ts"
import type { DefAndParams } from "../ComponentMenu"
import JSON5 from "json5"
import { DrawParams, LogicEditor } from "../LogicEditor"
import { COLOR_BACKGROUND, COLOR_GROUP_SPAN, DrawingRect, GRID_STEP, drawClockInput, drawComponentName, drawLabel, drawWireLineToComponent, isTrivialNodeName, shouldShowNode, useCompact } from "../drawutils"
import { ArrayFillUsing, ArrayOrDirect, EdgeTrigger, Expand, FixedArrayMap, HasField, HighImpedance, InteractionResult, LogicValue, LogicValueRepr, Mode, Unknown, brand, deepEquals, isArray, isBoolean, isNumber, isRecord, isString, mergeWhereDefined, toLogicValueRepr, typeOrUndefined, validateJson } from "../utils"
import {
    VirtualCalculableParent,
    VirtualCalculable,
    PositionSupportRepr,
    VirtualCalculableSaved,
} from "./VirtualCalculable"
import { VirtualNode, VirtualNodeBase, VirtualNodeIn, VirtualNodeOut } from "./VirtualNode"
import {Component} from "./Component";


type VirtualNodeSeqRepr<TFullVirtualNodeRepr> =
    ArrayOrDirect<number | string | TFullVirtualNodeRepr>

export const VirtualNodeSeqRepr = <T>(fullVirtualNodeRepr: t.Type<T>) =>
    t.union([
        t.number, // just the ID
        t.string, // a range of IDs as string
        fullVirtualNodeRepr,
        t.array(t.union([
            t.number,
            t.string,
            fullVirtualNodeRepr,
        ])),
    ], "VirtualNodeSeqRepr")

export const InputVirtualNodeRepr = t.type({
    id: t.number,
}, "InputVirtualNode")
export type InputVirtualNodeRepr = t.TypeOf<typeof InputVirtualNodeRepr>

export const OutputVirtualNodeRepr = t.intersection([
    t.type({ id: t.number }),
    t.partial({
        force: LogicValueRepr,
        initialValue: LogicValueRepr,
    })], "OutputVirtualNode")
export type OutputVirtualNodeRepr = t.TypeOf<typeof OutputVirtualNodeRepr>

export const InputVirtualNodeSeqRepr = VirtualNodeSeqRepr(InputVirtualNodeRepr)
type InputVirtualNodeSeqRepr = t.TypeOf<typeof InputVirtualNodeSeqRepr>

export const OutputVirtualNodeSeqRepr = VirtualNodeSeqRepr(OutputVirtualNodeRepr)
type OutputVirtualNodeSeqRepr = t.TypeOf<typeof OutputVirtualNodeSeqRepr>

// Defines how the JSON looks like depending on the number of inputs and outputs.
// If only inputs or only outputs, all IDs are put into an "id" field.
// If both inputs and outputs are present, we have separate "in" and "out" fields.

// These are just 3 intermediate types
const OnlyInVirtualNodeIds = t.partial({ id: InputVirtualNodeSeqRepr })
type OnlyInVirtualNodeIds = t.TypeOf<typeof OnlyInVirtualNodeIds>

const OnlyOutVirtualNodeIds = t.partial({ id: OutputVirtualNodeSeqRepr })
type OnlyOutVirtualNodeIds = t.TypeOf<typeof OnlyOutVirtualNodeIds>

const InAndOutVirtualNodeIds = t.partial({
    in: InputVirtualNodeSeqRepr,
    out: OutputVirtualNodeSeqRepr,
})
type InAndOutVirtualNodeIds = t.TypeOf<typeof InAndOutVirtualNodeIds>

const NoVirtualNodeIds = t.type({})
type NoVirtualNodeIds = t.TypeOf<typeof NoVirtualNodeIds>


// This is the final conditional type showing what the JSON representation
// will look like depending on number of inputs and outputs
export const VirtualNodeIDsRepr = <THasIn extends boolean, THasOut extends boolean>(hasIn: THasIn, hasOut: THasOut)
    : THasIn extends true
    ? (THasOut extends true ? typeof InAndOutVirtualNodeIds : typeof OnlyInVirtualNodeIds)
    : (THasOut extends true ? typeof OnlyOutVirtualNodeIds : typeof NoVirtualNodeIds) => (
    hasIn ? (hasOut ? InAndOutVirtualNodeIds : OnlyInVirtualNodeIds)
        : (hasOut ? OnlyOutVirtualNodeIds : NoVirtualNodeIds)
) as any

type VirtualNodeIDsRepr<THasIn extends boolean, THasOut extends boolean>
    = THasIn extends true
    ? THasOut extends true ? InAndOutVirtualNodeIds : OnlyInVirtualNodeIds
    : THasOut extends true ? OnlyOutVirtualNodeIds : NoVirtualNodeIds


/**
 * Base representation of a VirtualComponent: position & repr of VirtualNodes
 */
export type VirtualComponentRepr<THasIn extends boolean, THasOut extends boolean> =
    { type: string } & PositionSupportRepr & VirtualNodeIDsRepr<THasIn, THasOut>

export const VirtualComponentRepr = <THasIn extends boolean, THasOut extends boolean>(hasIn: THasIn, hasOut: THasOut) =>
    t.intersection([
        t.type({
            type: t.string,
        }),
        PositionSupportRepr,
        VirtualNodeIDsRepr(hasIn, hasOut),
    ], "VirtualComponent")

export function isVirtualNodeArray<TVirtualNode extends VirtualNode>(obj: undefined | number | VirtualNode | ReadonlyGroupedVirtualNodeArray<TVirtualNode>): obj is ReadonlyGroupedVirtualNodeArray<TVirtualNode> {
    return isArray(obj)
}

export class VirtualNodeGroup<TVirtualNode extends VirtualNode> {

    private _VirtualNodes: GroupedVirtualNodeArray<TVirtualNode>
    public hasNameOverrides: boolean = false

    public constructor(
        public readonly parent: VirtualComponent,
        public readonly name: string,
    ) {
        this._VirtualNodes = [] as unknown as GroupedVirtualNodeArray<TVirtualNode>
        this._VirtualNodes.group = this
    }

    public get VirtualNodes(): ReadonlyGroupedVirtualNodeArray<TVirtualNode> {
        return this._VirtualNodes
    }

    public addVirtualNode(VirtualNode: TVirtualNode) {
        this._VirtualNodes.push(VirtualNode)
    }

    // allows the VirtualNode type (rather than N for group.VirtualNodes.indexOf(...))
    public indexOf(VirtualNode: VirtualNode): number {
        for (let i = 0; i < this._VirtualNodes.length; i++) {
            if (this._VirtualNodes[i] === VirtualNode) {
                return i
            }
        }
        return -1
    }
}

export enum VirtualComponentState {
    SPAWNING, // during placement drag
    SPAWNED,  // regular use
    DEAD,     // after deletion
    INVALID,  // if cannot be updated because of circular dependencies
}

// Simplified, generics-free representation of a VirtualComponent
export type VirtualComponent = VirtualComponentBase<any, any, NamedVirtualNodes<VirtualNodeIn>, NamedVirtualNodes<VirtualNodeOut>, any, any>

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
export type VirtualComponentName = string | DynamicName | undefined
export const VirtualComponentNameRepr = typeOrUndefined(
    t.union([
        t.string,
        t.record(t.union([t.string, t.number]), t.string),
    ])
)

export type VirtualNodeOutDesc = readonly [fullName?: string]
export type VirtualNodeInDesc = readonly [fullName?: string]
export type VirtualNodeDesc = VirtualNodeOutDesc | VirtualNodeInDesc
export type VirtualNodeDescInGroup = readonly [shortNameOverride?: string]
export type VirtualNodeGroupDesc<D extends VirtualNodeDesc> = ReadonlyArray<D>
export type VirtualNodeGroupMultiDesc<D extends VirtualNodeDesc> = ReadonlyArray<VirtualNodeGroupDesc<D>>
export type VirtualNodeRec<D extends VirtualNodeDesc> = Record<string, D | VirtualNodeGroupDesc<D> | VirtualNodeGroupMultiDesc<D>>

function isVirtualNodeDesc<D extends VirtualNodeDesc>(desc: D | VirtualNodeGroupDesc<D> | VirtualNodeGroupMultiDesc<D>): desc is D {
    return isNumber(desc[0])
}

type GroupedVirtualNodeArray<TVirtualNode extends VirtualNode> = TVirtualNode[] & { group: VirtualNodeGroup<TVirtualNode> }
export type ReadonlyGroupedVirtualNodeArray<TVirtualNode extends VirtualNode> = readonly TVirtualNode[] & { group: VirtualNodeGroup<TVirtualNode> }

type MapDescToVirtualNode<TDesc, TVirtualNode extends VirtualNode>
    = TDesc extends VirtualNodeDesc ? TVirtualNode
    : TDesc extends Array<VirtualNodeDesc> ? GroupedVirtualNodeArray<TVirtualNode>
        : TDesc extends Array<Array<VirtualNodeDesc>> ? GroupedVirtualNodeArray<TVirtualNode>[]
            : never

type MapRecToVirtualNodes<TRec, TVirtualNode extends VirtualNode> = {
    [K in keyof TRec]: MapDescToVirtualNode<TRec[K], TVirtualNode>
}


// Named VirtualNodes according to the VirtualNode description always have
// an '_all' array of all VirtualNodes in addition to the names
type NamedVirtualNodes<TVirtualNode> = { _all: readonly TVirtualNode[] }

type ExtractVirtualNodes<TRepr, TField extends "ins" | "outs", TVirtualNode extends VirtualNode> = Expand<
    (TRepr extends { _META?: { VirtualNodeRecs: { [K in TField]: infer TVirtualNodeRec } } }
        ? MapRecToVirtualNodes<TVirtualNodeRec, TVirtualNode> : { _empty: true })
    & NamedVirtualNodes<TVirtualNode>>

export type VirtualNodesIn<TRepr> = ExtractVirtualNodes<TRepr, "ins", VirtualNodeIn>
export type VirtualNodesOut<TRepr> = ExtractVirtualNodes<TRepr, "outs", VirtualNodeOut>

export type IsNonEmpty<TNamedVirtualNodes> = TNamedVirtualNodes extends { _empty: true } ? false : true

export type ExtractValue<TRepr> = TRepr extends { _META?: { value: infer TValue } } ? TValue : never

export type ExtractParams<TRepr> = TRepr extends { _META?: { params: infer TParams } } ? TParams : {}

export type ExtractParamDefs<TRepr> = TRepr extends { _META?: { paramDefs: infer TParamDefs extends Record<string, ParamDef<unknown>> } } ? TParamDefs : Record<string, ParamDef<unknown>>



export type InOutRecs = {
    ins?: VirtualNodeRec<VirtualNodeInDesc>
    outs?: VirtualNodeRec<VirtualNodeOutDesc>
}



//
// Base class for all VirtualComponents
//

export abstract class VirtualComponentBase<
    TRepr extends VirtualComponentRepr<THasIn, THasOut>, // JSON representation
    TValue = ExtractValue<TRepr>, // internal value recomputed when inputs change
    TInputVirtualNodes extends NamedVirtualNodes<VirtualNodeIn> = VirtualNodesIn<TRepr>,
    TOutputVirtualNodes extends NamedVirtualNodes<VirtualNodeOut> = VirtualNodesOut<TRepr>,
    THasIn extends boolean = IsNonEmpty<TInputVirtualNodes>,
    THasOut extends boolean = IsNonEmpty<TOutputVirtualNodes>, // in-out VirtualNode presence
> extends VirtualCalculableSaved {

    public readonly def: InstantiatedVirtualComponentDef<TRepr, TValue>
    private _state!: VirtualComponentState
    private _value: TValue
    public readonly inputs: TInputVirtualNodes
    public readonly outputs: TOutputVirtualNodes
    public readonly inputGroups: Map<string, VirtualNodeGroup<VirtualNodeIn>>
    public readonly outputGroups: Map<string, VirtualNodeGroup<VirtualNodeOut>>

    protected constructor(
        parent: VirtualCalculableParent,
        def: InstantiatedVirtualComponentDef<TRepr, TValue>,
        saved: TRepr | undefined
    ) {
        super(parent, saved)

        this.def = def
        this._value = def.initialValue(saved)

        const ins = def.VirtualNodeRecs.ins
        const outs = def.VirtualNodeRecs.outs

        function countVirtualNodes(rec: VirtualNodeRec<VirtualNodeDesc> | undefined) {
            if (rec === undefined) {
                return 0
            }
            let count = 0
            for (const desc of Object.values(rec)) {
                if (isVirtualNodeDesc(desc)) {
                    count++
                } else {
                    for (const innerDesc of desc) {
                        if (isVirtualNodeDesc(innerDesc)) {
                            count++
                        } else {
                            count += innerDesc.length
                        }
                    }
                }
            }
            return count
        }

        const numInputs = countVirtualNodes(ins)
        const numOutputs = countVirtualNodes(outs)

        if (saved !== undefined) {
            // restoring
            this._state = VirtualComponentState.SPAWNED
        } else {
            // newly placed
            this.setSpawning()
        }

        // build VirtualNode specs either from scratch if new or from saved data
        const [inputSpecs, outputSpecs, hasAnyPrecomputedInitialValues] =
            this.VirtualNodeSpecsFromRepr(saved, numInputs, numOutputs);

        // so, hasAnyPrecomputedInitialValues is true if ANY of the outputs was built
        // with "initialValue" in the JSON. This is used to stabilize circuits (such as
        // an SR latch) that would otherwise oscillate. But this also means that NO OTHER
        // OUTPUT from this VirtualComponent would be recomputed (even if they are always
        // propagated). So, it is a good idea to either set no initial values at all, or
        // to set all of them.

        // generate the input and output VirtualNodes
        [this.inputs, this.inputGroups] = this.makeVirtualNodes(ins, inputSpecs, VirtualNodeIn) as [TInputVirtualNodes, Map<string, VirtualNodeGroup<VirtualNodeIn>>];
        [this.outputs, this.outputGroups] = this.makeVirtualNodes(outs, outputSpecs, VirtualNodeOut) as [TOutputVirtualNodes, Map<string, VirtualNodeGroup<VirtualNodeOut>>]

        // setNeedsVirtualRecalc with a force propadation is needed:
        // * the forced propagation allows the current value (e.g. for InputBits)
        //   to be set to the outputs, if the "new" value is the same as the current one
        // * setNeedsVirtualRecalc schedules a recalculation (e.g. for Gates)
        if (!hasAnyPrecomputedInitialValues) {
            this.setNeedsRecalc(true)
        } else {
            this.setNeedsPropagate()
        }
    }

    public setSpawning() {
        this._state = VirtualComponentState.SPAWNING
    }

    public setSpawned() {
        this._state = VirtualComponentState.SPAWNED
    }

    public setInvalid() {
        this._state = VirtualComponentState.INVALID
    }

    public abstract toJSON(): TRepr

    /**
     * Returns the JSON representation of this VirtualComponent, but without VirtualNodes
     * and without the id. This is useful to clone a VirtualComponent. VirtualNodes and ids
     * can then be restored on the clone.
     */
    protected toVirtualNodelessJSON(): TRepr {
        // useful to clone a VirtualComponent without its VirtualNode numbers,
        // which will be reobtained when the new VirtualComponent is created
        const repr = this.toJSON()
        delete repr.ref
        delete (repr as VirtualComponentRepr<true, true>).in
        delete (repr as VirtualComponentRepr<true, true>).out
        delete (repr as VirtualComponentRepr<true, false>).id
        return repr
    }

    /**
     * Returns the JSON representation of the fields this superclass knows
     * about. Typically used by subclasses to provide only their specific JSON,
     * splatting in the result of super.toJSONBase() in the object.
     */
    protected override toJSONBase(): VirtualComponentRepr<THasIn, THasOut> {
        const typeHolder = {
            // not sure why we need a separate object to splat in just
            // a few lines below, but this makes the compiler happy
            type: this.jsonType(),
        }
        return {
            ...typeHolder,
            ...super.toJSONBase(),
            ...this.buildVirtualNodesRepr(),
        }
    }

    protected jsonType(): string {
        return this.def.type
    }

    // creates the input/output VirtualNodes based on array of offsets (provided
    // by subclass) and spec (either loaded from JSON repr or newly generated)
    private makeVirtualNodes<TVirtualNode extends VirtualNode, TDesc extends (TVirtualNode extends VirtualNodeIn ? VirtualNodeInDesc : VirtualNodeOutDesc)>(
        VirtualNodeRec: VirtualNodeRec<TDesc> | undefined,
        specs: readonly (InputVirtualNodeRepr | OutputVirtualNodeRepr)[],
        VirtualNode: new (
            parent: VirtualComponent,
            VirtualNodeSpec: InputVirtualNodeRepr | OutputVirtualNodeRepr,
            group: VirtualNodeGroup<TVirtualNode> | undefined,
            shortName: string,
            fullName: string,
        ) => TVirtualNode) {

        const VirtualNodes: Record<string, TVirtualNode | ReadonlyArray<TVirtualNode> | ReadonlyArray<ReadonlyArray<TVirtualNode>>> = {}
        const allVirtualNodes: TVirtualNode[] = []
        const VirtualNodeGroups: Map<string, VirtualNodeGroup<TVirtualNode>> = new Map()
/*
        if (VirtualNodeRec !== undefined) {
            const makeVirtualNode = (group: VirtualNodeGroup<TVirtualNode> | undefined, shortName: string, desc: TDesc) => {
                const spec = specs[nextSpecIndex++]
                const options = options_ as VirtualNodeInDesc[0] // bleh
                if (group !== undefined && nameOverride !== undefined) {
                    // names in groups are considered short names to be used as labels
                    shortName = nameOverride
                    group.hasNameOverrides = true
                } else if (options?.labelName !== undefined) {
                    shortName = options.labelName
                }
                const fullName = nameOverride === undefined ? shortName : nameOverride
                const newVirtualNode = new VirtualNode(
                    this,
                    spec,
                    group,
                    shortName,
                    fullName,
                )
                allVirtualNodes.push(newVirtualNode)
                return newVirtualNode
            }
            let nextSpecIndex = 0
            for (const [fieldName, desc] of Object.entries(VirtualNodeRec)) {
                if (isVirtualNodeDesc(desc)) {
                    // single
                    VirtualNodes[fieldName] = makeVirtualNode(undefined, fieldName, desc)
                } else {
                    // group
                    const makeVirtualNodesForGroup = (groupDesc: VirtualNodeGroupDesc<TDesc>) => {
                        const group = new VirtualNodeGroup<TVirtualNode>(this, fieldName)
                        VirtualNodeGroups.set(fieldName, group)
                        for (let i = 0; i < groupDesc.length; i++) {
                            group.addVirtualNode(makeVirtualNode(group, `${fieldName}${i}`, groupDesc[i]))
                        }
                        return group.VirtualNodes
                    }

                    if (isVirtualNodeDesc(desc[0])) {
                        // normal group
                        const groupDesc = desc as VirtualNodeGroupDesc<TDesc>
                        VirtualNodes[fieldName] = makeVirtualNodesForGroup(groupDesc)
                    } else {
                        // nested group
                        const groupMultiDesc = desc as VirtualNodeGroupMultiDesc<TDesc>
                        VirtualNodes[fieldName] = groupMultiDesc.map(makeVirtualNodesForGroup)
                    }
                }
            }
        }
 */
        VirtualNodes._all = allVirtualNodes
        return [VirtualNodes, VirtualNodeGroups]
    }

    // generates two arrays of normalized VirtualNode specs either as loaded from
    // JSON or obtained with default values when _repr is null and we're
    // creating a new VirtualComponent from scratch
    private VirtualNodeSpecsFromRepr(_repr: VirtualNodeIDsRepr<THasIn, THasOut> | undefined, numInputs: number, numOutputs: number): [
        inputSpecs: Array<InputVirtualNodeRepr>,
        outputSpecs: Array<OutputVirtualNodeRepr>,
        hasAnyPrecomputedInitialValues: boolean
    ] {
        const virtualNodeMgr = this.parent.virtualNodeMgr
        const makeDefaultSpec = () => ({ id: virtualNodeMgr.getFreeId() })
        const makeDefaultSpecArray = (len: number) => ArrayFillUsing(makeDefaultSpec, len)

        if (_repr === undefined) {
            return [
                makeDefaultSpecArray(numInputs),
                makeDefaultSpecArray(numOutputs),
                false,
            ]
        }

        let inputSpecs: InputVirtualNodeRepr[] = []
        let outputSpecs: OutputVirtualNodeRepr[] = []

        const makeNormalizedSpecs = <TVirtualNodeRepr extends InputVirtualNodeRepr | OutputVirtualNodeRepr>(
            num: number,
            seqRepr?: ArrayOrDirect<string | number | TVirtualNodeRepr>,
        ) => {
            if (seqRepr === undefined) {
                return makeDefaultSpecArray(num)
            }

            const specs: Array<TVirtualNodeRepr> = []
            function pushId(sourceId: number) {
                const id = virtualNodeMgr.getFreeIdFrom(sourceId)
                specs.push({ id } as TVirtualNodeRepr)
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
                    spec.id = virtualNodeMgr.getFreeIdFrom(spec.id)
                    specs.push(spec)
                }
            }
            return specs
        }

        // manually distinguishing the cases where we have no inputs or no
        // outputs as we then have a more compact JSON representation
        if (numInputs !== 0) {
            if (numOutputs !== 0) {
                const repr = _repr as InAndOutVirtualNodeIds
                inputSpecs = makeNormalizedSpecs(numInputs, repr.in)
                outputSpecs = makeNormalizedSpecs(numOutputs, repr.out)
            } else {
                const repr = _repr as OnlyInVirtualNodeIds
                inputSpecs = makeNormalizedSpecs(numInputs, repr.id)
            }
        } else if (numOutputs !== 0) {
            const repr = _repr as OnlyOutVirtualNodeIds
            outputSpecs = makeNormalizedSpecs(numOutputs, repr.id)
        }

        const hasAnyPrecomputedInitialValues =
            outputSpecs.some(spec => spec.initialValue !== undefined)

        return [inputSpecs, outputSpecs, hasAnyPrecomputedInitialValues]
    }

    // from the known VirtualNodes, builds the JSON representation of them,
    // using the most compact form available
    private buildVirtualNodesRepr(): VirtualNodeIDsRepr<THasIn, THasOut> {
        const numInputs = this.inputs._all.length
        const numOutputs = this.outputs._all.length

        // these two functions return either an array of JSON
        // representations, or just the element skipping the array
        // if there is only one
        function inVirtualNodeReprs(VirtualNodes: readonly VirtualNode[]): ArrayOrDirect<number | string> {
            const reprOne = (VirtualNode: VirtualNode) => VirtualNode.id
            if (VirtualNodes.length === 1) {
                return reprOne(VirtualNodes[0])
            } else {
                return compactRepr(VirtualNodes.map(reprOne))
            }
        }
        function outVirtualNodeReprs(VirtualNodes: readonly VirtualNode[]): ArrayOrDirect<number | string | OutputVirtualNodeRepr> {
            const reprOne = (VirtualNode: VirtualNode) => {
                const valueNotForced = VirtualNode.forceValue === undefined
                const noInitialValue = VirtualNode.initialValue === undefined
                if (valueNotForced && noInitialValue) {
                    return VirtualNode.id
                } else {
                    return {
                        id: VirtualNode.id,
                        intialValue: noInitialValue ? undefined : toLogicValueRepr(VirtualNode.initialValue),
                        force: valueNotForced ? undefined : toLogicValueRepr(VirtualNode.forceValue),
                    }
                }
            }
            if (VirtualNodes.length === 1) {
                return reprOne(VirtualNodes[0])
            } else {
                return compactRepr(VirtualNodes.map(reprOne))
            }
        }

        function compactRepr<TFullVirtualNodeRepr>(reprs: Array<number | TFullVirtualNodeRepr>): ArrayOrDirect<number | string | TFullVirtualNodeRepr> {
            // collapses consecutive numbers intro a string of the form "start-end" to save JSON space
            const newArray: Array<number | string | TFullVirtualNodeRepr> = []
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
                    ? { in: inVirtualNodeReprs(this.inputs._all), out: outVirtualNodeReprs(this.outputs._all) }
                    : { id: inVirtualNodeReprs(this.inputs._all) }
                : numOutputs !== 0
                    ? { id: outVirtualNodeReprs(this.outputs._all) }
                    : {}
        ) as VirtualNodeIDsRepr<THasIn, THasOut>
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

    public get alwaysDrawMultiOutVirtualNodes() {
        return false
    }

    public *allVirtualNodes() {
        for (const VirtualNode of this.inputs._all) {
            yield VirtualNode
        }
        for (const VirtualNode of this.outputs._all) {
            yield VirtualNode
        }
    }

    public *allVirtualNodeGroups() {
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

    protected inputValues(VirtualNodes: readonly VirtualNodeIn[]): LogicValue[] {
        return VirtualNodes.map(VirtualNode => VirtualNode.value)
    }

    protected setInputValues(VirtualNodes: readonly VirtualNodeIn[], values: LogicValue[], reverse = false) {
        const num = VirtualNodes.length
        if (values.length !== num) {
            throw new Error(`inputValues: expected ${num} values, got ${values.length}`)
        }
        for (let i = 0; i < num; i++) {
            const j = reverse ? num - i - 1 : i
            VirtualNodes[i].value = values[j]
        }
    }

    protected getOutputValues(VirtualNodes: readonly VirtualNodeOut[]): LogicValue[] {
        return VirtualNodes.map(VirtualNode => VirtualNode.value)
    }

    protected outputValues(VirtualNodes: readonly VirtualNodeOut[], values: LogicValue[], reverse = false) {
        const num = VirtualNodes.length
        if (values.length !== num) {
            throw new Error(`outputValues: expected ${num} values, got ${values.length}`)
        }
        for (let i = 0; i < num; i++) {
            const j = reverse ? num - i - 1 : i
            VirtualNodes[i].value = values[j]
        }
    }

    public setNeedsRecalc(forcePropagate = false) {
        this.parent.recalcMgr.enqueueForRecalc(this, forcePropagate)
    }

    private setNeedsPropagate() {
        this.parent.recalcMgr.enqueueForPropagate(this)
    }

    protected replaceWithVirtualComponent(newComp: VirtualComponent): VirtualComponent {
        // any VirtualComponent will work, but only inputs and outputs with
        // the same names will be reconnected and others will be lost

        const saveVirtualWires = <TVirtualNode extends VirtualNodeBase<any>, TVirtualWires>(VirtualNodes: readonly TVirtualNode[], getVirtualWires: (VirtualNode: TVirtualNode) => null | TVirtualWires): Map<string, TVirtualWires> => {
            const savedVirtualWires: Map<string, TVirtualWires> = new Map()
            for (const VirtualNode of VirtualNodes) {
                const group = VirtualNode.group
                const VirtualWires = getVirtualWires(VirtualNode)
                if (VirtualWires === null) {
                    continue
                }
                const keyName = group === undefined ? VirtualNode.shortName : `${group.name}[${group.VirtualNodes.indexOf(VirtualNode)}]`
                savedVirtualWires.set(keyName, VirtualWires)
            }
            return savedVirtualWires
        }

        const savedVirtualWiresIn = saveVirtualWires(this.inputs._all, VirtualNode => VirtualNode.incomingVirtualWire)
        const savedVirtualWiresOut = saveVirtualWires(this.outputs._all, VirtualNode => VirtualNode.outgoingVirtualWires)

        const restoreVirtualNodes = <TVirtualNode extends VirtualNodeBase<any>, TVirtualWires>(savedVirtualWires: Map<string, TVirtualWires>, VirtualNodes: readonly TVirtualNode[], setVirtualWires: (VirtualWires: TVirtualWires, VirtualNode: TVirtualNode) => void) => {
            for (const VirtualNode of VirtualNodes) {
                const group = VirtualNode.group
                if (group === undefined) {
                    // single VirtualNode
                    let VirtualWires = savedVirtualWires.get(VirtualNode.shortName)
                    if (VirtualWires === undefined) {
                        // try to restore from array version
                        VirtualWires = savedVirtualWires.get(VirtualNode.shortName + "[0]")
                    }
                    if (VirtualWires !== undefined) {
                        setVirtualWires(VirtualWires, VirtualNode)
                    }
                } else {
                    // VirtualNode group
                    const i = group.VirtualNodes.indexOf(VirtualNode)
                    let VirtualWires = savedVirtualWires.get(`${group.name}[${i}]`)
                    if (VirtualWires === undefined && i === 0) {
                        // try to restore from single version
                        VirtualWires = savedVirtualWires.get(group.name)
                    }
                    if (VirtualWires !== undefined) {
                        setVirtualWires(VirtualWires, VirtualNode)
                    }
                }
            }
        }

        restoreVirtualNodes(savedVirtualWiresIn, newComp.inputs._all, (VirtualWire, VirtualNode) => {
            VirtualWire.setEndVirtualNode(VirtualNode)
        })

        const now = this.parent.editor.timeline.logicalTime()
        restoreVirtualNodes(savedVirtualWiresOut, newComp.outputs._all, (VirtualWires, VirtualNode) => {
            for (const VirtualWire of [...VirtualWires]) {
                VirtualWire.setStartVirtualNode(VirtualNode, now)
            }
        })

        // do this after restoring VirtualWires, otherwise VirtualWires are deleted
        const VirtualComponentList = this.parent.virtualComponents
        const deleted = VirtualComponentList.tryDelete(this)
        if (!deleted) {
            console.warn("Could not delete old VirtualComponent")
        }

        // restore VirtualComponent properties
        if (this.ref !== undefined) {
            VirtualComponentList.changeIdOf(newComp, this.ref)
        }
        newComp.setSpawned()

        return newComp
    }

    protected autoConnected(__newLinks: [VirtualNode, VirtualComponent, VirtualNode][]) {
        // by default, do nothing
    }
}


export abstract class ParametrizedVirtualComponentBase<
    TRepr extends VirtualComponentRepr<THasIn, THasOut>, // JSON representation
    TValue = ExtractValue<TRepr>, // internal value recomputed when inputs change
    TParamDefs extends ExtractParamDefs<TRepr> = ExtractParamDefs<TRepr>,
    TParams extends ExtractParams<TRepr> = ExtractParams<TRepr>,
    TInputVirtualNodes extends NamedVirtualNodes<VirtualNodeIn> = VirtualNodesIn<TRepr>,
    TOutputVirtualNodes extends NamedVirtualNodes<VirtualNodeOut> = VirtualNodesOut<TRepr>,
    THasIn extends boolean = IsNonEmpty<TInputVirtualNodes>,
    THasOut extends boolean = IsNonEmpty<TOutputVirtualNodes>,// in-out VirtualNode presence
> extends VirtualComponentBase<
    TRepr,
    TValue,
    TInputVirtualNodes,
    TOutputVirtualNodes,
    THasIn,
    THasOut
> {

    private readonly _defP: SomeParamCompDef<TParamDefs>

    protected constructor(
        parent: VirtualCalculableParent,
        [instance, def]: [
            InstantiatedVirtualComponentDef<TRepr, TValue>,
            SomeParamCompDef<TParamDefs>,
        ],
        saved: TRepr | undefined
    ) {
        super(parent, instance, saved)
        this._defP = def
    }

    protected replaceWithNewParams(newParams: Partial<TParams>): VirtualComponent | undefined {
        const currentRepr = this.toVirtualNodelessJSON()
        const newRepr = { ...currentRepr, ...newParams }

        const newComp = this._defP.makeFromJSON(this.parent, newRepr)
        if (newComp === undefined) {
            console.warn("Could not create VirtualComponent variant")
            return undefined
        }

        return this.replaceWithVirtualComponent(newComp)
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
// VirtualNode definition helpers
//

export function group<const TDescArr extends readonly VirtualNodeDescInGroup[]>(VirtualNodes: TDescArr) {
    return FixedArrayMap(VirtualNodes, ([name]) => [name] as const)
}

//
// Repr and friends
//

/** Represents the JSON object holding properties from the passed VirtualComponent def */
export type Repr<TDef>
// case: Parameterized VirtualComponent def
    = TDef extends ParametrizedVirtualComponentDef<infer THasIn, infer THasOut, infer TProps, infer TParamDefs, infer TInOutRecs, infer TValue, infer __TValueDefaults, infer TParams, infer __TResolvedParams, infer __TWeakRepr>
    ? t.TypeOf<t.TypeC<TProps>> & VirtualComponentRepr<THasIn, THasOut> & {
    _META?: {
        VirtualNodeRecs: TInOutRecs,
        value: TValue,
        paramDefs: TParamDefs,
        params: TParams,
    }
}
    // case: Unparameterized VirtualComponent def
    : TDef extends VirtualComponentDef<infer TInOutRecs, infer TValue, infer __TValueDefaults, infer TProps, infer THasIn, infer THasOut, infer __TWeakRepr>
        ? t.TypeOf<t.TypeC<TProps>> & VirtualComponentRepr<THasIn, THasOut> & {
        _META?: {
            VirtualNodeRecs: TInOutRecs,
            value: TValue,
            paramDefs: {},
            params: {},
        }
    }
        // case: Abstract parameterized VirtualComponent def
        : TDef extends {
                repr: infer TProps extends t.Props,
                params: infer TParamDefs extends Record<string, ParamDef<unknown>>,
                makeVirtualNodes: (...args: any) => infer TInOutRecs,
                initialValue?: (...args: any) => infer TValue,
            }
            ? Expand<t.TypeOf<t.TypeC<TProps>> & VirtualComponentRepr<true, true> & {
                _META?: {
                    VirtualNodeRecs: TInOutRecs,
                    value: TValue,
                    paramDefs: TParamDefs,
                    params: ParamsFromDefs<TParamDefs>,
                }
            }>
            // case: Abstract VirtualComponent def
            : TDef extends {
                    repr: infer TProps extends t.Props,
                    makeVirtualNodes: (...args: any) => infer TInOutRecs,
                    initialValue?: (...args: any) => infer TValue,
                }
                ? Expand<t.TypeOf<t.TypeC<TProps>> & VirtualComponentRepr<true, true> & {
                    _META?: {
                        VirtualNodeRecs: TInOutRecs,
                        value: TValue,
                        paramDefs: {},
                        params: {},
                    }
                }>
                : never

export type Value<TDef>
    = TDef extends ParametrizedVirtualComponentDef<infer __THasIn, infer __THasOut, infer __TProps, infer __TParamDefs, infer __TInOutRecs, infer TValue, infer __TValueDefaults, infer __TParams, infer __TResolvedParams, infer __TWeakRepr>
    ? TValue : never


function makeVirtualComponentRepr<
    TProps extends t.Props,
    THasIn extends boolean,
    THasOut extends boolean,
>(type: string, hasIn: THasIn, hasOut: THasOut, props: TProps) {
    return t.intersection([t.type({
        type: t.string,
        ...props,
    }), VirtualComponentRepr(hasIn, hasOut)], type)
}



//
// VirtualComponentDef and friends
//


export type InstantiatedVirtualComponentDef<
    TRepr extends t.TypeOf<t.Mixed>,
    TValue,
> = {
    type: string,
    idPrefix: string | ((self: any) => string),
    VirtualNodeRecs: InOutRecs,
    initialValue: (saved: TRepr | undefined) => TValue,
    makeFromJSON: (parent: VirtualCalculable, data: Record<string, unknown>) => VirtualComponent | undefined,
}

export class VirtualComponentDef<
    TInOutRecs extends InOutRecs,
    TValue,
    TValueDefaults extends Record<string, unknown> = Record<string, unknown>,
    TProps extends t.Props = {},
    THasIn extends boolean = HasField<TInOutRecs, "ins">,
    THasOut extends boolean = HasField<TInOutRecs, "outs">,
    TRepr extends ReprWith<THasIn, THasOut, TProps> = ReprWith<THasIn, THasOut, TProps>,
> implements InstantiatedVirtualComponentDef<TRepr, TValue> {

    public readonly VirtualNodeRecs: TInOutRecs
    public readonly repr: t.Decoder<Record<string, unknown>, TRepr>

    public impl: (new (parent: VirtualCalculable, saved?: TRepr) => VirtualComponent) = undefined as any

    public constructor(
        public readonly type: string,
        public readonly idPrefix: string,
        public readonly aults: TValueDefaults,
        private readonly _initialValue: (saved: t.TypeOf<t.TypeC<TProps>> | undefined, defaults: TValueDefaults) => TValue,
        makeVirtualNodes: (defaults: TValueDefaults) => TInOutRecs,
        repr?: TProps,
    ) {
        const VirtualNodes = makeVirtualNodes(aults)
        this.VirtualNodeRecs = VirtualNodes

        const hasIn = ("ins" in VirtualNodes) as THasIn
        const hasOut = ("outs" in VirtualNodes) as THasOut
        this.repr = makeVirtualComponentRepr(type, hasIn, hasOut, repr ?? ({} as TProps)) as any
    }

    public isValid() {
        return this.impl !== undefined
    }

    public initialValue(saved?: TRepr): TValue {
        return this._initialValue(saved, this.aults)
    }

    public make<TVirtualComp extends VirtualComponent>(parent: VirtualCalculable): TVirtualComp {
        const comp = new this.impl(parent)
        parent.parent.virtualComponents.add(comp)
        return comp as TVirtualComp
    }

    public makeFromJSON(parent: VirtualCalculable, data: Record<string, unknown>): VirtualComponent | undefined {
        const validated = validateJson(data, this.repr, this.impl!.name ?? "VirtualComponent")
        if (validated === undefined) {
            return undefined
        }
        const comp = new this.impl(parent, validated)
        parent.parent.virtualComponents.add(comp)
        return comp
    }
}


export function defineVirtualComponent<
    TInOutRecs extends InOutRecs,
    TValue,
    TValueDefaults extends Record<string, unknown> = Record<string, unknown>,
    TProps extends t.Props = {},
>(
    type: string,
    { idPrefix, repr, valueDefaults, makeVirtualNodes, initialValue }: {
        idPrefix: string,
        repr?: TProps,
        valueDefaults: TValueDefaults,
        makeVirtualNodes: ( defaults: TValueDefaults) => TInOutRecs,
        initialValue?: (saved: t.TypeOf<t.TypeC<TProps>> | undefined, defaults: TValueDefaults) => TValue
    }
) {
    return new VirtualComponentDef(type, idPrefix, valueDefaults, initialValue ?? (() => undefined as TValue), makeVirtualNodes, repr)
}



export function defineAbstractVirtualComponent<
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
        makeVirtualNodes: (...args: TArgs) => TInOutRecs,
        initialValue: (saved: TRepr | undefined, defaults: TValueDefaults) => TValue
    },
) {
    return {
        ...items,
        aults: items.valueDefaults,
    }
}



//
// ParameterizedVirtualComponentDef and friends
//

export type SomeParamCompDef<TParamDefs extends Record<string, ParamDef<unknown>>> = ParametrizedVirtualComponentDef<boolean, boolean, t.Props, TParamDefs, InOutRecs, unknown, any, ParamsFromDefs<TParamDefs>, any, any>

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

export class ParametrizedVirtualComponentDef<
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

    public impl: (new (parent: VirtualCalculableParent, params: TResolvedParams, saved?: TRepr) => VirtualComponent & TResolvedParams) = undefined as any

    public constructor(
        public readonly type: string,
        public readonly idPrefix: string | ((params: TResolvedParams) => string),
        hasIn: THasIn,
        hasOut: THasOut,
        public readonly variantName: (params: TParams) => string | string[],
        repr: TProps,
        valueDefaults: TValueDefaults,
        public readonly paramDefs: TParamDefs,
        private readonly _makeVirtualNodes: (params: TResolvedParams, valueDefaults: TValueDefaults) => TInOutRecs,
        private readonly _initialValue: (saved: TRepr | undefined, params: TResolvedParams) => TValue,
        private readonly _validateParams: (params: TParams, jsonType: string | undefined, defaults: TParamDefs) => TResolvedParams,
    ) {
        this.defaultParams = paramDefaults(paramDefs) as TParams
        this.aults = { ...valueDefaults, ...this.defaultParams }
        this.repr = makeVirtualComponentRepr(type, hasIn, hasOut, repr ?? ({} as TProps)) as any
    }

    public isValid() {
        return this.impl !== undefined
    }

    public with(params: TResolvedParams): [InstantiatedVirtualComponentDef<TRepr, TValue>, this] {
        const VirtualNodes = this._makeVirtualNodes({ ...params }, this.aults)
        return [{
            type: this.type,
            idPrefix: this.idPrefix,
            VirtualNodeRecs: VirtualNodes,
            initialValue: (saved: TRepr | undefined) => this._initialValue(saved, params),
            makeFromJSON: this.makeFromJSON.bind(this),
        }, this]
    }

    public make<TVirtualComp extends VirtualComponent>(parent: VirtualCalculableParent, params?: TParams): TVirtualComp {
        const fullParams = params === undefined ? this.defaultParams : mergeWhereDefined(this.defaultParams, params)
        const resolvedParams = this.doValidate(fullParams, undefined)
        const comp = new this.impl(parent, resolvedParams)
        parent.virtualComponents.add(comp)
        return comp as unknown as TVirtualComp
    }

    public makeFromJSON(parent: VirtualCalculableParent, data: Record<string, unknown>): VirtualComponent | undefined {
        const validated = validateJson(data, this.repr, this.impl!.name ?? "VirtualComponent")
        if (validated === undefined) {
            return undefined
        }
        const fullParams = mergeWhereDefined(this.defaultParams, validated)
        const resolvedParams = this.doValidate(fullParams, validated.type)
        const comp = new this.impl(parent, resolvedParams, validated)
        parent.virtualComponents.add(comp)
        return comp
    }

    private doValidate(fullParams: TParams, jsonType: string | undefined) {
        const className = this.impl?.name ?? "VirtualComponent"
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
// case: Parameterized VirtualComponent def
    = TDef extends ParametrizedVirtualComponentDef<infer __THasIn, infer __THasOut, infer __TProps, infer __TParamDefs, infer __TInOutRecs, infer __TValue, infer __TValueDefaults, infer TParams, infer __TResolvedParams, infer __TWeakRepr> ? TParams
    // case: Abstract base VirtualComponent def
    : TDef extends { paramDefs: infer TParamDefs extends Record<string, ParamDef<unknown>> } ? ParamsFromDefs<TParamDefs>
        : never

export type ResolvedParams<TDef>
// case: Parameterized VirtualComponent def
    = TDef extends ParametrizedVirtualComponentDef<infer __THasIn, infer __THasOut, infer __TProps, infer __TParamDefs, infer __TInOutRecs, infer __TValue, infer __TValueDefaults, infer __TParams, infer TResolvedParams, infer __TWeakRepr> ? TResolvedParams
    // case: Abstract base VirtualComponent def
    : TDef extends { validateParams?: infer TFunc } ?
        TFunc extends (...args: any) => any ? ReturnType<TFunc> : never
        : never


type ReprWith<
    THasIn extends boolean,
    THasOut extends boolean,
    TProps extends t.Props,
> = t.TypeOf<t.TypeC<TProps>> & VirtualComponentRepr<THasIn, THasOut>


export function defineParametrizedVirtualComponent<
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
    { variantName, idPrefix, repr, valueDefaults, params, validateParams, makeVirtualNodes, initialValue }: {
        variantName: (params: TParams) => string | string[],
        idPrefix: string | ((params: TResolvedParams) => string),
        repr: TProps,
        valueDefaults: TValueDefaults,
        params: TParamDefs,
        validateParams?: (params: TParams, jsonType: string | undefined, defaults: TParamDefs) => TResolvedParams,
        makeVirtualNodes: (params: TResolvedParams, valueDefaults: TValueDefaults) => TInOutRecs,
        initialValue: (saved: TRepr | undefined, params: TResolvedParams) => TValue,
    },
) {
    return new ParametrizedVirtualComponentDef(type, idPrefix, hasIn, hasOut, variantName, repr, valueDefaults, params, makeVirtualNodes, initialValue, validateParams ?? ((params: TParams) => params as unknown as TResolvedParams))
}

export function defineAbstractParametrizedVirtualComponent<
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
        makeVirtualNodes: (params: TResolvedParams, valueDefaults: TValueDefaults) => TInOutRecs,
        initialValue: (saved: TRepr | undefined, params: TResolvedParams) => TValue,
    },
) {
    return items
}
