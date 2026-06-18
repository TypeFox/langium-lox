import { EmptyFileSystem } from 'langium';
import { clearDocuments, validationHelper } from 'langium/test';
import { createLoxServices } from '../src/language-server/lox-module.js';
import type { LoxProgram } from '../src/language-server/generated/ast.js';
import { runInterpreter } from '../src/interpreter/runner.js';

const services = createLoxServices(EmptyFileSystem);
const validate = validationHelper<LoxProgram>(services.Lox);

// derive the Diagnostic type from the helper so it matches Langium's own version
type Diagnostic = Awaited<ReturnType<typeof validate>>['diagnostics'][number];

/** Validation results separated by severity. */
export interface Issues {
    errors: Diagnostic[];
    warnings: Diagnostic[];
}

/** Build and validate a snippet, returning its diagnostics grouped by severity. */
export async function check(code: string): Promise<Issues> {
    // isolate each snippet so top-level names never cross-link between checks
    await clearDocuments(services.shared);
    const { diagnostics } = await validate(code);
    return {
        errors: diagnostics.filter(d => d.severity === 1),
        warnings: diagnostics.filter(d => d.severity === 2),
    };
}

/** Convenience: the error messages of a snippet. */
export async function errorsOf(code: string): Promise<string[]> {
    return (await check(code)).errors.map(d => typeof d.message === 'string' ? d.message : d.message.value);
}

/** Remove validated documents so top-level names do not leak between tests. */
export async function reset(): Promise<void> {
    await clearDocuments(services.shared);
}

/** Run a program through the interpreter and collect everything it prints. */
export async function run(code: string): Promise<unknown[]> {
    const output: unknown[] = [];
    await runInterpreter(code, { log: value => { output.push(value); } });
    return output;
}
