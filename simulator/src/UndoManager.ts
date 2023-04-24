import { LogicEditor } from "./LogicEditor"
import { PersistenceManager } from "./PersistenceManager"
import { isDefined, RepeatFunction } from "./utils"

const MAX_UNDO_SNAPSHOTS = 100

type Snapshot = {
    time: number
    workspace: string
    repeatAction?: RepeatFunction
}

export class UndoManager {

    public readonly editor: LogicEditor
    private _undoSnapshots: Snapshot[] = []
    private _redoSnapshots: Snapshot[] = []

    public constructor(editor: LogicEditor) {
        this.editor = editor
    }

    public canUndo() {
        return this._undoSnapshots.length > 1
    }

    public canRedoOrRepeat() {
        return this._redoSnapshots.length > 0 ||
            (this._undoSnapshots.length > 0 &&
                isDefined(this._undoSnapshots[this._undoSnapshots.length - 1].repeatAction))
    }

    public takeSnapshot(repeatAction?: RepeatFunction) {
        const now = Date.now()
        // const nowStr = new Date(now).toISOString()
        // console.log("Taking snapshot at " + nowStr)

        const workspace = this.editor.save()
        const workspaceStr = PersistenceManager.stringifyWorkspace(workspace, true)
        this._undoSnapshots.push({ time: now, workspace: workspaceStr, repeatAction })
        while (this._undoSnapshots.length > MAX_UNDO_SNAPSHOTS) {
            this._undoSnapshots.shift()
        }
        if (this._redoSnapshots.length > 0) {
            this._redoSnapshots = []
        }
        // this.dump()
    }

    public undo() {
        if (!this.canUndo()) {
            console.log("Nothing to undo")
            return
        }
        const stateNow = this._undoSnapshots.pop()!
        const prevState = this._undoSnapshots[this._undoSnapshots.length - 1]
        this._redoSnapshots.push(stateNow)
        this.loadSnapshot(prevState)
        // this.dump()
    }

    public redoOrRepeat() {
        if (!this.canRedoOrRepeat()) {
            console.log("Nothing to redo or repeat")
            return
        }
        const snapshot = this._redoSnapshots.pop()
        if (isDefined(snapshot)) {
            this._undoSnapshots.push(snapshot)
            this.loadSnapshot(snapshot)
        } else {
            const repeatAction = this._undoSnapshots[this._undoSnapshots.length - 1].repeatAction
            if (isDefined(repeatAction)) {
                const newRepeatAction = repeatAction()
                this.takeSnapshot(newRepeatAction)
            }
        }
        // this.dump()
    }

    public dump() {
        function printStack(name: string, stack: Snapshot[]) {
            const title = name + (stack.length === 0 ? " (empty)" : "")
            console.group(title)
            for (let i = stack.length - 1; i >= 0; i--) {
                const snapshot = stack[i]
                const timeStr = new Date(snapshot.time).toISOString()
                console.log(timeStr)
            }
            console.groupEnd()
        }
        printStack("Undo stack", this._undoSnapshots)
        printStack("Redo stack", this._redoSnapshots)
    }

    private loadSnapshot(snapshot: Snapshot) {
        PersistenceManager.doLoadFromJson(this.editor, snapshot.workspace, true)
    }

}
