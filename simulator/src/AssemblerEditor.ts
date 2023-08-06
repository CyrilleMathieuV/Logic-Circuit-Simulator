import {LogicEditor, MouseAction} from "./LogicEditor"
import {InteractionResult, setActive, TimeoutHandle} from "./utils"
import {Instance as PopperInstance} from "@popperjs/core/lib/types"
import {EditorSelection} from "./UIEventManager"
import {Drawable} from "./components/Drawable"
import {IconName, inlineIconSvgFor} from "./images"
import {button, cls, emptyMod, i, Modifier, raw, span, title} from "./htmlgen"



//export type InstructionKey = Strings["Flag"]["OpCode"]["Operand"]

type HtmlSection = {
    header: HTMLDivElement
    lines: HTMLUListElement[]
}

export class AssemblerEditor {
    public editor: LogicEditor
    //public readonly _program: HTMLUListElement
    //public readonly _htmlLine: HTMLElement[]

    private _dragSrcEl : HTMLElement | null = null

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
        this._dragSrcEl = this.editor.root.getElementById("instructionList")
        // Very important to get events
        this.setListener()
    }

    public setActiveLines() {
        this.getLinesList().forEach(item => {
            setActive(item, true)
        })
    }

    private setListener() {
        //this.setActiveLines()
        this.getLinesList().forEach(item => {
            item.addEventListener("dragstart", this.editor.wrapHandler((handler) => {
                this._dragSrcEl = this.handleDragStart(handler, item)
            }))
            item.addEventListener("dragend", this.editor.wrapHandler((handler) => {
                this.handleDragEnd(handler, item)
            }))
            item.addEventListener("dragover", this.editor.wrapHandler((handler) => {
                this.handleDragOver(handler)
            }))
            item.addEventListener("dragenter", this.editor.wrapHandler((handler) => {
                this.handleDragEnter(handler, item)
            }))
            item.addEventListener("dragleave", this.editor.wrapHandler((handler) => {
                this.handleDragLeave(handler, item)
            }))
            item.addEventListener("drop", this.editor.wrapHandler((handler) => {
                this.handleDrop(handler, item)
            }))
        })
    }

    public getLinesList() {
        // We must get nodes from this.editor.root !!!
        const lineList = this.editor.root.querySelectorAll(".program .linecode") as NodeListOf<HTMLElement>
        return lineList
    }

    private handleDragStart(evt: DragEvent, elem: HTMLElement) {
        elem.style.opacity = "0.4"

        const dragSrcEl = elem
        if (evt.dataTransfer !== null) {
            evt.dataTransfer.effectAllowed = 'move'
            evt.dataTransfer.setData('text/html', elem.innerHTML)
        }
        //elem.style.setProperty("backgroundColor", "red")
        //elem.style.backgroundColor = "blue"
        return dragSrcEl
    }

    private handleDragEnd(evt: DragEvent, elem: HTMLElement) {
        elem.style.opacity = "1"
        //elem.style.setProperty("backgroundColor", "blue")
        //elem.style.backgroundColor = "red"
    }

    private handleDragOver(evt: DragEvent) {
        evt.preventDefault()
        return false
    }

    private handleDragEnter (evt: DragEvent, elem: HTMLElement) {
        elem.classList.add('over')
    }

    private handleDragLeave (evt: DragEvent, elem: HTMLElement) {
        elem.classList.remove('over')
    }

    private handleDrop(evt: DragEvent, elem: HTMLElement) {
        evt.stopPropagation()
        const dragSrcEl = this._dragSrcEl
        if (evt.dataTransfer !== null && dragSrcEl !== null) {
            if (dragSrcEl !== elem) {
                dragSrcEl.innerHTML = elem.innerHTML
                elem.innerHTML = evt.dataTransfer.getData('text/html')
            }
        }
        return false
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
