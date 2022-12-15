/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {TNode} from '../render3/interfaces/node';
import {RElement} from '../render3/interfaces/renderer_dom';
import {LView} from '../render3/interfaces/view';
import {getCurrentTNode, getLView} from '../render3/state';
import {getNativeByTNode} from '../render3/util/view_utils';

/**
 * Creates an ElementRef from the most recent node.
 *
 * 从最近的节点创建一个 ElementRef。
 *
 * @returns
 *
 * The ElementRef instance to use
 *
 * 要使用的 ElementRef 实例
 *
 */
export function injectElementRef(): ElementRef {
  return createElementRef(getCurrentTNode()!, getLView());
}

/**
 * Creates an ElementRef given a node.
 *
 * 在给定节点的情况下创建一个 ElementRef。
 *
 * @param tNode The node for which you'd like an ElementRef
 *
 * 你想要 ElementRef 的节点
 *
 * @param lView The view to which the node belongs
 *
 * 节点所属的视图
 *
 * @returns
 *
 * The ElementRef instance to use
 *
 * 要使用的 ElementRef 实例
 *
 */
export function createElementRef(tNode: TNode, lView: LView): ElementRef {
  return new ElementRef(getNativeByTNode(tNode, lView) as RElement);
}

/**
 * A wrapper around a native element inside of a View.
 *
 * 对视图中某个原生元素的包装器。
 *
 * An `ElementRef` is backed by a render-specific element. In the browser, this is usually a DOM
 * element.
 *
 * `ElementRef` 的背后是一个可渲染的具体元素。在浏览器中，它通常是一个 DOM 元素。
 *
 * @security Permitting direct access to the DOM can make your application more vulnerable to
 * XSS attacks. Carefully review any use of `ElementRef` in your code. For more detail, see the
 * [Security Guide](https://g.co/ng/security).
 *
 * 允许直接访问 DOM 会导致你的应用在 XSS 攻击前面更加脆弱。要仔细评审对 `ElementRef`
 * 的代码。欲知详情，参见[安全](http://g.co/ng/security)。
 *
 * @publicApi
 */
// Note: We don't expose things like `Injector`, `ViewContainer`, ... here,
// i.e. users have to ask for what they need. With that, we can build better analysis tools
// and could do better codegen in the future.
export class ElementRef<T = any> {
  /**
   * The underlying native element or `null` if direct access to native elements is not supported
   * (e.g. when the application runs in a web worker).
   *
   * 背后的原生元素，如果不支持直接访问原生元素，则为 `null`（比如：在 Web Worker
   * 环境下运行此应用的时候）。
   *
   * <div class="callout is-critical">
   *
   *   <header>Use with caution</header>
   *
   *   <header>当心！</header>
   *
   *   <p>
   *    Use this API as the last resort when direct access to DOM is needed. Use templating and
   *    data-binding provided by Angular instead. Alternatively you can take a look at {@link
   * Renderer2} which provides API that can safely be used even when direct access to native
   * elements is not supported.
   *   </p>
   *   <p>当需要直接访问 DOM 时，请将此 API 作为最后的手段。改用 Angular
   * 提供的模板和数据绑定。或者，你可以看一下 {@link Renderer2}
   * ，它提供了即使不支持直接访问本机元素也可以安全使用的 API。
   *
   *   </p>
   *
   *   <p>
   *    当需要直接访问 DOM 时，请把本 API 作为最后选择。优先使用 Angular
   * 提供的模板和数据绑定机制。或者你还可以看看 {@link Renderer2}，它提供了可安全使用的 API ——
   * 即使环境没有提供直接访问原生元素的功能。
   *   </p>
   *
   *   <p>
   *    Relying on direct DOM access creates tight coupling between your application and rendering
   *    layers which will make it impossible to separate the two and deploy your application into a
   *    web worker.
   *   </p>
   *   <p>
   *     依赖直接 DOM
   * 访问会在你的应用程序和渲染层之间创建紧耦合，这将导致无法将两者分开并将你的应用程序部署到 Web
   * Worker 中。
   *   </p>
   *
   *   <p>
   *     如果依赖直接访问 DOM
   * 的方式，就可能在应用和渲染层之间产生紧耦合。这将导致无法分开两者，也就无法将应用发布到 Web
   * Worker 中。
   *   </p>
   *
   * </div>
   *
   */
  public nativeElement: T;

  constructor(nativeElement: T) {
    this.nativeElement = nativeElement;
  }

  /**
   * @internal
   * @nocollapse
   */
  static __NG_ELEMENT_ID__: () => ElementRef = injectElementRef;
}

/**
 * Unwraps `ElementRef` and return the `nativeElement`.
 *
 * 解开 `ElementRef` 并返回 `nativeElement` 。
 *
 * @param value value to unwrap
 *
 * 要打开的值
 *
 * @returns
 *
 * `nativeElement` if `ElementRef` otherwise returns value as is.
 *
 * `nativeElement` 如果 `ElementRef` ，否则按原样返回值。
 *
 */
export function unwrapElementRef<T, R>(value: T|ElementRef<R>): T|R {
  return value instanceof ElementRef ? value.nativeElement : value;
}
