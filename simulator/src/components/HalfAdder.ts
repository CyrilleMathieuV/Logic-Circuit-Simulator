import { COLOR_COMPONENT_BORDER } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { isHighImpedance, isUndefined, isUnknown, LogicValue, Unknown } from "../utils"
import { ComponentBase, defineComponent, Repr } from "./Component"
import { ContextMenuItem, ContextMenuItemPlacement, DrawContext } from "./Drawable"


export const HalfAdderDef =
    defineComponent("ic", "halfadder", {
        button: { imgWidth: 50 },
        valueDefaults: {},
        size: { gridWidth: 4, gridHeight: 6 },
        makeNodes: () => {
            const s = S.Components.Generic
            return {
                ins: {
                    A: [-4, -2, "w", "A", { hasTriangle: true }],
                    B: [-4, 2, "w", "B", { hasTriangle: true }],
                },
                outs: {
                    S: [4, -2, "e", s.OutputSumDesc, { hasTriangle: true }],
                    C: [4, 2, "e", s.OutputCarryDesc, { hasTriangle: true }],
                },
            }
        },
        initialValue: () => ({ s: false as LogicValue, c: false as LogicValue }),
    })

type HalfAdderRepr = Repr<typeof HalfAdderDef>

export class HalfAdder extends ComponentBase<HalfAdderRepr> {

    public constructor(editor: LogicEditor, saved?: HalfAdderRepr) {
        super(editor, HalfAdderDef, saved)
    }

    public toJSON() {
        return {
            type: "halfadder" as const,
            ...this.toJSONBase(),
        }
    }

    public override makeTooltip() {
        const s = S.Components.HalfAdder.tooltip
        return tooltipContent(s.title, mods(
            div(s.desc)
        ))
    }

    protected doRecalcValue() {
        const a = this.inputs.A.value
        const b = this.inputs.B.value

        if (isUnknown(a) || isUnknown(b) || isHighImpedance(a) || isHighImpedance(b)) {
            return { s: Unknown, c: Unknown }
        }

        const sum = (+a) + (+b)
        switch (sum) {
            case 0: return { s: false, c: false }
            case 1: return { s: true, c: false }
            case 2: return { s: false, c: true }
            default:
                console.log("ERROR: sum of halfadder is > 2")
                return { s: false, c: false }
        }
    }

    protected override propagateValue(newValue: { s: LogicValue, c: LogicValue }) {
        this.outputs.S.value = newValue.s
        this.outputs.C.value = newValue.c
    }

    protected override doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {
        this.doDrawDefault(g, ctx, () => {
            g.fillStyle = COLOR_COMPONENT_BORDER
            g.font = "26px sans-serif"
            g.textAlign = "center"
            g.textBaseline = "middle"
            g.fillText("+", this.posX, this.posY - 2)
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
HalfAdderDef.impl = HalfAdder
