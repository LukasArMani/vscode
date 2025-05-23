import * as parser from '@babel/parser';
import type { NodePath } from '@babel/traverse';
import traverse from '@babel/traverse';
import type * as t from '@babel/types';

const PLACEHOLDER = 'TRIGGER_CHARACTER';

export interface VisitorSelection {
  start: { line: number; character: number };
  end: { line: number; character: number };
}

export interface VisitorTextAndSelection {
  textFromEditor: string;
  selection: VisitorSelection;
}

type ObjectKey = t.ObjectProperty | t.SpreadElement | t.ObjectMethod;

export interface CompletionState {
  databaseName: string | null;
  collectionName: string | null;
  streamProcessorName: string | null;
  isObjectKey: boolean;
  isIdentifierObjectValue: boolean;
  isTextObjectValue: boolean;
  isStage: boolean;
  stageOperator: string | null;
  isCollectionSymbol: boolean;
  isStreamProcessorSymbol: boolean;
  isUseCallExpression: boolean;
  isGlobalSymbol: boolean;
  isDbSymbol: boolean;
  isSpSymbol: boolean;
  isCollectionName: boolean;
  isStreamProcessorName: boolean;
  isAggregationCursor: boolean;
  isFindCursor: boolean;
}

export interface NamespaceState {
  databaseName: string | null;
  collectionName: string | null;
}

export class Visitor {
  _state: CompletionState | NamespaceState | {};
  _selection: VisitorSelection;

  constructor() {
    this._state = {};
    this._selection = {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    };
  }

  _visitCallExpression(path: NodePath): void {
    if (path.node.type !== 'CallExpression') {
      return;
    }

    this._checkIsUseCall(path.node);
    this._checkIsCollectionNameAsCallExpression(path.node);
    this._checkIsStreamProcessorNameAsCallExpression(path.node);
    this._checkHasDatabaseName(path.node);
  }

  _visitMemberExpression(path: NodePath): void {
    if (path.node.type !== 'MemberExpression') {
      return;
    }

    this._checkHasAggregationCall(path.node);
    this._checkHasFindCall(path.node);
    this._checkIsCollectionSymbol(path.node);
    this._checkIsCollectionNameAsMemberExpression(path.node);
    this._checkHasCollectionName(path.node);
    this._checkIsStreamProcessorSymbol(path.node);
    this._checkIsStreamProcessorNameAsMemberExpression(path.node);
    this._checkHasStreamProcessorName(path.node);
  }

  _visitExpressionStatement(path: NodePath): void {
    if (path.node.type === 'ExpressionStatement') {
      this._checkIsGlobalSymbol(path.node);
      this._checkIsDbSymbol(path.node);
      this._checkIsSpSymbol(path.node);
    }
  }

  _visitObjectExpression(path: NodePath): void {
    if (path.node.type === 'ObjectExpression') {
      this._checkIsObjectKey(path.node);
      this._checkIsIdentifierObjectValue(path.node);
      this._checkIsTextObjectValue(path.node);
    }
  }

  _visitArrayExpression(path: NodePath): void {
    if (path.node.type === 'ArrayExpression') {
      this._checkIsStage(path.node);
      this._checkIsStageOperator(path);
    }
  }

  _handleTriggerCharacter(
    textFromEditor: string,
    position: { line: number; character: number },
  ): string {
    const textLines = textFromEditor.split('\n');
    // Text before the current character
    const prefix =
      position.character === 0
        ? ''
        : textLines[position.line].slice(0, position.character);
    // Text after the current character
    const postfix =
      position.character === 0
        ? textLines[position.line]
        : textLines[position.line].slice(position.character);

    // Use a placeholder to handle a trigger dot
    // and track of the current character position
    // TODO: check the absolute character position
    textLines[position.line] = `${prefix}${PLACEHOLDER}${postfix}`;

    return textLines.join('\n');
  }

  parseASTForCompletion(
    textFromEditor = '',
    position: { line: number; character: number },
  ): CompletionState {
    const selection: VisitorSelection = {
      start: position,
      end: { line: 0, character: 0 },
    };

    this._state = this._getDefaultsForCompletion();
    textFromEditor = this._handleTriggerCharacter(textFromEditor, position);

    this.parseAST({ textFromEditor, selection });

    return this._state as CompletionState;
  }

  parseAST({ textFromEditor, selection }: VisitorTextAndSelection): void {
    this._selection = selection;

    let ast;
    try {
      ast = parser.parse(textFromEditor, {
        // Parse in strict mode and allow module declarations
        sourceType: 'module',
      });
    } catch (error) {
      /* Silent fail. When a user hasn't finished typing it causes parsing JS errors */
    }

    traverse(ast, {
      enter: (path: NodePath) => {
        this._visitCallExpression(path);
        this._visitMemberExpression(path);
        this._visitExpressionStatement(path);
        this._visitObjectExpression(path);
        this._visitArrayExpression(path);
      },
    });
  }

  _getDefaultsForCompletion(): CompletionState {
    return {
      databaseName: null,
      collectionName: null,
      streamProcessorName: null,
      isObjectKey: false,
      isIdentifierObjectValue: false,
      isTextObjectValue: false,
      isStage: false,
      stageOperator: null,
      isCollectionSymbol: false,
      isStreamProcessorSymbol: false,
      isUseCallExpression: false,
      isGlobalSymbol: false,
      isDbSymbol: false,
      isSpSymbol: false,
      isCollectionName: false,
      isStreamProcessorName: false,
      isAggregationCursor: false,
      isFindCursor: false,
    };
  }

  _checkIsUseCallAsSimpleString(node: t.CallExpression): void {
    if (
      node.callee.type === 'Identifier' &&
      node.callee.name === 'use' &&
      node.arguments.length === 1 &&
      node.arguments[0].type === 'StringLiteral' &&
      node.arguments[0].value.includes(PLACEHOLDER) &&
      'isUseCallExpression' in this._state
    ) {
      this._state.isUseCallExpression = true;
    }
  }

  _checkIsUseCallAsTemplate(node: t.CallExpression): void {
    if (
      node.callee.type === 'Identifier' &&
      node.callee.name === 'use' &&
      node.arguments &&
      node.arguments.length === 1 &&
      node.arguments[0].type === 'TemplateLiteral' &&
      node.arguments[0].quasis.length === 1 &&
      node.arguments[0].quasis[0].value?.raw &&
      node.arguments[0].quasis[0].value?.raw.includes(PLACEHOLDER) &&
      'isUseCallExpression' in this._state
    ) {
      this._state.isUseCallExpression = true;
    }
  }

  _checkIsUseCall(node: t.CallExpression): void {
    this._checkIsUseCallAsSimpleString(node);
    this._checkIsUseCallAsTemplate(node);
  }

  _checkIsGlobalSymbol(node: t.ExpressionStatement): void {
    if (
      node.expression.type === 'Identifier' &&
      node.expression.name.includes('TRIGGER_CHARACTER') &&
      'isGlobalSymbol' in this._state
    ) {
      this._state.isGlobalSymbol = true;
    }
  }

  _checkIsDbSymbol(node: t.ExpressionStatement): void {
    if (
      node.expression.type === 'MemberExpression' &&
      node.expression.object.type === 'Identifier' &&
      node.expression.object.name === 'db' &&
      'isDbSymbol' in this._state
    ) {
      this._state.isDbSymbol = true;
    }
  }

  _checkIsSpSymbol(node: t.ExpressionStatement): void {
    if (
      node.expression.type === 'MemberExpression' &&
      node.expression.object.type === 'Identifier' &&
      node.expression.object.name === 'sp' &&
      'isSpSymbol' in this._state
    ) {
      this._state.isSpSymbol = true;
    }
  }

  _checkIsObjectKey(node: t.ObjectExpression): void {
    node.properties.find((item: ObjectKey) => {
      if (
        item.type === 'ObjectProperty' &&
        item.key.type === 'Identifier' &&
        item.key.name.includes(PLACEHOLDER) &&
        'isObjectKey' in this._state
      ) {
        this._state.isObjectKey = true;
      }
    });
  }

  _checkIsIdentifierObjectValue(node: t.ObjectExpression): void {
    node.properties.find((item: ObjectKey) => {
      if (
        item.type === 'ObjectProperty' &&
        item.value.type === 'Identifier' &&
        item.value.name.includes(PLACEHOLDER) &&
        'isIdentifierObjectValue' in this._state
      ) {
        this._state.isIdentifierObjectValue = true;
      }
    });
  }

  _checkIsTextObjectValue(node: t.ObjectExpression): void {
    node.properties.find((item: ObjectKey) => {
      if (
        ((item.type === 'ObjectProperty' &&
          item.value.type === 'StringLiteral' &&
          item.value.value.includes(PLACEHOLDER)) ||
          (item.type === 'ObjectProperty' &&
            item.value.type === 'TemplateLiteral' &&
            item.value?.quasis.length === 1 &&
            item.value.quasis[0].value?.raw.includes(PLACEHOLDER))) &&
        'isTextObjectValue' in this._state
      ) {
        this._state.isTextObjectValue = true;
      }
    });
  }

  _checkIsStage(node: t.ArrayExpression): void {
    if (node.elements) {
      node.elements.forEach((item) => {
        if (item?.type === 'ObjectExpression') {
          item.properties.find((item: ObjectKey) => {
            if (
              item.type === 'ObjectProperty' &&
              item.key.type === 'Identifier' &&
              item.key.name.includes(PLACEHOLDER) &&
              'isStage' in this._state
            ) {
              this._state.isStage = true;
            }
          });
        }
      });
    }
  }

  _checkIsStageOperator(path: NodePath): void {
    if (path.node.type === 'ArrayExpression' && path.node.elements) {
      path.node.elements.forEach((item) => {
        if (item?.type === 'ObjectExpression') {
          item.properties.find((item: ObjectKey) => {
            if (
              item.type === 'ObjectProperty' &&
              item.key.type === 'Identifier' &&
              item.value.type === 'ObjectExpression'
            ) {
              const name = item.key.name;
              path.scope.traverse(item, {
                enter: (path: NodePath) => {
                  if (
                    path.node.type === 'ObjectProperty' &&
                    path.node.key.type === 'Identifier' &&
                    path.node.key.name.includes(PLACEHOLDER) &&
                    'stageOperator' in this._state
                  ) {
                    this._state.stageOperator = name;
                  }
                },
              });
            }
          });
        }
      });
    }
  }

  _isParentAroundSelection(
    node: t.ArrayExpression | t.CallExpression,
  ): boolean {
    if (
      node.loc?.start?.line &&
      (node.loc.start.line - 1 < this._selection.start.line ||
        (node.loc.start.line - 1 === this._selection.start.line &&
          node.loc.start.column < this._selection.start.character)) &&
      node.loc.end.line &&
      (node.loc.end.line - 1 > this._selection.end.line ||
        (node.loc.end.line - 1 === this._selection.end.line &&
          node.loc.end.column > this._selection.end.character))
    ) {
      return true;
    }

    return false;
  }

  _isObjectPropBeforeSelection(node: t.ObjectProperty): boolean {
    if (
      node.key.loc?.end &&
      (node.key.loc?.end.line - 1 < this._selection.start?.line ||
        (node.key.loc?.end.line - 1 === this._selection.start?.line &&
          node.key.loc?.end.column < this._selection.start?.character))
    ) {
      return true;
    }

    return false;
  }

  _isVariableIdentifierBeforeSelection(node: t.VariableDeclarator): boolean {
    if (
      node.id.loc?.end &&
      (node.id.loc?.end.line - 1 < this._selection.start?.line ||
        (node.id.loc?.end.line - 1 === this._selection.start?.line &&
          node.id.loc?.end.column < this._selection.start?.character))
    ) {
      return true;
    }

    return false;
  }

  _isWithinSelection(node: t.ArrayExpression | t.ObjectExpression): boolean {
    if (
      node.loc?.start?.line &&
      node.loc.start.line - 1 === this._selection.start?.line &&
      node.loc?.start?.column &&
      node.loc.start.column >= this._selection.start?.character &&
      node.loc?.end?.line &&
      node.loc.end.line - 1 === this._selection.end?.line &&
      node.loc?.end?.column &&
      node.loc.end.column <= this._selection.end?.character
    ) {
      return true;
    }

    return false;
  }

  _checkIsCollectionNameAsMemberExpression(node: t.MemberExpression): void {
    if (
      node.object.type === 'Identifier' &&
      node.object.name === 'db' &&
      ((node.property.type === 'Identifier' &&
        node.property.name.includes(PLACEHOLDER)) ||
        (node.property.type === 'StringLiteral' &&
          node.property.value.includes(PLACEHOLDER))) &&
      'isCollectionName' in this._state
    ) {
      this._state.isCollectionName = true;
    }
  }

  _checkGetCollectionAsSimpleString(node: t.CallExpression): void {
    if (
      node.arguments[0].type === 'StringLiteral' &&
      node.arguments[0].value.includes(PLACEHOLDER) &&
      'isCollectionName' in this._state
    ) {
      this._state.isCollectionName = true;
    }
  }

  _checkGetCollectionAsTemplate(node: t.CallExpression): void {
    if (
      node.arguments[0].type === 'TemplateLiteral' &&
      node.arguments[0].quasis.length === 1 &&
      node.arguments[0].quasis[0].value.raw.includes(PLACEHOLDER) &&
      'isCollectionName' in this._state
    ) {
      this._state.isCollectionName = true;
    }
  }

  _checkIsCollectionNameAsCallExpression(node: t.CallExpression): void {
    if (
      node.callee.type === 'MemberExpression' &&
      node.callee.object.type === 'Identifier' &&
      node.callee.object.name === 'db' &&
      node.callee.property.type === 'Identifier' &&
      node.callee.property.name === 'getCollection' &&
      node.arguments.length === 1
    ) {
      this._checkGetCollectionAsSimpleString(node);
      this._checkGetCollectionAsTemplate(node);
    }
  }

  _checkHasAggregationCall(node: t.MemberExpression): void {
    if (
      node.object.type === 'CallExpression' &&
      node.property.type === 'Identifier' &&
      node.property.name.includes(PLACEHOLDER) &&
      node.object.callee.type === 'MemberExpression' &&
      !node.object.callee.computed &&
      node.object.callee.property.type === 'Identifier' &&
      node.object.callee.property.name === 'aggregate' &&
      'isAggregationCursor' in this._state
    ) {
      this._state.isAggregationCursor = true;
    }
  }

  _checkHasFindCall(node: t.MemberExpression): void {
    if (
      node.object.type === 'CallExpression' &&
      node.property.type === 'Identifier' &&
      node.property.name.includes(PLACEHOLDER) &&
      node.object.callee.type === 'MemberExpression' &&
      !node.object.callee.computed &&
      node.object.callee.property.type === 'Identifier' &&
      node.object.callee.property.name === 'find' &&
      'isFindCursor' in this._state
    ) {
      this._state.isFindCursor = true;
    }
  }

  _checkHasDatabaseName(node: t.CallExpression): void {
    if (
      node.callee.type === 'Identifier' &&
      node.callee.name === 'use' &&
      node.arguments.length === 1 &&
      node.arguments[0].type === 'StringLiteral' &&
      node.loc &&
      (this._selection.start.line > node.loc.end.line - 1 ||
        (this._selection.start.line === node.loc.end.line - 1 &&
          this._selection.start.character >= node.loc.end.column)) &&
      'databaseName' in this._state
    ) {
      this._state.databaseName = node.arguments[0].value;
    }
  }

  _checkHasCollectionNameMemberExpression(node: t.MemberExpression): void {
    if (
      node.object.type === 'MemberExpression' &&
      node.object.object.type === 'Identifier' &&
      node.object.object.name === 'db'
    ) {
      if (
        node.object.property.type === 'Identifier' &&
        'collectionName' in this._state
      ) {
        this._state.collectionName = node.object.property.name;
      } else if (
        node.object.property.type === 'StringLiteral' &&
        'collectionName' in this._state
      ) {
        this._state.collectionName = node.object.property.value;
      }
    }
  }

  _checkHasCollectionNameCallExpression(node: t.MemberExpression): void {
    if (
      node.object.type === 'CallExpression' &&
      node.object.callee.type === 'MemberExpression' &&
      node.object.callee.object.type === 'Identifier' &&
      node.object.callee.object.name === 'db' &&
      node.object.callee.property.type === 'Identifier' &&
      node.object.callee.property.name === 'getCollection' &&
      node.object.arguments.length === 1 &&
      node.object.arguments[0].type === 'StringLiteral' &&
      'collectionName' in this._state
    ) {
      this._state.collectionName = node.object.arguments[0].value;
    }
  }

  _checkHasCollectionName(node: t.MemberExpression): void {
    this._checkHasCollectionNameMemberExpression(node);
    this._checkHasCollectionNameCallExpression(node);
  }

  _checkIsCollectionMemberExpression(node: t.MemberExpression): void {
    if (
      node.object.type === 'MemberExpression' &&
      node.object.object.type === 'Identifier' &&
      node.object.object.name === 'db' &&
      node.property.type === 'Identifier' &&
      node.property.name.includes(PLACEHOLDER) &&
      'isCollectionSymbol' in this._state
    ) {
      this._state.isCollectionSymbol = true;
    }
  }

  _checkIsCollectionCallExpression(node: t.MemberExpression): void {
    if (
      node.object.type === 'CallExpression' &&
      node.object.callee.type === 'MemberExpression' &&
      node.object.callee.object.type === 'Identifier' &&
      node.object.callee.object.name === 'db' &&
      node.object.callee.property.type === 'Identifier' &&
      node.object.callee.property.name === 'getCollection' &&
      node.property.type === 'Identifier' &&
      node.property.name.includes(PLACEHOLDER) &&
      'isCollectionSymbol' in this._state
    ) {
      this._state.isCollectionSymbol = true;
    }
  }

  _checkIsCollectionSymbol(node: t.MemberExpression): void {
    this._checkIsCollectionMemberExpression(node);
    this._checkIsCollectionCallExpression(node);
  }

  _checkIsStreamProcessorNameAsMemberExpression(
    node: t.MemberExpression,
  ): void {
    if (
      node.object.type === 'Identifier' &&
      node.object.name === 'sp' &&
      ((node.property.type === 'Identifier' &&
        node.property.name.includes(PLACEHOLDER)) ||
        (node.property.type === 'StringLiteral' &&
          node.property.value.includes(PLACEHOLDER))) &&
      'isStreamProcessorName' in this._state
    ) {
      this._state.isSpSymbol = true;
      this._state.isStreamProcessorName = true;
    }
  }

  _checkIsStreamProcessorNameAsCallExpression(node: t.CallExpression): void {
    if (
      node.callee.type === 'MemberExpression' &&
      node.callee.object.type === 'Identifier' &&
      node.callee.object.name === 'sp' &&
      node.callee.property.type === 'Identifier' &&
      node.callee.property.name === 'getProcessor' &&
      node.arguments.length === 1
    ) {
      this._checkGetStreamProcessorAsSimpleString(node);
      this._checkGetStreamProcessorAsTemplate(node);
    }
  }

  _checkGetStreamProcessorAsSimpleString(node: t.CallExpression): void {
    if (
      node.arguments[0].type === 'StringLiteral' &&
      node.arguments[0].value.includes(PLACEHOLDER) &&
      'isStreamProcessorName' in this._state
    ) {
      this._state.isStreamProcessorName = true;
    }
  }

  _checkGetStreamProcessorAsTemplate(node: t.CallExpression): void {
    if (
      node.arguments[0].type === 'TemplateLiteral' &&
      node.arguments[0].quasis.length === 1 &&
      node.arguments[0].quasis[0].value.raw.includes(PLACEHOLDER) &&
      'isStreamProcessorName' in this._state
    ) {
      this._state.isStreamProcessorName = true;
    }
  }

  _checkHasStreamProcessorName(node: t.MemberExpression): void {
    this._checkHasStreamProcessorNameMemberExpression(node);
    this._checkHasStreamProcessorNameCallExpression(node);
  }

  _checkHasStreamProcessorNameMemberExpression(node: t.MemberExpression): void {
    if (
      node.object.type === 'MemberExpression' &&
      node.object.object.type === 'Identifier' &&
      node.object.object.name === 'sp'
    ) {
      if (
        node.object.property.type === 'Identifier' &&
        'streamProcessorName' in this._state
      ) {
        this._state.streamProcessorName = node.object.property.name;
      } else if (
        node.object.property.type === 'StringLiteral' &&
        'streamProcessorName' in this._state
      ) {
        this._state.streamProcessorName = node.object.property.value;
      }
    }
  }

  _checkHasStreamProcessorNameCallExpression(node: t.MemberExpression): void {
    if (
      node.object.type === 'CallExpression' &&
      node.object.callee.type === 'MemberExpression' &&
      node.object.callee.object.type === 'Identifier' &&
      node.object.callee.object.name === 'sp' &&
      node.object.callee.property.type === 'Identifier' &&
      node.object.callee.property.name === 'getProcessor' &&
      node.object.arguments.length === 1 &&
      node.object.arguments[0].type === 'StringLiteral' &&
      'streamProcessorName' in this._state
    ) {
      this._state.streamProcessorName = node.object.arguments[0].value;
    }
  }

  _checkIsStreamProcessorSymbol(node: t.MemberExpression): void {
    this._checkIsStreamProcessorMemberExpression(node);
    this._checkIsStreamProcessorCallExpression(node);
  }

  _checkIsStreamProcessorMemberExpression(node: t.MemberExpression): void {
    if (
      node.object.type === 'MemberExpression' &&
      node.object.object.type === 'Identifier' &&
      node.object.object.name === 'sp' &&
      node.property.type === 'Identifier' &&
      node.property.name.includes(PLACEHOLDER) &&
      'isStreamProcessorSymbol' in this._state
    ) {
      this._state.isStreamProcessorSymbol = true;
    }
  }

  _checkIsStreamProcessorCallExpression(node: t.MemberExpression): void {
    if (
      node.object.type === 'CallExpression' &&
      node.object.callee.type === 'MemberExpression' &&
      node.object.callee.object.type === 'Identifier' &&
      node.object.callee.object.name === 'sp' &&
      node.object.callee.property.type === 'Identifier' &&
      node.object.callee.property.name === 'getProcessor' &&
      node.property.type === 'Identifier' &&
      node.property.name.includes(PLACEHOLDER) &&
      'isStreamProcessorSymbol' in this._state
    ) {
      this._state.isStreamProcessorSymbol = true;
    }
  }
}
