/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {AbsoluteFsPath, dirname, FileSystem} from '../../../src/ngtsc/file_system';
import {JsonObject, JsonValue} from '../utils';


export type PackageJsonChange = [string[], JsonValue, PackageJsonPropertyPositioning];
export type PackageJsonPropertyPositioning = 'unimportant'|'alphabetic'|{before: string};
export type WritePackageJsonChangesFn =
    (changes: PackageJsonChange[], packageJsonPath: AbsoluteFsPath, parsedJson?: JsonObject) =>
        void;

/**
 * A utility object that can be used to safely update values in a `package.json` file.
 *
 * 一个实用程序对象，可用于安全更新 `package.json` 文件中的值。
 *
 * Example usage:
 *
 * 示例用法：
 *
 * ```ts
 * const updatePackageJson = packageJsonUpdater
 *     .createUpdate()
 *     .addChange(['name'], 'package-foo')
 *     .addChange(['scripts', 'foo'], 'echo FOOOO...', 'unimportant')
 *     .addChange(['dependencies', 'baz'], '1.0.0', 'alphabetic')
 *     .addChange(['dependencies', 'bar'], '2.0.0', {before: 'baz'})
 *     .writeChanges('/foo/package.json');
 *     // or
 *     // .writeChanges('/foo/package.json', inMemoryParsedJson);
 * ```
 *
 */
export interface PackageJsonUpdater {
  /**
   * Create a `PackageJsonUpdate` object, which provides a fluent API for batching updates to a
   * `package.json` file. (Batching the updates is useful, because it avoids unnecessary I/O
   * operations.)
   *
   * 创建一个 `PackageJsonUpdate` 对象，它提供了流式 API 来批处理对 `package.json` 文件的更新。
   *（批处理更新很有用，因为它避免了不必要的 I/O 操作。）
   *
   */
  createUpdate(): PackageJsonUpdate;

  /**
   * Write a set of changes to the specified `package.json` file (and optionally a pre-existing,
   * in-memory representation of it).
   *
   * 将一组更改写入指定的 `package.json` 文件（以及它的预先存在的内存中表示）。
   *
   * @param changes The set of changes to apply.
   *
   * 要应用的更改集。
   *
   * @param packageJsonPath The path to the `package.json` file that needs to be updated.
   *
   * 需要更新的 `package.json` 文件的路径。
   *
   * @param parsedJson A pre-existing, in-memory representation of the `package.json` file that
   *                   needs to be updated as well.
   *
   * `package.json` 文件的预先存在的内存中表示，也需要更新。
   *
   */
  writeChanges(
      changes: PackageJsonChange[], packageJsonPath: AbsoluteFsPath, parsedJson?: JsonObject): void;
}

/**
 * A utility class providing a fluent API for recording multiple changes to a `package.json` file
 * (and optionally its in-memory parsed representation).
 *
 * 一个提供流式 API 的工具类，用于记录对 `package.json` 文件（以及可选的内存中解析表示）的多次更改。
 *
 * NOTE: This class should generally not be instantiated directly; instances are implicitly created
 *       via `PackageJsonUpdater#createUpdate()`.
 *
 * 注意：此类通常不应该直接实例化；实例是通过 `PackageJsonUpdater#createUpdate()` 隐式创建的。
 *
 */
export class PackageJsonUpdate {
  private changes: PackageJsonChange[] = [];
  private applied = false;

  constructor(private writeChangesImpl: WritePackageJsonChangesFn) {}

  /**
   * Record a change to a `package.json` property.
   *
   * 记录对 `package.json` 属性的更改。
   *
   * If the ancestor objects do not yet exist in the `package.json` file, they will be created. The
   * positioning of the property can also be specified. (If the property already exists, it will be
   * moved accordingly.)
   *
   * 如果 `package.json` 文件中尚不存在祖先对象，则将创建它们。也可以指定属性的位置。
   *（如果该属性已经存在，它将相应地移动。）
   *
   * NOTE: Property positioning is only guaranteed to be respected in the serialized `package.json`
   *       file. Positioning will not be taken into account when updating in-memory representations.
   *
   * 注意：仅保证在序列化的 `package.json` 文件中遵守属性定位。更新内存中表示时，不会考虑定位。
   *
   * NOTE 2: Property positioning only affects the last property in `propertyPath`. Ancestor
   *         objects' positioning will not be affected.
   *
   * 注 2：属性定位仅影响 propertyPath 中的最后一个 `propertyPath` 。祖先对象的定位不会受到影响。
   *
   * @param propertyPath The path of a (possibly nested) property to add/update.
   *
   * 要添加/更新的（可能是嵌套）属性的路径。
   *
   * @param value The new value to set the property to.
   *
   * 要设置属性的新值。
   *
   * @param position The desired position for the added/updated property.
   *
   * 添加/更新的属性的所需位置。
   *
   */
  addChange(
      propertyPath: string[], value: JsonValue,
      positioning: PackageJsonPropertyPositioning = 'unimportant'): this {
    this.ensureNotApplied();
    this.changes.push([propertyPath, value, positioning]);
    return this;
  }

  /**
   * Write the recorded changes to the associated `package.json` file (and optionally a
   * pre-existing, in-memory representation of it).
   *
   * 将记录的更改写入关联的 `package.json` 文件（以及它的预先存在的内存中表示）。
   *
   * @param packageJsonPath The path to the `package.json` file that needs to be updated.
   *
   * 需要更新的 `package.json` 文件的路径。
   *
   * @param parsedJson A pre-existing, in-memory representation of the `package.json` file that
   *                   needs to be updated as well.
   *
   * `package.json` 文件的预先存在的内存中表示，也需要更新。
   *
   */
  writeChanges(packageJsonPath: AbsoluteFsPath, parsedJson?: JsonObject): void {
    this.ensureNotApplied();
    this.ensureNotSynthesized(parsedJson);
    this.writeChangesImpl(this.changes, packageJsonPath, parsedJson);
    this.applied = true;
  }

  private ensureNotApplied() {
    if (this.applied) {
      throw new Error('Trying to apply a `PackageJsonUpdate` that has already been applied.');
    }
  }

  private ensureNotSynthesized(parsedJson?: JsonObject) {
    if (parsedJson?.synthesized) {
      // Theoretically, this should never happen, because synthesized `package.json` files should
      // only be created for libraries following the Angular Package Format v14+, which means they
      // should already be in Ivy format and not require processing by `ngcc`.
      throw new Error('Trying to update a non-existent (synthesized) `package.json` file.');
    }
  }
}

/**
 * A `PackageJsonUpdater` that writes directly to the file-system.
 *
 * 直接写入文件系统的 `PackageJsonUpdater` 。
 *
 */
export class DirectPackageJsonUpdater implements PackageJsonUpdater {
  constructor(private fs: FileSystem) {}

  createUpdate(): PackageJsonUpdate {
    return new PackageJsonUpdate((...args) => this.writeChanges(...args));
  }

  writeChanges(
      changes: PackageJsonChange[], packageJsonPath: AbsoluteFsPath,
      preExistingParsedJson?: JsonObject): void {
    if (changes.length === 0) {
      throw new Error(`No changes to write to '${packageJsonPath}'.`);
    }

    // Read and parse the `package.json` content.
    // NOTE: We are not using `preExistingParsedJson` (even if specified) to avoid corrupting the
    //       content on disk in case `preExistingParsedJson` is outdated.
    const parsedJson = this.fs.exists(packageJsonPath) ?
        JSON.parse(this.fs.readFile(packageJsonPath)) as JsonObject :
        {};

    // Apply all changes to both the canonical representation (read from disk) and any pre-existing,
    // in-memory representation.
    for (const [propPath, value, positioning] of changes) {
      if (propPath.length === 0) {
        throw new Error(`Missing property path for writing value to '${packageJsonPath}'.`);
      }

      applyChange(parsedJson, propPath, value, positioning);

      if (preExistingParsedJson) {
        // No need to take property positioning into account for in-memory representations.
        applyChange(preExistingParsedJson, propPath, value, 'unimportant');
      }
    }

    // Ensure the containing directory exists (in case this is a synthesized `package.json` due to a
    // custom configuration) and write the updated content to disk.
    this.fs.ensureDir(dirname(packageJsonPath));
    this.fs.writeFile(packageJsonPath, `${JSON.stringify(parsedJson, null, 2)}\n`);
  }
}

// Helpers
export function applyChange(
    ctx: JsonObject, propPath: string[], value: JsonValue,
    positioning: PackageJsonPropertyPositioning): void {
  const lastPropIdx = propPath.length - 1;
  const lastProp = propPath[lastPropIdx];

  for (let i = 0; i < lastPropIdx; i++) {
    const key = propPath[i];
    const newCtx = ctx.hasOwnProperty(key) ? ctx[key] : (ctx[key] = {});

    if ((typeof newCtx !== 'object') || (newCtx === null) || Array.isArray(newCtx)) {
      throw new Error(`Property path '${propPath.join('.')}' does not point to an object.`);
    }

    ctx = newCtx;
  }

  ctx[lastProp] = value;
  positionProperty(ctx, lastProp, positioning);
}

function movePropBefore(ctx: JsonObject, prop: string, isNextProp: (p: string) => boolean): void {
  const allProps = Object.keys(ctx);
  const otherProps = allProps.filter(p => p !== prop);
  const nextPropIdx = otherProps.findIndex(isNextProp);
  const propsToShift = (nextPropIdx === -1) ? [] : otherProps.slice(nextPropIdx);

  movePropToEnd(ctx, prop);
  propsToShift.forEach(p => movePropToEnd(ctx, p));
}

function movePropToEnd(ctx: JsonObject, prop: string): void {
  const value = ctx[prop];
  delete ctx[prop];
  ctx[prop] = value;
}

function positionProperty(
    ctx: JsonObject, prop: string, positioning: PackageJsonPropertyPositioning): void {
  switch (positioning) {
    case 'alphabetic':
      movePropBefore(ctx, prop, p => p > prop);
      break;
    case 'unimportant':
      // Leave the property order unchanged; i.e. newly added properties will be last and existing
      // ones will remain in their old position.
      break;
    default:
      if ((typeof positioning !== 'object') || (positioning.before === undefined)) {
        throw new Error(
            `Unknown positioning (${JSON.stringify(positioning)}) for property '${prop}'.`);
      }

      movePropBefore(ctx, prop, p => p === positioning.before);
      break;
  }
}
