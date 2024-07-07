//@ts-check
import * as esbuild from 'esbuild';
const watch = process.argv.includes('--watch');
const minify = process.argv.includes('--minify');

const success = watch ? 'Watch build succeeded' : 'Build succeeded';
const sourcemap = minify ? false : 'inline';

function getTime() {
    const date = new Date();
    return `[${`${padZeroes(date.getHours())}:${padZeroes(date.getMinutes())}:${padZeroes(date.getSeconds())}`}] `;
}

function padZeroes(i) {
    return i.toString().padStart(2, '0');
}

const plugins = [{
    name: 'watch-plugin',
    setup(build) {
        build.onEnd(result => {
            if (result.errors.length === 0) {
                console.log(`${build.initialOptions.outfile}: ${getTime()} ${success}`);
            }
        });
    },
}];


const ctxs = [];;
ctxs.push(await esbuild.context({
    entryPoints: ['src/language-server.ts'],
    outfile: 'out/language-server.js',
    bundle: true,
    loader: { '.ts': 'ts', '.node': 'copy' },
    platform: 'node',
    sourcemap,
    minify,
    plugins
}));

ctxs.push(await esbuild.context({
    entryPoints: ['src/extension.ts'],
    outfile: 'out/extension.js',
    bundle: true,
    loader: { '.ts': 'ts', '.node': 'copy' },
    external: ['vscode'],
    platform: 'node',
    sourcemap,
    minify,
    plugins
}));

if (watch) {
    await Promise.all(ctxs.map(ctx => ctx.watch()));
} else {
    await Promise.all(ctxs.map(ctx => ctx.rebuild()));
    ctxs.map(ctx => ctx.dispose());
}
