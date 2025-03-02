/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {ErrorCode} from './error_code';

/**
 * Contains a set of error messages that have detailed guides at angular.io.
 * Full list of available error guides can be found at <https://angular.io/errors>
 *
 * 包含一组错误消息，这些消息在 angular.io
 * 上有详细指南。可用错误指南的完整列表可在<https://angular.io/errors>找到
 *
 */
export const COMPILER_ERRORS_WITH_GUIDES = new Set([
  ErrorCode.DECORATOR_ARG_NOT_LITERAL,
  ErrorCode.IMPORT_CYCLE_DETECTED,
  ErrorCode.PARAM_MISSING_TOKEN,
  ErrorCode.SCHEMA_INVALID_ELEMENT,
  ErrorCode.SCHEMA_INVALID_ATTRIBUTE,
  ErrorCode.MISSING_REFERENCE_TARGET,
  ErrorCode.COMPONENT_INVALID_SHADOW_DOM_SELECTOR,
  ErrorCode.WARN_NGMODULE_ID_UNNECESSARY,
]);
