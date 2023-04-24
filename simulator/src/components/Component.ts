import * as t from "io-ts"
import { COLOR_BACKGROUND, COLOR_COMPONENT_INNER_LABELS, COLOR_GROUP_SPAN, drawClockInput, drawComponentName, DrawingRect, drawLabel, drawWireLineToComponent, GRID_STEP, shouldShowNode, useCompact } from "../drawutils"
import { IconName, ImageName } from "../images"
import { LogicEditor } from "../LogicEditor"
import type { ComponentKey, DefAndParams, LibraryButtonOptions, LibraryButtonProps, LibraryItem } from "../menuutils"
import { S, Template } from "../strings"
import { ArrayFillUsing, ArrayOrDirect, brand, deepEquals, EdgeTrigger, Expand, FixedArrayMap, HasField, HighImpedance, InteractionResult, isArray, isDefined, isNumber, isString, isUndefined, LogicValue, LogicValueRepr, mergeWhereDefined, Mode, RichStringEnum, toLogicValueRepr, typeOrUndefined, Unknown, validateJson } from "../utils"
import { ContextMenuData, ContextMenuItem, ContextMenuItemPlacement, DrawableWithDraggablePosition, DrawContext, DrawContextExt, MenuItems, Orientation, PositionSupportRepr } from "./Drawable"
import { DEFAULT_WIRE_COLOR, Node, NodeBase, NodeIn, NodeOut, WireColor } from "./Node"


type NodeSeqRepr<TFullNodeRepr> =
    ArrayOrDirect<number | string | TFullNodeRepr>

export const NodeSeqRepr = <T>(fullNodeRepr: t.Type<T>) =>
    t.union([
        t.number, // just the ID
        t.string, // a range of IDs as string
        fullNodeRepr,
        t.array(t.union([
            t.number,
            t.string,
            fullNodeRepr,
        ])),
    ], "NodeSeqRepr")

export const InputNodeRepr = t.type({
    id: t.number,
}, "InputNode")
export type InputNodeRepr = t.TypeOf<typeof InputNodeRepr>

export const OutputNodeRepr = t.intersection([
    t.type({ id: t.number }),
    t.partial({
        force: LogicValueRepr,
        initialValue: LogicValueRepr,
        color: t.keyof(WireColor),
    })], "OutputNode")
export type OutputNodeRepr = t.TypeOf<typeof OutputNodeRepr>

export const InputNodeSeqRepr = NodeSeqRepr(InputNodeRepr)
type InputNodeSeqRepr = t.TypeOf<typeof InputNodeSeqRepr>

export const OutputNodeSeqRepr = NodeSeqRepr(OutputNodeRepr)
type OutputNodeSeqRepr = t.TypeOf<typeof OutputNodeSeqRepr>

// Defines how the JSON looks like depending on the number of inputs and outputs.
// If only inputs or only outputs, all IDs are put into an "id" field.
// If both inputs and outputs are present, we have separate "in" and "out" fields.

// These are just 3 intermediate types
const OnlyInNodeIds = t.partial({ id: InputNodeSeqRepr })
type OnlyInNodeIds = t.TypeOf<typeof OnlyInNodeIds>

const OnlyOutNodeIds = t.partial({ id: OutputNodeSeqRepr })
type OnlyOutNodeIds = t.TypeOf<typeof OnlyOutNodeIds>

const InAndOutNodeIds = t.partial({
    in: InputNodeSeqRepr,
    out: OutputNodeSeqRepr,
})
type InAndOutNodeIds = t.TypeOf<typeof InAndOutNodeIds>

const NoNodeIds = t.type({})
type NoNodeIds = t.TypeOf<typeof NoNodeIds>


// This is the final conditional type showing what the JSON representation
// will look like depending on number of inputs and outputs
export const NodeIDsRepr = <THasIn extends boolean, THasOut extends boolean>(hasIn: THasIn, hasOut: THasOut)
    : THasIn extends true
    ? (THasOut extends true ? typeof InAndOutNodeIds : typeof OnlyInNodeIds)
    : (THasOut extends true ? typeof OnlyOutNodeIds : typeof NoNodeIds) => (
        hasIn ? (hasOut ? InAndOutNodeIds : OnlyInNodeIds)
            : (hasOut ? OnlyOutNodeIds : NoNodeIds)
    ) as any

type NodeIDsRepr<THasIn extends boolean, THasOut extends boolean>
    = THasIn extends true
    ? THasOut extends true ? InAndOutNodeIds : OnlyInNodeIds
    : THasOut extends true ? OnlyOutNodeIds : NoNodeIds


/**
 * Base representation of a component: position & repr of nodes
 */
export type ComponentRepr<THasIn extends boolean, THasOut extends boolean> =
    PositionSupportRepr & NodeIDsRepr<THasIn, THasOut>

export const ComponentRepr = <THasIn extends boolean, THasOut extends boolean>(hasIn: THasIn, hasOut: THasOut) =>
    t.intersection([PositionSupportRepr, NodeIDsRepr(hasIn, hasOut)], "Component")

export function isNodeArray<TNode extends Node>(obj: undefined | number | Node | ReadonlyGroupedNodeArray<TNode>): obj is ReadonlyGroupedNodeArray<TNode> {
    return isArray(obj)
}

export class NodeGroup<TNode extends Node> {

    private _orient: Orientation = "e" // default changed when nodes are added
    private _nodes: GroupedNodeArray<TNode>
    private _avgGridOffets: [number, number] | undefined = undefined
    public hasNameOverrides: boolean = false

    public constructor(
        public readonly parent: Component,
        public readonly name: string,
    ) {
        this._nodes = [] as unknown as GroupedNodeArray<TNode>
        this._nodes.group = this
    }

    public get nodes(): ReadonlyGroupedNodeArray<TNode> {
        return this._nodes
    }

    public addNode(node: TNode) {
        if (isDefined(this._avgGridOffets)) {
            console.warn("Adding nodes to a group after the group's position has been used")
        }
        this._nodes.push(node)
        this._orient = node.orient
    }

    private get avgGridOffsets(): [number, number] {
        if (!isDefined(this._avgGridOffets)) {
            let x = 0
            let y = 0
            for (const node of this._nodes) {
                x += node.gridOffsetX
                y += node.gridOffsetY
            }
            const len = this._nodes.length
            this._avgGridOffets = [x / len, y / len]
        }
        return this._avgGridOffets
    }

    public get orient(): Orientation {
        return this._orient
    }

    public get posXInParentTransform() {
        return this.parent.posX + this.avgGridOffsets[0] * GRID_STEP
    }

    public get posYInParentTransform() {
        return this.parent.posY + this.avgGridOffsets[1] * GRID_STEP
    }

    // allows the Node type (rather than N for group.nodes.indexOf(...))
    public indexOf(node: Node): number {
        for (let i = 0; i < this._nodes.length; i++) {
            if (this._nodes[i] === node) {
                return i
            }
        }
        return -1
    }

}

export enum ComponentState {
    SPAWNING,
    SPAWNED,
    DEAD
}

// Simplified, generics-free representation of a component
export type Component = ComponentBase<ComponentRepr<boolean, boolean>, unknown, NamedNodes<NodeIn>, NamedNodes<NodeOut>, boolean, boolean>

export const JsonFieldsComponents = ["in", "out", "gates", "ic", "labels", "layout"] as const
export type JsonFieldComponent = typeof JsonFieldsComponents[number]
export const JsonFieldsAux = ["v", "opts", "userdata"] as const
export type JsonFieldAux = typeof JsonFieldsAux[number]
export type JsonField = JsonFieldComponent | JsonFieldAux

export const ComponentCategories = RichStringEnum.withProps<{
    jsonFieldName: JsonFieldComponent
}>()({
    in: { jsonFieldName: "in" },
    out: { jsonFieldName: "out" },
    gate: { jsonFieldName: "gates" },
    ic: { jsonFieldName: "ic" },
    label: { jsonFieldName: "labels" },
    layout: { jsonFieldName: "layout" },
})

export type ComponentCategory = typeof ComponentCategories.type
export type MainJsonFieldName = typeof ComponentCategories.props[ComponentCategory]["jsonFieldName"]

export type DynamicName = Record<string | number, string>
export function isDynamicName(obj: any): obj is DynamicName {
    if (typeof obj !== "object") {
        return false
    }
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key) && typeof obj[key] !== "string") {
            return false
        }
    }
    return true
}
export type ComponentName = string | DynamicName | undefined
export const ComponentNameRepr = typeOrUndefined(
    t.union([
        t.string,
        t.record(t.union([t.string, t.number]), t.string),
    ])
)

export type NodeOutDesc = readonly [x: number, y: number, orient: Orientation, fullName?: string, opts?: { hasTriangle?: boolean, labelName?: string }]
export type NodeInDesc = readonly [x: number, y: number, orient: Orientation, fullName?: string, opts?: { hasTriangle?: boolean, labelName?: string, prefersSpike?: boolean, isClock?: boolean }]
export type NodeDesc = NodeOutDesc | NodeInDesc
export type NodeDescInGroup = readonly [x: number, y: number, shortNameOverride?: string]
export type NodeGroupDesc<D extends NodeDesc> = ReadonlyArray<D>
export type NodeGroupMultiDesc<D extends NodeDesc> = ReadonlyArray<NodeGroupDesc<D>>
export type NodeRec<D extends NodeDesc> = Record<string, D | NodeGroupDesc<D> | NodeGroupMultiDesc<D>>

function isNodeDesc<D extends NodeDesc>(desc: D | NodeGroupDesc<D> | NodeGroupMultiDesc<D>): desc is D {
    return isNumber(desc[0])
}

type GroupedNodeArray<TNode extends Node> = TNode[] & { group: NodeGroup<TNode> }
export type ReadonlyGroupedNodeArray<TNode extends Node> = readonly TNode[] & { group: NodeGroup<TNode> }

type MapDescToNode<TDesc, TNode extends Node>
    = TDesc extends NodeDesc ? TNode
    : TDesc extends Array<NodeDesc> ? GroupedNodeArray<TNode>
    : TDesc extends Array<Array<NodeDesc>> ? GroupedNodeArray<TNode>[]
    : never

type MapRecToNodes<TRec, TNode extends Node> = {
    [K in keyof TRec]: MapDescToNode<TRec[K], TNode>
}


// Named nodes according to the node description always have
// an '_all' array of all nodes in addition to the names
type NamedNodes<TNode> = { _all: readonly TNode[] }

type ExtractNodes<TRepr, TField extends "ins" | "outs", TNode extends Node> = Expand<
    (TRepr extends { _META?: { nodeRecs: { [K in TField]: infer TNodeRec } } }
        ? MapRecToNodes<TNodeRec, TNode> : { _empty: true })
    & NamedNodes<TNode>>

export type NodesIn<TRepr> = ExtractNodes<TRepr, "ins", NodeIn>
export type NodesOut<TRepr> = ExtractNodes<TRepr, "outs", NodeOut>

export type IsNonEmpty<TNamedNodes> = TNamedNodes extends { _empty: true } ? false : true

export type ExtractValue<TRepr> = TRepr extends { _META?: { value: infer TValue } } ? TValue : never

export type ExtractParams<TRepr> = TRepr extends { _META?: { params: infer TParams } } ? TParams : {}

export type ExtractParamDefs<TRepr> = TRepr extends { _META?: { paramDefs: infer TParamDefs extends Record<string, ParamDef<unknown>> } } ? TParamDefs : Record<string, ParamDef<unknown>>



export type InOutRecs = {
    ins?: NodeRec<NodeInDesc>
    outs?: NodeRec<NodeOutDesc>
}



//
// Base class for all components
//

export abstract class ComponentBase<
    TRepr extends ComponentRepr<THasIn, THasOut>, // JSON representation
    TValue = ExtractValue<TRepr>, // internal value recomputed when inputs change
    TInputNodes extends NamedNodes<NodeIn> = NodesIn<TRepr>,
    TOutputNodes extends NamedNodes<NodeOut> = NodesOut<TRepr>,
    THasIn extends boolean = IsNonEmpty<TInputNodes>,
    THasOut extends boolean = IsNonEmpty<TOutputNodes>, // in-out node presence
> extends DrawableWithDraggablePosition {

    public readonly category: ComponentCategory
    private _width: number
    private _height: number
    private _state: ComponentState
    private _value: TValue
    public readonly inputs: TInputNodes
    public readonly outputs: TOutputNodes
    public readonly inputGroups: Map<string, NodeGroup<NodeIn>>
    public readonly outputGroups: Map<string, NodeGroup<NodeOut>>

    protected constructor(
        editor: LogicEditor,
        def: InstantiatedComponentDef<TRepr, TValue>,
        saved: TRepr | undefined
    ) {
        super(editor, saved)

        this.category = def.category
        this._width = def.size.gridWidth * GRID_STEP
        this._height = def.size.gridHeight * GRID_STEP
        this._value = def.initialValue(saved)

        const ins = def.nodeRecs.ins
        const outs = def.nodeRecs.outs

        function countNodes(rec: NodeRec<NodeDesc> | undefined) {
            if (isUndefined(rec)) {
                return 0
            }
            let count = 0
            for (const desc of Object.values(rec)) {
                if (isNodeDesc(desc)) {
                    count++
                } else {
                    for (const innerDesc of desc) {
                        if (isNodeDesc(innerDesc)) {
                            count++
                        } else {
                            count += innerDesc.length
                        }
                    }
                }
            }
            return count
        }

        const numInputs = countNodes(ins)
        const numOutputs = countNodes(outs)

        if (isDefined(saved)) {
            // restoring
            this._state = ComponentState.SPAWNED
        } else {
            // newly placed
            this._state = ComponentState.SPAWNING
            editor.moveMgr.setDrawableMoving(this) // TODO this is BS; state (moving or not) should be determined from ctor params
        }

        // build node specs either from scratch if new or from saved data
        const [inputSpecs, outputSpecs, hasAnyPrecomputedInitialValues] =
            this.nodeSpecsFromRepr(saved, numInputs, numOutputs);

        // so, hasAnyPrecomputedInitialValues is true if ANY of the outputs was built
        // with "initialValue" in the JSON. This is used to stabilize circuits (such as
        // an SR latch) that would otherwise oscillate. But this also means that NO OTHER
        // OUTPUT from this component would be recomputed (even if they are always
        // propagated). So, it is a good idea to either set no initial values at all, or
        // to set all of them.

        // generate the input and output nodes
        [this.inputs, this.inputGroups] = this.makeNodes(ins, inputSpecs, NodeIn) as [TInputNodes, Map<string, NodeGroup<NodeIn>>];
        [this.outputs, this.outputGroups] = this.makeNodes(outs, outputSpecs, NodeOut) as [TOutputNodes, Map<string, NodeGroup<NodeOut>>]

        // setNeedsRecalc with a force propadation is needed:
        // * the forced propagation allows the current value (e.g. for InputBits)
        //   to be set to the outputs, if if the "new" value is the same as the current one
        // * setNeedsRecalc schedules a recalculation (e.g. for Gates)
        if (!hasAnyPrecomputedInitialValues) {
            this.setNeedsRecalc(true)
        } else {
            this.setNeedsPropagate()
        }
    }

    public setSpawned() {
        this._state = ComponentState.SPAWNED
        this.editor.moveMgr.setDrawableStoppedMoving(this)
    }

    public abstract toJSON(): TRepr

    // typically used by subclasses to provide only their specific JSON,
    // splatting in the result of super.toJSONBase() in the object
    protected override toJSONBase(): ComponentRepr<THasIn, THasOut> {
        return {
            ...super.toJSONBase(),
            ...this.buildNodesRepr(),
        }
    }

    // creates the input/output nodes based on array of offsets (provided
    // by subclass) and spec (either loaded from JSON repr or newly generated)
    private makeNodes<TNode extends Node, TDesc extends (TNode extends NodeIn ? NodeInDesc : NodeOutDesc)>(
        nodeRec: NodeRec<TDesc> | undefined,
        specs: readonly (InputNodeRepr | OutputNodeRepr)[],
        node: new (
            editor: LogicEditor,
            nodeSpec: InputNodeRepr | OutputNodeRepr,
            parent: Component,
            group: NodeGroup<TNode> | undefined,
            shortName: string,
            fullName: string,
            _gridOffsetX: number,
            _gridOffsetY: number,
            hasTriangle: boolean,
            orient: Orientation,
        ) => TNode) {

        const nodes: Record<string, TNode | ReadonlyArray<TNode> | ReadonlyArray<ReadonlyArray<TNode>>> = {}
        const allNodes: TNode[] = []
        const nodeGroups: Map<string, NodeGroup<TNode>> = new Map()

        if (isDefined(nodeRec)) {
            const makeNode = (group: NodeGroup<TNode> | undefined, shortName: string, desc: TDesc) => {
                const spec = specs[nextSpecIndex++]
                const [offsetX, offsetY, orient, nameOverride, options_] = desc
                const options = options_ as NodeInDesc[4] // bleh
                const isClock = options?.isClock ?? false
                const prefersSpike = options?.prefersSpike ?? false
                const hasTriangle = options?.hasTriangle ?? false
                if (isDefined(group) && isDefined(nameOverride)) {
                    // names in groups are considered short names to be used as labels
                    shortName = nameOverride
                    group.hasNameOverrides = true
                } else if (isDefined(options?.labelName)) {
                    shortName = options!.labelName
                }
                const fullName = isUndefined(nameOverride) ? shortName : nameOverride
                const newNode = new node(
                    this.editor,
                    spec,
                    this,
                    group,
                    shortName,
                    fullName,
                    offsetX,
                    offsetY,
                    hasTriangle,
                    orient,
                )
                if (prefersSpike || isClock) {
                    if (newNode instanceof NodeIn) {
                        newNode.prefersSpike = true // clock also prefers spike
                        newNode.isClock = isClock
                    } else {
                        console.warn(`prefersSpike is only supported for inputs, can't set it for ${name}`)
                    }
                }
                allNodes.push(newNode)
                return newNode
            }
            let nextSpecIndex = 0
            for (const [fieldName, desc] of Object.entries(nodeRec)) {
                if (isNodeDesc(desc)) {
                    // single
                    nodes[fieldName] = makeNode(undefined, fieldName, desc)
                } else {
                    // group
                    const makeNodesForGroup = (groupDesc: NodeGroupDesc<TDesc>) => {
                        const group = new NodeGroup<TNode>(this, fieldName)
                        nodeGroups.set(fieldName, group)
                        for (let i = 0; i < groupDesc.length; i++) {
                            group.addNode(makeNode(group, `${fieldName}${i}`, groupDesc[i]))
                        }
                        return group.nodes
                    }

                    if (isNodeDesc(desc[0])) {
                        // normal group
                        const groupDesc = desc as NodeGroupDesc<TDesc>
                        nodes[fieldName] = makeNodesForGroup(groupDesc)
                    } else {
                        // nested group
                        const groupMultiDesc = desc as NodeGroupMultiDesc<TDesc>
                        nodes[fieldName] = groupMultiDesc.map(makeNodesForGroup)
                    }
                }
            }
        }
        nodes._all = allNodes
        return [nodes, nodeGroups]
    }

    // generates two arrays of normalized node specs either as loaded from
    // JSON or obtained with default values when _repr is null and we're
    // creating a new component from scratch
    private nodeSpecsFromRepr(_repr: NodeIDsRepr<THasIn, THasOut> | undefined, numInputs: number, numOutputs: number): [
        inputSpecs: Array<InputNodeRepr>,
        outputSpecs: Array<OutputNodeRepr>,
        hasAnyPrecomputedInitialValues: boolean
    ] {
        const nodeMgr = this.editor.nodeMgr
        const makeDefaultSpec = () => ({ id: nodeMgr.newID() })
        const makeDefaultSpecArray = (len: number) => ArrayFillUsing(makeDefaultSpec, len)

        if (isUndefined(_repr)) {
            return [
                makeDefaultSpecArray(numInputs),
                makeDefaultSpecArray(numOutputs),
                false,
            ]
        }

        let inputSpecs: InputNodeRepr[] = []
        let outputSpecs: OutputNodeRepr[] = []

        const makeNormalizedSpecs = <TNodeNormized extends InputNodeRepr | OutputNodeRepr>(
            num: number,
            seqRepr?: ArrayOrDirect<string | number | TNodeNormized>,
        ) => {
            if (isUndefined(seqRepr)) {
                return makeDefaultSpecArray(num)
            }

            const specs: Array<TNodeNormized> = []
            function pushId(id: number) {
                specs.push({ id } as TNodeNormized)
                nodeMgr.markIDUsed(id)
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
                    specs.push(spec)
                    nodeMgr.markIDUsed(spec.id)
                }
            }
            return specs
        }

        // manually distinguishing the cases where we have no inputs or no
        // outputs as we then have a more compact JSON representation
        if (numInputs !== 0) {
            if (numOutputs !== 0) {
                const repr = _repr as InAndOutNodeIds
                inputSpecs = makeNormalizedSpecs(numInputs, repr.in)
                outputSpecs = makeNormalizedSpecs(numOutputs, repr.out)
            } else {
                const repr = _repr as OnlyInNodeIds
                inputSpecs = makeNormalizedSpecs(numInputs, repr.id)
            }
        } else if (numOutputs !== 0) {
            const repr = _repr as OnlyOutNodeIds
            outputSpecs = makeNormalizedSpecs(numOutputs, repr.id)
        }

        const hasAnyPrecomputedInitialValues =
            outputSpecs.some(spec => isDefined(spec.initialValue))

        return [inputSpecs, outputSpecs, hasAnyPrecomputedInitialValues]
    }

    // from the known nodes, builds the JSON representation of them,
    // using the most compact form available
    private buildNodesRepr(): NodeIDsRepr<THasIn, THasOut> {
        const numInputs = this.inputs._all.length
        const numOutputs = this.outputs._all.length

        // these two functions return either an array of JSON
        // representations, or just the element skipping the array
        // if there is only one
        function inNodeReprs(nodes: readonly Node[]): ArrayOrDirect<number | string> {
            const reprOne = (node: Node) => node.id
            if (nodes.length === 1) {
                return reprOne(nodes[0])
            } else {
                return compactRepr(nodes.map(reprOne))
            }
        }
        function outNodeReprs(nodes: readonly Node[]): ArrayOrDirect<number | string | OutputNodeRepr> {
            const reprOne = (node: Node) => {
                const valueNotForced = isUndefined(node.forceValue)
                const noInitialValue = isUndefined(node.initialValue)
                const hasStandardColor = node.color === DEFAULT_WIRE_COLOR
                if (valueNotForced && hasStandardColor && noInitialValue) {
                    return node.id
                } else {
                    return {
                        id: node.id,
                        intialValue: noInitialValue ? undefined : toLogicValueRepr(node.initialValue),
                        force: valueNotForced ? undefined : toLogicValueRepr(node.forceValue),
                        color: hasStandardColor ? undefined : node.color,
                    }
                }
            }
            if (nodes.length === 1) {
                return reprOne(nodes[0])
            } else {
                return compactRepr(nodes.map(reprOne))
            }
        }

        function compactRepr<TFullNodeRepr>(reprs: Array<number | TFullNodeRepr>): ArrayOrDirect<number | string | TFullNodeRepr> {
            // collapses consecutive numbers intro a string of the form "start-end" to save JSON space
            const newArray: Array<number | string | TFullNodeRepr> = []
            let currentRangeStart: number | undefined = undefined
            let currentRangeEnd: number | undefined = undefined
            function pushRange() {
                if (isDefined(currentRangeStart) && isDefined(currentRangeEnd)) {
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
                    if (isDefined(currentRangeStart) && repr - 1 === currentRangeEnd) {
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
                    ? { in: inNodeReprs(this.inputs._all), out: outNodeReprs(this.outputs._all) }
                    : { id: inNodeReprs(this.inputs._all) }
                : numOutputs !== 0
                    ? { id: outNodeReprs(this.outputs._all) }
                    : {}
        ) as NodeIDsRepr<THasIn, THasOut>
    }

    public get unrotatedWidth() {
        return this._width
    }

    public get unrotatedHeight() {
        return this._height
    }

    protected override toStringDetails(): string {
        return String(this.value)
    }

    public get state() {
        return this._state
    }

    public get allowsForcedOutputs() {
        return true
    }

    public get alwaysDrawMultiOutNodes() {
        return false
    }

    public *allNodes() {
        for (const node of this.inputs._all) {
            yield node
        }
        for (const node of this.outputs._all) {
            yield node
        }
    }

    public *allNodeGroups() {
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

    protected inputValues(nodes: readonly NodeIn[]): LogicValue[] {
        return nodes.map(node => node.value)
    }

    protected outputValues(nodes: readonly NodeOut[], values: LogicValue[], reverse = false) {
        const num = nodes.length
        if (values.length !== num) {
            throw new Error(`outputValues: expected ${num} values, got ${values.length}`)
        }
        for (let i = 0; i < num; i++) {
            const j = reverse ? num - i - 1 : i
            nodes[i].value = values[j]
        }
    }

    public setNeedsRecalc(forcePropagate = false) {
        this.editor.recalcMgr.enqueueForRecalc(this, forcePropagate)
    }

    private setNeedsPropagate() {
        this.editor.recalcMgr.enqueueForPropagate(this)
    }

    private updateNodePositions() {
        for (const node of this.allNodes()) {
            node.updatePositionFromParent()
        }
    }

    protected bounds(): DrawingRect {
        return new DrawingRect(this)
        // use with:
        // const bounds = this.bounds()
        // const { top, left, bottom, right, width, height } = bounds
    }

    protected doDraw(g: CanvasRenderingContext2D, ctx: DrawContext): void {
        this.doDrawDefault(g, ctx)
    }

    protected doDrawDefault(
        g: CanvasRenderingContext2D, ctx: DrawContext,
        opts_?: ((ctx: DrawContextExt, bounds: DrawingRect) => void) | {
            drawLabels?: (ctx: DrawContextExt, bounds: DrawingRect) => void,
            drawInside?: (bounds: DrawingRect) => void,
            skipLabels?: boolean,
            labelSize?: number,
            background?: string,
            componentName?: [name: ComponentName, onRight: boolean, value: string | number | (() => string | number)]
        }
    ) {
        const bounds = this.bounds()
        const opts = typeof opts_ !== "function" ? opts_ : { drawLabels: opts_ }

        // background
        g.fillStyle = opts?.background ?? COLOR_BACKGROUND
        g.fill(bounds.outline)

        // inputs/outputs lines
        for (const node of this.allNodes()) {
            this.drawWireLineTo(g, node, bounds)
        }

        // group boxes
        const drawLabels = !(opts?.skipLabels ?? false)
        if (drawLabels) {
            for (const group of this.allNodeGroups()) {
                if (!group.hasNameOverrides) {
                    this.drawGroupBox(g, group, bounds)
                }
            }
        }

        // additional inside drawing
        opts?.drawInside?.(bounds)

        // outline
        g.lineWidth = 3
        g.strokeStyle = ctx.borderColor
        g.stroke(bounds.outline)

        // labels
        ctx.inNonTransformedFrame(ctx => {
            if (isDefined(opts?.componentName?.[0])) {
                const [name, onRight, value] = opts!.componentName!
                const val = isNumber(value) || isString(value) ? value : value()
                drawComponentName(g, ctx, name, val, this, onRight)
            }

            if (drawLabels) {
                const labelSize = opts?.labelSize ?? 11
                g.fillStyle = COLOR_COMPONENT_INNER_LABELS
                g.textAlign = "center"

                g.font = `bold ${labelSize}px sans-serif`
                for (const group of this.allNodeGroups()) {
                    if (!group.hasNameOverrides) {
                        this.drawGroupLabel(ctx, group, bounds)
                    }
                }

                g.font = `${labelSize}px sans-serif`
                for (const node of this.allNodes()) {
                    if (isUndefined(node.group) || node.group.hasNameOverrides) {
                        this.drawNodeLabel(ctx, node, bounds)
                    }
                }
            }

            opts?.drawLabels?.(ctx, bounds)
        })
    }

    protected drawWireLineTo(g: CanvasRenderingContext2D, node: Node, bounds: DrawingRect) {
        if (node.isClock) {
            drawClockInput(g, bounds.left, node, (this as any)["_trigger"] ?? EdgeTrigger.rising)
            return
        }

        const offset = node.hasTriangle ? 3 : 0
        drawWireLineToComponent(g, node, ...this.anchorFor(node, bounds, offset), node.hasTriangle)
    }

    protected drawGroupBox(g: CanvasRenderingContext2D, group: NodeGroup<Node>, bounds: DrawingRect) {
        if (!shouldShowNode(group.nodes)) {
            return
        }

        const groupWidth = Orientation.isVertical(Orientation.add(this.orient, group.orient)) ? 8 : 6
        const first = group.nodes[0]
        const last = group.nodes[group.nodes.length - 1]
        const beforeAfterMargin = 2

        g.beginPath()
        switch (group.orient) {
            case "e":
                g.rect(bounds.right - groupWidth, first.posYInParentTransform - beforeAfterMargin, groupWidth, last.posYInParentTransform - first.posYInParentTransform + 2 * beforeAfterMargin)
                break
            case "w":
                g.rect(bounds.left, first.posYInParentTransform - beforeAfterMargin, groupWidth, last.posYInParentTransform - first.posYInParentTransform + 2 * beforeAfterMargin)
                break
            case "n":
                g.rect(last.posXInParentTransform - beforeAfterMargin, bounds.top, first.posXInParentTransform - last.posXInParentTransform + 2 * beforeAfterMargin, groupWidth)
                break
            case "s":
                g.rect(last.posXInParentTransform - beforeAfterMargin, bounds.bottom - groupWidth, first.posXInParentTransform - last.posXInParentTransform + 2 * beforeAfterMargin, groupWidth)
                break
        }

        g.fillStyle = COLOR_GROUP_SPAN
        g.fill()
    }

    protected drawNodeLabel(ctx: DrawContextExt, node: Node, bounds: DrawingRect): void {
        if (node.isClock) {
            return
        }
        drawLabel(ctx, this.orient, node.shortName, node.orient, ...this.anchorFor(node, bounds, 1), node)
    }

    protected drawGroupLabel(ctx: DrawContextExt, group: NodeGroup<Node>, bounds: DrawingRect): void {
        drawLabel(ctx, this.orient, group.name, group.orient, ...this.anchorFor(group, bounds, 1), group.nodes)
    }

    private anchorFor(elem: Node | NodeGroup<Node>, bounds: DrawingRect, offset: number): [number, number] {
        switch (elem.orient) {
            case "e": return [bounds.right + offset, elem.posYInParentTransform]
            case "w": return [bounds.left - offset, elem.posYInParentTransform]
            case "n": return [elem.posXInParentTransform, bounds.top - offset]
            case "s": return [elem.posXInParentTransform, bounds.bottom + offset]
        }
    }

    protected replaceWithComponent(newComp: Component): Component {
        // any component will work, but only inputs and outputs with
        // the same names will be reconnected and others will be lost

        const saveWires = <TNode extends NodeBase<any>, TWires>(nodes: readonly TNode[], getWires: (node: TNode) => TWires): Map<string, TWires | TWires[]> => {
            const savedWires: Map<string, TWires | TWires[]> = new Map()
            for (const node of nodes) {
                const group = node.group
                const wires = getWires(node)
                if (isUndefined(group)) {
                    savedWires.set(node.shortName, wires)
                } else {
                    let groupSavedNodes = savedWires.get(group.name) as TWires[]
                    if (!isArray(groupSavedNodes)) {
                        groupSavedNodes = new Array(group.nodes.length)
                        savedWires.set(group.name, groupSavedNodes)
                    }
                    groupSavedNodes[group.nodes.indexOf(node)] = wires
                }
            }
            return savedWires
        }

        const savedWiresIn = saveWires(this.inputs._all, node => node.incomingWire)
        const savedWiresOut = saveWires(this.outputs._all, node => node.outgoingWires)

        newComp.setPosition(this.posX, this.posY)
        newComp.setSpawned()

        const restoreNodes = <TNode extends NodeBase<any>, TWires>(savedWires: Map<string, TWires | TWires[]>, nodes: readonly TNode[], setWires: (wires: TWires | undefined, node: TNode) => void) => {
            for (const node of nodes) {
                const group = node.group
                if (isUndefined(group)) {
                    const wires = savedWires.get(node.shortName) as TWires
                    setWires(wires, node)
                } else {
                    const wiresArray = savedWires.get(group.name) as TWires[]
                    const wires = wiresArray[group.nodes.indexOf(node)]
                    setWires(wires, node)
                }
            }
        }

        restoreNodes(savedWiresIn, newComp.inputs._all, (wire, node) => {
            if (wire === null || isUndefined(wire)) {
                return
            }
            wire.setSecondNode(node)
        })
        const now = this.editor.timeline.adjustedTime()
        restoreNodes(savedWiresOut, newComp.outputs._all, (wires, node) => {
            if (isUndefined(wires) || wires.length === 0) {
                return
            }
            for (const wire of [...wires]) {
                wire.changeStartNode(node, now)
            }
        })

        const editor = this.editor
        const deleted = editor.tryDeleteDrawable(this)
        if (!deleted) {
            console.warn("Could not delete old component")
        }

        editor.undoMgr.takeSnapshot()
        editor.redrawMgr.addReason("component replaced", newComp)

        return newComp
    }

    public override mouseDown(e: MouseEvent | TouchEvent) {
        if (this.editor.mode >= Mode.CONNECT && !e.shiftKey) {
            // try clearing selection
            const mvtMgr = this.editor.cursorMovementMgr
            let elems
            if (isDefined(mvtMgr.currentSelection)
                && (elems = mvtMgr.currentSelection.previouslySelectedElements).size > 0
                && !elems.has(this)) {
                mvtMgr.currentSelection = undefined
            }
        }

        if (this.editor.mode >= Mode.CONNECT) {
            this.tryStartMoving(e)
        }
        return { wantsDragEvents: true }
    }

    public override mouseDragged(e: MouseEvent | TouchEvent) {
        if (this.editor.mode >= Mode.CONNECT) {
            this.updateWhileMoving(e)
        }
    }

    public override mouseUp(__: MouseEvent | TouchEvent) {
        let wasSpawning = false
        if (this._state === ComponentState.SPAWNING) {
            this._state = ComponentState.SPAWNED
            wasSpawning = true
        }
        const wasMoving = this.tryStopMoving()
        if (wasSpawning || wasMoving) {
            const newLinks = this.editor.nodeMgr.tryConnectNodesOf(this)
            if (newLinks.length > 0) {
                this.autoConnected(newLinks)
            }
            this.editor.setDirty("moved component")
            return InteractionResult.SimpleChange
        }
        return InteractionResult.NoChange
    }

    protected autoConnected(__newLinks: [Node, Component, Node][]) {
        // by default, do nothing
    }

    protected override updateSelfPositionIfNeeded(x: number, y: number, snapToGrid: boolean, e: MouseEvent | TouchEvent): undefined | [number, number] {
        if (this._state === ComponentState.SPAWNING) {
            return this.trySetPosition(x, y, snapToGrid)
        }
        return super.updateSelfPositionIfNeeded(x, y, snapToGrid, e)
    }

    protected override positionChanged() {
        this.updateNodePositions()
    }

    public override mouseClicked(e: MouseEvent | TouchEvent) {
        if (this.editor.mode >= Mode.CONNECT && e.shiftKey) {
            this.editor.cursorMovementMgr.toggleSelect(this)
            return true
        }
        return false
    }

    public override mouseDoubleClicked(e: MouseEvent | TouchEvent): boolean {
        if (this.editor.mode >= Mode.CONNECT && e.metaKey && this.canRotate()) {
            this.doSetOrient((() => {
                switch (this.orient) {
                    case "e": return "s"
                    case "s": return "w"
                    case "w": return "n"
                    case "n": return "e"
                }
            })())
            return true
        }
        return false
    }

    public override doSetOrient(orient: Orientation) {
        super.doSetOrient(orient)
        this.updateNodePositions()
    }

    public destroy() {
        this._state = ComponentState.DEAD
        for (const node of this.allNodes()) {
            node.destroy()
        }
    }

    public override get cursorWhenMouseover(): string | undefined {
        return this.lockPos ? undefined : "grab"
    }

    public override makeContextMenu(): ContextMenuData {
        const menuItems: ContextMenuData = []

        const baseItems = this.makeBaseContextMenu()
        const specificItems = this.makeComponentSpecificContextMenuItems()

        let lastWasSep = true
        function addItemsAt(placement: ContextMenuItemPlacement, items: MenuItems, insertSep = false) {
            if (insertSep) {
                if (!lastWasSep) {
                    menuItems.push(ContextMenuData.sep())
                }
                lastWasSep = true
            }
            for (const [pl, it] of items) {
                if (pl === placement) {
                    menuItems.push(it)
                    lastWasSep = false
                }
            }
        }

        addItemsAt("start", specificItems)
        addItemsAt("start", baseItems)
        addItemsAt("mid", baseItems, true)
        addItemsAt("mid", specificItems)
        addItemsAt("end", baseItems, true)
        addItemsAt("end", specificItems)

        return menuItems
    }

    private makeBaseContextMenu(): MenuItems {
        const setRefItems: MenuItems =
            this.editor.mode < Mode.FULL ? [] : [
                ["end", this.makeSetRefContextMenuItem()],
                ["end", ContextMenuData.sep()],
            ]

        return [
            ...this.makeOrientationAndPosMenuItems(),
            ...setRefItems,
            ["end", this.makeDeleteContextMenuItem()],
        ]
    }

    protected makeComponentSpecificContextMenuItems(): MenuItems {
        return []
    }

    protected makeDeleteContextMenuItem(): ContextMenuItem {
        return ContextMenuData.item("trash", S.Components.Generic.contextMenu.Delete, () => {
            this.editor.tryDeleteDrawable(this)
        }, true)
    }

    protected makeForceOutputsContextMenuItem(withSepBefore = false): MenuItems {
        const numOutputs = this.outputs._all.length

        if (numOutputs === 0 || this.editor.mode < Mode.FULL) {
            return []
        }

        const s = S.Components.Generic.contextMenu

        function makeOutputItems(out: NodeOut): ContextMenuItem[] {
            const currentForceValue = out.forceValue
            const items = [undefined, Unknown, true, false, HighImpedance]
                .map(newForceValue => ContextMenuData.item(
                    currentForceValue === newForceValue ? "check" : "none",
                    (() => {
                        switch (newForceValue) {
                            case undefined: return s.NormalOutput
                            case Unknown: return s.ForceAsUnknown
                            case true: return s.ForceAs1
                            case false: return s.ForceAs0
                            case HighImpedance: return s.ForceAsZ
                        }
                    })(),
                    () => {
                        out.forceValue = newForceValue
                    }
                ))

            // insert separator
            items.splice(1, 0, ContextMenuData.sep())
            return items
        }

        const footerItems = [
            ContextMenuData.sep(),
            ContextMenuData.text(s.ForceOutputDesc),
        ]

        const items: MenuItems = []
        if (withSepBefore) {
            items.push(["mid", ContextMenuData.sep()])
        }
        if (numOutputs === 1) {
            items.push(["mid", ContextMenuData.submenu("force", s.ForceOutputSingle, [
                ...makeOutputItems(this.outputs._all[0]!),
                ...footerItems,
            ])])

        } else {
            items.push(["mid", ContextMenuData.submenu("force", s.ForceOutputMultiple, [
                ...this.outputs._all.map((out) => {
                    const icon = isDefined(out.forceValue) ? "force" : "none"
                    return ContextMenuData.submenu(icon, s.Output + " " + out.fullName,
                        makeOutputItems(out)
                    )
                }),
                ...footerItems,
            ])])
        }

        return items
    }

    protected makeSetNameContextMenuItem(currentName: ComponentName, handler: (newName: ComponentName) => void): ContextMenuItem {
        const s = S.Components.Generic.contextMenu
        const caption = isUndefined(currentName) ? s.SetName : s.ChangeName
        return ContextMenuData.item("pen", caption, () => this.runSetNameDialog(currentName, handler))
    }

    protected runSetNameDialog(currentName: ComponentName, handler: (newName: ComponentName) => void): void {
        const currentDisplayName = isUndefined(currentName) || isString(currentName) ? currentName : JSON.stringify(currentName)
        const promptReturnValue = window.prompt(S.Components.Generic.contextMenu.SetNamePrompt, currentDisplayName)
        if (promptReturnValue !== null) {
            // OK button pressed
            let newName
            if (promptReturnValue.length === 0) {
                newName = undefined
            } else {
                // is it JSON that can be valid as a DynamicName?
                try {
                    const parsedValue = JSON.parse(promptReturnValue)
                    if (isDynamicName(parsedValue)) {
                        newName = parsedValue
                    } else {
                        newName = promptReturnValue
                    }
                } catch {
                    newName = promptReturnValue
                }
            }
            handler(newName)
        }
    }

    protected runSetFontDialog(currentFont: string, defaultIfEmpty: string, callback: (font: string) => void) {
        const s = S.Components.Generic.contextMenu
        const promptReturnValue = window.prompt(s.SetFontPrompt[0] + defaultIfEmpty + s.SetFontPrompt[1], currentFont === defaultIfEmpty ? "" : currentFont)
        if (promptReturnValue !== null) {
            const newFont = promptReturnValue.length === 0 ? defaultIfEmpty : promptReturnValue
            callback(newFont)
        }
    }

}


export abstract class ParametrizedComponentBase<
    TRepr extends ComponentRepr<THasIn, THasOut>, // JSON representation
    TValue = ExtractValue<TRepr>, // internal value recomputed when inputs change
    TParamDefs extends ExtractParamDefs<TRepr> = ExtractParamDefs<TRepr>,
    TParams extends ExtractParams<TRepr> = ExtractParams<TRepr>,
    TInputNodes extends NamedNodes<NodeIn> = NodesIn<TRepr>,
    TOutputNodes extends NamedNodes<NodeOut> = NodesOut<TRepr>,
    THasIn extends boolean = IsNonEmpty<TInputNodes>,
    THasOut extends boolean = IsNonEmpty<TOutputNodes>,// in-out node presence
> extends ComponentBase<
    TRepr,
    TValue,
    TInputNodes,
    TOutputNodes,
    THasIn,
    THasOut
> {

    private _def: SomeParamCompDef<TParamDefs>

    protected constructor(
        editor: LogicEditor,
        [instance, def]: [
            InstantiatedComponentDef<TRepr, TValue>,
            SomeParamCompDef<TParamDefs>,
        ],
        saved: TRepr | undefined
    ) {
        super(editor, instance, saved)
        this._def = def
    }

    protected makeChangeParamsContextMenuItem<
        TField extends (keyof TParams & keyof TParamDefs),
        TVal extends TParams[TField] = TParams[TField]
    >(
        icon: IconName,
        [caption, itemCaption]: [string, Template<["val"]>],
        currentValue: TVal,
        fieldName: TField,
        values?: readonly TVal[],
    ): [ContextMenuItemPlacement, ContextMenuItem] {
        const makeChangeValueItem = (val: TVal) => {
            const isCurrent = currentValue === val
            const icon = isCurrent ? "check" : "none"
            const action = isCurrent ? () => undefined : () => {
                const newParams: Partial<TParams> = {}
                newParams[fieldName] = val
                this.replaceWithNewParams(newParams)
            }
            return ContextMenuData.item(icon, itemCaption.expand({ val }), action)
        }

        if (isUndefined(values)) {
            values = (this._def.paramDefs[fieldName] as ParamDef<TVal>).range
        }
        return ["mid", ContextMenuData.submenu(icon, caption, values.map(makeChangeValueItem))]
    }

    protected replaceWithNewParams(newParams: Partial<TParams>): Component | undefined {
        const currentRepr = this.toJSON()
        const newRepr = { ...currentRepr, ...newParams }
        delete (newRepr as ComponentRepr<true, true>).in
        delete (newRepr as ComponentRepr<true, true>).out
        delete (newRepr as ComponentRepr<true, false>).id

        const newComp = this._def.makeFromJSON(this.editor, newRepr)
        if (isUndefined(newComp)) {
            console.warn("Could not create component variant")
            return undefined
        }

        return this.replaceWithComponent(newComp)
    }

    public override keyDown(e: KeyboardEvent): void {
        if (e.key === "+") {
            this.tryChangeParam(0, true)
        } else if (e.key === "-") {
            this.tryChangeParam(0, false)
        } else if (e.key === "*") {
            this.tryChangeParam(1, true)
        } else if (e.key === "/") {
            this.tryChangeParam(1, false)
        } else {
            super.keyDown(e)
        }
    }

    private tryChangeParam(paramIndex: number, increase: boolean): void {
        const params = Object.keys(this._def.defaultParams)
        const numParams = params.length
        if (paramIndex >= numParams) {
            return
        }
        const paramName = params[paramIndex]
        let currentParamValue = (this.toJSON() as any)[paramName]
        const paramDef = this._def.paramDefs[paramName]
        if (isUndefined(currentParamValue)) {
            currentParamValue = paramDef.defaultValue
        }
        if (!isNumber(currentParamValue)) {
            return
        }

        const newParamValue = paramDef.nextValue(currentParamValue, increase)
        if (isUndefined(newParamValue) || newParamValue === currentParamValue) {
            return
        }
        const newComp = this.replaceWithNewParams({ [paramName]: newParamValue } as Partial<TParams>)
        if (isDefined(newComp)) {
            this.editor.cursorMovementMgr.setCurrentMouseOverComp(newComp)
        }
    }

}



//
// Node definition helpers
//

export function group<const TDescArr extends readonly NodeDescInGroup[]>(orient: Orientation, nodes: TDescArr) {
    return FixedArrayMap(nodes, ([x, y, name]) => [x, y, orient, name] as const)
}

export function groupVertical(orient: "e" | "w", x: number, yCenter: number, num: number, spacing?: number) {
    const spacing_ = spacing ?? (useCompact(num) ? 1 : 2)
    const span = (num - 1) * spacing_
    const yTop = yCenter - span / 2
    return group(orient,
        ArrayFillUsing(i => [x, yTop + i * spacing_], num)
    )
}

export function groupVerticalMulti(orient: "e" | "w", x: number, yCenter: number, numOuter: number, numInner: number) {
    const innerSpacing = useCompact(numInner === 1 ? numOuter : numInner) ? 1 : 2
    const groupSpacing = numInner === 1 ? innerSpacing : innerSpacing * 2
    const groupOffset = (numInner - 1) * innerSpacing + groupSpacing
    const span = numOuter * (numInner - 1) * innerSpacing + (numOuter - 1) * groupSpacing
    const yTop = yCenter - span / 2
    return ArrayFillUsing(g => group(orient,
        ArrayFillUsing(i => [x, yTop + g * groupOffset + i * innerSpacing], numInner)
    ), numOuter)
}

export function groupHorizontal(orient: "n" | "s", xCenter: number, y: number, num: number, spacing?: number) {
    const spacing_ = spacing ?? (useCompact(num) ? 1 : 2)
    const span = (num - 1) * spacing_
    const xRight = xCenter + span / 2
    return group(orient,
        ArrayFillUsing(i => [xRight - i * spacing_, y], num)
    )
}



//
// Repr and friends
//

/** Represents the JSON object holding properties from the passed component def */
export type Repr<TDef>
    // case: Parameterized component def
    = TDef extends ParametrizedComponentDef<infer TTypeName, infer THasIn, infer THasOut, infer __TVariantName, infer TProps, infer TParamDefs, infer TInOutRecs, infer TValue, infer __TValueDefaults, infer TParams, infer __TResolvedParams, infer __TWeakRepr>
    ? t.TypeOf<t.TypeC<TypeFieldProp<TTypeName> & TProps>> & ComponentRepr<THasIn, THasOut> & {
        _META?: {
            nodeRecs: TInOutRecs,
            value: TValue,
            paramDefs: TParamDefs,
            params: TParams,
        }
    }
    // case: Unparameterized component def
    : TDef extends ComponentDef<infer TTypeName, infer TInOutRecs, infer TValue, infer __TValueDefaults, infer TProps, infer THasIn, infer THasOut, infer __TWeakRepr>
    ? t.TypeOf<t.TypeC<TypeFieldProp<TTypeName> & TProps>> & ComponentRepr<THasIn, THasOut> & {
        _META?: {
            nodeRecs: TInOutRecs,
            value: TValue,
            paramDefs: {},
            params: {},
        }
    }
    // case: Abstract parameterized component def
    : TDef extends {
        repr: infer TProps extends t.Props,
        params: infer TParamDefs extends Record<string, ParamDef<unknown>>,
        makeNodes: (...args: any) => infer TInOutRecs,
        initialValue?: (...args: any) => infer TValue,
    }
    ? Expand<t.TypeOf<t.TypeC<TProps>> & ComponentRepr<true, true> & {
        _META?: {
            nodeRecs: TInOutRecs,
            value: TValue,
            paramDefs: TParamDefs,
            params: ParamsFromDefs<TParamDefs>,
        }
    }>
    // case: Abstract component def
    : TDef extends {
        repr: infer TProps extends t.Props,
        makeNodes: (...args: any) => infer TInOutRecs,
        initialValue?: (...args: any) => infer TValue,
    }
    ? Expand<t.TypeOf<t.TypeC<TProps>> & ComponentRepr<true, true> & {
        _META?: {
            nodeRecs: TInOutRecs,
            value: TValue,
            paramDefs: {},
            params: {},
        }
    }>
    : never

export type Value<TDef>
    = TDef extends ParametrizedComponentDef<infer __TTypeName, infer __THasIn, infer __THasOut, infer __TVariantName, infer __TProps, infer __TParamDefs, infer __TInOutRecs, infer TValue, infer __TValueDefaults, infer __TParams, infer __TResolvedParams, infer __TWeakRepr>
    ? TValue : never

type TypeFieldProp<TTypeName extends string | undefined>
    = undefined extends TTypeName ? {}
    : TTypeName extends string ? { type: t.LiteralC<TTypeName> }
    : never

function typeFieldProp<
    TTypeName extends string | undefined
>(type: TTypeName): TypeFieldProp<TTypeName> {

    if (isUndefined(type)) {
        return {} as any
    }
    return {
        type: t.literal(type),
    } as any
}

function makeComponentRepr<
    TTypeName extends string | undefined,
    TProps extends t.Props,
    THasIn extends boolean,
    THasOut extends boolean,
>(type: TTypeName, hasIn: THasIn, hasOut: THasOut, props: TProps) {
    return t.intersection([t.type({
        ...typeFieldProp(type),
        ...props,
    }), ComponentRepr(hasIn, hasOut)], type)
}



//
// ComponentDef and friends
//

export type ComponentGridSize = { gridWidth: number, gridHeight: number }

export type InstantiatedComponentDef<
    TRepr extends t.TypeOf<t.Mixed>,
    TValue,
> = {
    category: ComponentCategory,
    size: ComponentGridSize,
    nodeRecs: InOutRecs,
    initialValue: (saved: TRepr | undefined) => TValue,
}

export class ComponentDef<
    TTypeName extends string | undefined,
    TInOutRecs extends InOutRecs,
    TValue,
    TValueDefaults extends Record<string, unknown> = Record<string, unknown>,
    TProps extends t.Props = {},
    THasIn extends boolean = HasField<TInOutRecs, "ins">,
    THasOut extends boolean = HasField<TInOutRecs, "outs">,
    TRepr extends ReprWith<TTypeName, THasIn, THasOut, TProps> = ReprWith<TTypeName, THasIn, THasOut, TProps>,
> implements InstantiatedComponentDef<TRepr, TValue> {

    public readonly nodeRecs: TInOutRecs
    public readonly repr: t.Decoder<Record<string, unknown>, TRepr>

    public impl: (new (editor: LogicEditor, saved?: TRepr) => Component) = undefined as any

    public constructor(
        public readonly category: ComponentCategory,
        public readonly type: TTypeName,
        public readonly aults: TValueDefaults,
        public readonly size: ComponentGridSize,
        private readonly _buttonProps: LibraryButtonProps,
        private readonly _initialValue: (saved: t.TypeOf<t.TypeC<TProps>> | undefined, defaults: TValueDefaults) => TValue,
        makeNodes: (size: ComponentGridSize, defaults: TValueDefaults) => TInOutRecs,
        repr?: TProps,
    ) {
        const nodes = makeNodes(size, aults)
        this.nodeRecs = nodes

        const hasIn = ("ins" in nodes) as THasIn
        const hasOut = ("outs" in nodes) as THasOut
        this.repr = makeComponentRepr(type, hasIn, hasOut, repr ?? ({} as TProps)) as any
    }

    public isValid() {
        return isDefined(this.impl)
    }

    public initialValue(saved?: TRepr): TValue {
        return this._initialValue(saved, this.aults)
    }

    public button(visual: ComponentKey & ImageName | [ComponentKey, ImageName], options?: LibraryButtonOptions): LibraryItem {
        return {
            category: this.category,
            type: this.type,
            visual,
            width: this._buttonProps.imgWidth,
            ...options,
        }
    }

    public make<TComp extends Component>(editor: LogicEditor): TComp {
        const comp = new this.impl(editor)
        editor.components.add(comp)
        return comp as TComp
    }

    public makeFromJSON(editor: LogicEditor, data: Record<string, unknown>): Component | undefined {
        const validated = validateJson(data, this.repr, this.impl!.name ?? "component")
        if (isUndefined(validated)) {
            return undefined
        }
        const comp = new this.impl(editor, validated)
        editor.components.add(comp)
        return comp
    }

}



export function defineComponent<
    TTypeName extends string | undefined,
    TInOutRecs extends InOutRecs,
    TValue,
    TValueDefaults extends Record<string, unknown> = Record<string, unknown>,
    TProps extends t.Props = {},
>(
    category: ComponentCategory, type: TTypeName,
    { button, repr, valueDefaults, size, makeNodes, initialValue }: {
        button: LibraryButtonProps,
        repr?: TProps,
        valueDefaults: TValueDefaults,
        size: ComponentGridSize,
        makeNodes: (size: ComponentGridSize, defaults: TValueDefaults) => TInOutRecs,
        initialValue?: (saved: t.TypeOf<t.TypeC<TProps>> | undefined, defaults: TValueDefaults) => TValue
    }
) {
    return new ComponentDef(category, type, valueDefaults, size, button, initialValue ?? (() => undefined as TValue), makeNodes, repr,)
}



export function defineAbstractComponent<
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
        size: ComponentGridSize,
        makeNodes: (...args: TArgs) => TInOutRecs,
        initialValue: (saved: TRepr | undefined, defaults: TValueDefaults) => TValue
    },
) {
    return {
        ...items,
        aults: items.valueDefaults,
    }
}



//
// ParameterizedComponentDef and friends
//

export type SomeParamCompDef<TParamDefs extends Record<string, ParamDef<unknown>>> = ParametrizedComponentDef<string | undefined, boolean, boolean, any, t.Props, TParamDefs, InOutRecs, unknown, any, ParamsFromDefs<TParamDefs>, any, any>

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

export function param<T>(defaultValue: T, range?: T[]): ParamDef<T> {
    if (isUndefined(range)) {
        return new ParamDef(defaultValue, [], () => true)
    }
    return new ParamDef(defaultValue, range, val => range.includes(val as T))
}

export type ParamsFromDefs<TDefs extends Record<string, ParamDef<unknown>>> = {
    [K in keyof TDefs]: TDefs[K] extends ParamDef<infer T> ? T : never
}

function paramDefaults<TParamDefs extends Record<string, ParamDef<unknown>>>(defs: TParamDefs): ParamsFromDefs<TParamDefs> {
    return Object.fromEntries(Object.entries(defs).map(([k, v]) => [k, v.defaultValue])) as any
}

export class ParametrizedComponentDef<
    TTypeName extends string | undefined,
    THasIn extends boolean,
    THasOut extends boolean,
    TVariantName extends (undefined extends TTypeName ? string : `${TTypeName}-${string}`),
    TProps extends t.Props,
    TParamDefs extends Record<string, ParamDef<unknown>>,
    TInOutRecs extends InOutRecs,
    TValue,
    TValueDefaults extends Record<string, unknown> = Record<string, unknown>,
    TParams extends ParamsFromDefs<TParamDefs> = ParamsFromDefs<TParamDefs>,
    TResolvedParams extends Record<string, unknown> = TParams,
    TRepr extends ReprWith<TTypeName, THasIn, THasOut, TProps> = ReprWith<TTypeName, THasIn, THasOut, TProps>,
> {

    public readonly defaultParams: TParams
    public readonly aults: TValueDefaults & TParams
    public readonly repr: t.Decoder<Record<string, unknown>, TRepr>

    public impl: (new (editor: LogicEditor, params: TResolvedParams, saved?: TRepr) => Component) = undefined as any

    public constructor(
        public readonly category: ComponentCategory,
        public readonly type: TTypeName,
        hasIn: THasIn,
        hasOut: THasOut,
        public readonly variantName: (params: TParams) => TVariantName,
        private readonly _buttonProps: LibraryButtonProps,
        repr: TProps,
        valueDefaults: TValueDefaults,
        public readonly paramDefs: TParamDefs,
        public readonly size: (params: TResolvedParams) => ComponentGridSize,
        private readonly _makeNodes: (params: TResolvedParams & ComponentGridSize, valueDefaults: TValueDefaults) => TInOutRecs,
        private readonly _initialValue: (saved: TRepr | undefined, params: TResolvedParams) => TValue,
        private readonly _validateParams: (params: TParams, paramDefs: TParamDefs) => TResolvedParams,
    ) {
        this.defaultParams = paramDefaults(paramDefs) as TParams
        this.aults = { ...valueDefaults, ...this.defaultParams }
        this.repr = makeComponentRepr(type, hasIn, hasOut, repr ?? ({} as TProps)) as any
    }

    public isValid() {
        return isDefined(this.impl)
    }

    public with(params: TResolvedParams): [InstantiatedComponentDef<TRepr, TValue>, this] {
        const size = this.size(params)
        const nodes = this._makeNodes({ ...size, ...params }, this.aults)
        return [{
            category: this.category,
            size,
            nodeRecs: nodes,
            initialValue: (saved: TRepr | undefined) => this._initialValue(saved, params),
        }, this]
    }

    public button(params: TParams, visual: ComponentKey & ImageName | [ComponentKey, ImageName], options?: LibraryButtonOptions): LibraryItem {
        const completedType = isString(params.type) ? params.type : this.type
        return {
            category: this.category,
            type: completedType,
            params: defParams<TParamDefs, TParams>(this, params),
            visual,
            width: this._buttonProps.imgWidth,
            ...options,
        }
    }

    public make<TComp extends Component>(editor: LogicEditor, params?: TParams): TComp {
        const fullParams = isUndefined(params) ? this.defaultParams : mergeWhereDefined(this.defaultParams, params)
        const resolvedParams = this.doValidate(fullParams)
        const comp = new this.impl(editor, resolvedParams)
        editor.components.add(comp)
        return comp as TComp
    }

    public makeFromJSON(editor: LogicEditor, data: Record<string, unknown>): Component | undefined {
        const validated = validateJson(data, this.repr, this.impl!.name ?? "component")
        if (isUndefined(validated)) {
            return undefined
        }
        const fullParams = mergeWhereDefined(this.defaultParams, validated)
        const resolvedParams = this.doValidate(fullParams)
        const comp = new this.impl(editor, resolvedParams, validated)
        editor.components.add(comp)
        return comp
    }

    private doValidate(fullParams: TParams) {
        const className = this.impl?.name ?? "component"
        fullParams = Object.fromEntries(Object.entries(this.paramDefs).map(([paramName, paramDef]) => {
            const paramValue = fullParams[paramName] ?? paramDef.defaultValue
            const validatedValue = paramDef.validate(paramValue, `${className}.${paramName}`)
            return [paramName, validatedValue]
        })) as TParams
        return this._validateParams(fullParams, this.paramDefs)
    }

}

export type Params<TDef>
    // case: Parameterized component def
    = TDef extends ParametrizedComponentDef<infer __TTypeName, infer __THasIn, infer __THasOut, infer __TVariantName, infer __TProps, infer __TParamDefs, infer __TInOutRecs, infer __TValue, infer __TValueDefaults, infer TParams, infer __TResolvedParams, infer __TWeakRepr> ? TParams
    // case: Abstract base component def
    : TDef extends { paramDefs: infer TParamDefs extends Record<string, ParamDef<unknown>> } ? ParamsFromDefs<TParamDefs>
    : never

export type ResolvedParams<TDef>
    // case: Parameterized component def
    = TDef extends ParametrizedComponentDef<infer __TTypeName, infer __THasIn, infer __THasOut, infer __TVariantName, infer __TProps, infer __TParamDefs, infer __TInOutRecs, infer __TValue, infer __TValueDefaults, infer __TParams, infer TResolvedParams, infer __TWeakRepr> ? TResolvedParams
    // case: Abstract base component def
    : TDef extends { validateParams?: infer TFunc } ?
    TFunc extends (...args: any) => any ? ReturnType<TFunc> : never
    : never


type ReprWith<
    TTypeName extends string | undefined,
    THasIn extends boolean,
    THasOut extends boolean,
    TProps extends t.Props,
> = t.TypeOf<t.TypeC<TProps & TypeFieldProp<TTypeName>>> & ComponentRepr<THasIn, THasOut>


export function defineParametrizedComponent<
    TTypeName extends string | undefined,
    THasIn extends boolean,
    THasOut extends boolean,
    TVariantName extends (undefined extends TTypeName ? string : `${TTypeName}-${string}`),
    TProps extends t.Props,
    TValueDefaults extends Record<string, unknown>,
    TParamDefs extends Record<string, ParamDef<unknown>>,
    TInOutRecs extends InOutRecs,
    TValue,
    TParams extends ParamsFromDefs<TParamDefs> = ParamsFromDefs<TParamDefs>,
    TResolvedParams extends Record<string, unknown> = TParams,
    TRepr extends ReprWith<TTypeName, THasIn, THasOut, TProps> = ReprWith<TTypeName, THasIn, THasOut, TProps>,
>(
    category: ComponentCategory, type: TTypeName, hasIn: THasIn, hasOut: THasOut,
    { variantName, button, repr, valueDefaults, params, validateParams, size, makeNodes, initialValue }: {
        variantName: (params: TParams) => TVariantName,
        button: LibraryButtonProps,
        repr: TProps,
        valueDefaults: TValueDefaults,
        params: TParamDefs,
        validateParams?: (params: TParams, paramDefs: TParamDefs) => TResolvedParams,
        size: (params: TResolvedParams) => ComponentGridSize,
        makeNodes: (params: TResolvedParams & ComponentGridSize, valueDefaults: TValueDefaults) => TInOutRecs,
        initialValue: (saved: TRepr | undefined, params: TResolvedParams) => TValue,
    },
) {
    return new ParametrizedComponentDef(category, type, hasIn, hasOut, variantName, button, repr, valueDefaults, params, size, makeNodes, initialValue, validateParams ?? ((params: TParams) => params as unknown as TResolvedParams))
}

function defParams<
    TParamDefs extends Record<string, ParamDef<unknown>>,
    TParams extends ParamsFromDefs<TParamDefs>
>(
    def: ParametrizedComponentDef<string | undefined, boolean, boolean, any, any, TParamDefs, InOutRecs, any, any, TParams, any, any>,
    params: TParams
): t.Branded<DefAndParams<TParamDefs, TParams>, "params"> {
    return brand<"params">()({ def, params } as DefAndParams<TParamDefs, TParams>)
}

export function defineAbstractParametrizedComponent<
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
        validateParams?: (params: TParams, paramDefs: TParamDefs) => TResolvedParams
        size: (params: TResolvedParams) => ComponentGridSize,
        makeNodes: (params: TResolvedParams & ComponentGridSize, valueDefaults: TValueDefaults) => TInOutRecs,
        initialValue: (saved: TRepr | undefined, params: TResolvedParams) => TValue,
    },
) {
    return items
}
