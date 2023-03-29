import { Branded } from "io-ts"
import { ButtonDataset } from "./ComponentFactory"
import { AdderDef } from "./components/Adder"
import { AdderArrayDef } from "./components/AdderArray"
import { ALUDef } from "./components/ALU"
import { ClockDef } from "./components/Clock"
import { ComparatorDef } from "./components/Comparator"
import { ComponentCategory, ParamDef, ParametrizedComponentDef, ParamsFromDefs } from "./components/Component"
import { CounterDef } from "./components/Counter"
import { Decoder16SegDef } from "./components/Decoder16Seg"
import { Decoder7SegDef } from "./components/Decoder7Seg"
import { DecoderBCD4Def } from "./components/DecoderBCD4"
import { DemuxDef } from "./components/Demux"
import { FlipflopDDef } from "./components/FlipflopD"
import { FlipflopJKDef } from "./components/FlipflopJK"
import { FlipflopTDef } from "./components/FlipflopT"
import { Gate1Def, GateNDef } from "./components/Gate"
import { GateArrayDef } from "./components/GateArray"
import { HalfAdderDef } from "./components/HalfAdder"
import { InputDef } from "./components/Input"
import { InputRandomDef } from "./components/InputRandom"
import { LabelRectDef } from "./components/LabelRect"
import { LabelStringDef } from "./components/LabelString"
import { LatchSRDef } from "./components/LatchSR"
import { MuxDef } from "./components/Mux"
import { OutputDef } from "./components/Output"
import { Output16SegDef } from "./components/Output16Seg"
import { Output7SegDef } from "./components/Output7Seg"
import { OutputAsciiDef } from "./components/OutputAscii"
import { OutputBarDef } from "./components/OutputBar"
import { OutputDisplayDef } from "./components/OutputDisplay"
import { OutputShiftBufferDef } from "./components/OutputShiftBuffer"
import { PassthroughDef } from "./components/Passthrough"
import { RAMDef } from "./components/RAM"
import { RegisterDef } from "./components/Register"
import { ShiftRegisterDef } from "./components/ShiftRegister"
import { SwitchedInverterDef } from "./components/SwitchedInverter"
import { TriStateBufferDef } from "./components/TriStateBuffer"
import { TriStateBufferArrayDef } from "./components/TriStateBufferArray"
import { a, button, cls, div, emptyMod, raw, span, style, title, type } from "./htmlgen"
import { ImageName, makeImage } from "./images"
import { S, Strings } from "./strings"
import { deepObjectEquals, isDefined, isString, isUndefined } from "./utils"

export type ComponentKey = Strings["ComponentBar"]["Components"]["type"]

export type DefAndParams<
    TParamDefs extends Record<string, ParamDef<unknown>>,
    TParams extends ParamsFromDefs<TParamDefs>
> = {
    def: ParametrizedComponentDef<any, any, any, any, any, any, any, any, TParams>,
    params: TParams
}

export type LibraryItemVisibility = "always" | "withButton" | "ifShowOnly"
const withButton = "withButton"
const ifShowOnly = "ifShowOnly"

export type LibraryItem = {
    category: ComponentCategory
    type?: string
    params?: Branded<DefAndParams<any, any>, "params">
    visual: ComponentKey & ImageName | [ComponentKey, ImageName]
    compat?: string // for compatibility with old URL params
    width: number
    visible?: LibraryItemVisibility
}

export type LibraryButtonProps = { imgWidth: number }
export type LibraryButtonOptions = { compat?: string, visible?: LibraryItemVisibility }

type SectionNameKey = keyof Strings["ComponentBar"]["SectionNames"]

type Section = {
    nameKey: SectionNameKey,
    items: Array<LibraryItem>
}

const componentsMenu: Array<Section> = [{
    nameKey: "InputOutput",
    items: [
        InputDef.button({ bits: 1 }, "Input1"),
        OutputDef.button({ bits: 1 }, "Output1"),
        OutputBarDef.button("OutputBar", { visible: withButton }),
        ClockDef.button("Clock"),

        InputDef.button({ bits: 4 }, ["InputN", "Input4"], { compat: "in.nibble" }),
        OutputDef.button({ bits: 4 }, ["OutputN", "Output4"], { compat: "out.nibble" }),
        OutputDisplayDef.button({ bits: 4 }, ["OutputDisplayN", "OutputDisplay4"], { compat: "out.nibble-display" }),

        InputDef.button({ bits: 8 }, "Input8", { compat: "in.byte", visible: ifShowOnly }),
        OutputDef.button({ bits: 8 }, "Output8", { compat: "out.byte", visible: ifShowOnly }),
        OutputDisplayDef.button({ bits: 8 }, "OutputDisplay8", { compat: "out.byte-display", visible: ifShowOnly }),

        Output7SegDef.button("Output7Seg", { visible: withButton }),
        Output16SegDef.button("Output16Seg", { visible: withButton }),
        OutputAsciiDef.button("OutputAscii", { visible: withButton }),

        InputRandomDef.button({ bits: 1 }, "InputRandom", { visible: withButton }),
        OutputShiftBufferDef.button("OutputShiftBuffer", { visible: withButton }),
    ],
}, {
    nameKey: "Gates",
    items: [
        Gate1Def.button({ type: "NOT" }, "NOT"),
        Gate1Def.button({ type: "BUF" }, "BUF", { visible: withButton }),
        TriStateBufferDef.button("TRI", { visible: withButton }),

        GateNDef.button({ type: "AND", bits: 2 }, "AND"),
        GateNDef.button({ type: "OR", bits: 2 }, "OR"),
        GateNDef.button({ type: "XOR", bits: 2 }, "XOR"),
        GateNDef.button({ type: "NAND", bits: 2 }, "NAND"),
        GateNDef.button({ type: "NOR", bits: 2 }, "NOR"),

        GateNDef.button({ type: "XNOR", bits: 2 }, "XNOR", { visible: withButton }),
        GateNDef.button({ type: "IMPLY", bits: 2 }, "IMPLY", { visible: withButton }),
        GateNDef.button({ type: "NIMPLY", bits: 2 }, "NIMPLY", { visible: withButton }),
        GateNDef.button({ type: "TXA", bits: 2 }, ["TRANSFER", "TXA"], { visible: withButton }),

        GateNDef.button({ type: "AND", bits: 3 }, "AND3", { compat: "AND3", visible: ifShowOnly }),
        GateNDef.button({ type: "OR", bits: 3 }, "OR3", { compat: "OR3", visible: ifShowOnly }),
        GateNDef.button({ type: "XOR", bits: 3 }, "XOR3", { compat: "XOR3", visible: ifShowOnly }),
        GateNDef.button({ type: "NAND", bits: 3 }, "NAND3", { compat: "NAND3", visible: ifShowOnly }),
        GateNDef.button({ type: "NOR", bits: 3 }, "NOR3", { compat: "NOR3", visible: ifShowOnly }),
        GateNDef.button({ type: "XNOR", bits: 3 }, "XNOR3", { compat: "XNOR3", visible: ifShowOnly }),

        GateNDef.button({ type: "AND", bits: 4 }, "AND4", { compat: "AND4", visible: ifShowOnly }),
        GateNDef.button({ type: "OR", bits: 4 }, "OR4", { compat: "OR4", visible: ifShowOnly }),
        GateNDef.button({ type: "XOR", bits: 4 }, "XOR4", { compat: "XOR4", visible: ifShowOnly }),
        GateNDef.button({ type: "NAND", bits: 4 }, "NAND4", { compat: "NAND4", visible: ifShowOnly }),
        GateNDef.button({ type: "NOR", bits: 4 }, "NOR4", { compat: "NOR4", visible: ifShowOnly }),
        GateNDef.button({ type: "XNOR", bits: 4 }, "XNOR4", { compat: "XNOR4", visible: ifShowOnly }),

        SwitchedInverterDef.button({ bits: 4 }, "SwitchedInverter", { visible: withButton }),
        GateArrayDef.button({ bits: 4 }, "GateArray", { visible: withButton }),
        TriStateBufferArrayDef.button({ bits: 4 }, "TriStateBufferArray", { visible: withButton }),

    ],
}, {
    nameKey: "Layout",
    items: [
        LabelStringDef.button("LabelString"),
        LabelRectDef.button("LabelRectangle"),

        PassthroughDef.button({ bits: 1 }, "Passthrough1"),
        PassthroughDef.button({ bits: 4 }, "PassthroughN"),
    ],
}, {
    nameKey: "Components",
    items: [
        HalfAdderDef.button("HalfAdder"),
        AdderDef.button("Adder"),
        ComparatorDef.button("Comparator", { visible: withButton }),

        AdderArrayDef.button({ bits: 4 }, "AdderArray"),
        ALUDef.button({ bits: 4 }, "ALU"),

        MuxDef.button({ from: 4, to: 2 }, "Mux"),
        DemuxDef.button({ from: 2, to: 4 }, "Demux"),

        LatchSRDef.button("LatchSR"),
        FlipflopJKDef.button("FlipflopJK", { visible: withButton }),
        FlipflopTDef.button("FlipflopT", { visible: withButton }),
        FlipflopDDef.button("FlipflopD"),

        RegisterDef.button({ bits: 4 }, "Register"),
        ShiftRegisterDef.button({ bits: 4 }, "ShiftRegister"),
        CounterDef.button({ bits: 4 }, "Counter"),

        RAMDef.button({ lines: 16, bits: 4 }, "RAM"),

        Decoder7SegDef.button("Decoder7Seg"),
        Decoder16SegDef.button("Decoder16Seg", { visible: withButton }),
        DecoderBCD4Def.button("DecoderBCD4", { visible: withButton }),

    ],
}]


export function makeComponentMenuInto(target: HTMLElement, _showOnly: string[] | undefined) {

    let showOnly: string[] | undefined = undefined
    if (isDefined(_showOnly)) {
        showOnly = [..._showOnly]
    }

    // console.log("makeComponentMenuInto; showOnly", showOnly)

    let lastSectionNonEmpty = false

    for (const section of componentsMenu) {

        // separator from previous section
        let separator: HTMLElement | undefined = undefined
        const lastSectionNonEmptyPrev: boolean = lastSectionNonEmpty

        if (lastSectionNonEmpty) {
            separator =
                div(style("height: 20px"),
                    raw("&nbsp;")
                ).render()

            target.appendChild(separator)
        }

        // section header
        const header =
            div(cls("leftToolbarHeader"),
                S.ComponentBar.SectionNames[section.nameKey]
            ).render()
        target.appendChild(header)

        // section content
        let numAdded = 0
        const showWithMoreButton: HTMLButtonElement[] = []
        const showOnlyWithURLParam: HTMLButtonElement[] = []
        for (const item of section.items) {
            const normallyHidden = isDefined(item.visible) && item.visible !== "always"
            const hiddenNow = isDefined(showOnly) ? !shouldShow(item, showOnly) : normallyHidden

            const buttonStyle = !hiddenNow ? "" : "max-height: 0; transition: all 0.25s ease-out; overflow: hidden; padding: 0; border: 0; margin-bottom: 0;"
            const visual = item.visual
            const [stringsKey, img] = isString(visual) ? [visual, visual] : visual
            const compStrings = S.ComponentBar.Components.props[stringsKey]
            const [titleStr, captionStr] = isString(compStrings) ? [compStrings, undefined] : compStrings
            const caption = isUndefined(captionStr) ? emptyMod : span(cls("gate-label"), captionStr)
            const classIds = componentIdsFor(item)
            const buttonTitle = title(isUndefined(titleStr) ? "" : (titleStr + " \n") + `(“${classIds[0]}”)`)
            const extraClasses = hiddenNow ? " sim-component-button-extra" : ""
            const params = item.params?.params
            const compButton =
                button(type("button"), style(buttonStyle), cls(`list-group-item list-group-item-action sim-component-button${extraClasses}`),
                    makeImage(img, item.width),
                    caption, buttonTitle
                ).render()

            const compDataset = compButton.dataset as ButtonDataset
            compDataset.category = item.category
            if (isDefined(item.type)) {
                compDataset.type = item.type
            }
            compDataset.componentId = classIds[0]
            if (isDefined(params)) {
                compDataset.params = JSON.stringify(params)
            }

            if (hiddenNow) {
                const targetArray = item.visible === "withButton" ? showWithMoreButton : showOnlyWithURLParam
                targetArray.push(compButton)
            }

            target.appendChild(compButton)
            numAdded++
        }

        const numShowWithMoreButton = showWithMoreButton.length
        const numVisible = numAdded - numShowWithMoreButton - showOnlyWithURLParam.length

        // link to show more if needed
        if (numShowWithMoreButton !== 0 && isUndefined(showOnly)) {
            let moreShown = false
            const names = [S.ComponentBar.Labels.More + " ↓", S.ComponentBar.Labels.Less + " ↑"]
            const linkShowMore = a(cls("leftToolbarMore"), names[0]).render()
            linkShowMore.addEventListener("click", () => {
                moreShown = !moreShown
                for (const button of showWithMoreButton) {
                    if (moreShown) {
                        button.style.removeProperty("padding")
                        button.style.removeProperty("border")
                        button.style.removeProperty("margin-bottom")
                        button.style.removeProperty("max-height")
                        button.style.removeProperty("overflow")
                    } else {
                        button.style.padding = "0"
                        button.style.border = "0"
                        button.style.marginBottom = "0"
                        button.style.maxHeight = "0"
                        button.style.overflow = "hidden"
                    }
                }
                linkShowMore.innerHTML = names[Number(moreShown)]
            })
            target.appendChild(linkShowMore)
        }

        if (numVisible === 0) {
            if (isDefined(separator)) {
                separator.remove()
            }
            header.remove()

            // as we removed our sep, keep nonempty value for next section from previous one
            lastSectionNonEmpty = lastSectionNonEmptyPrev
        } else {
            // if we're visible, we're nonempty
            lastSectionNonEmpty = true
        }

    }

    if (isDefined(showOnly) && showOnly.length > 0) {
        console.log(`ERROR Supposed to show unknown elems: ${showOnly.join("; ")}`)
    }
}

function shouldShow(item: LibraryItem, showOnly: string[]) {
    const componentIds = componentIdsFor(item)

    let visible = false
    for (const componentId of componentIds) {
        if (showOnly.includes(componentId)) {
            visible = true
            const ind = showOnly.indexOf(componentId)
            showOnly.splice(ind, 1)
            break
        }
    }

    // console.log(`buttonId '${buttonId}' is visible: ${visible}`)

    return visible
}

function componentIdsFor(item: LibraryItem): string[] {
    const defAndParams = item.params
    if (isDefined(defAndParams)) {
        const ids: string[] = []
        const { def, params } = defAndParams
        if (deepObjectEquals(params, def.defaultParams)) {
            const genericId = def.type ?? def.category
            ids.push(genericId)
        }
        const specificId = def.variantName(params)
        ids.push(specificId)
        if (isDefined(item.compat)) {
            ids.push(item.compat.toLowerCase())
        }
        if (ids.length !== 0) {
            return ids
        }
    }

    const category = item.category
    const type = item.type
    let buttonId
    if (isUndefined(type)) {
        buttonId = category
    } else {
        if (category === "ic" || category === "gate") {
            buttonId = type
        } else if (category === "in" && type === "clock") {
            buttonId = "clock"
        } else {
            buttonId = `${category}.${type}`
        }
    }
    return [buttonId.toLowerCase()]
}

