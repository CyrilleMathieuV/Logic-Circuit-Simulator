import { ComponentFactory } from "./ComponentFactory"
import { ComponentCategories, JsonFieldComponent, JsonFieldsComponents, MainJsonFieldName } from "./components/Component"
import { Wire } from "./components/Wire"
import { LogicEditor } from "./LogicEditor"
import { stringifySmart } from "./stringifySmart"
import { binaryStringRepr, isAllZeros, isArray, isDefined, isString, isUndefined, keysOf, toLogicValue, validateJson } from "./utils"

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
        // console.log("BEFORE:\n" + content)

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
            jsonVersion = 4
        }
        if (jsonVersion === 4) {
            migrate4To5(parsedContents)
            jsonVersion = 5
        }
        if (jsonVersion !== savedVersion) {
            console.log(`Migrated data format from v${savedVersion} to v${jsonVersion}, consider upgrading the source`)
            // console.log("AFTER:\n" + this.stringifyWorkspace(parsedContents, false))
        }
        delete parsedContents["v"]

        for (const elem of components.all()) {
            elem.destroy()
        }
        components.clearAll()
        wireMgr.clearAllWires()
        nodeMgr.clearAllLiveNodes()
        editor.timeline.reset()

        function loadField(fieldName: MainJsonFieldName | "wires", process: (obj: unknown) => any) {
            if (!(fieldName in parsedContents)) {
                return
            }
            const objects = parsedContents[fieldName]
            delete parsedContents[fieldName]

            if (!isArray(objects)) {
                return
            }
            for (const obj of objects) {
                process(obj)
            }
        }

        for (const category of ComponentCategories) {
            const fieldName = ComponentCategories.props[category].jsonFieldName
            loadField(fieldName, obj => {
                ComponentFactory.makeFromJSON(editor, category, obj)
            })
        }

        // recalculating all the unconnected gates here allows
        // to avoid spurious circular dependency messages, as right
        // now all components are marked as needing recalculating
        const recalcMgr = editor.recalcMgr
        recalcMgr.recalcAndPropagateIfNeeded()

        loadField("wires", obj => {
            const wireData = validateJson(obj, Wire.Repr, "wire")
            if (isUndefined(wireData)) {
                return
            }

            const [nodeID1, nodeID2, wireOptions] = wireData
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
            "v": 5,
            "opts": editor.nonDefaultOptions(),
        }

        if (isDefined(editor.userdata)) {
            workspace["userdata"] = editor.userdata
        }

        for (const comp of editor.components.all()) {
            const fieldName = ComponentCategories.props[comp.category].jsonFieldName
            let arr = workspace[fieldName]
            if (isUndefined(arr)) {
                workspace[fieldName] = (arr = [comp])
            } else if (isArray(arr)) {
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
            if (isDefined(arr) && isArray(arr)) {
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


function findFirstFreeId(parsedContents: Record<string, unknown>): number {
    // this finds the maximum id of all components on raw (but parsed) JSON;
    // it is useful for migration code that needs to generate new ids

    let maxId = -1

    function inspectComponentDef(compDef: Record<string, unknown>) {
        for (const fieldName of ["id", "in", "out"]) {
            inspectValue(compDef[fieldName])
        }
    }

    function inspectValue(value: unknown) {
        if (isUndefined(value)) {
            return
        }
        if (typeof value === "number") {
            maxId = Math.max(maxId, value)
        } else if (isArray(value)) {
            for (const item of value) {
                inspectValue(item)
            }
        } else if (typeof value === "object" && value !== null) {
            inspectValue((value as Record<string, unknown>).id)
        }
    }

    for (const jsonField of JsonFieldsComponents) {
        const arr = parsedContents[jsonField]
        if (isDefined(arr) && isArray(arr)) {
            for (const comp of arr) {
                inspectComponentDef(comp)
            }
        }
    }

    return maxId + 1
}

function migrate0To1(workspace: Record<string, unknown>) {
    // all displays are now out
    if ("displays" in workspace) {
        const displays = workspace.displays
        delete workspace.displays
        if (!("out" in workspace)) {
            workspace.out = []
        }
        if (isArray(displays) && isArray(workspace.out)) {
            for (const display of displays) {
                workspace.out.push(display)
            }
        }
    }

    // all clocks are now in
    if ("clocks" in workspace) {
        const clocks = workspace.clocks
        delete workspace.clocks
        if (!("in" in workspace)) {
            workspace.in = []
        }
        if (isArray(clocks) && isArray(workspace.in)) {
            for (const clock of clocks) {
                clock.type = "clock"
                workspace.in.push(clock)
            }
        }
    }

    // flipflops have a different input node order
    const components = workspace.components
    if (isArray(components)) {
        for (const comp of components) {
            let type
            if (isString(type = comp.type) && type.startsWith("flipflop")) {
                // extract last three inputs
                const inputs: Array<number> = comp.in
                const lastThree = inputs.splice(-3)
                comp.in = [...lastThree, ...inputs]
            }
        }
    }
}


function migrate1To2(workspace: Record<string, unknown>) {
    // waypoints -> via
    if ("wires" in workspace) {
        const wires = workspace.wires
        if (isArray(wires)) {
            for (const wire of wires) {
                if (isArray(wire) && wire.length === 3) {
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

function migrate2To3(parsedContents: Record<string, unknown>) {
    let nextNewId = findFirstFreeId(parsedContents)

    const components = parsedContents.components
    if (isArray(components)) {
        for (const comp of components) {
            if (comp.type === "alu") {
                if (isArray(comp.in)) {
                    comp.in.push(nextNewId++)
                }
            }
        }
    }
}

function migrate3To4(parsedContents: Record<string, unknown>) {
    let nextNewId = findFirstFreeId(parsedContents)

    const outs = parsedContents.out
    if (isArray(outs)) {
        for (const out of outs) {
            if (out.type === "nibble") {
                out.type = "nibble-display"
            }
        }
    }

    const components = parsedContents.components
    if (isArray(components)) {
        for (const comp of components) {
            if (comp.type === "alu") {
                if (isArray(comp.out)) {
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

function migrate4To5(parsedContents: Record<string, unknown>) {
    let type
    let match: RegExpExecArray | null

    const ins = parsedContents.in
    if (isArray(ins)) {
        for (const in_ of ins) {
            if (isString(type = in_.type)) {

                if (type === "nibble") {
                    delete in_.type
                    in_.bits = 4

                } else if (type === "byte") {
                    delete in_.type
                    in_.bits = 8
                }
            }
        }
    }

    const outs = parsedContents.out
    if (isArray(outs)) {
        for (const out of outs) {
            if (isString(type = out.type)) {

                if (type === "nibble") {
                    delete out.type
                    out.bits = 4

                } else if (type === "byte") {
                    delete out.type
                    out.bits = 8

                } else if (type === "nibble-display") {
                    out.type = "display"
                    out.bits = 4

                } else if (type === "byte-display") {
                    out.type = "display"
                    out.bits = 8

                } else if (type === "shiftbuffer") {
                    out.type = "shift-buffer"
                }
            }
        }
    }

    const gates = parsedContents.gates
    if (isArray(gates)) {
        for (const gate of gates) {
            if (isString(type = gate.type)) {

                const lastChar = type[type.length - 1]
                const maybeBit = parseInt(lastChar)
                if (!isNaN(maybeBit)) {
                    gate.bits = maybeBit
                    gate.type = type.slice(0, -1)
                }
            }
        }
    }

    const components = parsedContents.components
    if (isArray(components)) {

        const ramRegex = /^ram-(?<lines>\d+)x(?<bits>\d+)$/
        const muxRegex = /^mux-(?<from>\d+)to(?<to>\d+)$/
        const demuxRegex = /^demux-(?<from>\d+)to(?<to>\d+)$/

        for (const comp of components) {
            if (isString(type = comp.type)) {

                if (type === "register") {
                    // register.state -> register.content
                    let state
                    if (isArray(state = comp.state)) {
                        const binStr = binaryStringRepr(state.map(toLogicValue) as any)
                        if (!isAllZeros(binStr)) {
                            comp.content = binStr
                        }
                        delete comp.state
                    }

                } else if (type === "quad-gate") {
                    comp.type = "gate-array"

                } else if (type === "quad-tristate") {
                    comp.type = "tristate-array"

                } else if ((match = ramRegex.exec(type)) !== null) {
                    comp.type = "ram"
                    comp.bits = parseInt(match.groups?.bits ?? "4")
                    comp.lines = parseInt(match.groups?.lines ?? "16")

                } else if ((match = muxRegex.exec(type)) !== null) {
                    comp.type = "mux"
                    comp.from = parseInt(match.groups?.from ?? "8")
                    comp.to = parseInt(match.groups?.to ?? "4")

                } else if ((match = demuxRegex.exec(type)) !== null) {
                    comp.type = "demux"
                    comp.from = parseInt(match.groups?.from ?? "4")
                    comp.to = parseInt(match.groups?.to ?? "8")

                }
            }
        }

        parsedContents.ic = components
        delete parsedContents.components
    }

    const layouts = parsedContents.layout
    if (isArray(layouts)) {

        const passthroughRegex = /^pass-(?<bits>\d+)$/

        for (const layout of layouts) {
            if (isString(type = layout.type)) {

                if ((match = passthroughRegex.exec(type)) !== null) {
                    layout.type = "pass"
                    layout.bits = parseInt(match.groups?.bits ?? "1")
                }
            }
        }
    }
}