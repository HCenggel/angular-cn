/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import MagicString from 'magic-string';
import ts from 'typescript';

import {PathManipulation} from '../../../src/ngtsc/file_system';
import {Reexport} from '../../../src/ngtsc/imports';
import {Import, ImportManager} from '../../../src/ngtsc/translator';
import {ExportInfo} from '../analysis/private_declarations_analyzer';
import {isRequireCall} from '../host/commonjs_umd_utils';
import {NgccReflectionHost} from '../host/ngcc_host';

import {Esm5RenderingFormatter} from './esm5_rendering_formatter';
import {stripExtension} from './utils';

/**
 * A RenderingFormatter that works with CommonJS files, instead of `import` and `export` statements
 * the module is an IIFE with a factory function call with dependencies, which are defined in a
 * wrapper function for AMD, CommonJS and global module formats.
 *
 * 使用 CommonJS 文件的 RenderingFormatter ，而不是 `import` 和 `export` 语句，该模块是一个
 * IIFE，带有带有依赖项的工厂函数调用，这些依赖项是在 AMD、CommonJS
 * 和全局模块格式的包装器函数中定义的。
 *
 */
export class CommonJsRenderingFormatter extends Esm5RenderingFormatter {
  constructor(fs: PathManipulation, protected commonJsHost: NgccReflectionHost, isCore: boolean) {
    super(fs, commonJsHost, isCore);
  }

  /**
   * Add the imports below any in situ imports as `require` calls.
   *
   * 在任何原位导入下方添加导入作为 `require` 调用。
   *
   */
  override addImports(output: MagicString, imports: Import[], file: ts.SourceFile): void {
    // Avoid unnecessary work if there are no imports to add.
    if (imports.length === 0) {
      return;
    }

    const insertionPoint = this.findEndOfImports(file);
    const renderedImports =
        imports.map(i => `var ${i.qualifier.text} = require('${i.specifier}');\n`).join('');
    output.appendLeft(insertionPoint, renderedImports);
  }

  /**
   * Add the exports to the bottom of the file.
   *
   * 将导出添加到文件底部。
   *
   */
  override addExports(
      output: MagicString, entryPointBasePath: string, exports: ExportInfo[],
      importManager: ImportManager, file: ts.SourceFile): void {
    exports.forEach(e => {
      const basePath = stripExtension(e.from);
      const relativePath = './' + this.fs.relative(this.fs.dirname(entryPointBasePath), basePath);
      const namedImport = entryPointBasePath !== basePath ?
          importManager.generateNamedImport(relativePath, e.identifier) :
          {symbol: e.identifier, moduleImport: null};
      const importNamespace = namedImport.moduleImport ? `${namedImport.moduleImport.text}.` : '';
      const exportStr = `\nexports.${e.identifier} = ${importNamespace}${namedImport.symbol};`;
      output.append(exportStr);
    });
  }

  override addDirectExports(
      output: MagicString, exports: Reexport[], importManager: ImportManager,
      file: ts.SourceFile): void {
    for (const e of exports) {
      const namedImport = importManager.generateNamedImport(e.fromModule, e.symbolName);
      const importNamespace = namedImport.moduleImport ? `${namedImport.moduleImport.text}.` : '';
      const exportStr = `\nexports.${e.asAlias} = ${importNamespace}${namedImport.symbol};`;
      output.append(exportStr);
    }
  }

  protected override findEndOfImports(sf: ts.SourceFile): number {
    for (const statement of sf.statements) {
      if (ts.isExpressionStatement(statement) && isRequireCall(statement.expression)) {
        continue;
      }
      const declarations = ts.isVariableStatement(statement) ?
          Array.from(statement.declarationList.declarations) :
          [];
      if (declarations.some(d => !d.initializer || !isRequireCall(d.initializer))) {
        return statement.getStart();
      }
    }
    return 0;
  }
}
