import { displayValuesFromArray } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { S } from "../strings"
import { FixedArray, FixedArrayFillWith, LogicValue, Unknown, isUnknown } from "../utils"
import { ComponentBase, Repr, defineComponent, group, groupVertical } from "./Component"
import { DrawableParent, MenuItems } from "./Drawable"


export const DecoderBCD4Def =
    defineComponent("dec-bcd4", {
        idPrefix: "bcd",
        button: { imgWidth: 50 },
        valueDefaults: {},
        size: { gridWidth: 5, gridHeight: 10 },
        makeNodes: () => ({
            ins: {
                In: group("w", [
                    [-4, -3, "A"],
                    [-4, -1, "B"],
                    [-4, +1, "C"],
                    [-4, +3, "D"],
                ]),
            },
            outs: {
                Out: groupVertical("e", 4, 0, 5, 2),
            },
        }),
        initialValue: () => FixedArrayFillWith(false as LogicValue, 5),
    })

type DecoderBCD4Repr = Repr<typeof DecoderBCD4Def>

export class DecoderBCD4 extends ComponentBase<DecoderBCD4Repr> {

    public constructor(parent: DrawableParent, saved?: DecoderBCD4Repr) {
        super(parent, DecoderBCD4Def, saved)
    }

    public toJSON() {
        return this.toJSONBase()
    }

    public override makeTooltip() {
        return tooltipContent(undefined, mods(
            div(S.Components.DecoderBCD4.tooltip)
        ))
    }

    protected doRecalcValue(): FixedArray<LogicValue, 5> {
        const input = this.inputValues(this.inputs.In)
        const [__, value] = displayValuesFromArray(input, false)

        let output
        if (isUnknown(value)) {
            output = FixedArrayFillWith(Unknown, 5)
        } else {
            output = ((): FixedArray<LogicValue, 5> => {
                switch (value) {
                    case 0: return [false, false, false, false, false]
                    case 1: return [false, false, false, false, true]
                    case 2: return [false, false, false, true, false]
                    case 3: return [false, false, false, true, true]
                    case 4: return [false, false, true, false, false]
                    case 5: return [false, false, true, false, true]
                    case 6: return [false, false, true, true, false]
                    case 7: return [false, false, true, true, true]
                    case 8: return [false, true, false, false, false]
                    case 9: return [false, true, false, false, true]
                    case 10: return [true, false, false, false, false]
                    case 11: return [true, false, false, false, true]
                    case 12: return [true, false, false, true, false]
                    case 13: return [true, false, false, true, true]
                    case 14: return [true, false, true, false, false]
                    case 15: return [true, false, true, false, true]
                    default: return FixedArrayFillWith(Unknown, 5)
                }
            })()
        }

        return output
    }

    protected override propagateValue(newValue: LogicValue[]) {
        this.outputValues(this.outputs.Out, newValue, true)
    }

    protected override makeComponentSpecificContextMenuItems(): MenuItems {
        return this.makeForceOutputsContextMenuItem()
    }

}
DecoderBCD4Def.impl = DecoderBCD4
