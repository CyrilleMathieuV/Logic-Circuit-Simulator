import { COLOR_COMPONENT_BORDER } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { isHighImpedance, isUnknown, LogicValue, Unknown } from "../utils"
import { defineParametrizedComponent, Repr, ResolvedParams } from "./Component"
import { RegisterBase, RegisterBaseDef } from "./Register"

export const ShiftRegisterDef =
    defineParametrizedComponent("out", "shift-register", true, true, {
        variantName: ({ bits }) => `shift-register-${bits}`,
        ...RegisterBaseDef,
        makeNodes: (params, defaults) => {
            const base = RegisterBaseDef.makeNodes(params, defaults)
            const lrYOffset = base.ins.Clock[1] - 2
            return {
                ins: {
                    ...base.ins,
                    D: [-5, 0, "w"],
                    L̅R: [-5, lrYOffset, "w"],
                },
                outs: base.outs,
            }
        },
    })

export type ShiftRegisterRepr = Repr<typeof ShiftRegisterDef>
export type ShiftRegisterParams = ResolvedParams<typeof ShiftRegisterDef>

export class ShiftRegister extends RegisterBase<ShiftRegisterRepr> {

    public constructor(editor: LogicEditor, params: ShiftRegisterParams, saved?: ShiftRegisterRepr) {
        super(editor, ShiftRegisterDef, params, saved)
    }

    public toJSON() {
        return {
            type: "shift-register" as const,
            ...this.toJSONBase(),
        }
    }

    public override makeTooltip() {
        const s = S.Components.ShiftRegister.tooltip

        // TODO add explanation of shift register direction
        return tooltipContent(s.title, mods(
            div(s.desc.expand({ numBits: this.numBits })) // TODO more info egenrically from register
        ))
    }

    public makeStateAfterClock(): LogicValue[] {
        const dirIsRight = this.inputs.L̅R.value
        if (isUnknown(dirIsRight) || isHighImpedance(dirIsRight)) {
            return this.makeStateFromMainValue(Unknown)
        }
        const d = this.inputs.D.value
        const current = this.value
        const next = dirIsRight ? [...current.slice(1), d] : [d, ...current.slice(0, -1)]
        return next
    }

    protected override doDrawGenericCaption(g: CanvasRenderingContext2D) {
        g.font = `bold 13px sans-serif`
        g.fillStyle = COLOR_COMPONENT_BORDER
        g.textAlign = "center"
        g.textBaseline = "middle"
        g.fillText("Shift R.", this.posX, this.posY - 8)
        g.font = `11px sans-serif`
        g.fillText(`${this.numBits} bits`, this.posX, this.posY + 10)
    }

}
ShiftRegisterDef.impl = ShiftRegister