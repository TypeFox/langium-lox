/******************************************************************************
 * Copyright 2022 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { startLanguageServer, EmptyFileSystem, DocumentState, LangiumDocument } from 'langium';
import { BrowserMessageReader, BrowserMessageWriter, Diagnostic, NotificationType, createConnection } from 'vscode-languageserver/browser';
import { runInterpreter } from '../interpreter/runner';
import { createLoxServices } from './lox-module';

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
            let timeout: NodeJS.Timeout;

            runInterpreter(document.textDocument.getText(), {
                log: (message) => {
                    sendMessage(document, "output", message);
                },
                onTimeout: () => {
                    console.log("Interpreter timeout");
                },
                onStart: () => {
                    console.log("Interpreter started");
                    sendMessage(document, "notification", "startInterpreter")
                  
                }
            },).then(() => {
                sendMessage(document, "notification", "endInterpreter");
            })
            .catch((e) => {
                sendMessage(document, "error", e.message);
            }).finally(() => {
                clearTimeout(timeout);
            });
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
