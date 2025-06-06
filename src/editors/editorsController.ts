import * as vscode from 'vscode';
import { EJSON } from 'bson';
import type { Document } from 'bson';

import type ActiveConnectionCodeLensProvider from './activeConnectionCodeLensProvider';
import type ExportToLanguageCodeLensProvider from './exportToLanguageCodeLensProvider';
import PlaygroundSelectionCodeActionProvider from './playgroundSelectionCodeActionProvider';
import PlaygroundDiagnosticsCodeActionProvider from './playgroundDiagnosticsCodeActionProvider';
import type ConnectionController from '../connectionController';
import CollectionDocumentsCodeLensProvider from './collectionDocumentsCodeLensProvider';
import CollectionDocumentsOperationsStore from './collectionDocumentsOperationsStore';
import CollectionDocumentsProvider, {
  CONNECTION_ID_URI_IDENTIFIER,
  OPERATION_ID_URI_IDENTIFIER,
  NAMESPACE_URI_IDENTIFIER,
  VIEW_COLLECTION_SCHEME,
} from './collectionDocumentsProvider';
import { createLogger } from '../logging';
import DocumentIdStore from './documentIdStore';
import type { DocumentSource } from '../documentSource';
import type EditDocumentCodeLensProvider from './editDocumentCodeLensProvider';
import type { EditDocumentInfo } from '../types/editDocumentInfoType';
import formatError from '../utils/formatError';
import { MemoryFileSystemProvider } from './memoryFileSystemProvider';
import MongoDBDocumentService, {
  DOCUMENT_ID_URI_IDENTIFIER,
  DOCUMENT_SOURCE_URI_IDENTIFIER,
  VIEW_DOCUMENT_SCHEME,
} from './mongoDBDocumentService';
import type PlaygroundController from './playgroundController';
import type PlaygroundResultProvider from './playgroundResultProvider';
import { PLAYGROUND_RESULT_SCHEME } from './playgroundResultProvider';
import { StatusView } from '../views';
import type { TelemetryService } from '../telemetry';
import type { QueryWithCopilotCodeLensProvider } from './queryWithCopilotCodeLensProvider';

const log = createLogger('editors controller');

export function getFileDisplayNameForDocument(
  documentId: any,
  namespace: string,
): string {
  let displayName = `${namespace}:${EJSON.stringify(documentId)}`;

  // Encode special file uri characters to ensure VSCode handles
  // it correctly in a uri while avoiding collisions.
  displayName = displayName.replace(/[\\/%]/gi, function (c) {
    return `%${c.charCodeAt(0).toString(16)}`;
  });

  displayName =
    displayName.length > 200 ? displayName.substring(0, 200) : displayName;

  return displayName;
}

export function getViewCollectionDocumentsUri(
  operationId: string,
  namespace: string,
  connectionId: string,
): vscode.Uri {
  // We attach a unique id to the query so that it creates a new file in
  // the editor and so that we can virtually manage the amount of docs shown.
  const operationIdUriQuery = `${OPERATION_ID_URI_IDENTIFIER}=${operationId}`;
  const connectionIdUriQuery = `${CONNECTION_ID_URI_IDENTIFIER}=${connectionId}`;
  const namespaceUriQuery = `${NAMESPACE_URI_IDENTIFIER}=${namespace}`;
  const uriQuery = `?${namespaceUriQuery}&${connectionIdUriQuery}&${operationIdUriQuery}`;

  // Encode special file uri characters to ensure VSCode handles
  // it correctly in a uri while avoiding collisions.
  const namespaceDisplayName = encodeURIComponent(
    namespace.replace(/[\\/%]/gi, function (c) {
      return `%${c.charCodeAt(0).toString(16)}`;
    }),
  );

  // The part of the URI after the scheme and before the query is the file name.
  return vscode.Uri.parse(
    `${VIEW_COLLECTION_SCHEME}:Results: ${namespaceDisplayName}.json${uriQuery}`,
  );
}

/**
 * This controller manages when our extension needs to open
 * new editors and the data they need. It also manages active editors.
 */
export default class EditorsController {
  _playgroundSelectionCodeActionProvider: PlaygroundSelectionCodeActionProvider;
  _playgroundDiagnosticsCodeActionProvider: PlaygroundDiagnosticsCodeActionProvider;
  _connectionController: ConnectionController;
  _playgroundController: PlaygroundController;
  _collectionDocumentsOperationsStore =
    new CollectionDocumentsOperationsStore();
  _collectionViewProvider: CollectionDocumentsProvider;
  _context: vscode.ExtensionContext;
  _statusView: StatusView;
  _memoryFileSystemProvider: MemoryFileSystemProvider;
  _documentIdStore: DocumentIdStore;
  _mongoDBDocumentService: MongoDBDocumentService;
  _telemetryService: TelemetryService;
  _playgroundResultProvider: PlaygroundResultProvider;
  _activeConnectionCodeLensProvider: ActiveConnectionCodeLensProvider;
  _exportToLanguageCodeLensProvider: ExportToLanguageCodeLensProvider;
  _editDocumentCodeLensProvider: EditDocumentCodeLensProvider;
  _collectionDocumentsCodeLensProvider: CollectionDocumentsCodeLensProvider;
  _queryWithCopilotCodeLensProvider: QueryWithCopilotCodeLensProvider;

  constructor({
    context,
    connectionController,
    playgroundController,
    statusView,
    telemetryService,
    playgroundResultProvider,
    activeConnectionCodeLensProvider,
    exportToLanguageCodeLensProvider,
    playgroundSelectionCodeActionProvider,
    playgroundDiagnosticsCodeActionProvider,
    editDocumentCodeLensProvider,
    queryWithCopilotCodeLensProvider,
  }: {
    context: vscode.ExtensionContext;
    connectionController: ConnectionController;
    playgroundController: PlaygroundController;
    statusView: StatusView;
    telemetryService: TelemetryService;
    playgroundResultProvider: PlaygroundResultProvider;
    activeConnectionCodeLensProvider: ActiveConnectionCodeLensProvider;
    exportToLanguageCodeLensProvider: ExportToLanguageCodeLensProvider;
    playgroundSelectionCodeActionProvider: PlaygroundSelectionCodeActionProvider;
    playgroundDiagnosticsCodeActionProvider: PlaygroundDiagnosticsCodeActionProvider;
    editDocumentCodeLensProvider: EditDocumentCodeLensProvider;
    queryWithCopilotCodeLensProvider: QueryWithCopilotCodeLensProvider;
  }) {
    this._connectionController = connectionController;
    this._playgroundController = playgroundController;
    this._context = context;
    this._statusView = statusView;
    this._telemetryService = telemetryService;
    this._memoryFileSystemProvider = new MemoryFileSystemProvider();
    this._documentIdStore = new DocumentIdStore();
    this._mongoDBDocumentService = new MongoDBDocumentService({
      context: this._context,
      connectionController: this._connectionController,
      statusView: this._statusView,
      telemetryService: this._telemetryService,
    });
    this._editDocumentCodeLensProvider = editDocumentCodeLensProvider;
    this._collectionViewProvider = new CollectionDocumentsProvider({
      context: this._context,
      connectionController,
      operationsStore: this._collectionDocumentsOperationsStore,
      statusView: new StatusView(context),
      editDocumentCodeLensProvider: this._editDocumentCodeLensProvider,
    });
    this._playgroundResultProvider = playgroundResultProvider;
    this._activeConnectionCodeLensProvider = activeConnectionCodeLensProvider;
    this._exportToLanguageCodeLensProvider = exportToLanguageCodeLensProvider;
    this._collectionDocumentsCodeLensProvider =
      new CollectionDocumentsCodeLensProvider(
        this._collectionDocumentsOperationsStore,
      );
    this._playgroundSelectionCodeActionProvider =
      playgroundSelectionCodeActionProvider;
    this._playgroundDiagnosticsCodeActionProvider =
      playgroundDiagnosticsCodeActionProvider;
    this._queryWithCopilotCodeLensProvider = queryWithCopilotCodeLensProvider;

    vscode.workspace.onDidCloseTextDocument((e) => {
      const uriParams = new URLSearchParams(e.uri.query);
      const documentIdReference =
        uriParams.get(DOCUMENT_ID_URI_IDENTIFIER) || '';

      this._documentIdStore.removeByDocumentIdReference(documentIdReference);
    });
  }

  async openMongoDBDocument(data: EditDocumentInfo): Promise<boolean> {
    try {
      const mdbDocument =
        await this._mongoDBDocumentService.fetchDocument(data);

      if (!mdbDocument) {
        void vscode.window.showErrorMessage(`
          Unable to open mongodb document: document ${JSON.stringify(
            data.documentId,
          )} not found
        `);

        return false;
      }

      const activeConnectionId =
        this._connectionController.getActiveConnectionId() || '';
      const namespaceUriQuery = `${NAMESPACE_URI_IDENTIFIER}=${data.namespace}`;
      const connectionIdUriQuery = `${CONNECTION_ID_URI_IDENTIFIER}=${activeConnectionId}`;
      const documentIdReference = this._documentIdStore.add(data.documentId);
      const documentIdUriQuery = `${DOCUMENT_ID_URI_IDENTIFIER}=${documentIdReference}`;
      const documentSourceUriQuery = `${DOCUMENT_SOURCE_URI_IDENTIFIER}=${data.source}`;

      const fileTitle = encodeURIComponent(
        getFileDisplayNameForDocument(data.documentId, data.namespace),
      );
      const fileName = `${VIEW_DOCUMENT_SCHEME}:/${fileTitle}.json`;

      const fileUri = vscode.Uri.parse(fileName, true).with({
        query: `?${namespaceUriQuery}&${connectionIdUriQuery}&${documentIdUriQuery}&${documentSourceUriQuery}`,
      });

      this._saveDocumentToMemoryFileSystem(fileUri, mdbDocument);

      const document = await vscode.workspace.openTextDocument(fileUri);

      await vscode.window.showTextDocument(document, { preview: false });

      return true;
    } catch (error) {
      void vscode.window.showErrorMessage(formatError(error).message);

      return false;
    }
  }

  async saveMongoDBDocument(): Promise<boolean> {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
      await vscode.commands.executeCommand('workbench.action.files.save');
      return false;
    }

    const uriParams = new URLSearchParams(editor.document.uri.query);
    const namespace = uriParams.get(NAMESPACE_URI_IDENTIFIER);
    const connectionId = uriParams.get(CONNECTION_ID_URI_IDENTIFIER);
    const documentIdReference = uriParams.get(DOCUMENT_ID_URI_IDENTIFIER) || '';
    const documentId = this._documentIdStore.get(documentIdReference);
    const source = uriParams.get(
      DOCUMENT_SOURCE_URI_IDENTIFIER,
    ) as DocumentSource;

    if (
      editor.document.uri.scheme !== 'VIEW_DOCUMENT_SCHEME' ||
      !namespace ||
      !connectionId ||
      // A valid documentId can be false.
      documentId === null ||
      documentId === undefined
    ) {
      void vscode.window.showErrorMessage(
        `The current file can not be saved as a MongoDB document. Invalid URL: ${editor.document.uri.toString()}`,
      );
      return false;
    }

    try {
      const newDocument = EJSON.parse(editor.document.getText() || '');

      await this._mongoDBDocumentService.replaceDocument({
        namespace,
        connectionId,
        documentId,
        newDocument,
        source,
      });

      // Save document changes to active editor.
      await editor?.document.save();

      void vscode.window.showInformationMessage(
        `The document was saved successfully to '${namespace}'`,
      );

      return true;
    } catch (error) {
      void vscode.window.showErrorMessage(formatError(error).message);

      return false;
    }
  }

  async onViewCollectionDocuments(namespace: string): Promise<boolean> {
    log.info('View collection documents', namespace);

    const operationId =
      this._collectionDocumentsOperationsStore.createNewOperation();
    const activeConnectionId =
      this._connectionController.getActiveConnectionId() || '';
    const uri = getViewCollectionDocumentsUri(
      operationId,
      namespace,
      activeConnectionId,
    );

    try {
      const document = await vscode.workspace.openTextDocument(uri);

      await vscode.window.showTextDocument(document, { preview: false });

      return true;
    } catch (error) {
      void vscode.window.showErrorMessage(
        `Unable to open documents: ${formatError(error).message}`,
      );

      return false;
    }
  }

  onViewMoreCollectionDocuments(
    operationId: string,
    connectionId: string,
    namespace: string,
  ): Promise<boolean> {
    log.info('View more collection documents', namespace);

    // A user might click to fetch more documents multiple times,
    // this ensures it only performs one fetch at a time.
    if (
      this._collectionDocumentsOperationsStore.operations[operationId]
        .isCurrentlyFetchingMoreDocuments
    ) {
      void vscode.window.showErrorMessage('Already fetching more documents...');
      return Promise.resolve(false);
    }

    // Ensure we're still connected to the correct connection.
    if (connectionId !== this._connectionController.getActiveConnectionId()) {
      const oldConnectionName =
        this._connectionController.getSavedConnectionName(connectionId || '') ||
        'the database';

      void vscode.window.showErrorMessage(
        `Unable to view more documents: no longer connected to ${oldConnectionName}`,
      );
      return Promise.resolve(false);
    }

    if (!this._collectionViewProvider) {
      return Promise.reject(
        new Error('No registered collection view provider.'),
      );
    }

    const uri = getViewCollectionDocumentsUri(
      operationId,
      namespace,
      connectionId,
    );

    this._collectionDocumentsOperationsStore.increaseOperationDocumentLimit(
      operationId,
    );

    // Notify the document provider to update with the new document limit.
    this._collectionViewProvider.onDidChangeEmitter.fire(uri);

    return Promise.resolve(true);
  }

  _saveDocumentToMemoryFileSystem(
    fileUri: vscode.Uri,
    document: Document,
  ): void {
    this._memoryFileSystemProvider.writeFile(
      fileUri,
      Buffer.from(JSON.stringify(document, null, 2)),
      { create: true, overwrite: true },
    );
  }

  _resetMemoryFileSystemProvider(): void {
    const prefix = `${VIEW_DOCUMENT_SCHEME}:/`;

    for (const [name] of this._memoryFileSystemProvider.readDirectory(
      vscode.Uri.parse(prefix),
    )) {
      this._memoryFileSystemProvider.delete(
        vscode.Uri.parse(`${prefix}${name}`),
      );
    }
  }

  registerProviders(): void {
    this._context.subscriptions.push(
      vscode.workspace.registerFileSystemProvider(
        VIEW_DOCUMENT_SCHEME,
        this._memoryFileSystemProvider,
        {
          isCaseSensitive: true,
        },
      ),
    );
    // REGISTER CONTENT PROVIDERS.
    this._context.subscriptions.push(
      vscode.workspace.registerTextDocumentContentProvider(
        VIEW_COLLECTION_SCHEME,
        this._collectionViewProvider,
      ),
    );
    this._context.subscriptions.push(
      vscode.workspace.registerTextDocumentContentProvider(
        PLAYGROUND_RESULT_SCHEME,
        this._playgroundResultProvider,
      ),
    );
    // REGISTER CODE LENSES PROVIDERS.
    this._context.subscriptions.push(
      vscode.languages.registerCodeLensProvider(
        {
          scheme: VIEW_COLLECTION_SCHEME,
          language: 'json',
        },
        this._collectionDocumentsCodeLensProvider,
      ),
    );
    this._context.subscriptions.push(
      vscode.languages.registerCodeLensProvider(
        { language: 'javascript' },
        this._queryWithCopilotCodeLensProvider,
      ),
      vscode.languages.registerCodeLensProvider(
        { language: 'javascript' },
        this._activeConnectionCodeLensProvider,
      ),
    );
    this._context.subscriptions.push(
      vscode.languages.registerCodeLensProvider(
        {
          scheme: PLAYGROUND_RESULT_SCHEME,
        },
        this._exportToLanguageCodeLensProvider,
      ),
    );
    this._context.subscriptions.push(
      vscode.languages.registerCodeLensProvider(
        {
          scheme: PLAYGROUND_RESULT_SCHEME,
          language: 'json',
        },
        this._editDocumentCodeLensProvider,
      ),
    );
    this._context.subscriptions.push(
      vscode.languages.registerCodeLensProvider(
        {
          scheme: VIEW_COLLECTION_SCHEME,
          language: 'json',
        },
        this._editDocumentCodeLensProvider,
      ),
    );
    this._context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider(
        'javascript',
        this._playgroundSelectionCodeActionProvider,
        {
          providedCodeActionKinds:
            PlaygroundSelectionCodeActionProvider.providedCodeActionKinds,
        },
      ),
    );
    this._context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider(
        'javascript',
        this._playgroundDiagnosticsCodeActionProvider,
        {
          providedCodeActionKinds:
            PlaygroundDiagnosticsCodeActionProvider.providedCodeActionKinds,
        },
      ),
    );
  }

  deactivate(): void {
    this._resetMemoryFileSystemProvider();
  }
}
