/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import {AbsoluteSourceSpan, CssSelector, ParseSourceSpan, SelectorMatcher, TmplAstBoundEvent} from '@angular/compiler';
import {NgCompiler} from '@angular/compiler-cli/src/ngtsc/core';
import {absoluteFrom, absoluteFromSourceFile, AbsoluteFsPath} from '@angular/compiler-cli/src/ngtsc/file_system';
import {isExternalResource} from '@angular/compiler-cli/src/ngtsc/metadata';
import {DeclarationNode} from '@angular/compiler-cli/src/ngtsc/reflection';
import {DirectiveSymbol, TemplateTypeChecker} from '@angular/compiler-cli/src/ngtsc/typecheck/api';
import * as e from '@angular/compiler/src/expression_parser/ast';  // e for expression AST
import * as t from '@angular/compiler/src/render3/r3_ast';         // t for template AST
import ts from 'typescript';

import {ALIAS_NAME, SYMBOL_PUNC} from './display_parts';
import {findTightestNode, getParentClassDeclaration} from './ts_utils';

export function getTextSpanOfNode(node: t.Node|e.AST): ts.TextSpan {
  if (isTemplateNodeWithKeyAndValue(node)) {
    return toTextSpan(node.keySpan);
  } else if (
      node instanceof e.PropertyWrite || node instanceof e.BindingPipe ||
      node instanceof e.PropertyRead) {
    // The `name` part of a `PropertyWrite` and `BindingPipe` does not have its own AST
    // so there is no way to retrieve a `Symbol` for just the `name` via a specific node.
    return toTextSpan(node.nameSpan);
  } else {
    return toTextSpan(node.sourceSpan);
  }
}

export function toTextSpan(span: AbsoluteSourceSpan|ParseSourceSpan|e.ParseSpan): ts.TextSpan {
  let start: number, end: number;
  if (span instanceof AbsoluteSourceSpan || span instanceof e.ParseSpan) {
    start = span.start;
    end = span.end;
  } else {
    start = span.start.offset;
    end = span.end.offset;
  }
  return {start, length: end - start};
}

interface NodeWithKeyAndValue extends t.Node {
  keySpan: ParseSourceSpan;
  valueSpan?: ParseSourceSpan;
}

export function isTemplateNodeWithKeyAndValue(node: t.Node|e.AST): node is NodeWithKeyAndValue {
  return isTemplateNode(node) && node.hasOwnProperty('keySpan');
}

export function isWithinKey(position: number, node: NodeWithKeyAndValue): boolean {
  let {keySpan, valueSpan} = node;
  if (valueSpan === undefined && node instanceof TmplAstBoundEvent) {
    valueSpan = node.handlerSpan;
  }
  const isWithinKeyValue =
      isWithin(position, keySpan) || !!(valueSpan && isWithin(position, valueSpan));
  return isWithinKeyValue;
}

export function isWithinKeyValue(position: number, node: NodeWithKeyAndValue): boolean {
  let {keySpan, valueSpan} = node;
  if (valueSpan === undefined && node instanceof TmplAstBoundEvent) {
    valueSpan = node.handlerSpan;
  }
  const isWithinKeyValue =
      isWithin(position, keySpan) || !!(valueSpan && isWithin(position, valueSpan));
  return isWithinKeyValue;
}

export function isTemplateNode(node: t.Node|e.AST): node is t.Node {
  // Template node implements the Node interface so we cannot use instanceof.
  return node.sourceSpan instanceof ParseSourceSpan;
}

export function isExpressionNode(node: t.Node|e.AST): node is e.AST {
  return node instanceof e.AST;
}

export interface TemplateInfo {
  template: t.Node[];
  component: ts.ClassDeclaration;
}

function getInlineTemplateInfoAtPosition(
    sf: ts.SourceFile, position: number, compiler: NgCompiler): TemplateInfo|undefined {
  const expression = findTightestNode(sf, position);
  if (expression === undefined) {
    return undefined;
  }
  const classDecl = getParentClassDeclaration(expression);
  if (classDecl === undefined) {
    return undefined;
  }

  // Return `undefined` if the position is not on the template expression or the template resource
  // is not inline.
  const resources = compiler.getComponentResources(classDecl);
  if (resources === null || isExternalResource(resources.template) ||
      expression !== resources.template.expression) {
    return undefined;
  }

  const template = compiler.getTemplateTypeChecker().getTemplate(classDecl);
  if (template === null) {
    return undefined;
  }

  return {template, component: classDecl};
}

/**
 * Retrieves the `ts.ClassDeclaration` at a location along with its template nodes.
 *
 * 检索某个位置的 `ts.ClassDeclaration` 及其模板节点。
 *
 */
export function getTemplateInfoAtPosition(
    fileName: string, position: number, compiler: NgCompiler): TemplateInfo|undefined {
  if (isTypeScriptFile(fileName)) {
    const sf = compiler.getCurrentProgram().getSourceFile(fileName);
    if (sf === undefined) {
      return undefined;
    }

    return getInlineTemplateInfoAtPosition(sf, position, compiler);
  } else {
    return getFirstComponentForTemplateFile(fileName, compiler);
  }
}

/**
 * First, attempt to sort component declarations by file name.
 * If the files are the same, sort by start location of the declaration.
 *
 * 首先，尝试按文件名对组件声明进行排序。如果文件相同，请按声明的开始位置排序。
 *
 */
function tsDeclarationSortComparator(a: DeclarationNode, b: DeclarationNode): number {
  const aFile = a.getSourceFile().fileName;
  const bFile = b.getSourceFile().fileName;
  if (aFile < bFile) {
    return -1;
  } else if (aFile > bFile) {
    return 1;
  } else {
    return b.getFullStart() - a.getFullStart();
  }
}

function getFirstComponentForTemplateFile(fileName: string, compiler: NgCompiler): TemplateInfo|
    undefined {
  const templateTypeChecker = compiler.getTemplateTypeChecker();
  const components = compiler.getComponentsWithTemplateFile(fileName);
  const sortedComponents = Array.from(components).sort(tsDeclarationSortComparator);
  for (const component of sortedComponents) {
    if (!ts.isClassDeclaration(component)) {
      continue;
    }
    const template = templateTypeChecker.getTemplate(component);
    if (template === null) {
      continue;
    }
    return {template, component};
  }

  return undefined;
}

/**
 * Given an attribute node, converts it to string form for use as a CSS selector.
 *
 * 给定一个属性节点，将其转换为字符串形式以用作 CSS 选择器。
 *
 */
function toAttributeCssSelector(attribute: t.TextAttribute|t.BoundAttribute|t.BoundEvent): string {
  let selector: string;
  if (attribute instanceof t.BoundEvent || attribute instanceof t.BoundAttribute) {
    selector = `[${attribute.name}]`;
  } else {
    selector = `[${attribute.name}=${attribute.valueSpan?.toString() ?? ''}]`;
  }
  // Any dollar signs that appear in the attribute name and/or value need to be escaped because they
  // need to be taken as literal characters rather than special selector behavior of dollar signs in
  // CSS.
  return selector.replace('$', '\\$');
}

function getNodeName(node: t.Template|t.Element): string {
  return node instanceof t.Template ? (node.tagName ?? 'ng-template') : node.name;
}

/**
 * Given a template or element node, returns all attributes on the node.
 *
 * 给定模板或元素节点，返回节点上的所有属性。
 *
 */
function getAttributes(node: t.Template|
                       t.Element): Array<t.TextAttribute|t.BoundAttribute|t.BoundEvent> {
  const attributes: Array<t.TextAttribute|t.BoundAttribute|t.BoundEvent> =
      [...node.attributes, ...node.inputs, ...node.outputs];
  if (node instanceof t.Template) {
    attributes.push(...node.templateAttrs);
  }
  return attributes;
}

/**
 * Given two `Set`s, returns all items in the `left` which do not appear in the `right`.
 *
 * 给定两个 `Set` ，返回 `left` 没有出现在 `right` 的所有条目。
 *
 */
function difference<T>(left: Set<T>, right: Set<T>): Set<T> {
  const result = new Set<T>();
  for (const dir of left) {
    if (!right.has(dir)) {
      result.add(dir);
    }
  }
  return result;
}

/**
 * Given an element or template, determines which directives match because the tag is present. For
 * example, if a directive selector is `div[myAttr]`, this would match div elements but would not if
 * the selector were just `[myAttr]`. We find which directives are applied because of this tag by
 * elimination: compare the directive matches with the tag present against the directive matches
 * without it. The difference would be the directives which match because the tag is present.
 *
 * 给定一个元素或模板，确定哪些指令匹配，因为标签存在。例如，如果指令选择器是 `div[myAttr]`
 * ，这将匹配 div 元素，但如果选择器只是 `[myAttr]`
 * 则不会。我们通过消除来找到由于此标签而应用了哪些指令：将带有此标签的指令匹配项与没有它的指令匹配项进行比较。区别将是因为存在标签而匹配的指令。
 *
 * @param element The element or template node that the attribute/tag is part of.
 *
 * 属性/标签所属的元素或模板节点。
 *
 * @param directives The list of directives to match against.
 *
 * 要匹配的指令列表。
 *
 * @returns
 *
 * The list of directives matching the tag name via the strategy described above.
 *
 * 通过上述策略与标签名称匹配的指令列表。
 *
 */
// TODO(atscott): Add unit tests for this and the one for attributes
export function getDirectiveMatchesForElementTag<T extends {selector: string | null}>(
    element: t.Template|t.Element, directives: T[]): Set<T> {
  const attributes = getAttributes(element);
  const allAttrs = attributes.map(toAttributeCssSelector);
  const allDirectiveMatches =
      getDirectiveMatchesForSelector(directives, getNodeName(element) + allAttrs.join(''));
  const matchesWithoutElement = getDirectiveMatchesForSelector(directives, allAttrs.join(''));
  return difference(allDirectiveMatches, matchesWithoutElement);
}


export function makeElementSelector(element: t.Element|t.Template): string {
  const attributes = getAttributes(element);
  const allAttrs = attributes.map(toAttributeCssSelector);
  return getNodeName(element) + allAttrs.join('');
}

/**
 * Given an attribute name, determines which directives match because the attribute is present. We
 * find which directives are applied because of this attribute by elimination: compare the directive
 * matches with the attribute present against the directive matches without it. The difference would
 * be the directives which match because the attribute is present.
 *
 * 给定一个属性名称，确定哪些指令匹配，因为该属性存在。我们通过消除来找到由于此属性而应用了哪些指令：将具有存在属性的指令匹配项与没有它的指令匹配项进行比较。不同之处在于因为存在属性而匹配的指令。
 *
 * @param name The name of the attribute
 *
 * 属性的名称
 *
 * @param hostNode The node which the attribute appears on
 *
 * 属性出现的节点
 *
 * @param directives The list of directives to match against.
 *
 * 要匹配的指令列表。
 *
 * @returns
 *
 * The list of directives matching the tag name via the strategy described above.
 *
 * 通过上述策略与标签名称匹配的指令列表。
 *
 */
export function getDirectiveMatchesForAttribute(
    name: string, hostNode: t.Template|t.Element,
    directives: DirectiveSymbol[]): Set<DirectiveSymbol> {
  const attributes = getAttributes(hostNode);
  const allAttrs = attributes.map(toAttributeCssSelector);
  const allDirectiveMatches =
      getDirectiveMatchesForSelector(directives, getNodeName(hostNode) + allAttrs.join(''));
  const attrsExcludingName = attributes.filter(a => a.name !== name).map(toAttributeCssSelector);
  const matchesWithoutAttr = getDirectiveMatchesForSelector(
      directives, getNodeName(hostNode) + attrsExcludingName.join(''));
  return difference(allDirectiveMatches, matchesWithoutAttr);
}

/**
 * Given a list of directives and a text to use as a selector, returns the directives which match
 * for the selector.
 *
 * 给定指令列表和要用作选择器的文本，返回与选择器匹配的指令。
 *
 */
function getDirectiveMatchesForSelector<T extends {selector: string | null}>(
    directives: T[], selector: string): Set<T> {
  try {
    const selectors = CssSelector.parse(selector);
    if (selectors.length === 0) {
      return new Set();
    }
    return new Set(directives.filter((dir: T) => {
      if (dir.selector === null) {
        return false;
      }

      const matcher = new SelectorMatcher();
      matcher.addSelectables(CssSelector.parse(dir.selector));

      return selectors.some(selector => matcher.match(selector, null));
    }));
  } catch {
    // An invalid selector may throw an error. There would be no directive matches for an invalid
    // selector.
    return new Set();
  }
}

/**
 * Returns a new `ts.SymbolDisplayPart` array which has the alias imports from the tcb filtered
 * out, i.e. `i0.NgForOf`.
 *
 * 返回一个新的 `ts.SymbolDisplayPart` 数组，该数组具有从 tcb 过滤掉的别名导入，即 `i0.NgForOf` 。
 *
 */
export function filterAliasImports(displayParts: ts.SymbolDisplayPart[]): ts.SymbolDisplayPart[] {
  const tcbAliasImportRegex = /i\d+/;
  function isImportAlias(part: {kind: string, text: string}) {
    return part.kind === ALIAS_NAME && tcbAliasImportRegex.test(part.text);
  }
  function isDotPunctuation(part: {kind: string, text: string}) {
    return part.kind === SYMBOL_PUNC && part.text === '.';
  }

  return displayParts.filter((part, i) => {
    const previousPart = displayParts[i - 1];
    const nextPart = displayParts[i + 1];

    const aliasNameFollowedByDot =
        isImportAlias(part) && nextPart !== undefined && isDotPunctuation(nextPart);
    const dotPrecededByAlias =
        isDotPunctuation(part) && previousPart !== undefined && isImportAlias(previousPart);

    return !aliasNameFollowedByDot && !dotPrecededByAlias;
  });
}

export function isDollarEvent(n: t.Node|e.AST): n is e.PropertyRead {
  return n instanceof e.PropertyRead && n.name === '$event' &&
      n.receiver instanceof e.ImplicitReceiver && !(n.receiver instanceof e.ThisReceiver);
}

/**
 * Returns a new array formed by applying a given callback function to each element of the array,
 * and then flattening the result by one level.
 *
 * 返回一个新数组，通过将给定的回调函数应用于数组的每个元素，然后将结果展平一个级别来形成。
 *
 */
export function flatMap<T, R>(items: T[]|readonly T[], f: (item: T) => R[] | readonly R[]): R[] {
  const results: R[] = [];
  for (const x of items) {
    results.push(...f(x));
  }
  return results;
}

export function isTypeScriptFile(fileName: string): boolean {
  return fileName.endsWith('.ts');
}

export function isExternalTemplate(fileName: string): boolean {
  return !isTypeScriptFile(fileName);
}

export function isWithin(position: number, span: AbsoluteSourceSpan|ParseSourceSpan): boolean {
  let start: number, end: number;
  if (span instanceof ParseSourceSpan) {
    start = span.start.offset;
    end = span.end.offset;
  } else {
    start = span.start;
    end = span.end;
  }
  // Note both start and end are inclusive because we want to match conditions
  // like ¦start and end¦ where ¦ is the cursor.
  return start <= position && position <= end;
}

/**
 * For a given location in a shim file, retrieves the corresponding file url for the template and
 * the span in the template.
 *
 * 对于 shim 文件中的给定位置，检索模板的对应文件 url 和模板中的跨度。
 *
 */
export function getTemplateLocationFromTcbLocation(
    templateTypeChecker: TemplateTypeChecker, tcbPath: AbsoluteFsPath, tcbIsShim: boolean,
    positionInFile: number): {templateUrl: AbsoluteFsPath, span: ParseSourceSpan}|null {
  const mapping = templateTypeChecker.getTemplateMappingAtTcbLocation(
      {tcbPath, isShimFile: tcbIsShim, positionInFile});
  if (mapping === null) {
    return null;
  }
  const {templateSourceMapping, span} = mapping;

  let templateUrl: AbsoluteFsPath;
  if (templateSourceMapping.type === 'direct') {
    templateUrl = absoluteFromSourceFile(templateSourceMapping.node.getSourceFile());
  } else if (templateSourceMapping.type === 'external') {
    templateUrl = absoluteFrom(templateSourceMapping.templateUrl);
  } else {
    // This includes indirect mappings, which are difficult to map directly to the code
    // location. Diagnostics similarly return a synthetic template string for this case rather
    // than a real location.
    return null;
  }
  return {templateUrl, span};
}

export function isBoundEventWithSyntheticHandler(event: t.BoundEvent): boolean {
  // An event binding with no value (e.g. `(event|)`) parses to a `BoundEvent` with a
  // `LiteralPrimitive` handler with value `'ERROR'`, as opposed to a property binding with no
  // value which has an `EmptyExpr` as its value. This is a synthetic node created by the binding
  // parser, and is not suitable to use for Language Service analysis. Skip it.
  //
  // TODO(alxhub): modify the parser to generate an `EmptyExpr` instead.
  let handler: e.AST = event.handler;
  if (handler instanceof e.ASTWithSource) {
    handler = handler.ast;
  }
  if (handler instanceof e.LiteralPrimitive && handler.value === 'ERROR') {
    return true;
  }
  return false;
}
