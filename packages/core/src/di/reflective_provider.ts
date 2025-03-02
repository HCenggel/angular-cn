/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {Type} from '../interface/type';

import {resolveForwardRef} from './forward_ref';
import {InjectionToken} from './injection_token';
import {ClassProvider, ExistingProvider, FactoryProvider, Provider, TypeProvider, ValueProvider} from './interface/provider';
import {getReflect} from './jit/util';
import {Inject, Optional, Self, SkipSelf} from './metadata';
import {invalidProviderError, mixingMultiProvidersWithRegularProvidersError, noAnnotationError} from './reflective_errors';
import {ReflectiveKey} from './reflective_key';


interface NormalizedProvider extends TypeProvider, ValueProvider, ClassProvider, ExistingProvider,
                                     FactoryProvider {}

/**
 * `Dependency` is used by the framework to extend DI.
 * This is internal to Angular and should not be used directly.
 *
 * 框架使用 `Dependency` 来扩展 DI。这是 Angular 的内部，不应直接使用。
 *
 */
export class ReflectiveDependency {
  constructor(
      public key: ReflectiveKey, public optional: boolean, public visibility: Self|SkipSelf|null) {}

  static fromKey(key: ReflectiveKey): ReflectiveDependency {
    return new ReflectiveDependency(key, false, null);
  }
}

const _EMPTY_LIST: any[] = [];

/**
 * An internal resolved representation of a `Provider` used by the `Injector`.
 *
 * 供 `Injector` 使用的 `Provider` 的内部解析表示形式。
 *
 * @usageNotes
 *
 * This is usually created automatically by `Injector.resolveAndCreate`.
 *
 * 这通常是由 `Injector.resolveAndCreate` 自动创建的。
 *
 * It can be created manually, as follows:
 *
 * 也可以手动创建，如下所示：
 *
 * ### Example
 *
 * ### 例子
 *
 * ```typescript
 * var resolvedProviders = Injector.resolve([{ provide: 'message', useValue: 'Hello' }]);
 * var injector = Injector.fromResolvedProviders(resolvedProviders);
 *
 * expect(injector.get('message')).toEqual('Hello');
 * ```
 *
 * @publicApi
 */
export interface ResolvedReflectiveProvider {
  /**
   * A key, usually a `Type<any>`.
   *
   * 一个 Key，通常是 `Type<any>` 。
   *
   */
  key: ReflectiveKey;

  /**
   * Factory function which can return an instance of an object represented by a key.
   *
   * 可以返回 Key 表示的对象实例的工厂函数。
   *
   */
  resolvedFactories: ResolvedReflectiveFactory[];

  /**
   * Indicates if the provider is a multi-provider or a regular provider.
   *
   * 指示提供者是多重提供者还是常规提供者。
   *
   */
  multiProvider: boolean;
}

export class ResolvedReflectiveProvider_ implements ResolvedReflectiveProvider {
  readonly resolvedFactory: ResolvedReflectiveFactory;

  constructor(
      public key: ReflectiveKey, public resolvedFactories: ResolvedReflectiveFactory[],
      public multiProvider: boolean) {
    this.resolvedFactory = this.resolvedFactories[0];
  }
}

/**
 * An internal resolved representation of a factory function created by resolving `Provider`.
 *
 * `Provider` 创建的工厂函数的内部解析表示形式。
 *
 * @publicApi
 */
export class ResolvedReflectiveFactory {
  constructor(
      /**
       * Factory function which can return an instance of an object represented by a key.
       */
      public factory: Function,

      /**
       * Arguments (dependencies) to the `factory` function.
       */
      public dependencies: ReflectiveDependency[]) {}
}


/**
 * Resolve a single provider.
 *
 * 解析单个提供程序。
 *
 */
function resolveReflectiveFactory(provider: NormalizedProvider): ResolvedReflectiveFactory {
  let factoryFn: Function;
  let resolvedDeps: ReflectiveDependency[];
  if (provider.useClass) {
    const useClass = resolveForwardRef(provider.useClass);
    factoryFn = getReflect().factory(useClass);
    resolvedDeps = _dependenciesFor(useClass);
  } else if (provider.useExisting) {
    factoryFn = (aliasInstance: any) => aliasInstance;
    resolvedDeps = [ReflectiveDependency.fromKey(ReflectiveKey.get(provider.useExisting))];
  } else if (provider.useFactory) {
    factoryFn = provider.useFactory;
    resolvedDeps = constructDependencies(provider.useFactory, provider.deps);
  } else {
    factoryFn = () => provider.useValue;
    resolvedDeps = _EMPTY_LIST;
  }
  return new ResolvedReflectiveFactory(factoryFn, resolvedDeps);
}

/**
 * Converts the `Provider` into `ResolvedProvider`.
 *
 * 将 `Provider` 转换为 `ResolvedProvider` 。
 *
 * `Injector` internally only uses `ResolvedProvider`, `Provider` contains convenience provider
 * syntax.
 *
 * `Injector` 在内部仅使用 `ResolvedProvider` ，`Provider` 包含便利提供者语法。
 *
 */
function resolveReflectiveProvider(provider: NormalizedProvider): ResolvedReflectiveProvider {
  return new ResolvedReflectiveProvider_(
      ReflectiveKey.get(provider.provide), [resolveReflectiveFactory(provider)],
      provider.multi || false);
}

/**
 * Resolve a list of Providers.
 *
 * 解析 Providers 列表。
 *
 */
export function resolveReflectiveProviders(providers: Provider[]): ResolvedReflectiveProvider[] {
  const normalized = _normalizeProviders(providers, []);
  const resolved = normalized.map(resolveReflectiveProvider);
  const resolvedProviderMap = mergeResolvedReflectiveProviders(resolved, new Map());
  return Array.from(resolvedProviderMap.values());
}

/**
 * Merges a list of ResolvedProviders into a list where each key is contained exactly once and
 * multi providers have been merged.
 *
 * 将 ResolvedProviders 列表合并到一个列表中，其中每个键都仅包含一次，并且多提供程序已合并。
 *
 */
export function mergeResolvedReflectiveProviders(
    providers: ResolvedReflectiveProvider[],
    normalizedProvidersMap: Map<number, ResolvedReflectiveProvider>):
    Map<number, ResolvedReflectiveProvider> {
  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    const existing = normalizedProvidersMap.get(provider.key.id);
    if (existing) {
      if (provider.multiProvider !== existing.multiProvider) {
        throw mixingMultiProvidersWithRegularProvidersError(existing, provider);
      }
      if (provider.multiProvider) {
        for (let j = 0; j < provider.resolvedFactories.length; j++) {
          existing.resolvedFactories.push(provider.resolvedFactories[j]);
        }
      } else {
        normalizedProvidersMap.set(provider.key.id, provider);
      }
    } else {
      let resolvedProvider: ResolvedReflectiveProvider;
      if (provider.multiProvider) {
        resolvedProvider = new ResolvedReflectiveProvider_(
            provider.key, provider.resolvedFactories.slice(), provider.multiProvider);
      } else {
        resolvedProvider = provider;
      }
      normalizedProvidersMap.set(provider.key.id, resolvedProvider);
    }
  }
  return normalizedProvidersMap;
}

function _normalizeProviders(
    providers: Provider[], res: NormalizedProvider[]): NormalizedProvider[] {
  providers.forEach(b => {
    if (b instanceof Type) {
      res.push({provide: b, useClass: b} as NormalizedProvider);

    } else if (b && typeof b == 'object' && (b as any).provide !== undefined) {
      res.push(b as NormalizedProvider);

    } else if (Array.isArray(b)) {
      _normalizeProviders(b, res);

    } else {
      throw invalidProviderError(b);
    }
  });

  return res;
}

export function constructDependencies(
    typeOrFunc: any, dependencies?: any[]): ReflectiveDependency[] {
  if (!dependencies) {
    return _dependenciesFor(typeOrFunc);
  } else {
    const params: any[][] = dependencies.map(t => [t]);
    return dependencies.map(t => _extractToken(typeOrFunc, t, params));
  }
}

function _dependenciesFor(typeOrFunc: any): ReflectiveDependency[] {
  const params = getReflect().parameters(typeOrFunc);

  if (!params) return [];
  if (params.some(p => p == null)) {
    throw noAnnotationError(typeOrFunc, params);
  }
  return params.map(p => _extractToken(typeOrFunc, p, params));
}

function _extractToken(
    typeOrFunc: any, metadata: any[]|any, params: any[][]): ReflectiveDependency {
  let token: any = null;
  let optional = false;

  if (!Array.isArray(metadata)) {
    if (metadata instanceof Inject) {
      return _createDependency(metadata.token, optional, null);
    } else {
      return _createDependency(metadata, optional, null);
    }
  }

  let visibility: Self|SkipSelf|null = null;

  for (let i = 0; i < metadata.length; ++i) {
    const paramMetadata = metadata[i];

    if (paramMetadata instanceof Type) {
      token = paramMetadata;

    } else if (paramMetadata instanceof Inject) {
      token = paramMetadata.token;

    } else if (paramMetadata instanceof Optional) {
      optional = true;

    } else if (paramMetadata instanceof Self || paramMetadata instanceof SkipSelf) {
      visibility = paramMetadata;
    } else if (paramMetadata instanceof InjectionToken) {
      token = paramMetadata;
    }
  }

  token = resolveForwardRef(token);

  if (token != null) {
    return _createDependency(token, optional, visibility);
  } else {
    throw noAnnotationError(typeOrFunc, params);
  }
}

function _createDependency(
    token: any, optional: boolean, visibility: Self|SkipSelf|null): ReflectiveDependency {
  return new ReflectiveDependency(ReflectiveKey.get(token), optional, visibility);
}
