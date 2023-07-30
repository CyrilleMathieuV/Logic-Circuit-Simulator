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
import {VirtualFlipflop} from "./VirtualFlipflopOrLatch";

export class VirtualFlipflopD extends VirtualFlipflop {

    public constructor(trigger: EdgeTrigger) {
        super(trigger)
    }

    public doRecalcValueAfterClock(): LogicValue {
        return LogicValue.filterHighZ(this.inputD)
    }
}