import { LogicEditor, MouseAction } from "./LogicEditor"
import { InteractionResult, setActive, TimeoutHandle } from "./utils"
import { Instance as PopperInstance } from "@popperjs/core/lib/types"
import { EditorSelection } from "./UIEventManager"
import { CPUOpCode, CPUOpCodes } from "./components/CPU"
import {Drawable} from "./components/Drawable"
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
    id, applyModifiersTo, input, applyModifierTo, selected,
} from "./htmlgen"
import {ComponentList} from "./ComponentList"

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
// https://stackoverflow.com/questions/9939760/how-do-i-convert-an-integer-to-binary-in-javascript
// https://stackoverflow.com/questions/9939760/how-do-i-convert-an-integer-to-binary-in-javascript

//export type InstructionKey = Strings["Label"]["OpCode"]["Operand"]

type HtmlSection = {
    header: HTMLDivElement
    lines: HTMLUListElement[]
    control: HTMLDivElement
}

type Instruction = {
    label: string
    opCode: string
    operand: string
}

export class AssemblerEditor {
    public editor: LogicEditor
    //public readonly _program: HTMLUListElement
    //public readonly _htmlLine: HTMLElement[]

    public readonly instructions : Instruction[]

    //private readonly root: HTMLDivElement
    private readonly program: HTMLOListElement
    //private readonly addInstructionButton: HTMLButtonElement

    private _dragSrcEl : HTMLLIElement | null = null
    private _addLineButton : HTMLButtonElement
    private _sourceCodeDiv : HTMLDivElement

    public constructor(editor: LogicEditor) {
        this.editor = editor
        /*
                for (const section of componentsMenu) {
                    const { allButtons, buttonsShowWithMore, buttonsShowWithURLParam } =
                        makeButtons(section, showOnlyBuf)
                    const htmlSection = this.makeSection(section.nameKey, allButtons, buttonsShowWithMore, buttonsShowWithURLParam, showOnlyBuf, lastSectionNonEmpty)
                    if (htmlSection !== undefined) {
                        this._htmlSections.push(htmlSection)
                        lastSectionNonEmpty = true
                    }
                }

         */



        this.instructions = []
        //this.addInstructionButton = button()
        this._dragSrcEl = this.editor.root.getElementById("instructionList") as HTMLLIElement

        this.program = ol(cls("program"),id("instructionList")).render()
        //this.root = div(cls("assembler"),style("flex:none width: 300px padding: 3px 5px display: flex"), this.program).render()
        editor.html.assemblerEditor.insertAdjacentElement("afterbegin", this.program)
        this._sourceCodeDiv = div(cls("sourceCode")).render()
        editor.html.assemblerEditor.appendChild(this._sourceCodeDiv)
        this._addLineButton = button(i(cls("svgicon"), raw(inlineIconSvgFor("add"))),).render()
        this._addLineButton.addEventListener("click", this.editor.wrapHandler((handler) => {
            this.addInstruction()
        }))
        editor.html.assemblerEditor.appendChild(this._addLineButton)
        // Very important to get events
        this.addInstruction()
        //this.initiateLineContent()
        //this.setListener()
        this.generateSourceCode()
    }

    public setActiveLines(selector: string) {
        this.getLinesList(selector).forEach(item  => {
            setActive(item, true)
        })
    }

    private initiateInstructionsList() {

    }

    private deleteInstruction(line: HTMLLIElement) {
        if (line.parentNode != null) {
            line.parentNode.removeChild(line)
        }
        this.generateSourceCode()
    }

    private addInstruction() {
        const opCodes = CPUOpCodes

        const labelInput = input(
            cls("label"),
            //id(`label${lineNumber.toString()}`)
        ).render()
        const labelInputDiv = div(
            cls("labelDiv"),
            //id(`divLabelInput${lineNumber.toString()}`),
            labelInput
        ).render()

        const opCodeSelect = select(
            //id(`opcodes${lineNumber.toString()}`)
            cls("opcode"),
        ).render()
        for (let opCode of opCodes) {
            option(opCode, value(opCode)).applyTo(opCodeSelect)
        }
        const opCodeDiv = div(
            //id(`opcode${lineNumber.toString()}`),
            cls("opCodeDiv"),
            opCodeSelect
        ).render()

        const operandSelect = select(
            cls("operand"),
            //id(`operands${lineNumber.toString()}`)
        ).render()
        for (let i = 0; i < 16; i++) {
            option(i.toString(), value(i.toString())).applyTo(operandSelect)
        }
        const operandDiv = div(
            //id(`operand${lineNumber.toString()}`),
            cls("operandDiv"),
            operandSelect
        ).render()

        const deleteButton = button(
                i(cls("svgicon"),
                    raw(inlineIconSvgFor("trash"))),
            ).render()

        const lineDiv = div(
            cls("grid-container"),
            //draggable,
            //id(`grid${lineNumber.toString()}`),
            labelInputDiv,
            opCodeDiv,
            operandDiv,
            deleteButton,
        ).render()

        const line = li(
            cls("linecode"),
            draggable,
            //id(`line${lineNumber.toString()}`),
            lineDiv
        ).render()

        deleteButton.addEventListener('click', this.editor.wrapHandler((handler) => {
            this.deleteInstruction(line)
        }))

        labelInput.addEventListener('input', this.editor.wrapHandler((handler) => {
            localStorage.setItem(`opcodes${line.value.toString()}`, labelInput.value)
            const labelValue = localStorage.getItem(`opcodes${line.value.toString()}`)
            applyModifierTo(labelInput, value(labelValue))
            //const labelValue = localStorage.getItem(labelInput.id)
            //console.log(labelValue)
        }))
        /*
        labelInput.addEventListener('dragend', this.editor.wrapHandler((handler) => {
            const labelValue = localStorage.getItem(labelInput.id)
            console.log(labelValue)
            //labelInput.setAttribute("innerText", (labelValue != null)? labelValue : "")
            applyModifierTo(labelInput, value(labelValue))
        }))
        */
        opCodeSelect.addEventListener('change', this.editor.wrapHandler((handler) => {
            applyModifierTo(opCodeSelect.options[opCodeSelect.options.selectedIndex], selected)
            this.generateSourceCode()
        }))

        opCodeSelect.addEventListener('changeSelected', this.editor.wrapHandler((handler) => {
            applyModifierTo(opCodeSelect.options[opCodeSelect.options.selectedIndex], selected)
            this.generateSourceCode()
            //console.log("You selected: ", selectOpCode.value)
            //selectOpCode.value
        }))

        operandSelect.addEventListener('change', this.editor.wrapHandler((handler) => {
            applyModifierTo(operandSelect.options[operandSelect.options.selectedIndex], selected)
            this.generateSourceCode()
        }))

        operandSelect.addEventListener('changeSelected', this.editor.wrapHandler((handler) => {
            applyModifierTo(operandSelect.options[operandSelect.options.selectedIndex], selected)
            console.log("You selected: ", operandSelect.value)
            this.generateSourceCode()
            //selectOperand.value
        }))

        line.addEventListener("dragstart", this.editor.wrapHandler((handler) => {
            this.handleDragStart(handler, line)
            //console.log("s",this._dragSrcEl)
        }))
        line.addEventListener("dragend", this.editor.wrapHandler((handler) => {
            this.handleDragEnd(handler, line)
        }))
        line.addEventListener("dragover", this.editor.wrapHandler((handler) => {
            this.handleDragOver(handler)
        }))
        line.addEventListener("dragenter", this.editor.wrapHandler((handler) => {
            this.handleDragEnter(handler, line)
        }))
        line.addEventListener("dragleave", this.editor.wrapHandler((handler) => {
            this.handleDragLeave(handler, line)
        }))
        line.addEventListener("drop", this.editor.wrapHandler((handler) => {
            this.handleDrop(handler, line, labelInput)
        }))
        this.generateSourceCode()
        this.program.appendChild(line)
    }

    public getLinesList(selector: string) {
        // We must get nodes from this.editor.root !!!
        const lineList = this.editor.root.querySelectorAll(selector) as NodeListOf<HTMLElement>
        return lineList
    }

    private handleDragStart(evt: DragEvent, elem: HTMLLIElement) {
        elem.style.opacity = "0.4"
        this._dragSrcEl = elem
        /*
        if (evt.dataTransfer !== null) {
            evt.dataTransfer.effectAllowed = 'move'
            evt.dataTransfer.setData('text/html', elem.innerHTML)
        }
        */
        this.getLinesList(".linecode").forEach(item => {
            if (this._dragSrcEl != item) {
                item.classList.add('hint')
            }
        })
    }

    private handleDragEnd(evt: DragEvent, elem: HTMLLIElement) {
        elem.style.opacity = "1"
        //applyModifierTo(labelInput, value(labelValue))

        this.getLinesList(".linecode").forEach(item => {
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
            this.getLinesList(".linecode").forEach(item => {
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
        this.generateSourceCode()
        return false
    }

    private generateSourceCode() {
        let sourceCodeLines : string[] = []
        this.getLinesList(".linecode").forEach(item => {
            const _opcode = item.querySelector(".opcode") as HTMLSelectElement
            const _operand = item.querySelector(".operand") as HTMLSelectElement
            sourceCodeLines.push(this.createBinaryString(_opcode.options.selectedIndex >>> 0, 4) + this.createBinaryString(_operand.options.selectedIndex >>> 0,4))
        })
        const sourceCode = sourceCodeLines.join(" ")
        this._sourceCodeDiv.innerText = sourceCode
        console.log(sourceCode)
    }

    public  createBinaryString (nMask: number, nBit: number) {
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
