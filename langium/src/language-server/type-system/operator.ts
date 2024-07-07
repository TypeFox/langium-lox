import { TypeDescription } from "./descriptions.js";

export function isLegalOperation(operator: string, left: TypeDescription, right?: TypeDescription): boolean {
    if (operator === '+') {
        if (!right) {
            return left.$type === 'number';
        }
        return (left.$type === 'number' || left.$type === 'string')
            && (right.$type === 'number' || right.$type === 'string')
    } else if (['-', '/', '*', '%', '<', '<=', '>', '>='].includes(operator)) {
        if (!right) {
            return left.$type === 'number';
        }
        return left.$type === 'number' && right.$type === 'number';
    } else if (['and', 'or'].includes(operator)) {
        return left.$type === 'boolean' && right?.$type === 'boolean';
    } else if (operator === '!') {
        return left.$type === 'boolean';
    }
    return true;
}
