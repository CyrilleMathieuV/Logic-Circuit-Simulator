import * as t from "io-ts"
import JSON5 from "json5"
import type { ComponentKey, DefAndParams, LibraryButtonOptions, LibraryButtonProps, LibraryItem } from "../ComponentMenu"
import { DrawParams, LogicEditor } from "../LogicEditor"
import { COLOR_BACKGROUND, COLOR_COMPONENT_INNER_LABELS, COLOR_GROUP_SPAN, DrawingRect, GRID_STEP, drawClockInput, drawComponentName, drawLabel, drawWireLineToComponent, isTrivialNodeName, shouldShowNode, useCompact } from "../drawutils"
import { IconName, ImageName } from "../images"
import { S, Template } from "../strings"
import { ArrayFillUsing, ArrayOrDirect, EdgeTrigger, Expand, FixedArrayMap, HasField, HighImpedance, InteractionResult, LogicValue, LogicValueRepr, Mode, Unknown, brand, deepEquals, isArray, isBoolean, isNumber, isRecord, isString, mergeWhereDefined, toLogicValueRepr, typeOrUndefined, validateJson } from "../utils"
import { DrawContext, DrawContextExt, DrawableParent, DrawableWithDraggablePosition, GraphicsRendering, MenuData, MenuItem, MenuItemPlacement, MenuItems, Orientation, PositionSupportRepr } from "./Drawable"
import { DEFAULT_WIRE_COLOR, Node, NodeBase, NodeIn, NodeOut, WireColor } from "./Node"
import { RecalcManagerVirtual } from "../RecalcManagerVirtual";
import {NodeGroup} from "./Component";


type TInOutput = typeof LogicValue
type TInOutputs = typeof LogicValue[]

//
// Base class for all virtual components
//

export abstract class VirtualComponent {

    protected _value: any

    protected constructor(value: any) {
        this._value = value
    }

    protected doSetValue(newValue: any, forcePropagate = false) {
        const oldValue = this._value
        if (forcePropagate || !deepEquals(newValue, oldValue)) {
            this._value = newValue
        }
    }

    public recalcVirtualValue(forcePropagate: boolean) {
        this.doRecalcVirtualValue()
    }

    protected abstract doRecalcVirtualValue(): any

    public propagateCurrentValue() {
        this.propagateValue(this._value)
    }

    protected propagateValue(__newValue: any) {
        // by default, do nothing
    }

    protected setInputValues(inputs: LogicValue[], values: LogicValue[], reverse = false) {
        const num = inputs.length
        if (values.length !== num) {
            throw new Error(`inputValues: expected ${num} values, got ${values.length}`)
        }
        for (let i = 0; i < num; i++) {
            const j = reverse ? num - i - 1 : i
            inputs[i] = values[j]
        }
    }

    protected setVirtualInputValue(input : LogicValue, value: LogicValue) {
        input = value
    }

    protected getOutputsValues(outputs: LogicValue[]): LogicValue[] {
        return outputs
    }

    protected setOutputsValues(outputs: LogicValue[], values: LogicValue[], reverse = false) {
        const num = outputs.length
        if (values.length !== num) {
            throw new Error(`outputValues: expected ${num} values, got ${values.length}`)
        }
        for (let i = 0; i < num; i++) {
            const j = reverse ? num - i - 1 : i
            outputs[i] = values[j]
        }
    }
/*
    public setNeedsRecalc(forcePropagate = false) {
        this.RecalcManagerVirtual.enqueueForRecalcVirtual(this, forcePropagate)
    }

    private setNeedsPropagate() {
        this.RecalcManagerVirtual.enqueueForPropagateVirtual(this)
    }
 */
}