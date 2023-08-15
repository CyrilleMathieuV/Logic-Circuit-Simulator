import { LogicEditor, MouseAction } from "./LogicEditor"
import {binaryStringRepr, TimeoutHandle, Unknown} from "./utils"
import { Instance as PopperInstance } from "@popperjs/core/lib/types"
import { EditorSelection, UIEventManager } from "./UIEventManager"
import { CPU, CPUBase, CPUOpCode, CPUOpCodes} from "./components/CPU"
import { IconName, inlineIconSvgFor } from "./images"
import { button, cls, i, raw, li, div, ol, select, option, value, style, draggable, id, input, applyModifierTo, selected, start, disabled, hidden, maxlength, selectedIndex } from "./htmlgen"
import { ROM } from "./components/ROM"
import { RAM } from "./components/RAM"
import { Component } from "./components/Component"
import {COLOR_BACKGROUND_INVALID, COLOR_MOUSE_OVER_DANGER} from "./drawutils"

// sources
// https://web.dev/drag-and-drop/
// https://medium.com/@reiberdatschi/common-pitfalls-with-html5-drag-n-drop-api-9f011a09ee6c
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
    comment: string
}

const goToDownOpCode = ["GDW", "JIZ", "JIC"] as string[]
const goToUpOpCode = ["GUP"] as string[]
let goToOpCode = goToDownOpCode.concat(goToUpOpCode)
const noOperandOpCode = ["NOP", "DEC", "HLT"] as string[]

export class AssemblerEditor {
    public editor: LogicEditor

    //private readonly mainDiv: HTMLDivElement

    private readonly controlDiv: HTMLDivElement
    private readonly undoButton: HTMLButtonElement
    private readonly redoButton: HTMLButtonElement
    private readonly controlDivRAMROMSelect: HTMLSelectElement
    private readonly downloadFromMemRAMROMSelectedButton : HTMLButtonElement
    private readonly uploadToMemRAMROMSelectedButton : HTMLButtonElement
    private readonly controlDivCPUSelect: HTMLSelectElement
    private readonly addressModeButton: HTMLButtonElement
    private readonly openFromFileButton: HTMLButtonElement
    private readonly downloadToFileButton: HTMLButtonElement
    private readonly hideButton: HTMLButtonElement
    private readonly showButton: HTMLButtonElement

    private readonly headerDiv: HTMLDivElement
    private readonly lineNumberHeaderDiv: HTMLDivElement
    private readonly labelHeaderDiv: HTMLDivElement
    private readonly labelOpCodeDiv: HTMLDivElement
    private readonly labelOperandDiv: HTMLDivElement
    private readonly commentHeaderDiv: HTMLDivElement

    private readonly programDiv: HTMLDivElement
    private readonly programOl: HTMLOListElement

    private _dragSrcEl: HTMLLIElement | null = null

    private _assemblerNumMaxAddressBits = 8
    private _assemblerWordLength = 8
    private _assemblerOperandLength = 4

    private _opcodes: typeof CPUOpCodes

    private _program: Instruction[]

    private _ROMRAMsList: Component[]
    private _CPUsList: Component[]

    private _counterCheck = 0

    public constructor(editor: LogicEditor) {
        this.editor = editor
        /*
        TO DO Get from drag/drop or file
        finding the correct event !!!

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
            this.getCPUList()
        }))

        // We must get the right moment !!! => focusout
        this.editor.html.mainContextMenu.addEventListener("focusout",  this.editor.wrapHandler((handler) => {
            this.getRAMROMList()
            this.getCPUList()
        }))

        this._ROMRAMsList = []
        this._CPUsList = []

        this._opcodes = CPUOpCodes
        this._program = []

        this.controlDivRAMROMSelect = select().render()

        this.undoButton = button(
            i(cls("svgicon"),
                raw(inlineIconSvgFor("undo"))),
            style("height:25px; width:25px; padding:0; align-items: center;")
        ).render()
        this.undoButton.addEventListener('click', this.editor.wrapHandler((handler) => {
            // TO DO
        }))
        this.redoButton = button(
            i(cls("svgicon"),
                raw(inlineIconSvgFor("redo"))),
            style("height:25px; width:25px; padding:0; align-items: center;")
        ).render()
        this.redoButton.addEventListener('click', this.editor.wrapHandler((handler) => {
            // TO DO
        }))

        this.getRAMROMList()
        this.controlDivRAMROMSelect.addEventListener('change', this.editor.wrapHandler((handler) => {
            applyModifierTo(this.controlDivRAMROMSelect.options[this.controlDivRAMROMSelect.options.selectedIndex], selected(""))
        }))
        this.controlDivRAMROMSelect.addEventListener('changeSelected', this.editor.wrapHandler((handler) => {
            applyModifierTo(this.controlDivRAMROMSelect.options[this.controlDivRAMROMSelect.options.selectedIndex], selected(""))
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

        this.controlDivCPUSelect = select().render()
        this.getCPUList()
        this.controlDivCPUSelect.addEventListener('change', this.editor.wrapHandler((handler) => {
            applyModifierTo(this.controlDivCPUSelect.options[this.controlDivCPUSelect.options.selectedIndex], selected(""))
        }))
        this.controlDivCPUSelect.addEventListener('changeSelected', this.editor.wrapHandler((handler) => {
            applyModifierTo(this.controlDivCPUSelect.options[this.controlDivCPUSelect.options.selectedIndex], selected(""))
        }))

        this.addressModeButton = button(
            i(cls("svgicon"),
                raw(inlineIconSvgFor("signpost"))),
            style("height:25px; width:25px; padding:0; align-items: center;")
        ).render()
        this.addressModeButton.addEventListener('click', this.editor.wrapHandler((handler) => {
            // TO DO
        }))

        this.openFromFileButton = button(
            i(cls("svgicon"),
                raw(inlineIconSvgFor("open"))),
            style("height:25px; width:25px; padding:0; align-items: center;")
        ).render()
        this.openFromFileButton.addEventListener('click', this.editor.wrapHandler((handler) => {
            // TO DO
        }))
        this.downloadToFileButton = button(
            i(cls("svgicon"),
                raw(inlineIconSvgFor("download"))),
            style("height:25px; width:25px; padding:0; align-items: center;")
        ).render()
        this.downloadToFileButton.addEventListener('click', this.editor.wrapHandler((handler) => {
            // TO DO
        }))

        this.showButton = button(
            i(cls("svgicon"),
                raw(inlineIconSvgFor("eye"))),
            style("height:25px; width:25px; padding:0; align-items: center;")
        ).render()
        this.showButton.addEventListener('click', this.editor.wrapHandler((handler) => {
            // TO DO
        }))
        this.hideButton = button(
            i(cls("svgicon"),
                raw(inlineIconSvgFor("close"))),
            style("height:25px; width:25px; padding:0; align-items: center;")
        ).render()
        this.hideButton.addEventListener('click', this.editor.wrapHandler((handler) => {
            // TO DO
        }))

        this.controlDiv = div(
            cls("controlprogram"),
            style("position: absolute; left: 0; top: 0; width: 100%; height: 30px;"),
            this.undoButton,
            this.redoButton,
            this.controlDivRAMROMSelect,
            this.downloadFromMemRAMROMSelectedButton,
            this.uploadToMemRAMROMSelectedButton,
            this.controlDivCPUSelect,
            this.addressModeButton,
            this.openFromFileButton,
            this.downloadToFileButton,
            this.showButton,
            this.hideButton,
        ).render()

        this.lineNumberHeaderDiv = div(style("width: 10px; border-right: 1px black;"),"#").render()
        this.labelHeaderDiv = div(style("width: 75px; border-right: 1px black;"),"# label").render()
        this.labelOpCodeDiv = div(style("width: 55px"),"OpCode").render()
        this.labelOperandDiv = div(style("width: 80px"),"Operand").render()
        this.commentHeaderDiv = div(style("width: 300px; border-right: 1px black;"),"# comment").render()
        this.headerDiv = div(
            cls("headerprogram"),
            style("position: absolute; left: 0; top: 30px; width: 100%; height: 30px;"),
            this.lineNumberHeaderDiv,
            this.labelHeaderDiv,
            this.labelOpCodeDiv,
            this.labelOperandDiv,
            this.commentHeaderDiv,
        ).render()

        this.programOl = ol(cls(""), start("0"), id("instructionList"),style("position: absolute; left: 0; top: 0px; width: 655px;")).render()
        this.programDiv = div(cls("program"), style("position: relative; top: 60px; width: 670px; left:0; padding: 3px 5px; display: block; align-items: stretch;"), this.programOl).render()

        //this.mainDiv = div(cls("assembler"), style("flex:none; position: absolute;"), this.controlDiv, this.headerDiv, this.programDiv).render()

        //editor.html.assemblerEditor.insertAdjacentElement("afterbegin", this.mainDiv)
        editor.html.assemblerEditor.appendChild(this.controlDiv)
        editor.html.assemblerEditor.appendChild(this.headerDiv)
        editor.html.assemblerEditor.appendChild(this.programDiv)

        // TO DO, naive approach, needs an event in CPU to trigger
        editor.html.assemblerEditor.addEventListener("instrAddr", this.editor.wrapHandler((handler) => {
            console.log(handler)
        }))

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

    private getCPUList() {
        let numberOfCPU = 0
        if (this.controlDivCPUSelect != null) {
            this.removeAllChildren(this.controlDivCPUSelect)
            this._CPUsList = []
        }
        this._CPUsList = [...this.editor.components.all()].filter((comp) => comp instanceof CPU)
        console.log(this._CPUsList)
        if (this._CPUsList.length > 0) {
            for (let cpu of this._CPUsList) {
                if (cpu.ref != undefined) {
                    option(cpu.ref, value(cpu.ref)).applyTo(this.controlDivCPUSelect)
                    numberOfCPU += 1
                }
            }
        }
        if (numberOfCPU == 0) {
            option("none", value("none"), disabled).applyTo(this.controlDivCPUSelect)
        }
    }

    private downloadFromMemRAMROM(SelectedRAMROMRef: string) {
        let programMem: string[] = []
        if (this._ROMRAMsList != undefined) {
            const selectedRAMROM = this._ROMRAMsList.find((comp) => comp.ref == SelectedRAMROMRef)
            if (selectedRAMROM != undefined) {
                let RAMROM = selectedRAMROM as ROM
                programMem = this.contentRepr(selectedRAMROM.value.mem)
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
                operand: operandMem,
                comment: ""
            })
        }

        for (let _i = 0; _i < program.length; _i++) {
            let instruction = program[_i]
            let lineLabel = ""

            const CPUOpCode = CPUOpCodes[instruction.opCode]

            if ((goToOpCode.includes(CPUOpCode))) {
                if(goToUpOpCode.includes(CPUOpCode)) {
                    let labelLineNumber = _i - instruction.operand
                    if (labelLineNumber < 1) {
                        labelLineNumber += program.length
                    }
                    lineLabel = "line " + labelLineNumber.toString()
                    program[labelLineNumber].label = lineLabel
                } else {
                    let labelLineNumber = _i + instruction.operand
                    if (labelLineNumber > program.length) {
                        labelLineNumber += -program.length
                    }
                    lineLabel = "line " + labelLineNumber.toString()
                    program[labelLineNumber].label = lineLabel
                }
            }
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

        this.generateBrutSourceCode()
        this.computeLinesOperand()
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

        const commentInput = input(
            cls("comment"),
            value(""),
            maxlength("32"),
        ).render()
        const commentInputDiv = div(
            cls("commentDiv"),
            commentInput
        ).render()

        const deleteButton = button(
            i(cls("svgicon"), raw(inlineIconSvgFor("trash"))),
            style("height:25px; width:25px; padding:0; align-items: center;")
        ).render()

        const addAboveButton = button(
            i(cls("svgicon"), raw(inlineIconSvgFor("arrowupward"))),
            style("height:25px; width:25px; padding:0; align-items: center;")
        ).render()

        const addImage = i(
            cls("svgicon"),
            raw(inlineIconSvgFor("add")),
            style("height:25px; width:25px; padding:0; align-items: center;")
        )

        const addBelowButton = button(
            i(cls("svgicon"), raw(inlineIconSvgFor("arrowdownward"))),
            style("height:25px; width:25px; padding:0; align-items: center;")
        ).render()

        const lineDiv = div(
            cls("lineDiv"),
            //draggable,
            //id(`grid${lineNumber.toString()}`),
            labelInputDiv,
            opCodeDiv,
            operandDiv,
            commentInputDiv,
            deleteButton,
            addAboveButton,
            addImage,
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
            this.handleDragOver(handler, lineLi)
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
        const newComment = line.getElementsByClassName("comment")[0] as HTMLInputElement

        const newInstruction: Instruction = {
            label : newLabelInput.value,
            opCode : newOpCodeSelect.options.selectedIndex,
            operand : newOperandSelect.options.selectedIndex,
            comment : newComment.value,
        }

        if (newInstruction.label != this._program[lineNumber].label) {
            const allLabels = this._program.map(instruction => instruction.label)
            if (newInstruction.label == "") {
                this._program[lineNumber].label = ""
                applyModifierTo(newLabelInput, style("color: #000000;"))
            } else {
                if (allLabels.includes(newInstruction.label)) {
                    applyModifierTo(newLabelInput, style(`color: ${COLOR_BACKGROUND_INVALID}; background-color : #f7d5d5`))
                } else {
                    applyModifierTo(newLabelInput, style("color: #000000;"))
                    this._program[lineNumber].label = newInstruction.label
                    applyModifierTo(newLabelInput, value(newInstruction.label))
                }
            }
            this.generateBrutSourceCode()
            this.computeLinesOperand()
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
                if (!goToDownOpCode.includes(CPUOpCode)) {
                    this._program[lineNumber].operand = 0
                }
            }
            if (goToUpOpCode.includes(newCPUOpCode)) {
                if (!goToUpOpCode.includes(CPUOpCode)) {
                    this._program[lineNumber].operand = 15
                }
            }
            if (!goToOpCode.includes(newCPUOpCode)) {
                if (goToOpCode.includes(CPUOpCode)) {
                    this._program[lineNumber].operand = 0
                    this.removeAllChildren(newOperandSelect)
                    for (let _i = 0; _i < 16; _i++) {
                        option(
                            _i.toString(),
                            value(_i.toString())
                        ).applyTo(newOperandSelect)
                    }
                }
            }

            this._program[lineNumber].opCode = newInstruction.opCode
            const newOpCodeSelectIndex = newOpCodeSelect.options.selectedIndex
            applyModifierTo(newOpCodeSelect, selectedIndex(newOpCodeSelectIndex.toString()))

            this.generateBrutSourceCode()
            this.computeLinesOperand()
            this.generateBrutSourceCode()
        }

        if (newInstruction.operand != this._program[lineNumber].operand) {
            this._program[lineNumber].operand = newInstruction.operand
            let newOperandSelectIndex = newOperandSelect.options.selectedIndex
            const lineCPUOpCode = CPUOpCodes[this._program[lineNumber].opCode]

            if (goToUpOpCode.includes(lineCPUOpCode)) {
                newOperandSelectIndex = (this._assemblerOperandLength ** 2 - 1) - newOperandSelectIndex
            }

            applyModifierTo(newOperandSelect, selectedIndex(newOperandSelectIndex.toString()))

            this.generateBrutSourceCode()
            this.computeLinesOperand()
            this.generateBrutSourceCode()
        }
    }

    private updateLine(line: HTMLLIElement) {
        const lineNumber = this.getLineNumber(line)

        const labelValue = this._program[lineNumber].label
        const labelInput = line.getElementsByClassName("label")[0] as HTMLInputElement
        applyModifierTo(labelInput, value(labelValue))

        const opCodeSelectedValue = this._program[lineNumber].opCode
        const opCodeSelect = line.getElementsByClassName("opcode")[0] as HTMLSelectElement
        const opCodeOptions = opCodeSelect.getElementsByClassName("opcodevalue")
        for(let opCodeOption of opCodeOptions) {
            opCodeOption.removeAttribute("selected")
        }
        const opCodeSelectedOption = opCodeOptions[opCodeSelectedValue] as HTMLOptionElement
        applyModifierTo(opCodeSelect, selectedIndex(opCodeSelectedValue.toString()))
        applyModifierTo(opCodeSelectedOption, selected(""))

        const CPUOpCode = CPUOpCodes[opCodeSelectedValue]

        let operandSelectedValue = this._program[lineNumber].operand

        let goToLabel = ""
        if (goToOpCode.includes(CPUOpCode)) {
            if (goToUpOpCode.includes(CPUOpCode)) {
                goToLabel = this._program[lineNumber - operandSelectedValue].label
            } else {
                goToLabel = this._program[lineNumber + operandSelectedValue].label
            }
        }

        if (goToUpOpCode.includes(CPUOpCode)) {
            operandSelectedValue = (this._assemblerOperandLength ** 2 - 1) - operandSelectedValue
        }

        const operandSelect = line.getElementsByClassName("operand")[0] as HTMLSelectElement
        const operandOptions = operandSelect.getElementsByClassName("operandvalue")
        for(let operandOption of operandOptions) {
            operandOption.removeAttribute("selected")
        }
        const operandSelectedOption = operandOptions[operandSelectedValue] as HTMLOptionElement
        applyModifierTo(operandSelect, selectedIndex(operandSelectedValue.toString()))
        applyModifierTo(operandSelectedOption, value(goToLabel))
        applyModifierTo(operandSelectedOption, selected(""))
    }

    private removeLine(line: HTMLLIElement) {
        if (line.parentNode != null && line.parentNode.childElementCount > 1) {
            line.parentNode.removeChild(line)
        }
        this.generateBrutSourceCode()
        this.computeLinesOperand()
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
/*
    public getNodesList(parentElement: HTMLElement, className: string) {
        // We must get nodes from this.editor.root !!!
        return parentElement.getElementsByClassName(className)
    }
*/
    private handleLabelInputChange(line: HTMLLIElement) {
        // => handleLineChanged
    }

    private handleOpCodeSelectChange(line: HTMLLIElement) {
        // => handleLineChanged
    }

    private handleOperandSelectChange(line: HTMLLIElement) {
        // => handleLineChanged
    }

    private handleDragStart(evt: DragEvent, elem: HTMLLIElement) {
        setTimeout(() => elem.classList.add("dragging"), 50)
        //console.log("drag start")


        elem.style.opacity = "0.2"
        this._dragSrcEl = elem
        //console.log(this.programOl, this._dragSrcEl)
        /*
        this.programOl.querySelectorAll(".line").forEach(lineItem => {
            //const line = lineItem as HTMLLIElement
            if (this._dragSrcEl != lineItem) {
                lineItem.classList.add("hint")
            }
        })
        */
        evt.stopPropagation()
    }

    private handleDragEnd(evt: DragEvent, elem: HTMLLIElement) {
        //
        elem.style.opacity = "1"
        //console.log("drag end")
        this.programOl.querySelectorAll(".line").forEach(lineItem => {
            const line = lineItem as HTMLLIElement
            //line.classList.remove("hint")
            line.classList.remove("active")
            line.classList.remove("dragging")
        })
        //evt.stopPropagation()
    }

    private handleDragOver(evt: DragEvent, elem: HTMLLIElement) {
        //evt.stopPropagation()
        //console.log("drag over")
        //elem.classList.add("over")
        evt.preventDefault()
        return false
    }

    private handleDragEnter (evt: DragEvent, elem: HTMLLIElement) {
        //console.log("drag enter")
        //

        elem.classList.add("active")
        //evt.stopPropagation()
    }

    private handleDragLeave (evt: DragEvent, elem: HTMLLIElement) {
        //evt.stopPropagation()
        //console.log("drag leave")
        elem.classList.remove("active")
        //evt.stopPropagation()
    }

    private handleDrop(evt: DragEvent, elem: HTMLLIElement, labelInput: HTMLInputElement) {
        evt.stopPropagation()
        if (elem != this._dragSrcEl) {
            let currentpos = 0, droppedpos = 0;
            this.programOl.querySelectorAll(".line").forEach(lineItem => {
                const line = lineItem as HTMLLIElement
                if (elem == line) {
                    currentpos = elem.value
                } else {
                    droppedpos = line.value
                }
            })
            if (elem.parentNode != null && this._dragSrcEl != null) {
                if (currentpos < droppedpos) {
                    elem.parentNode.insertBefore(this._dragSrcEl, elem.nextSibling);
                } else {
                    elem.parentNode.insertBefore(this._dragSrcEl, elem);
                }
            }
        }

        this.generateBrutSourceCode()
        this.computeLinesOperand()
        this.generateBrutSourceCode()

        return false
    }

    private generateBrutSourceCode() {
        this._program = []
        if (this.programOl.querySelectorAll(".line") != null) {
            const program = this.programOl.querySelectorAll(".line")

            for(let _i = 0; _i < program.length; _i++) {
                const line = program[_i] as HTMLLIElement

                const _label = line.querySelector(".label") as HTMLInputElement
                const _opcode = line.querySelector(".opcode") as HTMLSelectElement
                const _operand = line.querySelector(".operand") as HTMLSelectElement
                const _comment = line.querySelector(".comment") as HTMLInputElement

                const CPUOpCode = CPUOpCodes[_opcode.options.selectedIndex]

                const instruction: Instruction = {
                    label : _label.value,
                    opCode : _opcode.options.selectedIndex,
                    operand : goToUpOpCode.includes(CPUOpCode)? (this._assemblerOperandLength ** 2 - 1) - _operand.options.selectedIndex : _operand.options.selectedIndex,
                    comment : _comment.value
                }

                this._program.push(instruction)
            }
        }
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

        const labelValue = this._program[lineNumber].label
        const labelInput = line.getElementsByClassName("label")[0] as HTMLInputElement

        const opCodeSelectedValue = this._program[lineNumber].opCode
        const opCodeSelect = line.getElementsByClassName("opcode")[0] as HTMLSelectElement
        const CPUOpCode = CPUOpCodes[opCodeSelectedValue]

        let operandSelectedValue = this._program[lineNumber].operand
        const operandSelect = line.getElementsByClassName("operand")[0] as HTMLSelectElement


        applyModifierTo(operandSelect, style("visibility: visible"))
        if (goToOpCode.includes(CPUOpCode)) {
            let selectedGoToLabel = ""
            if (operandSelect.selectedOptions.length == 1) {
                selectedGoToLabel = operandSelect.selectedOptions[0].value
            }
            this.removeAllChildren(operandSelect)
            if (goToUpOpCode.includes(CPUOpCode)) {
                if (selectedGoToLabel == "") {
                    for (let _i = this._assemblerOperandLength ** 2 - 1; _i > -1; _i--) {
                        if (lineNumber - _i >= 0) {
                            if (this._program[lineNumber - _i].label != "") {
                                selectedGoToLabel = this._program[lineNumber - _i].label
                            }
                        }
                    }
                }
                for (let _i = this._assemblerOperandLength ** 2 - 1; _i > -1; _i--) {
                    if (lineNumber - _i >= 0) {
                        if (this._program[lineNumber - _i].label == "") {
                            const operandvalue = "label " + (lineNumber - _i).toString()
                            option(
                                cls("operandvalue"),
                                operandvalue,
                                value(operandvalue),
                                disabled
                            ).applyTo(operandSelect)
                        } else {
                            const accessibleLabelValue = this._program[lineNumber - _i].label
                            option(
                                cls("operandvalue"),
                                accessibleLabelValue,
                                value(accessibleLabelValue),
                                (accessibleLabelValue == selectedGoToLabel) ? selected("") : "",
                            ).applyTo(operandSelect)
                        }
                    } else {
                        option(
                            cls("operandvalue"),
                            hidden
                        ).applyTo(operandSelect)
                    }
                }
            } else {
                for (let _i = 0; _i < this._assemblerOperandLength ** 2; _i++) {
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
                            const accessibleLabelValue = this._program[lineNumber + _i].label
                            option(
                                cls("operandvalue"),
                                accessibleLabelValue,
                                value(accessibleLabelValue),
                                (accessibleLabelValue == selectedGoToLabel) ? selected("") : "",
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
            const hiddenOptions = operandSelect.querySelectorAll('[hidden = "hidden"]').length
            const disabledOptions = operandSelect.querySelectorAll('[disabled = "true"]').length
            if (16 - hiddenOptions - disabledOptions == 0 || operandSelect.selectedIndex == 0) {
                applyModifierTo(operandSelect, style("background-color : #f7d5d5"))
                console.log("*")
            } else {
                applyModifierTo(operandSelect,style("background-color : #ffffff"))
            }
        } else {
            if (noOperandOpCode.includes(CPUOpCode)) {
                applyModifierTo(operandSelect, style("visibility: hidden"))
            }
        }
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
