import { describe, expect, test } from 'vitest';
import { errorsOf } from './helpers.js';

// a small hierarchy reused across the assignability/field tests
const CLS = `
    class Animal {
        name: string
        legs: number
        describe(): string { return this.name; }
    }
    class Dog < Animal {
        breed: string
        speak(): string { return "woof"; }
    }
    class Cat {
        lives: number
    }
`;

describe('class assignability', () => {
    test('a subclass is assignable to a superclass', async () => {
        expect(await errorsOf(`${CLS} var a: Animal = Dog();`)).toEqual([]);
    });

    test('a superclass is NOT assignable to a subclass', async () => {
        expect(await errorsOf(`${CLS} var d: Dog = Animal();`)).toEqual([
            expect.stringContaining("Type 'Animal' is not assignable to type 'Dog'"),
        ]);
    });

    test('unrelated classes are not assignable', async () => {
        expect(await errorsOf(`${CLS} var c: Cat = Dog();`)).toEqual([
            expect.stringContaining("Type 'Dog' is not assignable to type 'Cat'"),
        ]);
    });

    test('nil is assignable to any class type', async () => {
        expect(await errorsOf(`${CLS} var a: Animal = nil;`)).toEqual([]);
    });

    test('a class is not assignable to a primitive', async () => {
        expect(await errorsOf(`${CLS} var x: number = Animal();`)).toEqual([
            expect.stringContaining("Type 'Animal' is not assignable to type 'number'"),
        ]);
    });
});

describe('class fields', () => {
    test('reading a field yields its declared type', async () => {
        expect(await errorsOf(`${CLS} var d = Dog(); var n: number = d.legs;`)).toEqual([]);
    });

    test('reading a field into the wrong type is rejected', async () => {
        expect(await errorsOf(`${CLS} var d = Dog(); var n: number = d.name;`)).toEqual([
            expect.stringContaining("Type 'string' is not assignable to type 'number'"),
        ]);
    });

    test('writing a field of the right type is fine', async () => {
        expect(await errorsOf(`${CLS} var d = Dog(); d.name = "Rex";`)).toEqual([]);
    });

    test('writing a field of the wrong type is rejected', async () => {
        expect(await errorsOf(`${CLS} var d = Dog(); d.name = 5;`)).toEqual([
            expect.stringContaining("Type 'number' is not assignable to type 'string'"),
        ]);
    });

    test('inherited fields are visible and typed on the subclass', async () => {
        expect(await errorsOf(`${CLS} var d = Dog(); var s: string = d.name;`)).toEqual([]);
    });

    test('chained access through class-typed fields is typed', async () => {
        const code = `
            class Node { next: Node  value: number }
            var head = Node();
            var v: number = head.next.value;
        `;
        expect(await errorsOf(code)).toEqual([]);
    });
});

describe('this / super typing', () => {
    test('this has the enclosing class type', async () => {
        const code = `
            class Animal {
                name: string
                self(): Animal { return this; }
            }
        `;
        expect(await errorsOf(code)).toEqual([]);
    });

    test('assigning this to an unrelated type is rejected', async () => {
        const code = `
            class Cat { lives: number }
            class Animal {
                name: string
                bad(): string { var c: Cat = this; return this.name; }
            }
        `;
        expect(await errorsOf(code)).toEqual([
            expect.stringContaining("Type 'Animal' is not assignable to type 'Cat'"),
        ]);
    });

    test('super exposes the parent class members with their types', async () => {
        const code = `
            class Animal { name: string  describe(): string { return this.name; } }
            class Dog < Animal { parentName(): string { return super.describe(); } }
        `;
        expect(await errorsOf(code)).toEqual([]);
    });
});

describe('method return types', () => {
    test('a method must return its declared type', async () => {
        expect(await errorsOf(`class X { f(): string { return 5; } }`)).toEqual([
            expect.stringContaining("Type 'number' is not assignable to type 'string'"),
        ]);
    });

    test('a non-void method must return a value', async () => {
        expect(await errorsOf(`class X { f(): number { print 1; } }`)).toEqual([
            expect.stringContaining('must return a value'),
        ]);
    });
});

describe('inheritance validation', () => {
    test('direct self-inheritance is cyclic', async () => {
        expect(await errorsOf(`class A < A { v: number }`)).toEqual([
            expect.stringContaining('Cyclic inheritance'),
        ]);
    });

    test('indirect cycles are reported on every class in the cycle', async () => {
        const errors = await errorsOf(`class A < B { } class B < C { } class C < A { }`);
        expect(errors.length).toBe(3);
        expect(errors.every(m => m.includes('Cyclic inheritance'))).toBe(true);
    });
});

describe('call arguments', () => {
    test('function arity is checked', async () => {
        const code = `fun add(a: number, b: number): number { return a + b; } add(1);`;
        expect(await errorsOf(code)).toEqual([
            expect.stringContaining('Expected 2 argument(s) but got 1'),
        ]);
    });

    test('function argument types are checked', async () => {
        const code = `fun add(a: number, b: number): number { return a + b; } add(1, "x");`;
        expect(await errorsOf(code)).toEqual([
            expect.stringContaining("Type 'string' is not assignable to type 'number'"),
        ]);
    });

    test('method argument types are checked', async () => {
        const code = `
            class G { greet(s: string): string { return s; } }
            var g = G();
            g.greet(5);
        `;
        expect(await errorsOf(code)).toEqual([
            expect.stringContaining("Type 'number' is not assignable to type 'string'"),
        ]);
    });

    test('method arity is checked', async () => {
        const code = `
            class G { greet(s: string): string { return s; } }
            var g = G();
            g.greet("a", "b");
        `;
        expect(await errorsOf(code)).toEqual([
            expect.stringContaining('Expected 1 argument(s) but got 2'),
        ]);
    });

    test('a subclass instance satisfies a superclass parameter', async () => {
        const code = `
            ${CLS}
            fun take(a: Animal): string { return a.name; }
            var d = Dog();
            print take(d);
        `;
        expect(await errorsOf(code)).toEqual([]);
    });

    test('valid calls (incl. higher-order / curried) produce no errors', async () => {
        const code = `
            fun add(a: number, b: number): number { return a + b; }
            fun id(f: (number, number) => number): (number, number) => number { return f; }
            print add(1, 2);
            print id(add)(3, 4);
        `;
        expect(await errorsOf(code)).toEqual([]);
    });
});
