/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import {NodePath, PluginObj, types as t} from '../../babel_core';
import {isLocalize, TranslatePluginOptions} from '../../source_file_utils';

/**
 * This Babel plugin will replace the following code forms with a string literal containing the
 * given `locale`.
 *
 * 这个 Babel 插件将使用包含给定 `locale` 的字符串文字替换以下代码形式。
 *
 * * `$localize.locale`                                            -> `"locale"`
 *
 * * `typeof $localize !== "undefined" && $localize.locale`        -> `"locale"`
 *
 * * `xxx && typeof $localize !== "undefined" && $localize.locale` -> `"xxx && locale"`
 *
 * * `$localize.locale || default`                                 -> `"locale" || default`
 *
 * @param locale The name of the locale to inline into the code.
 *
 * 要内联到代码中的区域设置名称。
 *
 * @param options Additional options including the name of the `$localize` function.
 *
 * 其他选项，包括 `$localize` 函数的名称。
 *
 * @publicApi used by CLI
 */
export function makeLocalePlugin(
    locale: string, {localizeName = '$localize'}: TranslatePluginOptions = {}): PluginObj {
  return {
    visitor: {
      MemberExpression(expression: NodePath<t.MemberExpression>) {
        const obj = expression.get('object');
        if (!isLocalize(obj, localizeName)) {
          return;
        }
        const property = expression.get('property') as NodePath;
        if (!property.isIdentifier({name: 'locale'})) {
          return;
        }
        if (expression.parentPath.isAssignmentExpression() &&
            expression.parentPath.get('left') === expression) {
          return;
        }
        // Check for the `$localize.locale` being guarded by a check on the existence of
        // `$localize`.
        const parent = expression.parentPath;
        if (parent.isLogicalExpression({operator: '&&'}) && parent.get('right') === expression) {
          const left = parent.get('left');
          if (isLocalizeGuard(left, localizeName)) {
            // Replace `typeof $localize !== "undefined" && $localize.locale` with
            // `$localize.locale`
            parent.replaceWith(expression);
          } else if (
              left.isLogicalExpression({operator: '&&'}) &&
              isLocalizeGuard(left.get('right'), localizeName)) {
            // The `$localize` is part of a preceding logical AND.
            // Replace XXX && typeof $localize !== "undefined" && $localize.locale` with `XXX &&
            // $localize.locale`
            left.replaceWith(left.get('left'));
          }
        }
        // Replace the `$localize.locale` with the string literal
        expression.replaceWith(t.stringLiteral(locale));
      }
    }
  };
}

/**
 * Returns true if the expression one of:
 *
 * 如果表达式是以下之一，则返回 true：
 *
 * * `typeof $localize !== "undefined"`
 *
 * * `"undefined" !== typeof $localize`
 *
 * * `typeof $localize != "undefined"`
 *
 * * `"undefined" != typeof $localize`
 *
 * @param expression the expression to check
 *
 * 要检查的表达式
 *
 * @param localizeName the name of the `$localize` symbol
 *
 * `$localize` 符号的名称
 *
 */
function isLocalizeGuard(expression: NodePath, localizeName: string): boolean {
  if (!expression.isBinaryExpression() ||
      !(expression.node.operator === '!==' || expression.node.operator === '!=')) {
    return false;
  }
  const left = expression.get('left');
  const right = expression.get('right');

  return (left.isUnaryExpression({operator: 'typeof'}) &&
          isLocalize(left.get('argument'), localizeName) &&
          right.isStringLiteral({value: 'undefined'})) ||
      (right.isUnaryExpression({operator: 'typeof'}) &&
       isLocalize(right.get('argument'), localizeName) &&
       left.isStringLiteral({value: 'undefined'}));
}
