import * as t from "io-ts"
import {  displayValuesFromArray } from "../drawutils"
import { ArrayFillWith, EdgeTrigger, LogicValue, Unknown, isUnknown, typeOrNull, typeOrUndefined } from "../utils"
import { ParametrizedVirtualComponentBase, Repr, ResolvedParams, defineParametrizedVirtualComponent, param, group } from "./VirtualComponent"
import { Flipflop, FlipflopOrLatch, makeTriggerItems } from "./FlipflopOrLatch"
import { VirtualCalculableParent } from "./VirtualCalculable";
import {groupVertical} from "./Component";


export const VirtualCounterNewDef =
    defineParametrizedVirtualComponent("counter", true, true, {
        variantName: ({ bits }) => `counter-${bits}`,
        idPrefix: "counter",
        repr: {
            bits: typeOrUndefined(t.number),
            count: typeOrUndefined(t.number),
            trigger: typeOrUndefined(t.keyof(EdgeTrigger)),
            displayRadix: typeOrUndefined(typeOrNull(t.number)), // undefined means default, null means no display
        },
        valueDefaults: {
            trigger: EdgeTrigger.rising,
            displayRadix: 10,
        },
        params: {
            bits: param(4, [2, 3, 4, 7, 8, 16]),
        },
        validateParams: ({ bits }) => ({
            numBits: bits,
        }),
        makeVirtualNodes: ({ numBits }) => {
            return {
                ins: {
                    Clock: ["Clk"],
                    Clr: ["Clr"],
                },
                outs: {
                    //Q: groupVirual(),
                    Q: ["Q"],
                    V: ["V"],
                },
            }
        },
        initialValue: (saved, { numBits }) => {
            if (saved === undefined || saved.count === undefined) {
                return VirtualCounterNew.emptyValue(numBits)
            }
            return [VirtualCounterNew.decimalToNBits(saved.count, numBits), false] as const
        },
    })

export type VirtualCounterNewRepr = Repr<typeof VirtualCounterNewDef>
export type VirtualCounterNewParams = ResolvedParams<typeof VirtualCounterNewDef>

export class VirtualCounterNew extends ParametrizedVirtualComponentBase<VirtualCounterNewRepr> {

    public static emptyValue(numBits: number) {
        return [ArrayFillWith<LogicValue>(false, numBits), false as LogicValue] as const
    }

    public static decimalToNBits(value: number, width: number): LogicValue[] {
        const binStr = value.toString(2).padStart(width, "0")
        const asBits = ArrayFillWith(false, width)
        for (let i = 0; i < width; i++) {
            asBits[i] = binStr[width - i - 1] === "1"
        }
        return asBits
    }

    public readonly numBits: number
    private _trigger: EdgeTrigger
    private _lastClock: LogicValue = Unknown
    private _displayRadix: number | undefined

    public constructor(parent: VirtualCalculableParent, params: VirtualCounterNewParams, saved?: VirtualCounterNewRepr) {
        super(parent, VirtualCounterNewDef.with(params), saved)

        this.numBits = params.numBits

        this._trigger = saved?.trigger ?? VirtualCounterNewDef.aults.trigger
        this._displayRadix = saved?.displayRadix === undefined ? VirtualCounterNewDef.aults.displayRadix
            : (saved.displayRadix === null ? undefined : saved.displayRadix) // convert null in the repr to undefined
    }

    public toJSON() {
        const [__, currentCountOrUnknown] = displayValuesFromArray(this.value[0], false)
        const currentCount = isUnknown(currentCountOrUnknown) ? 0 : currentCountOrUnknown
        const displayRadix = this._displayRadix === undefined ? null : this._displayRadix
        return {
            ...this.toJSONBase(),
            bits: this.numBits === VirtualCounterNewDef.aults.bits ? undefined : this.numBits,
            count: currentCount === 0 ? undefined : currentCount,
            trigger: (this._trigger !== VirtualCounterNewDef.aults.trigger) ? this._trigger : undefined,
            displayRadix: (displayRadix !== VirtualCounterNewDef.aults.displayRadix) ? displayRadix : undefined,
        }
    }

    public get trigger() {
        return this._trigger
    }

    protected doRecalcValue(): readonly [LogicValue[], LogicValue] {
        const clear = this.inputs.Clr.value
        if (clear === true) {
            return VirtualCounterNew.emptyValue(this.numBits)
        }

        const prevClock = this._lastClock
        const clock = this._lastClock = this.inputs.Clock.value
        const activeOverflowValue = this._trigger === EdgeTrigger.rising ? true : false

        if (Flipflop.isClockTrigger(this._trigger, prevClock, clock)) {
            const [__, value] = displayValuesFromArray(this.value[0], false)
            if (isUnknown(value)) {
                return [ArrayFillWith(Unknown, this.numBits), Unknown]
            }
            const newValue = value + 1
            if (newValue >= Math.pow(2, this.numBits)) {
                return [ArrayFillWith(false, this.numBits), activeOverflowValue]
            }

            return [VirtualCounterNew.decimalToNBits(newValue, this.numBits), !activeOverflowValue]

        } else {
            return [this.value[0], !activeOverflowValue]
        }
    }

    protected override propagateValue(newValue: readonly [LogicValue[], LogicValue]) {
        const [counter, overflow] = newValue
        //this.outputValues(this.outputs.Q, counter)
        this.outputs.V.value = overflow
    }

    protected doSetTrigger(trigger: EdgeTrigger) {
        this._trigger = trigger
        this.setNeedsRedraw("trigger changed")
    }

    private doSetDisplayRadix(displayRadix: number | undefined) {
        this._displayRadix = displayRadix
        this.setNeedsRedraw("display radix changed")
    }

}
VirtualCounterNewDef.impl = VirtualCounterNew
