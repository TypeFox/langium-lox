/******************************************************************************
 * Copyright 2022 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { startLanguageServer, EmptyFileSystem, DocumentState, LangiumDocument } from 'langium';
import { BrowserMessageReader, BrowserMessageWriter, Diagnostic, NotificationType, createConnection } from 'vscode-languageserver/browser';
import { createLoxServices } from './lox-module';
import { runInterpreter } from '../interpreter/runner';

declare const self: DedicatedWorkerGlobalScope;

/* browser specific setup code */
const messageReader = new BrowserMessageReader(self);
const messageWriter = new BrowserMessageWriter(self);

const connection = createConnection(messageReader, messageWriter);

// Inject the shared services and language-specific services
const { shared } = createLoxServices({ connection, ...EmptyFileSystem });

// Start the language server with the shared services
startLanguageServer(shared);

// Send a notification with the serialized AST after every document change
type DocumentChange = { uri: string, content: string, diagnostics: Diagnostic[] };
const documentChangeNotification = new NotificationType<DocumentChange>('browser/DocumentChange');
shared.workspace.DocumentBuilder.onBuildPhase(DocumentState.Validated, async documents => {
    for (const document of documents) {
        if (document.diagnostics === undefined || document.diagnostics.filter((i) => i.severity === 1).length === 0) {
            sendMessage(document, "notification", "startInterpreter")
            const timeoutId = setTimeout(() => {
                sendMessage(document, "error", "Interpreter timed out");
              }, 1000 * 60); // 1 minute

            await Promise.race([
                runInterpreter(document.textDocument.getText(), {
                    log: (message) => {
                        sendMessage(document, "output", message);
                    }
                }).catch((e) => {
                    clearTimeout(timeoutId);
                    sendMessage(document, "error", e.message);
                }).then(() => {
                    clearTimeout(timeoutId);
                    sendMessage(document, "notification", "endInterpreter");
                }),
                new Promise((resolve) => resolve(timeoutId) )
            ]);
        }
        else {
            sendMessage(document, "error", document.diagnostics)
        }
    }
});

function sendMessage(document: LangiumDocument, type: string, content: unknown): void {
    connection.sendNotification(documentChangeNotification, {
        uri: document.uri.toString(),
        content: JSON.stringify({ type, content }),
        diagnostics: document.diagnostics ?? []
    });
}
