import * as t from "io-ts"
import { VirtualComponentList, DrawZIndex } from "../VirtualComponentList"
import { DrawParams, LogicEditor } from "../LogicEditor"
import { type VirtualNodeManager } from "../VirtualNodeManager"
import { VirtualRecalcManager } from "../VirtualRecalcManager"
import { S } from "../strings"
import { Expand, FixedArray, InteractionResult, Mode, RichStringEnum, typeOrUndefined } from "../utils"
import { VirtualComponentBase } from "./VirtualComponent"
import { VirtualWireManager } from "./VirtualWire";
import { RedrawManager } from "../RedrawRecalcManager";
import { MoveManager } from "../MoveManager";
import { UndoManager } from "../UndoManager";
import {Orientation} from "./Drawable";

export interface VirtualCalculableParent {

    isMainEditor(): this is LogicEditor
    readonly editor: LogicEditor
    // nice to forward...
    readonly mode: Mode

    // implemented as one per (editor + instantiated custom component)
    readonly virtualComponents: VirtualComponentList
    readonly virtualNodeMgr: VirtualNodeManager
    readonly virtualWireMgr: VirtualWireManager
    readonly recalcMgr: VirtualRecalcManager
}

// for compact JSON repr, pos is an array

export abstract class VirtualCalculable {

    public readonly parent: VirtualCalculableParent
    private _ref: string | undefined = undefined

    protected constructor(parent: VirtualCalculableParent, saved?: PositionSupportRepr) {
        this.parent = parent
        this.setNeedsRedraw("newly created")
    }

    public get ref() {
        return this._ref
    }

    public doSetValidatedId(id: string | undefined) {
        // For components, the id must have been validated by a component list;
        // for other drawbles, ids are largely unregulated, they can be 
        // undefined or even duplicated since we don't refer to them for nodes
        this._ref = id
    }

    protected setNeedsRedraw(reason: string) {
    }

    public get drawZIndex(): DrawZIndex {
        return 1
    }

    public toString(): string {
        return `${this.constructor.name}(${this.toStringDetails()})`
    }

    protected toStringDetails(): string {
        return ""
    }
    
    private runSetIdDialog() {
        const s = S.Components.Generic.contextMenu
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const currentId = this._ref
            const newId = window.prompt(s.SetIdentifierPrompt, currentId)
            if (newId === null) {
                // cancel button pressed
                break
            }
            if (newId === currentId) {
                // no change
                break
            }

            if (!(this instanceof VirtualComponentBase)) {
                // ids are unregulated
                this.doSetValidatedId(newId.length === 0 ? undefined : newId)

            } else {
                // we're a component, check with the component list
                if (newId.length === 0) {
                    window.alert(s.IdentifierCannotBeEmpty)
                    continue
                }
                const componentList = this.parent.virtualComponents
                const otherComp = componentList.get(newId)
                if (otherComp === undefined) {
                    // OK button pressed
                    componentList.changeIdOf(this, newId)
                } else {
                    if (window.confirm(s.IdentifierAlreadyInUseShouldSwap)) {
                        componentList.swapIdsOf(otherComp, this)
                    } else {
                        continue
                    }
                }
            }
            break
        }
    }
}

export abstract class VirtualCalculableSaved extends  VirtualCalculable{

    protected constructor(parent: VirtualCalculableParent, saved?: PositionSupportRepr) {
        super(parent)

        // using null and not undefined to prevent subclasses from
        // unintentionally skipping the parameter

        if (saved !== undefined) {
            // restoring from saved object
            this.doSetValidatedId(saved.ref)
        } else {
            // creating new object
            const editor = this.parent.editor
        }
    }

    protected toJSONBase(): PositionSupportRepr {
        return {
            ref: this.ref,
        }
    }
}

// for compact JSON repr, pos is an array
export const PositionSupportRepr = t.type({
    ref: typeOrUndefined(t.string),
})

export type PositionSupportRepr = Expand<t.TypeOf<typeof PositionSupportRepr>>
