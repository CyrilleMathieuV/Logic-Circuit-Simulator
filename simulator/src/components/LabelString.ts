import * as t from "io-ts"
import { DrawZIndex } from "../ComponentList"
import { COLOR_COMPONENT_BORDER, COLOR_MOUSE_OVER, FONT_LABEL_DEFAULT, GRID_STEP } from "../drawutils"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { isUndefined, typeOrUndefined } from "../utils"
import { ComponentBase, defineComponent, Repr } from "./Component"
import { ContextMenuData, DrawContext, MenuItems } from "./Drawable"

export const LabelStringDef =
    defineComponent("label", undefined, {
        button: { imgWidth: 32 },
        repr: {
            text: t.string,
            // align: typeOrUndefined(t.string), 
            font: typeOrUndefined(t.string),
        },
        valueDefaults: {
            text: "Label",
            // align: "center" as const,
            font: FONT_LABEL_DEFAULT,
        },
        size: { gridWidth: 4, gridHeight: 2 }, // overridden
        makeNodes: () => ({}),
    })

export type LabelStringRepr = Repr<typeof LabelStringDef>

export class LabelString extends ComponentBase<LabelStringRepr> {

    private _text: string
    // private _align: CanvasTextAlign // causes issues with mouseovers and stuff
    private _font: string
    private _cachedTextMetrics: TextMetrics | undefined = undefined

    public constructor(editor: LogicEditor, saved?: LabelStringRepr) {
        super(editor, LabelStringDef, saved)
        this._text = saved?.text ?? LabelStringDef.aults.text
        // this._align = (saved?.align as CanvasTextAlign) ?? LabelStringDefaults.align
        this._font = saved?.font ?? LabelStringDef.aults.font
    }

    public toJSON() {
        return {
            ...this.toJSONBase(),
            text: this._text,
            // align: this._align === LabelStringDefaults.align ? undefined : this._align,
            font: this._font === LabelStringDef.aults.font ? undefined : this._font,
        }
    }

    public override get unrotatedWidth() {
        return this._cachedTextMetrics?.width ?? GRID_STEP * this._text.length
    }

    public override get unrotatedHeight() {
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

    protected override doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {

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

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        const s = S.Components.LabelString.contextMenu
        const setTextItem = ContextMenuData.item("pen", s.ChangeText, this.runSetTextDialog.bind(this))

        const setFontItem = ContextMenuData.item("font", s.Font, () => {
            this.runSetFontDialog(this._font, LabelStringDef.aults.font, this.doSetFont.bind(this))
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
            const newText = promptReturnValue.length === 0 ? LabelStringDef.aults.text : promptReturnValue
            this.doSetText(newText)
        }
    }

    public override keyDown(e: KeyboardEvent): void {
        if (e.key === "Enter") {
            this.runSetTextDialog()
        } else {
            super.keyDown(e)
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
LabelStringDef.impl = LabelString
