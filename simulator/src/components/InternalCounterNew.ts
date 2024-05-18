import * as t from "io-ts"
import {  displayValuesFromArray } from "../drawutils"
import { ArrayFillWith, EdgeTrigger, LogicValue, Unknown, isUnknown, typeOrNull, typeOrUndefined } from "../utils"
import { ParametrizedInternalComponentBase, Repr, ResolvedParams, defineParametrizedInternalComponent, param, group } from "./InternalComponent"
import { Flipflop, FlipflopOrLatch, makeTriggerItems } from "./FlipflopOrLatch"
import { InternalCalculableParent } from "./InternalCalculable";
import {groupVertical} from "./Component";


export const InternalCounterNewDef =
    defineParametrizedInternalComponent("counter", true, true, {
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
        makeInternalNodes: ({ numBits }) => {
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
                return InternalCounterNew.emptyValue(numBits)
            }
            return [InternalCounterNew.decimalToNBits(saved.count, numBits), false] as const
        },
    })

export type InternalCounterNewRepr = Repr<typeof InternalCounterNewDef>
export type InternalCounterNewParams = ResolvedParams<typeof InternalCounterNewDef>

export class InternalCounterNew extends ParametrizedInternalComponentBase<InternalCounterNewRepr> {

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

    public constructor(parent: InternalCalculableParent, params: InternalCounterNewParams, saved?: InternalCounterNewRepr) {
        super(parent, InternalCounterNewDef.with(params), saved)

        this.numBits = params.numBits

        this._trigger = saved?.trigger ?? InternalCounterNewDef.aults.trigger
        this._displayRadix = saved?.displayRadix === undefined ? InternalCounterNewDef.aults.displayRadix
            : (saved.displayRadix === null ? undefined : saved.displayRadix) // convert null in the repr to undefined
    }

    public toJSON() {
        const [__, currentCountOrUnknown] = displayValuesFromArray(this.value[0], false)
        const currentCount = isUnknown(currentCountOrUnknown) ? 0 : currentCountOrUnknown
        const displayRadix = this._displayRadix === undefined ? null : this._displayRadix
        return {
            ...this.toJSONBase(),
            bits: this.numBits === InternalCounterNewDef.aults.bits ? undefined : this.numBits,
            count: currentCount === 0 ? undefined : currentCount,
            trigger: (this._trigger !== InternalCounterNewDef.aults.trigger) ? this._trigger : undefined,
            displayRadix: (displayRadix !== InternalCounterNewDef.aults.displayRadix) ? displayRadix : undefined,
        }
    }

    public get trigger() {
        return this._trigger
    }

    protected doRecalcValue(): readonly [LogicValue[], LogicValue] {
        const clear = this.inputs.Clr.value
        if (clear === true) {
            return InternalCounterNew.emptyValue(this.numBits)
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

            return [InternalCounterNew.decimalToNBits(newValue, this.numBits), !activeOverflowValue]

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
InternalCounterNewDef.impl = InternalCounterNew
