import { afterEach, describe, expect, test } from 'vitest';
import { check, errorsOf, reset } from './helpers.js';

// top-level names are shared across documents, so isolate every snippet
afterEach(async () => { await reset(); });

describe('valid programs produce no errors', () => {
    test('arithmetic, functions and control flow', async () => {
        const code = `
            var total: number = 0;
            fun add(a: number, b: number): number { return a + b; }
            for (var i = 0; i < 3; i = i + 1) { total = add(total, i); }
            print total;
        `;
        expect(await errorsOf(code)).toEqual([]);
    });

    test('closures (nested functions returning functions) are type-clean', async () => {
        // regression guard: the outer return check must not pick up the inner return
        const code = `
            fun makeCounter(): () => number {
                var count: number = 0;
                fun increment(): number { count = count + 1; return count; }
                return increment;
            }
            fun makeAdder(n: number): (number) => number {
                fun add(x: number): number { return x + n; }
                return add;
            }
            print makeCounter()();
            print makeAdder(5)(1);
        `;
        expect(await errorsOf(code)).toEqual([]);
    });

    test('classes with inheritance, this and super', async () => {
        const code = `
            class Animal {
                name: string
                describe(): string { return this.name; }
            }
            class Dog < Animal {
                speak(): string { return "woof"; }
                parentName(): string { return super.describe(); }
            }
            var d = Dog();
            var a: Animal = d;
            print a.describe();
        `;
        expect(await errorsOf(code)).toEqual([]);
    });
});

describe('type errors are reported', () => {
    test('a var needs a type hint or an initializer', async () => {
        expect(await errorsOf('var x;')).toEqual([
            expect.stringContaining('require a type hint or an assignment'),
        ]);
    });

    test('assignment type mismatch', async () => {
        expect(await errorsOf('var x: number = "hello";')).toEqual([
            expect.stringContaining("Type 'string' is not assignable to type 'number'"),
        ]);
    });

    test('function return type mismatch', async () => {
        expect(await errorsOf('fun f(): number { return "nope"; }')).toEqual([
            expect.stringContaining("Type 'string' is not assignable to type 'number'"),
        ]);
    });

    test('a non-void function must return a value', async () => {
        const errors = await errorsOf('fun f(): number { print 1; }');
        expect(errors).toEqual([expect.stringContaining('must return a value')]);
    });

    test('arithmetic on a string is illegal', async () => {
        const errors = await errorsOf('print "a" - 1;');
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0]).toContain("Cannot perform operation '-'");
    });

    test('a nested function with a wrong return type still errors at its own level', async () => {
        const code = `
            fun outer(): number {
                fun inner(): number { return "bad"; }
                return 1;
            }
        `;
        // exactly one error — the inner one — and the outer return of 1 is fine
        const errors = await errorsOf(code);
        expect(errors).toEqual([
            expect.stringContaining("Type 'string' is not assignable to type 'number'"),
        ]);
    });
});

describe('class validation', () => {
    test('cyclic inheritance is rejected', async () => {
        const code = `
            class A < B { }
            class B < A { }
        `;
        const errors = await errorsOf(code);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.every(m => m.includes('Cyclic inheritance'))).toBe(true);
    });
});

describe('warnings', () => {
    test('comparing incompatible types warns', async () => {
        const { warnings } = await check('print 1 == "a";');
        expect(warnings.length).toBe(1);
        expect(typeof warnings[0].message === 'string' ? warnings[0].message : warnings[0].message.value)
            .toContain('always return');
    });
});
