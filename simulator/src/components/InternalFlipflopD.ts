import {
    ArrayClampOrPad,
    ArrayFillWith, deepEquals,
    EdgeTrigger, HighImpedance,
    isHighImpedance,
    isUnknown,
    LogicValue, LogicValueRepr, toLogicValue,
    typeOrUndefined,
    Unknown,
} from "../utils"
import {InternalFlipflop} from "./InternalFlipflopOrLatch";

export class InternalFlipflopD extends InternalFlipflop {

    public constructor(trigger: EdgeTrigger) {
        super(trigger)
    }

    public doRecalcValueAfterClock(): LogicValue {
        return LogicValue.filterHighZ(this.inputD)
    }
}