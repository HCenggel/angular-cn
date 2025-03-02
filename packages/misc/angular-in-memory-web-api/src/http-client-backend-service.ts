/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {XhrFactory} from '@angular/common';
import {HttpBackend, HttpEvent, HttpHeaders, HttpParams, HttpRequest, HttpResponse, HttpXhrBackend} from '@angular/common/http';
import {Inject, Injectable, Optional} from '@angular/core';
import {Observable} from 'rxjs';
import {map} from 'rxjs/operators';

import {BackendService} from './backend-service';
import {STATUS} from './http-status-codes';
import {InMemoryBackendConfig, InMemoryBackendConfigArgs, InMemoryDbService, ResponseOptions} from './interfaces';

/**
 * For Angular `HttpClient` simulate the behavior of a RESTy web api
 * backed by the simple in-memory data store provided by the injected `InMemoryDbService`.
 * Conforms mostly to behavior described here:
 * <https://www.restapitutorial.com/lessons/httpmethods.html>
 *
 * 对于 Angular `HttpClient` ，模拟由注入的 `InMemoryDbService` 提供的简单内存数据存储支持的 RESTy
 * Web api 的行为。主要符合此处描述的行为：
 * <https://www.restapitutorial.com/lessons/httpmethods.html>
 *
 * ### Usage
 *
 * ### 用法
 *
 * Create an in-memory data store class that implements `InMemoryDbService`.
 * Call `config` static method with this service class and optional configuration object:
 *
 * 创建一个实现 `InMemoryDbService` 的内存数据存储类。使用此服务类和可选的配置对象调用 `config`
 * 静态方法：
 *
 * ```
 * // other imports
 * import { HttpClientModule } from '@angular/common/http';
 * import { HttpClientInMemoryWebApiModule } from 'angular-in-memory-web-api';
 *
 * import { InMemHeroService, inMemConfig } from '../api/in-memory-hero.service';
 * ```
 *
 * @NgModule({
 *  imports: [
 *    HttpModule,
 *    HttpClientInMemoryWebApiModule.forRoot(InMemHeroService, inMemConfig),
 *    ...
 *  ],
 *  ...
 * })
 * export class AppModule { ... }
 * ```
 */
@Injectable()
export class HttpClientBackendService extends BackendService implements HttpBackend {
  constructor(
      inMemDbService: InMemoryDbService,
      @Inject(InMemoryBackendConfig) @Optional() config: InMemoryBackendConfigArgs,
      private xhrFactory: XhrFactory) {
    super(inMemDbService, config);
  }

  handle(req: HttpRequest<any>): Observable<HttpEvent<any>> {
    try {
      return this.handleRequest(req);

    } catch (error) {
      const err = (error as Error).message || error;
      const resOptions =
          this.createErrorResponseOptions(req.url, STATUS.INTERNAL_SERVER_ERROR, `${err}`);
      return this.createResponse$(() => resOptions);
    }
  }

  protected override getJsonBody(req: HttpRequest<any>): any {
    return req.body;
  }

  protected override getRequestMethod(req: HttpRequest<any>): string {
    return (req.method || 'get').toLowerCase();
  }

  protected override createHeaders(headers: {[index: string]: string;}): HttpHeaders {
    return new HttpHeaders(headers);
  }

  protected override createQueryMap(search: string): Map<string, string[]> {
    const map = new Map<string, string[]>();
    if (search) {
      const params = new HttpParams({fromString: search});
      params.keys().forEach(p => map.set(p, params.getAll(p) || []));
    }
    return map;
  }

  protected override createResponse$fromResponseOptions$(resOptions$: Observable<ResponseOptions>):
      Observable<HttpResponse<any>> {
    return resOptions$.pipe(map(opts => new HttpResponse<any>(opts)));
  }

  protected override createPassThruBackend() {
    try {
      return new HttpXhrBackend(this.xhrFactory);
    } catch (ex: any) {
      ex.message = 'Cannot create passThru404 backend; ' + (ex.message || '');
      throw ex;
    }
  }
}
