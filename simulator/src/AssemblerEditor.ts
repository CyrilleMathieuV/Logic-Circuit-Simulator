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
import { EditorSelection } from "./UIEventManager"
import {CPUBase, CPUOpCode, CPUOpCodes} from "./components/CPU"
import {IconName, inlineIconSvgFor} from "./images"
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
    id, applyModifiersTo, input, applyModifierTo, selected, disabled, hidden, maxlength,
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

//export type InstructionKey = Strings["Label"]["OpCode"]["Operand"]

type HtmlSection = {
    control: HTMLDivElement
    header: HTMLDivElement
    lines: HTMLOListElement
}

type Instruction = {
    labelName: string
    opCode: number
    operand: number
}

const goToOpCode = ["GDW", "GUP", "JIZ", "JIC"] as string[]
const goToUpOpCode = ["GUP"] as string[]
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

    private _addressBusNumBits = 8

    private _opcodes : typeof CPUOpCodes

    private _program : Instruction[]
    private _lineLabels : string[]

    private _ROMRAMsList : Component[]

    public constructor(editor: LogicEditor) {
        this.editor = editor

        window.addEventListener("mouseup",  this.editor.wrapHandler((handler) => {
            this.getRAMROMList()
        }))

        this._ROMRAMsList = []

        this._opcodes = CPUOpCodes
        this._program = []
        this._lineLabels = []

        this.controlDivRAMROMSelect = select().render()
        option("none", value("none"), disabled).applyTo(this.controlDivRAMROMSelect)
        this.controlDivRAMROMSelect.addEventListener('change', this.editor.wrapHandler((handler) => {
            applyModifierTo(this.controlDivRAMROMSelect.options[this.controlDivRAMROMSelect.options.selectedIndex], selected)
            //this.handleRAMROMSelect(this.controlDivRAMROMSelect.value)
            //this.generateBrutSourceCode()
        }))
        this.controlDivRAMROMSelect.addEventListener('mouseup', this.editor.wrapHandler((handler) => {
            applyModifierTo(this.controlDivRAMROMSelect.options[this.controlDivRAMROMSelect.options.selectedIndex], selected)
            //this.handleRAMROMSelect(this.controlDivRAMROMSelect.value)
            //this.generateBrutSourceCode()
        }))
        this.controlDivRAMROMSelect.addEventListener('changeSelected', this.editor.wrapHandler((handler) => {
            applyModifierTo(this.controlDivRAMROMSelect.options[this.controlDivRAMROMSelect.options.selectedIndex], selected)
            //console.log(linecodeLi.value)
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

        this.programOl = ol(cls(""), id("instructionList"),style("position: absolute; left: 0; top: 0px; width: 370px;")).render()
        this.programDiv = div(cls("program"), style("position: relative; top: 60px; width: 390px; left:0; padding: 3px 5px; display: block; align-items: stretch;"), this.programOl).render()

        this.mainDiv = div(cls("assembler"), style("flex:none; position: absolute;"), this.controlDiv, this.headerDiv, this.programDiv).render()

        editor.html.assemblerEditor.insertAdjacentElement("afterbegin", this.mainDiv)

        this._dragSrcEl = this.editor.root.getElementById("instructionList") as HTMLLIElement

        this.addLine()

        // Very important to get events ?
        // this.setListener()

    }

    private getRAMROMList() {
        if (this.controlDivRAMROMSelect != null) {
            this.removeAllChildren(this.controlDivRAMROMSelect)
        }
        this._ROMRAMsList = [...this.editor.components.all()].filter((comp) => comp instanceof RAM || comp instanceof ROM)
        if (this._ROMRAMsList != undefined) {
            for (let romram of this._ROMRAMsList) {
                if (romram.ref != undefined) {
                    option("none", value("none"), disabled).applyTo(this.controlDivRAMROMSelect)
                    //We only want 8 data bits memories
                    if (romram.value.mem[0].length == 8) {
                        option(romram.ref, value(romram.ref)).applyTo(this.controlDivRAMROMSelect)
                    }
                }
            }
        }
    }

    private downloadFromMemRAMROM(SelectedRAMROMRef: string): Instruction[] {
        let programMem: string[] = []
        if (this._ROMRAMsList != undefined) {
            const SelectedRAMROM = this._ROMRAMsList.find((comp) => comp.ref == SelectedRAMROMRef)
            if (SelectedRAMROM != undefined) {
                programMem = this.contentRepr(SelectedRAMROM.value.mem)
            }
        }

        let program: Instruction[] = []
        for (let codelineMem of programMem) {
            const labelNameMem: string = ""
            const opCodeMem = parseInt(codelineMem.slice(0, 4), 2)
            const operandMem = parseInt(codelineMem.slice(4, 8), 2)
            program.push({
                labelName : labelNameMem,
                opCode: opCodeMem,
                operand: operandMem
            })
        }
        console.log(program)
        for (let _i = 0; _i < program.length; _i++) {
            let instruction = program[_i]
            if ((goToOpCode.includes(CPUOpCodes[instruction.opCode]))) {
                if(goToUpOpCode.includes(CPUOpCodes[instruction.opCode])) {
                    let labelLineNumber = (_i + 1) - instruction.operand
                    if (labelLineNumber < 1) {
                        labelLineNumber += program.length
                    }
                    program[labelLineNumber - 1].labelName = "line " + labelLineNumber.toString()
                } else {
                    let labelLineNumber = (_i + 1) + instruction.operand
                    if (labelLineNumber > program.length) {
                        labelLineNumber += - program.length
                    }
                    program[labelLineNumber - 1].labelName = "line " + labelLineNumber.toString()
                }
            }
        }
        console.log(program)
        this.reDrawProgram(program)
        return program
    }

    private reDrawProgram(program: Instruction[]) {
        this.removeAllChildren(this.programOl)
        for (let _i = 0; _i < program.length; _i++) {
            this.addLine(undefined, undefined)
        }
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
                console.log(this._program.length)
                if (memSize >= this._program.length) {
                    let linecodeStringArray = []
                    for (let linecode of this._program) {
                        const linecodeString = this.createBinaryString(linecode.opCode, 4) + this.createBinaryString(linecode.operand, 4)
                        linecodeStringArray.push(linecodeString)
                    }
                    const emptylinecodeString = "00000000"
                    for (let _i = this._program.length - memSize; _i > 0; _i--) {
                        linecodeStringArray.push(emptylinecodeString)
                    }
                    const programString = linecodeStringArray.join(" ")
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
            console.log(wordRepr)
            cells.push(wordRepr)
        }
        return cells
    }

    private addLine(previousLinecodeLi?: HTMLLIElement, aboveCurrentLinecode?: boolean) {
        if (this._program.length < 2 ** this._addressBusNumBits ) {
            const line = this.makeLine()
            const lineNumber = this.getLineNumber(previousLinecodeLi)

            if (lineNumber < 0) {
                this.programOl.appendChild(line)
            } else {
                if (aboveCurrentLinecode != undefined) {
                    if (aboveCurrentLinecode) {
                        this.programOl.insertBefore(line, this.programOl.childNodes[lineNumber])
                    } else {
                        if (this.programOl.childNodes[lineNumber].nextSibling != null) {
                            this.programOl.insertBefore(line, this.programOl.childNodes[lineNumber])
                        } else {
                            this.programOl.appendChild(line)
                        }
                    }
                }

            }
            this.generateBrutSourceCode()
        }
    }

    private makeLine(): HTMLLIElement {
        const labelInput = input(
            cls("label"),
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
        const operandDiv = div(
            //id(`operand${lineNumber.toString()}`),
            cls("operandDiv"),
            operandSelect
        ).render()

        const deleteButton = button(
            i(cls("svgicon"),
                raw(inlineIconSvgFor("trash"))),
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

        const linecodeDiv = div(
            cls("linecodeDiv"),
            //draggable,
            //id(`grid${lineNumber.toString()}`),
            labelInputDiv,
            opCodeDiv,
            operandDiv,
            deleteButton,
            addAboveButton,
            addBelowButton
        ).render()

        const linecodeLi = li(
            cls("linecode"),
            style("color: #ffffff;"),
            draggable,
            linecodeDiv
        ).render()

        deleteButton.addEventListener('click', this.editor.wrapHandler((handler) => {
            this.removeLine(linecodeLi)
        }))

        addAboveButton.addEventListener('click', this.editor.wrapHandler((handler) => {
            this.addLine(linecodeLi, true)
        }))

        addBelowButton.addEventListener('click', this.editor.wrapHandler((handler) => {
            this.addLine(linecodeLi, false)
        }))

        labelInput.addEventListener('input', this.editor.wrapHandler((handler) => {
            this.handleLabelInputChange(linecodeLi, labelInput)
        }))

        opCodeSelect.addEventListener('change', this.editor.wrapHandler((handler) => {
            applyModifierTo(opCodeSelect.options[opCodeSelect.options.selectedIndex], selected)
            this.computeLineOperand(opCodeSelect.value, linecodeLi, operandSelect)
            this.generateBrutSourceCode()
        }))

        opCodeSelect.addEventListener('changeSelected', this.editor.wrapHandler((handler) => {
            applyModifierTo(opCodeSelect.options[opCodeSelect.options.selectedIndex], selected)
            this.computeLineOperand(opCodeSelect.value, linecodeLi, operandSelect)
            this.generateBrutSourceCode()
        }))

        operandSelect.addEventListener('change', this.editor.wrapHandler((handler) => {
            applyModifierTo(operandSelect.options[operandSelect.options.selectedIndex], selected)
            this.generateBrutSourceCode()
        }))

        operandSelect.addEventListener('changeSelected', this.editor.wrapHandler((handler) => {
            applyModifierTo(operandSelect.options[operandSelect.options.selectedIndex], selected)
            //console.log("You selected: ", operandSelect.value)
            this.generateBrutSourceCode()
            //selectOperand.value
        }))

        linecodeLi.addEventListener("click", this.editor.wrapHandler((handler) => {
            applyModifierTo(linecodeLi, selected)
            // TO DO FOR INSERTING ?
        }))
        linecodeLi.addEventListener("dragstart", this.editor.wrapHandler((handler) => {
            this.handleDragStart(handler, linecodeLi)
            //console.log("s",this._dragSrcEl)
        }))
        linecodeLi.addEventListener("dragend", this.editor.wrapHandler((handler) => {
            this.handleDragEnd(handler, linecodeLi)
        }))
        linecodeLi.addEventListener("dragover", this.editor.wrapHandler((handler) => {
            this.handleDragOver(handler)
        }))
        linecodeLi.addEventListener("dragenter", this.editor.wrapHandler((handler) => {
            this.handleDragEnter(handler, linecodeLi)
        }))
        linecodeLi.addEventListener("dragleave", this.editor.wrapHandler((handler) => {
            this.handleDragLeave(handler, linecodeLi)
        }))
        linecodeLi.addEventListener("drop", this.editor.wrapHandler((handler) => {
            this.handleDrop(handler, linecodeLi, labelInput)
        }))

        return linecodeLi
    }

    private updateLine() {
        let labelNameValue: string = ""
        let opCodeValue = 0
        let operandValue = 0

        if (program != null) {
            console.log(lineNumber)
            labelNameValue = program[lineNumber + 1].labelName
            opCodeValue = program[lineNumber + 1].opCode
            operandValue = program[lineNumber + 1].operand
        }
    }

    private removeLine(line: HTMLLIElement) {
        if (line.parentNode != null) {
            line.parentNode.removeChild(line)
        }
        this.generateBrutSourceCode()
    }

    private getLineNumber(previousLinecodeLi: HTMLLIElement | undefined) {
        let lineNumber = -1
        if (previousLinecodeLi != undefined) {
            lineNumber = this.getLineCodeNumber(previousLinecodeLi)
        }
        return lineNumber
    }




    public getNodesList(selector: string) : NodeListOf<HTMLElement> {
        // We must get nodes from this.editor.root !!!
        const nodeList = this.editor.root.querySelectorAll(selector) as NodeListOf<HTMLElement>
        return nodeList
    }

    private handleLabelInputChange(linecodeLi: HTMLLIElement, labelInput: HTMLInputElement) {
        let labelInputValue = labelInput.value

        if (labelInputValue == "") {
            this._lineLabels[this.getLineCodeNumber(linecodeLi)] = this.getLineCodeNumber(linecodeLi).toString()
        } else {
            if (this._lineLabels.includes(labelInputValue)) {
                applyModifierTo(labelInput, style("color: #ff0000;"))
            } else {
                applyModifierTo(labelInput, style("color: #000000;"))
            }
        }
        applyModifierTo(labelInput, value(labelInputValue))
        this.generateBrutSourceCode()
        this.updateSelectOptionsForAddresses()
    }

    private handleDragStart(evt: DragEvent, elem: HTMLLIElement) {
        //setTimeout(() => elem.classList.add("dragging"), 0)
        elem.style.opacity = "0.4"
        this._dragSrcEl = elem
        this.getNodesList(".linecode").forEach(item => {
            if (this._dragSrcEl != item) {
                item.classList.add('hint')
            }
        })
    }

    private handleDragEnd(evt: DragEvent, elem: HTMLLIElement) {
        elem.style.opacity = "1"
        this.getNodesList(".linecode").forEach(item => {
            item.classList.remove("hint")
            item.classList.remove("active")
        })
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
            this.getNodesList(".linecode").forEach(item => {
                let itemasli = item as HTMLLIElement
                if (elem == item) {
                    currentpos = elem.value
                } else {
                    droppedpos = itemasli.value;
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
        this.updateSelectOptionsForAddresses()
        return false
    }

    private generateBrutSourceCode() {
        this._program = []
        this._lineLabels = []
        if (this.getNodesList(".linecode") != null) {
            this.getNodesList(".linecode").forEach(item => {
                const itemLine = item as HTMLLIElement

                const _label = itemLine.querySelector(".label") as HTMLInputElement
                const _opcode = itemLine.querySelector(".opcode") as HTMLSelectElement
                const _operand = itemLine.querySelector(".operand") as HTMLSelectElement

                const sourceCodeLine: Instruction = {
                    labelName : (_label.value != "")? _label.value : (this._program.length + 1).toString(),
                    opCode : _opcode.options.selectedIndex,
                    operand :_operand.options.selectedIndex
                }
                this._program.push(sourceCodeLine)

                if (sourceCodeLine.labelName != undefined) {
                    this._lineLabels[this._program.length] = sourceCodeLine.labelName
                }
            })
        }
        //console.log(this._lineLabels)
        //sourceCodeLines.label.push(this.createBinaryString(_opcode.options.selectedIndex, 4) + this.createBinaryString(_operand.options.selectedIndex,4))
        //.log(this._lineLabels)
    }

    private updateSelectOptionsForAddresses() {
        if (this.getNodesList(".linecode") != null) {
            this.getNodesList(".linecode").forEach(item => {
                if (item != null) {
                    const itemLine = item as HTMLLIElement

                    const _label = itemLine.querySelector(".label") as HTMLInputElement
                    const _opcode = itemLine.querySelector(".opcode") as HTMLSelectElement
                    const _operand = itemLine.querySelector(".operand") as HTMLSelectElement

                    const opcode = this._opcodes[_opcode.options.selectedIndex]

                    this.computeLineOperand(opcode, itemLine, _operand)
                }
            })
        }
    }

    private removeAllChildren(parent: HTMLElement) {
        if (parent.firstChild != null) {
            while (parent.firstChild && parent.lastChild != null) {
                parent.removeChild(parent.lastChild);
            }
        }
    }

    private getLineCodeNumber(linecodeLi: HTMLLIElement) {
        let lineNumber = -1
        if (linecodeLi != null) {
            if (linecodeLi.parentElement != null) {
                // The only way to get the index of the current line
                lineNumber = [...linecodeLi.parentElement.children].indexOf(linecodeLi)
            }
        }
        return lineNumber
    }

    private computeLineOperand(opCode: string, linecodeLi: HTMLLIElement, operandSelect: HTMLSelectElement) {
        const lineNumber = this.getLineCodeNumber(linecodeLi)
        //console.log(lineNumber)
        // We must remove options list of select
        if (operandSelect != null) {
            applyModifierTo(operandSelect, style("visibility: visible"))
            this.removeAllChildren(operandSelect)
        }

        if ((goToOpCode.includes(opCode))) {
            if(goToUpOpCode.includes(opCode)) {
                for (let _i = ((lineNumber < 15)? lineNumber : 15); _i > -1 ; _i--) {
                    if (this._lineLabels[lineNumber - _i + 1] == (lineNumber - _i + 1).toString()) {
                        option(
                            //cls(`.operandvalue${lineNumber.toString()}`),
                            "label " + (lineNumber - _i + 1).toString(),
                            value((lineNumber - _i + 1).toString()),
                            disabled,
                        ).applyTo(operandSelect)
                    } else {
                        const labelText = this._lineLabels[lineNumber - _i + 1]
                        option(cls("operandvalue"), labelText, value(labelText)).applyTo(operandSelect)
                    }
                }
            }
            else {
                for (let _i = 0; _i < (((this._program.length  - lineNumber) < 16)? this._program.length - lineNumber : 16); _i++) {
                    if (this._lineLabels[_i + 1 + lineNumber] == (_i + 1 + lineNumber).toString()) {
                        option(
                            //cls(`.operandvalue${lineNumber.toString()}`),
                            "label " + (lineNumber + _i + 1).toString(),
                            value((lineNumber - _i + 1).toString()),
                            disabled,
                        ).applyTo(operandSelect)
                    } else {
                        const labelText = this._lineLabels[_i + 1 + lineNumber]
                        option(cls("operandvalue"), labelText, value(labelText)).applyTo(operandSelect)
                    }
                }
            }
        } else {
            if (!noOperandOpCode.includes(opCode)) {
                for (let _i = 0; _i < 16; _i++) {
                    option(
                        //cls(`.operandvalue${lineNumber.toString()}`),
                        _i.toString(),
                        value(_i.toString())
                    ).applyTo(operandSelect)
                }
            } else {
                option(
                    //cls(`.operandvalue${lineNumber.toString()}`),
                    "0",
                    value("0"),
                    disabled,
                    hidden,
                ).applyTo(operandSelect)
                applyModifierTo(operandSelect, style("visibility: hidden"))
            }
        }
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
