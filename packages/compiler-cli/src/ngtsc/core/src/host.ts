/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import ts from 'typescript';

import {ErrorCode, ngErrorCode} from '../../diagnostics';
import {findFlatIndexEntryPoint, FlatIndexGenerator} from '../../entry_point';
import {AbsoluteFsPath, resolve} from '../../file_system';
import {FactoryGenerator, isShim, ShimAdapter, ShimReferenceTagger, SummaryGenerator} from '../../shims';
import {FactoryTracker, PerFileShimGenerator, TopLevelShimGenerator} from '../../shims/api';
import {TypeCheckShimGenerator} from '../../typecheck';
import {normalizeSeparators} from '../../util/src/path';
import {getRootDirs, isNonDeclarationTsPath, RequiredDelegations} from '../../util/src/typescript';
import {ExtendedTsCompilerHost, NgCompilerAdapter, NgCompilerOptions, UnifiedModulesHost} from '../api';

// A persistent source of bugs in CompilerHost delegation has been the addition by TS of new,
// optional methods on ts.CompilerHost. Since these methods are optional, it's not a type error that
// the delegating host doesn't implement or delegate them. This causes subtle runtime failures. No
// more. This infrastructure ensures that failing to delegate a method is a compile-time error.

/**
 * Delegates all methods of `ExtendedTsCompilerHost` to a delegate, with the exception of
 * `getSourceFile` and `fileExists` which are implemented in `NgCompilerHost`.
 *
 * 将 `ExtendedTsCompilerHost` 的所有方法委托给委托，但在 NgCompilerHost 中实现的 `getSourceFile` 和
 * `fileExists` `NgCompilerHost` 。
 *
 * If a new method is added to `ts.CompilerHost` which is not delegated, a type error will be
 * generated for this class.
 *
 * 如果将新方法添加到未委托的 `ts.CompilerHost` ，则会为此类生成类型错误。
 *
 */
export class DelegatingCompilerHost implements
    Omit<RequiredDelegations<ExtendedTsCompilerHost>, 'getSourceFile'|'fileExists'> {
  constructor(protected delegate: ExtendedTsCompilerHost) {}

  private delegateMethod<M extends keyof ExtendedTsCompilerHost>(name: M):
      ExtendedTsCompilerHost[M] {
    return this.delegate[name] !== undefined ? (this.delegate[name] as any).bind(this.delegate) :
                                               undefined;
  }

  // Excluded are 'getSourceFile' and 'fileExists', which are actually implemented by NgCompilerHost
  // below.
  createHash = this.delegateMethod('createHash');
  directoryExists = this.delegateMethod('directoryExists');
  fileNameToModuleName = this.delegateMethod('fileNameToModuleName');
  getCancellationToken = this.delegateMethod('getCancellationToken');
  getCanonicalFileName = this.delegateMethod('getCanonicalFileName');
  getCurrentDirectory = this.delegateMethod('getCurrentDirectory');
  getDefaultLibFileName = this.delegateMethod('getDefaultLibFileName');
  getDefaultLibLocation = this.delegateMethod('getDefaultLibLocation');
  getDirectories = this.delegateMethod('getDirectories');
  getEnvironmentVariable = this.delegateMethod('getEnvironmentVariable');
  getModifiedResourceFiles = this.delegateMethod('getModifiedResourceFiles');
  getNewLine = this.delegateMethod('getNewLine');
  getParsedCommandLine = this.delegateMethod('getParsedCommandLine');
  getSourceFileByPath = this.delegateMethod('getSourceFileByPath');
  readDirectory = this.delegateMethod('readDirectory');
  readFile = this.delegateMethod('readFile');
  readResource = this.delegateMethod('readResource');
  transformResource = this.delegateMethod('transformResource');
  realpath = this.delegateMethod('realpath');
  resolveModuleNames = this.delegateMethod('resolveModuleNames');
  resolveTypeReferenceDirectives = this.delegateMethod('resolveTypeReferenceDirectives');
  resourceNameToFileName = this.delegateMethod('resourceNameToFileName');
  trace = this.delegateMethod('trace');
  useCaseSensitiveFileNames = this.delegateMethod('useCaseSensitiveFileNames');
  writeFile = this.delegateMethod('writeFile');
  getModuleResolutionCache = this.delegateMethod('getModuleResolutionCache');
  // @ts-ignore 'hasInvalidatedResolutions' is visible (and thus required here) in latest TSC
  // main. It's already present, so the code works at runtime.
  // TODO: remove this comment including the suppression once Angular uses a TSC version that
  // includes this change (github.com/microsoft/TypeScript@a455955).
  hasInvalidatedResolutions = this.delegateMethod('hasInvalidatedResolutions');
}

/**
 * A wrapper around `ts.CompilerHost` (plus any extension methods from `ExtendedTsCompilerHost`).
 *
 * `ts.CompilerHost` 的包装器（加上 `ExtendedTsCompilerHost` 的任何扩展方法）。
 *
 * In order for a consumer to include Angular compilation in their TypeScript compiler, the
 * `ts.Program` must be created with a host that adds Angular-specific files (e.g. factories,
 * summaries, the template type-checking file, etc) to the compilation. `NgCompilerHost` is the
 * host implementation which supports this.
 *
 * 为了让消费者在他们的 TypeScript 编译器中包含 Angular 编译，必须使用将 Angular
 * 特定文件（例如工厂、摘要、模板类型检查文件等）添加到编译中的宿主来创建 `ts.Program` 。
 * `NgCompilerHost` 是支持此操作的宿主实现。
 *
 * The interface implementations here ensure that `NgCompilerHost` fully delegates to
 * `ExtendedTsCompilerHost` methods whenever present.
 *
 * 此处的接口实现可确保 `NgCompilerHost` 完全委托给 `ExtendedTsCompilerHost` 方法（只要存在）。
 *
 */
export class NgCompilerHost extends DelegatingCompilerHost implements
    RequiredDelegations<ExtendedTsCompilerHost>, ExtendedTsCompilerHost, NgCompilerAdapter {
  readonly factoryTracker: FactoryTracker|null = null;
  readonly entryPoint: AbsoluteFsPath|null = null;
  readonly constructionDiagnostics: ts.Diagnostic[];

  readonly inputFiles: ReadonlyArray<string>;
  readonly rootDirs: ReadonlyArray<AbsoluteFsPath>;


  constructor(
      delegate: ExtendedTsCompilerHost, inputFiles: ReadonlyArray<string>,
      rootDirs: ReadonlyArray<AbsoluteFsPath>, private shimAdapter: ShimAdapter,
      private shimTagger: ShimReferenceTagger, entryPoint: AbsoluteFsPath|null,
      factoryTracker: FactoryTracker|null, diagnostics: ts.Diagnostic[]) {
    super(delegate);

    this.factoryTracker = factoryTracker;
    this.entryPoint = entryPoint;
    this.constructionDiagnostics = diagnostics;
    this.inputFiles = [...inputFiles, ...shimAdapter.extraInputFiles];
    this.rootDirs = rootDirs;

    if (this.resolveModuleNames === undefined) {
      // In order to reuse the module resolution cache during the creation of the type-check
      // program, we'll need to provide `resolveModuleNames` if the delegate did not provide one.
      this.resolveModuleNames = this.createCachedResolveModuleNamesFunction();
    }
  }

  /**
   * Retrieves a set of `ts.SourceFile`s which should not be emitted as JS files.
   *
   * 检索一组不应该作为 JS 文件发出的 `ts.SourceFile` 。
   *
   * Available after this host is used to create a `ts.Program` (which causes all the files in the
   * program to be enumerated).
   *
   * 在此宿主用于创建 `ts.Program`（这会导致程序中的所有文件被枚举）之后可用。
   *
   */
  get ignoreForEmit(): Set<ts.SourceFile> {
    return this.shimAdapter.ignoreForEmit;
  }

  /**
   * Retrieve the array of shim extension prefixes for which shims were created for each original
   * file.
   *
   * 检索为每个原始文件创建 shim 的 shim 扩展前缀数组。
   *
   */
  get shimExtensionPrefixes(): string[] {
    return this.shimAdapter.extensionPrefixes;
  }

  /**
   * Performs cleanup that needs to happen after a `ts.Program` has been created using this host.
   *
   * 执行使用此宿主创建 `ts.Program` 之后需要发生的清理。
   *
   */
  postProgramCreationCleanup(): void {
    this.shimTagger.finalize();
  }

  /**
   * Create an `NgCompilerHost` from a delegate host, an array of input filenames, and the full set
   * of TypeScript and Angular compiler options.
   *
   * 从委托宿主、输入文件名数组以及完整的 TypeScript 和 Angular 编译器选项集创建一个
   * `NgCompilerHost` 。
   *
   */
  static wrap(
      delegate: ts.CompilerHost, inputFiles: ReadonlyArray<string>, options: NgCompilerOptions,
      oldProgram: ts.Program|null): NgCompilerHost {
    // TODO(alxhub): remove the fallback to allowEmptyCodegenFiles after verifying that the rest of
    // our build tooling is no longer relying on it.
    const allowEmptyCodegenFiles = options.allowEmptyCodegenFiles || false;
    const shouldGenerateFactoryShims = options.generateNgFactoryShims !== undefined ?
        options.generateNgFactoryShims :
        allowEmptyCodegenFiles;

    const shouldGenerateSummaryShims = options.generateNgSummaryShims !== undefined ?
        options.generateNgSummaryShims :
        allowEmptyCodegenFiles;


    const topLevelShimGenerators: TopLevelShimGenerator[] = [];
    const perFileShimGenerators: PerFileShimGenerator[] = [];

    if (shouldGenerateSummaryShims) {
      // Summary generation.
      perFileShimGenerators.push(new SummaryGenerator());
    }

    let factoryTracker: FactoryTracker|null = null;
    if (shouldGenerateFactoryShims) {
      const factoryGenerator = new FactoryGenerator();
      perFileShimGenerators.push(factoryGenerator);

      factoryTracker = factoryGenerator;
    }

    const rootDirs = getRootDirs(delegate, options as ts.CompilerOptions);

    perFileShimGenerators.push(new TypeCheckShimGenerator());

    let diagnostics: ts.Diagnostic[] = [];

    const normalizedTsInputFiles: AbsoluteFsPath[] = [];
    for (const inputFile of inputFiles) {
      if (!isNonDeclarationTsPath(inputFile)) {
        continue;
      }
      normalizedTsInputFiles.push(resolve(inputFile));
    }

    let entryPoint: AbsoluteFsPath|null = null;
    if (options.flatModuleOutFile != null && options.flatModuleOutFile !== '') {
      entryPoint = findFlatIndexEntryPoint(normalizedTsInputFiles);
      if (entryPoint === null) {
        // This error message talks specifically about having a single .ts file in "files". However
        // the actual logic is a bit more permissive. If a single file exists, that will be taken,
        // otherwise the highest level (shortest path) "index.ts" file will be used as the flat
        // module entry point instead. If neither of these conditions apply, the error below is
        // given.
        //
        // The user is not informed about the "index.ts" option as this behavior is deprecated -
        // an explicit entrypoint should always be specified.
        diagnostics.push({
          category: ts.DiagnosticCategory.Error,
          code: ngErrorCode(ErrorCode.CONFIG_FLAT_MODULE_NO_INDEX),
          file: undefined,
          start: undefined,
          length: undefined,
          messageText:
              'Angular compiler option "flatModuleOutFile" requires one and only one .ts file in the "files" field.',
        });
      } else {
        const flatModuleId = options.flatModuleId || null;
        const flatModuleOutFile = normalizeSeparators(options.flatModuleOutFile);
        const flatIndexGenerator =
            new FlatIndexGenerator(entryPoint, flatModuleOutFile, flatModuleId);
        topLevelShimGenerators.push(flatIndexGenerator);
      }
    }

    const shimAdapter = new ShimAdapter(
        delegate, normalizedTsInputFiles, topLevelShimGenerators, perFileShimGenerators,
        oldProgram);
    const shimTagger =
        new ShimReferenceTagger(perFileShimGenerators.map(gen => gen.extensionPrefix));
    return new NgCompilerHost(
        delegate, inputFiles, rootDirs, shimAdapter, shimTagger, entryPoint, factoryTracker,
        diagnostics);
  }

  /**
   * Check whether the given `ts.SourceFile` is a shim file.
   *
   * 检查给定的 `ts.SourceFile` 是否是 shim 文件。
   *
   * If this returns false, the file is user-provided.
   *
   * 如果返回 false ，则文件是用户提供的。
   *
   */
  isShim(sf: ts.SourceFile): boolean {
    return isShim(sf);
  }

  /**
   * Check whether the given `ts.SourceFile` is a resource file.
   *
   * 检查给定的 `ts.SourceFile` 是否是资源文件。
   *
   * This simply returns `false` for the compiler-cli since resource files are not added as root
   * files to the project.
   *
   * 这只是为 compiler-cli 返回 `false` ，因为资源文件不会作为根文件添加到项目中。
   *
   */
  isResource(sf: ts.SourceFile): boolean {
    return false;
  }

  getSourceFile(
      fileName: string, languageVersion: ts.ScriptTarget,
      onError?: ((message: string) => void)|undefined,
      shouldCreateNewSourceFile?: boolean|undefined): ts.SourceFile|undefined {
    // Is this a previously known shim?
    const shimSf = this.shimAdapter.maybeGenerate(resolve(fileName));
    if (shimSf !== null) {
      // Yes, so return it.
      return shimSf;
    }

    // No, so it's a file which might need shims (or a file which doesn't exist).
    const sf =
        this.delegate.getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
    if (sf === undefined) {
      return undefined;
    }

    this.shimTagger.tag(sf);
    return sf;
  }

  fileExists(fileName: string): boolean {
    // Consider the file as existing whenever
    //  1) it really does exist in the delegate host, or
    //  2) at least one of the shim generators recognizes it
    // Note that we can pass the file name as branded absolute fs path because TypeScript
    // internally only passes POSIX-like paths.
    //
    // Also note that the `maybeGenerate` check below checks for both `null` and `undefined`.
    return this.delegate.fileExists(fileName) ||
        this.shimAdapter.maybeGenerate(resolve(fileName)) != null;
  }

  get unifiedModulesHost(): UnifiedModulesHost|null {
    return this.fileNameToModuleName !== undefined ? this as UnifiedModulesHost : null;
  }

  private createCachedResolveModuleNamesFunction(): ts.CompilerHost['resolveModuleNames'] {
    const moduleResolutionCache = ts.createModuleResolutionCache(
        this.getCurrentDirectory(), this.getCanonicalFileName.bind(this));

    return (moduleNames, containingFile, reusedNames, redirectedReference, options) => {
      return moduleNames.map(moduleName => {
        const module = ts.resolveModuleName(
            moduleName, containingFile, options, this, moduleResolutionCache, redirectedReference);
        return module.resolvedModule;
      });
    };
  }
}
