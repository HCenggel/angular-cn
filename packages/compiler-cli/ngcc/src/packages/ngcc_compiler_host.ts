/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import ts from 'typescript';

import {AbsoluteFsPath, FileSystem, NgtscCompilerHost} from '../../../src/ngtsc/file_system';
import {isWithinPackage} from '../analysis/util';
import {isRelativePath} from '../utils';

import {EntryPointFileCache} from './source_file_cache';

/**
 * Represents a compiler host that resolves a module import as a JavaScript source file if
 * available, instead of the .d.ts typings file that would have been resolved by TypeScript. This
 * is necessary for packages that have their typings in the same directory as the sources, which
 * would otherwise let TypeScript prefer the .d.ts file instead of the JavaScript source file.
 *
 * 表示一个编译器宿主，它将模块导入解析为 JavaScript 源文件（如果可用），而不是本来可以由 TypeScript
 * 解析的 .d.ts 类型文件。这对于类型与源代码在同一个目录中的包是必要的，否则，TypeScript 会更喜欢
 * .d.ts 文件而不是 JavaScript 源文件。
 *
 */
export class NgccSourcesCompilerHost extends NgtscCompilerHost {
  constructor(
      fs: FileSystem, options: ts.CompilerOptions, private cache: EntryPointFileCache,
      private moduleResolutionCache: ts.ModuleResolutionCache,
      protected packagePath: AbsoluteFsPath) {
    super(fs, options);
  }

  override getSourceFile(fileName: string, languageVersion: ts.ScriptTarget): ts.SourceFile
      |undefined {
    return this.cache.getCachedSourceFile(fileName, languageVersion);
  }

  resolveModuleNames(
      moduleNames: string[], containingFile: string, reusedNames?: string[],
      redirectedReference?: ts.ResolvedProjectReference): Array<ts.ResolvedModule|undefined> {
    return moduleNames.map(moduleName => {
      const {resolvedModule} = ts.resolveModuleName(
          moduleName, containingFile, this.options, this, this.moduleResolutionCache,
          redirectedReference);

      // If the module request originated from a relative import in a JavaScript source file,
      // TypeScript may have resolved the module to its .d.ts declaration file if the .js source
      // file was in the same directory. This is undesirable, as we need to have the actual
      // JavaScript being present in the program. This logic recognizes this scenario and rewrites
      // the resolved .d.ts declaration file to its .js counterpart, if it exists.
      if (resolvedModule?.extension === ts.Extension.Dts && containingFile.endsWith('.js') &&
          isRelativePath(moduleName)) {
        const jsFile = resolvedModule.resolvedFileName.replace(/\.d\.ts$/, '.js');
        if (this.fileExists(jsFile)) {
          return {...resolvedModule, resolvedFileName: jsFile, extension: ts.Extension.Js};
        }
      }

      // Prevent loading JavaScript source files outside of the package root, which would happen for
      // packages that don't have .d.ts files. As ngcc should only operate on the .js files
      // contained within the package, any files outside the package are simply discarded. This does
      // result in a partial program with error diagnostics, however ngcc won't gather diagnostics
      // for the program it creates so these diagnostics won't be reported.
      if (resolvedModule?.extension === ts.Extension.Js &&
          !isWithinPackage(this.packagePath, this.fs.resolve(resolvedModule.resolvedFileName))) {
        return undefined;
      }

      return resolvedModule;
    });
  }
}

/**
 * A compiler host implementation that is used for the typings program. It leverages the entry-point
 * cache for source files and module resolution, as these results can be reused across the sources
 * program.
 *
 * 用于 typings 程序的编译器宿主实现。它利用入口点缓存来进行源文件和模块解析，因为这些结果可以在各个
 * sources 程序中重用。
 *
 */
export class NgccDtsCompilerHost extends NgtscCompilerHost {
  constructor(
      fs: FileSystem, options: ts.CompilerOptions, private cache: EntryPointFileCache,
      private moduleResolutionCache: ts.ModuleResolutionCache) {
    super(fs, options);
  }

  override getSourceFile(fileName: string, languageVersion: ts.ScriptTarget): ts.SourceFile
      |undefined {
    return this.cache.getCachedSourceFile(fileName, languageVersion);
  }

  resolveModuleNames(
      moduleNames: string[], containingFile: string, reusedNames?: string[],
      redirectedReference?: ts.ResolvedProjectReference): Array<ts.ResolvedModule|undefined> {
    return moduleNames.map(moduleName => {
      const {resolvedModule} = ts.resolveModuleName(
          moduleName, containingFile, this.options, this, this.moduleResolutionCache,
          redirectedReference);
      return resolvedModule;
    });
  }
}
