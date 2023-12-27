import { createPopper, Instance as PopperInstance } from '@popperjs/core'
import { ButtonDataset } from './ComponentFactory'
import { DrawZIndex } from './ComponentList'
import { Component, ComponentBase, ComponentState } from './components/Component'
import { CustomComponent } from './components/CustomComponent'
import { Drawable, DrawableWithPosition, MenuData, MenuItem } from "./components/Drawable"
import { Node } from "./components/Node"
import { Waypoint, Wire } from './components/Wire'
import { dist, setColorMouseOverIsDanger } from './drawutils'
import { applyModifiersTo, button, cls, emptyMod, li, Modifier, ModifierObject, mods, span, type, ul } from './htmlgen'
import { IconName, makeIcon } from './images'
import { LogicEditor, MouseAction } from './LogicEditor'
import { getScrollParent, InteractionResult, Mode, targetIsFieldOrOtherInput, TimeoutHandle } from "./utils"

type MouseDownData = {
    mainComp: Drawable | Element
    selectionComps: Drawable[]
    fireMouseClickedOnFinish: boolean
    initialXY: [number, number]
    triggeredContextMenu: boolean
}

export class EditorSelection {

    public previouslySelectedElements = new Set<Drawable>()

    public constructor(
        public currentlyDrawnRect: DOMRect | undefined,
    ) { }

    public toggle(elem: Drawable) {
        if (this.previouslySelectedElements.has(elem)) {
            this.previouslySelectedElements.delete(elem)
        } else {
            this.previouslySelectedElements.add(elem)
        }
    }

    public finishCurrentRect(editor: LogicEditor) {
        let rect
        if ((rect = this.currentlyDrawnRect) !== undefined) {
            for (const comp of editor.components.all()) {
                if (comp.isInRect(rect)) {
                    this.toggle(comp)
                }
            }

            for (const wire of editor.wireMgr.wires) {
                for (const point of wire.waypoints) {
                    if (point.isInRect(rect)) {
                        this.toggle(point)
                    }
                }
            }

            this.currentlyDrawnRect = undefined
        }
    }

    public isSelected(component: Drawable): boolean {
        const prevSelected = this.previouslySelectedElements.has(component)
        const rect = this.currentlyDrawnRect
        if (rect === undefined) {
            return prevSelected
        } else {
            const inverted = component.isInRect(rect)
            return inverted ? !prevSelected : prevSelected
        }
    }

}


export class UIEventManager {

    public readonly editor: LogicEditor
    private _currentMouseOverComp: Drawable | null = null
    private _currentMouseOverPopper: [popper: PopperInstance, removeScrollListener: () => void] | null = null
    private _currentMouseDownData: MouseDownData | null = null
    private _startHoverTimeoutHandle: TimeoutHandle | null = null
    private _startDragTimeoutHandle: TimeoutHandle | null = null
    private _currentHandlers: ToolHandlers
    private _lastTouchEnd: [Drawable, number] | undefined = undefined
    public currentSelection: EditorSelection | undefined = undefined

    public constructor(editor: LogicEditor) {
        this.editor = editor
        this._currentHandlers = new EditHandlers(editor)
    }

    public get currentMouseOverComp() {
        return this._currentMouseOverComp
    }

    public get currentMouseDownData() {
        return this._currentMouseDownData
    }

    public setHandlersFor(action: MouseAction) {
        this._currentHandlers = (() => {
            switch (action) {
                case "edit": return new EditHandlers(this.editor)
                case "delete": return new DeleteHandlers(this.editor)
                case "move": return new MoveHandlers(this.editor)
            }
        })()
        setColorMouseOverIsDanger(action === "delete")
    }

    public setStartDragTimeout(startMouseDownData: MouseDownData, e: MouseEvent | TouchEvent) {
        // we do this because firefox otherwise sets back offsetX/Y to 0
        const _e = e as any
        _e._savedOffsetX = _e.offsetX
        _e._savedOffsetY = _e.offsetY
        _e._savedTarget = _e.target
        this._startDragTimeoutHandle = setTimeout(
            this.editor.wrapHandler(() => {
                let fireDrag = true
                const endMouseDownData = this._currentMouseDownData
                if (endMouseDownData !== null) {
                    endMouseDownData.fireMouseClickedOnFinish = false
                    if (endMouseDownData.triggeredContextMenu) {
                        fireDrag = false
                    }
                }
                if (fireDrag) {
                    if (startMouseDownData.mainComp instanceof Drawable) {
                        this._currentHandlers.mouseDraggedOn(startMouseDownData.mainComp, e)
                    }
                    for (const comp of startMouseDownData.selectionComps) {
                        this._currentHandlers.mouseDraggedOn(comp, e)
                    }
                }
            }),
            300
        )
    }

    public clearStartDragTimeout() {
        if (this._startDragTimeoutHandle !== null) {
            clearTimeout(this._startDragTimeoutHandle)
            this._startDragTimeoutHandle = null
        }
    }

    public clearHoverTimeoutHandle() {
        if (this._startHoverTimeoutHandle !== null) {
            clearTimeout(this._startHoverTimeoutHandle)
            this._startHoverTimeoutHandle = null
        }
    }

    public setCurrentMouseOverComp(comp: Drawable | null) {
        if (comp !== this._currentMouseOverComp) {
            this.clearPopperIfNecessary()
            this.clearHoverTimeoutHandle()

            this._currentMouseOverComp = comp
            if (comp !== null) {
                this._startHoverTimeoutHandle = setTimeout(() => {
                    this._currentHandlers.mouseHoverOn(comp)
                    this._startHoverTimeoutHandle = null
                }, 1200)
            }
            this.editor.editTools.redrawMgr.addReason("mouseover changed", null)
            // console.log("Over component: ", comp)
        }
    }

    public currentSelectionEmpty() {
        return this.currentSelection === undefined || this.currentSelection.previouslySelectedElements.size === 0
    }

    public updateMouseOver([x, y]: [number, number], pullingWire: boolean) {
        const findMouseOver: () => Drawable | null = () => {
            // easy optimization: maybe we're still over the
            // same component as before, so quickly check this
            if (this._currentMouseOverComp !== null && this._currentMouseOverComp.drawZIndex !== 0) {
                // second condition says: always revalidate the mouseover of background components (with z index 0)
                if (this._currentMouseOverComp.isOver(x, y)) {
                    return this._currentMouseOverComp
                }
            }
            const root = this.editor.editorRoot

            // overlays
            if (!pullingWire) {
                for (const comp of root.components.withZIndex(DrawZIndex.Overlay)) {
                    if (comp.isOver(x, y)) {
                        return comp
                    }
                }
            }

            // normal components or their nodes
            for (const comp of root.components.withZIndex(DrawZIndex.Normal)) {
                let nodeOver: Node | null = null
                for (const node of comp.allNodes()) {
                    if (node.isOver(x, y)) {
                        nodeOver = node
                        break
                    }
                }
                if (nodeOver !== null && (!pullingWire || root.wireMgr.isValidMouseUp(nodeOver))) {
                    return nodeOver
                }
                if (!pullingWire && comp.isOver(x, y)) {
                    return comp
                }
            }

            if (!pullingWire) {
                // wires
                for (const wire of root.wireMgr.wires) {
                    for (const waypoint of wire.waypoints) {
                        if (waypoint.isOver(x, y)) {
                            return waypoint
                        }
                    }
                    if (wire.isOver(x, y)) {
                        return wire
                    }
                }

                // background elems
                for (const comp of root.components.withZIndex(DrawZIndex.Background)) {
                    if (comp.isOver(x, y)) {
                        return comp
                    }
                }
            }

            return null
        }

        this.setCurrentMouseOverComp(findMouseOver())
    }

    public selectAll() {
        const sel = new EditorSelection(undefined)
        this.currentSelection = sel
        const root = this.editor.editorRoot
        for (const comp of root.components.all()) {
            sel.previouslySelectedElements.add(comp)
        }
        for (const wire of root.wireMgr.wires) {
            for (const waypoint of wire.waypoints) {
                sel.previouslySelectedElements.add(waypoint)
            }
        }
        this.editor.editTools.redrawMgr.addReason("selected all", null)
    }

    public toggleSelect(comp: Drawable) {
        let sel
        if ((sel = this.currentSelection) === undefined) {
            sel = new EditorSelection(undefined)
            this.currentSelection = sel
        }
        sel.toggle(comp)
        this.editor.editTools.redrawMgr.addReason("toggled selection", null)
    }


    public clearPopperIfNecessary() {
        if (this._currentMouseOverPopper !== null) {
            const [popper, removeListener] = this._currentMouseOverPopper
            removeListener()
            popper.destroy()
            this._currentMouseOverPopper = null
            this.editor.html.tooltipElem.style.display = "none"
        }
    }

    public makePopper(tooltipHtml: ModifierObject, rect: () => DOMRect) {
        const { tooltipContents, tooltipElem, mainCanvas } = this.editor.html
        tooltipContents.innerHTML = ""
        tooltipHtml.applyTo(tooltipContents)
        tooltipElem.style.removeProperty("display")
        const popper = createPopper({
            getBoundingClientRect: rect,
            contextElement: mainCanvas,
        }, tooltipElem, {
            placement: 'right',
            modifiers: [{ name: 'offset', options: { offset: [4, 8] } }],
        })

        const scrollParent = getScrollParent(mainCanvas)
        const scrollListener = () => popper.update()
        scrollParent.addEventListener("scroll", scrollListener)
        const removeListener = () => scrollParent.removeEventListener("scroll", scrollListener)
        this._currentMouseOverPopper = [popper, removeListener]

        tooltipElem.setAttribute('data-show', '')
        popper.update()
    }

    public registerCanvasListenersOn(canvas: HTMLCanvasElement) {
        const editor = this.editor
        const returnFalse = () => false
        canvas.ondragenter = returnFalse
        canvas.ondragover = returnFalse
        canvas.ondragend = returnFalse

        canvas.ondrop = e => {
            if (e.dataTransfer === null) {
                return false
            }

            e.preventDefault()
            const file = e.dataTransfer.files?.[0]
            if (file !== undefined) {
                editor.tryLoadFrom(file)
            } else {
                const dataItems = e.dataTransfer.items
                if (dataItems !== undefined) {
                    for (const dataItem of dataItems) {
                        if (dataItem.kind === "string" && (dataItem.type === "application/json" || dataItem.type === "text/plain")) {
                            dataItem.getAsString(content => {
                                e.dataTransfer!.dropEffect = "copy"
                                editor.loadCircuitOrLibrary(content)
                            })
                            break
                        }
                    }
                }
            }
            return false
        }

        canvas.addEventListener("touchstart", editor.wrapHandler((e) => {
            // console.log("canvas touchstart %o %o, composedPath = %o", offsetXY(e), e, e.composedPath())
            if (this.editor.mode >= Mode.CONNECT) {
                // prevent scrolling when we can connect
                e.preventDefault()
            }
            this._mouseDownTouchStart(e)
        }))

        canvas.addEventListener("touchmove", editor.wrapHandler((e) => {
            // console.log("canvas touchmove %o %o, composedPath = %o", offsetXY(e), e, e.composedPath())
            if (this.editor.mode >= Mode.CONNECT) {
                // prevent scrolling when we can connect
                e.preventDefault()
            }
            this._mouseMoveTouchMove(e)
        }))

        canvas.addEventListener("touchend", editor.wrapHandler((e) => {
            // console.log("canvas touchend %o %o, composedPath = %o", offsetXY(e), e, e.composedPath())
            // touchend should always be prevented, otherwise it may
            // generate mouse/click events
            e.preventDefault()
            this._mouseUpTouchEnd(e)
            this.setCurrentMouseOverComp(null)
            this.editor.focus()
        }))

        // canvasContainer.addEventListener("touchcancel", wrapHandler((e) => {
        //     // console.log("canvas touchcancel %o %o, composedPath = %o", offsetXY(e), e, e.composedPath())
        // }))

        canvas.addEventListener("mousedown", editor.wrapHandler((e) => {
            // console.log("mousedown %o, composedPath = %o", e, e.composedPath())
            this._mouseDownTouchStart(e)
        }))

        canvas.addEventListener("mousemove", editor.wrapHandler((e) => {
            // console.log("mousemove %o, composedPath = %o", e, e.composedPath())
            this._mouseMoveTouchMove(e)
            this.editor.updateCursor(e)
        }))

        canvas.addEventListener("mouseleave", editor.wrapHandler(() => {
            this.clearPopperIfNecessary()
        }))

        canvas.addEventListener("mouseup", editor.wrapHandler((e) => {
            // console.log("mouseup %o, composedPath = %o", e, e.composedPath())
            this._mouseUpTouchEnd(e)
            this.updateMouseOver(this.editor.offsetXY(e), false)
            this.editor.updateCursor(e)
            this.editor.focus()
        }))

        canvas.addEventListener("contextmenu", editor.wrapHandler((e) => {
            // console.log("contextmenu %o, composedPath = %o", e, e.composedPath())
            e.preventDefault()
            if (this.editor.mode >= Mode.CONNECT && this._currentMouseOverComp !== null) {
                this._currentHandlers.contextMenuOn(this._currentMouseOverComp, e)
            }
        }))

        canvas.addEventListener("keyup", editor.wrapHandler(e => {
            if (targetIsFieldOrOtherInput(e)) {
                return
            }
            switch (e.key) {
                case "Escape": {
                    let handled: boolean
                    handled = editor.eventMgr.tryDeleteComponentsWhere(comp => comp.state === ComponentState.SPAWNING, false) > 0
                    if (!handled) {
                        handled = editor.wireMgr.tryCancelWire()
                    }
                    if (!handled && this.editor.editorRoot instanceof CustomComponent) {
                        handled = this.editor.tryCloseCustomComponentEditor()
                    }

                    if (handled) {
                        e.preventDefault()
                    }
                    return
                }

                case "Backspace":
                case "Delete": {
                    let selComp
                    if ((selComp = this.currentSelection?.previouslySelectedElements) !== undefined && selComp.size !== 0) {
                        let anyDeleted = false
                        for (const comp of selComp) {
                            anyDeleted = editor.eventMgr.tryDeleteDrawable(comp).isChange || anyDeleted
                        }
                        if (anyDeleted) {
                            editor.editTools.undoMgr.takeSnapshot()
                        }
                    } else if ((selComp = this.currentMouseOverComp) !== null) {
                        const result = editor.eventMgr.tryDeleteDrawable(selComp)
                        editor.editTools.undoMgr.takeSnapshot(result)
                    }
                    e.preventDefault()
                    return
                }

                case "e":
                    editor.setCurrentMouseAction("edit")
                    e.preventDefault()
                    return

                case "d":
                    editor.setCurrentMouseAction("delete")
                    e.preventDefault()
                    return

                case "m":
                    editor.setCurrentMouseAction("move")
                    e.preventDefault()
                    return
            }
        }))

        canvas.addEventListener("keydown", editor.wrapHandler(e => {
            const ctrlOrCommand = e.ctrlKey || e.metaKey
            const keyLower = e.key.toLowerCase()
            const shift = e.shiftKey || (keyLower !== e.key)
            switch (keyLower) {
                case "a":
                    if (ctrlOrCommand && editor.mode >= Mode.CONNECT && !targetIsFieldOrOtherInput(e)) {
                        this.selectAll()
                        e.preventDefault()
                    }
                    return

                case "s":
                    if (ctrlOrCommand && editor.isSingleton) {
                        editor.saveCurrentStateToUrl()
                        e.preventDefault()
                    }
                    return

                case "z":
                    if (ctrlOrCommand && !targetIsFieldOrOtherInput(e)) {
                        if (shift) {
                            editor.editTools.undoMgr.redoOrRepeat()
                        } else {
                            editor.editTools.undoMgr.undo()
                        }
                        e.preventDefault()
                    }
                    return
                case "y":
                    if (ctrlOrCommand && !targetIsFieldOrOtherInput(e)) {
                        editor.editTools.undoMgr.redoOrRepeat()
                        e.preventDefault()
                    }
                    return
                case "x":
                    if (ctrlOrCommand && !targetIsFieldOrOtherInput(e)) {
                        editor.cut()
                        e.preventDefault()
                    }
                    return
                case "c":
                    if (ctrlOrCommand && !targetIsFieldOrOtherInput(e)) {
                        if (editor.copy()) {
                            e.preventDefault()
                        }
                    }
                    return
                case "v":
                    if (ctrlOrCommand && !targetIsFieldOrOtherInput(e)) {
                        editor.paste()
                        e.preventDefault()
                    }
                    return
            }

            if (this._currentMouseOverComp !== null) {
                this._currentMouseOverComp.keyDown(e)
            }
        }))
    }

    private _mouseDownTouchStart(e: MouseEvent | TouchEvent) {
        this.clearHoverTimeoutHandle()
        this.clearPopperIfNecessary()
        if (this._currentMouseDownData === null) {
            const xy = this.editor.offsetXY(e)
            this.updateMouseOver(xy, false)
            if (this._currentMouseOverComp !== null) {
                // mouse down on component
                const { wantsDragEvents } = this._currentHandlers.mouseDownOn(this._currentMouseOverComp, e)
                if (wantsDragEvents) {
                    const selectedComps = this.currentSelection === undefined ? [] : [...this.currentSelection.previouslySelectedElements]
                    for (const comp of selectedComps) {
                        if (comp !== this._currentMouseOverComp) {
                            this._currentHandlers.mouseDownOn(comp, e)
                        }
                    }
                    const mouseDownData: MouseDownData = {
                        mainComp: this._currentMouseOverComp,
                        selectionComps: selectedComps,
                        fireMouseClickedOnFinish: true,
                        initialXY: xy,
                        triggeredContextMenu: false,
                    }
                    this._currentMouseDownData = mouseDownData
                    this.setStartDragTimeout(mouseDownData, e)
                }
                this.editor.editTools.redrawMgr.addReason("mousedown", null)
            } else {
                // mouse down on background
                this._currentMouseDownData = {
                    mainComp: this.editor.html.canvasContainer,
                    selectionComps: [], // ignore selection
                    fireMouseClickedOnFinish: true,
                    initialXY: xy,
                    triggeredContextMenu: false,
                }
                this._currentHandlers.mouseDownOnBackground(e)
            }
            this.editor.updateCursor(e)
        } else {
            // we got a mousedown while a component had programmatically
            // been determined as being mousedown'd; ignore
        }
    }

    private _mouseMoveTouchMove(e: MouseEvent | TouchEvent) {
        if (this._currentMouseDownData !== null) {
            if (this._currentMouseDownData.triggeredContextMenu) {
                // cancel it all
                this._currentMouseDownData = null
            } else {
                if (this._currentMouseDownData.mainComp instanceof Drawable) {
                    // check if the drag is too small to be taken into account now
                    // (e.g., touchmove is fired very quickly)
                    const d = dist(...this.editor.offsetXY(e), ...this._currentMouseDownData.initialXY)
                    // NaN is returned when no input point was specified and
                    // dragging should then happen regardless
                    if (isNaN(d) || d >= 5) {
                        // dragging component
                        this.clearStartDragTimeout()
                        this._currentMouseDownData.fireMouseClickedOnFinish = false
                        this._currentHandlers.mouseDraggedOn(this._currentMouseDownData.mainComp, e)
                        for (const comp of this._currentMouseDownData.selectionComps) {
                            if (comp !== this._currentMouseDownData.mainComp) {
                                this._currentHandlers.mouseDraggedOn(comp, e)
                            }
                        }
                    }
                } else {
                    // dragging background
                    this._currentHandlers.mouseDraggedOnBackground(e)
                }
            }
        } else {
            // moving mouse or dragging without a locked component
            this.updateMouseOver(this.editor.offsetXY(e), this.editor.editorRoot.wireMgr.isAddingWire)
        }
    }

    private _mouseUpTouchEnd(e: MouseEvent | TouchEvent) {
        // our target is either the locked component that
        // was clicked or the latest mouse over component
        const mouseUpTarget = this._currentMouseDownData?.mainComp ?? this._currentMouseOverComp
        if (mouseUpTarget instanceof Drawable) {
            // mouseup on component
            if (this._startDragTimeoutHandle !== null) {
                clearTimeout(this._startDragTimeoutHandle)
                this._startDragTimeoutHandle = null
            }
            let change = this._currentHandlers.mouseUpOn(mouseUpTarget, e)
            for (const comp of this._currentMouseDownData?.selectionComps ?? []) {
                if (comp !== mouseUpTarget) {
                    const newChange = this._currentHandlers.mouseUpOn(comp, e)
                    change = InteractionResult.merge(change, newChange)
                }
            }

            if (this._currentMouseDownData?.fireMouseClickedOnFinish ?? false) {
                let newChange
                if (this.isDoubleClick(mouseUpTarget, e)) {
                    newChange = this._currentHandlers.mouseDoubleClickedOn(mouseUpTarget, e)
                    if (!newChange.isChange) {
                        // no double click handler, so we trigger a normal click
                        newChange = this._currentHandlers.mouseClickedOn(mouseUpTarget, e)
                    }
                } else {
                    newChange = this._currentHandlers.mouseClickedOn(mouseUpTarget, e)
                }
                change = InteractionResult.merge(change, newChange)
            }

            if (change.isChange) {
                this.editor.editTools.undoMgr.takeSnapshot(change)
            }

        } else {
            // mouseup on background
            this._currentHandlers.mouseUpOnBackground(e)
        }
        this._currentMouseDownData = null
        this.editor.editTools.redrawMgr.addReason("mouseup", null)
    }

    private isDoubleClick(clickedComp: Drawable, e: MouseEvent | TouchEvent) {
        if ("offsetX" in e) {
            return e.detail === 2
        } else {
            const oldLastTouchEnd = this._lastTouchEnd
            const now = new Date().getTime()
            this._lastTouchEnd = [clickedComp, now]
            if (oldLastTouchEnd === undefined) {
                return false
            }
            const [lastComp, lastTime] = oldLastTouchEnd
            const elapsedTimeMillis = now - lastTime
            const isDoubleTouch = lastComp === clickedComp && elapsedTimeMillis > 0 && elapsedTimeMillis < 300
            if (isDoubleTouch) {
                this._lastTouchEnd = undefined
            }
            return isDoubleTouch
        }
    }

    public registerButtonListenersOn(componentButtons: HTMLButtonElement[], isCustomElement: boolean) {
        const editor = this.editor
        for (const compButton of componentButtons) {
            const buttonMouseDownTouchStart = (e: MouseEvent | TouchEvent) => {
                this.editor.setCurrentMouseAction("edit")
                e.preventDefault()
                this.editor.eventMgr.currentSelection = undefined
                const newComponent = editor.factory.makeFromButton(editor.editorRoot, compButton)
                if (newComponent === undefined) {
                    return
                }
                this._currentMouseOverComp = newComponent
                const { wantsDragEvents } = this._currentHandlers.mouseDownOn(newComponent, e)
                if (wantsDragEvents) {
                    this._currentMouseDownData = {
                        mainComp: this._currentMouseOverComp,
                        selectionComps: [], // ignore selection when dragging new component
                        fireMouseClickedOnFinish: false,
                        initialXY: [NaN, NaN],
                        triggeredContextMenu: false,
                    }
                }
                this._currentHandlers.mouseDraggedOn(newComponent, e)
            }

            compButton.addEventListener("mousedown", editor.wrapHandler((e) => {
                // console.log("button mousedown %o %o", editor.offsetXY(e), e)
                if (e.button === 2 || (e.button === 0 && e.ctrlKey)) {
                    // will be handled by context menu
                    return
                }
                buttonMouseDownTouchStart(e)
            }))
            compButton.addEventListener("touchstart", editor.wrapHandler((e) => {
                // console.log("button touchstart %o %o", editor.offsetXY(e), e)
                buttonMouseDownTouchStart(e)
            }))
            compButton.addEventListener("touchmove", editor.wrapHandler((e) => {
                // console.log("button touchmove %o %o", editor.offsetXY(e), e)
                e.preventDefault()
                this._mouseMoveTouchMove(e)
            }))
            compButton.addEventListener("touchend", editor.wrapHandler((e) => {
                // console.log("button touchend %o %o", editor.offsetXY(e), e)
                e.preventDefault() // otherwise, may generate mouseclick, etc.
                this._mouseUpTouchEnd(e)
                this.setCurrentMouseOverComp(null)
            }))

            compButton.addEventListener("contextmenu", editor.wrapHandler((e) => {
                // console.log("button contextmenu %o %o", editor.offsetXY(e), e)
                e.preventDefault()
                e.stopPropagation()

                if (isCustomElement && this.editor.mode >= Mode.DESIGN) {
                    this._currentHandlers.contextMenuOnButton(compButton.dataset as ButtonDataset, e)
                }
            }))
        }
    }

    public tryDeleteDrawable(comp: Drawable): InteractionResult {
        if (comp instanceof ComponentBase) {
            const numDeleted = this.tryDeleteComponentsWhere(c => c === comp, true)
            return InteractionResult.fromBoolean(numDeleted !== 0)
        } else if (comp instanceof Wire) {
            return this.editor.editorRoot.wireMgr.deleteWire(comp)
        } else if (comp instanceof Waypoint) {
            comp.removeFromParent()
            return InteractionResult.SimpleChange
        }
        return InteractionResult.NoChange
    }

    public tryDeleteComponentsWhere(cond: (e: Component) => boolean, onlyOne: boolean) {
        const numDeleted = this.editor.editorRoot.components.tryDeleteWhere(cond, onlyOne)
        if (numDeleted > 0) {
            this.clearPopperIfNecessary()
            this.editor.editTools.redrawMgr.addReason("component(s) deleted", null)
        }
        return numDeleted
    }

}

abstract class ToolHandlers {

    public readonly editor: LogicEditor

    public constructor(editor: LogicEditor) {
        this.editor = editor
    }

    public mouseHoverOn(__comp: Drawable) {
        // empty
    }
    public mouseDownOn(__comp: Drawable, __e: MouseEvent | TouchEvent) {
        return { wantsDragEvents: true }
    }
    public mouseDraggedOn(__comp: Drawable, __e: MouseEvent | TouchEvent) {
        // empty
    }
    public mouseUpOn(__comp: Drawable, __e: MouseEvent | TouchEvent): InteractionResult {
        return InteractionResult.NoChange
    }
    public mouseClickedOn(__comp: Drawable, __e: MouseEvent | TouchEvent): InteractionResult {
        return InteractionResult.NoChange
    }
    public mouseDoubleClickedOn(__comp: Drawable, __e: MouseEvent | TouchEvent): InteractionResult {
        return InteractionResult.NoChange
    }
    public contextMenuOn(__comp: Drawable, __e: MouseEvent | TouchEvent): boolean {
        return false // false means unhandled
    }
    public contextMenuOnButton(__props: ButtonDataset, __e: MouseEvent | TouchEvent) {
        // empty
    }
    public mouseDownOnBackground(__e: MouseEvent | TouchEvent) {
        // empty
    }
    public mouseDraggedOnBackground(__e: MouseEvent | TouchEvent) {
        // empty
    }
    public mouseUpOnBackground(__e: MouseEvent | TouchEvent) {
        // empty
    }
}

class EditHandlers extends ToolHandlers {

    private _openedContextMenu: HTMLElement | null = null

    public constructor(editor: LogicEditor) {
        super(editor)
    }

    public override mouseHoverOn(comp: Drawable) {
        const editor = this.editor
        editor.eventMgr.clearPopperIfNecessary()
        if (editor.options.hideTooltips) {
            return
        }
        // maybe the component is now dead
        if ((comp instanceof ComponentBase) && comp.state === ComponentState.DEAD) {
            return
        }
        const tooltip = comp.makeTooltip()
        if (tooltip !== undefined) {
            const rect = () => {
                const containerRect = editor.html.canvasContainer.getBoundingClientRect()
                const f = editor.actualZoomFactor
                const [cx, cy, w, h] =
                    comp instanceof DrawableWithPosition
                        ? [comp.posX * f, comp.posY * f, comp.width * f, comp.height * f]
                        : [editor.mouseX, editor.mouseY, 4, 4]
                return new DOMRect(containerRect.x + cx - w / 2, containerRect.y + cy - h / 2, w, h)
            }
            editor.eventMgr.makePopper(tooltip, rect)
        }
    }
    public override mouseDownOn(comp: Drawable, e: MouseEvent | TouchEvent) {
        return comp.mouseDown(e)
    }
    public override mouseDraggedOn(comp: Drawable, e: MouseEvent | TouchEvent) {
        comp.mouseDragged(e)
    }
    public override mouseUpOn(comp: Drawable, e: MouseEvent | TouchEvent) {
        const change = comp.mouseUp(e)
        this.editor.editorRoot.wireMgr.tryCancelWire()
        return change
    }
    public override mouseClickedOn(comp: Drawable, e: MouseEvent | TouchEvent) {
        // console.log("mouseClickedOn %o", comp)
        return comp.mouseClicked(e)
    }
    public override mouseDoubleClickedOn(comp: Drawable, e: MouseEvent | TouchEvent) {
        return comp.mouseDoubleClicked(e)
    }
    public override contextMenuOn(comp: Drawable, e: MouseEvent | TouchEvent) {
        // console.log("contextMenuOn: %o", comp)
        return this.showContextMenu(comp.makeContextMenu(), e)
    }
    public override contextMenuOnButton(props: ButtonDataset, e: MouseEvent | TouchEvent) {
        return this.showContextMenu(this.editor.factory.makeContextMenu(props.type), e)
    }

    public override mouseDownOnBackground(e: MouseEvent | TouchEvent) {
        const editor = this.editor
        const eventMgr = editor.eventMgr
        const currentSelection = eventMgr.currentSelection
        if (currentSelection !== undefined) {
            const allowSelection = editor.mode >= Mode.CONNECT
            if (e.shiftKey && allowSelection) {
                if (currentSelection.currentlyDrawnRect !== undefined) {
                    console.log("unexpected defined current rect when about to begin a new one")
                }
                // augment selection
                const [left, top] = editor.offsetXY(e)
                const rect = new DOMRect(left, top, 1, 1)
                currentSelection.currentlyDrawnRect = rect
            } else {
                // clear selection
                eventMgr.currentSelection = undefined
            }
            editor.editTools.redrawMgr.addReason("selection rect changed", null)
        }
    }
    public override mouseDraggedOnBackground(e: MouseEvent | TouchEvent) {
        const editor = this.editor
        const allowSelection = editor.mode >= Mode.CONNECT
        if (allowSelection) {
            const eventMgr = editor.eventMgr
            const currentSelection = eventMgr.currentSelection
            const [x, y] = editor.offsetXY(e)
            if (currentSelection === undefined) {
                const rect = new DOMRect(x, y, 1, 1)
                eventMgr.currentSelection = new EditorSelection(rect)
            } else {
                const rect = currentSelection.currentlyDrawnRect
                if (rect === undefined) {
                    console.log("trying to update a selection rect that is not defined")
                } else {
                    rect.width = x - rect.x
                    rect.height = y - rect.y
                    editor.editTools.redrawMgr.addReason("selection rect changed", null)
                }
            }
        }
    }

    public override mouseUpOnBackground(__e: MouseEvent | TouchEvent) {
        const editor = this.editor
        editor.wireMgr.tryCancelWire()

        const eventMgr = editor.eventMgr
        const currentSelection = eventMgr.currentSelection
        if (currentSelection !== undefined) {
            currentSelection.finishCurrentRect(this.editor)
            editor.editTools.redrawMgr.addReason("selection rect changed", null)
        }
    }

    private showContextMenu(menuData: MenuData | undefined, e: MouseEvent | TouchEvent) {
        const hideMenu = () => {
            if (this._openedContextMenu !== null) {
                this._openedContextMenu.classList.remove('show-menu')
                this._openedContextMenu.innerHTML = ""
                this._openedContextMenu = null
            }
        }

        hideMenu()

        // console.log("asking for menu: %o got: %o", comp, MenuData)
        if (menuData !== undefined) {

            // console.log("setting triggered")
            const currentMouseDownData = this.editor.eventMgr.currentMouseDownData
            if (currentMouseDownData !== null) {
                currentMouseDownData.triggeredContextMenu = true
            }

            // console.log("building menu for %o", MenuData)

            const defToElem = (item: MenuItem): HTMLElement => {
                function mkButton(spec: { icon?: IconName | undefined, caption: Modifier }, shortcut: string | undefined, danger: boolean) {
                    return button(type("button"), cls(`menu-btn${(danger ? " danger" : "")}`),
                        spec.icon === undefined
                            ? spec.caption
                            : mods(
                                makeIcon(spec.icon),
                                span(cls("menu-text"), spec.caption)
                            ),
                        shortcut === undefined ? emptyMod : span(cls("menu-shortcut"), shortcut),
                    )
                }

                switch (item._tag) {
                    case "sep":
                        return li(cls("menu-separator")).render()
                    case "text":
                        return li(cls("menu-item-static"), item.caption).render()
                    case "item": {
                        const but = mkButton(item, item.shortcut, item.danger ?? false).render()
                        but.addEventListener("click", this.editor.wrapHandler((itemEvent: MouseEvent | TouchEvent) => {
                            const result = item.action(itemEvent, e)
                            this.editor.editTools.undoMgr.takeSnapshot(result as Exclude<typeof result, void>)
                            this.editor.focus()
                        }))
                        return li(cls("menu-item"), but).render()
                    }
                    case "submenu": {
                        return li(cls("menu-item submenu"),
                            mkButton(item, undefined, false),
                            ul(cls("menu"),
                                ...item.items.map(defToElem)
                            )
                        ).render()
                    }
                }
            }

            const items = menuData.map(defToElem)

            const mainContextMenu = this.editor.html.mainContextMenu
            applyModifiersTo(mainContextMenu, items)
            const em = e as MouseEvent
            mainContextMenu.classList.add("show-menu")

            let menuTop = em.pageY
            mainContextMenu.style.top = menuTop + 'px'
            mainContextMenu.style.left = em.pageX + 'px'

            let needsScrollY = false
            const menuRect = mainContextMenu.getBoundingClientRect()
            const hOverflow = window.innerHeight - menuRect.bottom
            if (hOverflow < 0) {
                menuTop += Math.min(0, hOverflow)
                if (menuTop < 5) {
                    menuTop = 5
                    needsScrollY = true
                }
                mainContextMenu.style.top = menuTop + 'px'
            }

            // TODO this causes some weird behavior with submenus, to be fixed
            if (needsScrollY) {
                mainContextMenu.style.setProperty("max-height", (window.innerHeight - 10) + "px")
                mainContextMenu.style.setProperty("overflow-y", "scroll")
            } else {
                mainContextMenu.style.removeProperty("max-height")
                mainContextMenu.style.removeProperty("overflow-y")
            }

            this._openedContextMenu = mainContextMenu

            const clickHandler = () => {
                hideMenu()
                document.removeEventListener("click", clickHandler)
            }

            setTimeout(() => {
                document.addEventListener("click", clickHandler, false)
            }, 200)

            return true // handled
        }
        return false // unhandled
    }
}

class DeleteHandlers extends ToolHandlers {

    public constructor(editor: LogicEditor) {
        super(editor)
    }

    public override mouseClickedOn(comp: Drawable, __: MouseEvent) {
        return this.editor.eventMgr.tryDeleteDrawable(comp)
    }
}

class MoveHandlers extends ToolHandlers {

    public constructor(editor: LogicEditor) {
        super(editor)
    }

    public override mouseDownOnBackground(e: MouseEvent) {
        for (const comp of this.editor.components.all()) {
            comp.mouseDown(e)
        }
        for (const wire of this.editor.wireMgr.wires) {
            for (const waypoint of wire.waypoints) {
                waypoint.mouseDown(e)
            }
        }
    }
    public override mouseDraggedOnBackground(e: MouseEvent) {
        for (const comp of this.editor.components.all()) {
            comp.mouseDragged(e)
        }
        for (const wire of this.editor.wireMgr.wires) {
            for (const waypoint of wire.waypoints) {
                waypoint.mouseDragged(e)
            }
        }
    }
    public override mouseUpOnBackground(e: MouseEvent) {
        for (const comp of this.editor.components.all()) {
            comp.mouseUp(e)
        }
        for (const wire of this.editor.wireMgr.wires) {
            for (const waypoint of wire.waypoints) {
                waypoint.mouseUp(e)
            }
        }
    }
}