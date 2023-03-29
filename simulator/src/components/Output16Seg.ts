import * as t from "io-ts"
import { COLOR_LED_ON, COLOR_OFF_BACKGROUND } from "../drawutils"
import { div, mods, span, style, title, tooltipContent } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { ArrayFillWith, LogicValue, toLogicValueRepr, typeOrUndefined } from "../utils"
import { ComponentBase, ComponentName, ComponentNameRepr, defineComponent, group, Repr } from "./Component"
import { ContextMenuData, ContextMenuItem, ContextMenuItemPlacement, DrawContext } from "./Drawable"
import { LedColor, ledColorForLogicValue, LedColors } from "./OutputBar"


export const Output16SegDef =
    defineComponent("out", "16seg", {
        button: { imgWidth: 32 },
        repr: {
            color: typeOrUndefined(t.keyof(LedColors, "LedColor")),
            transparent: typeOrUndefined(t.boolean),
            name: ComponentNameRepr,
        },
        valueDefaults: {
            color: "green" as LedColor,
            transparent: true,
        },
        size: { gridWidth: 8, gridHeight: 10 },
        makeNodes: () => ({
            ins: {
                In: group("w", [
                    [-5, -4, "a1"],
                    [-6, -3.5, "a2"],
                    [-5, -3, "b"],
                    [-6, -2.5, "c"],
                    [-5, -2, "d2"],
                    [-6, -1.5, "d1"],
                    [-5, -1, "e"],
                    [-6, -0.5, "f"],
                    [-5, 0, "g1"],
                    [-6, 0.5, "g2"],
                    [-5, +1, "h"],
                    [-6, +1.5, "i"],
                    [-5, +2, "j"],
                    [-6, +2.5, "k"],
                    [-5, +3, "l"],
                    [-6, +3.5, "m"],
                    [-5, +4, "p"],
                ]),
            },
        }),
        initialValue: () => ArrayFillWith<LogicValue>(false, 17),
    })

type Output16SegRepr = Repr<typeof Output16SegDef>

export class Output16Seg extends ComponentBase<Output16SegRepr> {

    private _color: LedColor = Output16SegDef.aults.color
    private _transparent = Output16SegDef.aults.transparent
    private _name: ComponentName = undefined

    public constructor(editor: LogicEditor, saved?: Output16SegRepr) {
        super(editor, Output16SegDef, saved)
        if (isDefined(saved)) {
            this._color = saved.color ?? Output16SegDef.aults.color
            this._transparent = saved.transparent ?? Output16SegDef.aults.transparent
            this._name = saved.name
        }
    }

    public toJSON() {
        return {
            type: "16seg" as const,
            ...this.toJSONBase(),
            color: this._color === Output16SegDef.aults.color ? undefined : this._color,
            transparent: this._transparent === Output16SegDef.aults.transparent ? undefined : this._transparent,
            name: this._name,
        }
    }

    public override makeTooltip() {
        return tooltipContent(undefined, mods(
            div(S.Components.Output16Seg.tooltip),
        ))
    }

    protected doRecalcValue(): LogicValue[] {
        return this.inputValues(this.inputs.In)
    }

    protected override doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {
        this.doDrawDefault(g, ctx, {
            labelSize: 7,
            name: [this._name, this.value.map(toLogicValueRepr).join(""), true],
            drawInside: ({ left, right, top, bottom }) => {
                const [a1, a2, b, c, d2, d1, e, f, g1, g2, h, i, j, k, l, m, p] = this.value

                const vMargin = 10
                const strokeHalfWidth = 3
                const drawLeft = left + 18
                const drawRight = right - 10
                const drawCenterX = (drawLeft + drawRight) / 2
                const drawTop = top + vMargin
                const drawBottom = bottom - vMargin

                const doFill = (v: LogicValue) => {
                    if (!this._transparent || v !== false) {
                        g.fillStyle = ledColorForLogicValue(v, this._color)
                        g.fill()
                    }
                }

                const drawH = (v: LogicValue, xLeft: number, xRight: number, y: number) => {
                    g.beginPath()
                    g.moveTo(xLeft, y)
                    g.lineTo(xLeft + strokeHalfWidth, y - strokeHalfWidth)
                    g.lineTo(xRight - strokeHalfWidth, y - strokeHalfWidth)
                    g.lineTo(xRight, y)
                    g.lineTo(xRight - strokeHalfWidth, y + strokeHalfWidth)
                    g.lineTo(xLeft + strokeHalfWidth, y + strokeHalfWidth)
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

                const dx = strokeHalfWidth * 1.41
                const dy = strokeHalfWidth * 1.41

                const drawBackslash = (v: LogicValue, xLeft: number, yTop: number, xRight: number, yBottom: number) => {
                    g.beginPath()
                    g.moveTo(xLeft, yTop)
                    g.lineTo(xLeft + dx, yTop)
                    g.lineTo(xRight, yBottom - dy)
                    g.lineTo(xRight, yBottom)
                    g.lineTo(xRight - dx, yBottom)
                    g.lineTo(xLeft, yTop + dy)
                    g.closePath()
                    g.stroke()
                    doFill(v)
                }

                const drawSlash = (v: LogicValue, xLeft: number, yBottom: number, xRight: number, yTop: number) => {
                    g.beginPath()
                    g.moveTo(xLeft, yBottom)
                    g.lineTo(xLeft, yBottom - dy)
                    g.lineTo(xRight - dx, yTop)
                    g.lineTo(xRight, yTop)
                    g.lineTo(xRight, yTop + dy)
                    g.lineTo(xLeft + dx, yBottom)
                    g.closePath()
                    g.stroke()
                    doFill(v)
                }

                g.strokeStyle = COLOR_OFF_BACKGROUND
                g.lineWidth = 1
                drawH(a1, drawLeft + strokeHalfWidth, drawCenterX, drawTop + strokeHalfWidth)
                drawH(a2, drawCenterX, drawRight - strokeHalfWidth, drawTop + strokeHalfWidth)
                drawV(b, drawRight - strokeHalfWidth, drawTop + strokeHalfWidth, this.posY)
                drawV(c, drawRight - strokeHalfWidth, this.posY, drawBottom - strokeHalfWidth)
                drawH(d1, drawLeft + strokeHalfWidth, drawCenterX, drawBottom - strokeHalfWidth)
                drawH(d2, drawCenterX, drawRight - strokeHalfWidth, drawBottom - strokeHalfWidth)
                drawV(e, drawLeft + strokeHalfWidth, this.posY, drawBottom - strokeHalfWidth)
                drawV(f, drawLeft + strokeHalfWidth, drawTop + strokeHalfWidth, this.posY)
                drawH(g1, drawLeft + strokeHalfWidth, drawCenterX, this.posY)
                drawH(g2, drawCenterX, drawRight - strokeHalfWidth, this.posY)
                drawV(i, drawCenterX, drawTop + strokeHalfWidth, this.posY)
                drawV(l, drawCenterX, this.posY, drawBottom - strokeHalfWidth)
                const slashTop = drawTop + strokeHalfWidth + strokeHalfWidth
                const slashBottom = drawBottom - strokeHalfWidth - strokeHalfWidth
                drawBackslash(h, drawLeft + strokeHalfWidth + strokeHalfWidth, slashTop, drawCenterX - strokeHalfWidth, this.posY - strokeHalfWidth)
                drawSlash(j, drawCenterX + strokeHalfWidth, this.posY - strokeHalfWidth, drawRight - strokeHalfWidth - strokeHalfWidth, slashTop)
                drawSlash(k, drawLeft + strokeHalfWidth + strokeHalfWidth, slashBottom, drawCenterX - strokeHalfWidth, this.posY + strokeHalfWidth)
                drawBackslash(m, drawCenterX + strokeHalfWidth, this.posY + strokeHalfWidth, drawRight - strokeHalfWidth - strokeHalfWidth, slashBottom)

                g.beginPath()
                const radius = 1.3 * strokeHalfWidth
                g.arc(right - 8, bottom - 7 - radius / 2, radius, 0, 2 * Math.PI)
                g.stroke()
                doFill(p)
            },
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
        const s = S.Components.OutputBar.contextMenu // same between 16 and 7 seg; merge?

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
        } else {
            super.keyDown(e)
        }
    }

}
Output16SegDef.impl = Output16Seg
