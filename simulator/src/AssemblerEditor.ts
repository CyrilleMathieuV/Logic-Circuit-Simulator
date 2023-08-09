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
    id, applyModifiersTo, input, applyModifierTo, selected, disabled, hidden
} from "./htmlgen"
import {ComponentList} from "./ComponentList"
import {Node} from "./components/Node";

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
// https://stackoverflow.com/questions/3955229/remove-all-child-elements-of-a-dom-node-in-javascript
// https://stackoverflow.com/questions/8801787/get-index-of-clicked-element-using-pure-javascript
// https://developer.mozilla.org/fr/docs/Web/API/Node/insertBefore

//export type InstructionKey = Strings["Label"]["OpCode"]["Operand"]

type HtmlSection = {
    control: HTMLDivElement
    header: HTMLDivElement
    lines: HTMLOListElement
}

type Instruction = {
    labelName: string
    opCode: string
    operand: string
}

type IsNever<T> = [T] extends [never] ? true : false

type IsAValue<Obj, Str extends string> = IsNever<{
    [Prop in keyof Obj]: Str extends Obj[Prop] ? Str : never
}[keyof Obj]> extends false ? true : false

const goToOpCode = ["GDW", "GUP", "JIZ", "JIC"] as string[]
const goToUpOpCode = ["GUP"] as string[]
const noOperantOpCode = ["NOP", "DEC", "HLT"] as string[]

export class AssemblerEditor {
    public editor: LogicEditor
    //public readonly _program: HTMLUListElement
    //public readonly _htmlLine: HTMLElement[]


    private readonly mainDiv: HTMLDivElement
    private readonly controlDiv: HTMLDivElement
    private readonly headerDiv: HTMLDivElement
    private readonly programDiv: HTMLDivElement
    private readonly programOl: HTMLOListElement
    //private readonly addInstructionButton: HTMLButtonElement

    private _dragSrcEl : HTMLLIElement | null = null
    //private _addLineButton : HTMLButtonElement
    //private sourceCodeDiv : HTMLDivElement

    private _opcodes : typeof CPUOpCodes

    private _program : Instruction[]
    private _lineLabels : string[]

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


        this._opcodes = CPUOpCodes
        this._program = []
        this._lineLabels = []
        //this._program = []
        //this.addInstructionButton = button()



        this.programOl = ol(cls(""), id("instructionList")).render()

        this.headerDiv = div(cls("header"), style("position: absolute; left: 0; width: 100%; height: 30px; padding: 3px 5px; display: block; align-items: stretch;")).render()
        this.controlDiv = div(cls("control"), style("position: absolute; left: 0; top: 30px; width: 100%; width: 300px; height: 30px; padding: 3px 5px; display: block; align-items: stretch;")).render()
        this.programDiv = div(cls("program"), style("position: relative; top: 60px; width: 80%; left:0; padding: 3px 5px; display: block; align-items: stretch;"), this.programOl).render()

        this.mainDiv = div(cls("assembler"), style("flex:none; position: absolute;"), this.headerDiv, this.controlDiv, this.programDiv).render()


        editor.html.assemblerEditor.insertAdjacentElement("afterbegin", this.mainDiv)

        this._dragSrcEl = this.editor.root.getElementById("instructionList") as HTMLLIElement

        //this._addLineButton = button(i(cls("svgicon"), raw(inlineIconSvgFor("add"))),).render()
        //this._addLineButton.addEventListener("click", this.editor.wrapHandler((handler) => {
        //    this.addInstruction()
        //}))
        //editor.html.assemblerEditor.appendChild(this._addLineButton)

        //this._addLineButton = button(i(cls("svgicon"), raw(inlineIconSvgFor("add"))),).render()
        //this._addLineButton.addEventListener("click", this.editor.wrapHandler((handler) => {
        //    this.addInstruction()
        //}))
        //editor.html.assemblerEditor.appendChild(this._addLineButton)
        // Very important to get events
        this.addInstruction()
        //this.initiateLineContent()
        // Very important to get events
        //this.setListener()
        //this.generateSourceCode()
    }

    public setActiveLines(selector: string) {
        this.getNodesList(selector).forEach(item  => {
            setActive(item, true)
        })
    }

    private removeInstruction(linecodeLi: HTMLLIElement) {
        if (linecodeLi.parentNode != null) {
            linecodeLi.parentNode.removeChild(linecodeLi)
        }
        this.generateBrutSourceCode()
    }

    private addInstruction(previousLinecodeLi?: HTMLLIElement, aboveCurrentLinecode?: boolean) {
        let lineNumber = -1
        if (previousLinecodeLi != undefined) {
            lineNumber = this.getLineCodeNumber(previousLinecodeLi)
        }

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
        for (let opCode of this._opcodes) {
            option(cls("opcodevalue"), opCode, value(opCode)).applyTo(opCodeSelect)
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
        /*
        for (let _i = 0; _i < 16; _i++) {
            option(
                //cls(`operandvalue${lineNumber}`),
                _i.toString(),
                value(_i.toString())
            ).applyTo(operandSelect)
        }
        */
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
            //value(lineNumber),
            draggable,
            //id(`line${lineNumber.toString()}`),
            linecodeDiv
        ).render()

        this.computeOperand("NOP", linecodeLi, operandSelect)

        deleteButton.addEventListener('click', this.editor.wrapHandler((handler) => {
            this.removeInstruction(linecodeLi)
        }))

        addAboveButton.addEventListener('click', this.editor.wrapHandler((handler) => {
            this.addInstruction(linecodeLi, true)
        }))

        addBelowButton.addEventListener('click', this.editor.wrapHandler((handler) => {
            this.addInstruction(linecodeLi, false)
        }))

        labelInput.addEventListener('input', this.editor.wrapHandler((handler) => {
            //localStorage.setItem(`opcodes${this.getLineCodeNumber(linecodeLi).toString()}`, labelInput.value)
            //const labelValue = localStorage.getItem(`opcodes${this.getLineCodeNumber(linecodeLi).toString()}`)
            this.handleLabelInputChange(linecodeLi, labelInput)
            //applyModifierTo(labelInput, value(labelInput.value))
            //this.generateBrutSourceCode()
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
            this.computeOperand(opCodeSelect.value, linecodeLi, operandSelect)
            this.generateBrutSourceCode()
        }))

        opCodeSelect.addEventListener('changeSelected', this.editor.wrapHandler((handler) => {
            applyModifierTo(opCodeSelect.options[opCodeSelect.options.selectedIndex], selected)
            //console.log(linecodeLi.value)
            this.computeOperand(opCodeSelect.value, linecodeLi, operandSelect)
            this.generateBrutSourceCode()
            //console.log("You selected: ", selectOpCode.value)
            //selectOpCode.value
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

        if (lineNumber < 0) {
            this.programOl.appendChild(linecodeLi)
        } else {
            if (aboveCurrentLinecode != undefined) {
                if (aboveCurrentLinecode) {
                    this.programOl.insertBefore(linecodeLi, this.programOl.childNodes[lineNumber])
                } else {
                    if (this.programOl.nextSibling != null) {
                        this.programOl.nextSibling.insertBefore(linecodeLi, this.programOl.childNodes[lineNumber])
                    } else {
                        this.programOl.appendChild(linecodeLi)
                    }
                }
            }

        }
        this.generateBrutSourceCode()
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
            if (labelInputValue.length > 13) {
                labelInputValue.slice(0, 11)
            }
            if (this._lineLabels.includes(labelInputValue)) {
                applyModifierTo(labelInput, style("color: #ff0000;"))
            } else {
                applyModifierTo(labelInput, style("color: #000000;"))
            }
        }
        applyModifierTo(labelInput, value(labelInputValue))
        this.generateBrutSourceCode()
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
        this.getNodesList(".linecode").forEach(item => {
            if (this._dragSrcEl != item) {
                item.classList.add('hint')
            }
        })
    }

    private handleDragEnd(evt: DragEvent, elem: HTMLLIElement) {
        elem.style.opacity = "1"
        //applyModifierTo(labelInput, value(labelValue))

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

                const sourceCodeLine: Instruction  = {
                    labelName : (_label.value != "")? _label.value : (this._program.length + 1).toString(),
                    opCode : this._opcodes[_opcode.options.selectedIndex],
                    operand :_operand.options.selectedIndex.toString()
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
        this.getNodesList(".linecode").forEach(item => {
            const itemLine = item as HTMLLIElement

            const _label = itemLine.querySelector(".label") as HTMLInputElement
            const _opcode = itemLine.querySelector(".opcode") as HTMLSelectElement
            const _operand = itemLine.querySelector(".operand") as HTMLSelectElement
        })
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

    private computeOperand(opCode: string, linecodeLi: HTMLLIElement, operandSelect: HTMLSelectElement) {
        const lineNumber = this.getLineCodeNumber(linecodeLi)
        //console.log(lineNumber)
        // We must remove options list of select
        if (operandSelect != null) {
            applyModifierTo(operandSelect, style("visibility: visible"))
            this.removeAllChildren(operandSelect)
        }
        /*
                console.log(operandsOfOperandSelect)
                if (operandsOfOperandSelect != null) {
                    operandSelect.getElementsByTagName("#option").forEach(item => {
                        operandSelect.removeChild(item)
                    })
                }

         */
        if ((goToOpCode.includes(opCode))) {
            if(goToUpOpCode.includes(opCode)) {
                for (let _i = ((lineNumber < 15)? lineNumber : 15); _i > -1 ; _i--) {
                    if (this._lineLabels[lineNumber - _i + 1] == (lineNumber - _i + 1).toString()) {
                        console.log(lineNumber - _i + 1," = ",this._lineLabels[lineNumber - _i + 1])
                        option(
                            //cls(`.operandvalue${lineNumber.toString()}`),
                            "label " + (lineNumber - _i + 1).toString(),
                            value((lineNumber - _i + 1).toString()),
                            disabled,
                        ).applyTo(operandSelect)
                    } else {
                        console.log("*",this._lineLabels[lineNumber - _i + 1])
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
            if (!noOperantOpCode.includes(opCode)) {
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
