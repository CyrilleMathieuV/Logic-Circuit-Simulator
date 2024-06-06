import { LogicEditor, MouseAction } from "./LogicEditor"
import { Serialization } from "./Serialization"
import { TimelineState } from "./Timeline"
import { UndoState } from "./UndoManager"
import { CustomComponentDef } from "./components/CustomComponent"
import { Modifier, a, attr, button, cls, div, emptyMod, i, input, mods, raw, span, style, title, type, makeTab, makeButton, makeButtonWithLabel, makeLabel, makeSep, makeLink } from "./htmlgen"
import { IconName, inlineIconSvgFor } from "./images"
import { S } from "./strings"
import { Mode, UIDisplay, setActive, setDisplay, setEnabled, setVisible } from "./utils"

export class TopBar {

    private readonly root: HTMLDivElement
    private readonly alwaysShowCircuitName: boolean
    private _showingCompactUI: boolean = false

    private readonly circuitNameGroup: HTMLDivElement
    private _showingCircuitName: boolean = false
    private _customComponentShown: CustomComponentDef | undefined = undefined
    private readonly dirtyIndicator: HTMLSpanElement
    private readonly circuitNameLabel: HTMLSpanElement
    private readonly mainCircuitTab: HTMLDivElement
    private readonly customComponentChevron: HTMLSpanElement
    private readonly customComponentNameLabel: HTMLSpanElement
    private readonly customComponentTab: HTMLDivElement

    private readonly openButton: HTMLButtonElement
    private readonly closeCustomComponentButton: HTMLButtonElement
    private readonly undoButton: HTMLButtonElement
    private readonly redoButton: HTMLButtonElement
    private readonly downloadButton: HTMLButtonElement
    private readonly screenshotButton: HTMLButtonElement
    private readonly resetButton: HTMLButtonElement

    private readonly timelineButtonSep: HTMLElement
    private readonly pauseButton: HTMLButtonElement
    private readonly playButton: HTMLButtonElement
    private readonly stepButton: HTMLButtonElement
    private readonly timeLabel: HTMLSpanElement
    private _showingTimelineUI: boolean = false

    private readonly designButton: HTMLButtonElement
    private readonly deleteButton: HTMLButtonElement
    private readonly moveButton: HTMLButtonElement

    private readonly flexibleSep: HTMLElement

    private readonly zoomLevelInput: HTMLInputElement

    public constructor(
        public readonly editor: LogicEditor,
    ) {
        const s = S.TopBar
        this.alwaysShowCircuitName = editor.isSingleton

        this.dirtyIndicator = makeLabel(mods(style("margin: 3px 3px 0 -2px; font-size: 20pt"), "•", title(s.DirtyTooltip)))
        this.circuitNameLabel = makeLink(mods("", title(s.CircuitNameTooltip)), this.runSetCircuitNameDialog.bind(this), this.editor)
        this.mainCircuitTab = makeTab(
            this.circuitNameLabel,
        )
        this.customComponentChevron = makeLabel("❯")
        this.customComponentChevron.style.fontSize = "14pt"
        this.customComponentNameLabel = makeLink(mods("", title(s.CustomComponentCaptionTooltip)), this.runSetCustomComponentCaptionDialog.bind(this), this.editor)
        this.customComponentNameLabel.style.fontWeight = "bolder"
        this.closeCustomComponentButton = makeButton("close", s.CloseCircuit, () => editor.tryCloseCustomComponentEditor(), this.editor)
        this.closeCustomComponentButton.style.padding = "0"
        this.customComponentTab = makeTab(
            this.closeCustomComponentButton,
            this.customComponentNameLabel,
        )
        this.circuitNameGroup =
            div(cls("path"), style("flex: none; display: flex; align-items: stretch; margin: -3px 0 -3px -5px; padding: 3px 5px"),
                this.dirtyIndicator,
                this.mainCircuitTab,
                this.customComponentChevron,
                this.customComponentTab,
            ).render()

        this.undoButton = makeButtonWithLabel("undo", s.Undo,
            () => this.editor.editTools.undoMgr.undo(), this.editor)
        this.redoButton = makeButtonWithLabel("redo", s.Redo,
            () => this.editor.editTools.undoMgr.redoOrRepeat(), this.editor)

        this.resetButton = makeButtonWithLabel("reset", s.Reset,
            () => this.editor.resetCircuit(), this.editor)

        this.openButton = makeButtonWithLabel("open", s.Open,
            this.openHandler.bind(this), this.editor)
        this.downloadButton = makeButtonWithLabel("download", s.Download,
            this.saveHandler.bind(this), this.editor)
        this.screenshotButton = makeButtonWithLabel("screenshot", s.Screenshot,
            this.screenshotHandler.bind(this), this.editor)

        this.timelineButtonSep = makeSep()
        this.pauseButton = makeButtonWithLabel("pause", s.TimelinePause,
            () => this.editor.timeline.pause(), this.editor)
        this.playButton = makeButtonWithLabel("play", s.TimelinePlay,
            () => this.editor.timeline.play(), this.editor)
        this.stepButton = makeButtonWithLabel("step", s.TimelineStep,
            () => this.editor.timeline.step(), this.editor)

        this.timeLabel = makeLabel(s.TimeLabel + "0")
        this.timeLabel.style.fontSize = "8pt"

        this.designButton = makeButtonWithLabel("mouse", s.Design,
            () => this.editor.setCurrentMouseAction("edit"), this.editor)
        this.deleteButton = makeButtonWithLabel("trash", s.Delete,
            () => this.editor.setCurrentMouseAction("delete"), this.editor)
        this.moveButton = makeButton("move", s.Move[1],
            () => this.editor.setCurrentMouseAction("move"), this.editor)

        this.flexibleSep = div(style("flex: auto")).render()

        this.zoomLevelInput = input(type("number"),
            style("margin: 0 2px 0 0; width: 4em; background-color: inherit;"),
            attr("min", "0"), attr("step", "10"),
            attr("value", String(editor.options.zoom)),
            attr("title", S.Settings.zoomLevel),
        ).render()
        this.zoomLevelInput.addEventListener("change",
            editor.wrapHandler(this.zoomLevelHandler.bind(this)))

        const zoomControl = makeLabel(mods(
            this.zoomLevelInput, S.Settings.zoomLevelField[1]
        ))

        this.root =
            div(cls("topBar"), style("flex:none; height: 30px; padding: 3px 5px; display: flex; align-items: stretch;"),
                this.circuitNameGroup,

                this.undoButton,
                this.redoButton,

                makeSep(),
                this.resetButton,

                makeSep(),
                this.openButton,
                this.downloadButton,
                this.screenshotButton,

                this.timelineButtonSep,
                this.pauseButton,
                this.playButton,
                this.stepButton,
                this.timeLabel,

                makeSep(true),
                this.designButton,
                this.deleteButton,

                this.flexibleSep,

                this.moveButton,
                zoomControl,

            ).render()

        editor.html.centerCol.insertAdjacentElement("afterbegin", this.root)

        const undoMgr = editor.editTools.undoMgr
        undoMgr.onStateChanged = newState => this.setUndoButtonsEnabled(newState)
        this.setUndoButtonsEnabled(undoMgr.state)

        editor.timeline.onStateChanged = newState => this.setTimelineButtonsVisible(newState)
        this.setTimelineButtonsVisible(editor.timeline.state)

        this.setDirty(false)

        window.addEventListener("resize", this.updateCompactMode.bind(this))

        this.setEditingCustomComponent(undefined)
        this.setCircuitName(editor.documentDisplayName)
        this.updateCompactMode()
    }


    // Handlers

    private runSetCircuitNameDialog() {
        const currentValue = this.editor.options.name ?? ""
        const newName = window.prompt(S.TopBar.SetCircuitName, currentValue)
        if (newName === null || newName === currentValue) {
            return
        }
        this.editor.setCircuitName(newName)
        this.editor.editTools.undoMgr.takeSnapshot()
        // will call our own setCircuitName
    }

    private runSetCustomComponentCaptionDialog() {
        if (this._customComponentShown === undefined) {
            return
        }
        this.editor.factory.runChangeCustomComponentCaptionDialog(this._customComponentShown)
    }


    private openHandler() {
        this.editor.runFileChooser("text/plain|image/png|application/json", file => {
            this.editor.tryLoadFrom(file)
        })
    }

    private saveHandler(e: MouseEvent) {
        if (e.altKey && this.editor.factory.hasCustomComponents()) {
            Serialization.saveLibraryToFile(this.editor)
        } else {
            Serialization.saveCircuitToFile(this.editor)
        }
    }

    private screenshotHandler(e: MouseEvent) {
        const editor = this.editor
        if (e.altKey) {
            editor.download(editor.toSVG(true), ".svg")
        } else {
            editor.download(editor.toPNG(true), ".png")
        }
    }

    private zoomLevelHandler() {
        const zoom = this.zoomLevelInput.valueAsNumber
        this.editor.setZoomLevel(zoom)
    }


    // Visibility methods

    private updateCompactMode() {
        const getSepWidth = () => this.flexibleSep.getBoundingClientRect().width
        const MinSepWidth = 5
        const sepWidth = getSepWidth()
        if (!this._showingCompactUI) {
            if (sepWidth <= MinSepWidth) {
                // we need to shrink for sure
                this._showingCompactUI = true
                this.root.classList.add("compact")
            }
        } else {
            // can we expand? (if not, we'll stay in compact mode)
            if (sepWidth > MinSepWidth) {
                this.root.classList.remove("compact")
                if (getSepWidth() <= MinSepWidth) {
                    // we can't expand, so stay in compact mode
                    this.root.classList.add("compact")
                } else {
                    // keep being expanded
                    this._showingCompactUI = false
                }
            }
        }
    }

    public getActiveTabCoords(): [number, number] {
        const tab = this._customComponentShown !== undefined ? this.customComponentTab : this.mainCircuitTab
        const rect = tab.getBoundingClientRect()
        return [rect.left, rect.right]
    }

    public setButtonStateFromMode(state: { showComponentsAndEditControls: UIDisplay, showReset: boolean }, mode: Mode) {
        setDisplay(this.root, state.showComponentsAndEditControls)

        setVisible(this.resetButton, state.showReset)

        const showUndoRedo = mode >= Mode.CONNECT
        setVisible(this.undoButton, showUndoRedo)
        setVisible(this.redoButton, showUndoRedo)

        const showToolButtons = state.showComponentsAndEditControls === "show"
        setVisible(this.designButton, showToolButtons)
        setVisible(this.deleteButton, showToolButtons)
        setVisible(this.moveButton, showToolButtons)
        this.updateCompactMode()
    }

    public setCircuitName(name: string | undefined) {
        let show = true
        if (name !== undefined) {
            this.circuitNameLabel.textContent = name
        } else {
            // either a default name or a hidden 
            if (this.alwaysShowCircuitName) {
                this.circuitNameLabel.textContent = this.editor.documentDisplayName
            } else {
                show = false
                this.circuitNameLabel.textContent = ""
            }
        }

        this._showingCircuitName = show
        setVisible(this.circuitNameLabel, show)
        setVisible(this.dirtyIndicator, show)

        this.updateCircuitNameUI()
    }

    private updateCircuitNameUI() {
        setVisible(this.circuitNameGroup, this._showingCircuitName || this._customComponentShown !== undefined)
        this.updateCompactMode()
    }

    public setZoomLevel(zoom: number) {
        this.zoomLevelInput.value = String(zoom)
    }

    public setDirty(dirty: boolean) {
        this.dirtyIndicator.style.visibility = dirty ? "inherit" : "hidden"
        setEnabled(this.resetButton, dirty)
    }

    public setEditingCustomComponent(customDef: CustomComponentDef | undefined) {
        const showSubcircuitUI = customDef !== undefined
        setVisible(this.customComponentChevron, showSubcircuitUI)
        setVisible(this.customComponentTab, showSubcircuitUI)
        setActive(this.mainCircuitTab, !showSubcircuitUI)
        setActive(this.customComponentTab, showSubcircuitUI)
        if (showSubcircuitUI) {
            this.circuitNameLabel.style.removeProperty("font-weight")
            this.customComponentNameLabel.textContent = customDef.caption
        } else {
            this.circuitNameLabel.style.fontWeight = "bolder"
            this.customComponentNameLabel.textContent = ""
        }
        this._customComponentShown = customDef
        this.updateCircuitNameUI()
    }

    public updateCustomComponentCaption() {
        if (this._customComponentShown !== undefined) {
            this.customComponentNameLabel.textContent = this._customComponentShown.caption
            this.updateCompactMode()
        }
    }

    private setTimelineButtonsVisible({ enablesPause, hasCallbacks, isPaused, nextStepDesc }: TimelineState) {
        const showTimelineUI = enablesPause || (this.editor.options.allowPausePropagation && hasCallbacks)
        this._showingTimelineUI = showTimelineUI
        if (showTimelineUI) {
            // show part of the interface
            setVisible(this.timelineButtonSep, true)
            setVisible(this.playButton, isPaused)
            setVisible(this.pauseButton, !isPaused)
            setVisible(this.stepButton, nextStepDesc !== undefined)
            this.stepButton.title = S.TopBar.TimelineStep[1] + "\n" + (nextStepDesc ?? "")
            setVisible(this.timeLabel, isPaused)
            this.updateTimeLabelIfNeeded()
        } else {
            // show nothing
            setVisible(this.timelineButtonSep, false)
            setVisible(this.playButton, false)
            setVisible(this.pauseButton, false)
            setVisible(this.stepButton, false)
            setVisible(this.timeLabel, false)
        }
        this.updateCompactMode()
    }

    private setUndoButtonsEnabled({ canUndo, canRedoOrRepeat }: UndoState) {
        setEnabled(this.undoButton, canUndo)
        setEnabled(this.redoButton, canRedoOrRepeat)
    }

    public updateTimeLabelIfNeeded() {
        if (!this._showingTimelineUI) {
            return
        }

        const t = this.editor.timeline.logicalTime()
        // make nice string from milliseconds
        const ms = t % 1000
        const s = Math.floor(t / 1000) % 60
        const m = Math.floor(t / 60000) % 60
        const h = Math.floor(t / 3600000)
        this.timeLabel.textContent = S.TopBar.TimeLabel + (h === 0 ? "" : h + ":") +
            (m < 10 ? "0" + m : m) + ":" +
            (s < 10 ? "0" + s : s) + "." +
            (ms < 100 ? (ms < 10 ? "00" : "0") : "") + ms
    }

    public setActiveTool(tool: MouseAction) {
        setActive(this.designButton, tool === "edit")
        setActive(this.deleteButton, tool === "delete")
        setActive(this.moveButton, tool === "move")
    }

}

