import * as t from "io-ts"
import { DrawZIndex } from "../ComponentList"
import { GRID_STEP, inRect } from "../drawutils"
import { Modifier, ModifierObject, span, style } from "../htmlgen"
import { IconName } from "../images"
import { DrawParams, LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { Expand, isDefined, isNotNull, isUndefined, Mode, RichStringEnum, typeOrUndefined } from "../utils"

export interface DrawContext {
    g: CanvasRenderingContext2D
    drawParams: DrawParams
    isMouseOver: boolean
    inNonTransformedFrame(f: (ctx: DrawContextExt) => unknown): void
}

export interface DrawContextExt extends DrawContext {
    rotatePoint(x: number, y: number): readonly [x: number, y: number]
}

export type ContextMenuItem =
    | { _tag: "sep" }
    | { _tag: "text", caption: Modifier }
    | { _tag: "item", icon: IconName | undefined, caption: Modifier, danger: boolean | undefined, action: (itemEvent: MouseEvent | TouchEvent, menuEvent: MouseEvent | TouchEvent) => unknown }
    | { _tag: "submenu", icon: IconName | undefined, caption: Modifier, items: ContextMenuData }

export type ContextMenuData = ContextMenuItem[]
export const ContextMenuData = {
    sep(): ContextMenuItem {
        return { _tag: "sep" }
    },
    text(caption: Modifier): ContextMenuItem {
        return { _tag: "text", caption }
    },
    item(icon: IconName | undefined, caption: Modifier, action: (itemEvent: MouseEvent | TouchEvent, menuEvent: MouseEvent | TouchEvent) => unknown, danger?: boolean): ContextMenuItem {
        return { _tag: "item", icon, caption, action, danger }
    },
    submenu(icon: IconName | undefined, caption: Modifier, items: ContextMenuData): ContextMenuItem {
        return { _tag: "submenu", icon, caption, items }
    },
}

export type ContextMenuItemPlacement = "start" | "mid" | "end" // where to insert items created by components

class _DrawContextImpl implements DrawContext, DrawContextExt {

    private readonly entranceTransform: DOMMatrix
    private readonly entranceTransformInv: DOMMatrix
    private readonly componentTransform: DOMMatrix

    public constructor(
        private comp: Drawable,
        public readonly g: CanvasRenderingContext2D,
        public readonly drawParams: DrawParams,
        public readonly isMouseOver: boolean,
    ) {
        this.entranceTransform = g.getTransform()
        this.entranceTransformInv = this.entranceTransform.inverse()
        comp.applyDrawTransform(g)
        this.componentTransform = g.getTransform()
    }

    public exit() {
        this.g.setTransform(this.entranceTransform)
    }

    public inNonTransformedFrame(f: (ctx: DrawContextExt) => unknown) {
        this.g.setTransform(this.entranceTransform)
        f(this)
        this.g.setTransform(this.componentTransform)
    }

    public rotatePoint(x: number, y: number): readonly [x: number, y: number] {
        return mult(this.entranceTransformInv, ...mult(this.componentTransform, x, y))
    }

}

function mult(m: DOMMatrix, x: number, y: number): [x: number, y: number] {
    return [
        m.a * x + m.c * y + m.e,
        m.b * x + m.d * y + m.f,
    ]
}

export abstract class Drawable {

    public readonly editor: LogicEditor
    public ref: string | undefined = undefined

    protected constructor(editor: LogicEditor) {
        this.editor = editor
        this.setNeedsRedraw("newly created")
    }

    protected setNeedsRedraw(reason: string) {
        this.editor.redrawMgr.addReason(reason, this)
    }

    public get drawZIndex(): DrawZIndex {
        return 1
    }

    public draw(g: CanvasRenderingContext2D, drawParams: DrawParams): void {
        const inSelectionRect = drawParams.currentSelection?.isSelected(this) ?? false
        const ctx = new _DrawContextImpl(this, g, drawParams, this === drawParams.currentMouseOverComp || inSelectionRect)
        this.doDraw(g, ctx)
        ctx.exit()
    }

    public applyDrawTransform(__g: CanvasRenderingContext2D) {
        // by default, do nothing
    }

    protected abstract doDraw(g: CanvasRenderingContext2D, ctx: DrawContext): void

    public abstract isOver(x: number, y: number): boolean

    public abstract isInRect(rect: DOMRect): boolean

    public get cursorWhenMouseover(): string | undefined {
        return undefined
    }

    public toString(): string {
        return `${this.constructor.name}(${this.toStringDetails()})`
    }

    protected toStringDetails(): string {
        return ""
    }

    public makeTooltip(): ModifierObject | undefined {
        return undefined
    }

    public makeContextMenu(): ContextMenuData | undefined {
        return undefined
    }

    protected makeSetRefContextMenuItem(): ContextMenuItem {
        const currentRef = this.ref
        const s = S.Components.Generic.contextMenu
        const caption: Modifier = isUndefined(currentRef) ? s.SetIdentifier : span(s.ChangeIdentifier[0], span(style("font-family: monospace; font-weight: bolder; font-size: 90%"), currentRef), s.ChangeIdentifier[1])
        return ContextMenuData.item("ref", caption, () => {
            const newRef = window.prompt(s.SetIdentifierPrompt, currentRef)
            if (newRef !== null) {
                // OK button pressed
                this.ref = newRef.length === 0 ? undefined : newRef
                if (currentRef !== this.ref) {
                    this.setNeedsRedraw("ref changed")
                }
            }
        })
    }

    // Return { wantsDragEvents: true } (default) to signal the component
    // wants to get all mouseDragged and the final mouseUp event. Useful to
    // return false to allow drag destinations to get a mouseUp
    public mouseDown(__: MouseEvent | TouchEvent): { wantsDragEvents: boolean } {
        // empty default implementation
        return { wantsDragEvents: true }
    }

    public mouseDragged(__: MouseEvent | TouchEvent) {
        // empty default implementation
    }

    // Return true to indicate it was handled and had an effect, in which
    // case a snapshot should be taken for undo/redo
    public mouseUp(__: MouseEvent | TouchEvent): boolean {
        // empty default implementation
        return false
    }

    // Return true to indicate it was handled and had an effect
    // (and presumably doesn't need to be handled any more)
    public mouseClicked(__: MouseEvent | TouchEvent): boolean {
        // empty default implementation
        return false
    }

    // Return true to indicate it was handled and had an effect
    // (and presumably doesn't need to be handled any more)
    public mouseDoubleClicked(__: MouseEvent | TouchEvent): boolean {
        // empty default implementation
        return false
    }

    public keyDown(__: KeyboardEvent): void {
        // empty default implementation
    }

}


// implemented by components with no array to hold the members
// for direct access for performance
export interface HasPosition {

    readonly posX: number
    readonly posY: number

}

export const Orientations_ = {
    "e": {},
    "s": {},
    "w": {},
    "n": {},
} as const

export const Orientations = RichStringEnum.withProps<{
}>()(Orientations_)


export type Orientation = typeof Orientations.type

export const Orientation = {
    default: "e" as Orientation,
    invert(o: Orientation): Orientation {
        switch (o) {
            case "e": return "w"
            case "w": return "e"
            case "n": return "s"
            case "s": return "n"
        }
    },
    nextClockwise(o: Orientation): Orientation {
        switch (o) {
            case "e": return "s"
            case "s": return "w"
            case "w": return "n"
            case "n": return "e"
        }
    },
    nextCounterClockwise(o: Orientation): Orientation {
        switch (o) {
            case "e": return "n"
            case "n": return "w"
            case "w": return "s"
            case "s": return "e"
        }
    },
    isVertical(o: Orientation): o is "s" | "n" {
        return o === "s" || o === "n"
    },
    add(compOrient: Orientation, nodeOrient: Orientation): Orientation {
        switch (compOrient) {
            case "e": return nodeOrient
            case "w": return Orientation.invert(nodeOrient)
            case "s": return Orientation.nextClockwise(nodeOrient)
            case "n": return Orientation.nextCounterClockwise(nodeOrient)
        }
    },
}


// for compact JSON repr, pos is an array
export const PositionSupportRepr = t.type({
    pos: t.readonly(t.tuple([t.number, t.number])),
    orient: typeOrUndefined(t.keyof(Orientations_)),
    ref: typeOrUndefined(t.string),
})

export type PositionSupportRepr = Expand<t.TypeOf<typeof PositionSupportRepr>>


export abstract class DrawableWithPosition extends Drawable implements HasPosition {

    private _posX: number
    private _posY: number
    private _orient: Orientation

    protected constructor(editor: LogicEditor, savedData: PositionSupportRepr | null) {
        super(editor)

        // using null and not undefined to prevent subclasses from
        // unintentionally skipping the parameter

        if (isNotNull(savedData)) {
            // restoring from saved object
            this.ref = savedData.ref
            this._posX = savedData.pos[0]
            this._posY = savedData.pos[1]
            this._orient = savedData.orient ?? Orientation.default
        } else {
            // creating new object
            this._posX = Math.max(0, this.editor.mouseX)
            this._posY = this.editor.mouseY
            this._orient = Orientation.default
        }
    }

    protected toJSONBase(): PositionSupportRepr {
        return {
            pos: [this.posX, this.posY] as const,
            orient: this.orient === Orientation.default ? undefined : this.orient,
            ref: this.ref,
        }
    }

    public get posX() {
        return this._posX
    }

    public get posY() {
        return this._posY
    }

    public isInRect(rect: DOMRect) {
        return this._posX >= rect.left && this._posX <= rect.right && this._posY >= rect.top && this._posY <= rect.bottom
    }

    public get orient() {
        return this._orient
    }

    public canRotate() {
        return true
    }

    public doSetOrient(newOrient: Orientation) {
        this._orient = newOrient
        this.setNeedsRedraw("orientation changed")
    }

    public get width(): number {
        return Orientation.isVertical(this._orient) ? this.unrotatedHeight : this.unrotatedWidth
    }

    public get height(): number {
        return Orientation.isVertical(this._orient) ? this.unrotatedWidth : this.unrotatedHeight
    }

    public abstract get unrotatedWidth(): number

    public abstract get unrotatedHeight(): number

    public override applyDrawTransform(g: CanvasRenderingContext2D) {
        const rotation = (() => {
            switch (this._orient) {
                case "e": return undefined
                case "s": return Math.PI / 2
                case "w": return Math.PI
                case "n": return -Math.PI / 2
            }
        })()

        if (isDefined(rotation)) {
            g.translate(this.posX, this.posY)
            g.rotate(rotation)
            g.translate(-this.posX, -this.posY)
        }
    }

    public isOver(x: number, y: number) {
        return this.editor.mode >= Mode.CONNECT && inRect(this._posX, this._posY, this.width, this.height, x, y)
    }

    protected trySetPosition(posX: number, posY: number, snapToGrid: boolean): undefined | [number, number] {
        const roundTo = snapToGrid ? GRID_STEP : (GRID_STEP / 2)
        posX = Math.round(posX / roundTo) * roundTo
        posY = Math.round(posY / roundTo) * roundTo
        if (posX !== this._posX || posY !== this.posY) {
            this._posX = posX
            this._posY = posY
            this.setNeedsRedraw("position changed")
            return [posX, posY]
        }
        return undefined
    }

    protected makeChangeOrientationContextMenuItem(): ContextMenuItem {
        const s = S.Components.Generic.contextMenu
        return ContextMenuData.submenu("direction", s.Orientation, [
            ...Orientations.values.map(orient => {
                const isCurrent = this._orient === orient
                const icon = isCurrent ? "check" : "none"
                const caption = S.Orientations[orient]
                const action = isCurrent ? () => undefined : () => {
                    this.doSetOrient(orient)
                }
                return ContextMenuData.item(icon, caption, action)
            }),
            ContextMenuData.sep(),
            ContextMenuData.text(s.ChangeOrientationDesc),
        ])
    }

}


interface DragContext {
    mouseOffsetToPosX: number
    mouseOffsetToPosY: number
    lastAnchorX: number
    lastAnchorY: number
}


export abstract class DrawableWithDraggablePosition extends DrawableWithPosition {

    private _isMovingWithContext: undefined | DragContext = undefined

    protected constructor(editor: LogicEditor, savedData: PositionSupportRepr | null) {
        super(editor, savedData)
    }

    public get isMoving() {
        return isDefined(this._isMovingWithContext)
    }

    protected tryStartMoving(e: MouseEvent | TouchEvent) {
        if (isUndefined(this._isMovingWithContext)) {
            const [offsetX, offsetY] = this.editor.offsetXY(e)
            this._isMovingWithContext = {
                mouseOffsetToPosX: offsetX - this.posX,
                mouseOffsetToPosY: offsetY - this.posY,
                lastAnchorX: this.posX,
                lastAnchorY: this.posY,
            }
        }
    }

    protected updateWhileMoving(e: MouseEvent | TouchEvent) {
        this.updatePositionIfNeeded(e)
        this.editor.moveMgr.setDrawableMoving(this)
    }

    protected tryStopMoving(): boolean {
        let wasMoving = false
        if (isDefined(this._isMovingWithContext)) {
            this._isMovingWithContext = undefined
            wasMoving = true
        }
        this.editor.moveMgr.setDrawableStoppedMoving(this)
        return wasMoving
    }

    private updatePositionIfNeeded(e: MouseEvent | TouchEvent): undefined | [number, number] {
        const [x, y] = this.editor.offsetXY(e)
        const snapToGrid = !e.metaKey
        const newPos = this.updateSelfPositionIfNeeded(x, y, snapToGrid, e)
        if (isDefined(newPos)) { // position changed
            this.positionChanged()
        }
        return newPos
    }

    public setPosition(x: number, y: number) {
        const newPos = this.trySetPosition(x, y, false)
        if (isDefined(newPos)) { // position changed
            this.positionChanged()
        }
    }

    protected positionChanged() {
        // do nothing by default
    }

    protected updateSelfPositionIfNeeded(x: number, y: number, snapToGrid: boolean, e: MouseEvent | TouchEvent): undefined | [number, number] {
        if (isDefined(this._isMovingWithContext)) {
            const { mouseOffsetToPosX, mouseOffsetToPosY, lastAnchorX, lastAnchorY } = this._isMovingWithContext
            let targetX = x - mouseOffsetToPosX
            let targetY = y - mouseOffsetToPosY
            if (e.shiftKey) {
                // move along axis only
                const dx = Math.abs(lastAnchorX - targetX)
                const dy = Math.abs(lastAnchorY - targetY)
                if (dx <= dy) {
                    targetX = lastAnchorX
                } else {
                    targetY = lastAnchorY
                }
            }
            return this.trySetPosition(targetX, targetY, snapToGrid)
        }
        return undefined
    }

}