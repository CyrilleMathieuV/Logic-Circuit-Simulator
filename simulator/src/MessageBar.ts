import { LogicEditor } from "./LogicEditor"
import { Modifier, applyModifierTo, cls, div } from "./htmlgen"
import { TimeoutHandle } from "./utils"

export class MessageBar {

    private readonly root: HTMLElement
    private readonly msgBox: HTMLElement
    private currentTimeout: TimeoutHandle | undefined = undefined

    public constructor(
        editor: LogicEditor,
    ) {
        this.msgBox = div(cls("msgBar")).render()
        this.root = div(cls("msgZone"),
            this.msgBox
        ).render()

        editor.html.mainCanvas.insertAdjacentElement("afterend", this.root)
    }

    public showMessage(msg: Modifier, duration: number) {
        if (this.currentTimeout !== undefined) {
            clearTimeout(this.currentTimeout)
        }
        this.msgBox.innerHTML = ""
        applyModifierTo(this.msgBox, msg)
        this.root.classList.add("visible")
        this.currentTimeout = setTimeout(() => {
            this.currentTimeout = undefined
            this.root.classList.remove("visible")
        }, duration)
    }

}
