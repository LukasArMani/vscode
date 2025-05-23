import assert from 'assert';
import * as vscode from 'vscode';
import EXTENSION_COMMANDS from '../../commands';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { contributes } = require('../../../package.json');

suite('Extension Test Suite', () => {
  test('there should be 3 views registered in the package.json', () => {
    assert(contributes.views.mongoDB.length === 3);
    assert(contributes.views.mongoDB[0].id === 'mongoDBConnectionExplorer');
    assert(contributes.views.mongoDB[1].id === 'mongoDBPlaygroundsExplorer');
    assert(contributes.views.mongoDB[2].id === 'mongoDBHelpExplorer');
  });

  test('commands are registered in vscode', async () => {
    const registeredCommands = await vscode.commands.getCommands();

    const expectedCommands = [
      // General / connection commands.
      'mdb.connect',
      'mdb.connectWithURI',
      'mdb.openOverviewPage',
      'mdb.disconnect',
      'mdb.removeConnection',
      'mdb.openMongoDBShell',
      'mdb.createPlayground',
      'mdb.createNewPlaygroundFromOverviewPage',
      'mdb.createNewPlaygroundFromTreeView',

      // Tree view commands.
      'mdb.addConnection',
      'mdb.addConnectionWithURI',
      'mdb.copyConnectionString',
      'mdb.treeItemRemoveConnection',
      'mdb.treeViewOpenMongoDBShell',
      'mdb.addDatabase',
      'mdb.refreshConnection',
      'mdb.copyDatabaseName',
      'mdb.refreshDatabase',
      'mdb.addCollection',
      'mdb.viewCollectionDocuments',
      'mdb.refreshDocumentList',
      'mdb.searchForDocuments',
      'mdb.copyCollectionName',
      'mdb.refreshCollection',
      'mdb.refreshSchema',
      'mdb.copySchemaFieldName',
      'mdb.refreshIndexes',
      'mdb.createIndexFromTreeView',
      'mdb.insertObjectIdToEditor',
      'mdb.generateObjectIdToClipboard',
      'mdb.openMongoDBDocumentFromTree',
      'mdb.openMongoDBDocumentFromCodeLens',
      'mdb.copyDocumentContentsFromTreeView',
      'mdb.cloneDocumentFromTreeView',
      'mdb.deleteDocumentFromTreeView',
      'mdb.addStreamProcessor',
      'mdb.startStreamProcessor',
      'mdb.stopStreamProcessor',
      'mdb.dropStreamProcessor',

      // Editor commands.
      'mdb.codeLens.showMoreDocumentsClicked',

      ...Object.values(EXTENSION_COMMANDS),
    ];

    for (const expectedCommand of expectedCommands) {
      assert.notStrictEqual(
        registeredCommands.indexOf(expectedCommand),
        -1,
        `command ${expectedCommand} not registered and was expected`,
      );
    }
  });
});
