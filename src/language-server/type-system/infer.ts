import { AstNode } from "langium";
import { isBooleanExpression, isFieldMember, isFunctionDeclaration, isMemberCall, isMethodMember, isNumberExpression, isParameter, isStringExpression, isTypeReference, isVariableDeclaration, MemberCall, TypeReference } from "../generated/ast";
import { createBooleanType, createClassType, createErrorType, createFunctionType, createNumberType, createStringType, createVoidType, isFunctionType, TypeDescription } from "./descriptions";

export function inferType(node: AstNode, cache: Map<AstNode, TypeDescription>): TypeDescription {
    let type: TypeDescription | undefined;
    if (isStringExpression(node)) {
        type = createStringType(node);
    } else if (isNumberExpression(node)) {
        type = createNumberType(node);
    } else if (isBooleanExpression(node)) {
        type = createBooleanType(node);
    } else if (isFunctionDeclaration(node)) {
        const returnType = inferType(node.returnType, cache);
        const parameters = node.parameters.map(e => ({
            name: e.name,
            type: inferType(e.type, cache)
        }));
        type = createFunctionType(returnType, parameters);
    } else if (isTypeReference(node)) {
        type = inferTypeRef(node, cache);
    } else if (isMemberCall(node)) {
        type = inferMemberCall(node, cache);
        if (node.explicitOperationCall) {
            if (isFunctionType(type)) {
                type = type.returnType;
            }
        }
    } else if (isVariableDeclaration(node)) {
        if (node.type) {
            type = inferType(node.type, cache);
        } else if (node.value) {
            type = inferType(node.value, cache);
        } else {
            type = createErrorType('No type hint for this element', node);
        }
    } else if (isParameter(node)) {
        type = inferType(node.type, cache);
    } else if (isMethodMember(node)) {
        const returnType = inferType(node.returnType, cache);
        const parameters = node.parameters.map(e => ({
            name: e.name,
            type: inferType(e.type, cache)
        }));
        type = createFunctionType(returnType, parameters);
    } else if (isFieldMember(node)) {
        type = inferType(node.type, cache);
    }
    if (!type) {
        type = createErrorType('Could not infer type for ' + node.$type, node);
    }

    cache.set(node, type);
    return type;
}

function inferTypeRef(node: TypeReference, cache: Map<AstNode, TypeDescription>): TypeDescription {
    if (node.primitive) {
        if (node.primitive === 'number') {
            return createNumberType();
        } else if (node.primitive === 'string') {
            return createStringType();
        } else if (node.primitive === 'boolean') {
            return createBooleanType();
        } else if (node.primitive === 'void') {
            return createVoidType();
        }
    } else if (node.reference) {
        if (node.reference.ref) {
            return createClassType(node.reference.ref);
        }
    } else if (node.returnType) {
        const returnType = inferType(node.returnType, cache);
        const parameters = node.parameters.map((e, i) => ({
            name: e.name ?? `$${i}`,
            type: inferType(e.type, cache)
        }));
        return createFunctionType(returnType, parameters);
    }
    return createErrorType('Could not infer type for this reference', node);
}

function inferMemberCall(node: MemberCall, cache: Map<AstNode, TypeDescription>): TypeDescription {
    const element = node.element?.ref;
    if (element) {
        return inferType(element, cache);
    }
    return createErrorType('Could not infer type for element ' + node.element?.$refText ?? 'undefined', node);
}
