/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import * as chars from '../chars';
import {DEFAULT_INTERPOLATION_CONFIG, InterpolationConfig} from '../ml_parser/interpolation_config';
import {InterpolatedAttributeToken, InterpolatedTextToken, TokenType as MlParserTokenType} from '../ml_parser/tokens';

import {AbsoluteSourceSpan, AST, ASTWithSource, Binary, BindingPipe, Call, Chain, Conditional, EmptyExpr, ExpressionBinding, ImplicitReceiver, Interpolation, KeyedRead, KeyedWrite, LiteralArray, LiteralMap, LiteralMapKey, LiteralPrimitive, NonNullAssert, ParserError, ParseSpan, PrefixNot, PropertyRead, PropertyWrite, RecursiveAstVisitor, SafeCall, SafeKeyedRead, SafePropertyRead, TemplateBinding, TemplateBindingIdentifier, ThisReceiver, Unary, VariableBinding} from './ast';
import {EOF, Lexer, Token, TokenType} from './lexer';

export interface InterpolationPiece {
  text: string;
  start: number;
  end: number;
}
export class SplitInterpolation {
  constructor(
      public strings: InterpolationPiece[], public expressions: InterpolationPiece[],
      public offsets: number[]) {}
}

export class TemplateBindingParseResult {
  constructor(
      public templateBindings: TemplateBinding[], public warnings: string[],
      public errors: ParserError[]) {}
}

/**
 * Represents the possible parse modes to be used as a bitmask.
 *
 * 表示要用作位掩码的可能的解析模式。
 *
 */
export const enum ParseFlags {
  None = 0,

  /**
   * Whether an output binding is being parsed.
   *
   * 是否正在解析输出绑定。
   *
   */
  Action = 1 << 0,

  /**
   * Whether an assignment event is being parsed, i.e. an expression originating from
   * two-way-binding aka banana-in-a-box syntax.
   *
   * 是否正在解析赋值事件，即来自双向绑定的表达式，也就是 banner-in-a-box 语法。
   *
   */
  AssignmentEvent = 1 << 1,
}

export class Parser {
  private errors: ParserError[] = [];

  constructor(private _lexer: Lexer) {}

  parseAction(
      input: string, isAssignmentEvent: boolean, location: string, absoluteOffset: number,
      interpolationConfig: InterpolationConfig = DEFAULT_INTERPOLATION_CONFIG): ASTWithSource {
    this._checkNoInterpolation(input, location, interpolationConfig);
    const sourceToLex = this._stripComments(input);
    const tokens = this._lexer.tokenize(sourceToLex);
    let flags = ParseFlags.Action;
    if (isAssignmentEvent) {
      flags |= ParseFlags.AssignmentEvent;
    }
    const ast =
        new _ParseAST(input, location, absoluteOffset, tokens, flags, this.errors, 0).parseChain();
    return new ASTWithSource(ast, input, location, absoluteOffset, this.errors);
  }

  parseBinding(
      input: string, location: string, absoluteOffset: number,
      interpolationConfig: InterpolationConfig = DEFAULT_INTERPOLATION_CONFIG): ASTWithSource {
    const ast = this._parseBindingAst(input, location, absoluteOffset, interpolationConfig);
    return new ASTWithSource(ast, input, location, absoluteOffset, this.errors);
  }

  private checkSimpleExpression(ast: AST): string[] {
    const checker = new SimpleExpressionChecker();
    ast.visit(checker);
    return checker.errors;
  }

  parseSimpleBinding(
      input: string, location: string, absoluteOffset: number,
      interpolationConfig: InterpolationConfig = DEFAULT_INTERPOLATION_CONFIG): ASTWithSource {
    const ast = this._parseBindingAst(input, location, absoluteOffset, interpolationConfig);
    const errors = this.checkSimpleExpression(ast);
    if (errors.length > 0) {
      this._reportError(
          `Host binding expression cannot contain ${errors.join(' ')}`, input, location);
    }
    return new ASTWithSource(ast, input, location, absoluteOffset, this.errors);
  }

  private _reportError(message: string, input: string, errLocation: string, ctxLocation?: string) {
    this.errors.push(new ParserError(message, input, errLocation, ctxLocation));
  }

  private _parseBindingAst(
      input: string, location: string, absoluteOffset: number,
      interpolationConfig: InterpolationConfig): AST {
    this._checkNoInterpolation(input, location, interpolationConfig);
    const sourceToLex = this._stripComments(input);
    const tokens = this._lexer.tokenize(sourceToLex);
    return new _ParseAST(input, location, absoluteOffset, tokens, ParseFlags.None, this.errors, 0)
        .parseChain();
  }

  /**
   * Parse microsyntax template expression and return a list of bindings or
   * parsing errors in case the given expression is invalid.
   *
   * 解析微语法模板表达式，并在给定表达式无效的情况下返回绑定或解析错误列表。
   *
   * For example,
   *
   * 例如，
   *
   * ```
   *   <div *ngFor="let item of items">
   *         ^      ^ absoluteValueOffset for `templateValue`
   *         absoluteKeyOffset for `templateKey`
   * ```
   *
   * contains three bindings:
   *
   * 包含三个绑定：
   *
   * 1. ngFor -> null
   *
   * 2. item -> NgForOfContext.$implicit
   *
   *    项 -> NgForOfContext.$implicit
   *
   * 3. ngForOf -> items
   *
   *    ngForOf -> 条目
   *
   * This is apparent from the de-sugared template:
   *
   * 这从脱糖模板中可以明显看出：
   *
   * ```
   *   <ng-template ngFor let-item [ngForOf]="items">
   * ```
   *
   * @param templateKey name of directive, without the \* prefix. For example: ngIf, ngFor
   *
   * 指令的名称，不带 \* 前缀。例如： ngIf、ngFor
   * @param templateValue RHS of the microsyntax attribute
   *
   * 微语法属性的 RHS
   * @param templateUrl template filename if it's external, component filename if it's inline
   *
   * 如果是外部的，则为模板文件名，如果是内联的，则为组件文件名
   * @param absoluteKeyOffset start of the `templateKey`
   *
   * `templateKey` 的开始
   * @param absoluteValueOffset start of the `templateValue`
   *
   * `templateValue` 值的开始
   */
  parseTemplateBindings(
      templateKey: string, templateValue: string, templateUrl: string, absoluteKeyOffset: number,
      absoluteValueOffset: number): TemplateBindingParseResult {
    const tokens = this._lexer.tokenize(templateValue);
    const parser = new _ParseAST(
        templateValue, templateUrl, absoluteValueOffset, tokens, ParseFlags.None, this.errors,
        0 /* relative offset */);
    return parser.parseTemplateBindings({
      source: templateKey,
      span: new AbsoluteSourceSpan(absoluteKeyOffset, absoluteKeyOffset + templateKey.length),
    });
  }

  parseInterpolation(
      input: string, location: string, absoluteOffset: number,
      interpolatedTokens: InterpolatedAttributeToken[]|InterpolatedTextToken[]|null,
      interpolationConfig: InterpolationConfig = DEFAULT_INTERPOLATION_CONFIG): ASTWithSource|null {
    const {strings, expressions, offsets} =
        this.splitInterpolation(input, location, interpolatedTokens, interpolationConfig);
    if (expressions.length === 0) return null;

    const expressionNodes: AST[] = [];

    for (let i = 0; i < expressions.length; ++i) {
      const expressionText = expressions[i].text;
      const sourceToLex = this._stripComments(expressionText);
      const tokens = this._lexer.tokenize(sourceToLex);
      const ast =
          new _ParseAST(
              input, location, absoluteOffset, tokens, ParseFlags.None, this.errors, offsets[i])
              .parseChain();
      expressionNodes.push(ast);
    }

    return this.createInterpolationAst(
        strings.map(s => s.text), expressionNodes, input, location, absoluteOffset);
  }

  /**
   * Similar to `parseInterpolation`, but treats the provided string as a single expression
   * element that would normally appear within the interpolation prefix and suffix (`{{` and `}}`).
   * This is used for parsing the switch expression in ICUs.
   *
   * 类似于 `parseInterpolation` ，但将提供的字符串视为通常出现在插值前缀和后缀（`{{` 和 `}}`
   *）中的单个表达式元素。这用于解析 ICU 中的 switch 表达式。
   *
   */
  parseInterpolationExpression(expression: string, location: string, absoluteOffset: number):
      ASTWithSource {
    const sourceToLex = this._stripComments(expression);
    const tokens = this._lexer.tokenize(sourceToLex);
    const ast =
        new _ParseAST(expression, location, absoluteOffset, tokens, ParseFlags.None, this.errors, 0)
            .parseChain();
    const strings = ['', ''];  // The prefix and suffix strings are both empty
    return this.createInterpolationAst(strings, [ast], expression, location, absoluteOffset);
  }

  private createInterpolationAst(
      strings: string[], expressions: AST[], input: string, location: string,
      absoluteOffset: number): ASTWithSource {
    const span = new ParseSpan(0, input.length);
    const interpolation =
        new Interpolation(span, span.toAbsolute(absoluteOffset), strings, expressions);
    return new ASTWithSource(interpolation, input, location, absoluteOffset, this.errors);
  }

  /**
   * Splits a string of text into "raw" text segments and expressions present in interpolations in
   * the string.
   * Returns `null` if there are no interpolations, otherwise a
   * `SplitInterpolation` with splits that look like
   *   <raw text> <expression> <raw text> ... <raw text> <expression> <raw text>
   *
   * 将文本字符串拆分为“原始”文本段和字符串中的插值表达式。如果没有插值，则返回 `null` ，否则返回
   * `SplitInterpolation` ，其拆分看起来像<raw text><expression><raw text>...<raw
   * text><expression><raw text>
   *
   */
  splitInterpolation(
      input: string, location: string,
      interpolatedTokens: InterpolatedAttributeToken[]|InterpolatedTextToken[]|null,
      interpolationConfig: InterpolationConfig = DEFAULT_INTERPOLATION_CONFIG): SplitInterpolation {
    const strings: InterpolationPiece[] = [];
    const expressions: InterpolationPiece[] = [];
    const offsets: number[] = [];
    const inputToTemplateIndexMap =
        interpolatedTokens ? getIndexMapForOriginalTemplate(interpolatedTokens) : null;
    let i = 0;
    let atInterpolation = false;
    let extendLastString = false;
    let {start: interpStart, end: interpEnd} = interpolationConfig;
    while (i < input.length) {
      if (!atInterpolation) {
        // parse until starting {{
        const start = i;
        i = input.indexOf(interpStart, i);
        if (i === -1) {
          i = input.length;
        }
        const text = input.substring(start, i);
        strings.push({text, start, end: i});

        atInterpolation = true;
      } else {
        // parse from starting {{ to ending }} while ignoring content inside quotes.
        const fullStart = i;
        const exprStart = fullStart + interpStart.length;
        const exprEnd = this._getInterpolationEndIndex(input, interpEnd, exprStart);
        if (exprEnd === -1) {
          // Could not find the end of the interpolation; do not parse an expression.
          // Instead we should extend the content on the last raw string.
          atInterpolation = false;
          extendLastString = true;
          break;
        }
        const fullEnd = exprEnd + interpEnd.length;

        const text = input.substring(exprStart, exprEnd);
        if (text.trim().length === 0) {
          this._reportError(
              'Blank expressions are not allowed in interpolated strings', input,
              `at column ${i} in`, location);
        }
        expressions.push({text, start: fullStart, end: fullEnd});
        const startInOriginalTemplate = inputToTemplateIndexMap?.get(fullStart) ?? fullStart;
        const offset = startInOriginalTemplate + interpStart.length;
        offsets.push(offset);

        i = fullEnd;
        atInterpolation = false;
      }
    }
    if (!atInterpolation) {
      // If we are now at a text section, add the remaining content as a raw string.
      if (extendLastString) {
        const piece = strings[strings.length - 1];
        piece.text += input.substring(i);
        piece.end = input.length;
      } else {
        strings.push({text: input.substring(i), start: i, end: input.length});
      }
    }
    return new SplitInterpolation(strings, expressions, offsets);
  }

  wrapLiteralPrimitive(input: string|null, location: string, absoluteOffset: number):
      ASTWithSource {
    const span = new ParseSpan(0, input == null ? 0 : input.length);
    return new ASTWithSource(
        new LiteralPrimitive(span, span.toAbsolute(absoluteOffset), input), input, location,
        absoluteOffset, this.errors);
  }

  private _stripComments(input: string): string {
    const i = this._commentStart(input);
    return i != null ? input.substring(0, i) : input;
  }

  private _commentStart(input: string): number|null {
    let outerQuote: number|null = null;
    for (let i = 0; i < input.length - 1; i++) {
      const char = input.charCodeAt(i);
      const nextChar = input.charCodeAt(i + 1);

      if (char === chars.$SLASH && nextChar == chars.$SLASH && outerQuote == null) return i;

      if (outerQuote === char) {
        outerQuote = null;
      } else if (outerQuote == null && chars.isQuote(char)) {
        outerQuote = char;
      }
    }
    return null;
  }

  private _checkNoInterpolation(input: string, location: string, {start, end}: InterpolationConfig):
      void {
    let startIndex = -1;
    let endIndex = -1;

    for (const charIndex of this._forEachUnquotedChar(input, 0)) {
      if (startIndex === -1) {
        if (input.startsWith(start)) {
          startIndex = charIndex;
        }
      } else {
        endIndex = this._getInterpolationEndIndex(input, end, charIndex);
        if (endIndex > -1) {
          break;
        }
      }
    }

    if (startIndex > -1 && endIndex > -1) {
      this._reportError(
          `Got interpolation (${start}${end}) where expression was expected`, input,
          `at column ${startIndex} in`, location);
    }
  }

  /**
   * Finds the index of the end of an interpolation expression
   * while ignoring comments and quoted content.
   *
   * 查找插值表达式结尾的索引，同时忽略注释和引用内容。
   *
   */
  private _getInterpolationEndIndex(input: string, expressionEnd: string, start: number): number {
    for (const charIndex of this._forEachUnquotedChar(input, start)) {
      if (input.startsWith(expressionEnd, charIndex)) {
        return charIndex;
      }

      // Nothing else in the expression matters after we've
      // hit a comment so look directly for the end token.
      if (input.startsWith('//', charIndex)) {
        return input.indexOf(expressionEnd, charIndex);
      }
    }

    return -1;
  }

  /**
   * Generator used to iterate over the character indexes of a string that are outside of quotes.
   *
   * 用于迭代引号之外的字符串的字符索引的生成器。
   *
   * @param input String to loop through.
   *
   * 要循环的字符串。
   *
   * @param start Index within the string at which to start.
   *
   * 要开始的字符串中的索引。
   *
   */
  private * _forEachUnquotedChar(input: string, start: number) {
    let currentQuote: string|null = null;
    let escapeCount = 0;
    for (let i = start; i < input.length; i++) {
      const char = input[i];
      // Skip the characters inside quotes. Note that we only care about the outer-most
      // quotes matching up and we need to account for escape characters.
      if (chars.isQuote(input.charCodeAt(i)) && (currentQuote === null || currentQuote === char) &&
          escapeCount % 2 === 0) {
        currentQuote = currentQuote === null ? char : null;
      } else if (currentQuote === null) {
        yield i;
      }
      escapeCount = char === '\\' ? escapeCount + 1 : 0;
    }
  }
}

/**
 * Describes a stateful context an expression parser is in.
 *
 * 描述表达式解析器所在的有状态上下文。
 *
 */
enum ParseContextFlags {
  None = 0,
  /**
   * A Writable context is one in which a value may be written to an lvalue.
   * For example, after we see a property access, we may expect a write to the
   * property via the "=" operator.
   *   prop
   *        ^ possible "=" after
   *
   * 可写上下文是可以将值写入左值的上下文。例如，在我们看到属性访问之后，我们可能会期望通过“="
   * 运算符对属性进行写入。 prop ^ 可能的 "=" 之后
   *
   */
  Writable = 1,
}

export class _ParseAST {
  private rparensExpected = 0;
  private rbracketsExpected = 0;
  private rbracesExpected = 0;
  private context = ParseContextFlags.None;

  // Cache of expression start and input indeces to the absolute source span they map to, used to
  // prevent creating superfluous source spans in `sourceSpan`.
  // A serial of the expression start and input index is used for mapping because both are stateful
  // and may change for subsequent expressions visited by the parser.
  private sourceSpanCache = new Map<string, AbsoluteSourceSpan>();

  index: number = 0;

  constructor(
      public input: string, public location: string, public absoluteOffset: number,
      public tokens: Token[], public parseFlags: ParseFlags, private errors: ParserError[],
      private offset: number) {}

  peek(offset: number): Token {
    const i = this.index + offset;
    return i < this.tokens.length ? this.tokens[i] : EOF;
  }

  get next(): Token {
    return this.peek(0);
  }

  /**
   * Whether all the parser input has been processed.
   *
   * 是否已处理所有解析器输入。
   *
   */
  get atEOF(): boolean {
    return this.index >= this.tokens.length;
  }

  /**
   * Index of the next token to be processed, or the end of the last token if all have been
   * processed.
   *
   * 要处理的下一个标记的索引，如果已处理全部，则为最后一个标记的结尾。
   *
   */
  get inputIndex(): number {
    return this.atEOF ? this.currentEndIndex : this.next.index + this.offset;
  }

  /**
   * End index of the last processed token, or the start of the first token if none have been
   * processed.
   *
   * 最后处理的标记的结束索引，如果没有被处理，则为第一个标记的开始。
   *
   */
  get currentEndIndex(): number {
    if (this.index > 0) {
      const curToken = this.peek(-1);
      return curToken.end + this.offset;
    }
    // No tokens have been processed yet; return the next token's start or the length of the input
    // if there is no token.
    if (this.tokens.length === 0) {
      return this.input.length + this.offset;
    }
    return this.next.index + this.offset;
  }

  /**
   * Returns the absolute offset of the start of the current token.
   *
   * 返回当前标记开始的绝对偏移量。
   *
   */
  get currentAbsoluteOffset(): number {
    return this.absoluteOffset + this.inputIndex;
  }

  /**
   * Retrieve a `ParseSpan` from `start` to the current position (or to `artificialEndIndex` if
   * provided).
   *
   * 检索从 `start` 到当前位置的 `ParseSpan`（如果提供，则检索到 `artificialEndIndex`）。
   *
   * @param start Position from which the `ParseSpan` will start.
   *
   * `ParseSpan` 将开始的位置。
   *
   * @param artificialEndIndex Optional ending index to be used if provided (and if greater than the
   *     natural ending index)
   *
   * 如果提供，则要使用的可选结尾索引（并且如果大于自然结尾索引）
   *
   */
  span(start: number, artificialEndIndex?: number): ParseSpan {
    let endIndex = this.currentEndIndex;
    if (artificialEndIndex !== undefined && artificialEndIndex > this.currentEndIndex) {
      endIndex = artificialEndIndex;
    }

    // In some unusual parsing scenarios (like when certain tokens are missing and an `EmptyExpr` is
    // being created), the current token may already be advanced beyond the `currentEndIndex`. This
    // appears to be a deep-seated parser bug.
    //
    // As a workaround for now, swap the start and end indices to ensure a valid `ParseSpan`.
    // TODO(alxhub): fix the bug upstream in the parser state, and remove this workaround.
    if (start > endIndex) {
      const tmp = endIndex;
      endIndex = start;
      start = tmp;
    }

    return new ParseSpan(start, endIndex);
  }

  sourceSpan(start: number, artificialEndIndex?: number): AbsoluteSourceSpan {
    const serial = `${start}@${this.inputIndex}:${artificialEndIndex}`;
    if (!this.sourceSpanCache.has(serial)) {
      this.sourceSpanCache.set(
          serial, this.span(start, artificialEndIndex).toAbsolute(this.absoluteOffset));
    }
    return this.sourceSpanCache.get(serial)!;
  }

  advance() {
    this.index++;
  }

  /**
   * Executes a callback in the provided context.
   *
   * 在提供的上下文中执行回调。
   *
   */
  private withContext<T>(context: ParseContextFlags, cb: () => T): T {
    this.context |= context;
    const ret = cb();
    this.context ^= context;
    return ret;
  }

  consumeOptionalCharacter(code: number): boolean {
    if (this.next.isCharacter(code)) {
      this.advance();
      return true;
    } else {
      return false;
    }
  }

  peekKeywordLet(): boolean {
    return this.next.isKeywordLet();
  }
  peekKeywordAs(): boolean {
    return this.next.isKeywordAs();
  }

  /**
   * Consumes an expected character, otherwise emits an error about the missing expected character
   * and skips over the token stream until reaching a recoverable point.
   *
   * 使用预期字符，否则会发出有关缺失的预期字符的错误并跳过标记流，直到达到可恢复点。
   *
   * See `this.error` and `this.skip` for more details.
   *
   * 有关更多详细信息，请参阅 `this.error` 和 `this.skip` 。
   *
   */
  expectCharacter(code: number) {
    if (this.consumeOptionalCharacter(code)) return;
    this.error(`Missing expected ${String.fromCharCode(code)}`);
  }

  consumeOptionalOperator(op: string): boolean {
    if (this.next.isOperator(op)) {
      this.advance();
      return true;
    } else {
      return false;
    }
  }

  expectOperator(operator: string) {
    if (this.consumeOptionalOperator(operator)) return;
    this.error(`Missing expected operator ${operator}`);
  }

  prettyPrintToken(tok: Token): string {
    return tok === EOF ? 'end of input' : `token ${tok}`;
  }

  expectIdentifierOrKeyword(): string|null {
    const n = this.next;
    if (!n.isIdentifier() && !n.isKeyword()) {
      if (n.isPrivateIdentifier()) {
        this._reportErrorForPrivateIdentifier(n, 'expected identifier or keyword');
      } else {
        this.error(`Unexpected ${this.prettyPrintToken(n)}, expected identifier or keyword`);
      }
      return null;
    }
    this.advance();
    return n.toString() as string;
  }

  expectIdentifierOrKeywordOrString(): string {
    const n = this.next;
    if (!n.isIdentifier() && !n.isKeyword() && !n.isString()) {
      if (n.isPrivateIdentifier()) {
        this._reportErrorForPrivateIdentifier(n, 'expected identifier, keyword or string');
      } else {
        this.error(
            `Unexpected ${this.prettyPrintToken(n)}, expected identifier, keyword, or string`);
      }
      return '';
    }
    this.advance();
    return n.toString() as string;
  }

  parseChain(): AST {
    const exprs: AST[] = [];
    const start = this.inputIndex;
    while (this.index < this.tokens.length) {
      const expr = this.parsePipe();
      exprs.push(expr);

      if (this.consumeOptionalCharacter(chars.$SEMICOLON)) {
        if (!(this.parseFlags & ParseFlags.Action)) {
          this.error('Binding expression cannot contain chained expression');
        }
        while (this.consumeOptionalCharacter(chars.$SEMICOLON)) {
        }  // read all semicolons
      } else if (this.index < this.tokens.length) {
        const errorIndex = this.index;
        this.error(`Unexpected token '${this.next}'`);
        // The `error` call above will skip ahead to the next recovery point in an attempt to
        // recover part of the expression, but that might be the token we started from which will
        // lead to an infinite loop. If that's the case, break the loop assuming that we can't
        // parse further.
        if (this.index === errorIndex) {
          break;
        }
      }
    }
    if (exprs.length === 0) {
      // We have no expressions so create an empty expression that spans the entire input length
      const artificialStart = this.offset;
      const artificialEnd = this.offset + this.input.length;
      return new EmptyExpr(
          this.span(artificialStart, artificialEnd),
          this.sourceSpan(artificialStart, artificialEnd));
    }
    if (exprs.length == 1) return exprs[0];
    return new Chain(this.span(start), this.sourceSpan(start), exprs);
  }

  parsePipe(): AST {
    const start = this.inputIndex;
    let result = this.parseExpression();
    if (this.consumeOptionalOperator('|')) {
      if (this.parseFlags & ParseFlags.Action) {
        this.error('Cannot have a pipe in an action expression');
      }

      do {
        const nameStart = this.inputIndex;
        let nameId = this.expectIdentifierOrKeyword();
        let nameSpan: AbsoluteSourceSpan;
        let fullSpanEnd: number|undefined = undefined;
        if (nameId !== null) {
          nameSpan = this.sourceSpan(nameStart);
        } else {
          // No valid identifier was found, so we'll assume an empty pipe name ('').
          nameId = '';

          // However, there may have been whitespace present between the pipe character and the next
          // token in the sequence (or the end of input). We want to track this whitespace so that
          // the `BindingPipe` we produce covers not just the pipe character, but any trailing
          // whitespace beyond it. Another way of thinking about this is that the zero-length name
          // is assumed to be at the end of any whitespace beyond the pipe character.
          //
          // Therefore, we push the end of the `ParseSpan` for this pipe all the way up to the
          // beginning of the next token, or until the end of input if the next token is EOF.
          fullSpanEnd = this.next.index !== -1 ? this.next.index : this.input.length + this.offset;

          // The `nameSpan` for an empty pipe name is zero-length at the end of any whitespace
          // beyond the pipe character.
          nameSpan = new ParseSpan(fullSpanEnd, fullSpanEnd).toAbsolute(this.absoluteOffset);
        }

        const args: AST[] = [];
        while (this.consumeOptionalCharacter(chars.$COLON)) {
          args.push(this.parseExpression());

          // If there are additional expressions beyond the name, then the artificial end for the
          // name is no longer relevant.
        }
        result = new BindingPipe(
            this.span(start), this.sourceSpan(start, fullSpanEnd), result, nameId, args, nameSpan);
      } while (this.consumeOptionalOperator('|'));
    }

    return result;
  }

  parseExpression(): AST {
    return this.parseConditional();
  }

  parseConditional(): AST {
    const start = this.inputIndex;
    const result = this.parseLogicalOr();

    if (this.consumeOptionalOperator('?')) {
      const yes = this.parsePipe();
      let no: AST;
      if (!this.consumeOptionalCharacter(chars.$COLON)) {
        const end = this.inputIndex;
        const expression = this.input.substring(start, end);
        this.error(`Conditional expression ${expression} requires all 3 expressions`);
        no = new EmptyExpr(this.span(start), this.sourceSpan(start));
      } else {
        no = this.parsePipe();
      }
      return new Conditional(this.span(start), this.sourceSpan(start), result, yes, no);
    } else {
      return result;
    }
  }

  parseLogicalOr(): AST {
    // '||'
    const start = this.inputIndex;
    let result = this.parseLogicalAnd();
    while (this.consumeOptionalOperator('||')) {
      const right = this.parseLogicalAnd();
      result = new Binary(this.span(start), this.sourceSpan(start), '||', result, right);
    }
    return result;
  }

  parseLogicalAnd(): AST {
    // '&&'
    const start = this.inputIndex;
    let result = this.parseNullishCoalescing();
    while (this.consumeOptionalOperator('&&')) {
      const right = this.parseNullishCoalescing();
      result = new Binary(this.span(start), this.sourceSpan(start), '&&', result, right);
    }
    return result;
  }

  parseNullishCoalescing(): AST {
    // '??'
    const start = this.inputIndex;
    let result = this.parseEquality();
    while (this.consumeOptionalOperator('??')) {
      const right = this.parseEquality();
      result = new Binary(this.span(start), this.sourceSpan(start), '??', result, right);
    }
    return result;
  }

  parseEquality(): AST {
    // '==','!=','===','!=='
    const start = this.inputIndex;
    let result = this.parseRelational();
    while (this.next.type == TokenType.Operator) {
      const operator = this.next.strValue;
      switch (operator) {
        case '==':
        case '===':
        case '!=':
        case '!==':
          this.advance();
          const right = this.parseRelational();
          result = new Binary(this.span(start), this.sourceSpan(start), operator, result, right);
          continue;
      }
      break;
    }
    return result;
  }

  parseRelational(): AST {
    // '<', '>', '<=', '>='
    const start = this.inputIndex;
    let result = this.parseAdditive();
    while (this.next.type == TokenType.Operator) {
      const operator = this.next.strValue;
      switch (operator) {
        case '<':
        case '>':
        case '<=':
        case '>=':
          this.advance();
          const right = this.parseAdditive();
          result = new Binary(this.span(start), this.sourceSpan(start), operator, result, right);
          continue;
      }
      break;
    }
    return result;
  }

  parseAdditive(): AST {
    // '+', '-'
    const start = this.inputIndex;
    let result = this.parseMultiplicative();
    while (this.next.type == TokenType.Operator) {
      const operator = this.next.strValue;
      switch (operator) {
        case '+':
        case '-':
          this.advance();
          let right = this.parseMultiplicative();
          result = new Binary(this.span(start), this.sourceSpan(start), operator, result, right);
          continue;
      }
      break;
    }
    return result;
  }

  parseMultiplicative(): AST {
    // '*', '%', '/'
    const start = this.inputIndex;
    let result = this.parsePrefix();
    while (this.next.type == TokenType.Operator) {
      const operator = this.next.strValue;
      switch (operator) {
        case '*':
        case '%':
        case '/':
          this.advance();
          let right = this.parsePrefix();
          result = new Binary(this.span(start), this.sourceSpan(start), operator, result, right);
          continue;
      }
      break;
    }
    return result;
  }

  parsePrefix(): AST {
    if (this.next.type == TokenType.Operator) {
      const start = this.inputIndex;
      const operator = this.next.strValue;
      let result: AST;
      switch (operator) {
        case '+':
          this.advance();
          result = this.parsePrefix();
          return Unary.createPlus(this.span(start), this.sourceSpan(start), result);
        case '-':
          this.advance();
          result = this.parsePrefix();
          return Unary.createMinus(this.span(start), this.sourceSpan(start), result);
        case '!':
          this.advance();
          result = this.parsePrefix();
          return new PrefixNot(this.span(start), this.sourceSpan(start), result);
      }
    }
    return this.parseCallChain();
  }

  parseCallChain(): AST {
    const start = this.inputIndex;
    let result = this.parsePrimary();
    while (true) {
      if (this.consumeOptionalCharacter(chars.$PERIOD)) {
        result = this.parseAccessMember(result, start, false);
      } else if (this.consumeOptionalOperator('?.')) {
        if (this.consumeOptionalCharacter(chars.$LPAREN)) {
          result = this.parseCall(result, start, true);
        } else {
          result = this.consumeOptionalCharacter(chars.$LBRACKET) ?
              this.parseKeyedReadOrWrite(result, start, true) :
              this.parseAccessMember(result, start, true);
        }
      } else if (this.consumeOptionalCharacter(chars.$LBRACKET)) {
        result = this.parseKeyedReadOrWrite(result, start, false);
      } else if (this.consumeOptionalCharacter(chars.$LPAREN)) {
        result = this.parseCall(result, start, false);
      } else if (this.consumeOptionalOperator('!')) {
        result = new NonNullAssert(this.span(start), this.sourceSpan(start), result);

      } else {
        return result;
      }
    }
  }

  parsePrimary(): AST {
    const start = this.inputIndex;
    if (this.consumeOptionalCharacter(chars.$LPAREN)) {
      this.rparensExpected++;
      const result = this.parsePipe();
      this.rparensExpected--;
      this.expectCharacter(chars.$RPAREN);
      return result;

    } else if (this.next.isKeywordNull()) {
      this.advance();
      return new LiteralPrimitive(this.span(start), this.sourceSpan(start), null);

    } else if (this.next.isKeywordUndefined()) {
      this.advance();
      return new LiteralPrimitive(this.span(start), this.sourceSpan(start), void 0);

    } else if (this.next.isKeywordTrue()) {
      this.advance();
      return new LiteralPrimitive(this.span(start), this.sourceSpan(start), true);

    } else if (this.next.isKeywordFalse()) {
      this.advance();
      return new LiteralPrimitive(this.span(start), this.sourceSpan(start), false);

    } else if (this.next.isKeywordThis()) {
      this.advance();
      return new ThisReceiver(this.span(start), this.sourceSpan(start));
    } else if (this.consumeOptionalCharacter(chars.$LBRACKET)) {
      this.rbracketsExpected++;
      const elements = this.parseExpressionList(chars.$RBRACKET);
      this.rbracketsExpected--;
      this.expectCharacter(chars.$RBRACKET);
      return new LiteralArray(this.span(start), this.sourceSpan(start), elements);

    } else if (this.next.isCharacter(chars.$LBRACE)) {
      return this.parseLiteralMap();

    } else if (this.next.isIdentifier()) {
      return this.parseAccessMember(
          new ImplicitReceiver(this.span(start), this.sourceSpan(start)), start, false);
    } else if (this.next.isNumber()) {
      const value = this.next.toNumber();
      this.advance();
      return new LiteralPrimitive(this.span(start), this.sourceSpan(start), value);

    } else if (this.next.isString()) {
      const literalValue = this.next.toString();
      this.advance();
      return new LiteralPrimitive(this.span(start), this.sourceSpan(start), literalValue);

    } else if (this.next.isPrivateIdentifier()) {
      this._reportErrorForPrivateIdentifier(this.next, null);
      return new EmptyExpr(this.span(start), this.sourceSpan(start));

    } else if (this.index >= this.tokens.length) {
      this.error(`Unexpected end of expression: ${this.input}`);
      return new EmptyExpr(this.span(start), this.sourceSpan(start));
    } else {
      this.error(`Unexpected token ${this.next}`);
      return new EmptyExpr(this.span(start), this.sourceSpan(start));
    }
  }

  parseExpressionList(terminator: number): AST[] {
    const result: AST[] = [];

    do {
      if (!this.next.isCharacter(terminator)) {
        result.push(this.parsePipe());
      } else {
        break;
      }
    } while (this.consumeOptionalCharacter(chars.$COMMA));
    return result;
  }

  parseLiteralMap(): LiteralMap {
    const keys: LiteralMapKey[] = [];
    const values: AST[] = [];
    const start = this.inputIndex;
    this.expectCharacter(chars.$LBRACE);
    if (!this.consumeOptionalCharacter(chars.$RBRACE)) {
      this.rbracesExpected++;
      do {
        const keyStart = this.inputIndex;
        const quoted = this.next.isString();
        const key = this.expectIdentifierOrKeywordOrString();
        keys.push({key, quoted});

        // Properties with quoted keys can't use the shorthand syntax.
        if (quoted) {
          this.expectCharacter(chars.$COLON);
          values.push(this.parsePipe());
        } else if (this.consumeOptionalCharacter(chars.$COLON)) {
          values.push(this.parsePipe());
        } else {
          const span = this.span(keyStart);
          const sourceSpan = this.sourceSpan(keyStart);
          values.push(new PropertyRead(
              span, sourceSpan, sourceSpan, new ImplicitReceiver(span, sourceSpan), key));
        }
      } while (this.consumeOptionalCharacter(chars.$COMMA));
      this.rbracesExpected--;
      this.expectCharacter(chars.$RBRACE);
    }
    return new LiteralMap(this.span(start), this.sourceSpan(start), keys, values);
  }

  parseAccessMember(readReceiver: AST, start: number, isSafe: boolean): AST {
    const nameStart = this.inputIndex;
    const id = this.withContext(ParseContextFlags.Writable, () => {
      const id = this.expectIdentifierOrKeyword() ?? '';
      if (id.length === 0) {
        this.error(`Expected identifier for property access`, readReceiver.span.end);
      }
      return id;
    });
    const nameSpan = this.sourceSpan(nameStart);
    let receiver: AST;

    if (isSafe) {
      if (this.consumeOptionalAssignment()) {
        this.error('The \'?.\' operator cannot be used in the assignment');
        receiver = new EmptyExpr(this.span(start), this.sourceSpan(start));
      } else {
        receiver = new SafePropertyRead(
            this.span(start), this.sourceSpan(start), nameSpan, readReceiver, id);
      }
    } else {
      if (this.consumeOptionalAssignment()) {
        if (!(this.parseFlags & ParseFlags.Action)) {
          this.error('Bindings cannot contain assignments');
          return new EmptyExpr(this.span(start), this.sourceSpan(start));
        }

        const value = this.parseConditional();
        receiver = new PropertyWrite(
            this.span(start), this.sourceSpan(start), nameSpan, readReceiver, id, value);
      } else {
        receiver =
            new PropertyRead(this.span(start), this.sourceSpan(start), nameSpan, readReceiver, id);
      }
    }

    return receiver;
  }

  parseCall(receiver: AST, start: number, isSafe: boolean): AST {
    const argumentStart = this.inputIndex;
    this.rparensExpected++;
    const args = this.parseCallArguments();
    const argumentSpan = this.span(argumentStart, this.inputIndex).toAbsolute(this.absoluteOffset);
    this.expectCharacter(chars.$RPAREN);
    this.rparensExpected--;
    const span = this.span(start);
    const sourceSpan = this.sourceSpan(start);
    return isSafe ? new SafeCall(span, sourceSpan, receiver, args, argumentSpan) :
                    new Call(span, sourceSpan, receiver, args, argumentSpan);
  }

  private consumeOptionalAssignment(): boolean {
    // When parsing assignment events (originating from two-way-binding aka banana-in-a-box syntax),
    // it is valid for the primary expression to be terminated by the non-null operator. This
    // primary expression is substituted as LHS of the assignment operator to achieve
    // two-way-binding, such that the LHS could be the non-null operator. The grammar doesn't
    // naturally allow for this syntax, so assignment events are parsed specially.
    if ((this.parseFlags & ParseFlags.AssignmentEvent) && this.next.isOperator('!') &&
        this.peek(1).isOperator('=')) {
      // First skip over the ! operator.
      this.advance();
      // Then skip over the = operator, to fully consume the optional assignment operator.
      this.advance();
      return true;
    }

    return this.consumeOptionalOperator('=');
  }

  parseCallArguments(): BindingPipe[] {
    if (this.next.isCharacter(chars.$RPAREN)) return [];
    const positionals: AST[] = [];
    do {
      positionals.push(this.parsePipe());
    } while (this.consumeOptionalCharacter(chars.$COMMA));
    return positionals as BindingPipe[];
  }

  /**
   * Parses an identifier, a keyword, a string with an optional `-` in between,
   * and returns the string along with its absolute source span.
   *
   * 解析标识符、关键字、中间带有可选 `-` 的字符串，并返回字符串及其绝对源范围。
   *
   */
  expectTemplateBindingKey(): TemplateBindingIdentifier {
    let result = '';
    let operatorFound = false;
    const start = this.currentAbsoluteOffset;
    do {
      result += this.expectIdentifierOrKeywordOrString();
      operatorFound = this.consumeOptionalOperator('-');
      if (operatorFound) {
        result += '-';
      }
    } while (operatorFound);
    return {
      source: result,
      span: new AbsoluteSourceSpan(start, start + result.length),
    };
  }

  /**
   * Parse microsyntax template expression and return a list of bindings or
   * parsing errors in case the given expression is invalid.
   *
   * 解析微语法模板表达式，并在给定表达式无效的情况下返回绑定或解析错误列表。
   *
   * For example,
   *
   * 例如，
   *
   * ```
   *   <div *ngFor="let item of items; index as i; trackBy: func">
   * ```
   *
   * contains five bindings:
   *
   * 包含五个绑定：
   *
   * 1. ngFor -> null
   *
   * 2. item -> NgForOfContext.$implicit
   *
   *    项 -> NgForOfContext.$implicit
   *
   * 3. ngForOf -> items
   *
   *    ngForOf -> 条目
   *
   * 4. i -> NgForOfContext.index
   *
   * 5. ngForTrackBy -> func
   *
   * For a full description of the microsyntax grammar, see
   * <https://gist.github.com/mhevery/d3530294cff2e4a1b3fe15ff75d08855>
   *
   * 有关微语法语法的完整描述，请参阅<https://gist.github.com/mhevery/d3530294cff2e4a1b3fe15ff75d08855>
   *
   * @param templateKey name of the microsyntax directive, like ngIf, ngFor,
   * without the \*, along with its absolute span.
   *
   * 微语法指令的名称，例如 ngIf、ngFor ，不带 \* ，以及其绝对跨度。
   */
  parseTemplateBindings(templateKey: TemplateBindingIdentifier): TemplateBindingParseResult {
    const bindings: TemplateBinding[] = [];

    // The first binding is for the template key itself
    // In *ngFor="let item of items", key = "ngFor", value = null
    // In *ngIf="cond | pipe", key = "ngIf", value = "cond | pipe"
    bindings.push(...this.parseDirectiveKeywordBindings(templateKey));

    while (this.index < this.tokens.length) {
      // If it starts with 'let', then this must be variable declaration
      const letBinding = this.parseLetBinding();
      if (letBinding) {
        bindings.push(letBinding);
      } else {
        // Two possible cases here, either `value "as" key` or
        // "directive-keyword expression". We don't know which case, but both
        // "value" and "directive-keyword" are template binding key, so consume
        // the key first.
        const key = this.expectTemplateBindingKey();
        // Peek at the next token, if it is "as" then this must be variable
        // declaration.
        const binding = this.parseAsBinding(key);
        if (binding) {
          bindings.push(binding);
        } else {
          // Otherwise the key must be a directive keyword, like "of". Transform
          // the key to actual key. Eg. of -> ngForOf, trackBy -> ngForTrackBy
          key.source =
              templateKey.source + key.source.charAt(0).toUpperCase() + key.source.substring(1);
          bindings.push(...this.parseDirectiveKeywordBindings(key));
        }
      }
      this.consumeStatementTerminator();
    }

    return new TemplateBindingParseResult(bindings, [] /* warnings */, this.errors);
  }

  parseKeyedReadOrWrite(receiver: AST, start: number, isSafe: boolean): AST {
    return this.withContext(ParseContextFlags.Writable, () => {
      this.rbracketsExpected++;
      const key = this.parsePipe();
      if (key instanceof EmptyExpr) {
        this.error(`Key access cannot be empty`);
      }
      this.rbracketsExpected--;
      this.expectCharacter(chars.$RBRACKET);
      if (this.consumeOptionalOperator('=')) {
        if (isSafe) {
          this.error('The \'?.\' operator cannot be used in the assignment');
        } else {
          const value = this.parseConditional();
          return new KeyedWrite(this.span(start), this.sourceSpan(start), receiver, key, value);
        }
      } else {
        return isSafe ? new SafeKeyedRead(this.span(start), this.sourceSpan(start), receiver, key) :
                        new KeyedRead(this.span(start), this.sourceSpan(start), receiver, key);
      }

      return new EmptyExpr(this.span(start), this.sourceSpan(start));
    });
  }

  /**
   * Parse a directive keyword, followed by a mandatory expression.
   * For example, "of items", "trackBy: func".
   * The bindings are: ngForOf -> items, ngForTrackBy -> func
   * There could be an optional "as" binding that follows the expression.
   * For example,
   *
   * 解析指令关键字，后跟强制性表达式。例如，“条目的”、“trackBy: func”。绑定是： ngForOf ->
   * items、ngForTrackBy -> func 表达式后面可以有一个可选的“as”绑定。例如，
   *
   * ```
   *   *ngFor="let item of items | slice:0:1 as collection".
   *                    ^^ ^^^^^^^^^^^^^^^^^ ^^^^^^^^^^^^^
   *               keyword    bound target   optional 'as' binding
   * ```
   *
   * @param key binding key, for example, ngFor, ngIf, ngForOf, along with its
   * absolute span.
   *
   * 绑定键，例如 ngFor、ngIf、ngForOf 及其绝对跨度。
   *
   */
  private parseDirectiveKeywordBindings(key: TemplateBindingIdentifier): TemplateBinding[] {
    const bindings: TemplateBinding[] = [];
    this.consumeOptionalCharacter(chars.$COLON);  // trackBy: trackByFunction
    const value = this.getDirectiveBoundTarget();
    let spanEnd = this.currentAbsoluteOffset;
    // The binding could optionally be followed by "as". For example,
    // *ngIf="cond | pipe as x". In this case, the key in the "as" binding
    // is "x" and the value is the template key itself ("ngIf"). Note that the
    // 'key' in the current context now becomes the "value" in the next binding.
    const asBinding = this.parseAsBinding(key);
    if (!asBinding) {
      this.consumeStatementTerminator();
      spanEnd = this.currentAbsoluteOffset;
    }
    const sourceSpan = new AbsoluteSourceSpan(key.span.start, spanEnd);
    bindings.push(new ExpressionBinding(sourceSpan, key, value));
    if (asBinding) {
      bindings.push(asBinding);
    }
    return bindings;
  }

  /**
   * Return the expression AST for the bound target of a directive keyword
   * binding. For example,
   *
   * 返回指令关键字绑定的绑定目标的表达式 AST。例如，
   *
   * ```
   *   *ngIf="condition | pipe"
   *          ^^^^^^^^^^^^^^^^ bound target for "ngIf"
   *   *ngFor="let item of items"
   *                       ^^^^^ bound target for "ngForOf"
   * ```
   *
   */
  private getDirectiveBoundTarget(): ASTWithSource|null {
    if (this.next === EOF || this.peekKeywordAs() || this.peekKeywordLet()) {
      return null;
    }
    const ast = this.parsePipe();  // example: "condition | async"
    const {start, end} = ast.span;
    const value = this.input.substring(start, end);
    return new ASTWithSource(ast, value, this.location, this.absoluteOffset + start, this.errors);
  }

  /**
   * Return the binding for a variable declared using `as`. Note that the order
   * of the key-value pair in this declaration is reversed. For example,
   *
   * 返回使用 `as` 声明的变量的绑定。请注意，此声明中键值对的顺序是相反的。例如，
   *
   * ```
   *   *ngFor="let item of items; index as i"
   *                              ^^^^^    ^
   *                              value    key
   * ```
   *
   * @param value name of the value in the declaration, "ngIf" in the example
   * above, along with its absolute span.
   *
   * 声明中值的名称，在上面的示例中为“ngIf”，以及其绝对跨度。
   *
   */
  private parseAsBinding(value: TemplateBindingIdentifier): TemplateBinding|null {
    if (!this.peekKeywordAs()) {
      return null;
    }
    this.advance();  // consume the 'as' keyword
    const key = this.expectTemplateBindingKey();
    this.consumeStatementTerminator();
    const sourceSpan = new AbsoluteSourceSpan(value.span.start, this.currentAbsoluteOffset);
    return new VariableBinding(sourceSpan, key, value);
  }

  /**
   * Return the binding for a variable declared using `let`. For example,
   *
   * 返回使用 `let` 声明的变量的绑定。例如，
   *
   * ```
   *   *ngFor="let item of items; let i=index;"
   *           ^^^^^^^^           ^^^^^^^^^^^
   * ```
   *
   * In the first binding, `item` is bound to `NgForOfContext.$implicit`.
   * In the second binding, `i` is bound to `NgForOfContext.index`.
   *
   * 在第一个绑定中，`item` 绑定到 `NgForOfContext.$implicit` 。在第二个绑定中，`i` 绑定到
   * `NgForOfContext.index` 。
   *
   */
  private parseLetBinding(): TemplateBinding|null {
    if (!this.peekKeywordLet()) {
      return null;
    }
    const spanStart = this.currentAbsoluteOffset;
    this.advance();  // consume the 'let' keyword
    const key = this.expectTemplateBindingKey();
    let value: TemplateBindingIdentifier|null = null;
    if (this.consumeOptionalOperator('=')) {
      value = this.expectTemplateBindingKey();
    }
    this.consumeStatementTerminator();
    const sourceSpan = new AbsoluteSourceSpan(spanStart, this.currentAbsoluteOffset);
    return new VariableBinding(sourceSpan, key, value);
  }

  /**
   * Consume the optional statement terminator: semicolon or comma.
   *
   * 使用可选的语句终止符：分号或逗号。
   *
   */
  private consumeStatementTerminator() {
    this.consumeOptionalCharacter(chars.$SEMICOLON) || this.consumeOptionalCharacter(chars.$COMMA);
  }

  /**
   * Records an error and skips over the token stream until reaching a recoverable point. See
   * `this.skip` for more details on token skipping.
   *
   * 记录错误并跳过标记流，直到达到可恢复点。有关标记跳过的更多详细信息，请参阅 `this.skip` 。
   *
   */
  error(message: string, index: number|null = null) {
    this.errors.push(new ParserError(message, this.input, this.locationText(index), this.location));
    this.skip();
  }

  private locationText(index: number|null = null) {
    if (index == null) index = this.index;
    return (index < this.tokens.length) ? `at column ${this.tokens[index].index + 1} in` :
                                          `at the end of the expression`;
  }

  /**
   * Records an error for an unexpected private identifier being discovered.
   *
   * 记录正在发现的意外私有标识符的错误。
   *
   * @param token Token representing a private identifier.
   *
   * 表示私有标识符的标记。
   *
   * @param extraMessage Optional additional message being appended to the error.
   *
   * 附加到错误的可选附加消息。
   *
   */
  private _reportErrorForPrivateIdentifier(token: Token, extraMessage: string|null) {
    let errorMessage =
        `Private identifiers are not supported. Unexpected private identifier: ${token}`;
    if (extraMessage !== null) {
      errorMessage += `, ${extraMessage}`;
    }
    this.error(errorMessage);
  }

  /**
   * Error recovery should skip tokens until it encounters a recovery point.
   *
   * 错误恢复应该跳过标记，直到遇到恢复点。
   *
   * The following are treated as unconditional recovery points:
   *
   * 以下被视为无条件恢复点：
   *
   * - end of input
   *
   *   输入的结尾
   *
   * - ';' (parseChain() is always the root production, and it expects a ';')
   *
   *   ';'（parseChain() 始终是根产生式，它需要一个 ';'）
   *
   * - '|' (since pipes may be chained and each pipe expression may be treated independently)
   *
   *   '|'（因为管道可以被链接起来，并且每个管道表达式都可以独立处理）
   *
   * The following are conditional recovery points:
   *
   * 以下是条件恢复点：
   *
   * - ')', '}', ']' if one of calling productions is expecting one of these symbols
   *
   *   ')', '}', ']' 如果调用产生式之一期望这些符号之一
   *
   *   - This allows skip() to recover from errors such as '(a.) + 1' allowing more of the AST to be
   *     retained (it doesn't skip any tokens as the ')' is retained because of the '(' begins an '('
   *     <expr> ')' production). The recovery points of grouping symbols must be conditional as they
   *     must be skipped if none of the calling productions are not expecting the closing token else we
   *     will never make progress in the case of an extraneous group closing symbol (such as a stray
   *     ')'). That is, we skip a closing symbol if we are not in a grouping production.
   *
   *     这允许 skip() 从 '(a.) + 1' 等错误中恢复，允许保留更多 AST（它不会跳过任何标记，因为 ')' 是因为 '(' 开始'('<expr>')' 产生式）。分组符号的恢复点必须是有条件的，因为如果没有一个调用产生式不希望有关闭标记，则必须跳过它们，否则我们将永远不会取得进展.也就是说，如果我们不在分组产生式中，我们会跳过关闭符号。
   *
   * - '=' in a `Writable` context
   *
   *   `Writable` 上下文中的 '='
   *
   *   - In this context, we are able to recover after seeing the `=` operator, which
   *         signals the presence of an independent rvalue expression following the `=` operator.
   *
   *     在这种情况下，我们可以在看到 `=` 运算符后恢复，这表明 `=` 运算符之后存在一个独立的右值表达式。
   *
   * If a production expects one of these token it increments the corresponding nesting count,
   * and then decrements it just prior to checking if the token is in the input.
   *
   * 如果一个生产式需要这些标记之一，它会增加相应的嵌套计数，然后在检查标记是否在输入中之前减少它。
   *
   */
  private skip() {
    let n = this.next;
    while (this.index < this.tokens.length && !n.isCharacter(chars.$SEMICOLON) &&
           !n.isOperator('|') && (this.rparensExpected <= 0 || !n.isCharacter(chars.$RPAREN)) &&
           (this.rbracesExpected <= 0 || !n.isCharacter(chars.$RBRACE)) &&
           (this.rbracketsExpected <= 0 || !n.isCharacter(chars.$RBRACKET)) &&
           (!(this.context & ParseContextFlags.Writable) || !n.isOperator('='))) {
      if (this.next.isError()) {
        this.errors.push(
            new ParserError(this.next.toString()!, this.input, this.locationText(), this.location));
      }
      this.advance();
      n = this.next;
    }
  }
}

class SimpleExpressionChecker extends RecursiveAstVisitor {
  errors: string[] = [];

  override visitPipe() {
    this.errors.push('pipes');
  }
}
/**
 * Computes the real offset in the original template for indexes in an interpolation.
 *
 * 计算插值中索引在原始模板中的实际偏移量。
 *
 * Because templates can have encoded HTML entities and the input passed to the parser at this stage
 * of the compiler is the _decoded_ value, we need to compute the real offset using the original
 * encoded values in the interpolated tokens. Note that this is only a special case handling for
 * `MlParserTokenType.ENCODED_ENTITY` token types. All other interpolated tokens are expected to
 * have parts which exactly match the input string for parsing the interpolation.
 *
 * 因为模板可以有编码的 HTML 实体，并且在编译器的这个阶段传递给解析器的输入是 _ 解码 _
 * 后的值，所以我们需要使用插值标记中的原始编码值来计算实际偏移量。请注意，这只是
 * `MlParserTokenType.ENCODED_ENTITY`
 * 标记类型的特例处理。所有其他插值标记都应该具有与输入字符串完全匹配的部分，以解析插值。
 *
 * @param interpolatedTokens The tokens for the interpolated value.
 *
 * 内插值的标记。
 *
 * @returns
 *
 * A map of index locations in the decoded template to indexes in the original template
 *
 * 解码模板中的索引位置到原始模板中索引的映射
 *
 */
function getIndexMapForOriginalTemplate(interpolatedTokens: InterpolatedAttributeToken[]|
                                        InterpolatedTextToken[]): Map<number, number> {
  let offsetMap = new Map<number, number>();
  let consumedInOriginalTemplate = 0;
  let consumedInInput = 0;
  let tokenIndex = 0;
  while (tokenIndex < interpolatedTokens.length) {
    const currentToken = interpolatedTokens[tokenIndex];
    if (currentToken.type === MlParserTokenType.ENCODED_ENTITY) {
      const [decoded, encoded] = currentToken.parts;
      consumedInOriginalTemplate += encoded.length;
      consumedInInput += decoded.length;
    } else {
      const lengthOfParts = currentToken.parts.reduce((sum, current) => sum + current.length, 0);
      consumedInInput += lengthOfParts;
      consumedInOriginalTemplate += lengthOfParts;
    }
    offsetMap.set(consumedInInput, consumedInOriginalTemplate);
    tokenIndex++;
  }
  return offsetMap;
}
