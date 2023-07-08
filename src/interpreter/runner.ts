import { AstNode, EmptyFileSystem, interruptAndCheck, LangiumDocument, MaybePromise } from "langium";
import { BinaryExpression, Expression, isBinaryExpression, isBooleanExpression, isClass, isExpression, isExpressionBlock, isForStatement, isFunctionDeclaration, isIfStatement, isMemberCall, isNilExpression, isNumberExpression, isParameter, isPrintStatement, isReturnStatement, isStringExpression, isUnaryExpression, isVariableDeclaration, isWhileStatement, LoxElement, LoxProgram, MemberCall } from "../language-server/generated/ast";
import { createLoxServices } from "../language-server/lox-module";
import { v4 } from 'uuid';
import { URI } from "vscode-uri";
import { CancellationToken } from "vscode-languageserver/browser";

export interface InterpreterContext {
    log: (value: unknown) => MaybePromise<void>
}

const services = createLoxServices(EmptyFileSystem);

export async function runInterpreter(program: string, context: InterpreterContext): Promise<void> {
    const buildResult = await buildDocument(program);
    try {
        const loxProgram = buildResult.document.parseResult.value as LoxProgram;
        await runProgram(loxProgram, context);
    } finally {
        await buildResult.dispose();
    }
}

type ReturnFunction = (value: unknown) => void;

interface RunnerContext {
    variables: Variables,
    log: (value: unknown) => MaybePromise<void>
}

class Variables {

    private stack: Record<string, unknown>[] = [];

    enter(): void {
        this.stack.push({});
    }

    leave(): void {
        this.stack.pop();
    }

    push(name: string, value: unknown): void {
        if (this.stack.length > 0) {
            this.stack[this.stack.length - 1][name] = value;
        }
    }

    set(node: AstNode, name: string, value: unknown): void {
        for (let i = this.stack.length - 1; i >= 0; i--) {
            const scope = this.stack[i];
            if (Object.hasOwn(scope, name)) {
                scope[name] = value;
                return;
            }
        }
        throw new AstNodeError(node, `No variable '${name}' defined`);
    }

    get(node: AstNode, name: string): unknown {
        for (let i = this.stack.length - 1; i >= 0; i--) {
            const scope = this.stack[i];
            if (Object.hasOwn(scope, name)) {
                return scope[name];
            }
        }
        throw new AstNodeError(node, `No variable '${name}' defined`);
    }

}

interface BuildResult {
    document: LangiumDocument
    dispose: () => Promise<void>
}

async function buildDocument(program: string): Promise<BuildResult> {
    const uuid = v4();
    const uri = URI.parse(`memory:///${uuid}.lox`);
    const document = services.shared.workspace.LangiumDocumentFactory.fromString(program, uri);
    services.shared.workspace.LangiumDocuments.addDocument(document);
    await services.shared.workspace.DocumentBuilder.build([document]);
    return {
        document,
        dispose: async () => {
            await services.shared.workspace.DocumentBuilder.update([], [uri]);
        }
    }
}

export async function runProgram(program: LoxProgram, outerContext: InterpreterContext): Promise<void> {
    const context: RunnerContext = {
        variables: new Variables(),
        log: outerContext.log
    };
    context.variables.enter();
    let end = false;
    for (const statement of program.elements) {
        if (!isClass(statement) && !isFunctionDeclaration(statement)) {
            await runLoxElement(statement, context, () => { end = true });
        }
        if (end) {
            break;
        }
    }
    context.variables.leave();
}

async function runLoxElement(element: LoxElement, context: RunnerContext, returnFn: ReturnFunction): Promise<void> {
    if (isExpressionBlock(element)) {
        await interruptAndCheck(CancellationToken.None);
        context.variables.enter();
        let end = false;
        const blockReturn: ReturnFunction = (value) => {
            // Yield the execution
            end = true;
            // Call the outer return function
            returnFn(value);
        }
        for (const statement of element.elements) {
            await runLoxElement(statement, context, blockReturn);
            if (end) {
                break;
            }
        }
        context.variables.leave();
    } else if (isVariableDeclaration(element)) {
        const value = element.value ? await runExpression(element.value, context) : undefined;
        context.variables.push(element.name, value);
    } else if (isIfStatement(element)) {
        const condition = await runExpression(element.condition, context);
        if (Boolean(condition)) {
            await runLoxElement(element.block, context, returnFn);
        } else if (element.elseBlock) {
            await runLoxElement(element.elseBlock, context, returnFn);
        }
    } else if (isWhileStatement(element)) {
        const { condition, block } = element;
        while (Boolean(await runExpression(condition, context))) {
            await runLoxElement(block, context, returnFn);
        }
    } else if (isForStatement(element)) {
        const { counter, condition, execution, block } = element;
        context.variables.enter();
        if (counter) {
            await runLoxElement(counter, context, returnFn);
        }
        while (!condition || Boolean(await runExpression(condition, context))) {
            await runLoxElement(block, context, returnFn);
            if (execution) {
                await runExpression(execution, context);
            }
        }
        context.variables.leave();
    } else if (isReturnStatement(element)) {
        const result = element.value ? await runExpression(element.value, context) : undefined;
        returnFn(result);
    } else if (isPrintStatement(element)) {
        const result = await runExpression(element.value, context);
        await context.log(result);
    } else if (isExpression(element)) {
        await runExpression(element, context);
    }
}

async function runExpression(expression: Expression, context: RunnerContext): Promise<unknown> {
    if (isBinaryExpression(expression)) {
        const { left, right, operator } = expression;
        const rightValue = await runExpression(right, context);
        if (operator === '=') {
            return setExpressionValue(left, rightValue, context);
        }
        const leftValue = await runExpression(left, context);
        if (operator === '+') {
            return applyOperator(expression, operator, leftValue, rightValue, e => isString(e) || isNumber(e));
        } else if (['-', '*', '/', '<', '<=', '>', '>='].includes(operator)) {
            return applyOperator(expression, operator, leftValue, rightValue, e => isNumber(e));
        } else if (['and', 'or'].includes(operator)) {
            return applyOperator(expression, operator, leftValue, rightValue, e => isBoolean(e));
        } else if (['==', '!='].includes(operator)) {
            return applyOperator(expression, operator, leftValue, rightValue);
        }
    } else if (isMemberCall(expression)) {
        return runMemberCall(expression, context);
    } else if (isUnaryExpression(expression)) {
        const { operator, value } = expression;
        const actualValue = await runExpression(value, context);
        if (operator === '+') {
            if (typeof actualValue === 'number') {
                return actualValue;
            } else {
                throw new AstNodeError(expression, `Cannot apply operator '${operator}' to value of type '${typeof actualValue}'`);
            }
        } else if (operator === '-') {
            if (typeof actualValue === 'number') {
                return -actualValue;
            } else {
                throw new AstNodeError(expression, `Cannot apply operator '${operator}' to value of type '${typeof actualValue}'`);
            }
        } else if (operator === '!') {
            if (typeof actualValue === 'boolean') {
                return !actualValue;
            } else {
                throw new AstNodeError(expression, `Cannot apply operator '${operator}' to value of type '${typeof actualValue}'`);
            }
        }
    } else if (isNumberExpression(expression)) {
        return expression.value;
    } else if (isStringExpression(expression)) {
        return expression.value;
    } else if (isBooleanExpression(expression)) {
        return expression.value;
    } else if (isNilExpression(expression)) {
        return null;
    }
    throw new AstNodeError(expression, 'Unknown expression type found ' + expression.$type);
}

async function setExpressionValue(left: Expression, right: unknown, context: RunnerContext): Promise<unknown> {
    if (isMemberCall(left)) {
        if (left.explicitOperationCall) {
            // Just quietly return from operation call
            await runMemberCall(left, context);
            return right;
        }
        let previous: unknown = undefined;
        if (left.previous) {
            previous = await runExpression(left.previous, context);
        }
        const ref = left.element?.ref;
        const name = ref?.name;
        if (!name) {
            throw new AstNodeError(left, 'Cannot resolve name');
        }
        if (previous) {
            (previous as any)[name] = right;
        } else if (isVariableDeclaration(ref)) {
            context.variables.set(left, name, right);
        }
    } else {
        throw new AstNodeError(left, 'Cannot assign anything to constant');
    }
    return right;
}

async function runMemberCall(memberCall: MemberCall, context: RunnerContext): Promise<unknown> {
    let previous: unknown = undefined;
    if (memberCall.previous) {
        previous = await runExpression(memberCall.previous, context);
    }
    const ref = memberCall.element?.ref;
    let value: unknown;
    if (isFunctionDeclaration(ref)) {
        value = ref;
    } else if (isVariableDeclaration(ref) || isParameter(ref)) {
        value = context.variables.get(memberCall, ref.name);
    } else if (isClass(ref)) {
        throw new AstNodeError(memberCall, 'Classes are current unsupported');
    } else {
        value = previous;
    }

    if (memberCall.explicitOperationCall) {
        if (isFunctionDeclaration(ref)) {
            const args = await Promise.all(memberCall.arguments.map(e => runExpression(e, context)));
            context.variables.enter();
            const names = ref.parameters.map(e => e.name);
            for (let i = 0; i < args.length; i++) {
                context.variables.push(names[i], args[i]);
            }
            let functionValue: unknown;
            const returnFn: ReturnFunction = (returnValue) => {
                functionValue = returnValue;
            }
            await runLoxElement(ref.body, context, returnFn);
            context.variables.leave();
            return functionValue;
        } else {
            throw new AstNodeError(memberCall, 'Cannot call a non-function');
        }
    }
    return value;
}

function applyOperator(node: BinaryExpression, operator: string, left: unknown, right: unknown, check?: (value: unknown) => boolean): unknown {
    if (check && (!check(left) || !check(right))) {
        throw new AstNodeError(node, `Cannot apply operator '${operator}' to values of type '${typeof left}' and '${typeof right}'`);
    }
    const anyLeft = left as any;
    const anyRight = right as any;
    if (operator === '+') {
        return anyLeft + anyRight;
    } else if (operator === '-') {
        return anyLeft - anyRight;
    } else if (operator === '*') {
        return anyLeft * anyRight;
    } else if (operator === '/') {
        return anyLeft / anyRight;
    } else if (operator === 'and') {
        return anyLeft && anyRight;
    } else if (operator === 'or') {
        return anyLeft || anyRight;
    } else if (operator === '<') {
        return anyLeft < anyRight;
    } else if (operator === '<=') {
        return anyLeft <= anyRight;
    } else if (operator === '>') {
        return anyLeft > anyRight;
    } else if (operator === '>=') {
        return anyLeft >= anyRight;
    } else if (operator === '==') {
        return anyLeft === anyRight;
    } else if (operator === '!=') {
        return anyLeft !== anyRight;
    } else {
        throw new AstNodeError(node, `Operator ${operator} is unknown`);
    }
}

function isNumber(value: unknown): value is number {
    return typeof value === 'number';
}

function isString(value: unknown): value is string {
    return typeof value === 'string';
}

function isBoolean(value: unknown): value is boolean {
    return typeof value === 'boolean';
}

class AstNodeError extends Error {
    constructor(node: AstNode, message: string) {
        const position = node.$cstNode!.range.start;
        super(`${message} @${position.line + 1}:${position.character + 1}`);
    }
}
