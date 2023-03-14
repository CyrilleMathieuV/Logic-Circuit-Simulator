import * as t from "io-ts"
import { LogicEditor } from "../LogicEditor"
import { COLOR_COMPONENT_BORDER, COLOR_MOUSE_OVER, COLOR_UNKNOWN, ColorString, GRID_STEP, colorComps, colorForFraction, displayValuesFromArray, drawComponentName, drawWireLineToComponent, formatWithRadix } from "../drawutils"
import { b, div, emptyMod, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { Mode, Unknown, isDefined, isNotNull, isUnknown, typeOrUndefined } from "../utils"
import { ComponentBase, ComponentName, ComponentNameRepr, Repr, defineComponent } from "./Component"
import { ContextMenuData, ContextMenuItem, ContextMenuItemPlacement, DrawContext, Orientation } from "./Drawable"

const GRID_WIDTH = 4
const GRID_HEIGHT = 8
const DEFAULT_RADIX = 10

export const OutputNibbleDisplayDef =
    defineComponent(true, false, t.type({
        type: t.literal("nibble-display"),
        name: ComponentNameRepr,
        radix: typeOrUndefined(t.number),
        showAsUnknown: typeOrUndefined(t.boolean),
    }, "OutputNibbleDisplay"))

type OutputNibbleDisplayRepr = Repr<typeof OutputNibbleDisplayDef>

export class OutputNibbleDisplay extends ComponentBase<OutputNibbleDisplayRepr, [string, number | Unknown]> {

    private _name: ComponentName = undefined
    private _radix = DEFAULT_RADIX
    private _showAsUnknown = false

    public constructor(editor: LogicEditor, savedData: OutputNibbleDisplayRepr | null) {
        super(editor, ["0000", 0], savedData, {
            ins: [
                ["I0", -3, -3, "w", "I"],
                ["I1", -3, -1, "w", "I"],
                ["I2", -3, +1, "w", "I"],
                ["I3", -3, +3, "w", "I"],
            ],
        })
        if (isNotNull(savedData)) {
            this._name = savedData.name
            this._radix = savedData.radix ?? DEFAULT_RADIX
            this._showAsUnknown = savedData.showAsUnknown ?? false
        }
    }

    public toJSON() {
        return {
            type: "nibble-display" as const,
            ...this.toJSONBase(),
            name: this._name,
            radix: this._radix === DEFAULT_RADIX ? undefined : this._radix,
            showAsUnknown: (this._showAsUnknown) ? true : undefined,
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

    private get showAsUnknown() {
        return this._showAsUnknown || this.editor.options.hideOutputColors
    }

    public override makeTooltip() {
        const ss = S.Components.OutputDisplayShared.tooltip
        const s = S.Components.OutputNibbleDisplay.tooltip
        const radixStr = (() => {
            switch (this._radix) {
                case 2: return ss.RadixBinary
                case 10: return ss.RadixDecimal
                case -10: return ss.RadixSignedDecimal
                case 16: return ss.RadixHexadecimal
                default: return ss.RadixGeneric.expand({ radix: this._radix })
            }
        })()
        const [binaryStringRep, value] = this.value

        return tooltipContent(s.title, mods(
            div(s.desc[0].expand({ radixStr }) + " ", b(binaryStringRep), s.desc[1]),
            !isUnknown(value) || this.showAsUnknown
                ? emptyMod
                : div(ss.CurrentlyUndefined)
        ))
    }


    protected doRecalcValue() {
        return displayValuesFromArray(this.inputs.map(i => i.value), false)
    }

    protected doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {

        const [binaryStringRep, value] = this.value

        const maxValue = (1 << this.inputs.length) - 1
        const backColor = isUnknown(value) || this.showAsUnknown ? COLOR_UNKNOWN : colorForFraction(value / maxValue)
        g.fillStyle = backColor
        g.strokeStyle = ctx.isMouseOver ? COLOR_MOUSE_OVER : COLOR_COMPONENT_BORDER
        g.lineWidth = 4

        const width = GRID_WIDTH * GRID_STEP
        const height = GRID_HEIGHT * GRID_STEP
        g.beginPath()
        g.rect(this.posX - width / 2, this.posY - height / 2, width, height)
        g.fill()
        g.stroke()

        for (const input of this.inputs) {
            drawWireLineToComponent(g, input, this.posX - width / 2 - 2, input.posYInParentTransform)
        }

        ctx.inNonTransformedFrame(ctx => {
            if (isDefined(this._name)) {
                drawComponentName(g, ctx, this._name, value, this, true)
            }

            const isVertical = Orientation.isVertical(this.orient)

            const backColorComps = colorComps(backColor)
            const textColor = ColorString(backColorComps[0] + backColorComps[1] + backColorComps[2] > 3 * 127 ? 0 : 0xFF)
            g.fillStyle = textColor

            g.textAlign = "center"

            if (!this.showAsUnknown) {
                g.font = "10px sans-serif"
                g.fillText(binaryStringRep, this.posX, this.posY + (isVertical ? -width / 2 + 7 : -height / 2 + 8))
            }

            g.font = "bold 18px sans-serif"

            let stringRep: string
            if (this.showAsUnknown) {
                stringRep = "?"
                // if (!isUnset(value)) {
                //     // otherwise we get the same color for background and text
                //     g.fillStyle = COLOR_UNSET
                // }
            } else {
                stringRep = formatWithRadix(value, this._radix, 4)
            }
            g.fillText(stringRep, this.posX, this.posY + (isVertical ? 6 : 0))
        })
    }

    public override mouseDoubleClicked(e: MouseEvent | TouchEvent) {
        if (super.mouseDoubleClicked(e)) {
            return true // already handled
        }
        const mode = this.editor.mode
        if (mode >= Mode.FULL && e.altKey) {
            this.doSetShowAsUnknown(!this._showAsUnknown)
            return true
        } else if (mode >= Mode.DESIGN) {
            this.doSetRadix(this._radix === 10 ? 16 : 10)
            return true
        }
        return false
    }

    private doSetName(name: ComponentName) {
        this._name = name
        this.setNeedsRedraw("name changed")
    }

    private doSetShowAsUnknown(showAsUnknown: boolean) {
        this._showAsUnknown = showAsUnknown
        this.setNeedsRedraw("display as unknown changed")
    }

    private doSetRadix(radix: number) {
        this._radix = radix
        this.setNeedsRedraw("radix changed")
    }

    protected override makeComponentSpecificContextMenuItems(): undefined | [ContextMenuItemPlacement, ContextMenuItem][] {

        const s = S.Components.OutputDisplayShared.contextMenu
        const makeItemShowAs = (desc: string, handler: () => void, isCurrent: boolean,) => {
            const icon = isCurrent ? "check" : "none"
            const caption = s.DisplayAs + " " + desc
            const action = isCurrent ? () => undefined : handler
            return ContextMenuData.item(icon, caption, action)
        }

        const makeItemShowRadix = (radix: number, desc: string) => {
            return makeItemShowAs(desc, () => {
                if (this._showAsUnknown) {
                    this.doSetShowAsUnknown(false)
                }
                this.doSetRadix(radix)
            }, !this._showAsUnknown && this._radix === radix)
        }

        return [
            ["mid", makeItemShowRadix(10, s.DisplayAsDecimal)],
            ["mid", makeItemShowRadix(-10, s.DisplayAsSignedDecimal)],
            ["mid", makeItemShowRadix(16, s.DisplayAsHexadecimal)],
            ["mid", makeItemShowAs(s.DisplayAsUnknown, () => this.doSetShowAsUnknown(!this._showAsUnknown), this._showAsUnknown)],
            ["mid", ContextMenuData.sep()],
            ["mid", this.makeSetNameContextMenuItem(this._name, this.doSetName.bind(this))],
        ]
    }


    public override keyDown(e: KeyboardEvent): void {
        if (e.key === "Enter") {
            this.runSetNameDialog(this._name, this.doSetName.bind(this))
        }
    }

}
