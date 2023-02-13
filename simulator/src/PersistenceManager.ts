import * as t from "io-ts"
import { PathReporter } from 'io-ts/PathReporter'
import { Component, ComponentTypes, JsonFieldComponent, JsonFieldsComponents, MainJsonFieldName } from "./components/Component"
import { GateDef, GateFactory } from "./components/Gate"
import { ICDef, ICFactory } from "./components/IC"
import { InputDef, InputFactory } from "./components/Inputs"
import { LabelDef, LabelFactory } from "./components/Labels"
import { LayoutDef, LayoutFactory } from "./components/Layout"
import { OutputDef, OutputFactory } from "./components/Outputs"
import { Wire } from "./components/Wire"
import { LogicEditor } from "./LogicEditor"
import { stringifySmart } from "./stringifySmart"
import { isArray, isDefined, isString, isUndefined, keysOf } from "./utils"

export type Workspace = Record<string, unknown>

class _PersistenceManager {

    public loadFile(editor: LogicEditor, e: Event) {
        const sourceElem = e.target as HTMLInputElement
        const file = sourceElem.files?.item(0)
        if (!file) {
            return
        }

        const reader = new FileReader()

        reader.onload = () => {
            const contentFile = reader.result
            //console.log(contentFile);
            if (isString(contentFile)) {
                this.doLoadFromJson(editor, contentFile)
            }
        }
        reader.readAsText(file)
    }

    public doLoadFromJson(editor: LogicEditor, content: string | Workspace, isUndoRedoAction = false): undefined | string { // string is an error
        const nodeMgr = editor.nodeMgr
        const wireMgr = editor.wireMgr
        const components = editor.components

        let parsedContents: Workspace
        if (!isString(content)) {
            parsedContents = content
        } else {
            try {
                parsedContents = JSON.parse(content)
            } catch (err) {
                return "can't load this JSON - error " + err
            }
        }

        let jsonVersion = parsedContents["v"] ?? 0
        const savedVersion = jsonVersion
        if (jsonVersion === 0) {
            migrate0To1(parsedContents)
            jsonVersion = 1
        }
        if (jsonVersion === 1) {
            migrate1To2(parsedContents)
            jsonVersion = 2
        }
        if (jsonVersion === 2) {
            migrate2To3(parsedContents)
            jsonVersion = 3
        }
        if (jsonVersion === 3) {
            migrate3To4(parsedContents)
            jsonVersion = 3
        }
        if (jsonVersion !== savedVersion) {
            console.log(`Migrated data format from v${savedVersion} to v${jsonVersion}, consider upgrading the source`)
        }
        delete parsedContents["v"]

        for (const elem of components.all()) {
            elem.destroy()
        }
        components.clearAll()
        wireMgr.clearAllWires()
        nodeMgr.clearAllLiveNodes()
        editor.timeline.reset()

        function loadField<T>(fieldName: MainJsonFieldName | "wires", repr: t.Type<T, any> | { repr: t.Type<T, any> }, process: (params: T) => any) {
            if (!(fieldName in parsedContents)) {
                return
            }
            const fieldValues = parsedContents[fieldName]
            delete parsedContents[fieldName]

            if (!isArray(fieldValues)) {
                return
            }
            if ("repr" in repr) {
                repr = repr.repr
            }
            for (const someDefinition of fieldValues) {
                const validated = repr.decode(someDefinition)
                switch (validated._tag) {
                    case "Left":
                        console.log(`ERROR while parsing ${repr.name} from %o -> %s: `, someDefinition, PathReporter.report(validated).join("; "))
                        break
                    case "Right":
                        process(validated.right)
                        break
                }
            }
        }

        type Factory<T> = {
            make: (editor: LogicEditor, savedDataOrType: T) => Component | undefined
        }

        function loadComponentField<T>(fieldName: MainJsonFieldName, repr: t.Type<T, any> | { repr: t.Type<T, any> }, factory: Factory<T>) {
            loadField(fieldName, repr, (d) => {
                const comp = factory.make(editor, d)
                if (isDefined(comp)) {
                    components.add(comp)
                }
            })
        }

        loadComponentField("in", InputDef, InputFactory)
        loadComponentField("out", OutputDef, OutputFactory)
        loadComponentField("gates", GateDef, GateFactory as any)
        loadComponentField("components", ICDef, ICFactory)
        loadComponentField("labels", LabelDef, LabelFactory)
        loadComponentField("layout", LayoutDef, LayoutFactory)

        // recalculating all the unconnected gates here allows
        // to avoid spurious circular dependency messages, as right
        // now all components are marked as needing recalculating
        const recalcMgr = editor.recalcMgr
        recalcMgr.recalcAndPropagateIfNeeded()

        loadField("wires", Wire.Repr, ([nodeID1, nodeID2, wireOptions]) => {
            const node1 = nodeMgr.findNode(nodeID1)
            const node2 = nodeMgr.findNode(nodeID2)
            if (!isUndefined(node1) && !isUndefined(node2)) {
                wireMgr.addNode(node1)
                const completedWire = wireMgr.addNode(node2)
                if (isDefined(completedWire) && isDefined(wireOptions)) {
                    completedWire.ref = wireOptions.ref
                    if (isDefined(wireOptions.via)) {
                        completedWire.setWaypoints(wireOptions.via)
                    }
                    if (isDefined(wireOptions.propagationDelay)) {
                        completedWire.customPropagationDelay = wireOptions.propagationDelay
                    }
                    if (isDefined(wireOptions.style)) {
                        completedWire.doSetStyle(wireOptions.style)
                    }
                }
                recalcMgr.recalcAndPropagateIfNeeded()
            }
        })

        // load userdata, keeping already existing data
        if (isDefined(parsedContents.userdata)) {
            if (typeof editor.userdata === "object" && typeof parsedContents.userdata === "object") {
                // merge
                editor.userdata = {
                    ...parsedContents.userdata,
                    ...editor.userdata,
                }
            } else {
                // cannot merge, keep existing data
            }
            delete parsedContents.userdata
        }

        // also works with undefined
        // must be done AFTER setting user data to ensure the UI is updated accordingly
        editor.setPartialOptions(parsedContents.opts as any)
        delete parsedContents.opts

        const unhandledData = keysOf(parsedContents)
        if (unhandledData.length !== 0) {
            console.log("Unloaded data fields: " + unhandledData.join(", "))
        }

        if (!isUndoRedoAction) {
            editor.undoMgr.takeSnapshot()
        }

        return undefined // meaning no error
    }

    public buildWorkspace(editor: LogicEditor): Workspace {
        const workspace: Workspace = {
            "v": 4,
            "opts": editor.nonDefaultOptions(),
        }

        if (isDefined(editor.userdata)) {
            workspace["userdata"] = editor.userdata
        }

        for (const comp of editor.components.all()) {
            const fieldName = ComponentTypes.propsOf(comp.componentType).jsonFieldName
            let arr = workspace[fieldName]
            if (isUndefined(arr)) {
                workspace[fieldName] = (arr = [comp])
            } else if (Array.isArray(arr)) {
                arr.push(comp)
            }
        }

        const wireMgr = editor.wireMgr
        if (wireMgr.wires.length !== 0) {
            workspace.wires = wireMgr.wires
        }

        return workspace
    }

    public removeShowOnlyFrom(workspace: Workspace): void {
        const opts = workspace.opts as any
        if (typeof opts === "object" && opts !== null && Object.prototype.hasOwnProperty.call(opts, "showOnly")) {
            delete opts.showOnly
        }
    }

    public stringifyWorkspace(_workspace: Workspace, compact: boolean): string {
        if (compact) {
            return JSON.stringify(_workspace)
        }

        // Custom stringifier to have always one component per line and
        // spaces after commas

        const workspace = { ..._workspace }

        const parts = [`{\n  "v": ${workspace.v}`]
        delete workspace.v

        const pushCompact = (key: string) => {
            const value = workspace[key]
            if (isDefined(value)) {
                parts.push(`"${key}": ${stringifySmart(value, { maxLength: Infinity })}`)
            }
            delete workspace[key]
        }

        pushCompact("opts")
        pushCompact("userdata")

        const pushComponents = (jsonField: JsonFieldComponent) => {
            const arr = workspace[jsonField]
            if (isDefined(arr) && Array.isArray(arr)) {
                const subparts: string[] = []
                for (const comp of arr) {
                    subparts.push(stringifySmart(comp, { maxLength: Infinity }))
                }
                parts.push(`"${jsonField}": [\n    ` + subparts.join(",\n    ") + "\n  ]")
                delete workspace[jsonField]
            }
        }

        for (const jsonField of JsonFieldsComponents) {
            pushComponents(jsonField)
        }

        pushCompact("wires")

        // loop though the remaining fields
        const unprocessedFields = keysOf(workspace)
        if (unprocessedFields.length !== 0) {
            console.log("ERROR: unprocessed fields in stringified JSON: " + unprocessedFields.join(", "))
        }

        return parts.join(",\n  ") + "\n}"
    }

    public saveToFile(editor: LogicEditor) {
        const workspaceJsonStr = this.stringifyWorkspace(this.buildWorkspace(editor), false)
        const blob = new Blob([workspaceJsonStr], { type: 'application/json' })
        const filename = (editor.options.name ?? "circuit") + ".json"

        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename

        const clickHandler = () => {
            setTimeout(() => {
                URL.revokeObjectURL(url)
                a.removeEventListener('click', clickHandler)
            }, 150)
        }

        a.addEventListener('click', clickHandler, false)
        a.click()
    }

}

export const PersistenceManager = new _PersistenceManager()


function findFirstFreeId(parsedContents: any): number {
    // this finds the maximum id of all components on raw (but parsed) JSON;
    // it is useful for migration code that needs to generate new ids

    let maxId = -1

    function inspectComponentDef(compDef: any) {
        for (const fieldName of ["id", "in", "out"]) {
            inspectValue(compDef[fieldName])
        }
    }

    function inspectValue(value: any) {
        if (isUndefined(value)) {
            return
        }
        if (typeof value === "number") {
            maxId = Math.max(maxId, value)
        } else if (Array.isArray(value)) {
            for (const item of value) {
                inspectValue(item)
            }
        } else if (typeof value === "object" && value !== null) {
            inspectValue(value.id)
        }
    }

    for (const jsonField of JsonFieldsComponents) {
        const arr = parsedContents[jsonField]
        if (isDefined(arr) && Array.isArray(arr)) {
            for (const comp of arr) {
                inspectComponentDef(comp)
            }
        }
    }

    return maxId + 1
}

function migrate0To1(workspace: any) {
    // all displays are now out
    if ("displays" in workspace) {
        const displays = workspace.displays
        delete workspace.displays
        if (!("out" in workspace)) {
            workspace.out = []
        }
        for (const display of displays) {
            workspace.out.push(display)
        }
    }

    // all clocks are now in
    if ("clocks" in workspace) {
        const clocks = workspace.clocks
        delete workspace.clocks
        if (!("in" in workspace)) {
            workspace.in = []
        }
        for (const clock of clocks) {
            clock.type = "clock"
            workspace.in.push(clock)
        }
    }

    // flipflops have a different input node order
    if ("components" in workspace) {
        const components = workspace.components
        for (const comp of components) {
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            if (comp.type.startsWith("flipflop")) {
                // extract last three inputs
                const inputs: Array<number> = comp.in
                const lastThree = inputs.splice(-3)
                comp.in = [...lastThree, ...inputs]
            }
        }
    }
}


function migrate1To2(workspace: any) {
    // waypoints -> via
    if ("wires" in workspace) {
        const wires = workspace.wires
        if (Array.isArray(wires)) {
            for (const wire of wires) {
                if (Array.isArray(wire) && wire.length === 3) {
                    const wireOptions = wire[2]
                    if ("waypoints" in wireOptions) {
                        wireOptions.via = wireOptions.waypoints
                        delete wireOptions.waypoints
                    }
                }
            }
        }
    }
}

function migrate2To3(parsedContents: any) {
    let nextNewId = findFirstFreeId(parsedContents)

    if ("components" in parsedContents) {
        const components = parsedContents.components
        if (Array.isArray(components)) {
            for (const comp of components) {
                if ("type" in comp && comp.type === "alu") {
                    if (Array.isArray(comp.in)) {
                        comp.in.push(nextNewId++)
                    }
                }
            }
        }
    }
}

function migrate3To4(parsedContents: any) {
    let nextNewId = findFirstFreeId(parsedContents)

    if ("out" in parsedContents) {
        const outs = parsedContents.out
        if (Array.isArray(outs)) {
            for (const out of outs) {
                if ("type" in out && out.type === "nibble") {
                    out.type = "nibble-display"
                }
            }
        }
    }
    if ("components" in parsedContents) {
        const components = parsedContents.components
        if (Array.isArray(components)) {
            for (const comp of components) {
                if ("type" in comp && comp.type === "alu") {
                    if (Array.isArray(comp.out)) {
                        comp.out.push(nextNewId++) // add a new oVerflow output
                        // replace carry output with overflow output as it was wrongly used before
                        const t = comp.out[4]
                        comp.out[4] = comp.out[6]
                        comp.out[6] = t
                    }
                }
            }
        }
    }

}

