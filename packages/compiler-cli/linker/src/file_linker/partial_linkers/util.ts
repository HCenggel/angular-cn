/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import {createMayBeForwardRefExpression, ForwardRefHandling, MaybeForwardRefExpression, outputAst as o, R3DeclareDependencyMetadata, R3DependencyMetadata, R3Reference} from '@angular/compiler';

import {AstObject, AstValue} from '../../ast/ast_value';
import {FatalLinkerError} from '../../fatal_linker_error';

export function wrapReference<TExpression>(wrapped: o.WrappedNodeExpr<TExpression>): R3Reference {
  return {value: wrapped, type: wrapped};
}

/**
 * Parses the value of an enum from the AST value's symbol name.
 *
 * 从 AST 值的符号名称解析枚举的值。
 *
 */
export function parseEnum<TExpression, TEnum>(
    value: AstValue<unknown, TExpression>, Enum: TEnum): TEnum[keyof TEnum] {
  const symbolName = value.getSymbolName();
  if (symbolName === null) {
    throw new FatalLinkerError(value.expression, 'Expected value to have a symbol name');
  }
  const enumValue = Enum[symbolName as keyof typeof Enum];
  if (enumValue === undefined) {
    throw new FatalLinkerError(value.expression, `Unsupported enum value for ${Enum}`);
  }
  return enumValue;
}

/**
 * Parse a dependency structure from an AST object.
 *
 * 从 AST 对象解析依赖结构。
 *
 */
export function getDependency<TExpression>(
    depObj: AstObject<R3DeclareDependencyMetadata, TExpression>): R3DependencyMetadata {
  const isAttribute = depObj.has('attribute') && depObj.getBoolean('attribute');
  const token = depObj.getOpaque('token');
  // Normally `attribute` is a string literal and so its `attributeNameType` is the same string
  // literal. If the `attribute` is some other expression, the `attributeNameType` would be the
  // `unknown` type. It is not possible to generate this when linking, since it only deals with JS
  // and not typings. When linking the existence of the `attributeNameType` only acts as a marker to
  // change the injection instruction that is generated, so we just pass the literal string
  // `"unknown"`.
  const attributeNameType = isAttribute ? o.literal('unknown') : null;
  return {
    token,
    attributeNameType,
    host: depObj.has('host') && depObj.getBoolean('host'),
    optional: depObj.has('optional') && depObj.getBoolean('optional'),
    self: depObj.has('self') && depObj.getBoolean('self'),
    skipSelf: depObj.has('skipSelf') && depObj.getBoolean('skipSelf'),
  };
}


/**
 * Return an `R3ProviderExpression` that represents either the extracted type reference expression
 * from a `forwardRef` function call, or the type itself.
 *
 * 返回一个 `R3ProviderExpression` ，它表示从 `forwardRef`
 * 函数调用中提取的类型引用表达式或类型本身。
 *
 * For example, the expression `forwardRef(function() { return FooDir; })` returns `FooDir`. Note
 * that this expression is required to be wrapped in a closure, as otherwise the forward reference
 * would be resolved before initialization.
 *
 * 例如，表达式 `forwardRef(function() { return FooDir; })` 会返回 `FooDir`
 * 。请注意，此表达式需要包装在闭包中，否则前向引用将在初始化之前被解析。
 *
 * If there is no forwardRef call expression then we just return the opaque type.
 *
 * 如果没有 forwardRef 调用表达式，那么我们只返回 opaque 类型。
 *
 */
export function extractForwardRef<TExpression>(expr: AstValue<unknown, TExpression>):
    MaybeForwardRefExpression<o.WrappedNodeExpr<TExpression>> {
  if (!expr.isCallExpression()) {
    return createMayBeForwardRefExpression(expr.getOpaque(), ForwardRefHandling.None);
  }

  const callee = expr.getCallee();
  if (callee.getSymbolName() !== 'forwardRef') {
    throw new FatalLinkerError(
        callee.expression,
        'Unsupported expression, expected a `forwardRef()` call or a type reference');
  }

  const args = expr.getArguments();
  if (args.length !== 1) {
    throw new FatalLinkerError(
        expr, 'Unsupported `forwardRef(fn)` call, expected a single argument');
  }

  const wrapperFn = args[0] as AstValue<Function, TExpression>;
  if (!wrapperFn.isFunction()) {
    throw new FatalLinkerError(
        wrapperFn, 'Unsupported `forwardRef(fn)` call, expected its argument to be a function');
  }

  return createMayBeForwardRefExpression(
      wrapperFn.getFunctionReturnValue().getOpaque(), ForwardRefHandling.Unwrapped);
}
