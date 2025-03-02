/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {PipeTransform} from '../change_detection/pipe_transform';
import {setInjectImplementation} from '../di/inject_switch';
import {RuntimeError, RuntimeErrorCode} from '../errors';
import {Type} from '../interface/type';

import {getFactoryDef} from './definition_factory';
import {setIncludeViewProviders} from './di';
import {store, ɵɵdirectiveInject} from './instructions/all';
import {isHostComponentStandalone} from './instructions/element_validation';
import {PipeDef, PipeDefList} from './interfaces/definition';
import {CONTEXT, DECLARATION_COMPONENT_VIEW, HEADER_OFFSET, LView, TVIEW} from './interfaces/view';
import {pureFunction1Internal, pureFunction2Internal, pureFunction3Internal, pureFunction4Internal, pureFunctionVInternal} from './pure_function';
import {getBindingRoot, getLView, getTView} from './state';
import {load} from './util/view_utils';



/**
 * Create a pipe.
 *
 * 创建一个管道。
 *
 * @param index Pipe index where the pipe will be stored.
 *
 * 将存储管道的管道索引。
 *
 * @param pipeName The name of the pipe
 *
 * 管道的名称
 *
 * @returns
 *
 * T the instance of the pipe.
 *
 * T 管道的实例。
 *
 * @codeGenApi
 */
export function ɵɵpipe(index: number, pipeName: string): any {
  const tView = getTView();
  let pipeDef: PipeDef<any>;
  const adjustedIndex = index + HEADER_OFFSET;

  if (tView.firstCreatePass) {
    // The `getPipeDef` throws if a pipe with a given name is not found
    // (so we use non-null assertion below).
    pipeDef = getPipeDef(pipeName, tView.pipeRegistry)!;
    tView.data[adjustedIndex] = pipeDef;
    if (pipeDef.onDestroy) {
      (tView.destroyHooks || (tView.destroyHooks = [])).push(adjustedIndex, pipeDef.onDestroy);
    }
  } else {
    pipeDef = tView.data[adjustedIndex] as PipeDef<any>;
  }

  const pipeFactory = pipeDef.factory || (pipeDef.factory = getFactoryDef(pipeDef.type, true));
  const previousInjectImplementation = setInjectImplementation(ɵɵdirectiveInject);
  try {
    // DI for pipes is supposed to behave like directives when placed on a component
    // host node, which means that we have to disable access to `viewProviders`.
    const previousIncludeViewProviders = setIncludeViewProviders(false);
    const pipeInstance = pipeFactory();
    setIncludeViewProviders(previousIncludeViewProviders);
    store(tView, getLView(), adjustedIndex, pipeInstance);
    return pipeInstance;
  } finally {
    // we have to restore the injector implementation in finally, just in case the creation of the
    // pipe throws an error.
    setInjectImplementation(previousInjectImplementation);
  }
}

/**
 * Searches the pipe registry for a pipe with the given name. If one is found,
 * returns the pipe. Otherwise, an error is thrown because the pipe cannot be resolved.
 *
 * 在管道注册表中搜索具有给定名称的管道。如果找到，则返回管道。否则，会由于无法解析管道而抛出错误。
 *
 * @param name Name of pipe to resolve
 *
 * 要解析的管道名称
 *
 * @param registry Full list of available pipes
 *
 * 可用管道的完整列表
 *
 * @returns
 *
 * Matching PipeDef
 *
 * 匹配 PipeDef
 *
 */
function getPipeDef(name: string, registry: PipeDefList|null): PipeDef<any>|undefined {
  if (registry) {
    for (let i = registry.length - 1; i >= 0; i--) {
      const pipeDef = registry[i];
      if (name === pipeDef.name) {
        return pipeDef;
      }
    }
  }
  if (ngDevMode) {
    throw new RuntimeError(RuntimeErrorCode.PIPE_NOT_FOUND, getPipeNotFoundErrorMessage(name));
  }
}

/**
 * Generates a helpful error message for the user when a pipe is not found.
 *
 * 找不到管道时为用户生成有用的错误消息。
 *
 * @param name Name of the missing pipe
 *
 * 缺失的管道名称
 *
 * @returns
 *
 * The error message
 *
 * 错误消息
 *
 */
function getPipeNotFoundErrorMessage(name: string) {
  const lView = getLView();
  const declarationLView = lView[DECLARATION_COMPONENT_VIEW] as LView<Type<unknown>>;
  const context = declarationLView[CONTEXT];
  const hostIsStandalone = isHostComponentStandalone(lView);
  const componentInfoMessage = context ? ` in the '${context.constructor.name}' component` : '';
  const verifyMessage = `Verify that it is ${
      hostIsStandalone ? 'included in the \'@Component.imports\' of this component' :
                         'declared or imported in this module'}`;
  const errorMessage =
      `The pipe '${name}' could not be found${componentInfoMessage}. ${verifyMessage}`;
  return errorMessage;
}

/**
 * Invokes a pipe with 1 arguments.
 *
 * 调用带有 1 参数的管道。
 *
 * This instruction acts as a guard to {@link PipeTransform#transform} invoking
 * the pipe only when an input to the pipe changes.
 *
 * 此指令仅作为 {@link PipeTransform#transform} 的保护，仅当管道的输入更改时才调用管道。
 *
 * @param index Pipe index where the pipe was stored on creation.
 *
 * 创建时存储管道的管道索引。
 *
 * @param slotOffset the offset in the reserved slot space
 *
 * 保留插槽空间中的偏移量
 *
 * @param v1 1st argument to {@link PipeTransform#transform}.
 *
 * {@link PipeTransform#transform} 的第一个参数。
 *
 * @codeGenApi
 */
export function ɵɵpipeBind1(index: number, slotOffset: number, v1: any): any {
  const adjustedIndex = index + HEADER_OFFSET;
  const lView = getLView();
  const pipeInstance = load<PipeTransform>(lView, adjustedIndex);
  return isPure(lView, adjustedIndex) ?
      pureFunction1Internal(
          lView, getBindingRoot(), slotOffset, pipeInstance.transform, v1, pipeInstance) :
      pipeInstance.transform(v1);
}

/**
 * Invokes a pipe with 2 arguments.
 *
 * 调用带有 2 个参数的管道。
 *
 * This instruction acts as a guard to {@link PipeTransform#transform} invoking
 * the pipe only when an input to the pipe changes.
 *
 * 此指令仅作为 {@link PipeTransform#transform} 的保护，仅当管道的输入更改时才调用管道。
 *
 * @param index Pipe index where the pipe was stored on creation.
 *
 * 创建时存储管道的管道索引。
 *
 * @param slotOffset the offset in the reserved slot space
 *
 * 保留插槽空间中的偏移量
 *
 * @param v1 1st argument to {@link PipeTransform#transform}.
 *
 * {@link PipeTransform#transform} 的第一个参数。
 *
 * @param v2 2nd argument to {@link PipeTransform#transform}.
 *
 * {@link PipeTransform#transform} 的第二个参数。
 *
 * @codeGenApi
 */
export function ɵɵpipeBind2(index: number, slotOffset: number, v1: any, v2: any): any {
  const adjustedIndex = index + HEADER_OFFSET;
  const lView = getLView();
  const pipeInstance = load<PipeTransform>(lView, adjustedIndex);
  return isPure(lView, adjustedIndex) ?
      pureFunction2Internal(
          lView, getBindingRoot(), slotOffset, pipeInstance.transform, v1, v2, pipeInstance) :
      pipeInstance.transform(v1, v2);
}

/**
 * Invokes a pipe with 3 arguments.
 *
 * 调用带有 3 个参数的管道。
 *
 * This instruction acts as a guard to {@link PipeTransform#transform} invoking
 * the pipe only when an input to the pipe changes.
 *
 * 此指令仅作为 {@link PipeTransform#transform} 的保护，仅当管道的输入更改时才调用管道。
 *
 * @param index Pipe index where the pipe was stored on creation.
 *
 * 创建时存储管道的管道索引。
 *
 * @param slotOffset the offset in the reserved slot space
 *
 * 保留插槽空间中的偏移量
 *
 * @param v1 1st argument to {@link PipeTransform#transform}.
 *
 * {@link PipeTransform#transform} 的第一个参数。
 *
 * @param v2 2nd argument to {@link PipeTransform#transform}.
 *
 * {@link PipeTransform#transform} 的第二个参数。
 *
 * @param v3 4rd argument to {@link PipeTransform#transform}.
 *
 * {@link PipeTransform#transform} 的第四个参数。
 *
 * @codeGenApi
 */
export function ɵɵpipeBind3(index: number, slotOffset: number, v1: any, v2: any, v3: any): any {
  const adjustedIndex = index + HEADER_OFFSET;
  const lView = getLView();
  const pipeInstance = load<PipeTransform>(lView, adjustedIndex);
  return isPure(lView, adjustedIndex) ?
      pureFunction3Internal(
          lView, getBindingRoot(), slotOffset, pipeInstance.transform, v1, v2, v3, pipeInstance) :
      pipeInstance.transform(v1, v2, v3);
}

/**
 * Invokes a pipe with 4 arguments.
 *
 * 调用带有 4 个参数的管道。
 *
 * This instruction acts as a guard to {@link PipeTransform#transform} invoking
 * the pipe only when an input to the pipe changes.
 *
 * 此指令仅作为 {@link PipeTransform#transform} 的保护，仅当管道的输入更改时才调用管道。
 *
 * @param index Pipe index where the pipe was stored on creation.
 *
 * 创建时存储管道的管道索引。
 *
 * @param slotOffset the offset in the reserved slot space
 *
 * 保留插槽空间中的偏移量
 *
 * @param v1 1st argument to {@link PipeTransform#transform}.
 *
 * {@link PipeTransform#transform} 的第一个参数。
 *
 * @param v2 2nd argument to {@link PipeTransform#transform}.
 *
 * {@link PipeTransform#transform} 的第二个参数。
 *
 * @param v3 3rd argument to {@link PipeTransform#transform}.
 *
 * {@link PipeTransform#transform} 的第三个参数。
 *
 * @param v4 4th argument to {@link PipeTransform#transform}.
 *
 * {@link PipeTransform#transform} 的第四个参数。
 *
 * @codeGenApi
 */
export function ɵɵpipeBind4(
    index: number, slotOffset: number, v1: any, v2: any, v3: any, v4: any): any {
  const adjustedIndex = index + HEADER_OFFSET;
  const lView = getLView();
  const pipeInstance = load<PipeTransform>(lView, adjustedIndex);
  return isPure(lView, adjustedIndex) ? pureFunction4Internal(
                                            lView, getBindingRoot(), slotOffset,
                                            pipeInstance.transform, v1, v2, v3, v4, pipeInstance) :
                                        pipeInstance.transform(v1, v2, v3, v4);
}

/**
 * Invokes a pipe with variable number of arguments.
 *
 * 调用具有可变数量的参数的管道。
 *
 * This instruction acts as a guard to {@link PipeTransform#transform} invoking
 * the pipe only when an input to the pipe changes.
 *
 * 此指令仅作为 {@link PipeTransform#transform} 的保护，仅当管道的输入更改时才调用管道。
 *
 * @param index Pipe index where the pipe was stored on creation.
 *
 * 创建时存储管道的管道索引。
 *
 * @param slotOffset the offset in the reserved slot space
 *
 * 保留插槽空间中的偏移量
 *
 * @param values Array of arguments to pass to {@link PipeTransform#transform} method.
 *
 * 要传递给 {@link PipeTransform#transform} 方法的参数数组。
 *
 * @codeGenApi
 */
export function ɵɵpipeBindV(index: number, slotOffset: number, values: [any, ...any[]]): any {
  const adjustedIndex = index + HEADER_OFFSET;
  const lView = getLView();
  const pipeInstance = load<PipeTransform>(lView, adjustedIndex);
  return isPure(lView, adjustedIndex) ?
      pureFunctionVInternal(
          lView, getBindingRoot(), slotOffset, pipeInstance.transform, values, pipeInstance) :
      pipeInstance.transform.apply(pipeInstance, values);
}

function isPure(lView: LView, index: number): boolean {
  return (<PipeDef<any>>lView[TVIEW].data[index]).pure;
}
