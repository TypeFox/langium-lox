import { describe, expect, test } from 'vitest';
import { run } from './helpers.js';

describe('expressions', () => {
    test('arithmetic respects precedence and grouping', async () => {
        expect(await run('print 1 + 2 * 3;')).toEqual([7]);
        expect(await run('print (1 + 2) * 3;')).toEqual([9]);
        expect(await run('print 10 / 2 - 3;')).toEqual([2]);
    });

    test('string concatenation', async () => {
        expect(await run('print "foo" + "bar";')).toEqual(['foobar']);
    });

    test('booleans and comparisons', async () => {
        expect(await run('print true and false;')).toEqual([false]);
        expect(await run('print true or false;')).toEqual([true]);
        expect(await run('print !false;')).toEqual([true]);
        expect(await run('print 1 < 2;')).toEqual([true]);
        expect(await run('print 2 == 2;')).toEqual([true]);
    });

    test('unary minus', async () => {
        expect(await run('var x = 5; print -x;')).toEqual([-5]);
    });
});

describe('control flow', () => {
    test('if / else', async () => {
        expect(await run('if (1 < 2) { print "yes"; } else { print "no"; }')).toEqual(['yes']);
        expect(await run('if (1 > 2) { print "yes"; } else { print "no"; }')).toEqual(['no']);
    });

    test('while loop', async () => {
        const code = `
            var i: number = 0;
            while (i < 3) { print i; i = i + 1; }
        `;
        expect(await run(code)).toEqual([0, 1, 2]);
    });

    test('for loop', async () => {
        const code = `for (var i = 0; i < 3; i = i + 1) { print i; }`;
        expect(await run(code)).toEqual([0, 1, 2]);
    });

    test('block scope does not leak', async () => {
        const code = `
            var x: number = 1;
            { var x: number = 2; print x; }
            print x;
        `;
        expect(await run(code)).toEqual([2, 1]);
    });
});

describe('functions', () => {
    test('call and return', async () => {
        const code = `
            fun add(a: number, b: number): number { return a + b; }
            print add(2, 3);
        `;
        expect(await run(code)).toEqual([5]);
    });

    test('recursion', async () => {
        const code = `
            fun fib(n: number): number {
                if (n < 2) { return n; }
                return fib(n - 1) + fib(n - 2);
            }
            print fib(10);
        `;
        expect(await run(code)).toEqual([55]);
    });

    test('higher-order functions are first-class', async () => {
        const code = `
            fun add(a: number, b: number): number { return a + b; }
            fun identity(f: (number, number) => number): (number, number) => number { return f; }
            print identity(add)(1, 2);
        `;
        expect(await run(code)).toEqual([3]);
    });

    test('functions are callable regardless of declaration order', async () => {
        const code = `
            print helper();
            fun helper(): string { return "hi"; }
        `;
        expect(await run(code)).toEqual(['hi']);
    });
});

describe('closures', () => {
    test('a closure keeps mutable captured state across calls', async () => {
        const code = `
            fun makeCounter(): () => number {
                var count: number = 0;
                fun increment(): number { count = count + 1; return count; }
                return increment;
            }
            var c = makeCounter();
            print c();
            print c();
            print c();
        `;
        expect(await run(code)).toEqual([1, 2, 3]);
    });

    test('closures from the same factory have independent environments', async () => {
        const code = `
            fun makeCounter(): () => number {
                var count: number = 0;
                fun increment(): number { count = count + 1; return count; }
                return increment;
            }
            var a = makeCounter();
            var b = makeCounter();
            print a();
            print a();
            print b();
        `;
        expect(await run(code)).toEqual([1, 2, 1]);
    });

    test('captured parameters (adder factory)', async () => {
        const code = `
            fun makeAdder(n: number): (number) => number {
                fun add(x: number): number { return x + n; }
                return add;
            }
            var add5 = makeAdder(5);
            var add10 = makeAdder(10);
            print add5(1);
            print add10(1);
            print add5(100);
        `;
        expect(await run(code)).toEqual([6, 11, 105]);
    });

    test('currying', async () => {
        const code = `
            fun adder(a: number): (number) => number {
                fun inner(b: number): number { return a + b; }
                return inner;
            }
            print adder(3)(4);
        `;
        expect(await run(code)).toEqual([7]);
    });

    test('scoping is lexical, not dynamic', async () => {
        // readShared must see the GLOBAL shared (42), not the caller's local (7)
        const code = `
            var shared: number = 42;
            fun readShared(): number { return shared; }
            fun useLocalSameName(): number {
                var shared: number = 7;
                return readShared();
            }
            print useLocalSameName();
        `;
        expect(await run(code)).toEqual([42]);
    });
});

describe('classes', () => {
    const base = `
        class Animal {
            name: string
            legs: number
            describe(): string { return this.name; }
            legCount(): number { return this.legs; }
        }
        class Dog < Animal {
            breed: string
            speak(): string { return "woof"; }
            myLegs(): number { return this.legs; }
            parentDescribe(): string { return super.describe(); }
        }
    `;

    test('construction, field read/write and method dispatch', async () => {
        const code = `
            ${base}
            var d = Dog();
            d.name = "Rex";
            d.legs = 4;
            print d.name;
            print d.legs;
            print d.speak();
        `;
        expect(await run(code)).toEqual(['Rex', 4, 'woof']);
    });

    test('inherited methods and this-bound field access', async () => {
        const code = `
            ${base}
            var d = Dog();
            d.name = "Rex";
            d.legs = 4;
            print d.describe();
            print d.legCount();
            print d.myLegs();
        `;
        expect(await run(code)).toEqual(['Rex', 4, 4]);
    });

    test('super dispatches to the parent method', async () => {
        const code = `
            ${base}
            var d = Dog();
            d.name = "Rex";
            print d.parentDescribe();
        `;
        expect(await run(code)).toEqual(['Rex']);
    });

    test('a subclass instance can be used through a superclass-typed variable', async () => {
        const code = `
            ${base}
            var d = Dog();
            d.name = "Rex";
            var a: Animal = d;
            print a.describe();
        `;
        expect(await run(code)).toEqual(['Rex']);
    });

    test('a method body can reach a global function', async () => {
        const code = `
            fun shout(s: string): string { return s + "!"; }
            class Greeter {
                who: string
                greet(): string { return shout(this.who); }
            }
            var g = Greeter();
            g.who = "hi";
            print g.greet();
        `;
        expect(await run(code)).toEqual(['hi!']);
    });
});
