# Langium Lox

This repository contains a [Langium](https://langium.org) based implementation of the [Lox language](https://craftinginterpreters.com/the-lox-language.html).

![](https://user-images.githubusercontent.com/4377073/178360339-109b40ba-f41f-457b-bddf-16bd5e2a7119.png)

## How to build

Langium requires Node.js >=20 and npm >=10 (we recommend using [Volta](https://volta.sh/) to ensure your node & npm always match). Once you have those requirements installed, you can build the language using:

```shell
npm install
```

Then either use `npm run watch` or `npm run watch` depending on your needs.

This will automatically compile the language and other sources. Afterwards you can run the language using the `Run Extension` vscode launch config.

The [`examples/basic.lox`](https://github.com/langium/langium-lox/blob/main/examples/basic.lox) file contains a small sample of what the language is capable of. Try it out!

## How does it work

The [langium grammar](https://github.com/langium/langium-lox/blob/main/langium/src/language-server/lox.langium) contains all of the magic necessary to make the Lox language run in vscode.

It contains a grammar definition of the Lox language which is transformed into a parser for that language.
Langium additionally provides advanced editor features, such as code completion, goto reference/find references, folding, and more.

## Debugging the CLI

In VSCode open a **JavaScript Debug Terminal** and then execute the following command:

```shell
node ./langium/lib/interpreter/cli.js run ./examples/basic.lox
```
