import { Component, ComponentName, isNodeArray, ReadonlyGroupedNodeArray } from "./components/Component"
import { LedColor } from "./components/DisplayBar"
import { DrawContext, DrawContextExt, GraphicsRendering, HasPosition, Orientation } from "./components/Drawable"
import { Node, WireColor } from "./components/Node"
import { RectangleColor } from "./components/Rectangle"
import { CPUStageColor } from "./components/CPU"
import { LogicEditor } from "./LogicEditor"
import { EdgeTrigger, FixedArray, FixedArrayAssert, InBrowser, isArray, isHighImpedance, isNumber, isString, isUnknown, LogicValue, Mode, Unknown } from "./utils"



//
// GRID, GENERAL
//

export const GRID_STEP = 10
export const WIRE_WIDTH = 8
export const WAYPOINT_DIAMETER = 8
const WAYPOINT_HIT_RANGE = WAYPOINT_DIAMETER + 5


export function pxToGrid(x: number) {
    return Math.round(x / GRID_STEP)
}

export function clampZoom(zoom: number) {
    return Math.max(0.1, Math.min(10, zoom / 100))
}

export function dist(x0: number, y0: number, x1: number, y1: number): number {
    const dx = x1 - x0
    const dy = y1 - y0
    return Math.sqrt(dx * dx + dy * dy)
}

export function inRect(centerX: number, centerY: number, width: number, height: number, pointX: number, pointY: number): boolean {
    const w2 = width / 2
    const h2 = height / 2
    return pointX >= centerX - w2 && pointX < centerX + w2 &&
        pointY >= centerY - h2 && pointY < centerY + h2
}

export class DrawingRect {

    public readonly width: number
    public readonly height: number

    public readonly top: number
    public readonly left: number
    public readonly bottom: number
    public readonly right: number

    public constructor(comp: Component, honorRotation: boolean) {
        this.width = comp.unrotatedWidth
        this.height = comp.unrotatedHeight

        const swapDims = honorRotation && Orientation.isVertical(comp.orient)
        if (swapDims) {
            [this.width, this.height] = [this.height, this.width]
        }

        this.top = comp.posY - this.height / 2
        this.left = comp.posX - this.width / 2
        this.bottom = this.top + this.height
        this.right = this.left + this.width
    }

    public outline(g: GraphicsRendering, margin: number = 0): Path2D {
        const path = g.createPath()
        path.rect(this.left - margin, this.top - margin, this.width + margin * 2, this.height + margin * 2)
        return path
    }

}


//
// COLORS
//

export type ColorGreyLevel = number
export type ColorComponentsRGB = [number, number, number]
export type ColorComponentsRGBA = [number, number, number, number]
export type ColorString = string

export const COLOR_TRANSPARENT: ColorString = "rgba(0,0,0,0)"
export const USER_COLORS = {
    COLOR_BACKGROUND: undefined as ColorString | undefined,
}
export let COLOR_BACKGROUND: ColorString
export let COLOR_OFF_BACKGROUND: ColorString
export let COLOR_BACKGROUND_UNUSED_REGION: ColorString
export let COLOR_BACKGROUND_INVALID: ColorString
export let COLOR_BORDER: ColorString
export let COLOR_GRID_LINES: ColorString
export let COLOR_GRID_LINES_GUIDES: ColorString
export let COLOR_LABEL_OFF: ColorString
export let COLOR_LABEL_ON: ColorString
export let COLORCOMP_COMPONENT_BORDER: ColorGreyLevel
export let COLOR_COMPONENT_BORDER: ColorString
export let COLOR_COMPONENT_INNER_LABELS: ColorString
export let COLOR_GROUP_SPAN: ColorString
export let COLOR_WIRE_BORDER: ColorString
export let COLOR_MOUSE_OVER: ColorString
export let COLOR_MOUSE_OVER_NORMAL: ColorString
export let COLOR_MOUSE_OVER_DANGER: ColorString
export let COLOR_NODE_MOUSE_OVER: ColorString
export let COLORCOMPS_FULL: ColorComponentsRGB
export let COLOR_FULL: ColorString
export let COLOR_FULL_ALT: ColorString
export let COLOR_DARK_RED: ColorString
export let COLORCOMPS_EMPTY: ColorComponentsRGB
export let COLOR_EMPTY: ColorString
export let COLOR_EMPTY_ALT: ColorString
export let COLOR_UNKNOWN: ColorString
export let COLOR_UNKNOWN_ALT: ColorString
export let COLOR_HIGH_IMPEDANCE: ColorString
export let COLOR_GATE_NAMES: ColorString
export let COLOR_LED_ON: { [C in LedColor]: ColorString }
export let COLOR_WIRE: { [C in WireColor]: ColorString }
export let COLOR_RECTANGLE_BACKGROUND: { [C in RectangleColor]: ColorString }
export let COLOR_RECTANGLE_BORDER: { [C in RectangleColor]: ColorString }
export let COLOR_CPUSTAGE_BACKGROUND : { [C in CPUStageColor] : ColorString }
export let COLOR_CPUSTAGE_TEXT : { [C in CPUStageColor] : ColorString }
export let PATTERN_STRIPED_GRAY: CanvasPattern

let _currentModeIsDark = false
doSetColors(_currentModeIsDark)

export function setDarkMode(darkMode: boolean, force: boolean) {
    if (force || darkMode !== _currentModeIsDark) {
        doSetColors(darkMode)
        for (const editor of LogicEditor.allConnectedEditors) {
            editor.wrapHandler(() => {
                editor.setDark(darkMode)
                editor.editTools.redrawMgr.addReason("dark/light mode switch", null)
            })()
        }
    }
}

export function isDarkMode() {
    return _currentModeIsDark
}

function doSetColors(darkMode: boolean) {
    if (!darkMode) {
        // Light Theme
        COLOR_BACKGROUND = ColorString(0xFF)
        COLOR_OFF_BACKGROUND = ColorString(0xDF)
        COLOR_BACKGROUND_INVALID = ColorString([0xFF, 0xBB, 0xBB])
        COLOR_BACKGROUND_UNUSED_REGION = ColorString(0xEE)
        COLOR_BORDER = ColorString(200)
        COLOR_GRID_LINES = ColorString(240)
        COLOR_GRID_LINES_GUIDES = ColorString(215)
        COLOR_LABEL_OFF = ColorString(0xFF)
        COLOR_LABEL_ON = ColorString(0)
        COLORCOMP_COMPONENT_BORDER = 0x00
        COLOR_COMPONENT_INNER_LABELS = ColorString(0xAA)
        COLOR_GROUP_SPAN = ColorString([128, 128, 128, 0.13])
        COLOR_WIRE_BORDER = ColorString(80)
        COLOR_MOUSE_OVER_NORMAL = ColorString([0, 0x7B, 0xFF])
        COLOR_MOUSE_OVER_DANGER = ColorString([194, 34, 14])
        COLOR_NODE_MOUSE_OVER = ColorString([128, 128, 128, 0.5])
        COLORCOMPS_FULL = [255, 193, 7]
        COLOR_DARK_RED = ColorString([180, 0, 0])
        COLORCOMPS_EMPTY = [52, 58, 64]
        COLOR_UNKNOWN = ColorString([152, 158, 164])
        COLOR_HIGH_IMPEDANCE = ColorString([137, 114, 35])
        COLOR_GATE_NAMES = ColorString([190, 190, 190])
        COLOR_LED_ON = {
            green: ColorString([20, 232, 20]),
            red: ColorString([232, 20, 20]),
            yellow: ColorString([232, 232, 20]),
        }
        COLOR_WIRE = {
            black: COLOR_WIRE_BORDER,
            red: ColorString([206, 63, 57]),
            blue: ColorString([77, 102, 153]),
            yellow: ColorString([245, 209, 63]),
            green: ColorString([87, 136, 97]),
            white: ColorString([230, 217, 199]),
        }
        PATTERN_STRIPED_GRAY = createStripedPattern(COLOR_BACKGROUND, "rgba(128,128,128,0.2)")

    } else {
        // Dark Theme
        COLOR_BACKGROUND = USER_COLORS.COLOR_BACKGROUND ?? ColorString(30)
        COLOR_OFF_BACKGROUND = ColorString(60)
        COLOR_BACKGROUND_INVALID = ColorString([0xA8, 0x14, 0x14])
        COLOR_BACKGROUND_UNUSED_REGION = ColorString(55)
        COLOR_BORDER = ColorString(0x55)
        COLOR_GRID_LINES = ColorString(30)
        COLOR_GRID_LINES_GUIDES = ColorString(45)
        COLOR_LABEL_OFF = ColorString(185)
        COLOR_LABEL_ON = COLOR_BACKGROUND
        COLORCOMP_COMPONENT_BORDER = 220
        COLOR_COMPONENT_INNER_LABELS = ColorString(0x8B)
        COLOR_GROUP_SPAN = ColorString([128, 128, 128, 0.13])
        COLOR_WIRE_BORDER = ColorString(175)
        COLOR_MOUSE_OVER_NORMAL = ColorString([0, 0x7B, 0xFF])
        COLOR_MOUSE_OVER_DANGER = ColorString([194, 34, 14])
        COLOR_NODE_MOUSE_OVER = ColorString([128, 128, 128, 0.5])
        COLORCOMPS_FULL = [255, 193, 7]
        COLOR_DARK_RED = ColorString([180, 0, 0])
        COLORCOMPS_EMPTY = [80, 89, 99]
        COLOR_UNKNOWN = ColorString([108, 106, 98])
        COLOR_HIGH_IMPEDANCE = ColorString([103, 84, 23])
        COLOR_GATE_NAMES = ColorString([95, 95, 95])
        COLOR_LED_ON = {
            green: ColorString([11, 144, 11]),
            red: ColorString([144, 11, 11]),
            yellow: ColorString([144, 144, 11]),
        }
        COLOR_WIRE = {
            black: COLOR_WIRE_BORDER,
            red: ColorString([206, 63, 57]), // TODO update these colors below
            blue: ColorString([77, 102, 153]),
            yellow: ColorString([245, 209, 63]),
            green: ColorString([87, 136, 97]),
            white: ColorString([230, 217, 199]),
        }
        PATTERN_STRIPED_GRAY = createStripedPattern(COLOR_BACKGROUND, "rgba(128,128,128,0.4)")

    }

    // same for both light and dark theme thanks to alpha
    COLOR_RECTANGLE_BACKGROUND = {
        yellow: ColorString([230, 230, 0, 0.2]),
        blue: ColorString([54, 54, 255, 0.2]),
        green: ColorString([54, 255, 54, 0.2]),
        red: ColorString([255, 54, 54, 0.2]),
        grey: ColorString([120, 120, 120, 0.2]),
        turquoise: ColorString([0, 210, 210, 0.2]),
    }
    COLOR_RECTANGLE_BORDER = {
        yellow: ColorString([196, 196, 0, 0.5]),
        blue: ColorString([115, 115, 255, 0.5]),
        green: ColorString([0, 167, 0, 0.5]),
        red: ColorString([214, 0, 0, 0.5]),
        grey: ColorString([35, 35, 35, 0.5]),
        turquoise: ColorString([0, 162, 162, 0.5]),
    }
    COLOR_CPUSTAGE_BACKGROUND = {
        green: ColorString([54, 255, 54, 0.2]),
        blue: ColorString([54, 54, 255, 0.2]),
        orange: ColorString([238, 154, 0, 0.2]),
        grey: ColorString([120, 120, 120, 0.2]),
    }
    COLOR_CPUSTAGE_TEXT = {
        green: ColorString([0, 167, 0, 0.8]),
        blue: ColorString([115, 115, 255, 0.8]),
        orange: ColorString([204, 120, 0, 0.8]),
        grey: ColorString([35, 35, 35, 0.5]),
    }
    COLOR_COMPONENT_BORDER = ColorString(COLORCOMP_COMPONENT_BORDER)
    setColorMouseOverIsDanger(false)
    COLOR_FULL = ColorString(COLORCOMPS_FULL)
    COLOR_EMPTY = ColorString(COLORCOMPS_EMPTY)
    COLOR_FULL_ALT = ligherColor(COLOR_FULL, 40)
    COLOR_EMPTY_ALT = ligherColor(COLOR_EMPTY, 80)
    COLOR_UNKNOWN_ALT = ligherColor(COLOR_UNKNOWN, 50)
    _currentModeIsDark = darkMode
}

function createStripedPattern(background: ColorString, stripeColor: string) {
    if (!InBrowser) {
        return null!
    }
    const canvas = document.createElement("canvas")
    const step = 4
    canvas.width = 2 * step
    canvas.height = 6 * step
    const g = canvas.getContext("2d")!
    g.fillStyle = background
    g.fillRect(0, 0, canvas.width, canvas.height)
    g.fillStyle = stripeColor
    g.beginPath()
    g.moveTo(step, 0)
    g.lineTo(canvas.width, 0)
    g.lineTo(0, canvas.height)
    g.lineTo(0, 3 * step)
    g.closePath()
    g.moveTo(step, canvas.height)
    g.lineTo(canvas.width, canvas.height)
    g.lineTo(canvas.width, 3 * step)
    g.closePath()
    g.fill()
    const pattern = g.createPattern(canvas, "repeat")
    if (pattern === null) {
        console.warn("Failed to create pattern")
    }
    return pattern!
}

export function setColorMouseOverIsDanger(mouseOverIsDanger: boolean) {
    COLOR_MOUSE_OVER = mouseOverIsDanger ? COLOR_MOUSE_OVER_DANGER : COLOR_MOUSE_OVER_NORMAL
}

export function ColorString(input: ColorGreyLevel | ColorComponentsRGB | ColorComponentsRGBA): ColorString {
    if (isArray(input)) {
        if (input.length === 3) {
            return `rgb(${input[0]},${input[1]},${input[2]})`
        }
        // else, rgba
        return `rgba(${input[0]},${input[1]},${input[2]},${input[3]})`
    }
    // else, grey
    return `rgb(${input},${input},${input})`
}

export function colorCompsRGB(c: ColorString): ColorComponentsRGB {
    const PREFIX = "rgb("
    if (c.startsWith(PREFIX)) {
        c = c.substring(PREFIX.length)
    }
    const SUFFIX = ")"
    if (c.endsWith(SUFFIX)) {
        c = c.substring(0, c.length - SUFFIX.length)
    }
    const comps = c.split(',').map(compStr => parseInt(compStr))
    return FixedArrayAssert(comps, 3)
}

export function ligherColor(col: string, offset: number): string {
    const components = colorCompsRGB(col)
    const newComponents = FixedArrayAssert(components.map(c => Math.min(255, c + offset)), 3)
    return ColorString(newComponents)
}

export function colorForLogicValue(value: LogicValue): ColorString {
    return isUnknown(value) ? COLOR_UNKNOWN : isHighImpedance(value) ? COLOR_HIGH_IMPEDANCE : value ? COLOR_FULL : COLOR_EMPTY
}
export function colorsForLogicValue(value: LogicValue): [ColorString, ColorString] {
    return isUnknown(value) ? [COLOR_UNKNOWN, COLOR_UNKNOWN_ALT] : isHighImpedance(value) ? [COLOR_HIGH_IMPEDANCE, COLOR_HIGH_IMPEDANCE /* not alt because High-Z is not animated*/] : value ? [COLOR_FULL, COLOR_FULL_ALT] : [COLOR_EMPTY, COLOR_EMPTY_ALT]
}

export function colorForFraction(fraction: number): ColorString {
    const c: ColorComponentsRGB = [
        (COLORCOMPS_FULL[0] - COLORCOMPS_EMPTY[0]) * fraction + COLORCOMPS_EMPTY[0],
        (COLORCOMPS_FULL[1] - COLORCOMPS_EMPTY[1]) * fraction + COLORCOMPS_EMPTY[1],
        (COLORCOMPS_FULL[2] - COLORCOMPS_EMPTY[2]) * fraction + COLORCOMPS_EMPTY[2],
    ]
    return ColorString(c)
}

export function parseColorToRGBA(col: string): FixedArray<number, 4> | undefined {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, 1, 1)
    // In order to detect invalid values,
    // we can't rely on col being in the same format as what fillStyle is computed as,
    // but we can ask it to implicitly compute a normalized value twice and compare.
    ctx.fillStyle = '#000'
    ctx.fillStyle = col
    const computed = ctx.fillStyle
    ctx.fillStyle = '#fff'
    ctx.fillStyle = col
    if (computed !== ctx.fillStyle) {
        return undefined
    }
    ctx.fillRect(0, 0, 1, 1)
    return FixedArrayAssert([...ctx.getImageData(0, 0, 1, 1).data], 4)
}



//
// FONTS
//

export const FONT_LABEL_DEFAULT = "18px sans-serif"



//
// NODE DEFINITIONS
//


export function useCompact(numNodes: number) {
    return numNodes >= 5
}

const trivialNameMatcher = /^(In|Out|in|out)\d*$/
export function isTrivialNodeName(name: string | undefined): boolean {
    return name === undefined || trivialNameMatcher.test(name)
}


//
// DRAWING
//

// Adding to current path

export function triangle(g: GraphicsRendering, x0: number, y0: number, x1: number, y1: number, x2: number, y2: number) {
    g.moveTo(x0, y0)
    g.lineTo(x1, y1)
    g.lineTo(x2, y2)
    g.closePath()
}

export function circle(g: GraphicsRendering, cx: number, cy: number, d: number) {
    const r = d / 2
    g.ellipse(cx, cy, r, r, 0, 0, 2 * Math.PI)
}

// Stroking/filling

export function strokeSingleLine(g: GraphicsRendering, x0: number, y0: number, x1: number, y1: number) {
    g.beginPath()
    g.moveTo(x0, y0)
    g.lineTo(x1, y1)
    g.stroke()
}

export function strokeBezier(g: GraphicsRendering, x0: number, y0: number, anchorX0: number, anchorY0: number, anchorX1: number, anchorY1: number, x1: number, y1: number) {
    g.beginPath()
    g.moveTo(x0, y0)
    g.bezierCurveTo(anchorX0, anchorY0, anchorX1, anchorY1, x1, y1)
    g.stroke()
}

export function shouldShowNode(nodeOrArray: Node | readonly Node[]): boolean {
    if (isArray(nodeOrArray)) {
        return nodeOrArray.map(shouldShowNode).includes(true)
    }
    const node = nodeOrArray as Exclude<typeof nodeOrArray, readonly Node[]>
    const editor = node.parent.editor
    if (editor.mode <= Mode.TRYOUT && !editor.options.showDisconnectedPins && node.isDisconnected) {
        return false
    }
    return true
}


export function drawWireLineToComponent(g: GraphicsRendering, node: Node, x1: number, y1: number, withTriangle = false) {
    if (!shouldShowNode(node)) {
        return
    }
    const neutral = node.parent.editor.options.hideWireColors
    const x0 = node.posXInParentTransform
    const y0 = node.posYInParentTransform
    drawStraightWireLine(g, x0, y0, x1, y1, node.value, node.color, neutral, 0)
    if (withTriangle) {
        g.strokeStyle = COLOR_COMPONENT_BORDER
        g.fillStyle = COLOR_COMPONENT_BORDER
        g.beginPath()
        if (x0 === x1) {
            // vertical line
            const pointsDown = (node.isOutput() && y1 <= y0) || (!node.isOutput() && y0 <= y1)
            if (pointsDown) {
                const shift = node.isOutput() ? 1 : 0
                triangle(g,
                    x1 - 3, y1 - 2 + shift,
                    x1 + 3, y1 - 2 + shift,
                    x1, y1 + 1 + shift,
                )
            } else {
                const shift = node.isOutput() ? -3 : -4
                triangle(g,
                    x1 - 3, y1 - 2 - shift,
                    x1 + 3, y1 - 2 - shift,
                    x1, y1 - 5 - shift,
                )
            }
        } else if (y0 === y1) {
            // horizontal line
            const shift = node.isOutput() ? 1 : 0
            const pointsRight = (node.isOutput() && x1 <= x0) || (!node.isOutput() && x0 <= x1)
            if (pointsRight) {
                triangle(g,
                    x1 - 2 + shift, y1 - 3,
                    x1 - 2 + shift, y1 + 3,
                    x1 + 1 + shift, y1,
                )
            } else {
                triangle(g,
                    x1 + 2 - shift, y1 - 3,
                    x1 + 2 - shift, y1 + 3,
                    x1 - 1 - shift, y1,
                )
            }
        } else {
            console.log(`ERROR  wireLineToComponent cannot draw triangle as line is not vertical or horizontal between (${x0}, ${y0}) and (${x1}, ${y1})`)
        }
        g.fill()
        g.stroke()
    }
}

export function drawStraightWireLine(g: GraphicsRendering, x0: number, y0: number, x1: number, y1: number, value: LogicValue, color: WireColor, neutral: boolean, timeFraction: number | undefined) {
    g.beginPath()
    g.moveTo(x0, y0)
    g.lineTo(x1, y1)
    strokeAsWireLine(g, value, color, false, neutral, timeFraction)
}

export function strokeAsWireLine(g: GraphicsRendering, value: LogicValue, color: WireColor, isMouseOver: boolean, neutral: boolean, timeFraction: number | undefined, path?: Path2D) {

    function doStroke() {
        if (path) { g.stroke(path) }
        else { g.stroke() }
    }

    const oldLineCap = g.lineCap
    g.lineCap = "butt"

    const mainStrokeWidth = WIRE_WIDTH / 2
    if (isMouseOver) {
        g.lineWidth = mainStrokeWidth + 2
        g.strokeStyle = COLOR_MOUSE_OVER
    } else {
        g.lineWidth = mainStrokeWidth
        g.strokeStyle = COLOR_WIRE[color]
    }

    doStroke()
    g.lineWidth = mainStrokeWidth - 2

    const [baseColor, altColor] = neutral ? [COLOR_UNKNOWN, COLOR_UNKNOWN_ALT] : colorsForLogicValue(value)
    g.strokeStyle = baseColor

    if (timeFraction === undefined) {
        // no animation
        doStroke()

    } else {
        // TODO: this currently breaks the animation showing the newly propagating value,
        // since this works along paths by changing the line dash, which we overwrite here.
        const dashSize = 20
        g.setLineDash([dashSize, dashSize])
        const baseOffset = -timeFraction * dashSize * 2
        g.lineDashOffset = baseOffset
        doStroke()

        const altOffset = baseOffset + dashSize
        g.strokeStyle = altColor
        g.lineDashOffset = altOffset
        doStroke()

        g.setLineDash([])
        g.lineDashOffset = 0
    }

    g.lineCap = oldLineCap
}

export function isOverWaypoint(x: number, y: number, waypointX: number, waypointY: number): boolean {
    return dist(x, y, waypointX, waypointY) < WAYPOINT_HIT_RANGE / 2
}

export enum NodeStyle {
    IN_CONNECTED,
    IN_DISCONNECTED,
    OUT_CONNECTED,
    OUT_DISCONNECTED,
    IN_OUT,
    WAYPOINT,
}

export function drawWaypoint(g: GraphicsRendering, ctx: DrawContext, x: number, y: number, style: NodeStyle, value: LogicValue, isMouseOver: boolean, neutral: boolean, showForced: boolean, showForcedWarning: boolean, parentOrientIsVertical: boolean) {

    const [circleColor, thickness] =
        showForced
            ? [COLOR_DARK_RED, 3] // show forced nodes with red border if not in teacher mode
            : [COLOR_WIRE_BORDER, 1]   // show normally

    g.strokeStyle = circleColor
    g.lineWidth = thickness
    g.fillStyle = style === NodeStyle.IN_DISCONNECTED ? COLOR_BACKGROUND : (neutral ? COLOR_UNKNOWN : colorForLogicValue(value))

    g.beginPath()
    circle(g, x, y, WAYPOINT_DIAMETER)
    g.fill()
    g.stroke()

    if (isMouseOver) {
        g.fillStyle = COLOR_NODE_MOUSE_OVER
        g.beginPath()
        circle(g, x, y, WAYPOINT_DIAMETER * 2)
        g.fill()
        g.stroke()
    }

    if (showForcedWarning) {
        // forced value to something that is contrary to normal output
        g.textAlign = "center"
        g.fillStyle = circleColor
        g.font = "bold 14px sans-serif"

        ctx.inNonTransformedFrame(ctx => {
            g.fillText("!!", ...ctx.rotatePoint(
                x + (parentOrientIsVertical ? 13 : 0),
                y + (parentOrientIsVertical ? 0 : -13),
            ))
        })
    }
}

export function drawClockInput(g: GraphicsRendering, left: number, clockNode: Node, trigger: EdgeTrigger) {
    const clockY = clockNode.posYInParentTransform
    const clockLineOffset = 1
    g.strokeStyle = COLOR_COMPONENT_BORDER
    g.lineWidth = 2

    // if (trigger === EdgeTrigger.falling) {
    //     clockLineOffset += 7
    //     g.beginPath()
    //     circle(g, left - 5, clockY, 6)
    //     g.fillStyle = COLOR_BACKGROUND
    //     g.fill()
    //     g.stroke()
    // }
    g.beginPath()
    g.moveTo(left + 1, clockY - 4)
    g.lineTo(left + 9, clockY)
    g.lineTo(left + 1, clockY + 4)
    g.stroke()
    if (trigger === EdgeTrigger.falling) {
        g.fillStyle = COLOR_COMPONENT_BORDER
        g.closePath()
        g.fill()
    }

    drawWireLineToComponent(g, clockNode, left - clockLineOffset, clockY, false)
}

export function drawLabel(ctx: DrawContextExt, compOrient: Orientation, text: string | undefined, anchor: Orientation | undefined, x: number, y: Node | ReadonlyGroupedNodeArray<Node>): void
export function drawLabel(ctx: DrawContextExt, compOrient: Orientation, text: string | undefined, anchor: Orientation | undefined, x: number, y: Node | ReadonlyGroupedNodeArray<Node>, undefined : any, forceTextRotation: boolean): void
export function drawLabel(ctx: DrawContextExt, compOrient: Orientation, text: string | undefined, anchor: Orientation | undefined, x: Node | ReadonlyGroupedNodeArray<Node>, y: number): void
export function drawLabel(ctx: DrawContextExt, compOrient: Orientation, text: string | undefined, anchor: Orientation | undefined, x: Node | ReadonlyGroupedNodeArray<Node>, y: number, undefined : any, forceTextRotation: boolean): void
export function drawLabel(ctx: DrawContextExt, compOrient: Orientation, text: string | undefined, anchor: Orientation | undefined, x: number, y: number, referenceNode: Node | ReadonlyGroupedNodeArray<Node> | undefined): void
export function drawLabel(ctx: DrawContextExt, compOrient: Orientation, text: string | undefined, anchor: Orientation | undefined, x: number, y: number, referenceNode: Node | ReadonlyGroupedNodeArray<Node> | undefined, forceTextRotation: boolean): void

export function drawLabel(ctx: DrawContextExt, compOrient: Orientation, text: string | undefined, anchor: Orientation | undefined, x: number | Node | ReadonlyGroupedNodeArray<Node>, y: number | Node | ReadonlyGroupedNodeArray<Node>, referenceNode?: Node | ReadonlyGroupedNodeArray<Node>, forceTextRotation?: boolean) {
    if (text === undefined) {
        return
    }

    if (referenceNode === undefined) {
        if (!isNumber(x)) {
            referenceNode = x
        } else if (!isNumber(y)) {
            referenceNode = y
        }
    }

    let nodeHidden = false
    if (referenceNode !== undefined) {
        nodeHidden = !shouldShowNode(referenceNode)
    }

    if (nodeHidden) {
        return
    }

    if (forceTextRotation === undefined) {
        forceTextRotation = false
    }

    const [halign, valign, dx, dy, angle] = (() => {
        if (anchor === undefined) {
            return ["center", "middle", 0, 0, 0] as const
        }
        const rotatedAnchor = Orientation.add(compOrient, anchor)
        switch (rotatedAnchor) {
            //case "e": return (textRotation == 1)? ["center", "top", 0, 2] : ["right", "middle", -3, 0] as const
            //case "w": return (textRotation == 1)? ["center", "bottom", 0, -2] : ["left", "middle", 3, 0] as const
            case "e": return ["right", "middle", -3, 0, 0] as const
            case "w": return ["left", "middle", 3, 0, 0] as const
            case "n": return (forceTextRotation)? ["right", "middle", 0, 3, 1] : ["center", "top", 0, 2, 0] as const
            case "s": return (forceTextRotation)? ["left", "middle", 0, -3, 1] : ["center", "bottom", 0, -2, 0] as const
            }
    })()

    const xx = isNumber(x) ? x :
        (isNodeArray(x) ? x.group : x).posXInParentTransform
    const yy = isNumber(y) ? y :
        (isNodeArray(y) ? y.group : y).posYInParentTransform
    const [finalX, finalY] = ctx.rotatePoint(xx, yy)

    // we assume a color and a font have been set before this function is called
    const g = ctx.g
    // http://www.java2s.com/Tutorials/HTML_CSS/HTML5_Canvas_Reference/rotate.htm
    g.textAlign = halign
    g.textBaseline = valign
    if (forceTextRotation) {
        g.save()
        g.translate(finalX + dx, finalY + dy)
        g.rotate(-Math.PI/2 * angle);
        g.fillText(text, 0, 0)
        g.restore()
    } else {
        g.fillText(text, finalX + dx, finalY + dy)
    }
}

export function drawValueTextCentered(g: GraphicsRendering, value: LogicValue, comp: HasPosition, opts?: { fillStyle?: string, small?: boolean }) {
    drawValueText(g, value, comp.posX, comp.posY, opts)
}

export function drawValueText(g: GraphicsRendering, value: LogicValue, x: number, y: number, opts?: { fillStyle?: string, small?: boolean }) {
    g.textAlign = "center"
    g.textBaseline = "middle"

    let spec = ""
    let label = ""

    const small = opts?.small ?? false
    const fillStyle = opts?.fillStyle

    const sizeStrBig = small ? "12" : "18"
    const sizeStrSmall = small ? "10" : "16"

    if (isUnknown(value)) {
        g.fillStyle = fillStyle ?? COLOR_LABEL_OFF
        spec = "bold " + sizeStrBig
        label = '?'
    } else if (isHighImpedance(value)) {
        g.fillStyle = fillStyle ?? COLOR_LABEL_OFF
        spec = sizeStrSmall
        label = 'Z'
    } else if (value) {
        g.fillStyle = fillStyle ?? COLOR_LABEL_ON
        spec = "bold " + sizeStrBig
        label = '1'
    } else {
        g.fillStyle = fillStyle ?? COLOR_LABEL_OFF
        spec = sizeStrBig
        label = '0'
    }
    g.font = `${spec}px sans-serif`
    g.fillText(label, x, y)
}


//
// MISC
//

export const INPUT_OUTPUT_DIAMETER = 26

const NAME_POSITION_SETTINGS = {
    right: ["start", "middle", 7],
    left: ["end", "middle", 9],
    top: ["center", "bottom", 5],
    bottom: ["center", "top", 5],
} as const

function textSettingsForName(onRight: boolean, orient: Orientation) {
    if (onRight) {
        switch (orient) {
            case "e": return NAME_POSITION_SETTINGS.right
            case "w": return NAME_POSITION_SETTINGS.left
            case "n": return NAME_POSITION_SETTINGS.top
            case "s": return NAME_POSITION_SETTINGS.bottom
        }
    } else {
        switch (orient) {
            case "e": return NAME_POSITION_SETTINGS.left
            case "w": return NAME_POSITION_SETTINGS.right
            case "n": return NAME_POSITION_SETTINGS.bottom
            case "s": return NAME_POSITION_SETTINGS.top
        }
    }
}

export function drawComponentName(g: GraphicsRendering, ctx: DrawContextExt, name: ComponentName, value: string | number, comp: Component, onRight: boolean) {
    if (name === undefined) {
        return
    }

    let displayName
    if (isString(name)) {
        displayName = name
    } else {
        // dynamic name
        if (value in name) {
            displayName = `${name[value]}`
        } else if ("default" in name) {
            displayName = `${name.default}`
        } else if (isUnknown(value)) {
            displayName = Unknown
        } else {
            displayName = undefined
        }
    }

    if (displayName === undefined) {
        return
    }

    const [hAlign, vAlign, deltaX] = textSettingsForName(onRight, comp.orient)
    g.textAlign = hAlign
    g.textBaseline = vAlign
    g.font = "italic 18px sans-serif"
    g.fillStyle = COLOR_COMPONENT_BORDER
    const point = ctx.rotatePoint(comp.posX + (onRight ? 1 : -1) * (comp.unrotatedWidth / 2 + deltaX), comp.posY)
    g.fillText(displayName, ...point)
    g.textBaseline = "middle" // restore
}

//
// DATA CONVERSIONS FOR DISPLAY PURPOSES
//

export function displayValuesFromArray(values: readonly LogicValue[], mostSignificantFirst: boolean): [binaryStringRep: string, value: number | Unknown] {
    // lowest significant bit is the first bit
    let binaryStringRep = ""
    let hasUnset = false
    const add: (v: any) => void = mostSignificantFirst
        ? v => binaryStringRep = binaryStringRep + v
        : v => binaryStringRep = v + binaryStringRep

    for (const value of values) {
        if (isUnknown(value) || isHighImpedance(value)) {
            hasUnset = true
            add(value)
        } else {
            add(+value)
        }
    }
    const value = hasUnset ? Unknown : parseInt(binaryStringRep, 2)
    return [binaryStringRep, value]
}

export function formatWithRadix(value: number | Unknown, radix: number, width: number, withPrefix = true): string {
    if (isUnknown(value)) {
        return Unknown
    }
    if (radix === -10) {
        // signed int
        const asBinStr = (value >>> 0).toString(2).padStart(width, '0')
        if (asBinStr[0] === '1') {
            // negative
            const rest = parseInt(asBinStr.substring(1), 2)
            // swap hyphen for minus sign as en-dash
            return '–' + String(-(-Math.pow(2, width - 1) + rest))
        } else {
            return String(value)
        }
    } else {
        const caption = value.toString(radix).toUpperCase()
        const prefix = !withPrefix ? "" : (() => {
            switch (radix) {
                case 16: return "0x"
                case 8: return "0o"
                case 2: return "0b"
                default: return ""
            }
        })()
        return prefix + caption
    }
}
