import { AstNode, EmptyFileSystem, interruptAndCheck, LangiumDocument, MaybePromise, URI } from "langium";
import { BinaryExpression, Class, Expression, FunctionDeclaration, isBinaryExpression, isBooleanExpression, isClass, isExpression, isExpressionBlock, isFieldMember, isForStatement, isFunctionDeclaration, isIfStatement, isMemberCall, isMethodMember, isNilExpression, isNumberExpression, isParameter, isPrintStatement, isReturnStatement, isStringExpression, isUnaryExpression, isVariableDeclaration, isWhileStatement, LoxElement, LoxProgram, MemberCall, MethodMember } from "../language-server/generated/ast.js";
import { createLoxServices } from "../language-server/lox-module.js";
import { getClassChain } from "../language-server/type-system/infer.js";
import { v4 } from 'uuid';
import { CancellationToken, CancellationTokenSource } from "vscode-jsonrpc";

export interface InterpreterContext {
    log: (value: unknown) => MaybePromise<void>,
    onStart?: () => void,
}

const services = createLoxServices(EmptyFileSystem);

// after 5 seconds, the interpreter will be interrupted and call onTimeout
const TIMEOUT_MS = 1000 * 5;

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
    scope: Scope,
    globalScope: Scope,
    cancellationToken: CancellationToken,
    timeout: NodeJS.Timeout,
    log: (value: unknown) => MaybePromise<void>,
    onStart?: () => void,
}

/**
 * A lexical scope: a set of local variables plus a link to the enclosing scope.
 * Variable lookup walks the parent chain, which is what makes closures work.
 */
class Scope {

    private readonly variables = new Map<string, unknown>();

    constructor(private readonly parent?: Scope) {}

    define(name: string, value: unknown): void {
        this.variables.set(name, value);
    }

    set(node: AstNode, name: string, value: unknown): void {
        for (let scope: Scope | undefined = this; scope; scope = scope.parent) {
            if (scope.variables.has(name)) {
                scope.variables.set(name, value);
                return;
            }
        }
        throw new AstNodeError(node, `No variable '${name}' defined`);
    }

    get(node: AstNode, name: string): unknown {
        for (let scope: Scope | undefined = this; scope; scope = scope.parent) {
            if (scope.variables.has(name)) {
                return scope.variables.get(name);
            }
        }
        throw new AstNodeError(node, `No variable '${name}' defined`);
    }

}

/**
 * A function value: the declaration to run paired with the scope it was defined
 * in. Calling it runs the body with that captured scope as the parent, so the
 * function keeps access to the variables that were in scope at its definition.
 */
class Closure {
    constructor(readonly node: FunctionDeclaration | MethodMember, readonly scope: Scope) {}
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
    const cancellationTokenSource = new CancellationTokenSource();
    const cancellationToken = cancellationTokenSource.token;
    
    const timeout = setTimeout(async () => {
        cancellationTokenSource.cancel();  
    }, TIMEOUT_MS);
    
    const globalScope = new Scope();
    const context: RunnerContext = {
        scope: globalScope,
        globalScope,
        cancellationToken,
        timeout,
        log: outerContext.log,
        onStart: outerContext.onStart,
    };

    let end = false;

    // hoist top-level functions so they can be called regardless of declaration order
    hoistFunctions(program.elements, context.scope);
    if (context.onStart) {
        context.onStart();
    }

    try {
        for (const statement of program.elements) {
            await interruptAndCheck(context.cancellationToken);

            // class and function declarations are definitions; they only run when invoked
            if (!isClass(statement) && !isFunctionDeclaration(statement)) {
                await runLoxElement(statement, context, () => { end = true });
            }

            if (end) {
                break;
            }
        }
    } finally {
        // release the timeout timer so it does not keep the process alive
        clearTimeout(context.timeout);
    }
}

async function runLoxElement(element: LoxElement, context: RunnerContext, returnFn: ReturnFunction): Promise<void> {
    await interruptAndCheck(context.cancellationToken);

    if (isExpressionBlock(element)) {
        await interruptAndCheck(CancellationToken.None);
        const previousScope = context.scope;
        context.scope = new Scope(previousScope);
        // hoist functions so they are visible throughout the block
        hoistFunctions(element.elements, context.scope);
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
        context.scope = previousScope;
    } else if (isVariableDeclaration(element)) {
        const value = element.value ? await runExpression(element.value, context) : undefined;
        context.scope.define(element.name, value);
    } else if (isIfStatement(element)) {
        const condition = await runExpression(element.condition, context);
        if (condition === true) {
            await runLoxElement(element.block, context, returnFn);
        } else if (element.elseBlock) {
            await runLoxElement(element.elseBlock, context, returnFn);
        }
    } else if (isWhileStatement(element)) {
        const { condition, block } = element;
        while (await runExpression(condition, context) === true) {
            await runLoxElement(block, context, returnFn);
        }
    } else if (isForStatement(element)) {
        const { counter, condition, execution, block } = element;
        const previousScope = context.scope;
        context.scope = new Scope(previousScope);
        if (counter) {
            await runLoxElement(counter, context, returnFn);
        }
        while (!condition || Boolean(await runExpression(condition, context))) {
            await runLoxElement(block, context, returnFn);
            if (execution) {
                await runExpression(execution, context);
            }
        }
        context.scope = previousScope;
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
    await interruptAndCheck(context.cancellationToken);


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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (previous as any)[name] = right;
        } else if (isVariableDeclaration(ref)) {
            context.scope.set(left, name, right);
        }
    } else {
        throw new AstNodeError(left, 'Cannot assign anything to constant');
    }
    return right;
}

async function runMemberCall(memberCall: MemberCall, context: RunnerContext): Promise<unknown> {
    await interruptAndCheck(context.cancellationToken);

    let previous: unknown = undefined;
    if (memberCall.previous) {
        previous = await runExpression(memberCall.previous, context);
    }
    const ref = memberCall.element?.ref;
    const refText = memberCall.element?.$refText;
    let value: unknown;
    if (refText === 'this' || refText === 'super') {
        // `this`/`super` evaluate to the instance bound for the current method call
        value = context.scope.get(memberCall, 'this');
    } else if (isMethodMember(ref)) {
        // methods are declared at the top level, so they close over the global scope
        value = new Closure(ref, context.globalScope);
    } else if (isFunctionDeclaration(ref)) {
        // resolve to the closure bound when the declaration was hoisted
        value = context.scope.get(memberCall, ref.name);
    } else if (isVariableDeclaration(ref) || isParameter(ref)) {
        value = context.scope.get(memberCall, ref.name);
    } else if (isFieldMember(ref)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        value = (previous as any)?.[ref.name];
    } else if (isClass(ref)) {
        value = ref;
    } else {
        value = previous;
    }

    if (memberCall.explicitOperationCall) {
        // calling a class name constructs a new instance
        if (isClass(ref)) {
            return createInstance(ref);
        }
        if (value instanceof Closure) {
            const func = value.node;
            const args = await Promise.all(memberCall.arguments.map(e => runExpression(e, context)));
            const previousScope = context.scope;
            // a call runs in a fresh scope nested in the function's defining scope
            context.scope = new Scope(value.scope);
            // bind `this` to the receiver instance when invoking a method
            if (isMethodMember(func)) {
                context.scope.define('this', previous);
            }
            const names = func.parameters.map(e => e.name);
            for (let i = 0; i < args.length; i++) {
                context.scope.define(names[i], args[i]);
            }
            let functionValue: unknown;
            const returnFn: ReturnFunction = (returnValue) => {
                functionValue = returnValue;
            }
            await runLoxElement(func.body, context, returnFn);
            context.scope = previousScope;
            return functionValue;
        } else {
            throw new AstNodeError(memberCall, 'Cannot call a non-function');
        }
    }
    return value;
}

function createInstance(classItem: Class): Record<string, unknown> {
    // allocate the instance and default every field (own and inherited) to nil
    const instance: Record<string, unknown> = {};
    for (const member of getClassChain(classItem).flatMap(e => e.members)) {
        if (isFieldMember(member)) {
            instance[member.name] = null;
        }
    }
    return instance;
}

function hoistFunctions(elements: LoxElement[], scope: Scope): void {
    // bind each function declaration to a closure over the scope it is declared in
    for (const element of elements) {
        if (isFunctionDeclaration(element)) {
            scope.define(element.name, new Closure(element, scope));
        }
    }
}

function applyOperator(node: BinaryExpression, operator: string, left: unknown, right: unknown, check?: (value: unknown) => boolean): unknown {
    if (check && (!check(left) || !check(right))) {
        throw new AstNodeError(node, `Cannot apply operator '${operator}' to values of type '${typeof left}' and '${typeof right}'`);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyLeft = left as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
