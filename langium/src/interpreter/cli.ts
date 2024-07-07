import { Command } from 'commander';
import fs from 'fs';
import { runInterpreter } from './runner.js';
import pkg from '../../package.json' assert { type: 'json' };

const program = new Command();

program
    .version(pkg.version);

program
    .command('run')
    .argument('<file>')
    .action(runCommand);

program.parse(process.argv);

async function runCommand(file: string): Promise<void> {
    const now = Date.now();
    const content = await fs.promises.readFile(file, 'utf-8');
    await runInterpreter(content, {
        log: value => console.log(`${value}`)
    });
    console.log(`Lox program finished running in ${Date.now() - now}ms`);
}
