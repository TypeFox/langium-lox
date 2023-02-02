import * as vscode from 'vscode';
import { runInterpreter } from '../interpreter/runner';

export class LoxNotebookKernel {
    readonly id = 'lox-kernel';
    public readonly label = 'Lox Kernel';
    readonly supportedLanguages = ['lox'];

    private _executionOrder = 0;
    private readonly _controller: vscode.NotebookController;

    constructor() {

        this._controller = vscode.notebooks.createNotebookController(this.id,
            'lox-notebook',
            this.label);

        this._controller.supportedLanguages = this.supportedLanguages;
        this._controller.supportsExecutionOrder = true;
        this._controller.executeHandler = this._executeAll.bind(this);
    }

    dispose(): void {
        this._controller.dispose();
    }

    private async _executeAll(cells: vscode.NotebookCell[], _notebook: vscode.NotebookDocument, _controller: vscode.NotebookController): Promise<void> {
        for (let cell of cells) {
            await this._doExecution(cell);
        }
    }

    private async _doExecution(cell: vscode.NotebookCell): Promise<void> {
        const execution = this._controller.createNotebookCellExecution(cell);

        execution.executionOrder = ++this._executionOrder;
        execution.start(Date.now());

        const text = cell.document.getText();
        await execution.clearOutput();
        const log = async (value: unknown) => {
            const stringValue = `${value}`;
            await execution.appendOutput(new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.text(stringValue)]));
        }

        try {
            await runInterpreter(text, { log });
            execution.end(true, Date.now());
        } catch (err) {
            const errString = err instanceof Error ? err.message : String(err);
            await execution.appendOutput(new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.text(errString)]));
            execution.end(false, Date.now());
        }
    }
}
