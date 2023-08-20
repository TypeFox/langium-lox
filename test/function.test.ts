import { runInterpreter } from '../src/interpreter/runner.js';
import { expect, test } from 'vitest';

test('identity function', async() => {
  const input = `
    fun returnSum(a: number, b: number): number {
      print "returnSum called";
      return a + b;
    }

    fun identity(a: (number, number) => number): (number, number) => number {
      print "identity called";
      return a;
    }

    print identity(returnSum)(27, 15); // prints "42";
  `;

  const expectedOutput = `
    identity called
    returnSum called
    42
  `;

  await runInterpreterAndAssertOutput(input, expectedOutput);
});

test('pass reference to function and call it', async() => {
  const input = `
    fun aFunction(aLambda: (number) => number, aNumber: number): number {
        print "aFunction called";
        return aLambda(aNumber);
    }

    fun aTimesTwo(a: number): number {
        print "aTimeTwo called";
        return a * 2;
    }

    var result = aFunction(aTimesTwo, 9);
    print result;
  `;

  const expectedOutput = `
    aFunction called
    aTimeTwo called
    18
  `;

  await runInterpreterAndAssertOutput(input, expectedOutput);
});

test('Closure 1', async() => {
  const input = `
    // So far fails with: No variable 'outside' defined

    fun returnFunction(): () => void {
        var outside = "outside";
    
        fun inner(): void {
            print outside;
        }
    
        return inner;
    }
    
    var fn = returnFunction();
    fn();
  `;

  const expectedOutput = `
  `;

  await runInterpreterAndAssertOutput(input, expectedOutput);
});

test('Closure 2', async() => {
  const input = `
    // So far fails with: No variable 'exponent' defined

    fun power(exponent: number): (number) => number {
      fun applyPower(base: number): number {
          var current = 1;
            for (var i = 0; i < exponent; i = i + 1) {
              current = current * base;
            }
            return current;
        }
        return applyPower;
      }
    
    var cube = power(3);
    
    print cube(1);
    print cube(2);
    print cube(3);
    print cube(4);
    print cube(5);
  `;

  const expectedOutput = `
  `;

  await runInterpreterAndAssertOutput(input, expectedOutput);
});


async function runInterpreterAndAssertOutput(input: string, expectedOutput: string) {
  // TODO call valication before ?!?
  let output = "";
  await runInterpreter(input, {
    log: value => {
      output = output.concat(`${value}`);
    }
  });
  expect(output.replace(/\s/g, "")).toBe(expectedOutput.replace(/\s/g, ""));
}

