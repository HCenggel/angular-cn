/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import ts from 'typescript';

import {absoluteFrom, absoluteFromSourceFile, AbsoluteFsPath} from '../../file_system';
import {isDtsPath} from '../../util/src/typescript';
import {PerFileShimGenerator, TopLevelShimGenerator} from '../api';

import {isFileShimSourceFile, isShim, sfExtensionData} from './expando';
import {makeShimFileName} from './util';

interface ShimGeneratorData {
  generator: PerFileShimGenerator;
  test: RegExp;
  suffix: string;
}

/**
 * Generates and tracks shim files for each original `ts.SourceFile`.
 *
 * 为每个原始 `ts.SourceFile` 生成并跟踪 shim 文件。
 *
 * The `ShimAdapter` provides an API that's designed to be used by a `ts.CompilerHost`
 * implementation and allows it to include synthetic "shim" files in the program that's being
 * created. It works for both freshly created programs as well as with reuse of an older program
 * (which already may contain shim files and thus have a different creation flow).
 *
 * `ShimAdapter` 提供了一个旨在供 `ts.CompilerHost` 实现使用的
 * API，并允许它在正在创建的程序中包含合成的“shim”文件。它适用于新创建的程序以及重用旧程序（可能已经包含
 * shim 文件，因此具有不同的创建流程）。
 *
 */
export class ShimAdapter {
  /**
   * A map of shim file names to the `ts.SourceFile` generated for those shims.
   *
   * shim 文件名到为这些 shim 生成的 `ts.SourceFile` 的映射。
   *
   */
  private shims = new Map<AbsoluteFsPath, ts.SourceFile>();

  /**
   * A map of shim file names to existing shims which were part of a previous iteration of this
   * program.
   *
   * shim 文件名到作为此程序上一次迭代的一部分的现有 shim 的映射。
   *
   * Not all of these shims will be inherited into this program.
   *
   * 并非所有这些 shims 都会被继承到此程序中。
   *
   */
  private priorShims = new Map<AbsoluteFsPath, ts.SourceFile>();

  /**
   * File names which are already known to not be shims.
   *
   * 已知不是 shims 的文件名。
   *
   * This allows for short-circuit returns without the expense of running regular expressions
   * against the filename repeatedly.
   *
   * 这允许短路返回，而无需针对文件名重复运行正则表达式。
   *
   */
  private notShims = new Set<AbsoluteFsPath>();

  /**
   * The shim generators supported by this adapter as well as extra precalculated data facilitating
   * their use.
   *
   * 此适配器支持的垫片生成器以及便利它们的使用的额外的预先计算的数据。
   *
   */
  private generators: ShimGeneratorData[] = [];

  /**
   * A `Set` of shim `ts.SourceFile`s which should not be emitted.
   *
   * 不应该发出的一 `Set` shim `ts.SourceFile` 。
   *
   */
  readonly ignoreForEmit = new Set<ts.SourceFile>();

  /**
   * A list of extra filenames which should be considered inputs to program creation.
   *
   * 应被视为程序创建的输入的额外文件名列表。
   *
   * This includes any top-level shims generated for the program, as well as per-file shim names for
   * those files which are included in the root files of the program.
   *
   * 这包括为程序生成的任何顶级 shim，以及程序根文件中包含的这些文件的每个文件 shim 名称。
   *
   */
  readonly extraInputFiles: ReadonlyArray<AbsoluteFsPath>;

  /**
   * Extension prefixes of all installed per-file shims.
   *
   * 所有已安装的每文件 shim 的扩展前缀。
   *
   */
  readonly extensionPrefixes: string[] = [];

  constructor(
      private delegate: Pick<ts.CompilerHost, 'getSourceFile'|'fileExists'>,
      tsRootFiles: AbsoluteFsPath[], topLevelGenerators: TopLevelShimGenerator[],
      perFileGenerators: PerFileShimGenerator[], oldProgram: ts.Program|null) {
    // Initialize `this.generators` with a regex that matches each generator's paths.
    for (const gen of perFileGenerators) {
      // This regex matches paths for shims from this generator. The first (and only) capture group
      // extracts the filename prefix, which can be used to find the original file that was used to
      // generate this shim.
      const pattern = `^(.*)\\.${gen.extensionPrefix}\\.ts$`;
      const regexp = new RegExp(pattern, 'i');
      this.generators.push({
        generator: gen,
        test: regexp,
        suffix: `.${gen.extensionPrefix}.ts`,
      });
      this.extensionPrefixes.push(gen.extensionPrefix);
    }
    // Process top-level generators and pre-generate their shims. Accumulate the list of filenames
    // as extra input files.
    const extraInputFiles: AbsoluteFsPath[] = [];

    for (const gen of topLevelGenerators) {
      const sf = gen.makeTopLevelShim();
      sfExtensionData(sf).isTopLevelShim = true;

      if (!gen.shouldEmit) {
        this.ignoreForEmit.add(sf);
      }

      const fileName = absoluteFromSourceFile(sf);
      this.shims.set(fileName, sf);
      extraInputFiles.push(fileName);
    }

    // Add to that list the per-file shims associated with each root file. This is needed because
    // reference tagging alone may not work in TS compilations that have `noResolve` set. Such
    // compilations rely on the list of input files completely describing the program.
    for (const rootFile of tsRootFiles) {
      for (const gen of this.generators) {
        extraInputFiles.push(makeShimFileName(rootFile, gen.suffix));
      }
    }

    this.extraInputFiles = extraInputFiles;

    // If an old program is present, extract all per-file shims into a map, which will be used to
    // generate new versions of those shims.
    if (oldProgram !== null) {
      for (const oldSf of oldProgram.getSourceFiles()) {
        if (oldSf.isDeclarationFile || !isFileShimSourceFile(oldSf)) {
          continue;
        }

        this.priorShims.set(absoluteFromSourceFile(oldSf), oldSf);
      }
    }
  }

  /**
   * Produce a shim `ts.SourceFile` if `fileName` refers to a shim file which should exist in the
   * program.
   *
   * 如果 `fileName` 引用程序中应该存在的 shim 文件，则生成一个 shim `ts.SourceFile` 。
   *
   * If `fileName` does not refer to a potential shim file, `null` is returned. If a corresponding
   * base file could not be determined, `undefined` is returned instead.
   *
   * 如果 `fileName` 不引用潜在的 shim 文件，则返回 `null` 。如果无法确定对应的基础文件，则会返回
   * `undefined` 。
   *
   */
  maybeGenerate(fileName: AbsoluteFsPath): ts.SourceFile|null|undefined {
    // Fast path: either this filename has been proven not to be a shim before, or it is a known
    // shim and no generation is required.
    if (this.notShims.has(fileName)) {
      return null;
    } else if (this.shims.has(fileName)) {
      return this.shims.get(fileName)!;
    }

    // .d.ts files can't be shims.
    if (isDtsPath(fileName)) {
      this.notShims.add(fileName);
      return null;
    }

    // This is the first time seeing this path. Try to match it against a shim generator.
    for (const record of this.generators) {
      const match = record.test.exec(fileName);
      if (match === null) {
        continue;
      }

      // The path matched. Extract the filename prefix without the extension.
      const prefix = match[1];
      // This _might_ be a shim, if an underlying base file exists. The base file might be .ts or
      // .tsx.
      let baseFileName = absoluteFrom(prefix + '.ts');
      // Retrieve the original file for which the shim will be generated.
      let inputFile = this.delegate.getSourceFile(baseFileName, ts.ScriptTarget.Latest);
      if (inputFile === undefined) {
        // No .ts file by that name - try .tsx.
        baseFileName = absoluteFrom(prefix + '.tsx');
        inputFile = this.delegate.getSourceFile(baseFileName, ts.ScriptTarget.Latest);
      }
      if (inputFile === undefined || isShim(inputFile)) {
        // This isn't a shim after all since there is no original file which would have triggered
        // its generation, even though the path is right. There are a few reasons why this could
        // occur:
        //
        // * when resolving an import to an .ngfactory.d.ts file, the module resolution algorithm
        //   will first look for an .ngfactory.ts file in its place, which will be requested here.
        // * when the user writes a bad import.
        // * when a file is present in one compilation and removed in the next incremental step.
        //
        // Note that this does not add the filename to `notShims`, so this path is not cached.
        // That's okay as these cases above are edge cases and do not occur regularly in normal
        // operations.
        return undefined;
      }

      // Actually generate and cache the shim.
      return this.generateSpecific(fileName, record.generator, inputFile);
    }

    // No generator matched.
    this.notShims.add(fileName);
    return null;
  }

  private generateSpecific(
      fileName: AbsoluteFsPath, generator: PerFileShimGenerator,
      inputFile: ts.SourceFile): ts.SourceFile {
    let priorShimSf: ts.SourceFile|null = null;
    if (this.priorShims.has(fileName)) {
      // In the previous program a shim with this name already existed. It's passed to the shim
      // generator which may reuse it instead of generating a fresh shim.

      priorShimSf = this.priorShims.get(fileName)!;
      this.priorShims.delete(fileName);
    }

    const shimSf = generator.generateShimForFile(inputFile, fileName, priorShimSf);

    // Mark the new generated source file as a shim that originated from this generator.
    sfExtensionData(shimSf).fileShim = {
      extension: generator.extensionPrefix,
      generatedFrom: absoluteFromSourceFile(inputFile),
    };

    if (!generator.shouldEmit) {
      this.ignoreForEmit.add(shimSf);
    }

    this.shims.set(fileName, shimSf);
    return shimSf;
  }
}
