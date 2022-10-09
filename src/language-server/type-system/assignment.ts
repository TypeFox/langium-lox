import { isClassType, isFunctionType, TypeDescription } from "./descriptions";
import { getClassChain } from "./infer";

export function isAssignable(from: TypeDescription, to: TypeDescription): boolean {
    if (isClassType(from)) {
        if (!isClassType(to)) {
            return false;
        }
        const fromLit = from.literal;
        const fromChain = getClassChain(fromLit);
        const toLit = to.literal;
        for (const fromItem of fromChain) {
            if (fromItem === toLit) {
                return true;
            }
        }
        return false;
    }
    if (isFunctionType(from)) {
        if (!isFunctionType(to)) {
            return false;
        }
        if (!isAssignable(from.returnType, to.returnType)) {
            return false;
        }
        if (from.parameters.length !== to.parameters.length) {
            return false;
        }
        for (let i = 0; i < from.parameters.length; i++) {
            const fromParam = from.parameters[i];
            const toParam = to.parameters[i];
            if (!isAssignable(fromParam.type, toParam.type)) {
                return false;
            }
        }
        return true;
    }
    return from.$type === to.$type;
}
