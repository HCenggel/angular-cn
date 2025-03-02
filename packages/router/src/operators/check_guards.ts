/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {EnvironmentInjector, ProviderToken} from '@angular/core';
import {concat, defer, from, MonoTypeOperatorFunction, Observable, of, OperatorFunction, pipe} from 'rxjs';
import {concatMap, first, map, mergeMap, tap} from 'rxjs/operators';

import {ActivationStart, ChildActivationStart, Event} from '../events';
import {CanActivateChild, CanActivateChildFn, CanActivateFn, Route} from '../models';
import {redirectingNavigationError} from '../navigation_canceling_error';
import {NavigationTransition} from '../navigation_transition';
import {ActivatedRouteSnapshot, RouterStateSnapshot} from '../router_state';
import {isUrlTree, UrlSegment, UrlSerializer, UrlTree} from '../url_tree';
import {wrapIntoObservable} from '../utils/collection';
import {getClosestRouteInjector} from '../utils/config';
import {CanActivate, CanDeactivate, getCanActivateChild, getTokenOrFunctionIdentity} from '../utils/preactivation';
import {isBoolean, isCanActivate, isCanActivateChild, isCanDeactivate, isCanLoad, isCanMatch} from '../utils/type_guards';

import {prioritizedGuardValue} from './prioritized_guard_value';

export function checkGuards(injector: EnvironmentInjector, forwardEvent?: (evt: Event) => void):
    MonoTypeOperatorFunction<NavigationTransition> {
  return mergeMap(t => {
    const {targetSnapshot, currentSnapshot, guards: {canActivateChecks, canDeactivateChecks}} = t;
    if (canDeactivateChecks.length === 0 && canActivateChecks.length === 0) {
      return of({...t, guardsResult: true});
    }

    return runCanDeactivateChecks(canDeactivateChecks, targetSnapshot!, currentSnapshot, injector)
        .pipe(
            mergeMap(canDeactivate => {
              return canDeactivate && isBoolean(canDeactivate) ?
                  runCanActivateChecks(targetSnapshot!, canActivateChecks, injector, forwardEvent) :
                  of(canDeactivate);
            }),
            map(guardsResult => ({...t, guardsResult})));
  });
}

function runCanDeactivateChecks(
    checks: CanDeactivate[], futureRSS: RouterStateSnapshot, currRSS: RouterStateSnapshot,
    injector: EnvironmentInjector) {
  return from(checks).pipe(
      mergeMap(
          check => runCanDeactivate(check.component, check.route, currRSS, futureRSS, injector)),
      first(result => {
        return result !== true;
      }, true as boolean | UrlTree));
}

function runCanActivateChecks(
    futureSnapshot: RouterStateSnapshot, checks: CanActivate[], injector: EnvironmentInjector,
    forwardEvent?: (evt: Event) => void) {
  return from(checks).pipe(
      concatMap((check: CanActivate) => {
        return concat(
            fireChildActivationStart(check.route.parent, forwardEvent),
            fireActivationStart(check.route, forwardEvent),
            runCanActivateChild(futureSnapshot, check.path, injector),
            runCanActivate(futureSnapshot, check.route, injector));
      }),
      first(result => {
        return result !== true;
      }, true as boolean | UrlTree));
}

/**
 * This should fire off `ActivationStart` events for each route being activated at this
 * level.
 * In other words, if you're activating `a` and `b` below, `path` will contain the
 * `ActivatedRouteSnapshot`s for both and we will fire `ActivationStart` for both. Always
 * return
 * `true` so checks continue to run.
 *
 * 这应该为在此级别激活的每个路由触发 `ActivationStart` 事件。换句话说，如果你要激活下面 `a` 和 `b`
 * ，`path` 将包含两者的 `ActivatedRouteSnapshot` ，我们将为两者触发 `ActivationStart` 。始终返回
 * `true` ，以便检查继续运行。
 *
 */
function fireActivationStart(
    snapshot: ActivatedRouteSnapshot|null,
    forwardEvent?: (evt: Event) => void): Observable<boolean> {
  if (snapshot !== null && forwardEvent) {
    forwardEvent(new ActivationStart(snapshot));
  }
  return of(true);
}

/**
 * This should fire off `ChildActivationStart` events for each route being activated at this
 * level.
 * In other words, if you're activating `a` and `b` below, `path` will contain the
 * `ActivatedRouteSnapshot`s for both and we will fire `ChildActivationStart` for both. Always
 * return
 * `true` so checks continue to run.
 *
 * 这应该为在此级别激活的每个路由触发 `ChildActivationStart` 事件。换句话说，如果你要激活下面 `a` 和
 * `b` ，则 `path` 将包含两者的 `ActivatedRouteSnapshot` ，我们将为两者触发 `ChildActivationStart`
 * 。始终返回 `true` ，以便检查继续运行。
 *
 */
function fireChildActivationStart(
    snapshot: ActivatedRouteSnapshot|null,
    forwardEvent?: (evt: Event) => void): Observable<boolean> {
  if (snapshot !== null && forwardEvent) {
    forwardEvent(new ChildActivationStart(snapshot));
  }
  return of(true);
}

function runCanActivate(
    futureRSS: RouterStateSnapshot, futureARS: ActivatedRouteSnapshot,
    injector: EnvironmentInjector): Observable<boolean|UrlTree> {
  const canActivate = futureARS.routeConfig ? futureARS.routeConfig.canActivate : null;
  if (!canActivate || canActivate.length === 0) return of(true);

  const canActivateObservables =
      canActivate.map((canActivate: CanActivateFn|ProviderToken<unknown>) => {
        return defer(() => {
          const closestInjector = getClosestRouteInjector(futureARS) ?? injector;
          const guard = getTokenOrFunctionIdentity<CanActivate>(canActivate, closestInjector);
          const guardVal = isCanActivate(guard) ?
              guard.canActivate(futureARS, futureRSS) :
              closestInjector.runInContext(() => (guard as CanActivateFn)(futureARS, futureRSS));
          return wrapIntoObservable(guardVal).pipe(first());
        });
      });
  return of(canActivateObservables).pipe(prioritizedGuardValue());
}

function runCanActivateChild(
    futureRSS: RouterStateSnapshot, path: ActivatedRouteSnapshot[],
    injector: EnvironmentInjector): Observable<boolean|UrlTree> {
  const futureARS = path[path.length - 1];

  const canActivateChildGuards = path.slice(0, path.length - 1)
                                     .reverse()
                                     .map(p => getCanActivateChild(p))
                                     .filter(_ => _ !== null);

  const canActivateChildGuardsMapped = canActivateChildGuards.map((d: any) => {
    return defer(() => {
      const guardsMapped =
          d.guards.map((canActivateChild: CanActivateChildFn|ProviderToken<unknown>) => {
            const closestInjector = getClosestRouteInjector(d.node) ?? injector;
            const guard =
                getTokenOrFunctionIdentity<CanActivateChild>(canActivateChild, closestInjector);
            const guardVal = isCanActivateChild(guard) ?
                guard.canActivateChild(futureARS, futureRSS) :
                closestInjector.runInContext(() => guard(futureARS, futureRSS));
            return wrapIntoObservable(guardVal).pipe(first());
          });
      return of(guardsMapped).pipe(prioritizedGuardValue());
    });
  });
  return of(canActivateChildGuardsMapped).pipe(prioritizedGuardValue());
}

function runCanDeactivate(
    component: Object|null, currARS: ActivatedRouteSnapshot, currRSS: RouterStateSnapshot,
    futureRSS: RouterStateSnapshot, injector: EnvironmentInjector): Observable<boolean|UrlTree> {
  const canDeactivate = currARS && currARS.routeConfig ? currARS.routeConfig.canDeactivate : null;
  if (!canDeactivate || canDeactivate.length === 0) return of(true);
  const canDeactivateObservables = canDeactivate.map((c: any) => {
    const closestInjector = getClosestRouteInjector(currARS) ?? injector;
    const guard = getTokenOrFunctionIdentity<any>(c, closestInjector);
    const guardVal = isCanDeactivate(guard) ?
        guard.canDeactivate(component, currARS, currRSS, futureRSS) :
        closestInjector.runInContext<boolean|UrlTree>(
            () => guard(component, currARS, currRSS, futureRSS));
    return wrapIntoObservable(guardVal).pipe(first());
  });
  return of(canDeactivateObservables).pipe(prioritizedGuardValue());
}

export function runCanLoadGuards(
    injector: EnvironmentInjector, route: Route, segments: UrlSegment[],
    urlSerializer: UrlSerializer): Observable<boolean> {
  const canLoad = route.canLoad;
  if (canLoad === undefined || canLoad.length === 0) {
    return of(true);
  }

  const canLoadObservables = canLoad.map((injectionToken: any) => {
    const guard = getTokenOrFunctionIdentity<any>(injectionToken, injector);
    const guardVal = isCanLoad(guard) ?
        guard.canLoad(route, segments) :
        injector.runInContext<boolean|UrlTree>(() => guard(route, segments));
    return wrapIntoObservable(guardVal);
  });

  return of(canLoadObservables)
      .pipe(
          prioritizedGuardValue(),
          redirectIfUrlTree(urlSerializer),
      );
}

function redirectIfUrlTree(urlSerializer: UrlSerializer):
    OperatorFunction<UrlTree|boolean, boolean> {
  return pipe(
      tap((result: UrlTree|boolean) => {
        if (!isUrlTree(result)) return;

        throw redirectingNavigationError(urlSerializer, result);
      }),
      map(result => result === true),
  );
}

export function runCanMatchGuards(
    injector: EnvironmentInjector, route: Route, segments: UrlSegment[],
    urlSerializer: UrlSerializer): Observable<boolean> {
  const canMatch = route.canMatch;
  if (!canMatch || canMatch.length === 0) return of(true);

  const canMatchObservables = canMatch.map(injectionToken => {
    const guard = getTokenOrFunctionIdentity(injectionToken, injector);
    const guardVal = isCanMatch(guard) ?
        guard.canMatch(route, segments) :
        injector.runInContext<boolean|UrlTree>(() => guard(route, segments));
    return wrapIntoObservable(guardVal);
  });

  return of(canMatchObservables)
      .pipe(
          prioritizedGuardValue(),
          redirectIfUrlTree(urlSerializer),
      );
}
