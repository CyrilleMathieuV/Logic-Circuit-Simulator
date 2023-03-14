import * as t from "io-ts"
import { COLOR_BACKGROUND, COLOR_COMPONENT_BORDER, COLOR_COMPONENT_INNER_LABELS, COLOR_MOUSE_OVER, displayValuesFromArray, drawLabel, drawWireLineToComponent, GRID_STEP } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { ArrayFillWith, isUndefined, isUnknown, LogicValue, Unknown } from "../utils"
import { ComponentBase, defineComponent, Repr } from "./Component"
import { ContextMenuItem, ContextMenuItemPlacement, DrawContext } from "./Drawable"

export const Decoder16SegDef =
    defineComponent(true, true, t.type({
        type: t.literal("decoder-16seg"),
    }, "Decoder16Seg"))

const INPUT = {
    I: [0, 1, 2, 3, 4, 5, 6] as const,
}

// const enum OUTPUT {
//     a1, a2, b, c, d2, d1, e, f, g1, g2, h, i, j, k, l, m, p
// }

const GRID_WIDTH = 4
const GRID_HEIGHT = 10

type Decoder16SegRepr = Repr<typeof Decoder16SegDef>

export class Decoder16Seg extends ComponentBase<Decoder16SegRepr, LogicValue[]> {

    public constructor(editor: LogicEditor, savedData: Decoder16SegRepr | null) {
        super(editor, ArrayFillWith(false, 17), savedData, {
            ins: [
                ["I0", -3, -3, "w", "In"],
                ["I1", -3, -2, "w", "In"],
                ["I2", -3, -1, "w", "In"],
                ["I3", -3, 0, "w", "In"],
                ["I4", -3, +1, "w", "In"],
                ["I5", -3, +2, "w", "In"],
                ["I6", -3, +3, "w", "In"],
            ],
            outs: [
                ["a1", +4, -4, "e", "Out"],
                ["a2", +3, -3.5, "e", "Out"],
                ["b", +4, -3, "e", "Out"],
                ["c", +3, -2.5, "e", "Out"],
                ["d2", +4, -2, "e", "Out"],
                ["d1", +3, -1.5, "e", "Out"],
                ["e", +4, -1, "e", "Out"],
                ["f", +3, -0.5, "e", "Out"],
                ["g1", +4, 0, "e", "Out"],
                ["g2", +3, 0.5, "e", "Out"],
                ["h", +4, +1, "e", "Out"],
                ["i", +3, +1.5, "e", "Out"],
                ["j", +4, +2, "e", "Out"],
                ["k", +3, +2.5, "e", "Out"],
                ["l", +4, +3, "e", "Out"],
                ["m", +3, +3.5, "e", "Out"],
                ["p", +4, +4, "e", "Out"],
            ],
        })
    }

    public toJSON() {
        return {
            type: "decoder-16seg" as const,
            ...this.toJSONBase(),
        }
    }

    public get componentType() {
        return "ic" as const
    }

    public get unrotatedWidth() {
        return GRID_WIDTH * GRID_STEP
    }

    public get unrotatedHeight() {
        return GRID_HEIGHT * GRID_STEP
    }

    public override makeTooltip() {
        return tooltipContent(undefined, mods(
            div(S.Components.Decoder16Seg.tooltip) // TODO better tooltip
        ))
    }

    protected doRecalcValue(): LogicValue[] {
        const input = this.inputValues(INPUT.I)
        const [__, value] = displayValuesFromArray(input, false)

        let output
        if (isUnknown(value)) {
            output = ArrayFillWith(Unknown, 17)
        } else if (value < 32) {
            // control chars
            output = ArrayFillWith(false, 17)
        } else {
            const line = DECODER_MAPPING[value - 32]
            output = ArrayFillWith(false, 17)
            for (let i = 0; i < line.length; i++) {
                output[i] = line.charAt(i) === "1"
            }
        }

        return output
    }

    protected override propagateValue(newValue: LogicValue[]) {
        for (let i = 0; i < 17; i++) {
            this.outputs[i].value = newValue[i]
        }
    }

    protected doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {

        g.fillStyle = COLOR_BACKGROUND
        g.strokeStyle = ctx.isMouseOver ? COLOR_MOUSE_OVER : COLOR_COMPONENT_BORDER
        g.lineWidth = 4

        const width = GRID_WIDTH * GRID_STEP
        const height = GRID_HEIGHT * GRID_STEP
        const left = this.posX - width / 2
        const right = left + width

        g.beginPath()
        g.rect(this.posX - width / 2, this.posY - height / 2, width, height)
        g.fill()
        g.stroke()

        for (const input of this.inputs) {
            drawWireLineToComponent(g, input, left - 2, input.posYInParentTransform)
        }

        for (const output of this.outputs) {
            drawWireLineToComponent(g, output, right + 2, output.posYInParentTransform)
        }

        ctx.inNonTransformedFrame(ctx => {
            g.fillStyle = COLOR_COMPONENT_INNER_LABELS
            g.font = "bold 12px sans-serif"

            drawLabel(ctx, this.orient, "C", "w", left, this.posY, this.inputs[0])

            g.font = "7px sans-serif"
            this.outputs.forEach(output => {
                drawLabel(ctx, this.orient, output.name, "e", right, output)
            })

        })
    }

    protected override makeComponentSpecificContextMenuItems(): undefined | [ContextMenuItemPlacement, ContextMenuItem][] {
        const forceOutputItem = this.makeForceOutputsContextMenuItem()
        if (isUndefined(forceOutputItem)) {
            return []
        }
        return [
            ["mid", forceOutputItem],
        ]
    }


}

// Taken and modified from https://github.com/dmadison/LED-Segment-ASCII
const DECODER_MAPPING = [
    "00000000000000000", /* (space) */
    "00110000000000001", /* ! */
    "00100000000100000", /* " */
    "00111100110100100", /* # */
    "11011101110100100", /* $ */
    "10011001110111100", /* % */
    "10001110101100010", /* & */
    "00000000000100000", /* ' */
    "00000000000010010", /* ( */
    "00000000001001000", /* ) */
    "00000000111111110", /* * */
    "00000000110100100", /* + */
    "00000000000001000", /* , */
    "00000000110000000", /* - */
    "00000000000000001", /* . */
    "00000000000011000", /* / */
    "11111111000011000", /* 0 */
    "00110000000010000", /* 1 */
    "11101110110000000", /* 2 */
    "11111100010000000", /* 3 */
    "00110001110000000", /* 4 */
    "11001101100000010", /* 5 */
    "11011111110000000", /* 6 */
    "11110000000000000", /* 7 */
    "11111111110000000", /* 8 */
    "11111101110000000", /* 9 */
    "00000000000100100", /* : */
    "00000000000101000", /* ; */
    "00000000100010010", /* < */
    "00001100110000000", /* = */
    "00000000011001000", /* > */
    "11100000010000101", /* ? */
    "11101111010100000", /* @ */
    "11110011110000000", /* A */
    "11111100010100100", /* B */
    "11001111000000000", /* C */
    "11111100000100100", /* D */
    "11001111100000000", /* E */
    "11000011100000000", /* F */
    "11011111010000000", /* G */
    "00110011110000000", /* H */
    "11001100000100100", /* I */
    "00111110000000000", /* J */
    "00000011100010010", /* K */
    "00001111000000000", /* L */
    "00110011001010000", /* M */
    "00110011001000010", /* N */
    "11111111000000000", /* O */
    "11100011110000000", /* P */
    "11111111000000010", /* Q */
    "11100011110000010", /* R */
    "11011101110000000", /* S */
    "11000000000100100", /* T */
    "00111111000000000", /* U */
    "00000011000011000", /* V */
    "00110011000001010", /* W */
    "00000000001011010", /* X */
    "00111101110000000", /* Y */
    "11001100000011000", /* Z */
    "01001000000100100", /* [ */
    "00000000001000010", /* \ */
    "10000100000100100", /* ] */
    "00000000000001010", /* ^ */
    "00001100000000000", /* _ */
    "00000000001000000", /* ` */
    "00001110100000100", /* a */
    "00000111100000100", /* b */
    "00000110100000000", /* c */
    "00000110100100100", /* d */
    "00000110100001000", /* e */
    "10000011100000000", /* f */
    "10000101100100100", /* g */
    "00000011100000100", /* h */
    "00000000000000100", /* i */
    "00000100000100100", /* j */
    "00000000000110110", /* k */
    "00000000000100100", /* l */
    "00010010110000100", /* m */
    "00000010100000100", /* n */
    "00000110100000100", /* o */
    "10000011100100000", /* p */
    "10000001100100100", /* q */
    "00000010100000000", /* r */
    "10000101100000100", /* s */
    "00000111100000000", /* t */
    "00000110000000100", /* u */
    "00000010000001000", /* v */
    "00010010000001010", /* w */
    "00000000001011010", /* x */
    "00000101100100100", /* y */
    "00000100100001000", /* z */
    "01001000100100100", /* { */
    "00000000000100100", /* | */
    "10000100010100100", /* } */
    "00000000110011000", /* ~ */
    "00000000000000000", /* (del) */
]