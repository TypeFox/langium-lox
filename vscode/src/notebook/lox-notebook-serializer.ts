import * as vscode from 'vscode';
import { TextDecoder, TextEncoder } from "util";

/**
 * An ultra-minimal sample provider that lets the user type in JSON, and then
 * outputs JSON cells. The outputs are transient and not saved to notebook file on disk.
 */
interface RawNotebookData {
    cells: RawNotebookCell[]
}

interface RawNotebookCell {
    language: string;
    value: string;
    kind: vscode.NotebookCellKind;
    editable?: boolean;
}

export class LoxNotebookSerializer implements vscode.NotebookSerializer {
    public readonly label: string = 'Lox Content Serializer';

    public async deserializeNotebook(data: Uint8Array, _token: vscode.CancellationToken): Promise<vscode.NotebookData> {
        var contents = new TextDecoder().decode(data);    // convert to String to make JSON object

        // Read file contents
        let raw: RawNotebookData;
        try {
            raw = <RawNotebookData>JSON.parse(contents);
        } catch {
            raw = { cells: [] };
        }

        // Create array of Notebook cells for the VS Code API from file contents
        const cells = raw.cells.map(item => new vscode.NotebookCellData(
            item.kind,
            item.value,
            item.language
        ));

        // Pass read and formatted Notebook Data to VS Code to display Notebook with saved cells
        return new vscode.NotebookData(
            cells
        );
    }

    public async serializeNotebook(data: vscode.NotebookData, _token: vscode.CancellationToken): Promise<Uint8Array> {
        // Map the Notebook data into the format we want to save the Notebook data as
        let contents: RawNotebookData = { cells: [] };

        for (const cell of data.cells) {
            contents.cells.push({
                kind: cell.kind,
                language: cell.languageId,
                value: cell.value
            });
        }

        // Give a string of all the data to save and VS Code will handle the rest
        return new TextEncoder().encode(JSON.stringify(contents));
    }
}
