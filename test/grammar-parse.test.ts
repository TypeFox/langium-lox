import type { LoxProgram } from '../src/language-server/generated/ast.js';
import { createLoxServices } from '../src/language-server/lox-module.js';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { test } from 'vitest';


test('parse', async() => {
  const services = createLoxServices(EmptyFileSystem).Lox;
  const parse = parseHelper<LoxProgram>(services);

  const input = `
  fun returnSum(a: number, b: number): number {
      return a + b;
  }

  // Closures

  fun identity(a: (number, number) => number): (number, number) => number {
      return a;
  }

  print identity(returnSum)(1, 2); // prints "3";
  `

  const ast = await parse(input);
  ast.parseResult;
});
