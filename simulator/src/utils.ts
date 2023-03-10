export type Dict<T> = Record<string, T | undefined>
export type TimeoutHandle = NodeJS.Timeout

// Better types for an Object.keys() replacement
export function keysOf<K extends keyof any>(d: Record<K, any>): K[]
// eslint-disable-next-line @typescript-eslint/ban-types
export function keysOf<K extends {}>(o: K): (keyof K)[]
export function keysOf(o: any) {
    return Object.keys(o)
}

// Allows nice definitions of enums with associated data
export class RichStringEnum<K extends keyof any, P> {

    public static withProps<P0>() {
        return function <K0 extends keyof any>(defs: Record<K0, P0>) {
            return new RichStringEnum<K0, P0>(defs)
        }
    }

    private _values: Array<K>

    private constructor(private props: Record<K, P>) {
        this._values = keysOf(props)
        for (let i = 0; i < this._values.length; i++) {
            this[i] = this._values[i]
        }
    }

    public get type(): K {
        throw new Error()
    }

    public get values(): Array<K> {
        return this._values
    }

    public get length(): number {
        return this._values.length
    }

    public get definitions(): Array<[K, P]> {
        const defs: Array<[K, P]> = []
        for (const i of this._values) {
            defs.push([i, this.props[i]])
        }
        return defs
    }

    public isValue(val: string | number | symbol | null | undefined): val is K {
        return this.values.includes(val as any)
    }

    public indexOf(val: K): number {
        return this.values.indexOf(val)
    }

    public propsOf(key: K): P {
        return this.props[key]
    }

    [i: number]: K

    public *[Symbol.iterator]() {
        for (const i of this._values) {
            yield i
        }
    }

}

// returns the passed parameter typed as a tuple
export function tuple<T extends readonly any[]>(...items: [...T]): [...T] {
    return items
}

// Utility types to force the evaluation of computed types
// See: https://stackoverflow.com/a/57683652/390581

// expands object types one level deep
export type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never

// expands object types recursively
export type ExpandRecursively<T> = T extends Record<string, unknown>
    ? T extends infer O ? { [K in keyof O]: ExpandRecursively<O[K]> } : never
    : T


export type OptionalKeysOf<T> = { [P in keyof T]-?: undefined extends T[P] ? P : never }[keyof T]
export type RequiredKeysOf<T> = Exclude<keyof T, OptionalKeysOf<T>>

export type KeysOfByType<T, U> = { [P in keyof T]: T[P] extends U ? P : never }[keyof T]

export type FilterProperties<T, U> = {
    [P in KeysOfByType<T, U>]: T[P]
}

export type PartialWhereUndefinedRecursively<T> = ExpandRecursively<_PartialWhereUndefinedRecursively<T>>

type _PartialWhereUndefinedRecursively<T> =
    // is it an object?
    T extends Record<string, unknown>
    ? T extends infer O ? {
        [P in RequiredKeysOf<O>]: _PartialWhereUndefinedRecursively<O[P]>
    } & {
        [P in OptionalKeysOf<O>]?: _PartialWhereUndefinedRecursively<O[P]>
    }
    : never // "closing the infer block"

    // is it an array?
    : T extends ReadonlyArray<infer E>
    ? Array<_PartialWhereUndefinedRecursively<E>>

    // other types
    : T

// uses for statically typing the number of component inputs
export type Plus<A extends number, B extends number> =
    B extends 1 ? Plus1<A> :
    B extends 2 ? Plus2<A> :
    B extends 3 ? Plus3<A> :
    never

export type Plus1<N extends number> =
    N extends 0 ? 1 :
    N extends 1 ? 2 :
    N extends 2 ? 3 :
    N extends 3 ? 4 :
    N extends 4 ? 5 :
    N extends 5 ? 6 :
    N extends 6 ? 7 :
    N extends 7 ? 8 :
    N extends 8 ? 9 :
    N extends 9 ? 10 :
    N extends 10 ? 11 :
    N extends 11 ? 12 :
    N extends 12 ? 13 :
    N extends 13 ? 14 :
    N extends 14 ? 15 :
    N extends 15 ? 16 :
    N extends 16 ? 17 :
    N extends 17 ? 18 :
    N extends 18 ? 19 :
    N extends 19 ? 20 :
    N extends 20 ? 21 :
    never

export type Plus2<N extends number> =
    N extends 0 ? 2 :
    N extends 1 ? 3 :
    N extends 2 ? 4 :
    N extends 3 ? 5 :
    N extends 4 ? 6 :
    N extends 5 ? 7 :
    N extends 6 ? 8 :
    N extends 7 ? 9 :
    N extends 8 ? 10 :
    N extends 9 ? 11 :
    N extends 10 ? 12 :
    N extends 11 ? 13 :
    N extends 12 ? 14 :
    N extends 13 ? 15 :
    N extends 14 ? 16 :
    N extends 15 ? 17 :
    N extends 16 ? 18 :
    N extends 17 ? 19 :
    N extends 18 ? 20 :
    N extends 19 ? 21 :
    N extends 20 ? 22 :
    never

export type Plus3<N extends number> =
    N extends 0 ? 3 :
    N extends 1 ? 4 :
    N extends 2 ? 5 :
    N extends 3 ? 6 :
    N extends 4 ? 7 :
    N extends 5 ? 8 :
    N extends 6 ? 9 :
    N extends 7 ? 10 :
    N extends 8 ? 11 :
    N extends 9 ? 12 :
    N extends 10 ? 13 :
    N extends 11 ? 14 :
    N extends 12 ? 15 :
    N extends 13 ? 16 :
    N extends 14 ? 17 :
    N extends 15 ? 18 :
    N extends 16 ? 19 :
    N extends 17 ? 20 :
    N extends 18 ? 21 :
    N extends 19 ? 22 :
    N extends 20 ? 23 :
    never


// Series of type-assertion functions

export function isUndefined(v: unknown): v is undefined {
    return typeof v === "undefined"
}

export function isDefined<T>(v: T | undefined): v is T {
    return typeof v !== "undefined"
}

export function isNullOrUndefined(v: unknown): v is null | undefined {
    return isUndefined(v) || v === null
}

export function isNull<T>(v: T | null): v is null {
    return v === null
}

export function isNotNull<T>(v: T | null): v is T {
    return v !== null
}

export function isString(v: unknown): v is string {
    return typeof v === "string"
}

export function isArray(arg: unknown): arg is ReadonlyArray<any> {
    return Array.isArray(arg)
}

export function isEmpty(container: { length: number } | { size: number }): boolean {
    return ("length" in container ? container.length : container.size) === 0
}

export function nonEmpty(container: { length: number } | { size: number }): boolean {
    return !isEmpty(container)
}

export function isNumber(arg: unknown): arg is number {
    return typeof arg === "number"
}

export function isBoolean(arg: unknown): arg is boolean {
    return typeof arg === "boolean"
}

import * as t from "io-ts"

// Fixed-size arrays up to 8 to model inputs statically

export type FixedArraySize = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30 | 31
export type FixedArraySizeNonZero = Exclude<FixedArraySize, 0>
export type FixedArraySizeSeveral = Exclude<FixedArraySizeNonZero, 1>

export type FixedArray<T, N extends FixedArraySize> =
    N extends 0 ? []
    : N extends 1 ? [T]
    : N extends 2 ? [T, T]
    : N extends 3 ? [T, T, T]
    : N extends 4 ? [T, T, T, T]
    : N extends 5 ? [T, T, T, T, T]
    : N extends 6 ? [T, T, T, T, T, T]
    : N extends 7 ? [T, T, T, T, T, T, T]
    : N extends 8 ? [T, T, T, T, T, T, T, T]
    : N extends 9 ? [T, T, T, T, T, T, T, T, T]
    : N extends 10 ? [T, T, T, T, T, T, T, T, T, T]
    : N extends 11 ? [T, T, T, T, T, T, T, T, T, T, T]
    : N extends 12 ? [T, T, T, T, T, T, T, T, T, T, T, T]
    : N extends 13 ? [T, T, T, T, T, T, T, T, T, T, T, T, T]
    : N extends 14 ? [T, T, T, T, T, T, T, T, T, T, T, T, T, T]
    : N extends 15 ? [T, T, T, T, T, T, T, T, T, T, T, T, T, T, T]
    : N extends 16 ? [T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T]
    : N extends 17 ? [T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T]
    : N extends 18 ? [T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T]
    : N extends 19 ? [T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T]
    : N extends 20 ? [T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T]
    : N extends 21 ? [T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T]
    : N extends 22 ? [T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T]
    : N extends 23 ? [T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T]
    : N extends 24 ? [T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T]
    : N extends 25 ? [T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T]
    : N extends 26 ? [T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T]
    : N extends 27 ? [T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T]
    : N extends 28 ? [T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T]
    : N extends 29 ? [T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T]
    : N extends 30 ? [T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T]
    : N extends 31 ? [T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T]
    :/*N >= 32 12*/ Array<T>

export type FixedReadonlyArray<T, N extends FixedArraySize> =
    N extends 0 ? readonly []
    : N extends 1 ? readonly [T]
    : N extends 2 ? readonly [T, T]
    : N extends 3 ? readonly [T, T, T]
    : N extends 4 ? readonly [T, T, T, T]
    : N extends 5 ? readonly [T, T, T, T, T]
    : N extends 6 ? readonly [T, T, T, T, T, T]
    : N extends 7 ? readonly [T, T, T, T, T, T, T]
    : N extends 8 ? readonly [T, T, T, T, T, T, T, T]
    : N extends 9 ? readonly [T, T, T, T, T, T, T, T, T]
    : N extends 10 ? readonly [T, T, T, T, T, T, T, T, T, T]
    : N extends 11 ? readonly [T, T, T, T, T, T, T, T, T, T, T]
    : N extends 12 ? readonly [T, T, T, T, T, T, T, T, T, T, T, T]
    : N extends 13 ? readonly [T, T, T, T, T, T, T, T, T, T, T, T, T]
    : N extends 14 ? readonly [T, T, T, T, T, T, T, T, T, T, T, T, T, T]
    : N extends 15 ? readonly [T, T, T, T, T, T, T, T, T, T, T, T, T, T, T]
    : N extends 16 ? readonly [T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T]
    : N extends 17 ? readonly [T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T]
    : N extends 18 ? readonly [T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T]
    : N extends 19 ? readonly [T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T]
    : N extends 20 ? readonly [T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T]
    : N extends 21 ? readonly [T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T]
    : N extends 22 ? readonly [T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T]
    : N extends 23 ? readonly [T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T]
    : N extends 24 ? readonly [T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T]
    : N extends 25 ? readonly [T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T]
    : N extends 26 ? readonly [T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T]
    : N extends 27 ? readonly [T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T]
    : N extends 28 ? readonly [T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T]
    : N extends 29 ? readonly [T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T]
    : N extends 30 ? readonly [T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T]
    : N extends 31 ? readonly [T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T, T]
    :/*N >= 32 12*/ ReadonlyArray<T>

// type HashSize1 = { readonly HasSize1: unique symbol }
// type H<N extends number, T> = { [K in `HasSize${N}`]: T }
interface HasSizeNBrand<__ extends number> {
    readonly HasSizeN: unique symbol // TODO check unique per N
}

export const FixedArray = <T extends t.Mixed, N extends FixedArraySize>(tpe: T, n: N) =>
    t.brand(
        t.array(tpe, `array of size ${n}`),
        (arr): arr is t.Branded<[t.TypeOf<T>], HasSizeNBrand<N>> => arr.length === n,
        "HasSizeN"
    )

export function FixedArrayFill<T, N extends FixedArraySize>(val: T, n: N): FixedArray<T, N> {
    return Array(n).fill(val) as FixedArray<T, N>
}
export function FixedArrayFillFactory<T, N extends FixedArraySize>(val: (i: number) => T, n: N): FixedArray<T, N> {
    const arr = Array(n)
    for (let i = 0; i < n; i++) {
        arr[i] = val(i)
    }
    return arr as FixedArray<T, N>
}

// This seemingly identity function allows to convert back from a fixed-size tuple
// to a regular array. It is a safe type cast, in a way, and allows to see the
// regular array methods as well as to use the for-of iteration on these tuples
export function asArray<T, N extends FixedArraySize>(tuple: FixedArray<T, N>): ReadonlyArray<T> {
    return tuple
}

export function isTruthyString(str: string | null | undefined): boolean {
    return !isNullOrUndefined(str) && (str === "1" || str.toLowerCase() === "true")
}

export function isFalsyString(str: string | null | undefined): boolean {
    return !isNullOrUndefined(str) && (str === "0" || str.toLowerCase() === "false")
}

export function getURLParameter<T>(sParam: string, defaultValue: T): string | T
export function getURLParameter(sParam: string, defaultValue?: undefined): string | undefined
export function getURLParameter(sParam: string, defaultValue: any) {
    const sPageURL = window.location.search.substring(1)
    const sURLVariables = sPageURL.split('&')
    for (let i = 0; i < sURLVariables.length; i++) {
        const sParameterName = sURLVariables[i].split('=')
        if (sParameterName[0] === sParam) {
            return sParameterName[1]
        }
    }
    return defaultValue
}

export function isEmbeddedInIframe(): boolean {
    try {
        return window.self !== window.top
    } catch (e) {
        return true
    }
}

export function setVisible(elem: HTMLElement, visible: boolean) {
    if (visible) {
        const prevDisplay = elem.getAttribute("data-prev-display")
        if (prevDisplay === null) {
            if (elem.style.display === "none") {
                elem.style.removeProperty("display")
            } else {
                // not hidden
            }
        } else {
            elem.removeAttribute("data-prev-display")
            elem.style.display = prevDisplay
        }
    } else {
        const currentDisplay = elem.style.display
        if (currentDisplay.length !== 0 && currentDisplay !== "none") {
            elem.setAttribute("data-prev-display", currentDisplay)
        }
        elem.style.display = "none"
    }
}

export function showModal(dlog: HTMLDialogElement): boolean {
    if (typeof (dlog as any).showModal === "function") {
        dlog.style.display = "initial";
        (dlog as any).showModal()
        const listener = () => {
            dlog.style.display = "none"
            dlog.removeEventListener("close", listener)
        }
        dlog.addEventListener("close", listener)
        return true
    }
    return false
}


// More general-purpose utility functions

export function any(bools: boolean[]): boolean {
    for (const b of bools) {
        if (b) {
            return true
        }
    }
    return false
}

export function repeatString(c: string, n: number) {
    return Array(n + 1).join(c)
}

export function formatString(str: string, ...varargs: any[]) {
    if (varargs.length) {
        const t = typeof varargs[0]
        const args = ("string" === t || "number" === t) ?
            Array.prototype.slice.call(varargs)
            : varargs[0]

        for (const key in args) {
            str = str.replace(new RegExp("\\{" + key + "\\}", "gi"), args[key])
        }
    }
    return str
}


export function deepEquals(v1: any, v2: any) {
    if (Array.isArray(v1) && Array.isArray(v2)) {
        if (v1.length !== v2.length) {
            return false
        }
        for (let i = 0; i < v1.length; i++) {
            if (v1[i] !== v2[i]) {
                return false
            }
        }
        return true
    } else {
        return v1 === v2
    }
}



// io-ts utils

export function forceTypeOf<U, V, W>(tpe: t.Type<U, V, W>) {
    return {
        toMoreSpecific: function <UU extends U>() {
            return tpe as unknown as t.Type<UU, V, W>
        },
    }
}

export const typeOrUndefined = <T extends t.Mixed>(tpe: T) => {
    return t.union([tpe, t.undefined], tpe.name + " | undefined")
}

export const typeOrNull = <T extends t.Mixed>(tpe: T) => {
    return t.union([tpe, t.null], tpe.name + " | null")
}


// Unset; LogicValue

export const HighImpedance = "Z" as const
export type HighImpedance = typeof HighImpedance
export function isHighImpedance<T>(v: T | HighImpedance): v is HighImpedance {
    return v === HighImpedance
}

export const Unknown = "?" as const
export type Unknown = typeof Unknown
export function isUnknown<T>(v: T | Unknown): v is Unknown {
    return v === Unknown
}
export const TUnknown = new t.Type<Unknown>(
    "Unknown",
    isUnknown,
    (input, context) => isUnknown(input) ? t.success(input) : t.failure(input, context),
    t.identity,
)

export type LogicValue = boolean | HighImpedance | Unknown
export const LogicValue = {
    invert(v: LogicValue): LogicValue {
        return isUnknown(v) || isHighImpedance(v) ? v : !v
    },
}

export type LogicValueRepr = 0 | 1 | HighImpedance | Unknown
export const LogicValueRepr = new t.Type<LogicValueRepr>(
    "0|1|?|Z",
    (v: unknown): v is LogicValueRepr => isUnknown(v) || isHighImpedance(v) || v === 1 || v === 0,
    (input, context) =>
        isUnknown(input) ? t.success(input) :
            isHighImpedance(input) ? t.success(input) :
                input === 1 ? t.success(1) :
                    input === 0 ? t.success(0) :
                        t.failure(input, context),
    t.identity,
)

// TODO put this in TriState object
export function toLogicValueRepr(v: LogicValue): LogicValueRepr
export function toLogicValueRepr(v: LogicValue | undefined): LogicValueRepr | undefined
export function toLogicValueRepr(v: LogicValue | undefined): LogicValueRepr | undefined {
    switch (v) {
        case true: return 1
        case false: return 0
        case Unknown: return Unknown
        case HighImpedance: return HighImpedance
        case undefined: return undefined
    }
}

export function toLogicValue(v: LogicValueRepr): LogicValue
export function toLogicValue(v: LogicValueRepr | undefined): LogicValue | undefined
export function toLogicValue(v: LogicValueRepr | undefined): LogicValue | undefined {
    switch (v) {
        case 1: return true
        case 0: return false
        case Unknown: return Unknown
        case HighImpedance: return HighImpedance
        case undefined: return undefined
    }
}

export function toLogicValueFromChar(char: string): LogicValue {
    switch (char) {
        case "1": return true
        case "0": return false
        case Unknown: return Unknown
        case HighImpedance: return HighImpedance
        default: return Unknown
    }
}

// Enums or RichEnums used in several files

export enum Mode {
    STATIC,  // cannot interact in any way
    TRYOUT,  // can change inputs on predefined circuit
    CONNECT, // can additionnally move preexisting components around and connect them
    DESIGN,  // can additionally add components from left menu
    FULL,    // can additionally force output nodes to 'unset' state and draw undetermined dates
}

export function copyToClipboard(textToCopy: string): boolean {
    function isOS() {
        //can use a better detection logic here
        return navigator.userAgent.match(/ipad|iphone/i)
    }

    const textArea = document.createElement('textarea')
    textArea.readOnly = true
    textArea.contentEditable = "true"
    textArea.value = textToCopy
    document.body.appendChild(textArea)

    if (isOS()) {
        const range = document.createRange()
        range.selectNodeContents(textArea)
        const selection = window.getSelection()
        if (isNotNull(selection)) {
            selection.removeAllRanges()
            selection.addRange(range)
            textArea.setSelectionRange(0, 999999)
        }
    } else {
        textArea.select()
    }

    const ok = document.execCommand('copy')
    document.body.removeChild(textArea)
    return ok
}

export function downloadBlob(dataUrl: string, filename: string) {
    const link = document.createElement('a')
    link.download = filename
    link.href = dataUrl
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
}

export function targetIsFieldOrOtherInput(e: Event) {
    const targets = e.composedPath()
    let elem, tagName
    return targets.length !== 0 && (elem = targets[0]) instanceof HTMLElement && ((tagName = elem.tagName) === "INPUT" || tagName === "SELECT")
}

export const fetchJSONP = ((unique: number) => (url: string) =>
    new Promise<string>(resolve => {
        const script = document.createElement('script')
        const name = `_jsonp_${unique++}`

        if (url.match(/\?/)) {
            url += `&callback=${name}`
        } else {
            url += `?callback=${name}`
        }

        script.src = url;
        (window as any)[name] = (json: any) => {
            script.remove()
            delete (window as any)[name]
            resolve(JSON.stringify(json))
        }

        document.body.appendChild(script)
    })
)(0)
