import * as vscode from 'vscode';
import { beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import type { DataService } from 'mongodb-data-service';
import path from 'path';

import ActiveConnectionCodeLensProvider from '../../../editors/activeConnectionCodeLensProvider';
import ConnectionController from '../../../connectionController';
import { StatusView } from '../../../views';
import { StorageController } from '../../../storage';
import { ExtensionContextStub } from '../stubs';
import { TelemetryService } from '../../../telemetry';
import { TEST_DATABASE_URI } from '../dbTestHelper';

suite('Active Connection CodeLens Provider Test Suite', () => {
  const extensionContextStub = new ExtensionContextStub();
  const testStorageController = new StorageController(extensionContextStub);
  const testTelemetryService = new TelemetryService(
    testStorageController,
    extensionContextStub,
  );
  const testStatusView = new StatusView(extensionContextStub);
  let testConnectionController: ConnectionController;
  let testCodeLensProvider: ActiveConnectionCodeLensProvider;
  const sandbox = sinon.createSandbox();

  beforeEach(() => {
    testConnectionController = new ConnectionController({
      statusView: testStatusView,
      storageController: testStorageController,
      telemetryService: testTelemetryService,
    });
    testCodeLensProvider = new ActiveConnectionCodeLensProvider(
      testConnectionController,
    );
  });

  afterEach(() => {
    sandbox.restore();
  });

  suite('the MongoDB playground in JS', () => {
    const mockFileName = path.join('nonexistent', 'playground-test.mongodb.js');
    const mockDocumentUri = vscode.Uri.from({
      path: mockFileName,
      scheme: 'untitled',
    });
    const mockTextDoc: vscode.TextDocument = {
      uri: mockDocumentUri,
    } as Pick<vscode.TextDocument, 'uri'> as vscode.TextDocument;

    suite('user is not connected', () => {
      beforeEach(() => {
        const fakeShowQuickPick = sandbox.fake();
        sandbox.replace(vscode.window, 'showQuickPick', fakeShowQuickPick);
      });

      test('show disconnected message in code lenses', () => {
        const codeLens = testCodeLensProvider.provideCodeLenses(mockTextDoc);

        expect(codeLens).to.be.an('array');
        expect(codeLens.length).to.be.equal(1);
        expect(codeLens[0].command?.title).to.be.equal(
          '$(mdb-connection-inactive)Connect',
        );
        expect(codeLens[0].range.start.line).to.be.equal(0);
        expect(codeLens[0].range.end.line).to.be.equal(0);
      });
    });

    suite('user is connected', () => {
      beforeEach(() => {
        const findStub = sandbox.stub();
        findStub.resolves([
          {
            field: 'Text message',
          },
        ]);
        const instanceStub = sandbox.stub();
        const onceStub = sandbox.stub();
        instanceStub.resolves({
          dataLake: {},
          build: {},
          genuineMongoDB: {},
          host: {},
        } as unknown as Awaited<ReturnType<DataService['instance']>>);
        const activeDataServiceStub = {
          find: findStub,
          instance: instanceStub,
          once: onceStub,
        } as unknown as DataService;

        testConnectionController.setActiveDataService(activeDataServiceStub);
        sandbox.replace(
          testConnectionController,
          'getActiveConnectionName',
          sandbox.fake.returns('fakeName'),
        );
      });

      test('show active connection in code lenses', () => {
        sandbox.replace(
          testConnectionController,
          'getMongoClientConnectionOptions',
          sandbox.fake.returns({
            url: TEST_DATABASE_URI,
          }),
        );
        const codeLens = testCodeLensProvider.provideCodeLenses(mockTextDoc);

        expect(codeLens).to.be.an('array');
        expect(codeLens.length).to.be.equal(1);
        expect(codeLens[0].command?.title).to.be.equal(
          '$(mdb-connection-active)Connected to fakeName',
        );
        expect(codeLens[0].range.start.line).to.be.equal(0);
        expect(codeLens[0].range.end.line).to.be.equal(0);
        expect(codeLens[0].command?.command).to.be.equal(
          'mdb.changeActiveConnection',
        );
      });

      test('show active connection and default database in code lenses, when connected to a default database', () => {
        sandbox.replace(
          testConnectionController,
          'getMongoClientConnectionOptions',
          sandbox.fake.returns({
            url: `${TEST_DATABASE_URI}/fakeDBName`,
          }),
        );
        const codeLens = testCodeLensProvider.provideCodeLenses(mockTextDoc);
        expect(codeLens).to.be.an('array');
        expect(codeLens.length).to.be.equal(1);
        expect(codeLens[0].command?.title).to.be.equal(
          '$(mdb-connection-active)Connected to fakeName with default database fakeDBName',
        );
        expect(codeLens[0].range.start.line).to.be.equal(0);
        expect(codeLens[0].range.end.line).to.be.equal(0);
        expect(codeLens[0].command?.command).to.be.equal(
          'mdb.changeActiveConnection',
        );
      });
    });
  });

  suite('the regular JS file', () => {
    const mockFileName = path.join('nonexistent', 'playground-test.js');
    const mockDocumentUri = vscode.Uri.from({
      path: mockFileName,
      scheme: 'untitled',
    });
    const mockTextDoc: vscode.TextDocument = {
      uri: mockDocumentUri,
    } as Pick<vscode.TextDocument, 'uri'> as vscode.TextDocument;

    suite('user is not connected', () => {
      beforeEach(() => {
        const fakeShowQuickPick = sandbox.fake();
        sandbox.replace(vscode.window, 'showQuickPick', fakeShowQuickPick);
      });

      test('show not show the active connection code lenses', () => {
        const codeLens = testCodeLensProvider.provideCodeLenses(mockTextDoc);

        expect(codeLens).to.be.an('array');
        expect(codeLens.length).to.be.equal(0);
      });
    });

    suite('user is connected', () => {
      beforeEach(() => {
        const findStub = sandbox.stub();
        findStub.resolves([
          {
            field: 'Text message',
          },
        ]);
        const instanceStub = sandbox.stub();
        const onceStub = sandbox.stub();
        instanceStub.resolves({
          dataLake: {},
          build: {},
          genuineMongoDB: {},
          host: {},
        } as unknown as Awaited<ReturnType<DataService['instance']>>);
        const activeDataServiceStub = {
          find: findStub,
          instance: instanceStub,
          once: onceStub,
        } as unknown as DataService;

        testConnectionController.setActiveDataService(activeDataServiceStub);
        sandbox.replace(
          testConnectionController,
          'getActiveConnectionName',
          sandbox.fake.returns('fakeName'),
        );
      });

      test('show not show the active connection code lenses', () => {
        const codeLens = testCodeLensProvider.provideCodeLenses(mockTextDoc);

        expect(codeLens).to.be.an('array');
        expect(codeLens.length).to.be.equal(0);
      });
    });
  });
});
