/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import {ChildProcess, fork} from 'child_process';
import module from 'module';

import {AbsoluteFsPath, FileSystem} from '../../../../src/ngtsc/file_system';
import {Logger, LogLevel} from '../../../../src/ngtsc/logging';
import {getLockFilePath, LockFile} from '../lock_file';

import {removeLockFile} from './util';

/// <reference types="node" />

/**
 * This `LockFile` implementation uses a child-process to remove the lock file when the main process
 * exits (for whatever reason).
 *
 * 此 `LockFile` 实现使用子进程在主进程退出（无论出于何种原因）时删除锁定文件。
 *
 * There are a few milliseconds between the child-process being forked and it registering its
 * `disconnect` event, which is responsible for tidying up the lock-file in the event that the main
 * process exits unexpectedly.
 *
 * 被 fork 的子进程和它注册其 `disconnect`
 * 事件之间有几毫秒，该事件负责在主进程意外退出的事件中清理锁定文件。
 *
 * We eagerly create the unlocker child-process so that it maximizes the time before the lock-file
 * is actually written, which makes it very unlikely that the unlocker would not be ready in the
 * case that the developer hits Ctrl-C or closes the terminal within a fraction of a second of the
 * lock-file being created.
 *
 * 我们急切地创建了解锁器子进程，以最大限度地利用实际写入锁定文件之前的时间，这使得在开发人员按
 * Ctrl-C 或关闭终端的情况下，解锁器不太可能未就绪正在创建的锁定文件的几分之一秒。
 *
 * The worst case scenario is that ngcc is killed too quickly and leaves behind an orphaned
 * lock-file. In which case the next ngcc run will display a helpful error message about deleting
 * the lock-file.
 *
 * 最糟糕的情况是 ngcc 被杀死得太快并留下一个孤立的锁文件。在这种情况下，下一次 ngcc
 * 运行将显示有关删除 lock-file 的有用错误消息。
 *
 */
export class LockFileWithChildProcess implements LockFile {
  path: AbsoluteFsPath;
  private unlocker: ChildProcess|null;

  constructor(protected fs: FileSystem, protected logger: Logger) {
    this.path = getLockFilePath(fs);
    this.unlocker = this.createUnlocker(this.path);
  }


  write(): void {
    if (this.unlocker === null) {
      // In case we already disconnected the previous unlocker child-process, perhaps by calling
      // `remove()`. Normally the LockFile should only be used once per instance.
      this.unlocker = this.createUnlocker(this.path);
    }
    this.logger.debug(`Attemping to write lock-file at ${this.path} with PID ${process.pid}`);
    // To avoid race conditions, check for existence of the lock-file by trying to create it.
    // This will throw an error if the file already exists.
    this.fs.writeFile(this.path, process.pid.toString(), /* exclusive */ true);
    this.logger.debug(`Written lock-file at ${this.path} with PID ${process.pid}`);
  }

  read(): string {
    try {
      return this.fs.readFile(this.path);
    } catch {
      return '{unknown}';
    }
  }

  remove() {
    removeLockFile(this.fs, this.logger, this.path, process.pid.toString());
    if (this.unlocker !== null) {
      // If there is an unlocker child-process then disconnect from it so that it can exit itself.
      this.unlocker.disconnect();
      this.unlocker = null;
    }
  }

  protected createUnlocker(path: AbsoluteFsPath): ChildProcess {
    this.logger.debug('Forking unlocker child-process');
    const logLevel =
        this.logger.level !== undefined ? this.logger.level.toString() : LogLevel.info.toString();
    const isWindows = process.platform === 'win32';
    const unlocker = fork(
        getLockFileUnlockerScriptPath(this.fs), [path, logLevel],
        {detached: true, stdio: isWindows ? 'pipe' : 'inherit'});
    if (isWindows) {
      unlocker.stdout?.on('data', process.stdout.write.bind(process.stdout));
      unlocker.stderr?.on('data', process.stderr.write.bind(process.stderr));
    }
    return unlocker;
  }
}

/**
 * Gets the absolute file path to the lock file unlocker script.
 *
 * 获取锁定文件解锁器脚本的绝对文件路径。
 *
 */
export function getLockFileUnlockerScriptPath(fileSystem: FileSystem): AbsoluteFsPath {
  // This is an interop allowing for the unlocking script to be determined in both
  // a CommonJS module, or an ES module which does not come with `require` by default.
  const requireFn =
      typeof require !== 'undefined' ? require : module.createRequire(__ESM_IMPORT_META_URL__);
  // We resolve the worker script using module resolution as in the package output,
  // the worker might be bundled but exposed through a subpath export mapping.
  const unlockerScriptPath = requireFn.resolve(
      '@angular/compiler-cli/ngcc/src/locking/lock_file_with_child_process/ngcc_lock_unlocker');
  return fileSystem.resolve(unlockerScriptPath);
}
