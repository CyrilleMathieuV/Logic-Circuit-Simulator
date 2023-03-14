import * as t from "io-ts"
import { COLOR_BACKGROUND, COLOR_COMPONENT_BORDER, COLOR_COMPONENT_INNER_LABELS, COLOR_LED_ON, COLOR_MOUSE_OVER, COLOR_OFF_BACKGROUND, drawComponentName, drawLabel, drawWireLineToComponent, GRID_STEP } from "../drawutils"
import { div, mods, span, style, title, tooltipContent } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { ArrayFillWith, isDefined, isNotNull, LogicValue, toLogicValueRepr, typeOrUndefined } from "../utils"
import { ComponentBase, ComponentName, ComponentNameRepr, defineComponent, Repr } from "./Component"
import { ContextMenuData, ContextMenuItem, ContextMenuItemPlacement, DrawContext } from "./Drawable"
import { LedColor, ledColorForLogicValue, LedColors } from "./OutputBar"


export const Output7SegDef =
    defineComponent(true, false, t.type({
        type: t.literal("7seg"),
        color: typeOrUndefined(t.keyof(LedColors, "LedColor")),
        transparent: typeOrUndefined(t.boolean),
        name: ComponentNameRepr,
    }, "Ouput7Seg"))

const enum INPUT {
    a, b, c, d, e, f, g, p
}

const Output7SegDefaults = {
    color: "green" as LedColor,
    transparent: true,
}

const GRID_WIDTH = 8
const GRID_HEIGHT = 10

type Output7SegRepr = Repr<typeof Output7SegDef>

export class Output7Seg extends ComponentBase<Output7SegRepr, LogicValue[]> {

    private _color = Output7SegDefaults.color
    private _transparent = Output7SegDefaults.transparent
    private _name: ComponentName = undefined

    public constructor(editor: LogicEditor, savedData: Output7SegRepr | null) {
        super(editor, ArrayFillWith(false, 8), savedData, {
            ins: [
                ["a", -5, -4, "w", "In"],
                ["b", -5, -3, "w", "In"],
                ["c", -5, -2, "w", "In"],
                ["d", -5, -1, "w", "In"],
                ["e", -5, 0, "w", "In"],
                ["f", -5, +1, "w", "In"],
                ["g", -5, +2, "w", "In"],
                ["p", -5, +4, "w", "In"],
            ],
        })
        if (isNotNull(savedData)) {
            this._color = savedData.color ?? Output7SegDefaults.color
            this._transparent = savedData.transparent ?? Output7SegDefaults.transparent
            this._name = savedData.name
        }
    }

    public toJSON() {
        return {
            type: "7seg" as const,
            ...this.toJSONBase(),
            color: this._color === Output7SegDefaults.color ? undefined : this._color,
            transparent: this._transparent === Output7SegDefaults.transparent ? undefined : this._transparent,
            name: this._name,
        }
    }

    public get componentType() {
        return "out" as const
    }

    public get unrotatedWidth() {
        return GRID_WIDTH * GRID_STEP
    }

    public get unrotatedHeight() {
        return GRID_HEIGHT * GRID_STEP
    }

    public override makeTooltip() {
        return tooltipContent(undefined, mods(
            div(S.Components.Output7Seg.tooltip)
        ))
    }

    protected doRecalcValue(): LogicValue[] {
        return this.inputValues([INPUT.a, INPUT.b, INPUT.c, INPUT.d, INPUT.e, INPUT.f, INPUT.g, INPUT.p])
    }

    protected doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {

        const width = GRID_WIDTH * GRID_STEP
        const height = GRID_HEIGHT * GRID_STEP
        const left = this.posX - width / 2
        const right = left + width
        const top = this.posY - height / 2
        const bottom = top + height

        g.fillStyle = COLOR_BACKGROUND
        g.strokeStyle = ctx.isMouseOver ? COLOR_MOUSE_OVER : COLOR_COMPONENT_BORDER
        g.lineWidth = 4

        g.beginPath()
        g.rect(this.posX - width / 2, this.posY - height / 2, width, height)
        g.fill()
        g.stroke()

        for (const input of this.inputs) {
            drawWireLineToComponent(g, input, this.posX - width / 2 - 2, input.posYInParentTransform)
        }

        const [a, b, c, d, e, f, gg, p] = this.value

        const hMargin = 20
        const vMargin = 10
        const strokeHalfWidth = 4
        const drawLeft = left + hMargin
        const drawRight = right - hMargin
        const drawTop = top + vMargin
        const drawBottom = bottom - vMargin

        const doFill = (v: LogicValue) => {
            if (!this._transparent || v !== false) {
                g.fillStyle = ledColorForLogicValue(v, this._color)
                g.fill()
            }
        }

        const drawH = (v: LogicValue, y: number) => {
            g.beginPath()
            g.moveTo(drawLeft + strokeHalfWidth, y)
            g.lineTo(drawLeft + strokeHalfWidth + strokeHalfWidth, y - strokeHalfWidth)
            g.lineTo(drawRight - strokeHalfWidth - strokeHalfWidth, y - strokeHalfWidth)
            g.lineTo(drawRight - strokeHalfWidth, y)
            g.lineTo(drawRight - strokeHalfWidth - strokeHalfWidth, y + strokeHalfWidth)
            g.lineTo(drawLeft + strokeHalfWidth + strokeHalfWidth, y + strokeHalfWidth)
            g.closePath()
            g.stroke()
            doFill(v)
        }

        const drawV = (v: LogicValue, x: number, yTop: number, yBottom: number) => {
            g.beginPath()
            g.moveTo(x, yTop)
            g.lineTo(x + strokeHalfWidth, yTop + strokeHalfWidth)
            g.lineTo(x + strokeHalfWidth, yBottom - strokeHalfWidth)
            g.lineTo(x, yBottom)
            g.lineTo(x - strokeHalfWidth, yBottom - strokeHalfWidth)
            g.lineTo(x - strokeHalfWidth, yTop + strokeHalfWidth)
            g.closePath()
            g.stroke()
            doFill(v)
        }

        g.strokeStyle = COLOR_OFF_BACKGROUND
        g.lineWidth = 1
        drawH(a, drawTop + strokeHalfWidth)
        drawV(b, drawRight - strokeHalfWidth, drawTop + strokeHalfWidth, this.posY)
        drawV(c, drawRight - strokeHalfWidth, this.posY, drawBottom - strokeHalfWidth)
        drawH(d, drawBottom - strokeHalfWidth)
        drawV(e, drawLeft + strokeHalfWidth, this.posY, drawBottom - strokeHalfWidth)
        drawV(f, drawLeft + strokeHalfWidth, drawTop + strokeHalfWidth, this.posY)
        drawH(gg, this.posY)

        g.beginPath()
        const radius = 1.3 * strokeHalfWidth
        g.arc(right - hMargin / 2, bottom - vMargin - radius / 2, radius, 0, 2 * Math.PI)
        g.stroke()
        doFill(p)

        ctx.inNonTransformedFrame(ctx => {
            g.fillStyle = COLOR_COMPONENT_INNER_LABELS
            g.font = "12px sans-serif"

            this.inputs.forEach(input => {
                drawLabel(ctx, this.orient, input.name, "w", left, input)
            })

            if (isDefined(this._name)) {
                const valueString = this.value.map(toLogicValueRepr).join("")
                drawComponentName(g, ctx, this._name, valueString, this, true)
            }
        })
    }

    private doSetName(name: ComponentName) {
        this._name = name
        this.setNeedsRedraw("name changed")
    }

    private doSetColor(color: LedColor) {
        this._color = color
        this.setNeedsRedraw("color changed")
    }

    private doSetTransparent(transparent: boolean) {
        this._transparent = transparent
        this.setNeedsRedraw("transparent changed")
    }

    protected override makeComponentSpecificContextMenuItems(): undefined | [ContextMenuItemPlacement, ContextMenuItem][] {

        // TODO merge with OutputBar
        const s = S.Components.OutputBar.contextMenu
        const makeItemUseColor = (desc: string, color: LedColor) => {
            const isCurrent = this._color === color
            const icon = isCurrent ? "check" : "none"
            const action = isCurrent ? () => undefined : () => this.doSetColor(color)
            const cssColor = COLOR_LED_ON[color]
            return ContextMenuData.item(icon, span(title(desc), style(`display: inline-block; width: 140px; height: 16px; background-color: ${cssColor}; margin-right: 8px`)), action)
        }

        const itemTransparent = ContextMenuData.item(
            this._transparent ? "check" : "none",
            s.TransparentWhenOff,
            () => this.doSetTransparent(!this._transparent)
        )

        return [
            ["mid", ContextMenuData.submenu("palette", s.Color, [
                makeItemUseColor(s.ColorGreen, "green"),
                makeItemUseColor(s.ColorRed, "red"),
                makeItemUseColor(s.ColorYellow, "yellow"), ContextMenuData.sep(),
                itemTransparent,

            ])],
            ["mid", this.makeSetNameContextMenuItem(this._name, this.doSetName.bind(this))],
        ]
    }


    public override keyDown(e: KeyboardEvent): void {
        if (e.key === "Enter") {
            this.runSetNameDialog(this._name, this.doSetName.bind(this))
        }
    }

}
