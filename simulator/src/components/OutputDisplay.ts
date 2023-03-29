import * as t from "io-ts"
import { colorComps, colorForFraction, ColorString, COLOR_UNKNOWN, displayValuesFromArray, formatWithRadix, useCompact } from "../drawutils"
import { b, div, emptyMod, mods, tooltipContent } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { isUnknown, Mode, typeOrUndefined, Unknown } from "../utils"
import { ComponentName, ComponentNameRepr, defineParametrizedComponent, groupVertical, param, ParametrizedComponentBase, Repr, ResolvedParams } from "./Component"
import { ContextMenuData, DrawContext, MenuItems, Orientation } from "./Drawable"

export const OutputDisplayDef =
    defineParametrizedComponent("out", "display", true, false, {
        variantName: ({ bits }) => `display-${bits}`,
        button: { imgWidth: 32 },
        repr: {
            bits: typeOrUndefined(t.number),
            name: ComponentNameRepr,
            radix: typeOrUndefined(t.number),
            showAsUnknown: typeOrUndefined(t.boolean),
        },
        valueDefaults: {
            radix: 10,
            showAsUnknown: false,
        },
        params: {
            bits: param(4, [3, 4, 8, 16]),
        },
        validateParams: ({ bits }) => ({
            numBits: bits,
        }),
        size: ({ numBits }) => ({
            gridWidth: 2 + Math.ceil(numBits / 2),
            gridHeight: useCompact(numBits) ? numBits : 2 * numBits,
        }),
        makeNodes: ({ numBits, gridWidth }) => {
            const inX = -gridWidth / 2 - 1
            return {
                ins: {
                    In: groupVertical("w", inX, 0, numBits),
                },
            }
        },
        initialValue: (saved, { numBits }): [string, number | Unknown] =>
            [repeatString("0", numBits), 0],
    })


export type OutputDisplayRepr = Repr<typeof OutputDisplayDef>
export type OutputDisplayParams = ResolvedParams<typeof OutputDisplayDef>


export class OutputDisplay extends ParametrizedComponentBase<OutputDisplayRepr> {

    public readonly numBits: number
    private _name: ComponentName
    private _radix: number
    private _showAsUnknown: boolean

    public constructor(editor: LogicEditor, params: OutputDisplayParams, saved?: OutputDisplayRepr) {
        super(editor, OutputDisplayDef.with(params), saved)

        this.numBits = params.numBits

        this._name = saved?.name ?? undefined
        this._radix = saved?.radix ?? OutputDisplayDef.aults.radix
        this._showAsUnknown = saved?.showAsUnknown ?? OutputDisplayDef.aults.showAsUnknown
    }

    public toJSON() {
        return {
            type: "display" as const,
            bits: this.numBits === OutputDisplayDef.aults.bits ? undefined : this.numBits,
            ...this.toJSONBase(),
            name: this._name,
            radix: this._radix === OutputDisplayDef.aults.radix ? undefined : this._radix,
            showAsUnknown: this._showAsUnknown === OutputDisplayDef.aults.showAsUnknown ? undefined : this._showAsUnknown,
        }
    }

    private get showAsUnknown() {
        return this._showAsUnknown || this.editor.options.hideOutputColors
    }

    public override makeTooltip() {
        const s = S.Components.OutputDisplay.tooltip
        const radixStr = (() => {
            switch (this._radix) {
                case 2: return s.RadixBinary
                case 10: return s.RadixDecimal
                case -10: return s.RadixSignedDecimal
                case 16: return s.RadixHexadecimal
                default: return s.RadixGeneric.expand({ radix: this._radix })
            }
        })()
        const [binaryStringRep, value] = this.value

        const sParams = { numBits: this.numBits, radixStr }
        return tooltipContent(s.title.expand(sParams), mods(
            div(s.desc[0].expand(sParams) + " ", b(binaryStringRep), s.desc[1]),
            !isUnknown(value) || this.showAsUnknown
                ? emptyMod
                : div(s.CurrentlyUndefined)
        ))
    }

    protected doRecalcValue() {
        return displayValuesFromArray(this.inputValues(this.inputs.In), false)
    }

    protected override doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {
        const [binaryStringRep, value] = this.value
        const maxValue = (1 << this.inputs.In.length) - 1
        const background = isUnknown(value) || this.showAsUnknown ? COLOR_UNKNOWN : colorForFraction(value / maxValue)

        this.doDrawDefault(g, ctx, {
            background,
            skipLabels: true,
            name: [this._name, value, true],
            drawLabels: (ctx, { width, height }) => {
                const isVertical = Orientation.isVertical(this.orient)
                const backColorComps = colorComps(background)
                const textColor = ColorString(backColorComps[0] + backColorComps[1] + backColorComps[2] > 3 * 127 ? 0 : 0xFF)
                g.fillStyle = textColor

                g.textAlign = "center"

                if (!this.showAsUnknown) {
                    const [hasSpaces, spacedStringRep] = insertSpaces(binaryStringRep, this._radix)
                    g.font = `${hasSpaces ? 9 : 10}px sans-serif`
                    g.fillText(spacedStringRep, this.posX, this.posY + (isVertical ? -width / 2 + 7 : -height / 2 + 8))
                }

                const mainSize = this.numBits === 4 && this._radix === 8 ? 16 : 18
                g.font = `bold ${mainSize}px sans-serif`

                const stringRep = this.showAsUnknown ? Unknown
                    : formatWithRadix(value, this._radix, this.numBits)
                g.fillText(stringRep, this.posX, this.posY + (isVertical ? 6 : 0))
            },
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

    protected override makeComponentSpecificContextMenuItems(): MenuItems {

        const s = S.Components.OutputDisplay.contextMenu
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
            ["mid", makeItemShowRadix(8, s.DisplayAsOctal)],
            ["mid", makeItemShowRadix(16, s.DisplayAsHexadecimal)],
            ["mid", makeItemShowAs(s.DisplayAsUnknown, () => this.doSetShowAsUnknown(!this._showAsUnknown), this._showAsUnknown)],
            ["mid", ContextMenuData.sep()],
            this.makeChangeParamsContextMenuItem("inputs", S.Components.Generic.contextMenu.ParamNumBits, this.numBits, "bits"),
            ["mid", ContextMenuData.sep()],
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
OutputDisplayDef.impl = OutputDisplay

function repeatString(s: string, n: number) {
    let result = ""
    for (let i = 0; i < n; i++) {
        result += s
    }
    return result
}

function insertSpaces(binaryStringRep: string, radix: number): [boolean, string] {
    let n = -1
    if (radix === 16) {
        n = 4
    } else if (radix === 8) {
        n = 3
    }
    if (n < 0) {
        return [false, binaryStringRep]
    }
    const re = new RegExp(`(.{${n}})`, "g")
    const spaced = reverseString(reverseString(binaryStringRep).replace(re, "$1 "))
    return [true, spaced]
}

function reverseString(str: string) {
    return str.split("").reverse().join("")
}