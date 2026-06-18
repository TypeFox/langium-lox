import { EmptyFileSystem } from 'langium';
import { expectHover } from 'langium/test';
import { describe, test } from 'vitest';
import { createLoxServices } from '../src/language-server/lox-module.js';

const services = createLoxServices(EmptyFileSystem).Lox;
const hover = expectHover(services);

describe('hover', () => {
    test('shows the inferred type of a variable', async () => {
        await hover({
            text: 'var x: number = 5; print <|>x;',
            index: 0,
            hover: /var x: number/,
        });
    });

    test('shows the inferred function type of a parameter', async () => {
        await hover({
            text: 'fun apply(f: (number) => number): number { return <|>f(1); }',
            index: 0,
            hover: /var f: \(\$0: number\) => number/,
        });
    });

    test('shows a class signature', async () => {
        await hover({
            text: 'class Animal { name: string } var a: <|>Animal = Animal();',
            index: 0,
            hover: /class Animal/,
        });
    });
});
