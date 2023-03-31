import * as t from "io-ts"
import { COLOR_HIGH_IMPEDANCE, COLOR_LED_ON, COLOR_TRANSPARENT, COLOR_UNKNOWN, COLOR_WIRE_BORDER, GRID_STEP, pxToGrid } from "../drawutils"
import { asValue, Modifier, mods, span, style, title, tooltipContent } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { HighImpedance, isHighImpedance, isUnknown, LogicValue, toLogicValueRepr, typeOrUndefined, Unknown } from "../utils"
import { ComponentBase, ComponentName, ComponentNameRepr, defineComponent, InstantiatedComponentDef, NodesIn, NodesOut, Repr } from "./Component"
import { ContextMenuData, DrawContext, MenuItems } from "./Drawable"
import { Output16SegRepr } from "./Output16Seg"
import { Output7SegRepr } from "./Output7Seg"



export const LedColors = {
    green: null,
    red: null,
    yellow: null,
} as const

export type LedColor = keyof typeof LedColors

export const OutputBarTypes = {
    v: null,
    h: null,
    px: null,
    PX: null,
} as const

type OutputBarType = keyof typeof OutputBarTypes


export function ledColorForLogicValue(v: LogicValue, onColor: LedColor) {
    return isUnknown(v) ? COLOR_UNKNOWN :
        isHighImpedance(v) ? COLOR_HIGH_IMPEDANCE :
            v ? COLOR_LED_ON[onColor] : COLOR_WIRE_BORDER
}

type OutputBarBaseRepr = OutputBarRepr | Output7SegRepr | Output16SegRepr

export abstract class OutputBarBase<TRepr extends OutputBarBaseRepr, TValue> extends ComponentBase<
    TRepr,
    TValue,
    NodesIn<TRepr>,
    NodesOut<TRepr>,
    true, false
> {

    private readonly transparentDefault: boolean
    protected _color: LedColor
    protected _transparent: boolean
    protected _name: ComponentName

    protected constructor(editor: LogicEditor, SubclassDef: InstantiatedComponentDef<TRepr, TValue>, transparentDefault: boolean, saved?: TRepr) {
        super(editor, SubclassDef, saved)
        this.transparentDefault = transparentDefault

        this._color = saved?.color ?? OutputBarDef.aults.color
        this._transparent = saved?.transparent ?? transparentDefault
        this._name = saved?.name ?? undefined
    }

    public override toJSONBase() {
        return {
            ...super.toJSONBase(),
            color: this._color === OutputBarDef.aults.color ? undefined : this._color,
            transparent: this._transparent === this.transparentDefault ? undefined : this._transparent,
            name: this._name,
        }
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

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
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
        } else {
            super.keyDown(e)
        }
    }

}



export const OutputBarDef =
    defineComponent("out", "bar", {
        button: { imgWidth: 32 },
        repr: {
            display: t.keyof(OutputBarTypes, "OutputBarType"),
            color: typeOrUndefined(t.keyof(LedColors, "LedColor")),
            transparent: typeOrUndefined(t.boolean),
            name: ComponentNameRepr,
        },
        valueDefaults: {
            display: "h" as OutputBarType,
            color: "green" as LedColor,
            transparent: true,
        },
        size: { gridWidth: 1, gridHeight: 1 }, // overridden
        makeNodes: () => ({
            ins: {
                I: [0, 0, "w"],
            },
        }),
        initialValue: () => false as LogicValue,
    })

type OutputBarRepr = Repr<typeof OutputBarDef>


export class OutputBar extends OutputBarBase<OutputBarRepr, LogicValue> {

    private _display: OutputBarType

    public constructor(editor: LogicEditor, saved?: OutputBarRepr) {
        super(editor, OutputBarDef, false, saved)

        this._display = this.doSetDisplay(saved?.display ?? OutputBarDef.aults.display)
    }

    public toJSON() {
        return {
            type: "bar" as const,
            ...super.toJSONBase(),
            display: this._display,
        }
    }

    public override get unrotatedWidth() {
        return this.getWidthAndHeight()[0]
    }

    public override get unrotatedHeight() {
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
        return this.inputs.I.value
    }

    protected override doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {
        const valueToShow = this.editor.options.hideOutputColors ? Unknown : this.value
        const background = this._transparent && valueToShow === false
            ? COLOR_TRANSPARENT
            : ledColorForLogicValue(valueToShow, this._color)

        this.doDrawDefault(g, ctx, {
            background,
            skipLabels: true,
            componentName: [this._name, true, toLogicValueRepr(valueToShow)],
        })
    }

    public getWidthAndHeight() {
        const w = 10
        const h = 2
        switch (this._display) {
            case "h":
                return [w * GRID_STEP, h * GRID_STEP] as const
            case "v":
                return [h * GRID_STEP, w * GRID_STEP] as const
            case "px":
                return [h * GRID_STEP, h * GRID_STEP] as const
            case "PX":
                return [w * GRID_STEP, w * GRID_STEP] as const
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
        return newDisplay // to make compiler happy for constructor
    }

    private updateInputOffsetX() {
        const width = this.getWidthAndHeight()[0]
        this.inputs.I.gridOffsetX = -pxToGrid(width / 2) - 2
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        const s = S.Components.OutputBar.contextMenu

        const makeItemShowAs = (desc: string, display: OutputBarType) => {
            const isCurrent = this._display === display
            const icon = isCurrent ? "check" : "none"
            const action = isCurrent ? () => undefined : () => this.doSetDisplay(display)
            return ContextMenuData.item(icon, desc, action)
        }

        return [
            ["mid", ContextMenuData.submenu("eye", s.Display, [
                makeItemShowAs(s.DisplayVerticalBar, "v"),
                makeItemShowAs(s.DisplayHorizontalBar, "h"),
                makeItemShowAs(s.DisplaySmallSquare, "px"),
                makeItemShowAs(s.DisplayLargeSquare, "PX"),
                ContextMenuData.sep(),
                ContextMenuData.text(s.DisplayChangeDesc),
            ])],
            ...super.makeComponentSpecificContextMenuItems(),
        ]
    }


}
OutputBarDef.impl = OutputBar
