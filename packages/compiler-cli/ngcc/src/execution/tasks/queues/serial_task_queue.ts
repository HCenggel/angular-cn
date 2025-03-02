/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {Task} from '../api';
import {stringifyTask} from '../utils';

import {BaseTaskQueue} from './base_task_queue';


/**
 * A `TaskQueue` implementation that assumes tasks are processed serially and each one is completed
 * before requesting the next one.
 *
 * 一种 `TaskQueue` 实现，它假定任务是按顺序处理的，并且每个任务都在请求下一个之前完成。
 *
 */
export class SerialTaskQueue extends BaseTaskQueue {
  override computeNextTask(): Task|null {
    const nextTask = this.tasks.shift() || null;

    if (nextTask) {
      if (this.inProgressTasks.size > 0) {
        // `SerialTaskQueue` can have max one in-progress task.
        const inProgressTask = this.inProgressTasks.values().next().value;
        throw new Error(
            'Trying to get next task, while there is already a task in progress: ' +
            stringifyTask(inProgressTask));
      }

      this.inProgressTasks.add(nextTask);
    }

    return nextTask;
  }
}
