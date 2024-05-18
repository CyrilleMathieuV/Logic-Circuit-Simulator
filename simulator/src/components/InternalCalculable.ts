import * as t from "io-ts"
import { InternalComponentList, DrawZIndex } from "../InternalComponentList"
import { DrawParams, LogicEditor } from "../LogicEditor"
import { type InternalNodeManager } from "../InternalNodeManager"
import { InternalRecalcManager } from "../InternalRecalcManager"
import { S } from "../strings"
import { Expand, FixedArray, InteractionResult, Mode, RichStringEnum, typeOrUndefined } from "../utils"
import { InternalComponentBase } from "./InternalComponent"
import { InternalWireManager } from "./InternalWire";
import { RedrawManager } from "../RedrawRecalcManager";
import { MoveManager } from "../MoveManager";
import { UndoManager } from "../UndoManager";
import {Orientation} from "./Drawable";

export interface InternalCalculableParent {

    isMainEditor(): this is LogicEditor
    readonly editor: LogicEditor
    // nice to forward...
    readonly mode: Mode

    // implemented as one per (editor + instantiated custom component)
    readonly internalComponents: InternalComponentList
    readonly internalNodeMgr: InternalNodeManager
    readonly internalWireMgr: InternalWireManager
    readonly recalcMgr: InternalRecalcManager
}

// for compact JSON repr, pos is an array

export abstract class InternalCalculable {

    public readonly parent: InternalCalculableParent
    private _ref: string | undefined = undefined

    protected constructor(parent: InternalCalculableParent, saved?: PositionSupportRepr) {
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

            if (!(this instanceof InternalComponentBase)) {
                // ids are unregulated
                this.doSetValidatedId(newId.length === 0 ? undefined : newId)

            } else {
                // we're a component, check with the component list
                if (newId.length === 0) {
                    window.alert(s.IdentifierCannotBeEmpty)
                    continue
                }
                const componentList = this.parent.internalComponents
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

export abstract class InternalCalculableSaved extends  InternalCalculable{

    protected constructor(parent: InternalCalculableParent, saved?: PositionSupportRepr) {
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
