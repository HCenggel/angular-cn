/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import * as o from './output/output_ast';

const CONSTANT_PREFIX = '_c';

/**
 * `ConstantPool` tries to reuse literal factories when two or more literals are identical.
 * We determine whether literals are identical by creating a key out of their AST using the
 * `KeyVisitor`. This constant is used to replace dynamic expressions which can't be safely
 * converted into a key. E.g. given an expression `{foo: bar()}`, since we don't know what
 * the result of `bar` will be, we create a key that looks like `{foo: <unknown>}`. Note
 * that we use a variable, rather than something like `null` in order to avoid collisions.
 *
 * 当两个或多个文字相同时，`ConstantPool` 会尝试重用文字工厂。我们通过使用 `KeyVisitor` 从 AST
 * 创建键来确定文字是否相同。此常量用于替换无法安全地转换为键的动态表达式。例如，给定一个表达式
 * `{foo: bar()}` ，由于我们不知道 `bar` 的结果将是什么，我们创建一个类似于 `{foo: <unknown>}`
 * 的键。请注意，我们使用变量，而不是 `null` 之类的东西以避免冲突。
 *
 */
const UNKNOWN_VALUE_KEY = o.variable('<unknown>');

/**
 * Context to use when producing a key.
 *
 * 生成键时要使用的上下文。
 *
 * This ensures we see the constant not the reference variable when producing
 * a key.
 *
 * 这可确保我们在生成键时看到常量而不是引用变量。
 *
 */
const KEY_CONTEXT = {};

/**
 * Generally all primitive values are excluded from the `ConstantPool`, but there is an exclusion
 * for strings that reach a certain length threshold. This constant defines the length threshold for
 * strings.
 *
 * 一般来说，所有基元值都会从 `ConstantPool`
 * 中排除，但达到一定长度阈值的字符串会被排除在外。此常量定义了字符串的长度阈值。
 *
 */
const POOL_INCLUSION_LENGTH_THRESHOLD_FOR_STRINGS = 50;

/**
 * A node that is a place-holder that allows the node to be replaced when the actual
 * node is known.
 *
 * 作为占位符的节点，允许在已知实际节点时替换节点。
 *
 * This allows the constant pool to change an expression from a direct reference to
 * a constant to a shared constant. It returns a fix-up node that is later allowed to
 * change the referenced expression.
 *
 * 这允许常量池将表达式从对常量的直接引用更改为共享常量。它返回一个 fix-up
 * 节点，以后可以用该节点更改引用的表达式。
 *
 */
class FixupExpression extends o.Expression {
  private original: o.Expression;

  // TODO(issue/24571): remove '!'.
  shared!: boolean;

  constructor(public resolved: o.Expression) {
    super(resolved.type);
    this.original = resolved;
  }

  override visitExpression(visitor: o.ExpressionVisitor, context: any): any {
    if (context === KEY_CONTEXT) {
      // When producing a key we want to traverse the constant not the
      // variable used to refer to it.
      return this.original.visitExpression(visitor, context);
    } else {
      return this.resolved.visitExpression(visitor, context);
    }
  }

  override isEquivalent(e: o.Expression): boolean {
    return e instanceof FixupExpression && this.resolved.isEquivalent(e.resolved);
  }

  override isConstant() {
    return true;
  }

  fixup(expression: o.Expression) {
    this.resolved = expression;
    this.shared = true;
  }
}

/**
 * A constant pool allows a code emitter to share constant in an output context.
 *
 * 常量池允许代码发射器在输出上下文中共享常量。
 *
 * The constant pool also supports sharing access to ivy definitions references.
 *
 * 常量池还支持共享对 ivy 定义引用的访问。
 *
 */
export class ConstantPool {
  statements: o.Statement[] = [];
  private literals = new Map<string, FixupExpression>();
  private literalFactories = new Map<string, o.Expression>();

  private nextNameIndex = 0;

  constructor(private readonly isClosureCompilerEnabled: boolean = false) {}

  getConstLiteral(literal: o.Expression, forceShared?: boolean): o.Expression {
    if ((literal instanceof o.LiteralExpr && !isLongStringLiteral(literal)) ||
        literal instanceof FixupExpression) {
      // Do no put simple literals into the constant pool or try to produce a constant for a
      // reference to a constant.
      return literal;
    }
    const key = this.keyOf(literal);
    let fixup = this.literals.get(key);
    let newValue = false;
    if (!fixup) {
      fixup = new FixupExpression(literal);
      this.literals.set(key, fixup);
      newValue = true;
    }

    if ((!newValue && !fixup.shared) || (newValue && forceShared)) {
      // Replace the expression with a variable
      const name = this.freshName();
      let definition: o.WriteVarExpr;
      let usage: o.Expression;
      if (this.isClosureCompilerEnabled && isLongStringLiteral(literal)) {
        // For string literals, Closure will **always** inline the string at
        // **all** usages, duplicating it each time. For large strings, this
        // unnecessarily bloats bundle size. To work around this restriction, we
        // wrap the string in a function, and call that function for each usage.
        // This tricks Closure into using inline logic for functions instead of
        // string literals. Function calls are only inlined if the body is small
        // enough to be worth it. By doing this, very large strings will be
        // shared across multiple usages, rather than duplicating the string at
        // each usage site.
        //
        // const myStr = function() { return "very very very long string"; };
        // const usage1 = myStr();
        // const usage2 = myStr();
        definition = o.variable(name).set(new o.FunctionExpr(
            [],  // Params.
            [
              // Statements.
              new o.ReturnStatement(literal),
            ],
            ));
        usage = o.variable(name).callFn([]);
      } else {
        // Just declare and use the variable directly, without a function call
        // indirection. This saves a few bytes and avoids an unnecessary call.
        definition = o.variable(name).set(literal);
        usage = o.variable(name);
      }

      this.statements.push(definition.toDeclStmt(o.INFERRED_TYPE, o.StmtModifier.Final));
      fixup.fixup(usage);
    }

    return fixup;
  }

  getLiteralFactory(literal: o.LiteralArrayExpr|o.LiteralMapExpr):
      {literalFactory: o.Expression, literalFactoryArguments: o.Expression[]} {
    // Create a pure function that builds an array of a mix of constant and variable expressions
    if (literal instanceof o.LiteralArrayExpr) {
      const argumentsForKey = literal.entries.map(e => e.isConstant() ? e : UNKNOWN_VALUE_KEY);
      const key = this.keyOf(o.literalArr(argumentsForKey));
      return this._getLiteralFactory(key, literal.entries, entries => o.literalArr(entries));
    } else {
      const expressionForKey = o.literalMap(
          literal.entries.map(e => ({
                                key: e.key,
                                value: e.value.isConstant() ? e.value : UNKNOWN_VALUE_KEY,
                                quoted: e.quoted
                              })));
      const key = this.keyOf(expressionForKey);
      return this._getLiteralFactory(
          key, literal.entries.map(e => e.value),
          entries => o.literalMap(entries.map((value, index) => ({
                                                key: literal.entries[index].key,
                                                value,
                                                quoted: literal.entries[index].quoted
                                              }))));
    }
  }

  private _getLiteralFactory(
      key: string, values: o.Expression[], resultMap: (parameters: o.Expression[]) => o.Expression):
      {literalFactory: o.Expression, literalFactoryArguments: o.Expression[]} {
    let literalFactory = this.literalFactories.get(key);
    const literalFactoryArguments = values.filter((e => !e.isConstant()));
    if (!literalFactory) {
      const resultExpressions = values.map(
          (e, index) => e.isConstant() ? this.getConstLiteral(e, true) : o.variable(`a${index}`));
      const parameters =
          resultExpressions.filter(isVariable).map(e => new o.FnParam(e.name!, o.DYNAMIC_TYPE));
      const pureFunctionDeclaration =
          o.fn(parameters, [new o.ReturnStatement(resultMap(resultExpressions))], o.INFERRED_TYPE);
      const name = this.freshName();
      this.statements.push(o.variable(name)
                               .set(pureFunctionDeclaration)
                               .toDeclStmt(o.INFERRED_TYPE, o.StmtModifier.Final));
      literalFactory = o.variable(name);
      this.literalFactories.set(key, literalFactory);
    }
    return {literalFactory, literalFactoryArguments};
  }

  /**
   * Produce a unique name.
   *
   * 生成一个唯一的名称。
   *
   * The name might be unique among different prefixes if any of the prefixes end in
   * a digit so the prefix should be a constant string (not based on user input) and
   * must not end in a digit.
   *
   * 如果任何前缀以数字结尾，则该名称在不同的前缀中可能是唯一的，因此前缀应该是一个常量字符串（不基于用户输入），并且不能以数字结尾。
   *
   */
  uniqueName(prefix: string): string {
    return `${prefix}${this.nextNameIndex++}`;
  }

  private freshName(): string {
    return this.uniqueName(CONSTANT_PREFIX);
  }

  private keyOf(expression: o.Expression) {
    return expression.visitExpression(new KeyVisitor(), KEY_CONTEXT);
  }
}

/**
 * Visitor used to determine if 2 expressions are equivalent and can be shared in the
 * `ConstantPool`.
 *
 * 访问器用于确定 2 个表达式是否等价并且可以在 `ConstantPool` 中共享。
 *
 * When the id (string) generated by the visitor is equal, expressions are considered equivalent.
 *
 * 当访问者生成的 id（字符串）相等时，表达式被认为是等价的。
 *
 */
class KeyVisitor implements o.ExpressionVisitor {
  visitLiteralExpr(ast: o.LiteralExpr): string {
    return `${typeof ast.value === 'string' ? '"' + ast.value + '"' : ast.value}`;
  }

  visitLiteralArrayExpr(ast: o.LiteralArrayExpr, context: object): string {
    return `[${ast.entries.map(entry => entry.visitExpression(this, context)).join(',')}]`;
  }

  visitLiteralMapExpr(ast: o.LiteralMapExpr, context: object): string {
    const mapKey = (entry: o.LiteralMapEntry) => {
      const quote = entry.quoted ? '"' : '';
      return `${quote}${entry.key}${quote}`;
    };
    const mapEntry = (entry: o.LiteralMapEntry) =>
        `${mapKey(entry)}:${entry.value.visitExpression(this, context)}`;
    return `{${ast.entries.map(mapEntry).join(',')}`;
  }

  visitExternalExpr(ast: o.ExternalExpr): string {
    return ast.value.moduleName ? `EX:${ast.value.moduleName}:${ast.value.name}` :
                                  `EX:${ast.value.runtime.name}`;
  }

  visitReadVarExpr(node: o.ReadVarExpr) {
    return `VAR:${node.name}`;
  }

  visitTypeofExpr(node: o.TypeofExpr, context: any): string {
    return `TYPEOF:${node.expr.visitExpression(this, context)}`;
  }

  visitWrappedNodeExpr = invalid;
  visitWriteVarExpr = invalid;
  visitWriteKeyExpr = invalid;
  visitWritePropExpr = invalid;
  visitInvokeFunctionExpr = invalid;
  visitTaggedTemplateExpr = invalid;
  visitInstantiateExpr = invalid;
  visitConditionalExpr = invalid;
  visitNotExpr = invalid;
  visitAssertNotNullExpr = invalid;
  visitCastExpr = invalid;
  visitFunctionExpr = invalid;
  visitUnaryOperatorExpr = invalid;
  visitBinaryOperatorExpr = invalid;
  visitReadPropExpr = invalid;
  visitReadKeyExpr = invalid;
  visitCommaExpr = invalid;
  visitLocalizedString = invalid;
}

function invalid<T>(this: o.ExpressionVisitor, arg: o.Expression|o.Statement): never {
  throw new Error(
      `Invalid state: Visitor ${this.constructor.name} doesn't handle ${arg.constructor.name}`);
}

function isVariable(e: o.Expression): e is o.ReadVarExpr {
  return e instanceof o.ReadVarExpr;
}

function isLongStringLiteral(expr: o.Expression): boolean {
  return expr instanceof o.LiteralExpr && typeof expr.value === 'string' &&
      expr.value.length >= POOL_INCLUSION_LENGTH_THRESHOLD_FOR_STRINGS;
}
