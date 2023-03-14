import * as t from "io-ts"
import { COLOR_COMPONENT_BORDER, COLOR_HIGH_IMPEDANCE, COLOR_LED_ON, COLOR_MOUSE_OVER, COLOR_UNKNOWN, COLOR_WIRE_BORDER, drawComponentName, drawWireLineToComponent, GRID_STEP, pxToGrid } from "../drawutils"
import { asValue, Modifier, mods, span, style, title, tooltipContent } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { HighImpedance, isDefined, isHighImpedance, isNotNull, isUnknown, LogicValue, toLogicValueRepr, typeOrUndefined, Unknown } from "../utils"
import { ComponentBase, ComponentName, ComponentNameRepr, defineComponent, Repr } from "./Component"
import { ContextMenuData, ContextMenuItem, ContextMenuItemPlacement, DrawContext } from "./Drawable"


export const OutputBarTypes = {
    v: null,
    h: null,
    px: null,
    PX: null,
} as const

type OutputBarType = keyof typeof OutputBarTypes


export const LedColors = {
    green: null,
    red: null,
    yellow: null,
} as const

export type LedColor = keyof typeof LedColors

export function ledColorForLogicValue(v: LogicValue, onColor: LedColor) {
    return isUnknown(v) ? COLOR_UNKNOWN :
        isHighImpedance(v) ? COLOR_HIGH_IMPEDANCE :
            v ? COLOR_LED_ON[onColor] : COLOR_WIRE_BORDER
}

export const OutputBarDef =
    defineComponent(true, false, t.type({
        type: t.literal("bar"),
        display: t.keyof(OutputBarTypes, "OutputBarType"),
        color: typeOrUndefined(t.keyof(LedColors, "LedColor")),
        transparent: typeOrUndefined(t.boolean),
        name: ComponentNameRepr,
    }, "OutputBar"))

type OutputBarRepr = Repr<typeof OutputBarDef>

const OutputBarDefaults = {
    display: "h" as OutputBarType,
    color: "green" as LedColor,
    transparent: false,
}
const GRID_WIDTH = 10
const GRID_HEIGHT = 2


export class OutputBar extends ComponentBase<OutputBarRepr, LogicValue> {

    private _display = OutputBarDefaults.display
    private _color = OutputBarDefaults.color
    private _transparent = OutputBarDefaults.transparent
    private _name: ComponentName = undefined

    public constructor(editor: LogicEditor, savedData: OutputBarRepr | null) {
        super(editor, false, savedData, { ins: [[undefined, 0, 0, "w"]] })
        if (isNotNull(savedData)) {
            this.doSetDisplay(savedData.display)
            this._color = savedData.color ?? OutputBarDefaults.color
            this._transparent = savedData.transparent ?? OutputBarDefaults.transparent
            this._name = savedData.name
        } else {
            this.updateInputOffsetX()
        }
    }

    public toJSON() {
        return {
            type: "bar" as const,
            ...super.toJSONBase(),
            display: this._display,
            color: this._color === OutputBarDefaults.color ? undefined : this._color,
            transparent: this._transparent === OutputBarDefaults.transparent ? undefined : this._transparent,
            name: this._name,
        }
    }

    public get componentType() {
        return "out" as const
    }

    public get unrotatedWidth() {
        return this.getWidthAndHeight()[0]
    }

    public get unrotatedHeight() {
        return this.getWidthAndHeight()[1]
    }

    public override makeTooltip() {
        const s = S.Components.OutputBar.tooltip
        const expl: Modifier = (() => {
            switch (this.value) {
                case Unknown: return s.ValueUnknown
                case HighImpedance: return s.ValueUnknown
                case true: return mods(s.Value1[0], asValue(this.value), s.Value1[1])
                case false: return mods(s.Value0[0], asValue(this.value), s.Value0[1])
            }
        })()
        return tooltipContent(s.title, expl)
    }

    public get display() {
        return this._display
    }

    protected doRecalcValue(): LogicValue {
        return this.inputs[0].value
    }

    protected doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {
        const input = this.inputs[0]
        const valueToShow = this.editor.options.hideOutputColors ? Unknown : this.value

        g.strokeStyle = ctx.isMouseOver ? COLOR_MOUSE_OVER : COLOR_COMPONENT_BORDER
        g.lineWidth = 4

        const backColor = ledColorForLogicValue(valueToShow, this._color)

        g.fillStyle = backColor
        const [w, h] = this.getWidthAndHeight()
        g.beginPath()
        g.rect(this.posX - w / 2, this.posY - h / 2, w, h)
        g.closePath()
        if (!this._transparent || valueToShow !== false) {
            g.fill()
        }
        g.stroke()

        drawWireLineToComponent(g, input, this.posX - w / 2 - 2, this.posY)

        ctx.inNonTransformedFrame(ctx => {
            if (isDefined(this._name)) {
                drawComponentName(g, ctx, this._name, toLogicValueRepr(valueToShow), this, true)
            }
        })
    }

    private doSetName(name: ComponentName) {
        this._name = name
        this.setNeedsRedraw("name changed")
    }

    public getWidthAndHeight() {
        switch (this._display) {
            case "h":
                return [GRID_WIDTH * GRID_STEP, GRID_HEIGHT * GRID_STEP] as const
            case "v":
                return [GRID_HEIGHT * GRID_STEP, GRID_WIDTH * GRID_STEP] as const
            case "px":
                return [GRID_HEIGHT * GRID_STEP, GRID_HEIGHT * GRID_STEP] as const
            case "PX":
                return [GRID_WIDTH * GRID_STEP, GRID_WIDTH * GRID_STEP] as const
        }
    }

    public override mouseDoubleClicked(e: MouseEvent | TouchEvent) {
        if (super.mouseDoubleClicked(e)) {
            return true // already handled
        }
        this.doSetDisplay((() => {
            switch (this.display) {
                case "h":
                    return "v"
                case "v":
                    return "px"
                case "px":
                    return "PX"
                case "PX":
                    return "h"
            }
        })())
        return true
    }

    private doSetDisplay(newDisplay: OutputBarType) {
        this._display = newDisplay
        this.updateInputOffsetX()
        this.setNeedsRedraw("display mode changed")
    }

    private doSetColor(color: LedColor) {
        this._color = color
        this.setNeedsRedraw("color changed")
    }

    private doSetTransparent(transparent: boolean) {
        this._transparent = transparent
        this.setNeedsRedraw("transparent changed")
    }

    private updateInputOffsetX() {
        const width = this.getWidthAndHeight()[0]
        this.inputs[0].gridOffsetX = -pxToGrid(width / 2) - 2
    }

    protected override makeComponentSpecificContextMenuItems(): undefined | [ContextMenuItemPlacement, ContextMenuItem][] {
        const s = S.Components.OutputBar.contextMenu

        const makeItemShowAs = (desc: string, display: OutputBarType) => {
            const isCurrent = this._display === display
            const icon = isCurrent ? "check" : "none"
            const action = isCurrent ? () => undefined : () => this.doSetDisplay(display)
            return ContextMenuData.item(icon, desc, action)
        }

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
            ["mid", ContextMenuData.submenu("eye", s.Display, [
                makeItemShowAs(s.DisplayVerticalBar, "v"),
                makeItemShowAs(s.DisplayHorizontalBar, "h"),
                makeItemShowAs(s.DisplaySmallSquare, "px"),
                makeItemShowAs(s.DisplayLargeSquare, "PX"),
                ContextMenuData.sep(),
                ContextMenuData.text(s.DisplayChangeDesc),
            ])],
            ["mid", ContextMenuData.submenu("palette", s.Color, [
                makeItemUseColor(s.ColorGreen, "green"),
                makeItemUseColor(s.ColorRed, "red"),
                makeItemUseColor(s.ColorYellow, "yellow"),
                ContextMenuData.sep(),
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
