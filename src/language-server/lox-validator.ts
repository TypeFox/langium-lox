import { AstNode, streamAllContents, ValidationAcceptor, ValidationChecks, ValidationRegistry } from 'langium';
import { BinaryExpression, ExpressionBlock, FunctionDeclaration, isReturnStatement, LoxAstType, MethodMember, TypeReference, UnaryExpression, VariableDeclaration } from './generated/ast';
import type { LoxServices } from './lox-module';
import { isAssignable } from './type-system/assignment';
import { isVoidType, TypeDescription, typeToString } from './type-system/descriptions';
import { inferType } from './type-system/infer';
import { isLegalOperation } from './type-system/operator';

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
            MethodMember: validator.checkMethodReturnType,
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
        this.checkFunctionReturnTypeInternal(func.body, func.returnType, accept);
    }

    checkMethodReturnType(method: MethodMember, accept: ValidationAcceptor): void {
        this.checkFunctionReturnTypeInternal(method.body, method.returnType, accept);
    }

    private checkFunctionReturnTypeInternal(body: ExpressionBlock, returnType: TypeReference, accept: ValidationAcceptor): void {
        const map = this.getTypeCache();
        const returnStatements = streamAllContents(body).filter(isReturnStatement).toArray();
        const expectedType = inferType(returnType, map);
        if (returnStatements.length === 0 && !isVoidType(expectedType)) {
            accept('error', "A function whose declared type is not 'void' must return a value.", {
                node: returnType
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
