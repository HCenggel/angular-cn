/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {Location} from '@angular/common';
import {provideLocationMocks} from '@angular/common/testing';
import {Compiler, Injector, ModuleWithProviders, NgModule, Optional} from '@angular/core';
import {ChildrenOutletContexts, ExtraOptions, NoPreloading, Route, Router, ROUTER_CONFIGURATION, RouteReuseStrategy, RouterModule, ROUTES, Routes, TitleStrategy, UrlHandlingStrategy, UrlSerializer, ɵassignExtraOptionsToRouter as assignExtraOptionsToRouter, ɵflatten as flatten, ɵROUTER_PROVIDERS as ROUTER_PROVIDERS, ɵwithPreloading as withPreloading} from '@angular/router';

import {EXTRA_ROUTER_TESTING_PROVIDERS} from './extra_router_testing_providers';

function isUrlHandlingStrategy(opts: ExtraOptions|
                               UrlHandlingStrategy): opts is UrlHandlingStrategy {
  // This property check is needed because UrlHandlingStrategy is an interface and doesn't exist at
  // runtime.
  return 'shouldProcessUrl' in opts;
}

/**
 * Router setup factory function used for testing. Only used internally to keep the factory that's
 * marked as publicApi cleaner (i.e. not having _both_ `TitleStrategy` and `DefaultTitleStrategy`).
 *
 * 用于测试的路由器设置工厂函数。仅在内部使用以保持标记为 publicApi 的工厂更清洁（即不 _ 具有
 * _`TitleStrategy` 和 `DefaultTitleStrategy`）。
 *
 */
export function setupTestingRouterInternal(
    urlSerializer: UrlSerializer,
    contexts: ChildrenOutletContexts,
    location: Location,
    compiler: Compiler,
    injector: Injector,
    routes: Route[][],
    titleStrategy: TitleStrategy,
    opts?: ExtraOptions|UrlHandlingStrategy,
    urlHandlingStrategy?: UrlHandlingStrategy,
    routeReuseStrategy?: RouteReuseStrategy,
) {
  return setupTestingRouter(
      urlSerializer, contexts, location, compiler, injector, routes, opts, urlHandlingStrategy,
      routeReuseStrategy, titleStrategy);
}

/**
 * Router setup factory function used for testing.
 *
 * 用于测试的路由器设置工厂函数。
 *
 * @publicApi
 */
export function setupTestingRouter(
    urlSerializer: UrlSerializer, contexts: ChildrenOutletContexts, location: Location,
    compiler: Compiler, injector: Injector, routes: Route[][],
    opts?: ExtraOptions|UrlHandlingStrategy|null, urlHandlingStrategy?: UrlHandlingStrategy,
    routeReuseStrategy?: RouteReuseStrategy, titleStrategy?: TitleStrategy) {
  const router =
      new Router(null!, urlSerializer, contexts, location, injector, compiler, flatten(routes));
  if (opts) {
    // Handle deprecated argument ordering.
    if (isUrlHandlingStrategy(opts)) {
      router.urlHandlingStrategy = opts;
    } else {
      // Handle ExtraOptions
      assignExtraOptionsToRouter(opts, router);
    }
  }

  if (urlHandlingStrategy) {
    router.urlHandlingStrategy = urlHandlingStrategy;
  }

  if (routeReuseStrategy) {
    router.routeReuseStrategy = routeReuseStrategy;
  }

  router.titleStrategy = titleStrategy;

  return router;
}

/**
 * @description
 *
 * Sets up the router to be used for testing.
 *
 * 设置要用于测试的路由器。
 *
 * The modules sets up the router to be used for testing.
 * It provides spy implementations of `Location` and `LocationStrategy`.
 *
 * 这些模块会设置用于测试的路由器。它提供 `Location`、`LocationStrategy` 和 `LocationStrategy`
 * 的间谍实现。
 *
 * @usageNotes
 *
 * ### Example
 *
 * ### 例子
 *
 * ```
 * beforeEach(() => {
 *   TestBed.configureTestingModule({
 *     imports: [
 *       RouterTestingModule.withRoutes(
 *         [{path: '', component: BlankCmp}, {path: 'simple', component: SimpleCmp}]
 *       )
 *     ]
 *   });
 * });
 * ```
 *
 * @publicApi
 */
@NgModule({
  exports: [RouterModule],
  providers: [
    ROUTER_PROVIDERS,
    EXTRA_ROUTER_TESTING_PROVIDERS,
    provideLocationMocks(),
    {
      provide: Router,
      useFactory: setupTestingRouterInternal,
      deps: [
        UrlSerializer,
        ChildrenOutletContexts,
        Location,
        Compiler,
        Injector,
        ROUTES,
        TitleStrategy,
        ROUTER_CONFIGURATION,
        [UrlHandlingStrategy, new Optional()],
        [RouteReuseStrategy, new Optional()],
      ]
    },
    withPreloading(NoPreloading).ɵproviders,
    {provide: ROUTES, multi: true, useValue: []},
  ]
})
export class RouterTestingModule {
  static withRoutes(routes: Routes, config?: ExtraOptions):
      ModuleWithProviders<RouterTestingModule> {
    return {
      ngModule: RouterTestingModule,
      providers: [
        {provide: ROUTES, multi: true, useValue: routes},
        {provide: ROUTER_CONFIGURATION, useValue: config ? config : {}},
      ]
    };
  }
}
