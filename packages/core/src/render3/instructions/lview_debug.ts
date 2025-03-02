/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {Injector} from '../../di/injector';
import {Type} from '../../interface/type';
import {SchemaMetadata} from '../../metadata/schema';
import {Sanitizer} from '../../sanitization/sanitizer';
import {KeyValueArray} from '../../util/array_utils';
import {assertDefined} from '../../util/assert';
import {createNamedArrayType} from '../../util/named_array_type';
import {assertNodeInjector} from '../assert';
import {getInjectorIndex, getParentInjectorLocation} from '../di';
import {CONTAINER_HEADER_OFFSET, HAS_TRANSPLANTED_VIEWS, LContainer, MOVED_VIEWS, NATIVE} from '../interfaces/container';
import {ComponentTemplate, DirectiveDef, DirectiveDefList, PipeDefList, ViewQueriesFunction} from '../interfaces/definition';
import {NO_PARENT_INJECTOR, NodeInjectorOffset} from '../interfaces/injector';
import {AttributeMarker, InsertBeforeIndex, PropertyAliases, TConstants, TContainerNode, TElementNode, TNode as ITNode, TNodeFlags, TNodeProviderIndexes, TNodeType, toTNodeTypeAsString} from '../interfaces/node';
import {SelectorFlags} from '../interfaces/projection';
import {LQueries, TQueries} from '../interfaces/query';
import {Renderer, RendererFactory} from '../interfaces/renderer';
import {RComment, RElement, RNode} from '../interfaces/renderer_dom';
import {getTStylingRangeNext, getTStylingRangeNextDuplicate, getTStylingRangePrev, getTStylingRangePrevDuplicate, TStylingKey, TStylingRange} from '../interfaces/styling';
import {CHILD_HEAD, CHILD_TAIL, CLEANUP, CONTEXT, DebugNode, DECLARATION_VIEW, DestroyHookData, FLAGS, HEADER_OFFSET, HookData, HOST, HostBindingOpCodes, ID, INJECTOR, LContainerDebug as ILContainerDebug, LView, LViewDebug as ILViewDebug, LViewDebugRange, LViewDebugRangeContent, LViewFlags, NEXT, NodeInjectorDebug, PARENT, QUERIES, RENDERER, RENDERER_FACTORY, SANITIZER, T_HOST, TData, TView as ITView, TVIEW, TView, TViewType, TViewTypeAsString} from '../interfaces/view';
import {attachDebugObject} from '../util/debug_utils';
import {getParentInjectorIndex, getParentInjectorView} from '../util/injector_utils';
import {unwrapRNode} from '../util/view_utils';

/*
 * This file contains conditionally attached classes which provide human readable (debug) level
 * information for `LView`, `LContainer` and other internal data structures. These data structures
 * are stored internally as array which makes it very difficult during debugging to reason about the
 * current state of the system.
 *
 * Patching the array with extra property does change the array's hidden class' but it does not
 * change the cost of access, therefore this patching should not have significant if any impact in
 * `ngDevMode` mode. (see: https://jsperf.com/array-vs-monkey-patch-array)
 *
 * So instead of seeing:
 * ```
 * Array(30) [Object, 659, null, …]
 * ```
 *
 * You get to see:
 * ```
 * LViewDebug {
 *   views: [...],
 *   flags: {attached: true, ...}
 *   nodes: [
 *     {html: '<div id="123">', ..., nodes: [
 *       {html: '<span>', ..., nodes: null}
 *     ]}
 *   ]
 * }
 * ```
 */

let LVIEW_COMPONENT_CACHE: Map<string|null, Array<any>>|undefined;
let LVIEW_EMBEDDED_CACHE: Map<string|null, Array<any>>|undefined;
let LVIEW_ROOT: Array<any>|undefined;
let LVIEW_COMPONENT: Array<any>|undefined;
let LVIEW_EMBEDDED: Array<any>|undefined;

interface TViewDebug extends ITView {
  type: TViewType;
}

/**
 * This function clones a blueprint and creates LView.
 *
 * 此函数会克隆蓝图并创建 LView。
 *
 * Simple slice will keep the same type, and we need it to be LView
 *
 * 简单切片将保持相同的类型，我们需要它是 LView
 *
 */
export function cloneToLViewFromTViewBlueprint<T>(tView: TView): LView<T> {
  const debugTView = tView as TViewDebug;
  const lView = getLViewToClone(debugTView.type, tView.template && tView.template.name);
  return lView.concat(tView.blueprint) as any;
}

class LRootView extends Array {}
class LComponentView extends Array {}
class LEmbeddedView extends Array {}

function getLViewToClone(type: TViewType, name: string|null): Array<any> {
  switch (type) {
    case TViewType.Root:
      if (LVIEW_ROOT === undefined) LVIEW_ROOT = new LRootView();
      return LVIEW_ROOT;
    case TViewType.Component:
      if (!ngDevMode || !ngDevMode.namedConstructors) {
        if (LVIEW_COMPONENT === undefined) LVIEW_COMPONENT = new LComponentView();
        return LVIEW_COMPONENT;
      }
      if (LVIEW_COMPONENT_CACHE === undefined) LVIEW_COMPONENT_CACHE = new Map();
      let componentArray = LVIEW_COMPONENT_CACHE.get(name);
      if (componentArray === undefined) {
        componentArray = new (createNamedArrayType('LComponentView' + nameSuffix(name)))();
        LVIEW_COMPONENT_CACHE.set(name, componentArray);
      }
      return componentArray;
    case TViewType.Embedded:
      if (!ngDevMode || !ngDevMode.namedConstructors) {
        if (LVIEW_EMBEDDED === undefined) LVIEW_EMBEDDED = new LEmbeddedView();
        return LVIEW_EMBEDDED;
      }
      if (LVIEW_EMBEDDED_CACHE === undefined) LVIEW_EMBEDDED_CACHE = new Map();
      let embeddedArray = LVIEW_EMBEDDED_CACHE.get(name);
      if (embeddedArray === undefined) {
        embeddedArray = new (createNamedArrayType('LEmbeddedView' + nameSuffix(name)))();
        LVIEW_EMBEDDED_CACHE.set(name, embeddedArray);
      }
      return embeddedArray;
  }
}

function nameSuffix(text: string|null|undefined): string {
  if (text == null) return '';
  const index = text.lastIndexOf('_Template');
  return '_' + (index === -1 ? text : text.slice(0, index));
}

/**
 * This class is a debug version of Object literal so that we can have constructor name show up
 * in
 * debug tools in ngDevMode.
 *
 * 此类是 Object 文字的调试版本，因此我们可以在 ngDevMode 的调试工具中显示构造函数名称。
 *
 */
export const TViewConstructor = class TView implements ITView {
  constructor(
      public type: TViewType,
      public blueprint: LView,
      public template: ComponentTemplate<{}>|null,
      public queries: TQueries|null,
      public viewQuery: ViewQueriesFunction<{}>|null,
      public declTNode: ITNode|null,
      public data: TData,
      public bindingStartIndex: number,
      public expandoStartIndex: number,
      public hostBindingOpCodes: HostBindingOpCodes|null,
      public firstCreatePass: boolean,
      public firstUpdatePass: boolean,
      public staticViewQueries: boolean,
      public staticContentQueries: boolean,
      public preOrderHooks: HookData|null,
      public preOrderCheckHooks: HookData|null,
      public contentHooks: HookData|null,
      public contentCheckHooks: HookData|null,
      public viewHooks: HookData|null,
      public viewCheckHooks: HookData|null,
      public destroyHooks: DestroyHookData|null,
      public cleanup: any[]|null,
      public contentQueries: number[]|null,
      public components: number[]|null,
      public directiveRegistry: DirectiveDefList|null,
      public pipeRegistry: PipeDefList|null,
      public firstChild: ITNode|null,
      public schemas: SchemaMetadata[]|null,
      public consts: TConstants|null,
      public incompleteFirstPass: boolean,
      public _decls: number,
      public _vars: number,

  ) {}

  get template_(): string {
    const buf: string[] = [];
    processTNodeChildren(this.firstChild, buf);
    return buf.join('');
  }

  get type_(): string {
    return TViewTypeAsString[this.type] || `TViewType.?${this.type}?`;
  }
};

class TNode implements ITNode {
  constructor(
      public tView_: TView,                                                          //
      public type: TNodeType,                                                        //
      public index: number,                                                          //
      public insertBeforeIndex: InsertBeforeIndex,                                   //
      public injectorIndex: number,                                                  //
      public componentOffset: number,                                                //
      public directiveStart: number,                                                 //
      public directiveEnd: number,                                                   //
      public directiveStylingLast: number,                                           //
      public propertyBindings: number[]|null,                                        //
      public flags: TNodeFlags,                                                      //
      public providerIndexes: TNodeProviderIndexes,                                  //
      public value: string|null,                                                     //
      public attrs: (string|AttributeMarker|(string|SelectorFlags)[])[]|null,        //
      public mergedAttrs: (string|AttributeMarker|(string|SelectorFlags)[])[]|null,  //
      public localNames: (string|number)[]|null,                                     //
      public initialInputs: (string[]|null)[]|null|undefined,                        //
      public inputs: PropertyAliases|null,                                           //
      public outputs: PropertyAliases|null,                                          //
      public tViews: ITView|ITView[]|null,                                           //
      public next: ITNode|null,                                                      //
      public projectionNext: ITNode|null,                                            //
      public child: ITNode|null,                                                     //
      public parent: TElementNode|TContainerNode|null,                               //
      public projection: number|(ITNode|RNode[])[]|null,                             //
      public styles: string|null,                                                    //
      public stylesWithoutHost: string|null,                                         //
      public residualStyles: KeyValueArray<any>|undefined|null,                      //
      public classes: string|null,                                                   //
      public classesWithoutHost: string|null,                                        //
      public residualClasses: KeyValueArray<any>|undefined|null,                     //
      public classBindings: TStylingRange,                                           //
      public styleBindings: TStylingRange,                                           //
  ) {}

  /**
   * Return a human debug version of the set of `NodeInjector`s which will be consulted when
   * resolving tokens from this `TNode`.
   *
   * 返回 `NodeInjector` 集的人工调试版本，在解析来自此 `TNode` 的标记时将参考该版本。
   *
   * When debugging applications, it is often difficult to determine which `NodeInjector`s will be
   * consulted. This method shows a list of `DebugNode`s representing the `TNode`s which will be
   * consulted in order when resolving a token starting at this `TNode`.
   *
   * 调试应用程序时，通常很难确定将参考哪些 `NodeInjector` 。此方法显示了一个表示 `TNode` 的
   * `DebugNode` 列表，在解析从此 `TNode` 开始的标记时，将按顺序查阅这些列表。
   *
   * The original data is stored in `LView` and `TView` with a lot of offset indexes, and so it is
   * difficult to reason about.
   *
   * 原始数据存储在具有许多偏移索引的 `LView` 和 `TView` 中，因此很难推理。
   *
   * @param lView The `LView` instance for this `TNode`.
   *
   * 此 `TNode` 的 `LView` 实例。
   *
   */
  debugNodeInjectorPath(lView: LView): DebugNode[] {
    const path: DebugNode[] = [];
    let injectorIndex = getInjectorIndex(this, lView);
    if (injectorIndex === -1) {
      // Looks like the current `TNode` does not have `NodeInjector` associated with it => look for
      // parent NodeInjector.
      const parentLocation = getParentInjectorLocation(this, lView);
      if (parentLocation !== NO_PARENT_INJECTOR) {
        // We found a parent, so start searching from the parent location.
        injectorIndex = getParentInjectorIndex(parentLocation);
        lView = getParentInjectorView(parentLocation, lView);
      } else {
        // No parents have been found, so there are no `NodeInjector`s to consult.
      }
    }
    while (injectorIndex !== -1) {
      ngDevMode && assertNodeInjector(lView, injectorIndex);
      const tNode = lView[TVIEW].data[injectorIndex + NodeInjectorOffset.TNODE] as TNode;
      path.push(buildDebugNode(tNode, lView));
      const parentLocation = lView[injectorIndex + NodeInjectorOffset.PARENT];
      if (parentLocation === NO_PARENT_INJECTOR) {
        injectorIndex = -1;
      } else {
        injectorIndex = getParentInjectorIndex(parentLocation);
        lView = getParentInjectorView(parentLocation, lView);
      }
    }
    return path;
  }

  get type_(): string {
    return toTNodeTypeAsString(this.type) || `TNodeType.?${this.type}?`;
  }

  get flags_(): string {
    const flags: string[] = [];
    if (this.flags & TNodeFlags.hasClassInput) flags.push('TNodeFlags.hasClassInput');
    if (this.flags & TNodeFlags.hasContentQuery) flags.push('TNodeFlags.hasContentQuery');
    if (this.flags & TNodeFlags.hasStyleInput) flags.push('TNodeFlags.hasStyleInput');
    if (this.flags & TNodeFlags.hasHostBindings) flags.push('TNodeFlags.hasHostBindings');
    if (this.flags & TNodeFlags.isDirectiveHost) flags.push('TNodeFlags.isDirectiveHost');
    if (this.flags & TNodeFlags.isDetached) flags.push('TNodeFlags.isDetached');
    if (this.flags & TNodeFlags.isProjected) flags.push('TNodeFlags.isProjected');
    return flags.join('|');
  }

  get template_(): string {
    if (this.type & TNodeType.Text) return this.value!;
    const buf: string[] = [];
    const tagName = typeof this.value === 'string' && this.value || this.type_;
    buf.push('<', tagName);
    if (this.flags) {
      buf.push(' ', this.flags_);
    }
    if (this.attrs) {
      for (let i = 0; i < this.attrs.length;) {
        const attrName = this.attrs[i++];
        if (typeof attrName == 'number') {
          break;
        }
        const attrValue = this.attrs[i++];
        buf.push(' ', attrName as string, '="', attrValue as string, '"');
      }
    }
    buf.push('>');
    processTNodeChildren(this.child, buf);
    buf.push('</', tagName, '>');
    return buf.join('');
  }

  get styleBindings_(): DebugStyleBindings {
    return toDebugStyleBinding(this, false);
  }
  get classBindings_(): DebugStyleBindings {
    return toDebugStyleBinding(this, true);
  }

  get providerIndexStart_(): number {
    return this.providerIndexes & TNodeProviderIndexes.ProvidersStartIndexMask;
  }
  get providerIndexEnd_(): number {
    return this.providerIndexStart_ +
        (this.providerIndexes >>> TNodeProviderIndexes.CptViewProvidersCountShift);
  }
}
export const TNodeDebug = TNode;
export type TNodeDebug = TNode;

export interface DebugStyleBindings extends
    Array<KeyValueArray<any>|DebugStyleBinding|string|null> {}
export interface DebugStyleBinding {
  key: TStylingKey;
  index: number;
  isTemplate: boolean;
  prevDuplicate: boolean;
  nextDuplicate: boolean;
  prevIndex: number;
  nextIndex: number;
}

function toDebugStyleBinding(tNode: TNode, isClassBased: boolean): DebugStyleBindings {
  const tData = tNode.tView_.data;
  const bindings: DebugStyleBindings = [] as any;
  const range = isClassBased ? tNode.classBindings : tNode.styleBindings;
  const prev = getTStylingRangePrev(range);
  const next = getTStylingRangeNext(range);
  let isTemplate = next !== 0;
  let cursor = isTemplate ? next : prev;
  while (cursor !== 0) {
    const itemKey = tData[cursor] as TStylingKey;
    const itemRange = tData[cursor + 1] as TStylingRange;
    bindings.unshift({
      key: itemKey,
      index: cursor,
      isTemplate: isTemplate,
      prevDuplicate: getTStylingRangePrevDuplicate(itemRange),
      nextDuplicate: getTStylingRangeNextDuplicate(itemRange),
      nextIndex: getTStylingRangeNext(itemRange),
      prevIndex: getTStylingRangePrev(itemRange),
    });
    if (cursor === prev) isTemplate = false;
    cursor = getTStylingRangePrev(itemRange);
  }
  bindings.push((isClassBased ? tNode.residualClasses : tNode.residualStyles) || null);
  return bindings;
}

function processTNodeChildren(tNode: ITNode|null, buf: string[]) {
  while (tNode) {
    buf.push((tNode as any as {template_: string}).template_);
    tNode = tNode.next;
  }
}

class TViewData extends Array {}
let TVIEWDATA_EMPTY: unknown[];  // can't initialize here or it will not be tree shaken, because
                                 // `LView` constructor could have side-effects.
/**
 * This function clones a blueprint and creates TData.
 *
 * 此函数会克隆蓝图并创建 TData。
 *
 * Simple slice will keep the same type, and we need it to be TData
 *
 * 简单切片将保持相同的类型，我们需要它是 TData
 *
 */
export function cloneToTViewData(list: any[]): TData {
  if (TVIEWDATA_EMPTY === undefined) TVIEWDATA_EMPTY = new TViewData();
  return TVIEWDATA_EMPTY.concat(list) as any;
}

export class LViewBlueprint extends Array {}
export class MatchesArray extends Array {}
export class TViewComponents extends Array {}
export class TNodeLocalNames extends Array {}
export class TNodeInitialInputs extends Array {}
export class LCleanup extends Array {}
export class TCleanup extends Array {}

export function attachLViewDebug(lView: LView) {
  attachDebugObject(lView, new LViewDebug(lView));
}

export function attachLContainerDebug(lContainer: LContainer) {
  attachDebugObject(lContainer, new LContainerDebug(lContainer));
}

export function toDebug<T>(obj: LView<T>): ILViewDebug<T>;
export function toDebug<T>(obj: LView<T>|null): ILViewDebug<T>|null;
export function toDebug<T>(obj: LView<T>|LContainer|null): ILViewDebug<T>|ILContainerDebug|null;
export function toDebug(obj: any): any {
  if (obj) {
    const debug = (obj as any).debug;
    assertDefined(debug, 'Object does not have a debug representation.');
    return debug;
  } else {
    return obj;
  }
}

/**
 * Use this method to unwrap a native element in `LView` and convert it into HTML for easier
 * reading.
 *
 * 使用此方法在 `LView` 中解开本机元素，并将其转换为 HTML 以便于阅读。
 *
 * @param value possibly wrapped native DOM node.
 *
 * 可能包装的本机 DOM 节点。
 *
 * @param includeChildren If `true` then the serialized HTML form will include child elements
 * (same
 * as `outerHTML`). If `false` then the serialized HTML form will only contain the element
 * itself
 * (will not serialize child elements).
 *
 * 如果为 `true` ，则序列化的 HTML 表单将包含子元素（与 `outerHTML` 相同）。如果为 `false`
 * ，则序列化的 HTML 表单将仅包含元素本身（不会序列化子元素）。
 *
 */
function toHtml(value: any, includeChildren: boolean = false): string|null {
  const node: Node|null = unwrapRNode(value) as any;
  if (node) {
    switch (node.nodeType) {
      case Node.TEXT_NODE:
        return node.textContent;
      case Node.COMMENT_NODE:
        return `<!--${(node as Comment).textContent}-->`;
      case Node.ELEMENT_NODE:
        const outerHTML = (node as Element).outerHTML;
        if (includeChildren) {
          return outerHTML;
        } else {
          const innerHTML = '>' + (node as Element).innerHTML + '<';
          return (outerHTML.split(innerHTML)[0]) + '>';
        }
    }
  }
  return null;
}

export class LViewDebug<T = unknown> implements ILViewDebug<T> {
  constructor(private readonly _raw_lView: LView<T>) {}

  /**
   * Flags associated with the `LView` unpacked into a more readable state.
   *
   * 与 `LView` 关联的标志已解压缩为更具可读性的状态。
   *
   */
  get flags() {
    const flags = this._raw_lView[FLAGS];
    return {
      __raw__flags__: flags,
      initPhaseState: flags & LViewFlags.InitPhaseStateMask,
      creationMode: !!(flags & LViewFlags.CreationMode),
      firstViewPass: !!(flags & LViewFlags.FirstLViewPass),
      checkAlways: !!(flags & LViewFlags.CheckAlways),
      dirty: !!(flags & LViewFlags.Dirty),
      attached: !!(flags & LViewFlags.Attached),
      destroyed: !!(flags & LViewFlags.Destroyed),
      isRoot: !!(flags & LViewFlags.IsRoot),
      indexWithinInitPhase: flags >> LViewFlags.IndexWithinInitPhaseShift,
    };
  }
  get parent(): ILViewDebug<T>|ILContainerDebug|null {
    return toDebug<T>(this._raw_lView[PARENT] as LView<T>| LContainer | null);
  }
  get hostHTML(): string|null {
    return toHtml(this._raw_lView[HOST], true);
  }
  get html(): string {
    return (this.nodes || []).map(mapToHTML).join('');
  }
  get context(): T {
    return this._raw_lView[CONTEXT];
  }
  /**
   * The tree of nodes associated with the current `LView`. The nodes have been normalized into
   * a tree structure with relevant details pulled out for readability.
   *
   * 与当前 `LView` 关联的节点树。节点已被规范化为树形结构，并为便于阅读而提取了相关细节。
   *
   */
  get nodes(): DebugNode[] {
    const lView = this._raw_lView;
    const tNode = lView[TVIEW].firstChild;
    return toDebugNodes(tNode, lView);
  }
  get template(): string {
    return (this.tView as any as {template_: string}).template_;
  }
  get tView(): ITView {
    return this._raw_lView[TVIEW];
  }
  get cleanup(): any[]|null {
    return this._raw_lView[CLEANUP];
  }
  get injector(): Injector|null {
    return this._raw_lView[INJECTOR];
  }
  get rendererFactory(): RendererFactory {
    return this._raw_lView[RENDERER_FACTORY];
  }
  get renderer(): Renderer {
    return this._raw_lView[RENDERER];
  }
  get sanitizer(): Sanitizer|null {
    return this._raw_lView[SANITIZER];
  }
  get childHead(): ILViewDebug|ILContainerDebug|null {
    return toDebug(this._raw_lView[CHILD_HEAD]);
  }
  get next(): ILViewDebug<T>|ILContainerDebug|null {
    return toDebug<T>(this._raw_lView[NEXT] as LView<T>| LContainer | null);
  }
  get childTail(): ILViewDebug|ILContainerDebug|null {
    return toDebug(this._raw_lView[CHILD_TAIL]);
  }
  get declarationView(): ILViewDebug|null {
    return toDebug(this._raw_lView[DECLARATION_VIEW]);
  }
  get queries(): LQueries|null {
    return this._raw_lView[QUERIES];
  }
  get tHost(): ITNode|null {
    return this._raw_lView[T_HOST];
  }
  get id(): number {
    return this._raw_lView[ID];
  }

  get decls(): LViewDebugRange {
    return toLViewRange(this.tView, this._raw_lView, HEADER_OFFSET, this.tView.bindingStartIndex);
  }

  get vars(): LViewDebugRange {
    return toLViewRange(
        this.tView, this._raw_lView, this.tView.bindingStartIndex, this.tView.expandoStartIndex);
  }

  get expando(): LViewDebugRange {
    return toLViewRange(
        this.tView, this._raw_lView, this.tView.expandoStartIndex, this._raw_lView.length);
  }

  /**
   * Normalized view of child views (and containers) attached at this location.
   *
   * 附加在此位置的子视图（和容器）的规范化视图。
   *
   */
  get childViews(): Array<ILViewDebug<T>|ILContainerDebug> {
    const childViews: Array<ILViewDebug<T>|ILContainerDebug> = [];
    let child = this.childHead;
    while (child) {
      childViews.push(child as ILViewDebug<T>| ILContainerDebug);
      child = child.next;
    }
    return childViews;
  }
}

function mapToHTML(node: DebugNode): string {
  if (node.type === 'ElementContainer') {
    return (node.children || []).map(mapToHTML).join('');
  } else if (node.type === 'IcuContainer') {
    throw new Error('Not implemented');
  } else {
    return toHtml(node.native, true) || '';
  }
}

function toLViewRange(tView: TView, lView: LView, start: number, end: number): LViewDebugRange {
  let content: LViewDebugRangeContent[] = [];
  for (let index = start; index < end; index++) {
    content.push({index: index, t: tView.data[index], l: lView[index]});
  }
  return {start: start, end: end, length: end - start, content: content};
}

/**
 * Turns a flat list of nodes into a tree by walking the associated `TNode` tree.
 *
 * 通过遍历关联的 `TNode` 树，将平面节点列表转换为树。
 *
 * @param tNode
 * @param lView
 */
export function toDebugNodes(tNode: ITNode|null, lView: LView): DebugNode[] {
  if (tNode) {
    const debugNodes: DebugNode[] = [];
    let tNodeCursor: ITNode|null = tNode;
    while (tNodeCursor) {
      debugNodes.push(buildDebugNode(tNodeCursor, lView));
      tNodeCursor = tNodeCursor.next;
    }
    return debugNodes;
  } else {
    return [];
  }
}

export function buildDebugNode(tNode: ITNode, lView: LView): DebugNode {
  const rawValue = lView[tNode.index];
  const native = unwrapRNode(rawValue);
  const factories: Type<any>[] = [];
  const instances: any[] = [];
  const tView = lView[TVIEW];
  for (let i = tNode.directiveStart; i < tNode.directiveEnd; i++) {
    const def = tView.data[i] as DirectiveDef<any>;
    factories.push(def.type);
    instances.push(lView[i]);
  }
  return {
    html: toHtml(native),
    type: toTNodeTypeAsString(tNode.type),
    tNode,
    native: native as any,
    children: toDebugNodes(tNode.child, lView),
    factories,
    instances,
    injector: buildNodeInjectorDebug(tNode, tView, lView),
    get injectorResolutionPath() {
      return (tNode as TNode).debugNodeInjectorPath(lView);
    },
  };
}

function buildNodeInjectorDebug(tNode: ITNode, tView: ITView, lView: LView): NodeInjectorDebug {
  const viewProviders: Type<any>[] = [];
  for (let i = (tNode as TNode).providerIndexStart_; i < (tNode as TNode).providerIndexEnd_; i++) {
    viewProviders.push(tView.data[i] as Type<any>);
  }
  const providers: Type<any>[] = [];
  for (let i = (tNode as TNode).providerIndexEnd_; i < (tNode as TNode).directiveEnd; i++) {
    providers.push(tView.data[i] as Type<any>);
  }
  const nodeInjectorDebug = {
    bloom: toBloom(lView, tNode.injectorIndex),
    cumulativeBloom: toBloom(tView.data, tNode.injectorIndex),
    providers,
    viewProviders,
    parentInjectorIndex: lView[(tNode as TNode).providerIndexStart_ - 1],
  };
  return nodeInjectorDebug;
}

/**
 * Convert a number at `idx` location in `array` into binary representation.
 *
 * 将 `array` 中 `idx` 位置的数字转换为二进制表示。
 *
 * @param array
 * @param idx
 */
function binary(array: any[], idx: number): string {
  const value = array[idx];
  // If not a number we print 8 `?` to retain alignment but let user know that it was called on
  // wrong type.
  if (typeof value !== 'number') return '????????';
  // We prefix 0s so that we have constant length number
  const text = '00000000' + value.toString(2);
  return text.substring(text.length - 8);
}

/**
 * Convert a bloom filter at location `idx` in `array` into binary representation.
 *
 * 将 `array` 中位置 `idx` 处的布隆过滤器转换为二进制表示。
 *
 * @param array
 * @param idx
 */
function toBloom(array: any[], idx: number): string {
  if (idx < 0) {
    return 'NO_NODE_INJECTOR';
  }
  return `${binary(array, idx + 7)}_${binary(array, idx + 6)}_${binary(array, idx + 5)}_${
      binary(array, idx + 4)}_${binary(array, idx + 3)}_${binary(array, idx + 2)}_${
      binary(array, idx + 1)}_${binary(array, idx + 0)}`;
}

export class LContainerDebug implements ILContainerDebug {
  constructor(private readonly _raw_lContainer: LContainer) {}

  get hasTransplantedViews(): boolean {
    return this._raw_lContainer[HAS_TRANSPLANTED_VIEWS];
  }
  get views(): ILViewDebug[] {
    return this._raw_lContainer.slice(CONTAINER_HEADER_OFFSET)
        .map(toDebug as (l: LView) => ILViewDebug);
  }
  get parent(): ILViewDebug|null {
    return toDebug(this._raw_lContainer[PARENT]);
  }
  get movedViews(): LView[]|null {
    return this._raw_lContainer[MOVED_VIEWS];
  }
  get host(): RElement|RComment|LView {
    return this._raw_lContainer[HOST];
  }
  get native(): RComment {
    return this._raw_lContainer[NATIVE];
  }
  get next() {
    return toDebug(this._raw_lContainer[NEXT]);
  }
}
