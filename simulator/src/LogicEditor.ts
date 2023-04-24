import dialogPolyfill from 'dialog-polyfill'
import * as LZString from "lz-string"
import * as pngMeta from 'png-metadata-writer'
import { ComponentList, DrawZIndex } from "./ComponentList"
import { Component, ComponentBase, ComponentState } from "./components/Component"
import { Drawable, DrawableWithPosition, Orientation } from "./components/Drawable"
import { LabelRect, LabelRectDef } from "./components/LabelRect"
import { Waypoint, Wire, WireManager, WireStyle, WireStyles } from "./components/Wire"
import { CursorMovementManager, EditorSelection } from "./CursorMovementManager"
import { clampZoom, COLOR_BACKGROUND, COLOR_BACKGROUND_UNUSED_REGION, COLOR_BORDER, COLOR_COMPONENT_BORDER, COLOR_GRID_LINES, COLOR_GRID_LINES_GUIDES, GRID_STEP, isDarkMode, setColors, strokeSingleLine } from "./drawutils"
import { a, applyModifierTo, attr, attrBuilder, button, cls, div, emptyMod, href, input, label, mods, option, raw, select, span, style, target, title, type } from "./htmlgen"
import { IconName, inlineIconSvgFor, isIconName, makeIcon } from "./images"
import { makeComponentMenuInto } from "./menuutils"
import { MoveManager } from "./MoveManager"
import { NodeManager } from "./NodeManager"
import { PersistenceManager, Workspace } from "./PersistenceManager"
import { RecalcManager, RedrawManager } from "./RedrawRecalcManager"
import { DefaultLang, isLang, S, setLang } from "./strings"
import { Tests } from "./Tests"
import { Timeline, TimelineState } from "./Timeline"
import { UndoManager } from './UndoManager'
import { copyToClipboard, downloadBlob as downloadDataUrl, formatString, getURLParameter, isArray, isDefined, isEmbeddedInIframe, isFalsyString, isString, isTruthyString, isUndefined, isUndefinedOrNull, KeysOfByType, RichStringEnum, setVisible, showModal, targetIsFieldOrOtherInput } from "./utils"


// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import LogicEditorTemplate from "../html/LogicEditorTemplate.html"

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import LogicEditorCSS from "../css/LogicEditor.css"

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import DialogPolyfillCSS from "../../node_modules/dialog-polyfill/dist/dialog-polyfill.css"
import { gallery } from './gallery'

enum Mode {
    STATIC,  // cannot interact in any way
    TRYOUT,  // can change inputs on predefined circuit
    CONNECT, // can additionnally move preexisting components around and connect them
    DESIGN,  // can additionally add components from left menu
    FULL,    // can additionally force output nodes to 'unset' state and draw undetermined dates
}

const MAX_MODE_WHEN_SINGLETON = Mode.FULL
const MAX_MODE_WHEN_EMBEDDED = Mode.DESIGN
const DEFAULT_MODE = Mode.DESIGN

const ATTRIBUTE_NAMES = {
    lang: "lang",
    singleton: "singleton", // whether this is the only editor in the page
    mode: "mode",
    hidereset: "hidereset",

    // these are mirrored in the display options
    name: "name",
    showonly: "showonly",
    showgatetypes: "showgatetypes",
    showdisconnectedpins: "showdisconnectedpins",
    showtooltips: "tooltips",

    src: "src",
    data: "data",
} as const

export type InitParams = {
    orient: Orientation
}

const DEFAULT_EDITOR_OPTIONS = {
    name: undefined as string | undefined,
    showOnly: undefined as undefined | Array<string>,
    initParams: undefined as undefined | Record<string, Partial<InitParams>>,
    showGateTypes: false,
    showDisconnectedPins: false,
    wireStyle: WireStyles.auto as WireStyle,
    hideWireColors: false,
    hideInputColors: false,
    hideOutputColors: false,
    hideMemoryContent: false,
    hideTooltips: false,
    groupParallelWires: false,
    propagationDelay: 100,
    zoom: 100,
}

export type EditorOptions = typeof DEFAULT_EDITOR_OPTIONS


export const MouseActions = RichStringEnum.withProps<{
    cursor: string | null
}>()({
    edit: { cursor: null },
    move: { cursor: "move" },
    delete: { cursor: "not-allowed" },
})
export type MouseAction = typeof MouseActions.type

type InitialData = { _type: "url", url: string } | { _type: "json", json: string } | { _type: "compressed", str: string }

type HighlightedItems = { comps: Component[], wires: Wire[], start: number }

export type DrawParams = {
    drawTime: number,
    currentMouseOverComp: Drawable | null,
    currentSelection: EditorSelection | undefined,
    highlightedItems: HighlightedItems | undefined,
    highlightColor: string | undefined,
    anythingMoving: boolean,
}
export class LogicEditor extends HTMLElement {

    public static _globalListenersInstalled = false

    public static _allConnectedEditors: Array<LogicEditor> = []
    public static get allConnectedEditors(): ReadonlyArray<LogicEditor> {
        return LogicEditor._allConnectedEditors
    }

    public readonly wireMgr = new WireManager(this)
    public readonly nodeMgr = new NodeManager()
    public readonly timeline = new Timeline(this)
    public readonly redrawMgr = new RedrawManager()
    public readonly recalcMgr = new RecalcManager()
    public readonly moveMgr = new MoveManager(this)
    public readonly cursorMovementMgr = new CursorMovementManager(this)
    public readonly undoMgr = new UndoManager(this)

    public readonly components = new ComponentList()

    private _isEmbedded = false
    private _isSingleton = false
    private _maxInstanceMode: Mode = MAX_MODE_WHEN_EMBEDDED // can be set later
    private _isDirty = false
    private _mode: Mode = DEFAULT_MODE
    private _initialData: InitialData | undefined = undefined
    private _options: EditorOptions = { ...DEFAULT_EDITOR_OPTIONS }
    private _hideResetButton = false

    private _currentMouseAction: MouseAction = "edit"
    private _toolCursor: string | null = null
    private _highlightedItems: HighlightedItems | undefined = undefined
    private _nextAnimationFrameHandle: number | null = null

    public root: ShadowRoot
    public readonly html: {
        rootDiv: HTMLDivElement,
        canvasContainer: HTMLElement,
        mainCanvas: HTMLCanvasElement,
        leftToolbar: HTMLElement,
        tooltipElem: HTMLElement,
        tooltipContents: HTMLElement,
        mainContextMenu: HTMLElement,
        hiddenPath: SVGPathElement,
        fileChooser: HTMLInputElement,
        optionsZone: HTMLElement,
        embedDialog: HTMLDialogElement,
        embedUrl: HTMLTextAreaElement,
        // embedUrlQRCode: HTMLImageElement,
        embedIframe: HTMLTextAreaElement,
        embedWebcomp: HTMLTextAreaElement,
        embedMarkdown: HTMLTextAreaElement,
    }
    public optionsHtml: {
        nameField: HTMLInputElement,
        showGateTypesCheckbox: HTMLInputElement,
        showDisconnectedPinsCheckbox: HTMLInputElement,
        wireStylePopup: HTMLSelectElement,
        hideWireColorsCheckbox: HTMLInputElement,
        hideInputColorsCheckbox: HTMLInputElement,
        hideOutputColorsCheckbox: HTMLInputElement,
        hideMemoryContentCheckbox: HTMLInputElement,
        hideTooltipsCheckbox: HTMLInputElement,
        groupParallelWiresCheckbox: HTMLInputElement,
        propagationDelayField: HTMLInputElement,
        zoomLevelField: HTMLInputElement,
        showUserDataLinkContainer: HTMLDivElement,
    } | undefined = undefined
    public userdata: any = undefined

    private _baseDrawingScale = 1
    private _actualZoomFactor = 1
    public mouseX = -1000 // offscreen at start
    public mouseY = -1000

    public constructor() {
        super()

        this.root = this.attachShadow({ mode: 'open' })
        this.root.appendChild(template.content.cloneNode(true) as HTMLElement)

        const html: typeof this.html = {
            rootDiv: this.elemWithId("logicEditorRoot"),
            canvasContainer: this.elemWithId("canvas-sim"),
            mainCanvas: this.elemWithId("mainCanvas"),
            leftToolbar: this.elemWithId("leftToolbar"),
            tooltipElem: this.elemWithId("tooltip"),
            tooltipContents: this.elemWithId("tooltipContents"),
            mainContextMenu: this.elemWithId("mainContextMenu"),
            optionsZone: this.elemWithId("optionsZone"),
            hiddenPath: this.elemWithId("hiddenPath"),
            fileChooser: this.elemWithId("fileChooser"),
            embedDialog: this.elemWithId("embedDialog"),
            embedUrl: this.elemWithId("embedUrl"),
            // embedUrlQRCode: this.elemWithId("embedUrlQRCode"),
            embedIframe: this.elemWithId("embedIframe"),
            embedWebcomp: this.elemWithId("embedWebcomp"),
            embedMarkdown: this.elemWithId("embedMarkdown"),
        }
        this.html = html
        dialogPolyfill.registerDialog(html.embedDialog)
    }

    private elemWithId<E extends Element>(id: string) {
        let elem = this.root.querySelector(`#${id}`)
        if (elem === null) {
            elem = document.querySelector(`#${id}`)
            if (elem !== null) {
                console.log(`WARNING found elem with id ${id} in document rather than in shadow root`)
            }
        }
        if (elem === null) {
            console.log("root", this.root)
            throw new Error(`Could not find element with id '${id}'`)
        }
        return elem as E
    }

    public static get observedAttributes() {
        return []
    }


    public get mode() {
        return this._mode
    }

    public get actualZoomFactor() {
        return this._actualZoomFactor
    }

    public get options(): Readonly<EditorOptions> {
        return this._options
    }

    public setPartialOptions(opts: Partial<EditorOptions>) {
        const newOptions = { ...DEFAULT_EDITOR_OPTIONS, ...opts }
        if (this._isSingleton) {
            // restore showOnly
            newOptions.showOnly = this._options.showOnly
        }
        this._options = newOptions
        let optionsHtml

        if (isDefined(optionsHtml = this.optionsHtml)) {
            this.setDocumentName(newOptions.name)
            optionsHtml.nameField.value = newOptions.name ?? ""
            optionsHtml.hideWireColorsCheckbox.checked = newOptions.hideWireColors
            optionsHtml.hideInputColorsCheckbox.checked = newOptions.hideInputColors
            optionsHtml.hideOutputColorsCheckbox.checked = newOptions.hideOutputColors
            optionsHtml.hideMemoryContentCheckbox.checked = newOptions.hideMemoryContent
            optionsHtml.showGateTypesCheckbox.checked = newOptions.showGateTypes
            optionsHtml.wireStylePopup.value = newOptions.wireStyle
            optionsHtml.showDisconnectedPinsCheckbox.checked = newOptions.showDisconnectedPins
            optionsHtml.hideTooltipsCheckbox.checked = newOptions.hideTooltips
            optionsHtml.groupParallelWiresCheckbox.checked = newOptions.groupParallelWires
            optionsHtml.propagationDelayField.valueAsNumber = newOptions.propagationDelay
            optionsHtml.zoomLevelField.valueAsNumber = newOptions.zoom

            optionsHtml.showUserDataLinkContainer.style.display = isDefined(this.userdata) ? "initial" : "none"
        }

        this._actualZoomFactor = clampZoom(newOptions.zoom)

        this.redrawMgr.addReason("options changed", null)
    }

    private setDocumentName(name: string | undefined) {
        if (!this._isSingleton) {
            return
        }
        const defaultTitle = "Logic"
        if (isUndefined(name)) {
            document.title = defaultTitle
        } else {
            document.title = `${name} – ${defaultTitle}`
        }
    }

    public nonDefaultOptions(): undefined | Partial<EditorOptions> {
        const nonDefaultOpts: Partial<EditorOptions> = {}
        let set = false
        for (const [_k, v] of Object.entries(this._options)) {
            const k = _k as keyof EditorOptions
            if (v !== DEFAULT_EDITOR_OPTIONS[k]) {
                nonDefaultOpts[k] = v as any
                set = true
            }
        }
        return set ? nonDefaultOpts : undefined
    }


    public setActiveTool(toolElement: HTMLElement) {
        const tool = toolElement.getAttribute("tool")
        if (isUndefinedOrNull(tool)) {
            return
        }

        // Main edit buttons on the right
        if (MouseActions.includes(tool)) {
            this.wrapHandler(() => {
                this.setCurrentMouseAction(tool)
            })()
            return
        }

        if (tool === "save") {
            PersistenceManager.saveToFile(this)
            return
        }

        if (tool === "screenshot") {
            this.downloadSnapshotImage()
            return
        }

        if (tool === "open") {
            this.html.fileChooser.click()
            return
        }

        this.setCurrentMouseAction("edit")
        if (tool === "reset") {
            this.wrapHandler(() => {
                this.tryLoadFromData()
            })()
            return
        }
    }

    public setToolCursor(cursor: string | null) {
        this._toolCursor = cursor
    }

    private setCanvasSize() {
        const { canvasContainer } = this.html
        const w = canvasContainer.clientWidth
        const h = canvasContainer.clientHeight
        const f = window.devicePixelRatio ?? 1
        const mainCanvas = this.html.mainCanvas
        mainCanvas.setAttribute("width", String(w * f))
        mainCanvas.setAttribute("height", String(h * f))
        mainCanvas.style.setProperty("width", w + "px")
        mainCanvas.style.setProperty("height", h + "px")
        this._baseDrawingScale = f
    }

    public connectedCallback() {
        const { rootDiv, mainCanvas } = this.html

        const parentStyles = this.getAttribute("style")
        if (parentStyles !== null) {
            rootDiv.setAttribute("style", rootDiv.getAttribute("style") + parentStyles)
        }

        // TODO move this in SelectionMgr?
        mainCanvas.ondragenter = () => {
            return false
        }
        mainCanvas.ondragover = () => {
            return false
        }
        mainCanvas.ondragend = () => {
            return false
        }
        mainCanvas.ondrop = e => {
            if (e.dataTransfer === null) {
                return false
            }

            e.preventDefault()
            const file = e.dataTransfer.files?.[0]
            if (isDefined(file)) {
                this.tryLoadFromFile(file)
            } else {
                const dataItems = e.dataTransfer.items
                if (isDefined(dataItems)) {
                    for (let i = 0; i < dataItems.length; i++) {
                        const dataItem = dataItems[i]
                        if (dataItem.kind === "string" && (dataItem.type === "application/json" || dataItem.type !== "text/plain")) {
                            dataItem.getAsString(content => {
                                e.dataTransfer!.dropEffect = "copy"
                                this.load(content)
                            })
                            break
                        }
                    }
                }
            }
            return false
        }

        this.cursorMovementMgr.registerCanvasListenersOn(this.html.mainCanvas)
        if (LogicEditor._allConnectedEditors.length === 0) {
            // set lang on first instance of editor on the page
            this.setupLang()
        }
        LogicEditor._allConnectedEditors.push(this)
        this.setup()
    }

    public disconnectedCallback() {
        const insts = LogicEditor._allConnectedEditors
        insts.splice(insts.indexOf(this), 1)

        // TODO
        // this.cursorMovementManager.unregisterCanvasListenersOn(this.html.mainCanvas)
    }

    private setupLang() {
        const getNavigatorLanguage = () => {
            const lang = navigator.languages?.[0] ?? navigator.language
            if (lang.length > 2) {
                return lang.substring(0, 2)
            }
            if (lang.length === 2) {
                return lang
            }
            return undefined
        }

        const getSavedLang = () => {
            return localStorage.getItem(ATTRIBUTE_NAMES.lang)
        }

        const langStr = (getURLParameter(ATTRIBUTE_NAMES.lang)
            ?? this.getAttribute(ATTRIBUTE_NAMES.lang)
            ?? getSavedLang()
            ?? getNavigatorLanguage()
            ?? DefaultLang).toLowerCase()
        const lang = isLang(langStr) ? langStr : DefaultLang
        setLang(lang)
    }

    private setup() {
        this._isEmbedded = isEmbeddedInIframe()
        const singletonAttr = this.getAttribute(ATTRIBUTE_NAMES.singleton)
        this._isSingleton = !this._isEmbedded && singletonAttr !== null && !isFalsyString(singletonAttr)
        this._maxInstanceMode = this._isSingleton && !this._isEmbedded ? MAX_MODE_WHEN_SINGLETON : MAX_MODE_WHEN_EMBEDDED

        // Transfer from URL param to attributes if we are in singleton mode
        if (this._isSingleton || this._isEmbedded) {
            const transferUrlParamToAttribute = (name: string) => {
                const value = getURLParameter(name)
                if (isDefined(value)) {
                    this.setAttribute(name, value)
                }
            }

            for (const attr of [
                ATTRIBUTE_NAMES.mode,
                ATTRIBUTE_NAMES.showonly,
                ATTRIBUTE_NAMES.showgatetypes,
                ATTRIBUTE_NAMES.showdisconnectedpins,
                ATTRIBUTE_NAMES.showtooltips,
                ATTRIBUTE_NAMES.data,
                ATTRIBUTE_NAMES.src,
                ATTRIBUTE_NAMES.hidereset,
            ]) {
                transferUrlParamToAttribute(attr)
            }

            const userParamPrefix = "user"
            const url = new URL(window.location.href)
            url.searchParams.forEach((value: string, key: string) => {
                if (key.startsWith(userParamPrefix)) {
                    key = key.substring(userParamPrefix.length)
                    if (key.startsWith(".")) {
                        key = key.substring(1)
                    }
                    if (key.length === 0) {
                        this.userdata = value
                    } else {
                        key = key[0].toLowerCase() + key.substring(1)
                        if (typeof this.userdata !== "object") {
                            this.userdata = {}
                        }
                        if (key in this.userdata) {
                            const oldValue = this.userdata[key]
                            if (isArray(oldValue)) {
                                oldValue.push(value)
                            } else {
                                this.userdata[key] = [oldValue, value]
                            }
                        } else {
                            this.userdata[key] = value
                        }
                    }
                }
            })
            if (isDefined(this.userdata)) {
                console.log("Custom user data: ", this.userdata)
            }
        }

        if (this._isSingleton) {
            // console.log("LogicEditor is in singleton mode")

            // singletons manage their dark mode according to system settings
            const darkModeQuery = window.matchMedia("(prefers-color-scheme: dark)")
            darkModeQuery.onchange = () => {
                setColors(darkModeQuery.matches)
            }
            setColors(darkModeQuery.matches)

            window.addEventListener("keyup", this.wrapHandler(e => {
                if (targetIsFieldOrOtherInput(e)) {
                    return
                }
                switch (e.key) {
                    case "Escape":
                        this.tryDeleteComponentsWhere(comp => comp.state === ComponentState.SPAWNING, false)
                        this.wireMgr.tryCancelWire()
                        e.preventDefault()
                        return

                    case "Backspace":
                    case "Delete": {
                        let selComp
                        if (isDefined(selComp = this.cursorMovementMgr.currentSelection?.previouslySelectedElements) && selComp.size !== 0) {
                            let anyDeleted = false
                            for (const comp of selComp) {
                                anyDeleted = this.tryDeleteDrawable(comp) || anyDeleted
                            }
                            if (anyDeleted) {
                                this.undoMgr.takeSnapshot()
                            }
                        } else if ((selComp = this.cursorMovementMgr.currentMouseOverComp) !== null) {
                            const deleted = this.tryDeleteDrawable(selComp)
                            if (deleted) {
                                this.undoMgr.takeSnapshot()
                            }
                        }
                        e.preventDefault()
                        return
                    }

                    case "e":
                        this.setCurrentMouseAction("edit")
                        e.preventDefault()
                        return

                    case "d":
                        this.setCurrentMouseAction("delete")
                        e.preventDefault()
                        return

                    case "m":
                        this.setCurrentMouseAction("move")
                        e.preventDefault()
                        return

                    case "ArrowRight":
                        this.trySetCurrentComponentOrientation("e", e)
                        return
                    case "ArrowLeft":
                        this.trySetCurrentComponentOrientation("w", e)
                        return
                    case "ArrowUp":
                        this.trySetCurrentComponentOrientation("n", e)
                        return
                    case "ArrowDown":
                        this.trySetCurrentComponentOrientation("s", e)
                        return
                }
            }))

            // TODO this should also work then not in singleton mode,
            // but it still requires listening for keydown on the window,
            // so we must know which was the lastest editor on screen to target
            // this to
            window.addEventListener("keydown", this.wrapHandler(e => {
                const ctrlOrCommand = e.ctrlKey || e.metaKey
                const keyLower = e.key.toLowerCase()
                const shift = e.shiftKey || (keyLower !== e.key)
                switch (keyLower) {
                    case "a":
                        if (ctrlOrCommand && this.mode >= Mode.CONNECT && !targetIsFieldOrOtherInput(e)) {
                            this.cursorMovementMgr.selectAll()
                            e.preventDefault()
                        }
                        return

                    case "s":
                        if (ctrlOrCommand && this._isSingleton) {
                            this.saveCurrentStateToUrl()
                            e.preventDefault()
                        }
                        return

                    case "z":
                        if (ctrlOrCommand && !targetIsFieldOrOtherInput(e)) {
                            if (shift) {
                                this.undoMgr.redoOrRepeat()
                            } else {
                                this.undoMgr.undo()
                            }
                            e.preventDefault()
                        }
                        return
                    case "y":
                        if (ctrlOrCommand && !targetIsFieldOrOtherInput(e)) {
                            this.undoMgr.redoOrRepeat()
                            e.preventDefault()
                        }
                        return
                    case "x":
                        if (ctrlOrCommand && !targetIsFieldOrOtherInput(e)) {
                            this.cut()
                            e.preventDefault()
                        }
                        return
                    // case "c":
                    // NO: this prevents the sharing code from being copied
                    // if (ctrlOrCommand && !targetIsField()) {
                    //     this.copy()
                    //     e.preventDefault()
                    // }
                    // return
                    case "v":
                        if (ctrlOrCommand && !targetIsFieldOrOtherInput(e)) {
                            this.paste()
                            e.preventDefault()
                        }
                        return
                }

                const mouseOverComp = this.cursorMovementMgr.currentMouseOverComp
                if (mouseOverComp !== null) {
                    mouseOverComp.keyDown(e)
                }
            }))

            // make load function available globally
            window.Logic.singleton = this
            window.load = this.load.bind(this)
            window.save = this.save.bind(this)
            window.highlight = this.highlight.bind(this)

            window.adjustedTime = () => {
                const nowAdjusted = this.timeline.adjustedTime()
                // console.log(nowAdjusted)
                return nowAdjusted
            }

            this.html.canvasContainer.appendChild(
                div(style("user-select: none; position: absolute; bottom: 0; right: 0; padding: 5px 3px 2px 5px; color: rgba(128,128,128,0.2); border-radius: 10px 0 0 0; font-size: 69%; font-style: italic;"),
                    S.Messages.DevelopedBy + " ",
                    a(style("color: inherit"),
                        href("https://github.com/jppellet/Logic-Circuit-Simulator"), target("_blank"),
                        "Jean-Philippe Pellet"
                    ),
                    ", ",
                    a(style("color: inherit"),
                        href("https://www.hepl.ch/accueil/formation/unites-enseignement-et-recherche/medias-usages-numeriques-et-didactique-de-linformatique.html"), target("_blank"),
                        "HEP Vaud"
                    ),
                ).render()
            )

            window.onbeforeunload = e => {
                if (this._isSingleton && this._isDirty && this.mode >= Mode.CONNECT) {
                    e.preventDefault() // ask to save changes
                    e.returnValue = S.Messages.ReallyCloseWindow
                }
            }
        }

        // Load parameters from attributes
        let modeAttr = this.getAttribute(ATTRIBUTE_NAMES.mode)
        if (modeAttr !== null && (modeAttr = modeAttr.toUpperCase()) in Mode) {
            this._maxInstanceMode = (Mode as any)[modeAttr]
        }

        const showonlyAttr = this.getAttribute(ATTRIBUTE_NAMES.showonly)
        if (showonlyAttr !== null) {
            this._options.showOnly = showonlyAttr.toLowerCase().split(/[, +]+/).filter(x => x.trim())
        }

        const showgatetypesAttr = this.getAttribute(ATTRIBUTE_NAMES.showgatetypes)
        if (showgatetypesAttr !== null) {
            this._options.showGateTypes = isTruthyString(showgatetypesAttr)
        }

        const showdisconnectedpinsAttr = this.getAttribute(ATTRIBUTE_NAMES.showdisconnectedpins)
        if (showdisconnectedpinsAttr !== null) {
            this._options.showDisconnectedPins = isTruthyString(showdisconnectedpinsAttr)
        }

        const showtooltipsAttr = this.getAttribute(ATTRIBUTE_NAMES.showtooltips)
        if (showtooltipsAttr !== null) {
            this._options.hideTooltips = !isFalsyString(showtooltipsAttr)
        }

        // TODO move this to options so that it is correctly persisted, too
        this._hideResetButton = this.getAttribute(ATTRIBUTE_NAMES.hidereset) !== null && !isFalsyString(this.getAttribute(ATTRIBUTE_NAMES.hidereset))

        let dataOrSrcRef
        if ((dataOrSrcRef = this.getAttribute(ATTRIBUTE_NAMES.data)) !== null) {
            this._initialData = { _type: "compressed", str: dataOrSrcRef }
        } else if ((dataOrSrcRef = this.getAttribute(ATTRIBUTE_NAMES.src)) !== null) {
            this._initialData = { _type: "url", url: dataOrSrcRef }
        } else {

            const tryLoadFromLightDOM = () => {
                const innerScriptElem = this.findLightDOMChild("script")
                if (innerScriptElem !== null) {
                    this._initialData = { _type: "json", json: innerScriptElem.innerHTML }
                    innerScriptElem.remove() // remove the data element to hide the raw data
                    // do this manually
                    this.tryLoadFromData()
                    this.doRedraw()
                    return true
                } else {
                    return false
                }
            }

            // try to load from the children of the light DOM,
            // but this has to be done later as it hasn't been parsed yet
            setTimeout(() => {
                const loaded = tryLoadFromLightDOM()

                // sometimes the light DOM is not parsed yet, so try again a bit later
                if (!loaded) {
                    setTimeout(() => {
                        tryLoadFromLightDOM()
                    }, 100)
                }
            })
        }

        const setCaption = (buttonId: string, strings: string | [string, string]) => {
            const elem = this.elemWithId(buttonId)
            const [name, tooltip] = isString(strings) ? [strings, undefined] : strings
            elem.insertAdjacentText("beforeend", name)
            if (isDefined(tooltip)) {
                elem.setAttribute("title", tooltip)
            }
        }

        {
            // set strings in the UI
            const s = S.Palette
            setCaption("editToolButton", s.Design)
            setCaption("deleteToolButton", s.Delete)
            setCaption("moveToolButton", s.Move)
            setCaption("saveToolButton", s.Download)
            setCaption("screenshotToolButton", s.Screenshot)
            setCaption("openToolButton", s.Open)
            setCaption("resetToolButtonCaption", s.Reset)
            setCaption("settingsTitle", S.Settings.Settings)
        }

        {
            const s = S.Dialogs.Share
            setCaption("shareDialogTitle", s.title)
            setCaption("shareDialogUrl", s.URL)
            setCaption("shareDialogIframe", s.EmbedInIframe)
            setCaption("shareDialogWebComp", s.EmbedWithWebComp)
            setCaption("shareDialogMarkdown", s.EmbedInMarkdown)
            setCaption("shareDialogClose", S.Dialogs.Generic.Close)
        }

        makeComponentMenuInto(this.html.leftToolbar, this._options.showOnly)

        // TODO move this to the Def of LabelRect to be cleaner
        const groupButton = this.html.leftToolbar.querySelector("button.sim-component-button[data-category=label][data-type=rect]")
        if (groupButton === null) {
            console.log("ERROR: Could not find group button")
        } else {
            groupButton.addEventListener("mousedown", this.wrapHandler(e => {
                const selectedComps = this.cursorMovementMgr.currentSelection?.previouslySelectedElements || new Set()
                if (selectedComps.size !== 0) {
                    e.preventDefault()
                    e.stopImmediatePropagation()

                    const newGroup = LabelRectDef.make<LabelRect>(this)
                    newGroup.setSpawned()

                    if (newGroup instanceof LabelRect) {
                        newGroup.wrapContents(selectedComps)
                    } else {
                        console.log("ERROR: created component is not a LabelRect")
                    }
                }
            }))
        }

        this.cursorMovementMgr.registerButtonListenersOn(this.root.querySelectorAll(".sim-component-button"))

        const modifButtons = this.root.querySelectorAll("button.sim-modification-tool")
        for (let i = 0; i < modifButtons.length; i++) {
            const but = modifButtons[i] as HTMLElement
            but.addEventListener("click", () => {
                this.setActiveTool(but)
            })
        }

        const showModeChange = this._maxInstanceMode >= Mode.FULL
        if (showModeChange) {
            const modeChangeMenu: HTMLElement = this.elemWithId("modeChangeMenu")!
            div(cls("btn-group-vertical"),
                div(style("text-align: center; width: 100%; font-weight: bold; font-size: 80%; color: #666; padding: 2px;"),
                    "Mode",
                ),
                ...[Mode.FULL, Mode.DESIGN, Mode.CONNECT, Mode.TRYOUT, Mode.STATIC].map((buttonMode) => {
                    const [[modeTitle, expl], addElem] = (() => {
                        switch (buttonMode) {
                            case Mode.FULL: {
                                const optionsDiv =
                                    div(cls("sim-mode-link"),
                                        title(S.Settings.Settings),
                                        makeIcon("settings")
                                    ).render()

                                optionsDiv.addEventListener("click", () => {
                                    setVisible(this.html.optionsZone, true)
                                })

                                return [S.Modes.FULL, optionsDiv]
                            }
                            case Mode.DESIGN: return [S.Modes.DESIGN, emptyMod]
                            case Mode.CONNECT: return [S.Modes.CONNECT, emptyMod]
                            case Mode.TRYOUT: return [S.Modes.TRYOUT, emptyMod]
                            case Mode.STATIC: return [S.Modes.STATIC, emptyMod]
                        }
                    })()

                    const copyLinkDiv =
                        div(cls("sim-mode-link"),
                            title("Copie un lien vers ce contenu dans ce mode"),
                            makeIcon("link"),
                        ).render()

                    copyLinkDiv.addEventListener("click", __ => {
                        this.shareSheetForMode(buttonMode)
                    })

                    const switchToModeDiv =
                        div(cls("btn btn-sm btn-outline-light sim-toolbar-button-right sim-mode-tool"),
                            style("display: flex; justify-content: space-between; align-items: center"),
                            attrBuilder("mode")(Mode[buttonMode]),
                            title(expl),
                            modeTitle,
                            addElem,
                            copyLinkDiv
                        ).render()

                    switchToModeDiv.addEventListener("click", this.wrapHandler(() => this.setMode(buttonMode)))

                    return switchToModeDiv
                })
            ).applyTo(modeChangeMenu)
            setVisible(modeChangeMenu, true)
        }

        // this.html.embedUrlQRCode.addEventListener("click", __ => {
        //     // download
        //     const dataUrl = this.html.embedUrlQRCode.src
        //     const filename = (this.options.name ?? "circuit") + "_qrcode.png"
        //     downloadDataUrl(dataUrl, filename)
        // })

        this.html.fileChooser.addEventListener("change", __ => {
            let files
            if ((files = this.html.fileChooser.files) !== null && files.length > 0) {
                this.tryLoadFromFile(files[0])
            }
        })

        const selectAllListener = (e: Event) => {
            const textArea = e.target as HTMLTextAreaElement
            textArea.focus()
            textArea.select()
            e.preventDefault()
        }
        for (const textArea of [this.html.embedUrl, this.html.embedIframe, this.html.embedWebcomp, this.html.embedMarkdown]) {
            textArea.addEventListener("pointerdown", selectAllListener)
            textArea.addEventListener("focus", selectAllListener)
        }


        const timelineControls: HTMLElement = this.elemWithId("timelineControls")!
        const makeTimelineButton = (icon: IconName, [text, expl]: [string | undefined, string], action: () => unknown) => {
            const but =
                button(cls("btn btn-sm btn-outline-light sim-toolbar-button-right"),
                    isUndefined(text) ? style("text-align: center") : emptyMod,
                    title(expl),
                    makeIcon(icon, 20, 20),
                    isUndefined(text) ? raw("&nbsp;") : text,
                ).render()
            but.addEventListener("click", action)
            return but
        }
        const playButton = makeTimelineButton("play", S.Timeline.Play, () => this.timeline.play())
        const pauseButton = makeTimelineButton("pause", S.Timeline.Pause, () => this.timeline.pause())
        const stepButton = makeTimelineButton("step", S.Timeline.Step, () => this.timeline.step())
        applyModifierTo(timelineControls, mods(playButton, pauseButton, stepButton))

        const showTimelineButtons = true
        setVisible(timelineControls, showTimelineButtons)

        function setTimelineButtonsVisible(state: TimelineState) {
            if (state.hasCallbacks) {
                // show part of the interface
                setVisible(playButton, state.isPaused)
                setVisible(pauseButton, !state.isPaused)
                setVisible(stepButton, state.canStep)
            } else {
                // show nothing
                setVisible(playButton, false)
                setVisible(pauseButton, false)
                setVisible(stepButton, false)
            }
        }

        this.timeline.reset()
        this.timeline.onStateChanged = newState => setTimelineButtonsVisible(newState)
        setTimelineButtonsVisible(this.timeline.state)

        // Options
        const optionsZone = this.html.optionsZone
        optionsZone.querySelector("#closeOptions")?.addEventListener("click", () => {
            setVisible(optionsZone, false)
        })

        const makeCheckbox = <K extends KeysOfByType<EditorOptions, boolean>>(optionName: K, [title, mouseover]: [string, string], hide = false) => {
            const checkbox = input(type("checkbox")).render()
            if (this.options[optionName] === true) {
                checkbox.checked = true
            }
            checkbox.addEventListener("change", this.wrapHandler(() => {
                this._options[optionName] = checkbox.checked
                this.redrawMgr.addReason("option changed: " + optionName, null)
            }))
            const section = div(
                style("height: 20px"),
                label(checkbox, span(style("margin-left: 4px"), attr("title", mouseover), title))
            ).render()
            optionsZone.appendChild(section)
            if (hide) {
                setVisible(section, false)
            }
            return checkbox
        }

        const nameField = input(type("text"),
            style("margin-left: 4px"),
            attr("value", this.options.name ?? ""),
            attr("placeholder", "circuit"),
            attr("title", S.Settings.NameOfDownloadedFile),
        ).render()
        nameField.addEventListener("change", () => {
            const newName = nameField.value
            this._options.name = newName.length === 0 ? undefined : newName
            this.setDocumentName(this._options.name)
        })
        optionsZone.appendChild(
            div(
                style("height: 20px; margin-bottom: 4px"),
                S.Settings.CircuitName, nameField
            ).render()
        )

        const hideWireColorsCheckbox = makeCheckbox("hideWireColors", S.Settings.hideWireColors)
        const hideInputColorsCheckbox = makeCheckbox("hideInputColors", S.Settings.hideInputColors)
        const hideOutputColorsCheckbox = makeCheckbox("hideOutputColors", S.Settings.hideOutputColors)
        const hideMemoryContentCheckbox = makeCheckbox("hideMemoryContent", S.Settings.hideMemoryContent)
        const showGateTypesCheckbox = makeCheckbox("showGateTypes", S.Settings.showGateTypes)
        const showDisconnectedPinsCheckbox = makeCheckbox("showDisconnectedPins", S.Settings.showDisconnectedPins)
        const hideTooltipsCheckbox = makeCheckbox("hideTooltips", S.Settings.hideTooltips)
        const groupParallelWiresCheckbox = makeCheckbox("groupParallelWires", S.Settings.groupParallelWires, true)
        // 
        const wireStylePopup = select(
            option(attr("value", WireStyles.auto), S.Settings.WireStyleAuto),
            option(attr("value", WireStyles.straight), S.Settings.WireStyleLine),
            option(attr("value", WireStyles.bezier), S.Settings.WireStyleCurve),
        ).render()
        wireStylePopup.addEventListener("change", this.wrapHandler(() => {
            this._options.wireStyle = wireStylePopup.value as WireStyle
            this.redrawMgr.addReason("wire style changed", null)
        }))
        optionsZone.appendChild(
            div(
                style("height: 20px"),
                S.Settings.wireStyle + " ", wireStylePopup
            ).render()
        )

        const propagationDelayField = input(type("number"),
            style("margin: 0 4px; width: 4em"),
            attr("min", "0"), attr("step", "50"),
            attr("value", String(this.options.propagationDelay)),
            attr("title", S.Settings.propagationDelay),
        ).render()
        propagationDelayField.addEventListener("change", () => {
            this._options.propagationDelay = propagationDelayField.valueAsNumber
        })
        optionsZone.appendChild(
            div(
                style("height: 20px"),
                S.Settings.propagationDelayField[0], propagationDelayField, S.Settings.propagationDelayField[1]
            ).render()
        )

        const zoomLevelField = input(type("number"),
            style("margin: 0 2px 0 5px; width: 4em"),
            attr("min", "0"), attr("step", "10"),
            attr("value", String(this.options.zoom)),
            attr("title", S.Settings.zoomLevel),
        ).render()
        zoomLevelField.addEventListener("change", this.wrapHandler(() => {
            const zoom = zoomLevelField.valueAsNumber
            this._options.zoom = zoom
            this._actualZoomFactor = clampZoom(zoom)
            this.redrawMgr.addReason("zoom level changed", null)
        }))
        optionsZone.appendChild(
            div(
                style("height: 20px"),
                S.Settings.zoomLevelField[0], zoomLevelField, S.Settings.zoomLevelField[1]
            ).render()
        )

        const showUserdataLink = a(S.Settings.showUserDataLink[1], style("text-decoration: underline; cursor: pointer")).render()
        showUserdataLink.addEventListener("click", () => {
            alert(S.Settings.userDataHeader + "\n\n" + JSON.stringify(this.userdata, undefined, 4))
        })
        const showUserDataLinkContainer = div(
            style("margin-top: 5px; display: none"),
            S.Settings.showUserDataLink[0], showUserdataLink,
        ).render()
        optionsZone.appendChild(showUserDataLinkContainer)

        this.optionsHtml = {
            nameField,
            hideWireColorsCheckbox,
            hideInputColorsCheckbox,
            hideOutputColorsCheckbox,
            hideMemoryContentCheckbox,
            wireStylePopup,
            showGateTypesCheckbox,
            showDisconnectedPinsCheckbox,
            hideTooltipsCheckbox,
            groupParallelWiresCheckbox,
            propagationDelayField,
            zoomLevelField,
            showUserDataLinkContainer,
        }

        // this is called once here to set the initial transform and size before the first draw, and again later
        this.setCanvasSize()

        this.tryLoadFromData()
        // also triggers redraw, should be last thing called here

        this.setModeFromString(this.getAttribute(ATTRIBUTE_NAMES.mode))

        // this is called a second time here because the canvas width may have changed following the mode change
        this.setCanvasSize()
        LogicEditor.installGlobalListeners()

        this.doRedraw()
    }

    private findLightDOMChild<K extends keyof HTMLElementTagNameMap>(tagName: K): HTMLElementTagNameMap[K] | null {
        tagName = tagName.toUpperCase() as any
        for (const child of Array.from(this.children)) {
            if (child.tagName === tagName) {
                return child as HTMLElementTagNameMap[K]
            }
        }
        return null
    }

    public static installGlobalListeners() {
        if (LogicEditor._globalListenersInstalled) {
            return
        }

        window.formatString = formatString

        // make gallery available globally
        window.gallery = gallery

        window.addEventListener("mousemove", e => {
            // console.log({ x: e.clientX, y: e.clientY })
            for (const editor of LogicEditor._allConnectedEditors) {
                const canvasContainer = editor.html.canvasContainer
                if (isDefined(canvasContainer)) {
                    const canvasPos = canvasContainer.getBoundingClientRect()
                    // console.log(canvasContainer.getBoundingClientRect(), { x: e.clientX - canvasPos.left, y: e.clientY - canvasPos.top })
                    editor.mouseX = e.clientX - canvasPos.left
                    editor.mouseY = e.clientY - canvasPos.top
                }
            }
            // console.log("--")
        }, true)

        window.addEventListener("resize", () => {
            for (const editor of LogicEditor._allConnectedEditors) {
                const canvasContainer = editor.html.canvasContainer
                if (isDefined(canvasContainer)) {
                    editor.wrapHandler(() => {
                        editor.setCanvasSize()
                        editor.redrawMgr.addReason("window resized", null)
                    })()
                }
            }
            registerPixelRatioListener()
        })

        let pixelRatioMediaQuery: undefined | MediaQueryList
        const registerPixelRatioListener = () => {
            if (isDefined(pixelRatioMediaQuery)) {
                pixelRatioMediaQuery.onchange = null
            }

            const queryString = `(resolution: ${window.devicePixelRatio}dppx)`
            pixelRatioMediaQuery = window.matchMedia(queryString)
            pixelRatioMediaQuery.onchange = () => {
                for (const editor of LogicEditor._allConnectedEditors) {
                    editor.wrapHandler(() => {
                        editor.redrawMgr.addReason("devicePixelRatio changed", null)
                    })()
                }
                registerPixelRatioListener()
            }
        }
        registerPixelRatioListener()

        document.body.addEventListener("themechanged", (e) => {
            const isDark = Boolean((e as any).detail?.is_dark_theme)
            setColors(isDark)
        })

        LogicEditor._globalListenersInstalled = true
    }

    public setMode(mode: Mode) {
        this.wrapHandler(() => {
            let wantedModeStr = Mode[mode]
            if (mode > this._maxInstanceMode) {
                mode = this._maxInstanceMode
                console.log(`Cannot switch to mode ${wantedModeStr} because we are capped by ${Mode[this._maxInstanceMode]}`)
                wantedModeStr = Mode[mode]
            }
            this._mode = mode

            // console.log(`Display/interaction is ${wantedModeStr} - ${mode}`)

            this.redrawMgr.addReason("mode changed", null)

            // update mode active button
            this.root.querySelectorAll(".sim-mode-tool").forEach((elem) => {
                if (elem.getAttribute("mode") === wantedModeStr) {
                    elem.classList.add("active")
                } else {
                    elem.classList.remove("active")
                }
            })

            if (mode < Mode.CONNECT) {
                this.setCurrentMouseAction("edit")
            }

            type LeftMenuDisplay = "show" | "hide" | "inactive"

            const showLeftMenu: LeftMenuDisplay =
                (this._maxInstanceMode !== Mode.FULL)
                    ? (mode >= Mode.DESIGN) ? "show" : "hide"
                    : (mode >= Mode.DESIGN) ? "show" : "inactive"

            const showRightEditControls = mode >= Mode.CONNECT
            const modifButtons = this.root.querySelectorAll("button.sim-modification-tool")
            for (let i = 0; i < modifButtons.length; i++) {
                const but = modifButtons[i] as HTMLElement
                setVisible(but, showRightEditControls)
            }

            const showReset = mode >= Mode.TRYOUT && !this._hideResetButton
            const showRightMenu = showReset || showRightEditControls
            const showOnlyReset = showReset && !showRightEditControls
            const hideSettings = mode < Mode.FULL

            setVisible(this.elemWithId("resetToolButton"), showReset)
            setVisible(this.elemWithId("resetToolButtonCaption"), !showOnlyReset)
            setVisible(this.elemWithId("resetToolButtonDummyCaption"), showOnlyReset)

            if (hideSettings) {
                setVisible(this.html.optionsZone, false)
            }

            const leftToolbar = this.html.leftToolbar
            switch (showLeftMenu) {
                case "hide":
                    leftToolbar.style.removeProperty("visibility")
                    leftToolbar.style.display = "none"
                    break
                case "show":
                    leftToolbar.style.removeProperty("visibility")
                    leftToolbar.style.removeProperty("display")
                    break
                case "inactive":
                    leftToolbar.style.visibility = "hidden"
                    leftToolbar.style.removeProperty("display")
                    break
            }

            // const showTxGates = mode >= Mode.FULL && (isUndefined(showOnly) || showOnly.includes("TX") || showOnly.includes("TXA"))
            // const txGateButton = this.root.querySelector("button[data-type=TXA]") as HTMLElement
            // setVisible(txGateButton, showTxGates)

            const rightToolbarContainer: HTMLElement = this.elemWithId("rightToolbarContainer")
            setVisible(rightToolbarContainer, showRightMenu)
        })()
    }

    public setModeFromString(modeStr: string | null) {
        let mode: Mode = this._maxInstanceMode
        if (modeStr !== null && (modeStr = modeStr.toUpperCase()) in Mode) {
            mode = (Mode as any)[modeStr]
        }
        this.setMode(mode)
    }

    public tryLoadFromFile(file: File) {
        if (file.type === "application/json" || file.type === "text/plain") {
            const reader = new FileReader()
            reader.onload = e => {
                const content = e.target?.result?.toString()
                if (isDefined(content)) {
                    this.load(content)
                }
            }
            reader.readAsText(file, "utf-8")
        } else if (file.type === "image/png") {
            const reader = new FileReader()
            reader.onload = e => {
                const content = e.target?.result
                if (content instanceof ArrayBuffer) {
                    const uintArray2 = new Uint8Array(content)
                    const pngMetadata = pngMeta.readMetadata(uintArray2)
                    const compressedJSON = pngMetadata.tEXt?.Description
                    if (isString(compressedJSON)) {
                        this._initialData = { _type: "compressed", str: compressedJSON }
                        this.tryLoadFromData()
                    }
                }
            }
            reader.readAsArrayBuffer(file)
        } else {
            console.log("Unsupported file type", file.type)
        }
    }

    public tryLoadFromData() {
        if (isUndefined(this._initialData)) {
            return
        }

        if (this._initialData._type === "url") {
            // load from URL
            const url = this._initialData.url
            // will only work within the same domain for now
            fetch(url, { mode: "cors" }).then(response => response.text()).then(json => {
                console.log(`Loaded initial data from URL '${url}'`)
                this._initialData = { _type: "json", json }
                this.tryLoadFromData()
            })

            // TODO try fetchJSONP if this fails?

            return
        }

        let error: undefined | string = undefined

        if (this._initialData._type === "json") {
            // already decompressed
            try {
                error = PersistenceManager.doLoadFromJson(this, this._initialData.json)
            } catch (e) {
                error = String(e) + " (JSON)"
            }

        } else {
            let decodedData
            try {
                decodedData = LZString.decompressFromEncodedURIComponent(this._initialData.str)
            } catch (err) {
                error = String(err) + " (LZString)"

                // try the old, uncompressed way of storing the data in the URL
                try {
                    decodedData = decodeURIComponent(atob(this._initialData.str.replace(/-/g, "+").replace(/_/g, "/").replace(/%3D/g, "=")))
                } catch (e) {
                    // swallow error from old format
                }
            }

            if (isUndefined(error) && isString(decodedData)) {
                // remember the decompressed/decoded value
                error = PersistenceManager.doLoadFromJson(this, decodedData!)
                if (isUndefined(error)) {
                    this._initialData = { _type: "json", json: decodedData }
                }
            }
        }


        if (isDefined(error)) {
            console.log("ERROR could not not load initial data: " + error)
        }
    }

    public load(jsonStringOrObject: string | Record<string, unknown>) {
        this.wrapHandler(
            (jsonStringOrObject: string | Record<string, unknown>) =>
                PersistenceManager.doLoadFromJson(this, jsonStringOrObject)
        )(jsonStringOrObject)
    }

    public setDirty(__reason: string) {
        if (this.mode >= Mode.CONNECT) {
            // other modes can't be dirty
            this._isDirty = true
        }
    }

    public setDark(dark: boolean) {
        this.html.rootDiv.classList.toggle("dark", dark)
    }

    public tryDeleteDrawable(comp: Drawable): boolean {
        if (comp instanceof ComponentBase) {
            const numDeleted = this.tryDeleteComponentsWhere(c => c === comp, true)
            return numDeleted !== 0
        } else if (comp instanceof Wire) {
            this.wireMgr.deleteWire(comp)
            return true
        } else if (comp instanceof Waypoint) {
            comp.removeFromParent()
            return true
        }
        return false
    }

    public trySetCurrentComponentOrientation(orient: Orientation, e: Event) {
        const currentMouseOverComp = this.cursorMovementMgr.currentMouseOverComp
        if (isDefined(currentMouseOverComp) && currentMouseOverComp instanceof DrawableWithPosition && currentMouseOverComp.canRotate()) {
            currentMouseOverComp.doSetOrient(orient)
            e.preventDefault()
            e.stopPropagation()
        }
    }

    public tryDeleteComponentsWhere(cond: (e: Component) => boolean, onlyOne: boolean) {
        const numDeleted = this.components.tryDeleteWhere(cond, onlyOne)
        if (numDeleted > 0) {
            this.cursorMovementMgr.clearPopperIfNecessary()
            this.redrawMgr.addReason("component(s) deleted", null)
        }
        return numDeleted
    }

    public setCurrentMouseAction(action: MouseAction) {
        this._currentMouseAction = action
        this.setToolCursor(MouseActions.props[action].cursor)

        const toolButtons = this.root.querySelectorAll(".sim-modification-tool")
        for (let i = 0; i < toolButtons.length; i++) {
            const toolButton = toolButtons[i] as HTMLElement
            const setActive = toolButton.getAttribute("tool") === action
            if (setActive) {
                toolButton.classList.add("active")
            } else {
                toolButton.classList.remove("active")
            }
        }

        this.cursorMovementMgr.setHandlersFor(action)
        this.redrawMgr.addReason("mouse action changed", null)
    }

    public updateCursor() {
        this.html.canvasContainer.style.cursor =
            this.moveMgr.areDrawablesMoving()
                ? "grabbing"
                : this._toolCursor
                ?? this.cursorMovementMgr.currentMouseOverComp?.cursorWhenMouseover
                ?? "default"
    }

    public lengthOfPath(svgPathDesc: string): number {
        const p = this.html.hiddenPath
        p.setAttribute("d", svgPathDesc)
        const length = p.getTotalLength()
        // console.log(`p=${svgPathDesc}, l=${length}`)
        return length
    }

    public offsetXYForContextMenu(e: MouseEvent | TouchEvent, snapToGrid = false): [number, number] {
        const mainCanvas = this.html.mainCanvas
        let x, y

        if ("offsetX" in e && e.offsetX === 0 && e.offsetY === 0 && e.target === mainCanvas) {
            const canvasRect = mainCanvas.getBoundingClientRect()
            x = e.clientX - canvasRect.x
            y = e.clientY - canvasRect.y
        } else {
            [x, y] = this.offsetXY(e)
        }

        if (snapToGrid) {
            x = Math.round(x / GRID_STEP) * GRID_STEP
            y = Math.round(y / GRID_STEP) * GRID_STEP
        }
        return [x, y]
    }

    public offsetXY(e: MouseEvent | TouchEvent): [number, number] {
        const [unscaledX, unscaledY] = (() => {
            const mainCanvas = this.html.mainCanvas
            let target = e.target
            if ("offsetX" in e) {
                // MouseEvent
                const canvasRect = mainCanvas.getBoundingClientRect()
                let offsetX = e.offsetX
                let offsetY = e.offsetY

                // fix for firefox having always 0 offsetX,Y
                if (offsetX === 0 && offsetY === 0) {
                    const _e = e as any
                    if ("_savedOffsetX" in _e) {
                        offsetX = _e._savedOffsetX
                        offsetY = _e._savedOffsetY
                        target = _e._savedTarget
                    } else if ("layerX" in e) {
                        // This should never happen and is actually wrong, because we assume 
                        offsetX = _e.layerX + canvasRect.x
                        offsetY = _e.layerY + canvasRect.y
                    }
                }

                if (target === mainCanvas) {
                    return [offsetX, offsetY]
                } else {
                    const elemRect = (target as HTMLElement).getBoundingClientRect()
                    return [
                        Math.max(GRID_STEP * 2, offsetX + elemRect.x - canvasRect.x),
                        Math.max(GRID_STEP * 2, offsetY + elemRect.y - canvasRect.y),
                    ]
                }
            } else {
                const elemRect = (target as HTMLElement).getBoundingClientRect()
                const bodyRect = document.body.getBoundingClientRect()
                const touch = e.changedTouches[0]
                const offsetX = touch.pageX - (elemRect.left - bodyRect.left)
                const offsetY = touch.pageY - (elemRect.top - bodyRect.top)

                if (target === mainCanvas) {
                    return [offsetX, offsetY]
                } else {
                    const canvasRect = mainCanvas.getBoundingClientRect()
                    return [
                        Math.max(GRID_STEP * 2, offsetX + elemRect.x - canvasRect.x),
                        Math.max(GRID_STEP * 2, offsetY + elemRect.y - canvasRect.y),
                    ]
                }
            }
        })()
        const currentScale = this._actualZoomFactor
        return [unscaledX / currentScale, unscaledY / currentScale]
    }

    public offsetXYForComponent(e: MouseEvent | TouchEvent, comp: Component): [number, number] {
        const offset = this.offsetXY(e)
        if (comp.orient === Orientation.default) {
            return offset
        }
        const [x, y] = offset
        const dx = x - comp.posX
        const dy = y - comp.posY
        switch (comp.orient) {
            case "e": return offset // done before anyway
            case "w": return [comp.posX - dx, comp.posY - dy]
            case "s": return [comp.posX - dy, comp.posY - dx]
            case "n": return [comp.posX + dy, comp.posY + dx]
        }
    }

    private guessAdequateCanvasSize(applyZoom: boolean): [number, number] {
        let rightmostX = Number.NEGATIVE_INFINITY, leftmostX = Number.POSITIVE_INFINITY
        let lowestY = Number.NEGATIVE_INFINITY, highestY = Number.POSITIVE_INFINITY
        for (const comp of this.components.all()) {
            const cx = comp.posX
            const width = comp.width
            const left = cx - width / 2
            const right = left + width
            if (right > rightmostX) {
                rightmostX = right
            }
            if (left < leftmostX) {
                leftmostX = left
            }

            const cy = comp.posY
            const height = comp.height
            const top = cy - height / 2
            const bottom = top + height
            if (bottom > lowestY) {
                lowestY = bottom
            }
            if (top < highestY) {
                highestY = top
            }
        }
        leftmostX = Math.max(0, leftmostX)
        let w = rightmostX + leftmostX // add right margin equal to left margin
        if (isNaN(w)) {
            w = 300
        }
        highestY = Math.max(0, highestY)
        let h = highestY + lowestY // add lower margin equal to top margin
        if (isNaN(h)) {
            h = 150
        }
        const f = applyZoom ? this._actualZoomFactor : 1
        return [f * w, f * h]
    }

    public async shareSheetForMode(mode: Mode) {
        if (this._mode > MAX_MODE_WHEN_EMBEDDED) {
            this._mode = MAX_MODE_WHEN_EMBEDDED
        }
        const modeStr = Mode[mode].toLowerCase()
        const [fullJson, compressedUriSafeJson] = this.fullJsonStateAndCompressedForUri()

        console.log("JSON:\n" + fullJson)

        const fullUrl = this.fullUrlForMode(mode, compressedUriSafeJson)
        this.html.embedUrl.value = fullUrl

        const modeParam = mode === MAX_MODE_WHEN_EMBEDDED ? "" : `:mode: ${modeStr}\n`
        const embedHeight = this.guessAdequateCanvasSize(true)[1]

        const markdownBlock = `\`\`\`{logic}\n:height: ${embedHeight}\n${modeParam}\n${fullJson}\n\`\`\``
        this.html.embedMarkdown.value = markdownBlock

        const iframeEmbed = `<iframe style="width: 100%; height: ${embedHeight}px; border: 0" src="${fullUrl}"></iframe>`
        this.html.embedIframe.value = iframeEmbed

        const webcompEmbed = `<div style="width: 100%; height: ${embedHeight}px">\n  <logic-editor mode="${Mode[mode].toLowerCase()}">\n    <script type="application/json">\n      ${fullJson.replace(/\n/g, "\n      ")}\n    </script>\n  </logic-editor>\n</div>`
        this.html.embedWebcomp.value = webcompEmbed


        // const dataUrl = await QRCode.toDataURL(fullUrl, { margin: 0, errorCorrectionLevel: 'L' })
        // const qrcodeImg = this.html.embedUrlQRCode
        // qrcodeImg.src = dataUrl

        this.saveToUrl(compressedUriSafeJson)

        if (!showModal(this.html.embedDialog)) {
            // alert("The <dialog> API is not supported by this browser")

            // TODO show the info some other way

            if (copyToClipboard(fullUrl)) {
                console.log("  -> Copied!")
            } else {
                console.log("  -> Could not copy!")
            }
        }
    }

    public saveCurrentStateToUrl() {
        const [fullJson, compressedUriSafeJson] = this.fullJsonStateAndCompressedForUri()
        console.log("Saved to URL:\n" + fullJson)
        this.saveToUrl(compressedUriSafeJson)
    }

    public save(): Workspace {
        return PersistenceManager.buildWorkspace(this)
    }

    public saveToUrl(compressedUriSafeJson: string) {
        if (this._isSingleton) {
            history.pushState(null, "", this.fullUrlForMode(MAX_MODE_WHEN_SINGLETON, compressedUriSafeJson))
            this._isDirty = false
        }
    }

    private fullJsonStateAndCompressedForUri(): [string, string] {
        const jsonObj = PersistenceManager.buildWorkspace(this)
        const jsonFull = PersistenceManager.stringifyWorkspace(jsonObj, false)
        PersistenceManager.removeShowOnlyFrom(jsonObj)
        const jsonForUri = PersistenceManager.stringifyWorkspace(jsonObj, true)

        // We did this in the past, but now we're compressing things a bit
        // const encodedJson1 = btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "%3D")

        // this can compress to like 40-50% of the original size
        const compressedUriSafeJson = LZString.compressToEncodedURIComponent(jsonForUri)
        return [jsonFull, compressedUriSafeJson]
    }

    private fullUrlForMode(mode: Mode, compressedUriSafeJson: string): string {
        const loc = window.location
        const showOnlyParam = isUndefined(this._options.showOnly) ? "" : `&${ATTRIBUTE_NAMES.showonly}=${this._options.showOnly.join(",")}`
        return `${loc.protocol}//${loc.host}${loc.pathname}?${ATTRIBUTE_NAMES.mode}=${Mode[mode].toLowerCase()}${showOnlyParam}&${ATTRIBUTE_NAMES.data}=${compressedUriSafeJson}`
    }

    private async toPNG(heightHint?: number) {
        return new Promise<Blob | null>((resolve) => {
            const drawingScale = 3 // super retina
            let [width, height] = this.guessAdequateCanvasSize(false)
            if (isDefined(heightHint)) {
                height = heightHint
            }
            width *= drawingScale
            height *= drawingScale

            const transform = new DOMMatrix(`scale(${drawingScale})`)

            const tmpCanvas = document.createElement('canvas')
            tmpCanvas.width = width
            tmpCanvas.height = height

            const g = tmpCanvas.getContext('2d')!
            const wasDark = isDarkMode()
            if (wasDark) {
                setColors(false)
            }
            this.doDrawWithContext(g, width, height, transform, transform, true, true)
            if (wasDark) {
                setColors(true)
            }
            tmpCanvas.toBlob(resolve, 'image/png')
            tmpCanvas.remove()

            // TODO this was an attempt at generating SVG rather than PNG
            // const svgCtx = new C2S(width, height)
            // this.doDrawWithContext(svgCtx)
            // const serializedSVG = svgCtx.getSerializedSvg()
            // console.log(serializedSVG)
        })
    }

    public async toPNGBase64(heightHint?: number) {
        const blob = await this.toPNG(heightHint)
        if (blob === null) {
            return null
        }
        return new Promise<string>((resolve) => {
            const reader = new FileReader()
            reader.onloadend = () => {
                let dataURL = reader.result as string
                const prefix = "data:image/png;base64,"
                if (dataURL.startsWith(prefix)) {
                    dataURL = dataURL.substring(prefix.length)
                }
                resolve(dataURL)
            }
            reader.readAsDataURL(blob)
        })
    }

    public async downloadSnapshotImage() {
        const pngBareBlob = await this.toPNG()
        if (pngBareBlob === null) {
            return
        }
        const [__, compressedUriSafeJson] = this.fullJsonStateAndCompressedForUri()

        const pngBareData = new Uint8Array(await pngBareBlob.arrayBuffer())
        const pngChunks = pngMeta.extractChunks(pngBareData)
        pngMeta.insertMetadata(pngChunks, { "tEXt": { "Description": compressedUriSafeJson } })
        const pngCompletedBlob = new Blob([pngMeta.encodeChunks(pngChunks)], { type: "image/png" })

        const filename = (this.options.name ?? "circuit") + ".png"
        const url = URL.createObjectURL(pngCompletedBlob)
        downloadDataUrl(url, filename)
    }


    public recalcPropagateAndDrawIfNeeded() {
        if (this._nextAnimationFrameHandle !== null) {
            // an animation frame will be played soon anyway
            return
        }

        const __recalculated = this.recalcMgr.recalcAndPropagateIfNeeded()

        if (this.wireMgr.isAddingWire) {
            this.redrawMgr.addReason("adding a wire", null)
        }

        const redrawReasons = this.redrawMgr.getReasonsAndClear()
        if (isUndefined(redrawReasons)) {
            return
        }

        // console.log("Drawing " + (__recalculated ? "with" : "without") + " recalc, reasons:\n    " + redrawReasons)
        // console.log("Drawing")
        this.doRedraw()

        if (this.redrawMgr.hasReasons()) {
            // an animation is running
            this._nextAnimationFrameHandle = requestAnimationFrame(() => {
                this._nextAnimationFrameHandle = null
                this.recalcPropagateAndDrawIfNeeded()
            })
        }
    }

    public highlight(refs: string | string[] | undefined) {
        if (isUndefined(refs)) {
            this._highlightedItems = undefined
            return
        }

        if (isString(refs)) {
            refs = [refs]
        }

        const highlightComps: Component[] = []
        for (const comp of this.components.all()) {
            if (isDefined(comp.ref) && refs.includes(comp.ref)) {
                highlightComps.push(comp)
            }
        }

        const highlightWires: Wire[] = []
        for (const wire of this.wireMgr.wires) {
            if (isDefined(wire.ref) && refs.includes(wire.ref)) {
                highlightWires.push(wire)
            }
        }

        if (highlightComps.length === 0 && highlightWires.length === 0) {
            console.log(`Nothing to highlight for ref '${refs}'`)
            this._highlightedItems = undefined
            return
        }

        const start = this.timeline.unadjustedTime()
        this._highlightedItems = { comps: highlightComps, wires: highlightWires, start }
        this.redrawMgr.addReason("highlighting component", null)
        this.recalcPropagateAndDrawIfNeeded()
    }

    public redraw() {
        this.setCanvasSize()
        this.redrawMgr.addReason("explicit redraw call", null)
        this.recalcPropagateAndDrawIfNeeded()
    }

    private doRedraw() {
        const g = this.html.mainCanvas.getContext("2d")!
        const mainCanvas = this.html.mainCanvas
        const baseDrawingScale = this._baseDrawingScale

        const width = mainCanvas.width / baseDrawingScale
        const height = mainCanvas.height / baseDrawingScale
        const baseTransform = new DOMMatrix(`scale(${this._baseDrawingScale})`)
        const contentTransform = baseTransform.scale(this._actualZoomFactor)
        this.doDrawWithContext(g, width, height, baseTransform, contentTransform, false, false)
    }

    private doDrawWithContext(g: CanvasRenderingContext2D, width: number, height: number, baseTransform: DOMMatrixReadOnly, contentTransform: DOMMatrixReadOnly, skipBorder: boolean, transparentBackground: boolean) {
        g.setTransform(baseTransform)
        g.lineCap = "square"
        g.textBaseline = "middle"

        // clear background
        g.fillStyle = COLOR_BACKGROUND
        if (transparentBackground) {
            g.clearRect(0, 0, width, height)
        } else {
            g.fillRect(0, 0, width, height)
        }
        g.setTransform(contentTransform)

        // draw highlight
        const highlightRectFor = (comp: Component) => {
            const margin = 15
            let w = comp.unrotatedWidth + margin + margin
            let h = comp.unrotatedHeight + margin + margin
            if (Orientation.isVertical(comp.orient)) {
                const t = w
                w = h
                h = t
            }
            return new DOMRect(comp.posX - w / 2, comp.posY - h / 2, w, h)
        }

        const highlightedItems = this._highlightedItems
        let highlightColor: string | undefined = undefined
        if (isDefined(highlightedItems)) {
            const HOLD_TIME = 2000
            const FADE_OUT_TIME = 200
            const START_ALPHA = 0.4
            const elapsed = this.timeline.unadjustedTime() - highlightedItems.start
            const highlightAlpha = (elapsed < HOLD_TIME) ? START_ALPHA : START_ALPHA * (1 - (elapsed - HOLD_TIME) / FADE_OUT_TIME)
            if (highlightAlpha <= 0) {
                this._highlightedItems = undefined
            } else {

                g.beginPath()
                for (const comp of highlightedItems.comps) {
                    const highlightRect = highlightRectFor(comp)
                    g.moveTo(highlightRect.x, highlightRect.y)
                    g.lineTo(highlightRect.right, highlightRect.y)
                    g.lineTo(highlightRect.right, highlightRect.bottom)
                    g.lineTo(highlightRect.x, highlightRect.bottom)
                    g.closePath()
                }

                highlightColor = `rgba(238,241,0,${highlightAlpha})`
                g.shadowColor = highlightColor
                g.shadowBlur = 20
                g.shadowOffsetX = 0
                g.shadowOffsetY = 0
                g.fillStyle = highlightColor
                g.fill()

                g.shadowBlur = 0 // reset

                // will make it run until alpha is 0
                this.redrawMgr.addReason("highlight animation", null)
            }
        }

        // draw grid if moving comps
        const isMovingComponent = this.moveMgr.areDrawablesMoving()
        if (isMovingComponent) {
            const widthAdjusted = width / this._actualZoomFactor
            const heightAdjusted = height / this._actualZoomFactor
            const step = GRID_STEP //* 2
            g.strokeStyle = COLOR_GRID_LINES
            g.lineWidth = 1
            g.beginPath()
            for (let x = step; x < widthAdjusted; x += step) {
                g.moveTo(x, 0)
                g.lineTo(x, height)
            }
            for (let y = step; y < heightAdjusted; y += step) {
                g.moveTo(0, y)
                g.lineTo(width, y)
            }
            g.stroke()
        }

        // draw guidelines when moving waypoint
        const singleMovingWayoint = this.moveMgr.getSingleMovingWaypoint()
        if (isDefined(singleMovingWayoint)) {
            const guides = singleMovingWayoint.getPrevAndNextAnchors()
            g.strokeStyle = COLOR_GRID_LINES_GUIDES
            g.lineWidth = 1.5
            g.beginPath()
            for (const guide of guides) {
                g.moveTo(guide.posX, 0)
                g.lineTo(guide.posX, height)
                g.moveTo(0, guide.posY)
                g.lineTo(width, guide.posY)
            }
            g.stroke()
        }

        // draw border according to mode
        if (!skipBorder && (this._mode >= Mode.CONNECT || this._maxInstanceMode === MAX_MODE_WHEN_SINGLETON)) {
            g.setTransform(baseTransform)
            g.strokeStyle = COLOR_BORDER
            g.lineWidth = 2
            g.strokeRect(0, 0, width, height)
            if (this._maxInstanceMode === MAX_MODE_WHEN_SINGLETON && this._mode < this._maxInstanceMode) {
                const h = this.guessAdequateCanvasSize(true)[1]
                strokeSingleLine(g, 0, h, width, h)

                g.fillStyle = COLOR_BACKGROUND_UNUSED_REGION
                g.fillRect(0, h, width, height - h)
            }
            g.setTransform(contentTransform)
        }

        // const currentScale = this._currentScale
        // g.scale(currentScale, currentScale)

        const drawTime = this.timeline.adjustedTime()
        g.strokeStyle = COLOR_COMPONENT_BORDER
        const currentMouseOverComp = this.cursorMovementMgr.currentMouseOverComp
        const drawParams: DrawParams = {
            drawTime,
            currentMouseOverComp,
            highlightedItems,
            highlightColor,
            currentSelection: undefined,
            anythingMoving: this.moveMgr.areDrawablesMoving(),
        }
        const currentSelection = this.cursorMovementMgr.currentSelection
        drawParams.currentSelection = currentSelection
        const drawComp = (comp: Component) => {
            comp.draw(g, drawParams)
            for (const node of comp.allNodes()) {
                node.draw(g, drawParams) // never show nodes as selected
            }
        }

        // draw background components
        for (const comp of this.components.withZIndex(DrawZIndex.Background)) {
            drawComp(comp)
        }

        // draw wires
        this.wireMgr.draw(g, drawParams) // never show wires as selected

        // draw normal components
        for (const comp of this.components.withZIndex(DrawZIndex.Normal)) {
            drawComp(comp)
        }

        // draw overlays
        for (const comp of this.components.withZIndex(DrawZIndex.Overlay)) {
            drawComp(comp)
        }

        // draw selection
        let selRect
        if (isDefined(currentSelection) && isDefined(selRect = currentSelection.currentlyDrawnRect)) {
            g.lineWidth = 1.5
            g.strokeStyle = "rgb(100,100,255)"
            g.fillStyle = "rgba(100,100,255,0.2)"
            g.beginPath()
            g.rect(selRect.x, selRect.y, selRect.width, selRect.height)
            g.stroke()
            g.fill()
        }

    }

    public cut() {
        // TODO stubs
        console.log("cut")
    }

    public copy() {
        if (isUndefined(this.cursorMovementMgr.currentSelection)) {
            // copy URL
            copyToClipboard(window.location.href)
            return
        }
        // TODO stubs
        console.log("copy")
    }

    public paste() {
        // TODO stubs
        console.log("paste")
    }


    public wrapHandler<T extends unknown[], R>(f: (...params: T) => R): (...params: T) => R {
        return (...params: T) => {
            const result = f(...params)
            this.recalcPropagateAndDrawIfNeeded()
            return result
        }
    }
}

export class LogicStatic {

    public singleton: LogicEditor | undefined

    public highlight(diagramRefs: string | string[], componentRefs: string | string[]) {
        if (isString(diagramRefs)) {
            diagramRefs = [diagramRefs]
        }
        for (const diagramRef of diagramRefs) {
            const diagram = document.getElementById("logic_" + diagramRef)
            if (diagram === null) {
                console.log(`Cannot find logic diagram with reference '${diagramRef}'`)
                return
            }
            if (!(diagram instanceof LogicEditor)) {
                console.log(`Element with id '${diagramRef}' is not a logic editor`)
                return
            }
            diagram.highlight(componentRefs)
        }
    }

    public printUndoStack() {
        this.singleton?.undoMgr.dump()
    }

    public tests = new Tests()

}

const template = (() => {
    const template = document.createElement('template')
    template.innerHTML = LogicEditorTemplate
    const styles = [LogicEditorCSS, DialogPolyfillCSS]
    template.content.querySelector("#inlineStyle")!.innerHTML = styles.join("\n\n\n")

    template.content.querySelectorAll("i.svgicon").forEach((_iconElem) => {
        const iconElem = _iconElem as HTMLElement
        const iconName = iconElem.dataset.icon ?? "question"
        if (isIconName(iconName)) {
            iconElem.innerHTML = inlineIconSvgFor(iconName)
        } else {
            console.log(`Unknown icon name '${iconName}'`)
        }
    })
    return template
})()
// cannot be in setup function because 'template' var is not assigned until that func returns
// and promotion of elems occurs during this 'customElements.define' call
window.Logic = new LogicStatic()
window.customElements.define('logic-editor', LogicEditor)
document.addEventListener("toggle", e => {
    if (!(e.target instanceof HTMLDetailsElement)) {
        return
    }
    if (e.target.open) {
        e.target.querySelectorAll("logic-editor").forEach(el => {
            if (el instanceof LogicEditor) {
                el.redraw()
            }
        })
    }
}, true)
