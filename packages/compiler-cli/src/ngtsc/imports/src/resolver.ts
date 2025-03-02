/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import ts from 'typescript';

import {absoluteFrom} from '../../file_system';
import {getSourceFileOrNull, resolveModuleName} from '../../util/src/typescript';

/**
 * Used by `RouterEntryPointManager` and `NgModuleRouteAnalyzer` (which is in turn is used by
 * `NgModuleDecoratorHandler`) for resolving the module source-files references in lazy-loaded
 * routes (relative to the source-file containing the `NgModule` that provides the route
 * definitions).
 *
 * 由 `RouterEntryPointManager` 和 `NgModuleRouteAnalyzer`（反过来由 `NgModuleDecoratorHandler`
 * 使用）用于解析惰性加载路由中的模块 source-files 引用（相对于包含提供路由定义的 `NgModule`
 * 的源文件）。
 *
 */
export class ModuleResolver {
  constructor(
      private program: ts.Program, private compilerOptions: ts.CompilerOptions,
      private host: ts.ModuleResolutionHost&Pick<ts.CompilerHost, 'resolveModuleNames'>,
      private moduleResolutionCache: ts.ModuleResolutionCache|null) {}

  resolveModule(moduleName: string, containingFile: string): ts.SourceFile|null {
    const resolved = resolveModuleName(
        moduleName, containingFile, this.compilerOptions, this.host, this.moduleResolutionCache);
    if (resolved === undefined) {
      return null;
    }
    return getSourceFileOrNull(this.program, absoluteFrom(resolved.resolvedFileName));
  }
}
