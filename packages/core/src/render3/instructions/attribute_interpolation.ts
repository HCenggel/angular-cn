/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import {SanitizerFn} from '../interfaces/sanitization';
import {getBindingIndex, getLView, getSelectedTNode, getTView} from '../state';
import {NO_CHANGE} from '../tokens';

import {interpolation1, interpolation2, interpolation3, interpolation4, interpolation5, interpolation6, interpolation7, interpolation8, interpolationV} from './interpolation';
import {elementAttributeInternal, storePropertyBindingMetadata} from './shared';



/**
 * Update an interpolated attribute on an element with single bound value surrounded by text.
 *
 * 使用被文本包围的单个绑定值更新元素上的插值属性。
 *
 * Used when the value passed to a property has 1 interpolated value in it:
 *
 * 当传递给属性的值中有 1 个插值时使用：
 *
 * ```html
 * <div attr.title="prefix{{v0}}suffix"></div>
 * ```
 *
 * Its compiled representation is::
 *
 * 其编译后的表示是::
 *
 * ```ts
 * ɵɵattributeInterpolate1('title', 'prefix', v0, 'suffix');
 * ```
 *
 * @param attrName The name of the attribute to update
 *
 * 要更新的属性名称
 *
 * @param prefix Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param v0 Value checked for change.
 *
 * 检查更改的值。
 *
 * @param suffix Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param sanitizer An optional sanitizer function
 *
 * 可选的消毒器功能
 *
 * @returns
 *
 * itself, so that it may be chained.
 *
 * 本身，以便它可以被链接起来。
 *
 * @codeGenApi
 */
export function ɵɵattributeInterpolate1(
    attrName: string, prefix: string, v0: any, suffix: string, sanitizer?: SanitizerFn,
    namespace?: string): typeof ɵɵattributeInterpolate1 {
  const lView = getLView();
  const interpolatedValue = interpolation1(lView, prefix, v0, suffix);
  if (interpolatedValue !== NO_CHANGE) {
    const tNode = getSelectedTNode();
    elementAttributeInternal(tNode, lView, attrName, interpolatedValue, sanitizer, namespace);
    ngDevMode &&
        storePropertyBindingMetadata(
            getTView().data, tNode, 'attr.' + attrName, getBindingIndex() - 1, prefix, suffix);
  }
  return ɵɵattributeInterpolate1;
}

/**
 * Update an interpolated attribute on an element with 2 bound values surrounded by text.
 *
 * 使用文本包围的 2 个绑定值更新元素上的插值属性。
 *
 * Used when the value passed to a property has 2 interpolated values in it:
 *
 * 当传递给属性的值中有 2 个插值时使用：
 *
 * ```html
 * <div attr.title="prefix{{v0}}-{{v1}}suffix"></div>
 * ```
 *
 * Its compiled representation is::
 *
 * 其编译后的表示是::
 *
 * ```ts
 * ɵɵattributeInterpolate2('title', 'prefix', v0, '-', v1, 'suffix');
 * ```
 *
 * @param attrName The name of the attribute to update
 *
 * 要更新的属性名称
 *
 * @param prefix Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param v0 Value checked for change.
 *
 * 检查更改的值。
 *
 * @param i0 Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param v1 Value checked for change.
 *
 * 检查更改的值。
 *
 * @param suffix Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param sanitizer An optional sanitizer function
 *
 * 可选的消毒器功能
 *
 * @returns
 *
 * itself, so that it may be chained.
 *
 * 本身，以便它可以被链接起来。
 *
 * @codeGenApi
 */
export function ɵɵattributeInterpolate2(
    attrName: string, prefix: string, v0: any, i0: string, v1: any, suffix: string,
    sanitizer?: SanitizerFn, namespace?: string): typeof ɵɵattributeInterpolate2 {
  const lView = getLView();
  const interpolatedValue = interpolation2(lView, prefix, v0, i0, v1, suffix);
  if (interpolatedValue !== NO_CHANGE) {
    const tNode = getSelectedTNode();
    elementAttributeInternal(tNode, lView, attrName, interpolatedValue, sanitizer, namespace);
    ngDevMode &&
        storePropertyBindingMetadata(
            getTView().data, tNode, 'attr.' + attrName, getBindingIndex() - 2, prefix, i0, suffix);
  }
  return ɵɵattributeInterpolate2;
}

/**
 * Update an interpolated attribute on an element with 3 bound values surrounded by text.
 *
 * 使用 3 个被文本包围的绑定值更新元素上的插值属性。
 *
 * Used when the value passed to a property has 3 interpolated values in it:
 *
 * 当传递给属性的值中有 3 个插值时使用：
 *
 * ```html
 * <div attr.title="prefix{{v0}}-{{v1}}-{{v2}}suffix"></div>
 * ```
 *
 * Its compiled representation is::
 *
 * 其编译后的表示是::
 *
 * ```ts
 * ɵɵattributeInterpolate3(
 * 'title', 'prefix', v0, '-', v1, '-', v2, 'suffix');
 * ```
 *
 * @param attrName The name of the attribute to update
 *
 * 要更新的属性名称
 *
 * @param prefix Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param v0 Value checked for change.
 *
 * 检查更改的值。
 *
 * @param i0 Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param v1 Value checked for change.
 *
 * 检查更改的值。
 *
 * @param i1 Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param v2 Value checked for change.
 *
 * 检查更改的值。
 *
 * @param suffix Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param sanitizer An optional sanitizer function
 *
 * 可选的消毒器功能
 *
 * @returns
 *
 * itself, so that it may be chained.
 *
 * 本身，以便它可以被链接起来。
 *
 * @codeGenApi
 */
export function ɵɵattributeInterpolate3(
    attrName: string, prefix: string, v0: any, i0: string, v1: any, i1: string, v2: any,
    suffix: string, sanitizer?: SanitizerFn, namespace?: string): typeof ɵɵattributeInterpolate3 {
  const lView = getLView();
  const interpolatedValue = interpolation3(lView, prefix, v0, i0, v1, i1, v2, suffix);
  if (interpolatedValue !== NO_CHANGE) {
    const tNode = getSelectedTNode();
    elementAttributeInternal(tNode, lView, attrName, interpolatedValue, sanitizer, namespace);
    ngDevMode &&
        storePropertyBindingMetadata(
            getTView().data, tNode, 'attr.' + attrName, getBindingIndex() - 3, prefix, i0, i1,
            suffix);
  }
  return ɵɵattributeInterpolate3;
}

/**
 * Update an interpolated attribute on an element with 4 bound values surrounded by text.
 *
 * 使用被文本包围的 4 个绑定值更新元素上的插值属性。
 *
 * Used when the value passed to a property has 4 interpolated values in it:
 *
 * 当传递给属性的值中有 4 个插值时使用：
 *
 * ```html
 * <div attr.title="prefix{{v0}}-{{v1}}-{{v2}}-{{v3}}suffix"></div>
 * ```
 *
 * Its compiled representation is::
 *
 * 其编译后的表示是::
 *
 * ```ts
 * ɵɵattributeInterpolate4(
 * 'title', 'prefix', v0, '-', v1, '-', v2, '-', v3, 'suffix');
 * ```
 *
 * @param attrName The name of the attribute to update
 *
 * 要更新的属性名称
 *
 * @param prefix Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param v0 Value checked for change.
 *
 * 检查更改的值。
 *
 * @param i0 Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param v1 Value checked for change.
 *
 * 检查更改的值。
 *
 * @param i1 Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param v2 Value checked for change.
 *
 * 检查更改的值。
 *
 * @param i2 Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param v3 Value checked for change.
 *
 * 检查更改的值。
 *
 * @param suffix Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param sanitizer An optional sanitizer function
 *
 * 可选的消毒器功能
 *
 * @returns
 *
 * itself, so that it may be chained.
 *
 * 本身，以便它可以被链接起来。
 *
 * @codeGenApi
 */
export function ɵɵattributeInterpolate4(
    attrName: string, prefix: string, v0: any, i0: string, v1: any, i1: string, v2: any, i2: string,
    v3: any, suffix: string, sanitizer?: SanitizerFn,
    namespace?: string): typeof ɵɵattributeInterpolate4 {
  const lView = getLView();
  const interpolatedValue = interpolation4(lView, prefix, v0, i0, v1, i1, v2, i2, v3, suffix);
  if (interpolatedValue !== NO_CHANGE) {
    const tNode = getSelectedTNode();
    elementAttributeInternal(tNode, lView, attrName, interpolatedValue, sanitizer, namespace);
    ngDevMode &&
        storePropertyBindingMetadata(
            getTView().data, tNode, 'attr.' + attrName, getBindingIndex() - 4, prefix, i0, i1, i2,
            suffix);
  }
  return ɵɵattributeInterpolate4;
}

/**
 * Update an interpolated attribute on an element with 5 bound values surrounded by text.
 *
 * 使用 5 个被文本包围的绑定值更新元素上的插值属性。
 *
 * Used when the value passed to a property has 5 interpolated values in it:
 *
 * 当传递给属性的值中有 5 个插值时使用：
 *
 * ```html
 * <div attr.title="prefix{{v0}}-{{v1}}-{{v2}}-{{v3}}-{{v4}}suffix"></div>
 * ```
 *
 * Its compiled representation is::
 *
 * 其编译后的表示是::
 *
 * ```ts
 * ɵɵattributeInterpolate5(
 * 'title', 'prefix', v0, '-', v1, '-', v2, '-', v3, '-', v4, 'suffix');
 * ```
 *
 * @param attrName The name of the attribute to update
 *
 * 要更新的属性名称
 *
 * @param prefix Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param v0 Value checked for change.
 *
 * 检查更改的值。
 *
 * @param i0 Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param v1 Value checked for change.
 *
 * 检查更改的值。
 *
 * @param i1 Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param v2 Value checked for change.
 *
 * 检查更改的值。
 *
 * @param i2 Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param v3 Value checked for change.
 *
 * 检查更改的值。
 *
 * @param i3 Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param v4 Value checked for change.
 *
 * 检查更改的值。
 *
 * @param suffix Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param sanitizer An optional sanitizer function
 *
 * 可选的消毒器功能
 *
 * @returns
 *
 * itself, so that it may be chained.
 *
 * 本身，以便它可以被链接起来。
 *
 * @codeGenApi
 */
export function ɵɵattributeInterpolate5(
    attrName: string, prefix: string, v0: any, i0: string, v1: any, i1: string, v2: any, i2: string,
    v3: any, i3: string, v4: any, suffix: string, sanitizer?: SanitizerFn,
    namespace?: string): typeof ɵɵattributeInterpolate5 {
  const lView = getLView();
  const interpolatedValue =
      interpolation5(lView, prefix, v0, i0, v1, i1, v2, i2, v3, i3, v4, suffix);
  if (interpolatedValue !== NO_CHANGE) {
    const tNode = getSelectedTNode();
    elementAttributeInternal(tNode, lView, attrName, interpolatedValue, sanitizer, namespace);
    ngDevMode &&
        storePropertyBindingMetadata(
            getTView().data, tNode, 'attr.' + attrName, getBindingIndex() - 5, prefix, i0, i1, i2,
            i3, suffix);
  }
  return ɵɵattributeInterpolate5;
}

/**
 * Update an interpolated attribute on an element with 6 bound values surrounded by text.
 *
 * 使用被文本包围的 6 个绑定值更新元素上的插值属性。
 *
 * Used when the value passed to a property has 6 interpolated values in it:
 *
 * 当传递给属性的值中有 6 个插值时使用：
 *
 * ```html
 * <div attr.title="prefix{{v0}}-{{v1}}-{{v2}}-{{v3}}-{{v4}}-{{v5}}suffix"></div>
 * ```
 *
 * Its compiled representation is::
 *
 * 其编译后的表示是::
 *
 * ```ts
 * ɵɵattributeInterpolate6(
 *    'title', 'prefix', v0, '-', v1, '-', v2, '-', v3, '-', v4, '-', v5, 'suffix');
 * ```
 *
 * @param attrName The name of the attribute to update
 *
 * 要更新的属性名称
 *
 * @param prefix Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param v0 Value checked for change.
 *
 * 检查更改的值。
 *
 * @param i0 Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param v1 Value checked for change.
 *
 * 检查更改的值。
 *
 * @param i1 Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param v2 Value checked for change.
 *
 * 检查更改的值。
 *
 * @param i2 Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param v3 Value checked for change.
 *
 * 检查更改的值。
 *
 * @param i3 Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param v4 Value checked for change.
 *
 * 检查更改的值。
 *
 * @param i4 Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param v5 Value checked for change.
 *
 * 检查更改的值。
 *
 * @param suffix Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param sanitizer An optional sanitizer function
 *
 * 可选的消毒器功能
 *
 * @returns
 *
 * itself, so that it may be chained.
 *
 * 本身，以便它可以被链接起来。
 *
 * @codeGenApi
 */
export function ɵɵattributeInterpolate6(
    attrName: string, prefix: string, v0: any, i0: string, v1: any, i1: string, v2: any, i2: string,
    v3: any, i3: string, v4: any, i4: string, v5: any, suffix: string, sanitizer?: SanitizerFn,
    namespace?: string): typeof ɵɵattributeInterpolate6 {
  const lView = getLView();
  const interpolatedValue =
      interpolation6(lView, prefix, v0, i0, v1, i1, v2, i2, v3, i3, v4, i4, v5, suffix);
  if (interpolatedValue !== NO_CHANGE) {
    const tNode = getSelectedTNode();
    elementAttributeInternal(tNode, lView, attrName, interpolatedValue, sanitizer, namespace);
    ngDevMode &&
        storePropertyBindingMetadata(
            getTView().data, tNode, 'attr.' + attrName, getBindingIndex() - 6, prefix, i0, i1, i2,
            i3, i4, suffix);
  }
  return ɵɵattributeInterpolate6;
}

/**
 * Update an interpolated attribute on an element with 7 bound values surrounded by text.
 *
 * 使用 7 个被文本包围的绑定值更新元素上的插值属性。
 *
 * Used when the value passed to a property has 7 interpolated values in it:
 *
 * 当传递给属性的值中有 7 个插值时使用：
 *
 * ```html
 * <div attr.title="prefix{{v0}}-{{v1}}-{{v2}}-{{v3}}-{{v4}}-{{v5}}-{{v6}}suffix"></div>
 * ```
 *
 * Its compiled representation is::
 *
 * 其编译后的表示是::
 *
 * ```ts
 * ɵɵattributeInterpolate7(
 *    'title', 'prefix', v0, '-', v1, '-', v2, '-', v3, '-', v4, '-', v5, '-', v6, 'suffix');
 * ```
 *
 * @param attrName The name of the attribute to update
 *
 * 要更新的属性名称
 *
 * @param prefix Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param v0 Value checked for change.
 *
 * 检查更改的值。
 *
 * @param i0 Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param v1 Value checked for change.
 *
 * 检查更改的值。
 *
 * @param i1 Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param v2 Value checked for change.
 *
 * 检查更改的值。
 *
 * @param i2 Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param v3 Value checked for change.
 *
 * 检查更改的值。
 *
 * @param i3 Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param v4 Value checked for change.
 *
 * 检查更改的值。
 *
 * @param i4 Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param v5 Value checked for change.
 *
 * 检查更改的值。
 *
 * @param i5 Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param v6 Value checked for change.
 *
 * 检查更改的值。
 *
 * @param suffix Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param sanitizer An optional sanitizer function
 *
 * 可选的消毒器功能
 *
 * @returns
 *
 * itself, so that it may be chained.
 *
 * 本身，以便它可以被链接起来。
 *
 * @codeGenApi
 */
export function ɵɵattributeInterpolate7(
    attrName: string, prefix: string, v0: any, i0: string, v1: any, i1: string, v2: any, i2: string,
    v3: any, i3: string, v4: any, i4: string, v5: any, i5: string, v6: any, suffix: string,
    sanitizer?: SanitizerFn, namespace?: string): typeof ɵɵattributeInterpolate7 {
  const lView = getLView();
  const interpolatedValue =
      interpolation7(lView, prefix, v0, i0, v1, i1, v2, i2, v3, i3, v4, i4, v5, i5, v6, suffix);
  if (interpolatedValue !== NO_CHANGE) {
    const tNode = getSelectedTNode();
    elementAttributeInternal(tNode, lView, attrName, interpolatedValue, sanitizer, namespace);
    ngDevMode &&
        storePropertyBindingMetadata(
            getTView().data, tNode, 'attr.' + attrName, getBindingIndex() - 7, prefix, i0, i1, i2,
            i3, i4, i5, suffix);
  }
  return ɵɵattributeInterpolate7;
}

/**
 * Update an interpolated attribute on an element with 8 bound values surrounded by text.
 *
 * 使用 8 个被文本包围的绑定值更新元素上的插值属性。
 *
 * Used when the value passed to a property has 8 interpolated values in it:
 *
 * 当传递给属性的值中有 8 个插值时使用：
 *
 * ```html
 * <div attr.title="prefix{{v0}}-{{v1}}-{{v2}}-{{v3}}-{{v4}}-{{v5}}-{{v6}}-{{v7}}suffix"></div>
 * ```
 *
 * Its compiled representation is::
 *
 * 其编译后的表示是::
 *
 * ```ts
 * ɵɵattributeInterpolate8(
 *  'title', 'prefix', v0, '-', v1, '-', v2, '-', v3, '-', v4, '-', v5, '-', v6, '-', v7, 'suffix');
 * ```
 *
 * @param attrName The name of the attribute to update
 *
 * 要更新的属性名称
 *
 * @param prefix Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param v0 Value checked for change.
 *
 * 检查更改的值。
 *
 * @param i0 Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param v1 Value checked for change.
 *
 * 检查更改的值。
 *
 * @param i1 Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param v2 Value checked for change.
 *
 * 检查更改的值。
 *
 * @param i2 Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param v3 Value checked for change.
 *
 * 检查更改的值。
 *
 * @param i3 Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param v4 Value checked for change.
 *
 * 检查更改的值。
 *
 * @param i4 Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param v5 Value checked for change.
 *
 * 检查更改的值。
 *
 * @param i5 Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param v6 Value checked for change.
 *
 * 检查更改的值。
 *
 * @param i6 Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param v7 Value checked for change.
 *
 * 检查更改的值。
 *
 * @param suffix Static value used for concatenation only.
 *
 * 仅用于连接的静态值。
 *
 * @param sanitizer An optional sanitizer function
 *
 * 可选的消毒器功能
 *
 * @returns
 *
 * itself, so that it may be chained.
 *
 * 本身，以便它可以被链接起来。
 *
 * @codeGenApi
 */
export function ɵɵattributeInterpolate8(
    attrName: string, prefix: string, v0: any, i0: string, v1: any, i1: string, v2: any, i2: string,
    v3: any, i3: string, v4: any, i4: string, v5: any, i5: string, v6: any, i6: string, v7: any,
    suffix: string, sanitizer?: SanitizerFn, namespace?: string): typeof ɵɵattributeInterpolate8 {
  const lView = getLView();
  const interpolatedValue = interpolation8(
      lView, prefix, v0, i0, v1, i1, v2, i2, v3, i3, v4, i4, v5, i5, v6, i6, v7, suffix);
  if (interpolatedValue !== NO_CHANGE) {
    const tNode = getSelectedTNode();
    elementAttributeInternal(tNode, lView, attrName, interpolatedValue, sanitizer, namespace);
    ngDevMode &&
        storePropertyBindingMetadata(
            getTView().data, tNode, 'attr.' + attrName, getBindingIndex() - 8, prefix, i0, i1, i2,
            i3, i4, i5, i6, suffix);
  }
  return ɵɵattributeInterpolate8;
}

/**
 * Update an interpolated attribute on an element with 9 or more bound values surrounded by text.
 *
 * 使用 9 个或更多被文本包围的绑定值更新元素上的插值属性。
 *
 * Used when the number of interpolated values exceeds 8.
 *
 * 当内插值的数量超过 8 时使用。
 *
 * ```html
 * <div
 *  title="prefix{{v0}}-{{v1}}-{{v2}}-{{v3}}-{{v4}}-{{v5}}-{{v6}}-{{v7}}-{{v8}}-{{v9}}suffix"></div>
 * ```
 *
 * Its compiled representation is::
 *
 * 其编译后的表示是::
 *
 * ```ts
 * ɵɵattributeInterpolateV(
 *  'title', ['prefix', v0, '-', v1, '-', v2, '-', v3, '-', v4, '-', v5, '-', v6, '-', v7, '-', v9,
 *  'suffix']);
 * ```
 *
 * @param attrName The name of the attribute to update.
 *
 * 要更新的属性的名称。
 *
 * @param values The collection of values and the strings in-between those values, beginning with
 * a string prefix and ending with a string suffix.
 * (e.g. `['prefix', value0, '-', value1, '-', value2, ..., value99, 'suffix']`)
 *
 * 值和这些值之间的字符串的集合，以字符串前缀开头并以字符串后缀结尾。（例如 `['prefix', value0,
 * '-', value1, '-', value2, ..., value99, 'suffix']`）
 *
 * @param sanitizer An optional sanitizer function
 *
 * 可选的消毒器功能
 *
 * @returns
 *
 * itself, so that it may be chained.
 *
 * 本身，以便它可以被链接起来。
 *
 * @codeGenApi
 */
export function ɵɵattributeInterpolateV(
    attrName: string, values: any[], sanitizer?: SanitizerFn,
    namespace?: string): typeof ɵɵattributeInterpolateV {
  const lView = getLView();
  const interpolated = interpolationV(lView, values);
  if (interpolated !== NO_CHANGE) {
    const tNode = getSelectedTNode();
    elementAttributeInternal(tNode, lView, attrName, interpolated, sanitizer, namespace);
    if (ngDevMode) {
      const interpolationInBetween = [values[0]];  // prefix
      for (let i = 2; i < values.length; i += 2) {
        interpolationInBetween.push(values[i]);
      }
      storePropertyBindingMetadata(
          getTView().data, tNode, 'attr.' + attrName,
          getBindingIndex() - interpolationInBetween.length + 1, ...interpolationInBetween);
    }
  }
  return ɵɵattributeInterpolateV;
}
