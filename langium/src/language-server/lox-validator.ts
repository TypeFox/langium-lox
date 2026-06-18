import { AstNode, AstUtils, ValidationAcceptor, ValidationChecks, ValidationRegistry } from 'langium';
import { BinaryExpression, Class, FunctionDeclaration, isFunctionDeclaration, isMethodMember, isReturnStatement, LoxAstType, MemberCall, MethodMember, UnaryExpression, VariableDeclaration } from './generated/ast.js';
import type { LoxServices } from './lox-module.js';
import { isAssignable } from './type-system/assignment.js';
import { isFunctionType, isVoidType, TypeDescription, typeToString } from './type-system/descriptions.js';
import { inferType } from './type-system/infer.js';
import { isLegalOperation } from './type-system/operator.js';

/**
 * Registry for validation checks.
 */
export class LoxValidationRegistry extends ValidationRegistry {
    constructor(services: LoxServices) {
        super(services);
        const validator = services.validation.LoxValidator;
        const checks: ValidationChecks<LoxAstType> = {
            BinaryExpression: validator.checkBinaryOperationAllowed,
            UnaryExpression: validator.checkUnaryOperationAllowed,
            VariableDeclaration: validator.checkVariableDeclaration,
            MemberCall: validator.checkMemberCallArguments,
            MethodMember: validator.checkMethodReturnType,
            Class: validator.checkClassDeclaration,
            FunctionDeclaration: validator.checkFunctionReturnType
        };
        this.register(checks, validator);
    }
}

/**
 * Implementation of custom validations.
 */
export class LoxValidator {

    checkFunctionReturnType(func: FunctionDeclaration, accept: ValidationAcceptor): void {
        this.checkFunctionReturnTypeInternal(func, accept);
    }

    checkMethodReturnType(method: MethodMember, accept: ValidationAcceptor): void {
        this.checkFunctionReturnTypeInternal(method, accept);
    }

    checkMemberCallArguments(memberCall: MemberCall, accept: ValidationAcceptor): void {
        if (!memberCall.explicitOperationCall) {
            return;
        }
        const map = this.getTypeCache();
        // the callable is either the referenced element or the result of the previous expression
        const calleeType = memberCall.element
            ? inferType(memberCall.element.ref, map)
            : inferType(memberCall.previous, map);
        // constructor calls and non-callables are handled by other checks / the linker
        if (!isFunctionType(calleeType)) {
            return;
        }
        const parameters = calleeType.parameters;
        const args = memberCall.arguments;
        if (args.length !== parameters.length) {
            accept('error', `Expected ${parameters.length} argument(s) but got ${args.length}.`, {
                node: memberCall
            });
            return;
        }
        for (let i = 0; i < args.length; i++) {
            const argType = inferType(args[i], map);
            if (!isAssignable(argType, parameters[i].type)) {
                accept('error', `Type '${typeToString(argType)}' is not assignable to type '${typeToString(parameters[i].type)}'.`, {
                    node: args[i]
                });
            }
        }
    }

    checkClassDeclaration(declaration: Class, accept: ValidationAcceptor): void {
        // walk the inheritance chain and report if we ever revisit a class
        const visited = new Set<Class>();
        let current: Class | undefined = declaration;
        while (current) {
            if (visited.has(current)) {
                accept('error', 'Cyclic inheritance is not allowed.', {
                    node: declaration,
                    property: 'name'
                });
                return;
            }
            visited.add(current);
            current = current.superClass?.ref;
        }
    }

    private checkFunctionReturnTypeInternal(func: FunctionDeclaration | MethodMember, accept: ValidationAcceptor): void {
        const map = this.getTypeCache();
        // only consider returns that belong to this function, not ones nested in inner functions
        const returnStatements = AstUtils.streamAllContents(func.body)
            .filter(isReturnStatement)
            .filter(returnStatement => AstUtils.getContainerOfType(returnStatement, isFunctionOrMethod) === func)
            .toArray();
        const expectedType = inferType(func.returnType, map);
        if (returnStatements.length === 0 && !isVoidType(expectedType)) {
            accept('error', "A function whose declared type is not 'void' must return a value.", {
                node: func.returnType
            });
            return;
        }
        for (const returnStatement of returnStatements) {
            const returnValueType = inferType(returnStatement, map);
            if (!isAssignable(returnValueType, expectedType)) {
                accept('error', `Type '${typeToString(returnValueType)}' is not assignable to type '${typeToString(expectedType)}'.`, {
                    node: returnStatement
                });
            }
        }
    }

    checkVariableDeclaration(decl: VariableDeclaration, accept: ValidationAcceptor): void {
        if (decl.type && decl.value) {
            const map = this.getTypeCache();
            const left = inferType(decl.type, map);
            const right = inferType(decl.value, map);
            if (!isAssignable(right, left)) {
                accept('error', `Type '${typeToString(right)}' is not assignable to type '${typeToString(left)}'.`, {
                    node: decl,
                    property: 'value'
                });
            }
        } else if (!decl.type && !decl.value) {
            accept('error', 'Variables require a type hint or an assignment at creation', {
                node: decl,
                property: 'name'
            });
        }
    }

    checkBinaryOperationAllowed(binary: BinaryExpression, accept: ValidationAcceptor): void {
        const map = this.getTypeCache();
        const left = inferType(binary.left, map);
        const right = inferType(binary.right, map);
        if (!isLegalOperation(binary.operator, left, right)) {
            accept('error', `Cannot perform operation '${binary.operator}' on values of type '${typeToString(left)}' and '${typeToString(right)}'.`, {
                node: binary
            })
        } else if (binary.operator === '=') {
            if (!isAssignable(right, left)) {
                accept('error', `Type '${typeToString(right)}' is not assignable to type '${typeToString(left)}'.`, {
                    node: binary,
                    property: 'right'
                })
            }
        } else if (['==', '!='].includes(binary.operator)) {
            if (!isAssignable(right, left)) {
                accept('warning', `This comparison will always return '${binary.operator === '==' ? 'false' : 'true'}' as types '${typeToString(left)}' and '${typeToString(right)}' are not compatible.`, {
                    node: binary,
                    property: 'operator'
                });
            }
        }
    }

    checkUnaryOperationAllowed(unary: UnaryExpression, accept: ValidationAcceptor): void {
        const item = inferType(unary.value, this.getTypeCache());
        if (!isLegalOperation(unary.operator, item)) {
            accept('error', `Cannot perform operation '${unary.operator}' on value of type '${typeToString(item)}'.`, {
                node: unary
            });
        }
    }

    private getTypeCache(): Map<AstNode, TypeDescription> {
        return new Map();
    }

}

function isFunctionOrMethod(node: AstNode): node is FunctionDeclaration | MethodMember {
    return isFunctionDeclaration(node) || isMethodMember(node);
}
