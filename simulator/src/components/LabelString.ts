import * as t from "io-ts"
import { DrawZIndex } from "../ComponentList"
import { COLOR_COMPONENT_BORDER, COLOR_MOUSE_OVER, FONT_LABEL_DEFAULT, GRID_STEP } from "../drawutils"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { isNotNull, isUndefined, typeOrUndefined } from "../utils"
import { ComponentBase, defineComponent } from "./Component"
import { ContextMenuData, ContextMenuItem, ContextMenuItemPlacement, DrawContext } from "./Drawable"

export const LabelStringDef =
    defineComponent(0, 0, t.type({
        text: t.string,
        // align: typeOrUndefined(t.string), 
        font: typeOrUndefined(t.string),
    }, "Label"))

export type LabelStringRepr = typeof LabelStringDef.reprType

const LabelStringDefaults = {
    text: "Label",
    // align: "center" as const,
    font: FONT_LABEL_DEFAULT,
}
export class LabelString extends ComponentBase<0, 0, LabelStringRepr, undefined> {

    private _text: string
    // private _align: CanvasTextAlign // causes issues with mouseovers and stuff
    private _font: string
    private _cachedTextMetrics: TextMetrics | undefined = undefined

    public constructor(editor: LogicEditor, savedData: LabelStringRepr | null) {
        super(editor, undefined, savedData, {})
        if (isNotNull(savedData)) {
            this._text = savedData.text
            // this._align = (savedData.align as CanvasTextAlign) ?? LabelStringDefaults.align
            this._font = savedData.font ?? LabelStringDefaults.font
        } else {
            this._text = LabelStringDefaults.text
            // this._align = LabelStringDefaults.align
            this._font = LabelStringDefaults.font
        }
    }

    public toJSON() {
        return {
            ...this.toJSONBase(),
            text: this._text,
            // align: this._align === LabelStringDefaults.align ? undefined : this._align,
            font: this._font === LabelStringDefaults.font ? undefined : this._font,
        }
    }

    public get componentType() {
        return "label" as const
    }

    public get unrotatedWidth() {
        return this._cachedTextMetrics?.width ?? GRID_STEP * this._text.length
    }

    public get unrotatedHeight() {
        const metrics = this._cachedTextMetrics
        if (isUndefined(metrics)) {
            return 2 * GRID_STEP
        }
        return metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent
    }

    protected doRecalcValue(): undefined {
        return undefined
    }

    public override get drawZIndex(): DrawZIndex {
        return 2
    }

    protected doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {

        g.font = this._font
        g.lineWidth = 3

        if (ctx.isMouseOver) {
            if (isUndefined(this._cachedTextMetrics)) {
                this._cachedTextMetrics = g.measureText(this._text)
            }
            const width = this.unrotatedWidth
            const height = this.unrotatedHeight
            g.strokeStyle = COLOR_MOUSE_OVER
            g.beginPath()
            g.rect(this.posX - width / 2, this.posY - height / 2, width, height)
            g.stroke()
        }

        g.fillStyle = COLOR_COMPONENT_BORDER
        g.textAlign = "center"
        g.textBaseline = "middle"
        g.fillText(this._text, this.posX, this.posY)
    }

    private doSetText(text: string) {
        this._text = text
        this._cachedTextMetrics = undefined
        this.setNeedsRedraw("text changed")
    }

    private doSetFont(font: string) {
        this._font = font
        this._cachedTextMetrics = undefined
        this.setNeedsRedraw("font changed")
    }

    protected override makeComponentSpecificContextMenuItems(): undefined | [ContextMenuItemPlacement, ContextMenuItem][] {
        const s = S.Components.LabelString.contextMenu
        const setTextItem = ContextMenuData.item("pen", s.ChangeText, this.runSetTextDialog.bind(this))

        const setFontItem = ContextMenuData.item("font", s.Font, () => {
            this.runSetFontDialog(this._font, LabelStringDefaults.font, this.doSetFont.bind(this))
        })

        return [
            ["mid", setTextItem],
            ["mid", setFontItem],
        ]
    }

    private runSetTextDialog() {
        const promptReturnValue = window.prompt(S.Components.LabelString.contextMenu.ChangeTextPrompt, this._text)
        if (promptReturnValue !== null) {
            // OK button pressed
            const newText = promptReturnValue.length === 0 ? LabelStringDefaults.text : promptReturnValue
            this.doSetText(newText)
        }
    }

    public override keyDown(e: KeyboardEvent): void {
        if (e.key === "Enter") {
            this.runSetTextDialog()
        }
    }

    public override mouseDoubleClicked(e: MouseEvent | TouchEvent) {
        if (super.mouseDoubleClicked(e)) {
            return true // already handled
        }
        this.runSetTextDialog()
        return true
    }


}
