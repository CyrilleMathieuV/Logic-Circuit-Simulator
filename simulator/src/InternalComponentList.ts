import { InternalComponent } from "./components/InternalComponent"
import { CustomComponent } from "./components/CustomComponent"
import { ArrayFillUsing, isString } from "./utils"

export const DrawZIndex = {
    Background: 0,
    Normal: 1,
    Overlay: 2,
} as const

export type DrawZIndex = typeof DrawZIndex[keyof typeof DrawZIndex]

export class InternalComponentList {

    private _componentsByZIndex = ArrayFillUsing(() => [] as InternalComponent[], 3)
    private _componentsById = new Map<string, InternalComponent>()

    public *all() {
        for (const compList of this._componentsByZIndex) {
            for (const comp of compList) {
                yield comp
            }
        }
    }

    public *allInReversedZIndexOrder() {
        for (let i = this._componentsByZIndex.length - 1; i >= 0; i--) {
            const compList = this._componentsByZIndex[i]
            for (const comp of compList) {
                yield comp
            }
        }
    }

    public *withZIndex(zIndex: DrawZIndex) {
        for (const comp of this._componentsByZIndex[zIndex]) {
            yield comp
        }
    }

    public add(comp: InternalComponent) {
        const z = comp.drawZIndex
        this._componentsByZIndex[z].push(comp)

        let id = comp.ref
        let oldComp
        if (id === undefined) {
            id = this.generateIdFor(comp)
            comp.doSetValidatedId(id)
        } else if ((oldComp = this._componentsById.get(id)) !== undefined) {
            console.error(`Component with id '${id}' already exists and will be renamed`)
            const idForOldComp = this.generateIdFor(oldComp)
            oldComp.doSetValidatedId(idForOldComp)
            this._componentsById.set(idForOldComp, oldComp)
        }
        this._componentsById.set(id, comp)
    }

    public contains(type: string): boolean {
        for (const comp of this.all()) {
            if (comp.def.type === type) {
                return true
            }
        }
        return false
    }
/*
    public updateCustomComponents(type: string) {
        for (const comp of [...this.all()]) {
            if (comp.def.type === type && comp instanceof CustomComponent) {
                comp.updateFromDef()
            }
        }
    }
*/
    public changeIdOf(comp: InternalComponent, newId: string) {
        // We must make sure that this new id is not already used before calling
        const oldId = comp.ref
        if (oldId !== undefined) {
            const deleted = this._componentsById.delete(oldId)
            if (!deleted) {
                console.warn(`Component with id '${oldId}' not found`)
            }
        }
        if (this._componentsById.has(newId)) {
            throw new Error(`Component with id '${newId}' already exists`)
        }
        comp.doSetValidatedId(newId)
        this._componentsById.set(newId, comp)
    }

    public swapIdsOf(comp1: InternalComponent, comp2: InternalComponent) {
        const id1 = comp1.ref
        const id2 = comp2.ref
        if (id1 === undefined || id2 === undefined) {
            throw new Error("Cannot swap ids of components without ids")
        }
        comp1.doSetValidatedId(id2)
        comp2.doSetValidatedId(id1)
        this._componentsById.set(id1, comp2)
        this._componentsById.set(id2, comp1)
    }

    public get(id: string): InternalComponent | undefined {
        return this._componentsById.get(id)
    }

    private generateIdFor(comp: InternalComponent): string {
        const prefixFromDef = comp.def.idPrefix
        const prefix = isString(prefixFromDef) ? prefixFromDef : prefixFromDef(comp)
        let i = 0
        let id
        while (this._componentsById.has(id = `${prefix}${i}`)) {
            i++
        }
        return id
    }

    public tryDelete(comp: InternalComponent): boolean {
        return this.tryDeleteWhere(c => c === comp, true) > 0
    }

    public tryDeleteWhere(cond: (e: InternalComponent) => boolean, onlyOne: boolean): number {
        const deletedComps: InternalComponent[] = []

        outer:
            for (const compList of this._componentsByZIndex) {
                for (let i = 0; i < compList.length; i++) {
                    const comp = compList[i]
                    if (cond(comp)) {
                        compList.splice(i, 1)
                        deletedComps.push(comp)
                        if (onlyOne) {
                            break outer
                        }
                    }
                }
            }

        for (const comp of deletedComps) {
            const id = comp.ref
            if (id === undefined) {
                console.warn("Removing component without id")
            } else if (!this._componentsById.has(id)) {
                console.warn(`Removing component with id '${id}' but no component with that id exists`)
            } else {
                this._componentsById.delete(id)
            }
        }

        return deletedComps.length
    }

    public clearAll() {
        for (const compList of this._componentsByZIndex) {
            compList.splice(0, compList.length)
        }
        this._componentsById.clear()
    }

}
