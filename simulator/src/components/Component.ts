import * as t from "io-ts"
import { GRID_STEP } from "../drawutils"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { ArrayFillUsing, ArrayOrDirect, deepEquals, HighImpedance, isArray, isDefined, isNotNull, isNumber, isString, isUndefined, LogicValue, LogicValueRepr, Mode, RichStringEnum, toLogicValueRepr, typeOrUndefined, Unknown } from "../utils"
import { ContextMenuData, ContextMenuItem, ContextMenuItemPlacement, DrawableWithDraggablePosition, Orientation, PositionSupportRepr } from "./Drawable"
import { DEFAULT_WIRE_COLOR, Node, NodeIn, NodeOut, WireColor } from "./Node"


type NodeSeqRepr<TFullNodeRepr> =
    ArrayOrDirect<number | string | TFullNodeRepr>

export const NodeSeqRepr = <T>(fullNodeRepr: t.Type<T>) =>
    t.union([
        t.number, // just the ID
        t.string,
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
const OnlyInNodeIds = t.type({ id: InputNodeSeqRepr })
type OnlyInNodeIds = t.TypeOf<typeof OnlyInNodeIds>

const OnlyOutNodeIds = t.type({ id: OutputNodeSeqRepr })
type OnlyOutNodeIds = t.TypeOf<typeof OnlyOutNodeIds>

const InAndOutNodeIds = t.type({
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

// Tests
// type IDs_00 = Expand<NodeIDsRepr<false, false>>
// type IDs_01 = Expand<NodeIDsRepr<false, true>>
// type IDs_10 = Expand<NodeIDsRepr<true, false>>
// type IDs_11 = Expand<NodeIDsRepr<true, true>>
// type Comp_00 = Expand<ComponentRepr<false, false>>
// type Comp_01 = Expand<ComponentRepr<false, true>>
// type Comp_10 = Expand<ComponentRepr<true, false>>
// type Comp_11 = Expand<ComponentRepr<true, true>>


// A generic component is represented by its position
// and the representation of its nodes
export type ComponentRepr<THasIn extends boolean, THasOut extends boolean> =
    PositionSupportRepr & NodeIDsRepr<THasIn, THasOut>

export const ComponentRepr = <THasIn extends boolean, THasOut extends boolean>(hasIn: THasIn, hasOut: THasOut) =>
    t.intersection([PositionSupportRepr, NodeIDsRepr(hasIn, hasOut)], "Component")

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
// the input and output nodes.
export type NodeVisuals<THasIn extends boolean, THasOut extends boolean>
    // eslint-disable-next-line @typescript-eslint/ban-types
    = (THasIn extends false ? {} : { ins: Array<NodeVisual> })
    // eslint-disable-next-line @typescript-eslint/ban-types
    & (THasOut extends false ? {} : { outs: Array<NodeVisual> })

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
export type Component = ComponentBase<ComponentRepr<boolean, boolean>, unknown>

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

type ExtractHasIn<Repr> = Repr extends { _META?: { hasIn: infer THasIn } } ? THasIn : boolean
type ExtractHasOut<Repr> = Repr extends { _META?: { hasOut: infer THasOut } } ? THasOut : boolean


export abstract class ComponentBase<
    Repr extends ComponentRepr<THasIn, THasOut>, // JSON representation
    Value, // internal value recomputed when inputs change
    THasIn extends boolean = ExtractHasIn<Repr>,
    THasOut extends boolean = ExtractHasOut<Repr>, // in-out node presence
> extends DrawableWithDraggablePosition {

    private _state: ComponentState
    private readonly _inputs: Array<NodeIn>
    private readonly _inputGroups: Map<string, NodeGroup<NodeIn>> | undefined
    private readonly _outputs: Array<NodeOut>
    private readonly _outputGroups: Map<string, NodeGroup<NodeOut>> | undefined

    protected constructor(
        editor: LogicEditor,
        private _value: Value,
        savedData: Repr | null,
        nodeOffsets: NodeVisuals<THasIn, THasOut>) {
        super(editor, savedData)

        // hack to get around the inOffsets and outOffsets properties
        // being inferred as nonexistant (basically, the '"key" in savedData'
        // check fails to provide enough info for type narrowing)
        type NodeOffsetsKey = keyof NodeVisuals<true, false> | keyof NodeVisuals<false, true>
        function get(key: NodeOffsetsKey): ReadonlyArray<NodeVisual> {
            if (key in nodeOffsets) {
                return (nodeOffsets as NodeVisuals<true, true>)[key]
            } else {
                return [] as const
            }
        }

        const inOffsets = get("ins")
        const outOffsets = get("outs")
        const numInputs = inOffsets.length
        const numOutputs = outOffsets.length

        if (isNotNull(savedData)) {
            // restoring
            this._state = ComponentState.SPAWNED
        } else {
            // newly placed
            this._state = ComponentState.SPAWNING
            editor.moveMgr.setDrawableMoving(this) // TODO this is BS; state (moving or not) should be determined from ctor params
        }

        // build node specs either from scratch if new or from saved data
        const [inputSpecs, outputSpecs, hasAnyPrecomputedInitialValues] =
            this.nodeSpecsFromRepr(savedData, numInputs, numOutputs);

        // so, hasAnyPrecomputedInitialValues is true if ANY of the outputs was built
        // with "initialValue" in the JSON. This is used to stabilize circuits (such as
        // an SR latch) that would otherwise oscillate. But this also means that NO OTHER
        // OUTPUT from this component would be recomputed (even if they are always
        // propagated). So, it is a good idea to either set no initial values at all, or
        // to set all of them.

        // generate the input and output nodes
        [this._inputs, this._inputGroups] = this.makeNodes(inOffsets, inputSpecs, NodeIn);
        [this._outputs, this._outputGroups] = this.makeNodes(outOffsets, outputSpecs, NodeOut)

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
    protected override toJSONBase(): ComponentRepr<THasIn, THasOut> {
        return {
            ...super.toJSONBase(),
            ...this.buildNodesRepr(),
        }
    }

    // creates the input/output nodes based on array of offsets (provided
    // by subclass) and spec (either loaded from JSON repr or newly generated)
    private makeNodes<N extends Node>(
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
        ) => N): [Array<N>, Map<string, NodeGroup<N>> | undefined] {

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

        return [nodes, groupMap]
    }

    // generates two arrays of normalized node specs either as loaded from
    // JSON or obtained with default values when _repr is null and we're
    // creating a new component from scratch
    private nodeSpecsFromRepr(_repr: NodeIDsRepr<THasIn, THasOut> | null, numInputs: number, numOutputs: number): [
        inputSpecs: Array<InputNodeRepr>,
        outputSpecs: Array<OutputNodeRepr>,
        hasAnyPrecomputedInitialValues: boolean
    ] {
        const nodeMgr = this.editor.nodeMgr

        if (_repr === null) {
            const makeDefaultSpec = () =>
                ({ id: nodeMgr.newID() })
            return [
                ArrayFillUsing(makeDefaultSpec, numInputs),
                ArrayFillUsing(makeDefaultSpec, numOutputs),
                false,
            ]
        }

        const inputSpecs: InputNodeRepr[] = []
        const outputSpecs: OutputNodeRepr[] = []

        const makeNormalizedSpecs = <TNodeNormized extends InputNodeRepr | OutputNodeRepr>(
            specs: Array<TNodeNormized>,
            seqRepr: ArrayOrDirect<string | number | TNodeNormized>,
        ) => {
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
        }

        // manually distinguishing the cases where we have no inputs or no
        // outputs as we then have a more compact JSON representation
        if (numInputs !== 0) {
            if (numOutputs !== 0) {
                const repr = _repr as InAndOutNodeIds
                makeNormalizedSpecs(inputSpecs, repr.in)
                makeNormalizedSpecs(outputSpecs, repr.out)
            } else {
                const repr = _repr as OnlyInNodeIds
                makeNormalizedSpecs(inputSpecs, repr.id)
            }
        } else if (numOutputs !== 0) {
            const repr = _repr as OnlyOutNodeIds
            makeNormalizedSpecs(outputSpecs, repr.id)
        }

        const hasAnyPrecomputedInitialValues =
            outputSpecs.some(spec => isDefined(spec.initialValue))

        return [inputSpecs, outputSpecs, hasAnyPrecomputedInitialValues]
    }

    // from the known nodes, builds the JSON representation of them,
    // using the most compact form available
    private buildNodesRepr(): NodeIDsRepr<THasIn, THasOut> {
        const numInputs = this.inputs.length
        const numOutputs = this.outputs.length

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
                    ? { in: inNodeReprs(this.inputs), out: outNodeReprs(this.outputs) }
                    : { id: inNodeReprs(this.inputs) }
                : numOutputs !== 0
                    ? { id: outNodeReprs(this.outputs) }
                    : {}
        ) as NodeIDsRepr<THasIn, THasOut>
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

    public get inputs(): ReadonlyArray<NodeIn> {
        return this._inputs
    }

    public get outputs(): ReadonlyArray<NodeOut> {
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

    protected inputValues(inds: ReadonlyArray<number>): Array<LogicValue> {
        return inds.map(i => this.inputs[i].value)
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
                ...this._outputs.map((out) => {
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
    Repr extends ComponentRepr<THasIn, THasOut>,
    Value,
    InputIndices,
    OutputIndices,
    THasIn extends boolean = ExtractHasIn<Repr>,
    THasOut extends boolean = ExtractHasOut<Repr>,
> extends ComponentBase<Repr, Value, THasIn, THasOut> {

    protected constructor(
        editor: LogicEditor,
        protected readonly gridWidth: number,
        protected readonly gridHeight: number,
        protected readonly INPUT: InputIndices,
        protected readonly OUTPUT: OutputIndices,
        _value: Value,
        savedData: Repr | null,
        nodeOffsets: NodeVisuals<THasIn, THasOut>) {
        super(editor, _value, savedData, nodeOffsets)
    }

    public get unrotatedWidth() {
        return this.gridWidth * GRID_STEP
    }

    public get unrotatedHeight() {
        return this.gridHeight * GRID_STEP
    }

}


export type ComponentDef<THasIn extends boolean, THasOut extends boolean, TComp extends t.Mixed> = {
    repr: TComp,
    hasIn: THasIn,
    hasOut: THasOut,
}

export type Repr<TDef>
    = TDef extends ComponentDef<infer THasIn, infer THasOut, infer TRepr>
    ? {
        _META?: {
            hasIn: THasIn,
            hasOut: THasOut,
        }
    } & t.TypeOf<TRepr>
    : never

export function defineComponent<THasIn extends boolean, THasOut extends boolean, TComp extends t.Mixed>(hasIn: THasIn, hasOut: THasOut, type: TComp) {
    const repr = t.intersection([ComponentRepr(hasIn, hasOut), type], type.name)
    return {
        repr,
        hasIn,
        hasOut,
    } as const //satisfies ComponentDef<THasIn, THasOut, t.Mixed> // TODO uncomment when the bundler handles the new TS version
}

export function extendComponent<THasIn extends boolean, THasOut extends boolean, TSuperComp extends t.Mixed, TSubComp extends t.Mixed>(superDef: ComponentDef<THasIn, THasOut, TSuperComp>, subType: TSubComp) {
    const repr = t.intersection([superDef.repr, subType], subType.name)
    return {
        repr,
        hasIn: superDef.hasIn,
        hasOut: superDef.hasOut,
    } as const //satisfies ComponentDef<THasIn, THasOut, t.Mixed> // TODO uncomment when the bundler handles the new TS version
}
