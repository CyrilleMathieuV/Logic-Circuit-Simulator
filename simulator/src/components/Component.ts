import * as t from "io-ts"
import { GRID_STEP } from "../drawutils"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { asArray, deepEquals, Expand, FixedArray, FixedArraySize, FixedArraySizeNonZero, FixedReadonlyArray, forceTypeOf, HighImpedance, isArray, isDefined, isNotNull, isNumber, isString, isUndefined, LogicValue, LogicValueRepr, Mode, RichStringEnum, toLogicValueRepr, typeOrUndefined, Unknown } from "../utils"
import { ContextMenuData, ContextMenuItem, ContextMenuItemPlacement, DrawableWithDraggablePosition, Orientation, PositionSupportRepr } from "./Drawable"
import { DEFAULT_WIRE_COLOR, Node, NodeIn, NodeOut, WireColor } from "./Node"


// Node IDs are just represented by a non-negative number
export const NodeID = t.number
export type NodeID = t.TypeOf<typeof NodeID>

// Input nodes are represented by just the ID; output nodes can be forced
// to a given value to bypass their naturally computed value
export const InputNodeRepr = t.type({ id: NodeID }, "InputNode")
export type InputNodeRepr = t.TypeOf<typeof InputNodeRepr>
export const OutputNodeRepr = t.intersection([t.type({ id: NodeID }), t.partial({
    force: LogicValueRepr,
    initialValue: LogicValueRepr,
    color: typeOrUndefined(t.keyof(WireColor)),
})], "OutputNode")
export type OutputNodeRepr = t.TypeOf<typeof OutputNodeRepr>

// Allows collapsing an array of 1 element into the element itself,
// used for compact JSON representation. Does not work well if T itself is
// an array
export const FixedArrayOrDirect = <T extends t.Mixed, N extends FixedArraySizeNonZero>(tpe: T, n: N) =>
    (n === 1) ? tpe : FixedArray<T, N>(tpe, n)
export type FixedArrayOrDirect<T, N extends FixedArraySizeNonZero> =
    N extends 1 ? T : FixedArray<T, N>


// Defines how the JSON looks like depending on the number of inputs and outputs.
// If only inputs or only outputs, all IDs are put into an "id" field.
// If both inputs and outputs are present, we have separate "in" and "out" fields.

// These are just 3 intermediate types
const OnlyInNodeIds = <N extends FixedArraySizeNonZero>(n: N) =>
    t.type({ id: FixedArrayOrDirect(t.union([NodeID, InputNodeRepr]), n) })
type OnlyInNodeIds<N extends FixedArraySizeNonZero> =
    { id: FixedArrayOrDirect<NodeID | InputNodeRepr, N> }

const OnlyOutNodeIds = <N extends FixedArraySizeNonZero>(n: N) =>
    t.type({ id: FixedArrayOrDirect(t.union([NodeID, OutputNodeRepr]), n) })
type OnlyOutNodeIds<N extends FixedArraySizeNonZero> =
    { id: FixedArrayOrDirect<NodeID | OutputNodeRepr, N> }

const InAndOutNodeIds = <N extends FixedArraySizeNonZero, M extends FixedArraySizeNonZero>(n: N, m: M) =>
    t.type({
        in: FixedArrayOrDirect(t.union([NodeID, InputNodeRepr]), n),
        out: FixedArrayOrDirect(t.union([NodeID, OutputNodeRepr]), m),
    })
type InAndOutNodeIds<N extends FixedArraySizeNonZero, M extends FixedArraySizeNonZero> = {
    in: FixedArrayOrDirect<NodeID | InputNodeRepr, N>
    out: FixedArrayOrDirect<NodeID | OutputNodeRepr, M>
}

// This is the final conditional type showing what the JSON representation
// will look like depending on number of inputs and outputs
export const NodeIDsRepr = <NumInputs extends FixedArraySize, NumOutputs extends FixedArraySize>(numInputs: NumInputs, numOutputs: NumOutputs) =>
    numInputs > 0
        ? /* NumInputs != 0 */ (
            numOutputs > 0
                ? /* NumInputs != 0, NumOutputs != 0 */ InAndOutNodeIds(numInputs as FixedArraySizeNonZero, numOutputs as FixedArraySizeNonZero)
                : /* NumInputs != 0, NumOutputs == 0 */ OnlyInNodeIds(numInputs as FixedArraySizeNonZero)
        )
        : /* NumInputs == 0 */  (
            numOutputs > 0
                ? /* NumInputs == 0, NumOutputs != 0 */ OnlyOutNodeIds(numOutputs as FixedArraySizeNonZero)
                // eslint-disable-next-line @typescript-eslint/ban-types
                : /* NumInputs == 0, NumOutputs == 0 */ t.type({})
        )
export type NodeIDsRepr<NumInputs extends FixedArraySize, NumOutputs extends FixedArraySize> =
    NumInputs extends FixedArraySizeNonZero
    ? /* NumInputs != 0 */ (
        NumOutputs extends FixedArraySizeNonZero
        ? /* NumInputs != 0, NumOutputs != 0 */ InAndOutNodeIds<NumInputs, NumOutputs>
        : /* NumInputs != 0, NumOutputs == 0 */ OnlyInNodeIds<NumInputs>
    )
    : /* NumInputs == 0 */  (
        NumOutputs extends FixedArraySizeNonZero
        ? /* NumInputs == 0, NumOutputs != 0 */ OnlyOutNodeIds<NumOutputs>
        // eslint-disable-next-line @typescript-eslint/ban-types
        : /* NumInputs == 0, NumOutputs == 0 */ {}
    )

// Tests

// type IDs_00 = Expand<NodeIDsRepr<0, 0>>
// type IDs_01 = Expand<NodeIDsRepr<0, 1>>
// type IDs_10 = Expand<NodeIDsRepr<1, 0>>
// type IDs_11 = Expand<NodeIDsRepr<1, 1>>
// type IDs_02 = Expand<NodeIDsRepr<0, 2>>
// type IDs_20 = Expand<NodeIDsRepr<2, 0>>
// type IDs_12 = Expand<NodeIDsRepr<1, 2>>
// type IDs_21 = Expand<NodeIDsRepr<2, 1>>
// type IDs_22 = Expand<NodeIDsRepr<2, 2>>

// A generic component is represented by its position
// and the representation of its nodes
export type ComponentRepr<NumInputs extends FixedArraySize, NumOutputs extends FixedArraySize> =
    PositionSupportRepr & NodeIDsRepr<NumInputs, NumOutputs>

export const ComponentRepr = <NumInputs extends FixedArraySize, NumOutputs extends FixedArraySize>(numInputs: NumInputs, numOutputs: NumOutputs) =>
    forceTypeOf(
        t.intersection([PositionSupportRepr, NodeIDsRepr(numInputs, numOutputs)], `Component(numInputs=${numInputs}, numOutputs=${numOutputs})`)
    ).toMoreSpecific<ComponentRepr<NumInputs, NumOutputs>>()

export function ExtendComponentRepr<NumInputs extends FixedArraySize, NumOutputs extends FixedArraySize, T extends t.Mixed>(n: NumInputs, m: NumOutputs, savedData: T) {
    return t.intersection([ComponentRepr(n, m), savedData], savedData.name)
}

export type NodeVisualNoGroup = readonly [name: string | undefined, xShift: number, yShift: number, orient: Orientation]
export type NodeVisualWithGroup = readonly [name: string | undefined, xShift: number, yShift: number, orient: Orientation, groupName: string]
export type NodeVisual = NodeVisualNoGroup | NodeVisualWithGroup

function hasGroup(nodeVisual: NodeVisual): nodeVisual is NodeVisualWithGroup {
    return nodeVisual.length === 5
}

export class NodeGroup<N extends Node> {

    private _nodes: N[] = []

    public constructor(
        public readonly parent: Component,
        public readonly name: string,
    ) {
    }

    public get nodes(): readonly N[] {
        return this._nodes
    }

    public addNode(node: N) {
        this._nodes.push(node)
    }

    public indexOf(node: Node): number {
        for (let i = 0; i < this._nodes.length; i++) {
            if (this._nodes[i] === node) {
                return i
            }
        }
        return -1
    }

}


// Node visuals are not stored in JSON, but provided by the concrete
// subclasses to the Component superclass to indicate where to place
// the input and output nodes. Strong typing allows us to check the
// size of the passed arrays in the super() call.
export type NodeVisuals<NumInputs extends FixedArraySize, NumOutputs extends FixedArraySize>
    // eslint-disable-next-line @typescript-eslint/ban-types
    = (NumInputs extends 0 ? {} : { ins: FixedArray<NodeVisual, NumInputs> })
    // eslint-disable-next-line @typescript-eslint/ban-types
    & (NumOutputs extends 0 ? {} : { outs: FixedArray<NodeVisual, NumOutputs> })

// Given an "as const" variable with NodeVisuals for in or out, this allows stuff like
//   type OutName = NodeNamesFrom<typeof outs>
// to statically yield a disjunction type of all node names
export type NodeNamesFrom<V extends ReadonlyArray<NodeVisual>> = V[number][0]

export enum ComponentState {
    SPAWNING,
    SPAWNED,
    DEAD
}

// Simplified, generics-free representation of a component
export type Component = ComponentBase<FixedArraySize, FixedArraySize, ComponentRepr<FixedArraySize, FixedArraySize>, unknown>

export const JsonFieldsComponents = ["in", "out", "gates", "components", "labels", "layout"] as const
export type JsonFieldComponent = typeof JsonFieldsComponents[number]
export const JsonFieldsAux = ["v", "opts", "userdata"] as const
export type JsonFieldAux = typeof JsonFieldsAux[number]
export type JsonField = JsonFieldComponent | JsonFieldAux

const ComponentTypes_ = {
    in: { jsonFieldName: "in" },
    out: { jsonFieldName: "out" },
    gate: { jsonFieldName: "gates" },
    ic: { jsonFieldName: "components" },
    label: { jsonFieldName: "labels" },
    layout: { jsonFieldName: "layout" },
} as const

export const ComponentTypes = RichStringEnum.withProps<{
    jsonFieldName: JsonFieldComponent
}>()(ComponentTypes_)

export type ComponentType = typeof ComponentTypes.type
export type MainJsonFieldName = typeof ComponentTypes_[ComponentType]["jsonFieldName"]

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

export abstract class ComponentBase<
    NumInputs extends FixedArraySize, // statically know the number of inputs
    NumOutputs extends FixedArraySize, // statically know the number of outputs
    Repr extends ComponentRepr<NumInputs, NumOutputs>, // JSON representation, varies according to input/output number
    Value // usually LogicValue or number
    > extends DrawableWithDraggablePosition {

    private _state: ComponentState
    private readonly _inputs: FixedArray<NodeIn, NumInputs>
    private readonly _inputGroups: Map<string, NodeGroup<NodeIn>> | undefined
    private readonly _outputs: FixedArray<NodeOut, NumOutputs>
    private readonly _outputGroups: Map<string, NodeGroup<NodeOut>> | undefined

    protected constructor(
        editor: LogicEditor,
        private _value: Value,
        savedData: Repr | null,
        nodeOffsets: NodeVisuals<NumInputs, NumOutputs>) {
        super(editor, savedData)

        // hack to get around the inOffsets and outOffsets properties
        // being inferred as nonexistant (basically, the '"key" in savedData'
        // check fails to provide enough info for type narrowing)
        type NodeOffsetsKey = keyof NodeVisuals<1, 0> | keyof NodeVisuals<0, 1>
        function get(key: NodeOffsetsKey): ReadonlyArray<NodeVisual> {
            if (key in nodeOffsets) {
                return (nodeOffsets as any as NodeVisuals<1, 1>)[key]
            } else {
                return [] as const
            }
        }

        const inOffsets = get("ins")
        const outOffsets = get("outs")
        const numInputs = inOffsets.length as NumInputs
        const numOutputs = outOffsets.length as NumOutputs

        if (isNotNull(savedData)) {
            // restoring
            this._state = ComponentState.SPAWNED

        } else {
            // newly placed
            this._state = ComponentState.SPAWNING
            editor.moveMgr.setDrawableMoving(this)
        }

        // build node specs either from scratch if new or from saved data
        const [inputSpecs, outputSpecs, hasAnyPrecomputedInitialValues] = this.nodeSpecsFromRepr(savedData, numInputs, numOutputs);

        // so, hasAnyPrecomputedInitialValues is true if ANY of the outputs was built
        // with "initialValue" in the JSON. This is used to stabilize circuits (such as
        // an SR latch) that would otherwise oscillate. But this also means that NO OTHER
        // OUTPUT from this component would be recomputed (even if they are always
        // propagated). So, it is a good idea to either set no initial values at all, or
        // to set all of them.

        // generate the input and output nodes
        [this._inputs, this._inputGroups] = this.makeNodes<NodeIn, NumInputs>(inOffsets, inputSpecs, NodeIn);
        [this._outputs, this._outputGroups] = this.makeNodes<NodeOut, NumOutputs>(outOffsets, outputSpecs, NodeOut)

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

    public abstract toJSON(): Repr

    // typically used by subclasses to provide only their specific JSON,
    // splatting in the result of super.toJSONBase() in the object
    protected override toJSONBase(): ComponentRepr<NumInputs, NumOutputs> {
        return {
            ...super.toJSONBase(),
            ...this.buildNodesRepr(),
        }
    }

    // creates the input/output nodes based on array of offsets (provided
    // by subclass) and spec (either loaded from JSON repr or newly generated)
    private makeNodes<N extends Node, Num extends FixedArraySize>(
        nodeVisuals: readonly NodeVisual[],
        specs: readonly (InputNodeRepr | OutputNodeRepr)[], node: new (
            editor: LogicEditor,
            nodeSpec: InputNodeRepr | OutputNodeRepr,
            parent: Component,
            group: NodeGroup<N> | undefined,
            name: string | undefined,
            _gridOffsetX: number,
            _gridOffsetY: number,
            relativePosition: Orientation,
        ) => N): [FixedArray<N, Num>, Map<string, NodeGroup<N>> | undefined] {

        const nodes: N[] = []
        let groupMap: Map<string, NodeGroup<N>> | undefined = undefined

        for (let i = 0; i < nodeVisuals.length; i++) {
            const nodeVisual = nodeVisuals[i]
            let group: NodeGroup<N> | undefined = undefined
            const [name, offsetX, offsetY, orient] = nodeVisual
            if (hasGroup(nodeVisual)) {
                const groupName = nodeVisual[4]
                // lazily create group map
                if (isUndefined(groupMap)) {
                    groupMap = new Map<string, NodeGroup<N>>()
                }
                group = groupMap.get(groupName)
                if (isUndefined(group)) {
                    group = new NodeGroup<N>(this, groupName)
                    groupMap.set(groupName, group)
                }
            }
            const newNode = new node(this.editor, specs[i], this, group, name, offsetX, offsetY, orient)
            nodes.push(newNode)
            if (isDefined(group)) {
                group.addNode(newNode)
            }
        }

        return [nodes as FixedArray<N, Num>, groupMap]
    }

    // generates two arrays of normalized node specs either as loaded from
    // JSON or obtained with default values when _repr is null and we're
    // creating a new component from scratch
    private nodeSpecsFromRepr(_repr: NodeIDsRepr<NumInputs, NumOutputs> | null, numInputs: number, numOutputs: number): [InputNodeRepr[], OutputNodeRepr[], boolean] {
        const inputSpecs: InputNodeRepr[] = []
        const outputSpecs: OutputNodeRepr[] = []
        const nodeMgr = this.editor.nodeMgr
        let hasAnyPrecomputedInitialValues = false

        if (_repr === null) {
            // build default spec for nodes
            for (let i = 0; i < numInputs; i++) {
                inputSpecs.push({ id: nodeMgr.newID() })
            }
            for (let i = 0; i < numOutputs; i++) {
                outputSpecs.push({ id: nodeMgr.newID() })
            }

        } else {
            // parse from cast repr according to cases

            // the next two functions take either a single ID or an array of them and
            // generate the corresponding node specs from it
            const genOutSpecs = function (outReprs: FixedArrayOrDirect<NodeID | OutputNodeRepr, FixedArraySizeNonZero>) {
                const pushOne = (outRepr: NodeID | OutputNodeRepr) => {
                    const fullOutRepr = isNumber(outRepr)
                        ? { id: outRepr }
                        : { id: outRepr.id, force: outRepr.force, color: outRepr.color, initialValue: outRepr.initialValue }
                    hasAnyPrecomputedInitialValues ||= isDefined(fullOutRepr.initialValue)
                    outputSpecs.push(fullOutRepr)
                }
                if (isArray(outReprs)) {
                    for (const outRepr of outReprs) {
                        pushOne(outRepr)
                    }
                } else {
                    pushOne(outReprs)
                }
            }
            const genInSpecs = function (inReprs: FixedArrayOrDirect<NodeID | InputNodeRepr, FixedArraySizeNonZero>) {
                const pushOne = (inRepr: NodeID | InputNodeRepr) =>
                    inputSpecs.push({ id: isNumber(inRepr) ? inRepr : inRepr.id })
                if (isArray(inReprs)) {
                    for (const inRepr of inReprs) {
                        pushOne(inRepr)
                    }
                } else {
                    pushOne(inReprs)
                }
            }

            // manually distinguishing the cases where we have no inputs or no
            // outputs as we then have a more compact JSON representation
            if (numInputs !== 0) {
                if (numOutputs !== 0) {
                    // NumInputs != 0, NumOutputs != 0
                    const repr: InAndOutNodeIds<FixedArraySizeNonZero, FixedArraySizeNonZero> = _repr as any
                    genInSpecs(repr.in)
                    genOutSpecs(repr.out)
                } else {
                    // NumInputs != 0, NumOutputs == 0
                    const repr: OnlyInNodeIds<FixedArraySizeNonZero> = _repr as any
                    genInSpecs(repr.id)
                }
            } else if (numOutputs !== 0) {
                // NumInputs == 0, NumOutputs != 0
                const repr: OnlyOutNodeIds<FixedArraySizeNonZero> = _repr as any
                genOutSpecs(repr.id)
            }

            // id availability check
            for (const specs of [inputSpecs, outputSpecs]) {
                for (const spec of specs) {
                    nodeMgr.markIDUsed(spec.id)
                }
            }
        }

        return [inputSpecs, outputSpecs, hasAnyPrecomputedInitialValues]
    }

    // from the known nodes, builds the JSON representation of them,
    // using the most compact form available
    private buildNodesRepr(): NodeIDsRepr<NumInputs, NumOutputs> {
        const numInputs = this.inputs.length as NumInputs
        const numOutputs = this.outputs.length as NumOutputs

        // these two functions return either an array of JSON
        // representations, or just the element skipping the array
        // if there is only one
        function inNodeReprs(nodes: readonly Node[]): FixedArrayOrDirect<NodeID, FixedArraySizeNonZero> {
            const reprOne = (node: Node) => node.id
            if (nodes.length === 1) {
                return reprOne(nodes[0])
            } else {
                return nodes.map(reprOne) as any
            }
        }
        function outNodeReprs(nodes: readonly Node[]): FixedArrayOrDirect<NodeID | OutputNodeRepr, FixedArraySizeNonZero> {
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
                return nodes.map(reprOne) as any
            }
        }

        let result: any = {}

        // manually distinguishing the cases where we have no inputs or no
        // outputs as we then have a more compact JSON representation
        if (numInputs !== 0) {
            const inRepr = inNodeReprs(this.inputs)

            if (numOutputs !== 0) {
                // NumInputs != 0, NumOutputs != 0
                const outRepr = outNodeReprs(this.outputs)
                const repr: InAndOutNodeIds<FixedArraySizeNonZero, FixedArraySizeNonZero> =
                    { in: inRepr as any, out: outRepr as any }
                result = repr

            } else {
                // NumInputs != 0, NumOutputs == 0
                const repr: OnlyOutNodeIds<FixedArraySizeNonZero> = { id: inRepr as any }
                result = repr
            }
        } else if (numOutputs !== 0) {
            // NumInputs == 0, NumOutputs != 0
            const outRepr = outNodeReprs(this.outputs)
            const repr: OnlyOutNodeIds<FixedArraySizeNonZero> = { id: outRepr as any }
            result = repr
        }

        return result
    }

    protected setInputsPreferSpike(...inputs: number[]) {
        for (const i of inputs) {
            this._inputs[i]._prefersSpike = true
        }
    }

    public abstract get componentType(): ComponentType

    public get state() {
        return this._state
    }

    public get allowsForcedOutputs() {
        return true
    }

    public get alwaysDrawMultiOutNodes() {
        return false
    }

    public get inputs(): FixedReadonlyArray<NodeIn, NumInputs> {
        return this._inputs
    }

    public get outputs(): FixedReadonlyArray<NodeOut, NumOutputs> {
        return this._outputs
    }

    public forEachNode(f: (node: Node) => boolean): void {
        for (const node of this.inputs) {
            const goOn = f(node)
            if (!goOn) {
                return
            }
        }
        for (const node of this.outputs) {
            const goOn = f(node)
            if (!goOn) {
                return
            }
        }
    }

    public get value(): Value {
        return this._value
    }

    protected doSetValue(newValue: Value, forcePropagate = false) {
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

    protected abstract doRecalcValue(): Value

    public propagateCurrentValue() {
        this.propagateValue(this._value)
    }

    protected propagateValue(__newValue: Value) {
        // by default, do nothing
    }

    protected inputValues<N extends FixedArraySize>(inds: FixedReadonlyArray<number, N>): FixedArray<LogicValue, N> {
        return inds.map(i => this.inputs[i].value) as any as FixedArray<LogicValue, N>
    }

    public setNeedsRecalc(forcePropagate = false) {
        this.editor.recalcMgr.enqueueForRecalc(this, forcePropagate)
    }

    private setNeedsPropagate() {
        this.editor.recalcMgr.enqueueForPropagate(this)
    }

    private updateNodePositions() {
        this.forEachNode((node) => {
            node.updatePositionFromParent()
            return true
        })
    }

    public override mouseDown(e: MouseEvent | TouchEvent) {
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
            return true
        }
        return false
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
        this.forEachNode((node) => {
            node.destroy()
            return true
        })
    }

    public override get cursorWhenMouseover(): string | undefined {
        return "grab"
    }

    public override makeContextMenu(): ContextMenuData {
        const menuItems: ContextMenuData = []

        const baseItems = this.makeBaseContextMenu()
        const specificItems = this.makeComponentSpecificContextMenuItems()

        let lastWasSep = true
        function addItemsAt(placement: ContextMenuItemPlacement, items: [ContextMenuItemPlacement, ContextMenuItem][] | undefined, insertSep = false) {
            if (isUndefined(items)) {
                return
            }
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

    private makeBaseContextMenu(): [ContextMenuItemPlacement, ContextMenuItem][] {
        const setRefItems: [ContextMenuItemPlacement, ContextMenuItem][] =
            this.editor.mode < Mode.FULL ? [] : [
                ["end", this.makeSetRefContextMenuItem()],
                ["end", ContextMenuData.sep()],
            ]

        const rotateItems: [ContextMenuItemPlacement, ContextMenuItem][] =
            !this.canRotate() ? [] : [
                ["start", this.makeChangeOrientationContextMenuItem()],
            ]

        return [
            ...rotateItems,
            ...setRefItems,
            ["end", this.makeDeleteContextMenuItem()],
        ]
    }

    protected makeComponentSpecificContextMenuItems(): undefined | [ContextMenuItemPlacement, ContextMenuItem][] {
        return undefined
    }

    protected makeDeleteContextMenuItem(): ContextMenuItem {
        return ContextMenuData.item("trash", S.Components.Generic.contextMenu.Delete, () => {
            this.editor.tryDeleteDrawable(this)
        }, true)
    }

    protected makeForceOutputsContextMenuItem(): undefined | ContextMenuItem {
        const numOutputs = this.outputs.length

        if (numOutputs === 0 || this.editor.mode < Mode.FULL) {
            return undefined
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

        if (numOutputs === 1) {
            return ContextMenuData.submenu("force", s.ForceOutputSingle, [
                ...makeOutputItems(this._outputs[0]!),
                ...footerItems,
            ])

        } else {
            return ContextMenuData.submenu("force", s.ForceOutputMultiple, [
                ...asArray(this._outputs).map((out) => {
                    const icon = isDefined(out.forceValue) ? "force" : "none"
                    return ContextMenuData.submenu(icon, s.Output + " " + out.name,
                        makeOutputItems(out)
                    )
                }),
                ...footerItems,
            ])
        }
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


export abstract class ComponentBaseWithSubclassDefinedNodes<
    InputIndices,
    OutputIndices,
    NumInputs extends FixedArraySize,
    NumOutputs extends FixedArraySize,
    Repr extends ComponentRepr<NumInputs, NumOutputs>,
    Value,
    > extends ComponentBase<NumInputs, NumOutputs, Repr, Value> {

    protected constructor(
        editor: LogicEditor,
        protected readonly gridWidth: number,
        protected readonly gridHeight: number,
        protected readonly INPUT: InputIndices,
        protected readonly OUTPUT: OutputIndices,
        _value: Value,
        savedData: Repr | null,
        nodeOffsets: NodeVisuals<NumInputs, NumOutputs>) {
        super(editor, _value, savedData, nodeOffsets)
    }

    public get unrotatedWidth() {
        return this.gridWidth * GRID_STEP
    }

    public get unrotatedHeight() {
        return this.gridHeight * GRID_STEP
    }

}


type ReprType<Repr extends t.Mixed> = Expand<t.TypeOf<Repr>>

export function defineComponent<NumInputs extends FixedArraySize, NumOutputs extends FixedArraySize, T extends t.Mixed>(numInputs: NumInputs, numOutputs: NumOutputs, type: T) {
    const repr = t.intersection([ComponentRepr(numInputs, numOutputs), type], type.name)
    return {
        numInputs,
        numOutputs,
        repr,
        get reprType(): ReprType<typeof repr> { throw new Error() },
    } as const
}

export function extendComponent<NumInputs extends FixedArraySize, NumOutputs extends FixedArraySize, T extends t.Mixed, U extends t.Mixed>(superDef: { numInputs: NumInputs, numOutputs: NumOutputs, repr: T }, subType: U) {
    const repr = t.intersection([superDef.repr, subType], subType.name)
    return {
        numInputs: superDef.numInputs,
        numOutputs: superDef.numOutputs,
        repr,
        get reprType(): ReprType<typeof repr> { throw new Error() },
    } as const
}
