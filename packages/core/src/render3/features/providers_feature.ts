/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import {ProcessProvidersFunction, Provider} from '../../di/interface/provider';
import {providersResolver} from '../di_setup';
import {DirectiveDef} from '../interfaces/definition';

/**
 * This feature resolves the providers of a directive (or component),
 * and publish them into the DI system, making it visible to others for injection.
 *
 * 此特性会解析指令（或组件）的提供者，并将它们发布到 DI 系统中，使其对其他人可见以进行注入。
 *
 * For example:
 *
 * 例如：
 *
 * ```ts
 * class ComponentWithProviders {
 *   constructor(private greeter: GreeterDE) {}
 *
 *   static ɵcmp = defineComponent({
 *     type: ComponentWithProviders,
 *     selectors: [['component-with-providers']],
 *    factory: () => new ComponentWithProviders(directiveInject(GreeterDE as any)),
 *    decls: 1,
 *    vars: 1,
 *    template: function(fs: RenderFlags, ctx: ComponentWithProviders) {
 *      if (fs & RenderFlags.Create) {
 *        ɵɵtext(0);
 *      }
 *      if (fs & RenderFlags.Update) {
 *        ɵɵtextInterpolate(ctx.greeter.greet());
 *      }
 *    },
 *    features: [ɵɵProvidersFeature([GreeterDE])]
 *  });
 * }
 * ```
 *
 * @param definition
 * @codeGenApi
 */
export function ɵɵProvidersFeature<T>(providers: Provider[], viewProviders: Provider[] = []) {
  return (definition: DirectiveDef<T>) => {
    definition.providersResolver =
        (def: DirectiveDef<T>, processProvidersFn?: ProcessProvidersFunction) => {
          return providersResolver(
              def,                                                             //
              processProvidersFn ? processProvidersFn(providers) : providers,  //
              viewProviders);
        };
  };
}
