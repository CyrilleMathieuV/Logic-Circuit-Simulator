import { LogicEditor, MouseAction } from "./LogicEditor"
import {
    allBooleans,
    binaryStringRepr,
    hexStringRepr,
    InteractionResult,
    isAllZeros, LogicValue,
    setActive,
    TimeoutHandle,
} from "./utils"
import { Instance as PopperInstance } from "@popperjs/core/lib/types"
import { EditorSelection, UIEventManager } from "./UIEventManager"
import { CPUBase, CPUOpCode, CPUOpCodes } from "./components/CPU"
import { IconName, inlineIconSvgFor } from "./images"
import {
    button,
    cls,
    emptyMod,
    i,
    Modifier,
    raw,
    span,
    title,
    li,
    div,
    ol,
    select,
    option,
    label,
    value,
    style,
    draggable,
    id,
    applyModifiersTo,
    input,
    applyModifierTo,
    selected,
    start,
    disabled,
    hidden,
    maxlength,
    canvas,
    selectedIndex,
    attrBuilder,
} from "./htmlgen"
import { ROM } from "./components/ROM";
import { RAM } from "./components/RAM";
import { Component } from "./components/Component";

// sources
// https://web.dev/drag-and-drop/
// https://coder-coder.com/display-divs-side-by-side/
// https://www.encodedna.com/javascript/how-to-get-all-li-elements-in-ul-using-javascript.htm
// https://www.tutorialspoint.com/why-addeventlistener-to-select-element-does-not-work-in-javascript
// https://stackoverflow.com/questions/4590311/set-option-selected-attribute-from-dynamic-created-option
// https://stackoverflow.com/questions/71975669/change-input-field-value-stores-in-local-storage-using-javascript
// https://stackoverflow.com/questions/26946235/pure-javascript-listen-to-input-value-change
// https://koenwoortman.com/javascript-remove-li-elements-from-ul/
// https://code-boxx.com/drag-drop-sortable-list-javascript/
// https://www.codingnepalweb.com/drag-and-drop-sortable-list-html-javascript/
// https://stackoverflow.com/questions/9939760/how-do-i-convert-an-integer-to-binary-in-javascript
// https://stackoverflow.com/questions/3955229/remove-all-child-elements-of-a-dom-node-in-javascript
// https://stackoverflow.com/questions/8801787/get-index-of-clicked-element-using-pure-javascript
// https://developer.mozilla.org/fr/docs/Web/API/Node/insertBefore
// https://css-tricks.com/snippets/css/complete-guide-grid/#aa-grid-properties
// https://www.freecodecamp.org/news/insert-into-javascript-array-at-specific-index/
// https://unicorntears.dev/posts/queryselectorall-vs-getelementsbyclassname/#:~:text=querySelectorAll()%20retrieves%20a%20list,live%20HTML%20collection%20of%20elements.


type HtmlSection = {
    control: HTMLDivElement
    header: HTMLDivElement
    program: HTMLDivElement
}

type Instruction = {
    label: string
    opCode: number
    operand: number
}

const goToDownOpCode = ["GDW", "JIZ", "JIC"] as string[]
const goToUpOpCode = ["GUP"] as string[]
let goToOpCode = goToDownOpCode.concat(goToUpOpCode)
const noOperandOpCode = ["NOP", "DEC", "HLT"] as string[]

export class AssemblerEditor {
    public editor: LogicEditor

    private readonly mainDiv: HTMLDivElement

    private readonly controlDiv: HTMLDivElement
    private readonly controlDivRAMROMSelect: HTMLSelectElement
    private readonly downloadFromMemRAMROMSelectedButton : HTMLButtonElement
    private readonly uploadToMemRAMROMSelectedButton : HTMLButtonElement

    private readonly headerDiv: HTMLDivElement
    private readonly lineNumberHeaderDiv: HTMLDivElement
    private readonly labelHeaderDiv: HTMLDivElement
    private readonly labelOpCodeDiv: HTMLDivElement
    private readonly labelOperandDiv: HTMLDivElement

    private readonly programDiv: HTMLDivElement
    private readonly programOl: HTMLOListElement

    private _dragSrcEl : HTMLLIElement | null = null

    private _assemblerNumMaxAddressBits = 8
    private _assemblerWordLength = 8
    private _assemblerOperandLength = 4

    private _opcodes : typeof CPUOpCodes

    private _program : Instruction[]
    private _lineLabels : string[]

    private _ROMRAMsList : Component[]

    private _counterCheck = 0

    public constructor(editor: LogicEditor) {
        this.editor = editor
        /*
                this.editor.html.mainCanvas.addEventListener("drop",  this.editor.wrapHandler((handler) => {
                    handler.preventDefault()
                    if (handler.dataTransfer !== null) {
                        console.log(handler.dataTransfer)
                        const file = handler.dataTransfer.files?.[0]
                        if (file !== undefined) {
                            editor.tryLoadFrom(file)
                        } else {
                            const dataItems = handler.dataTransfer.items
                            if (dataItems !== undefined) {
                                for (const dataItem of dataItems) {
                                    if (dataItem.kind === "string" && (dataItem.type === "application/json" || dataItem.type === "text/plain")) {
                                        dataItem.getAsString(content => {
                                            handler.dataTransfer!.dropEffect = "copy"
                                            editor.loadCircuitOrLibrary(content)
                                        })
                                        break
                                    }
                                }
                            }
                        }
                    }
                    this.editor.recalcPropagateAndDrawIfNeeded()
                    this.getRAMROMList()
                }))
        */
        this.editor.html.mainCanvas.addEventListener("mouseup",  this.editor.wrapHandler((handler) => {
            //const selectedComps = this.editor.eventMgr.currentMouseOverComp as Component
            this.getRAMROMList()
        }))

        // We must get the right moment !!! => focusout
        this.editor.html.mainContextMenu.addEventListener("focusout",  this.editor.wrapHandler((handler) => {
            this.getRAMROMList()
        }))

        this._ROMRAMsList = []

        this._opcodes = CPUOpCodes
        this._program = []
        this._lineLabels = []

        this.controlDivRAMROMSelect = select().render()
        this.getRAMROMList()
        this.controlDivRAMROMSelect.addEventListener('change', this.editor.wrapHandler((handler) => {
            applyModifierTo(this.controlDivRAMROMSelect.options[this.controlDivRAMROMSelect.options.selectedIndex], selected(""))
            //this.handleRAMROMSelect(this.controlDivRAMROMSelect.value)
            //this.generateBrutSourceCode()
        }))
        this.controlDivRAMROMSelect.addEventListener('changeSelected', this.editor.wrapHandler((handler) => {
            applyModifierTo(this.controlDivRAMROMSelect.options[this.controlDivRAMROMSelect.options.selectedIndex], selected(""))
            //console.log(lineLi.value)
            //this.handleRAMROMSelect(this.controlDivRAMROMSelect.value)
            //this.generateBrutSourceCode()
            //console.log("You selected: ", selectOpCode.value)
            //selectOpCode.value
        }))
        this.downloadFromMemRAMROMSelectedButton = button(
            i(cls("svgicon"),
                raw(inlineIconSvgFor("inputcircle"))),
            style("height:25px; width:25px; padding:0; align-items: center;")
        ).render()
        this.downloadFromMemRAMROMSelectedButton.addEventListener('click', this.editor.wrapHandler((handler) => {
            this.downloadFromMemRAMROM(this.controlDivRAMROMSelect.value)
        }))
        this.uploadToMemRAMROMSelectedButton = button(
            i(cls("svgicon"),
                raw(inlineIconSvgFor("outputcircle"))),
            style("height:25px; width:25px; padding:0; align-items: center;")
        ).render()
        this.uploadToMemRAMROMSelectedButton.addEventListener('click', this.editor.wrapHandler((handler) => {
            this.uploadToMemRAMROM(this.controlDivRAMROMSelect.value)
        }))

        this.controlDiv = div(
            cls("controlprogram"),
            style("position: absolute; left: 0; top: 0; width: 100%; height: 30px;"),
            this.controlDivRAMROMSelect,
            this.downloadFromMemRAMROMSelectedButton,
            this.uploadToMemRAMROMSelectedButton,
        ).render()

        this.lineNumberHeaderDiv = div(style("width: 10px; border-right: 1px black;"),"#").render()
        this.labelHeaderDiv = div(style("width: 75px; border-right: 1px black;"),"# label").render()
        this.labelOpCodeDiv = div(style("width: 55px"),"OpCode").render()
        this.labelOperandDiv = div(style("width: 80px"),"Operand").render()
        this.headerDiv = div(
            cls("headerprogram"),
            style("position: absolute; left: 0; top: 30px; width: 100%; height: 30px;"),
            this.lineNumberHeaderDiv,
            this.labelHeaderDiv,
            this.labelOpCodeDiv,
            this.labelOperandDiv,
        ).render()

        this.programOl = ol(cls(""), start("0"), id("instructionList"),style("position: absolute; left: 0; top: 0px; width: 370px;")).render()
        this.programDiv = div(cls("program"), style("position: relative; top: 60px; width: 390px; left:0; padding: 3px 5px; display: block; align-items: stretch;"), this.programOl).render()

        this.mainDiv = div(cls("assembler"), style("flex:none; position: absolute;"), this.controlDiv, this.headerDiv, this.programDiv).render()

        editor.html.assemblerEditor.insertAdjacentElement("afterbegin", this.mainDiv)

        this._dragSrcEl = this.editor.root.getElementById("instructionList") as HTMLLIElement

        this.addLine()
    }

    private getRAMROMList() {
        let numberOfAdequateRAMROM = 0
        if (this.controlDivRAMROMSelect != null) {
            this.removeAllChildren(this.controlDivRAMROMSelect)
            this._ROMRAMsList = []
        }
        this._ROMRAMsList = [...this.editor.components.all()].filter((comp) => comp instanceof RAM || comp instanceof ROM)
        if (this._ROMRAMsList.length > 0) {
            for (let romram of this._ROMRAMsList) {
                if (romram.ref != undefined) {
                    //We only want 8 data bits memories…
                    if (romram.value.mem[0].length == this._assemblerWordLength) {
                        //…and max 2 ** numWords
                        if (romram.value.mem.length <= 2 ** this._assemblerNumMaxAddressBits) {
                            option(romram.ref, value(romram.ref)).applyTo(this.controlDivRAMROMSelect)
                            numberOfAdequateRAMROM += 1
                        }
                    }
                }
            }
            if (numberOfAdequateRAMROM == 0) {
                option("none", value("none"), disabled).applyTo(this.controlDivRAMROMSelect)
            }
        } else {
            option("none", value("none"), disabled).applyTo(this.controlDivRAMROMSelect)
        }
    }

    private downloadFromMemRAMROM(SelectedRAMROMRef: string) {
        this._lineLabels = []
        let programMem: string[] = []
        if (this._ROMRAMsList != undefined) {
            const SelectedRAMROM = this._ROMRAMsList.find((comp) => comp.ref == SelectedRAMROMRef)
            if (SelectedRAMROM != undefined) {
                programMem = this.contentRepr(SelectedRAMROM.value.mem)
            } else {
                programMem = ["00000000"]
            }
        }

        let program: Instruction[] = []
        for (let codelineMem of programMem) {
            const labelMem: string = ""
            const opCodeMem = parseInt(codelineMem.slice(0, 4), 2)
            const operandMem = parseInt(codelineMem.slice(4, 8), 2)
            program.push({
                label : labelMem,
                opCode: opCodeMem,
                operand: operandMem
            })
        }

        for (let _i = 0; _i < program.length; _i++) {
            let instruction = program[_i]
            let lineLabel = ""

            if ((goToDownOpCode.includes(CPUOpCodes[instruction.opCode]))) {
                let labelLineNumber = _i + instruction.operand
                if (labelLineNumber > program.length) {
                    labelLineNumber += - program.length
                }
                lineLabel = "line " + labelLineNumber.toString()
                program[labelLineNumber].label = lineLabel
            }
            if(goToUpOpCode.includes(CPUOpCodes[instruction.opCode])) {
                let labelLineNumber = _i - instruction.operand
                if (labelLineNumber < 1) {
                    labelLineNumber += program.length
                }
                lineLabel = "line " + labelLineNumber.toString()
                program[labelLineNumber].label = lineLabel
            }
            this._lineLabels[_i] = lineLabel
        }

        this._program = Array.from(program)

        this.reDrawProgram()
    }

    private reDrawProgram() {
        this.removeAllChildren(this.programOl)
        for (let _i = 0; _i < this._program.length; _i++) {
            this.programOl.appendChild(this.makeLine())
            this.updateLine(this.programOl.lastChild as HTMLLIElement)
        }
        this.computeLinesOperand()
        console.log("redraw")
        this.generateBrutSourceCode()
    }

    private uploadToMemRAMROM(SelectedRAMROMRef: string) {
        if (this._program != undefined) {
            if (this._ROMRAMsList != undefined) {
                const selectedRAMROM = this._ROMRAMsList.find((comp) => comp.ref == SelectedRAMROMRef) as RAM
                let memSize = 0
                if (selectedRAMROM != null) {
                    const mem = this.contentRepr(selectedRAMROM.value.mem)
                    memSize = mem.length
                }
                if (memSize >= this._program.length) {
                    let lineStringArray = []
                    for (let line of this._program) {
                        const lineString = this.createBinaryString(line.opCode, 4) + this.createBinaryString(line.operand, 4)
                        lineStringArray.push(lineString)
                    }
                    const emptylineString = "00000000"
                    for (let _i = this._program.length - memSize; _i > 0; _i--) {
                        lineStringArray.push(emptylineString)
                    }
                    const programString = lineStringArray.join(" ")
                    if (selectedRAMROM != null) {
                        selectedRAMROM.doSetMem(RAM.contentsFromString(programString, 8, memSize))
                    }
                    this.editor.recalcPropagateAndDrawIfNeeded()
                } else {
                    console.log("You must take a larger memory module")
                }
            }
        }
    }

    private contentRepr(mem: any): string[]  {
        const cells: string[] = []
        const numWords = mem.length
        const numDataBits = mem[0].length
        for (let addr = 0; addr < numWords; addr++) {
            const word = mem[addr]
            const wordRepr = binaryStringRepr(word)
            //console.log(wordRepr)
            cells.push(wordRepr)
        }
        return cells
    }

    private addLine(line?: HTMLLIElement, aboveCurrentLinecode?: boolean) {
        if (this.programOl.childElementCount < 2 ** this._assemblerNumMaxAddressBits ) {
            let lineNumber = -1
            if (line != undefined) {
                lineNumber = this.getLineNumber(line)
            }

            const emptyInstruction: Instruction = {
                label : "",
                opCode: 0,
                operand: 0
            }

            const newLine = this.makeLine()

            if (lineNumber < 0) {
                this.programOl.appendChild(newLine)
                //this._program.push(emptyInstruction)
            } else {
                if (aboveCurrentLinecode != undefined) {
                    if (aboveCurrentLinecode) {
                        this.programOl.insertBefore(newLine, this.programOl.childNodes[lineNumber])
                        //this._program.splice(lineNumber, 0, emptyInstruction)
                    } else {
                        if (this.programOl.childNodes[lineNumber].nextSibling != null) {
                            this.programOl.insertBefore(newLine, this.programOl.childNodes[lineNumber].nextSibling)
                            //this._program.splice(lineNumber + 1, 0, emptyInstruction)
                        } else {
                            this.programOl.appendChild(newLine)
                            //this._program.push(emptyInstruction)
                        }
                    }
                }

            }
            //this.computeLinesOperand()
            console.log("addline")
            this.generateBrutSourceCode()
            this.computeLinesOperand()
            this.generateBrutSourceCode()
        }
    }

    private makeLine(): HTMLLIElement {
        const labelInput = input(
            cls("label"),
            value(""),
            maxlength("8"),
        ).render()
        const labelInputDiv = div(
            cls("labelDiv"),
            labelInput
        ).render()

        const opCodeSelect = select(
            cls("opcode"),
        ).render()
        for (let opCode of this._opcodes) {
            option(cls("opcodevalue"), opCode, value(opCode)).applyTo(opCodeSelect)
        }
        const opCodeDiv = div(
            cls("opCodeDiv"),
            opCodeSelect
        ).render()

        const operandSelect = select(
            cls("operand"),
        ).render()
        for (let _i = 0; _i < 16; _i++) {
            option(
                cls("operandvalue"),
                _i.toString(),
                value(_i.toString())
            ).applyTo(operandSelect)
        }
        const operandDiv = div(
            //id(`operand${lineNumber.toString()}`),
            cls("operandDiv"),
            operandSelect
        ).render()

        const deleteButton = button(
            i(cls("svgicon"), raw(inlineIconSvgFor("trash"))),
            style("height:25px; width:25px; padding:0; align-items: center;")
        ).render()

        const addAboveButton = button(
            i(cls("svgicon"), raw(inlineIconSvgFor("arrowcircleup"))),
            style("height:25px; width:25px; padding:0; align-items: center;")
        ).render()

        const addBelowButton = button(
            i(cls("svgicon"), raw(inlineIconSvgFor("arrowcircledown"))),
            style("height:25px; width:25px; padding:0; align-items: center;")
        ).render()

        const lineDiv = div(
            cls("lineDiv"),
            //draggable,
            //id(`grid${lineNumber.toString()}`),
            labelInputDiv,
            opCodeDiv,
            operandDiv,
            deleteButton,
            addAboveButton,
            addBelowButton
        ).render()

        const lineLi = li(
            cls("line"),
            style("color: #ffffff;"),
            draggable,
            lineDiv
        ).render()

        deleteButton.addEventListener('click', this.editor.wrapHandler((handler) => {
            this.removeLine(lineLi)
        }))

        addAboveButton.addEventListener('click', this.editor.wrapHandler((handler) => {
            this.addLine(lineLi, true)
        }))

        addBelowButton.addEventListener('click', this.editor.wrapHandler((handler) => {
            this.addLine(lineLi, false)
        }))

        labelInput.addEventListener('input', this.editor.wrapHandler((handler) => {
            //this.handleLabelInputChange(lineLi)
            this.handleLineChanged(lineLi)
        }))

        opCodeSelect.addEventListener('change', this.editor.wrapHandler((handler) => {
            //this.handleOpCodeSelectChange(lineLi, opCodeSelect)
            this.handleLineChanged(lineLi)
        }))

        opCodeSelect.addEventListener('changeSelected', this.editor.wrapHandler((handler) => {
            //this.handleOpCodeSelectChange(lineLi, opCodeSelect)
            this.handleLineChanged(lineLi)
        }))

        operandSelect.addEventListener('change', this.editor.wrapHandler((handler) => {
            //this.handleOperandSelectChange(lineLi, operandSelect)
            this.handleLineChanged(lineLi)
        }))

        operandSelect.addEventListener('changeSelected', this.editor.wrapHandler((handler) => {
            //this.handleOperandSelectChange(lineLi, operandSelect)
            this.handleLineChanged(lineLi)
        }))

        lineLi.addEventListener("click", this.editor.wrapHandler((handler) => {
            applyModifierTo(lineLi, selected(""))
            // TO DO FOR INSERTING ?
        }))
        lineLi.addEventListener("dragstart", this.editor.wrapHandler((handler) => {
            this.handleDragStart(handler, lineLi)
            //console.log("s",this._dragSrcEl)
        }))
        lineLi.addEventListener("dragend", this.editor.wrapHandler((handler) => {
            this.handleDragEnd(handler, lineLi)
        }))
        lineLi.addEventListener("dragover", this.editor.wrapHandler((handler) => {
            this.handleDragOver(handler)
        }))
        lineLi.addEventListener("dragenter", this.editor.wrapHandler((handler) => {
            this.handleDragEnter(handler, lineLi)
        }))
        lineLi.addEventListener("dragleave", this.editor.wrapHandler((handler) => {
            this.handleDragLeave(handler, lineLi)
        }))
        lineLi.addEventListener("drop", this.editor.wrapHandler((handler) => {
            this.handleDrop(handler, lineLi, labelInput)
        }))

        return lineLi
    }

    private handleLineChanged(line: HTMLLIElement) {
        const lineNumber = this.getLineNumber(line)

        const newLabelInput = line.getElementsByClassName("label")[0] as HTMLInputElement
        const newOpCodeSelect = line.getElementsByClassName("opcode")[0] as HTMLSelectElement
        const newOperandSelect = line.getElementsByClassName("operand")[0] as HTMLSelectElement

        const newInstruction: Instruction = {
            label : newLabelInput.value,
            opCode : newOpCodeSelect.options.selectedIndex,
            operand : newOperandSelect.options.selectedIndex
        }

        if (newInstruction.label != this._program[lineNumber].label) {
            const allLabels = this._program.map(instruction => instruction.label)
            if (newInstruction.label == "") {
                this._program[lineNumber].label = ""
                applyModifierTo(newLabelInput, style("color: #000000;"))
                //this.computeLinesOperand()
                console.log("empptyla")

                //this.generateBrutSourceCode()

            } else {
                if (allLabels.includes(newInstruction.label)) {
                    applyModifierTo(newLabelInput, style("color: #ff0000;"))
                } else {
                    applyModifierTo(newLabelInput, style("color: #000000;"))
                    this._program[lineNumber].label = newInstruction.label
                    applyModifierTo(newLabelInput, value(newInstruction.label))
                    //this.computeLinesOperand()
                    console.log("newlab")
                    //this.generateBrutSourceCode()
                }
            }
            this.computeLineOperand(line)
            this.generateBrutSourceCode()
        }

        if (newInstruction.opCode != this._program[lineNumber].opCode) {
            const newCPUOpCode = CPUOpCodes[newInstruction.opCode]
            const CPUOpCode = CPUOpCodes[this._program[lineNumber].opCode]
            if (goToOpCode.includes(newCPUOpCode)) {
                if (!goToOpCode.includes(CPUOpCode)) {
                    this._program[lineNumber].operand = 0
                }
            }
            if (goToDownOpCode.includes(newCPUOpCode)) {
                if (goToUpOpCode.includes(CPUOpCode)) {
                    this._program[lineNumber].operand = 0
                }
            }
            if (goToUpOpCode.includes(newCPUOpCode)) {
                if (goToDownOpCode.includes(CPUOpCode)) {
                    this._program[lineNumber].operand = 0
                }
            }
            if (!goToOpCode.includes(newCPUOpCode)) {
                if (goToOpCode.includes(CPUOpCode)) {
                    this._program[lineNumber].operand = 0
                    this.removeAllChildren(newOperandSelect)
                    for (let _i = 0; _i < 16; _i++) {
                        option(
                            cls("operandvalue"),
                            _i.toString(),
                            value(_i.toString())
                        ).applyTo(newOperandSelect)
                    }
                }
            }

            this._program[lineNumber].opCode = newInstruction.opCode
            const newOpCodeSelectIndex = newOpCodeSelect.options.selectedIndex
            applyModifierTo(newOpCodeSelect, selectedIndex(newOpCodeSelectIndex.toString()))
            //applyModifierTo(newOpCodeSelect.options[newOpCodeSelectIndex], selected(""))

            this.computeLineOperand(line)
            this.generateBrutSourceCode()
        }

        if (newInstruction.operand != this._program[lineNumber].operand) {
            this._program[lineNumber].operand = newInstruction.operand
            const newOperandSelectIndex = newOperandSelect.options.selectedIndex
            applyModifierTo(newOperandSelect, selectedIndex(newOperandSelectIndex.toString()))
            //applyModifierTo(newOperandSelect.options[newOperandSelectIndex], selected(""))
            //this.generateBrutSourceCode()
            this.computeLineOperand(line)
            this.generateBrutSourceCode()
        }
        console.log("handlechange")

        //this.generateBrutSourceCode()
    }

    private updateLine(line: HTMLLIElement) {
        const lineNumber = this.getLineNumber(line)

        const labelValue = this._program[lineNumber].label
        const labelInput = line.getElementsByClassName("label")[0] as HTMLInputElement
        applyModifierTo(labelInput, value(labelValue))
        //this.updateSelectOptionsForAddresses()

        const opCodeSelectedValue = this._program[lineNumber].opCode
        const opCodeSelect = line.getElementsByClassName("opcode")[0] as HTMLSelectElement
        const opCodeOptions = opCodeSelect.getElementsByClassName("opcodevalue")
        for(let opCodeOption of opCodeOptions) {
            opCodeOption.removeAttribute("selected")
        }
        const opCodeSelectedOption = opCodeOptions[opCodeSelectedValue] as HTMLOptionElement
        applyModifierTo(opCodeSelect, selectedIndex(opCodeSelectedValue.toString()))
        applyModifierTo(opCodeSelectedOption, selected(""))

        const operandSelectedValue = this._program[lineNumber].operand
        const operandSelect = line.getElementsByClassName("operand")[0] as HTMLSelectElement
        const operandOptions = operandSelect.getElementsByClassName("operandvalue")
        for(let operandOption of operandOptions) {
            operandOption.removeAttribute("selected")
        }
        const operandSelectedOption = operandOptions[operandSelectedValue] as HTMLOptionElement
        applyModifierTo(operandSelect, selectedIndex(operandSelectedValue.toString()))
        applyModifierTo(operandSelectedOption, selected(""))
    }

    private updateLines() {
        if (this.programOl.getElementsByClassName("line") != null) {
            const program = this.programOl.getElementsByClassName("line")
            //this.updateSelectOptionsForAddresses()
            for(let _i = 0; _i < program.length; _i++) {
                const line = program[_i] as HTMLLIElement
                //this.updateSelectOptionsForAddresses()
                const lineNumber = this.getLineNumber(line)

                const labelValue = this._program[lineNumber].label
                const labelInput = line.getElementsByClassName("label")[0] as HTMLInputElement
                applyModifierTo(labelInput, value(labelValue))
                //this.updateSelectOptionsForAddresses()

                const opCodeSelectedValue = this._program[lineNumber].opCode
                const opCodeSelect = line.getElementsByClassName("opcode")[0] as HTMLSelectElement
                const opCodeOptions = opCodeSelect.getElementsByClassName("opcodevalue")
                for(let opCodeOption of opCodeOptions) {
                    opCodeOption.removeAttribute("selected")
                }
                const opCodeSelectedOption = opCodeOptions[opCodeSelectedValue] as HTMLOptionElement
                applyModifierTo(opCodeSelect, selectedIndex(opCodeSelectedValue.toString()))
                applyModifierTo(opCodeSelectedOption, selected(""))

                const operandSelectedValue = this._program[lineNumber].operand
                const operandSelect = line.getElementsByClassName("operand")[0] as HTMLSelectElement
                /*
                                this.computeLinesOperand(CPUOpCodes[opCodeSelectedValue], item as HTMLLIElement, operandSelect, false)
                // TO FIX
                                if (!goToOpCode.includes(CPUOpCodes[opCodeSelectedValue]) && !noOperandOpCode.includes(CPUOpCodes[opCodeSelectedValue])) {
                                    const operandOptions = operandSelect.querySelectorAll(".operandvalue") as NodeListOf<HTMLOptionElement>
                                    for (let operandOption of operandOptions) {
                                        operandOption.removeAttribute("selected")
                                    }

                                    const operandSelectedOption = operandOptions[operandSelectedValue] as HTMLOptionElement

                                    applyModifierTo(operandSelect, selectedIndex(operandSelectedValue.toString()))
                                    applyModifierTo(operandSelectedOption, selected(""))
                                }

                 */
            }
            this.computeLinesOperand()
        }
    }

    private removeLine(line: HTMLLIElement) {
        if (line.parentNode != null && line.parentNode.childElementCount > 1) {
            const lineNumber = this.getLineNumber(line)
            line.parentNode.removeChild(line)
            this._program.slice(lineNumber, 1)
        }
        this.computeLinesOperand()
        console.log("remove")

        this.generateBrutSourceCode()
    }

    private getLineNumber(line: HTMLLIElement) {
        let lineNumber = -1
        if (line != null) {
            if (line.parentElement != null) {
                // The only way to get the index of the current line
                lineNumber = [...line.parentElement.children].indexOf(line)
            }
        }
        return lineNumber
    }

    public getNodesList(parentElement: HTMLElement, className: string) {
        // We must get nodes from this.editor.root !!!
        return parentElement.getElementsByClassName(className)
    }

    private handleLabelInputChange(line: HTMLLIElement) {
        const labelInput = line.getElementsByClassName("label")[0] as HTMLInputElement
        let labelInputValue = labelInput.value

        if (labelInputValue == "") {
            this._program[this.getLineNumber(line)].label = ""
        } else {
            if (this._lineLabels.includes(labelInputValue)) {
                applyModifierTo(labelInput, style("color: #ff0000;"))
            } else {
                applyModifierTo(labelInput, style("color: #000000;"))
                this._program[this.getLineNumber(line)].label = labelInputValue
            }
        }
        applyModifierTo(labelInput, value(labelInputValue))


        this.computeLinesOperand()
        console.log("NOT HERE")

        this.generateBrutSourceCode()
    }

    private handleOpCodeSelectChange(line: HTMLLIElement, opCodeSelect: HTMLSelectElement) {
        this.updateLine(line)
        //this._program[lineNumber].opCode = opCodeSelect.options.selectedIndex
        //applyModifierTo(opSelect.options[opSelect.options.selectedIndex], selected(""))
        this.computeLinesOperand()
        this.generateBrutSourceCode()

    }

    private handleOperandSelectChange(line: HTMLLIElement, operandSelect: HTMLSelectElement) {
        const lineNumber = this.getLineNumber(line)
        this._program[lineNumber].operand = operandSelect.options.selectedIndex


        //applyModifierTo(opSelect.options[opSelect.options.selectedIndex], selected(""))
        this.computeLinesOperand()
        this.generateBrutSourceCode()
    }

    private handleDragStart(evt: DragEvent, elem: HTMLLIElement) {
        //setTimeout(() => elem.classList.add("dragging"), 0)
        elem.style.opacity = "0.4"
        this._dragSrcEl = elem
        if (this.programOl.getElementsByClassName("line") != null) {
            const program = this.programOl.getElementsByClassName("line")
            //this.updateSelectOptionsForAddresses()
            for(let _i = 0; _i < program.length; _i++) {
                const line = program[_i] as HTMLLIElement
                if (this._dragSrcEl != line) {
                    line.classList.add('hint')
                }
            }
        }
    }

    private handleDragEnd(evt: DragEvent, elem: HTMLLIElement) {
        elem.style.opacity = "1"
        if (this.programOl.getElementsByClassName("line") != null) {
            const program = this.programOl.getElementsByClassName("line")
            //this.updateSelectOptionsForAddresses()
            for (let _i = 0; _i < program.length; _i++) {
                const line = program[_i] as HTMLLIElement
                line.classList.remove("hint")
                line.classList.remove("active")
            }
        }
    }

    private handleDragOver(evt: DragEvent) {
        evt.preventDefault()
        return false
    }

    private handleDragEnter (evt: DragEvent, elem: HTMLLIElement) {
        elem.classList.add("active")
    }

    private handleDragLeave (evt: DragEvent, elem: HTMLLIElement) {
        elem.classList.remove("active")
    }

    private handleDrop(evt: DragEvent, elem: HTMLLIElement, labelInput: HTMLInputElement) {
        evt.stopPropagation()
        if (elem != this._dragSrcEl) {
            let currentpos = 0, droppedpos = 0;
            if (this.programOl.getElementsByClassName("line") != null) {
                const program = this.programOl.getElementsByClassName("line")
                //this.updateSelectOptionsForAddresses()
                for(let _i = 0; _i < program.length; _i++) {
                    const line = program[_i] as HTMLLIElement
                    if (elem == line) {
                        currentpos = elem.value
                    } else {
                        droppedpos = line.value;
                    }
                }
            }
            if (elem.parentNode != null && this._dragSrcEl != null) {
                if (currentpos < droppedpos) {
                    elem.parentNode.insertBefore(this._dragSrcEl, elem.nextSibling);
                } else {
                    elem.parentNode.insertBefore(this._dragSrcEl, elem);
                }
            }
        }
        this.computeLinesOperand()
        console.log("DROP")

        this.generateBrutSourceCode()

        return false
    }

    private generateBrutSourceCode() {
        this._program = []
        this._lineLabels = []
        if (this.programOl.getElementsByClassName("line") != null) {
            const program = this.programOl.getElementsByClassName("line")
            //this.updateSelectOptionsForAddresses()
            for(let _i = 0; _i < program.length; _i++) {
                const line = program[_i] as HTMLLIElement

                const _label = line.getElementsByClassName("label")[0] as HTMLInputElement
                const _opcode = line.getElementsByClassName("opcode")[0] as HTMLSelectElement
                const _operand = line.getElementsByClassName("operand")[0] as HTMLSelectElement

                const sourceCodeLine: Instruction = {
                    label : _label.value,
                    opCode : _opcode.options.selectedIndex,
                    operand :_operand.options.selectedIndex
                }
                this._program.push(sourceCodeLine)
            }
        }
        console.log("*",this._program)
    }

    private removeAllChildren(parent: HTMLElement) {
        if (parent.firstChild != null) {
            while (parent.firstChild && parent.lastChild != null) {
                parent.removeChild(parent.lastChild);
            }
        }
    }

    private computeLinesOperand() {
        if (this.programOl.getElementsByClassName("line") != null) {
            const program = this.programOl.getElementsByClassName("line")
            for(let _i = 0; _i < program.length; _i++) {
                    const line = program[_i] as HTMLLIElement
                    this.computeLineOperand(line)
            }
        }
    }

    private computeLineOperand(line: HTMLLIElement) {
        const lineNumber = this.getLineNumber(line)
        console.log(this._program)

        const labelValue = this._program[lineNumber].label
        const labelInput = line.getElementsByClassName("label")[0] as HTMLInputElement

        const opCodeSelectedValue = this._program[lineNumber].opCode
        const opCodeSelect = line.getElementsByClassName("opcode")[0] as HTMLSelectElement
        const CPUOpCode = CPUOpCodes[opCodeSelectedValue]

        const operandSelectedValue = this._program[lineNumber].operand
        const operandSelect = line.getElementsByClassName("operand")[0] as HTMLSelectElement
        const operandOptions = operandSelect.getElementsByClassName("operandvalue")

        applyModifierTo(operandSelect, style("visibility: visible"))
        if (goToOpCode.includes(CPUOpCode)) {
            this.removeAllChildren(operandSelect)
            if (goToUpOpCode.includes(CPUOpCode)) {
                for (let _i = this._assemblerOperandLength ** 2 - 1; _i > 0; _i--) {
                    if (lineNumber - _i < 0) {
                        option(
                            cls("operandvalue"),
                            hidden
                        ).applyTo(operandSelect)
                    } else {
                        if (this._program[lineNumber - _i].label == "") {
                            const operandvalue = "label " + (lineNumber - _i).toString()
                            option(
                                cls("operandvalue"),
                                operandvalue,
                                value(operandvalue),
                                disabled
                            ).applyTo(operandSelect)
                        } else {
                            console.log(lineNumber, CPUOpCode, this._program[lineNumber].operand, operandSelectedValue, "*", this._program[lineNumber - _i].operand, this._program[lineNumber - _i].label)
                            const operandvalue = this._program[lineNumber - _i].label
                            option(
                                cls("operandvalue"),
                                operandvalue,
                                value(operandvalue),
                                (operandSelectedValue == _i) ? selected("") : "",
                            ).applyTo(operandSelect)
                        }
                    }
                }
            } else {
                for (let _i = 1; _i < this._assemblerOperandLength ** 2; _i++) {
                    if (lineNumber + _i < this._program.length) {
                        if (this._program[lineNumber + _i].label == "") {
                            const operandvalue = "label " + (lineNumber + _i).toString()
                            option(
                                cls("operandvalue"),
                                operandvalue,
                                value(operandvalue),
                                disabled
                            ).applyTo(operandSelect)
                        } else {
                            const operandvalue = this._program[lineNumber + _i].label
                            option(
                                cls("operandvalue"),
                                operandvalue,
                                value(operandvalue),
                                (operandSelectedValue == _i) ? selected("") : "",
                            ).applyTo(operandSelect)
                        }
                    } else {
                        option(
                            cls("operandvalue"),
                            hidden
                        ).applyTo(operandSelect)
                    }
                }
            }
        } else {
            if (noOperandOpCode.includes(CPUOpCode)) {
                applyModifierTo(operandSelect, style("visibility: hidden"))
            }
        }
        console.log("compute operand no generation")

        this.generateBrutSourceCode()
    }

    public createBinaryString (nMask: number, nBit: number) {
        // nMask must be between -2^nBit and 2^nBit - 1
        let aMask: number[] = []
        let nShifted = nMask
        for (let nFlag = 0; nFlag < nBit; nFlag++) {
            aMask.push(nShifted % 2)
            nShifted >>= 1
        }
        const sMask = aMask.reverse().join("")
        return sMask
    }
}

export class AssemblerEditorEventManager {

    public readonly editor: LogicEditor
    //private _assemblerEditor: AssemblerEditor
    private _currentMouseOverLine: HTMLElement | null = null
    private _currentMouseOverPopper: [popper: PopperInstance, removeScrollListener: () => void] | null = null
    //private _currentMouseDownData: MouseDownData | null = null
    private _startHoverTimeoutHandle: TimeoutHandle | null = null
    private _startDragTimeoutHandle: TimeoutHandle | null = null
    public currentLineSelection: EditorSelection | undefined = undefined

    public constructor(editor: LogicEditor) {
        this.editor = editor
        //const assemblerEditor = this.editor.html.assemblerEditor
        //this._assemblerEditor = this.editor.html.assemblerEditor as HTMLElement

        //const assemblerListener = assemblerEditor.ondragstart
    }

    public get currentMouseOverLine() {
        return this._currentMouseOverLine
    }

    public setCurrentMouseOverLine(line: HTMLUListElement | null) {
        if (line !== this._currentMouseOverLine) {
            //this.clearPopperIfNecessary()
            //this.clearHoverTimeoutHandle()

            this._currentMouseOverLine = line
            if (line !== null) {
                this._startHoverTimeoutHandle = setTimeout(() => {
                    this._startHoverTimeoutHandle = null
                }, 1200)
            }
        }
    }

    public registerAssemblerEditorListenersOn = (assemblerEditor: AssemblerEditor) => {
        const editor = this.editor
        /*
                const returnTrue = () => true
                editor.ondragstart = returnTrue
                editor.ondragend = returnTrue
                editor.ondragenter = returnTrue
                editor.ondragover = returnTrue
                editor.ondragend = returnTrue
         */
    }

    private handleDragStart(evt: MouseEvent | TouchEvent, element: HTMLElement) {
        element.style.opacity = "0.4"
        element.style.setProperty("backgroundColor", "red")
    }

    private handleDragEnd(evt: MouseEvent | TouchEvent, element: HTMLElement) {
        element.style.opacity = "1"
    }

    private testMouseOver(evt: MouseEvent | TouchEvent, element: HTMLElement) {
        element.style.setProperty("backgroundColor", "red")
        element.style.opacity = "0"
        element.style.backgroundColor = "red"
    }

    /*
        public get currentMouseDownData() {
            return this._currentMouseDownData
        }
     */
}
