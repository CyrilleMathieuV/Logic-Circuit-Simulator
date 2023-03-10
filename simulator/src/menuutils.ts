import { a, button, cls, dataClassId, dataComponent, dataType, div, emptyMod, raw, span, style, title, type } from "./htmlgen"
import { ImageName, makeImage } from "./images"
import { S, Strings } from "./strings"
import { isDefined, isString, isUndefined } from "./utils"

type ComponentKey = Strings["ComponentBar"]["Components"]["type"]


type ComponentItem = {
    type: string // TODO better types for this
    subtype: string | undefined // explicit undefined
    strings: ComponentKey
    img: ImageName
    width: number
    normallyHidden?: boolean
}

type SectionNameKey = keyof Strings["ComponentBar"]["SectionNames"]

type Section = {
    nameKey: SectionNameKey,
    items: Array<ComponentItem>
}

const componentsMenu: Array<Section> = [
    {
        nameKey: "InputOutput",
        items: [
            {
                type: "in", subtype: undefined,
                strings: "InputBit", img: "InputBit", width: 32,
            },
            {
                type: "out", subtype: undefined,
                strings: "OutputBit", img: "OutputBit", width: 32,
            },
            {
                type: "out", subtype: "bar",
                strings: "OutputBar", img: "OutputBar", width: 32,
                normallyHidden: true,
            },
            {
                type: "in", subtype: "clock",
                strings: "Clock", img: "Clock", width: 50,
            },
            {
                type: "in", subtype: "nibble",
                strings: "InputNibble", img: "InputNibble", width: 32,
            },
            {
                type: "out", subtype: "nibble",
                strings: "OutputNibble", img: "OutputNibble", width: 32,
            },
            {
                type: "out", subtype: "nibble-display",
                strings: "OutputNibbleDisplay", img: "OutputNibbleDisplay", width: 32,
            },
            {
                type: "in", subtype: "byte",
                strings: "InputByte", img: "InputByte", width: 32,
                normallyHidden: true,
            },
            {
                type: "out", subtype: "byte",
                strings: "OutputByte", img: "OutputByte", width: 32,
                normallyHidden: true,
            },
            {
                type: "out", subtype: "byte-display",
                strings: "OutputByteDisplay", img: "OutputByteDisplay", width: 32,
                normallyHidden: true,
            },
            {
                type: "out", subtype: "7seg",
                strings: "Output7Seg", img: "Output7Seg", width: 32,
                normallyHidden: true,
            },
            {
                type: "out", subtype: "16seg",
                strings: "Output16Seg", img: "Output16Seg", width: 32,
                normallyHidden: true,
            },
            {
                type: "out", subtype: "ascii",
                strings: "OutputAscii", img: "OutputAscii", width: 32,
                normallyHidden: true,
            },
            {
                type: "in", subtype: "random",
                strings: "InputRandom", img: "InputRandom", width: 32,
                normallyHidden: true,
            },
            {
                type: "out", subtype: "shiftbuffer",
                strings: "OutputShiftBuffer", img: "OutputShiftBuffer", width: 50,
                normallyHidden: true,
            },
        ],
    },

    {
        nameKey: "Gates",
        items: [
            {
                type: "gate", subtype: "NOT",
                strings: "NOT", img: "NOT", width: 50,
            },
            {
                type: "gate", subtype: "BUF",
                strings: "BUF", img: "BUF", width: 50,
                normallyHidden: true,
            },
            {
                type: "gate", subtype: "TRI",
                strings: "TRI", img: "TRI", width: 50,
                normallyHidden: true,
            },
            {
                type: "gate", subtype: "AND",
                strings: "AND", img: "AND", width: 50,
            },
            {
                type: "gate", subtype: "OR",
                strings: "OR", img: "OR", width: 50,
            },
            {
                type: "gate", subtype: "XOR",
                strings: "XOR", img: "XOR", width: 50,
            },
            {
                type: "gate", subtype: "NAND",
                strings: "NAND", img: "NAND", width: 50,
            },
            {
                type: "gate", subtype: "NOR",
                strings: "NOR", img: "NOR", width: 50,
            },

            {
                type: "gate", subtype: "XNOR",
                strings: "XNOR", img: "XNOR", width: 50,
                normallyHidden: true,
            },
            {
                type: "gate", subtype: "IMPLY",
                strings: "IMPLY", img: "IMPLY", width: 50,
                normallyHidden: true,
            },
            {
                type: "gate", subtype: "NIMPLY",
                strings: "NIMPLY", img: "NIMPLY", width: 50,
                normallyHidden: true,
            },
            {
                type: "gate", subtype: "TXA",
                strings: "TRANSFER", img: "TXA", width: 50,
                normallyHidden: true,
            },

            {
                type: "gate", subtype: "AND3",
                strings: "AND3", img: "AND3", width: 50,
                normallyHidden: true,
            },
            {
                type: "gate", subtype: "OR3",
                strings: "OR3", img: "OR3", width: 50,
                normallyHidden: true,
            },
            {
                type: "gate", subtype: "XOR3",
                strings: "XOR3", img: "XOR3", width: 50,
                normallyHidden: true,
            },
            {
                type: "gate", subtype: "NAND3",
                strings: "NAND3", img: "NAND3", width: 50,
                normallyHidden: true,
            },
            {
                type: "gate", subtype: "NOR3",
                strings: "NOR3", img: "NOR3", width: 50,
                normallyHidden: true,
            },
            {
                type: "gate", subtype: "XNOR3",
                strings: "XNOR3", img: "XNOR3", width: 50,
                normallyHidden: true,
            },

            {
                type: "gate", subtype: "AND4",
                strings: "AND4", img: "AND4", width: 50,
                normallyHidden: true,
            },
            {
                type: "gate", subtype: "OR4",
                strings: "OR4", img: "OR4", width: 50,
                normallyHidden: true,
            },
            {
                type: "gate", subtype: "XOR4",
                strings: "XOR4", img: "XOR4", width: 50,
                normallyHidden: true,
            },
            {
                type: "gate", subtype: "NAND4",
                strings: "NAND4", img: "NAND4", width: 50,
                normallyHidden: true,
            },
            {
                type: "gate", subtype: "NOR4",
                strings: "NOR4", img: "NOR4", width: 50,
                normallyHidden: true,
            },
            {
                type: "gate", subtype: "XNOR4",
                strings: "XNOR4", img: "XNOR4", width: 50,
                normallyHidden: true,
            },


            {
                type: "component", subtype: "switched-inverter",
                strings: "SwitchedInverter", img: "SwitchedInverter", width: 50,
                normallyHidden: true,
            },
            {
                type: "component", subtype: "quad-gate",
                strings: "QuadGate", img: "QuadGate", width: 50,
                normallyHidden: true,
            },
            {
                type: "component", subtype: "quad-tristate",
                strings: "QuadTriState", img: "QuadTriState", width: 50,
                normallyHidden: true,
            },


        ],
    },

    {
        nameKey: "Layout",
        items: [
            {
                type: "label", subtype: undefined,
                strings: "LabelString", img: "LabelString", width: 32,
            },
            {
                type: "label", subtype: "rect",
                strings: "LabelRectangle", img: "LabelRectangle", width: 32,
            },
            {
                type: "layout", subtype: "pass",
                strings: "Passthrough1", img: "Passthrough1", width: 32,
            },
            {
                type: "layout", subtype: "pass-4",
                strings: "Passthrough4", img: "Passthrough4", width: 32,
            },
            {
                type: "layout", subtype: "pass-8",
                strings: "Passthrough8", img: "Passthrough8", width: 32,
                normallyHidden: true,
            },
        ],
    },


    {
        nameKey: "Components",
        items: [
            {
                type: "component", subtype: "halfadder",
                strings: "HalfAdder", img: "HalfAdder", width: 50,
            },
            {
                type: "component", subtype: "adder",
                strings: "Adder", img: "Adder", width: 50,
            },
            {
                type: "component", subtype: "alu",
                strings: "ALU", img: "ALU", width: 50,
            },

            {
                type: "component", subtype: "mux-2to1",
                strings: "Mux2to1", img: "Mux", width: 50,
                normallyHidden: true,
            },
            {
                type: "component", subtype: "mux-4to1",
                strings: "Mux4to1", img: "Mux", width: 50,
                normallyHidden: true,
            },
            {
                type: "component", subtype: "mux-8to1",
                strings: "Mux8to1", img: "Mux", width: 50,
                normallyHidden: true,
            },
            {
                type: "component", subtype: "mux-4to2",
                strings: "Mux4to2", img: "Mux", width: 50,
                normallyHidden: true,
            },
            {
                type: "component", subtype: "mux-8to2",
                strings: "Mux8to2", img: "Mux", width: 50,
                normallyHidden: true,
            },
            {
                type: "component", subtype: "mux-8to4",
                strings: "Mux8to4", img: "Mux", width: 50,
                normallyHidden: true,
            },
            {
                type: "component", subtype: "mux-16to8",
                strings: "Mux16to8", img: "Mux", width: 50,
                normallyHidden: true,
            },

            {
                type: "component", subtype: "demux-1to2",
                strings: "Demux1to2", img: "Demux", width: 50,
                normallyHidden: true,
            },
            {
                type: "component", subtype: "demux-1to4",
                strings: "Demux1to4", img: "Demux", width: 50,
                normallyHidden: true,
            },
            {
                type: "component", subtype: "demux-1to8",
                strings: "Demux1to8", img: "Demux", width: 50,
                normallyHidden: true,
            },
            {
                type: "component", subtype: "demux-2to4",
                strings: "Demux2to4", img: "Demux", width: 50,
                normallyHidden: true,
            },
            {
                type: "component", subtype: "demux-2to8",
                strings: "Demux2to8", img: "Demux", width: 50,
                normallyHidden: true,
            },
            {
                type: "component", subtype: "demux-4to8",
                strings: "Demux4to8", img: "Demux", width: 50,
                normallyHidden: true,
            },
            {
                type: "component", subtype: "demux-8to16",
                strings: "Demux8to16", img: "Demux", width: 50,
                normallyHidden: true,
            },

            {
                type: "component", subtype: "latch-sr",
                strings: "LatchSR", img: "LatchSR", width: 50,
            },
            {
                type: "component", subtype: "flipflop-jk",
                strings: "FlipflopJK", img: "FlipflopJK", width: 50,
                normallyHidden: true,
            },
            {
                type: "component", subtype: "flipflop-t",
                strings: "FlipflopT", img: "FlipflopT", width: 50,
                normallyHidden: true,
            },
            {
                type: "component", subtype: "flipflop-d",
                strings: "FlipflopD", img: "FlipflopD", width: 50,
            },
            {
                type: "component", subtype: "register",
                strings: "Register", img: "Register", width: 50,
            },
            {
                type: "component", subtype: "ram-16x4",
                strings: "RAM16x4", img: "RAM16x4", width: 50,
            },
            {
                type: "component", subtype: "ram-16x8",
                strings: "RAM16x8", img: "RAM16x8", width: 50,
                normallyHidden: true,
            },
            {
                type: "component", subtype: "ram-64x8",
                strings: "RAM64x8", img: "RAM64x8", width: 50,
                normallyHidden: true,
            },
            {
                type: "component", subtype: "ram-32x12",
                strings: "RAM12", img: "RAM12", width: 50,
                normallyHidden: true,
            },
            {
                type: "component", subtype: "counter",
                strings: "Counter", img: "Counter", width: 50,
            },
            {
                type: "component", subtype: "decoder-7seg",
                strings: "Decoder7Seg", img: "Decoder7Seg", width: 50,
            },
            {
                type: "component", subtype: "decoder-16seg",
                strings: "Decoder16Seg", img: "Decoder16Seg", width: 50,
                normallyHidden: true,
            },
            {
                type: "component", subtype: "decoder-bcd4",
                strings: "DecoderBCD4", img: "DecoderBCD4", width: 50,
                normallyHidden: true,
            },
            {
                type: "component", subtype: "comparator",
                strings: "Comparator", img: "Comparator", width: 50,
                normallyHidden: true,
            },

        ],
    },
]


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
        const normallyHiddenButtons: HTMLButtonElement[] = []
        for (const item of section.items) {
            const normallyHidden = item.normallyHidden ?? false
            const hiddenNow = isDefined(showOnly) ? !shouldShow(item, showOnly) : normallyHidden

            let buttonStyle = ""
            if (hiddenNow) {
                buttonStyle += "max-height: 0; transition: all 0.25s ease-out; overflow: hidden; padding: 0; border: 0; margin-bottom: 0;"
            }
            const dataTypeOpt = isUndefined(item.subtype) ? emptyMod : dataType(item.subtype)
            const compStrings = S.ComponentBar.Components.propsOf(item.strings)
            const [titleStr, captionStr] = isString(compStrings) ? [compStrings, undefined] : compStrings
            const caption = isUndefined(captionStr) ? emptyMod : span(cls("gate-label"), captionStr)
            const classId = componentIdFor(item)
            const buttonTitle = title(isUndefined(titleStr) ? "" : (titleStr + " \n") + `(“${classId}”)`)
            const extraClasses = hiddenNow ? " sim-component-button-extra" : ""
            const compButton =
                button(type("button"), style(buttonStyle), cls(`list-group-item list-group-item-action sim-component-button${extraClasses}`),
                    dataComponent(item.type), dataTypeOpt,
                    dataClassId(classId),
                    makeImage(item.img, item.width),
                    caption, buttonTitle
                ).render()

            if (hiddenNow) {
                normallyHiddenButtons.push(compButton)
            }

            target.appendChild(compButton)
            numAdded++
        }

        const numHidden = normallyHiddenButtons.length
        const numVisible = numAdded - numHidden

        // link to show more if needed
        if (numHidden !== 0 && isUndefined(showOnly)) {
            let moreShown = false
            const names = [S.ComponentBar.Labels.More + " ↓", S.ComponentBar.Labels.Less + " ↑"]
            const linkShowMore = a(cls("leftToolbarMore"), names[0]).render()
            linkShowMore.addEventListener("click", () => {
                moreShown = !moreShown
                for (const button of normallyHiddenButtons) {
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

function shouldShow(item: ComponentItem, showOnly: string[]) {
    const componentId = componentIdFor(item)

    let visible = false
    if (showOnly.includes(componentId)) {
        visible = true
        const ind = showOnly.indexOf(componentId)
        showOnly.splice(ind, 1)
    }

    // console.log(`buttonId '${buttonId}' is visible: ${visible}`)

    return visible
}

function componentIdFor(item: ComponentItem): string {
    const compType = item.type
    const compSubtype = item.subtype

    let buttonId
    if (isUndefined(compSubtype)) {
        buttonId = compType
    } else {
        if (compType === "component" || compType === "gate") {
            buttonId = compSubtype
        } else if (compType === "in" && compSubtype === "clock") {
            buttonId = "clock"
        } else {
            buttonId = `${compType}.${compSubtype}`
        }
    }
    return buttonId.toLowerCase()
}

