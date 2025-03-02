/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {AST, BindingPipe, ImplicitReceiver, PropertyRead, PropertyWrite, RecursiveAstVisitor, SafePropertyRead} from '../../expression_parser/ast';
import {SelectorMatcher} from '../../selector';
import {BoundAttribute, BoundEvent, BoundText, Content, Element, Icu, Node, Reference, Template, Text, TextAttribute, Variable, Visitor} from '../r3_ast';

import {BoundTarget, DirectiveMeta, Target, TargetBinder} from './t2_api';
import {createCssSelector} from './template';
import {getAttrsForDirectiveMatching} from './util';


/**
 * Processes `Target`s with a given set of directives and performs a binding operation, which
 * returns an object similar to TypeScript's `ts.TypeChecker` that contains knowledge about the
 * target.
 *
 * 使用给定的一组指令处理 `Target` 并执行绑定操作，该操作会返回一个类似于 TypeScript 的
 * `ts.TypeChecker` 的对象，其中包含有关目标的知识。
 *
 */
export class R3TargetBinder<DirectiveT extends DirectiveMeta> implements TargetBinder<DirectiveT> {
  constructor(private directiveMatcher: SelectorMatcher<DirectiveT[]>) {}

  /**
   * Perform a binding operation on the given `Target` and return a `BoundTarget` which contains
   * metadata about the types referenced in the template.
   *
   * 对给定的 `Target` 执行绑定操作，并返回一个 `BoundTarget`
   * ，其中包含有关模板中引用的类型的元数据。
   *
   */
  bind(target: Target): BoundTarget<DirectiveT> {
    if (!target.template) {
      // TODO(alxhub): handle targets which contain things like HostBindings, etc.
      throw new Error('Binding without a template not yet supported');
    }

    // First, parse the template into a `Scope` structure. This operation captures the syntactic
    // scopes in the template and makes them available for later use.
    const scope = Scope.apply(target.template);


    // Use the `Scope` to extract the entities present at every level of the template.
    const templateEntities = extractTemplateEntities(scope);

    // Next, perform directive matching on the template using the `DirectiveBinder`. This returns:
    //   - directives: Map of nodes (elements & ng-templates) to the directives on them.
    //   - bindings: Map of inputs, outputs, and attributes to the directive/element that claims
    //     them. TODO(alxhub): handle multiple directives claiming an input/output/etc.
    //   - references: Map of #references to their targets.
    const {directives, bindings, references} =
        DirectiveBinder.apply(target.template, this.directiveMatcher);
    // Finally, run the TemplateBinder to bind references, variables, and other entities within the
    // template. This extracts all the metadata that doesn't depend on directive matching.
    const {expressions, symbols, nestingLevel, usedPipes} =
        TemplateBinder.applyWithScope(target.template, scope);
    return new R3BoundTarget(
        target, directives, bindings, references, expressions, symbols, nestingLevel,
        templateEntities, usedPipes);
  }
}

/**
 * Represents a binding scope within a template.
 *
 * 表示模板中的绑定范围。
 *
 * Any variables, references, or other named entities declared within the template will
 * be captured and available by name in `namedEntities`. Additionally, child templates will
 * be analyzed and have their child `Scope`s available in `childScopes`.
 *
 * 在模板中声明的任何变量、引用或其他命名实体都将被捕获，并在 `namedEntities`
 * 中按名称提供。此外，将分析子模板，并让它们的子 `Scope` 在 `childScopes` 中可用。
 *
 */
class Scope implements Visitor {
  /**
   * Named members of the `Scope`, such as `Reference`s or `Variable`s.
   *
   * `Scope` 的命名成员，例如 `Reference` 或 `Variable` 。
   *
   */
  readonly namedEntities = new Map<string, Reference|Variable>();

  /**
   * Child `Scope`s for immediately nested `Template`s.
   *
   * 立即嵌套的 `Template` 的子 `Scope` 。
   *
   */
  readonly childScopes = new Map<Template, Scope>();

  private constructor(readonly parentScope: Scope|null, readonly template: Template|null) {}

  static newRootScope(): Scope {
    return new Scope(null, null);
  }

  /**
   * Process a template (either as a `Template` sub-template with variables, or a plain array of
   * template `Node`s) and construct its `Scope`.
   *
   * 处理模板（作为带有变量的 `Template` 子模板，或模板 `Node` 的普通数组）并构造其 `Scope` 。
   *
   */
  static apply(template: Node[]): Scope {
    const scope = Scope.newRootScope();
    scope.ingest(template);
    return scope;
  }

  /**
   * Internal method to process the template and populate the `Scope`.
   *
   * 处理模板和填充 `Scope` 的内部方法。
   *
   */
  private ingest(template: Template|Node[]): void {
    if (template instanceof Template) {
      // Variables on an <ng-template> are defined in the inner scope.
      template.variables.forEach(node => this.visitVariable(node));

      // Process the nodes of the template.
      template.children.forEach(node => node.visit(this));
    } else {
      // No overarching `Template` instance, so process the nodes directly.
      template.forEach(node => node.visit(this));
    }
  }

  visitElement(element: Element) {
    // `Element`s in the template may have `Reference`s which are captured in the scope.
    element.references.forEach(node => this.visitReference(node));

    // Recurse into the `Element`'s children.
    element.children.forEach(node => node.visit(this));
  }

  visitTemplate(template: Template) {
    // References on a <ng-template> are defined in the outer scope, so capture them before
    // processing the template's child scope.
    template.references.forEach(node => this.visitReference(node));

    // Next, create an inner scope and process the template within it.
    const scope = new Scope(this, template);
    scope.ingest(template);
    this.childScopes.set(template, scope);
  }

  visitVariable(variable: Variable) {
    // Declare the variable if it's not already.
    this.maybeDeclare(variable);
  }

  visitReference(reference: Reference) {
    // Declare the variable if it's not already.
    this.maybeDeclare(reference);
  }

  // Unused visitors.
  visitContent(content: Content) {}
  visitBoundAttribute(attr: BoundAttribute) {}
  visitBoundEvent(event: BoundEvent) {}
  visitBoundText(text: BoundText) {}
  visitText(text: Text) {}
  visitTextAttribute(attr: TextAttribute) {}
  visitIcu(icu: Icu) {}

  private maybeDeclare(thing: Reference|Variable) {
    // Declare something with a name, as long as that name isn't taken.
    if (!this.namedEntities.has(thing.name)) {
      this.namedEntities.set(thing.name, thing);
    }
  }

  /**
   * Look up a variable within this `Scope`.
   *
   * 在此 `Scope` 中查找变量。
   *
   * This can recurse into a parent `Scope` if it's available.
   *
   * 如果可用，这可以递归到父 `Scope` 。
   *
   */
  lookup(name: string): Reference|Variable|null {
    if (this.namedEntities.has(name)) {
      // Found in the local scope.
      return this.namedEntities.get(name)!;
    } else if (this.parentScope !== null) {
      // Not in the local scope, but there's a parent scope so check there.
      return this.parentScope.lookup(name);
    } else {
      // At the top level and it wasn't found.
      return null;
    }
  }

  /**
   * Get the child scope for a `Template`.
   *
   * 获取 `Template` 的子范围。
   *
   * This should always be defined.
   *
   * 这应该始终被定义。
   *
   */
  getChildScope(template: Template): Scope {
    const res = this.childScopes.get(template);
    if (res === undefined) {
      throw new Error(`Assertion error: child scope for ${template} not found`);
    }
    return res;
  }
}

/**
 * Processes a template and matches directives on nodes (elements and templates).
 *
 * 处理模板并匹配节点（元素和模板）上的指令。
 *
 * Usually used via the static `apply()` method.
 *
 * 通常通过静态 `apply()` 方法使用。
 *
 */
class DirectiveBinder<DirectiveT extends DirectiveMeta> implements Visitor {
  constructor(
      private matcher: SelectorMatcher<DirectiveT[]>,
      private directives: Map<Element|Template, DirectiveT[]>,
      private bindings: Map<BoundAttribute|BoundEvent|TextAttribute, DirectiveT|Element|Template>,
      private references:
          Map<Reference, {directive: DirectiveT, node: Element|Template}|Element|Template>) {}

  /**
   * Process a template (list of `Node`s) and perform directive matching against each node.
   *
   * 处理模板（`Node` 列表）并对每个节点执行指令匹配。
   *
   * @param template the list of template `Node`s to match (recursively).
   *
   * 要匹配的模板 `Node` 列表（递归）。
   *
   * @param selectorMatcher a `SelectorMatcher` containing the directives that are in scope for
   * this template.
   *
   * 包含此模板范围内的指令的 `SelectorMatcher` 。
   *
   * @returns
   *
   * three maps which contain information about directives in the template: the
   * `directives` map which lists directives matched on each node, the `bindings` map which
   * indicates which directives claimed which bindings (inputs, outputs, etc), and the `references`
   * map which resolves #references (`Reference`s) within the template to the named directive or
   * template node.
   *
   * 三个包含模板中指令信息的映射表：列出在每个节点上匹配的指令的 `directives`
   * 映射表、表明哪些指令声明了哪些绑定（输入、输出等）的 `bindings` 映射表以及解析 #references（
   * `Reference`）的 `references` 映射表 s) 在模板中到命名的指令或模板节点。
   *
   */
  static apply<DirectiveT extends DirectiveMeta>(
      template: Node[], selectorMatcher: SelectorMatcher<DirectiveT[]>): {
    directives: Map<Element|Template, DirectiveT[]>,
    bindings: Map<BoundAttribute|BoundEvent|TextAttribute, DirectiveT|Element|Template>,
    references: Map<Reference, {directive: DirectiveT, node: Element|Template}|Element|Template>,
  } {
    const directives = new Map<Element|Template, DirectiveT[]>();
    const bindings =
        new Map<BoundAttribute|BoundEvent|TextAttribute, DirectiveT|Element|Template>();
    const references =
        new Map<Reference, {directive: DirectiveT, node: Element | Template}|Element|Template>();
    const matcher = new DirectiveBinder(selectorMatcher, directives, bindings, references);
    matcher.ingest(template);
    return {directives, bindings, references};
  }

  private ingest(template: Node[]): void {
    template.forEach(node => node.visit(this));
  }

  visitElement(element: Element): void {
    this.visitElementOrTemplate(element.name, element);
  }

  visitTemplate(template: Template): void {
    this.visitElementOrTemplate('ng-template', template);
  }

  visitElementOrTemplate(elementName: string, node: Element|Template): void {
    // First, determine the HTML shape of the node for the purpose of directive matching.
    // Do this by building up a `CssSelector` for the node.
    const cssSelector = createCssSelector(elementName, getAttrsForDirectiveMatching(node));

    // Next, use the `SelectorMatcher` to get the list of directives on the node.
    const directives: DirectiveT[] = [];
    this.matcher.match(cssSelector, (_selector, results) => directives.push(...results));
    if (directives.length > 0) {
      this.directives.set(node, directives);
    }

    // Resolve any references that are created on this node.
    node.references.forEach(ref => {
      let dirTarget: DirectiveT|null = null;

      // If the reference expression is empty, then it matches the "primary" directive on the node
      // (if there is one). Otherwise it matches the host node itself (either an element or
      // <ng-template> node).
      if (ref.value.trim() === '') {
        // This could be a reference to a component if there is one.
        dirTarget = directives.find(dir => dir.isComponent) || null;
      } else {
        // This should be a reference to a directive exported via exportAs.
        dirTarget =
            directives.find(
                dir => dir.exportAs !== null && dir.exportAs.some(value => value === ref.value)) ||
            null;
        // Check if a matching directive was found.
        if (dirTarget === null) {
          // No matching directive was found - this reference points to an unknown target. Leave it
          // unmapped.
          return;
        }
      }

      if (dirTarget !== null) {
        // This reference points to a directive.
        this.references.set(ref, {directive: dirTarget, node});
      } else {
        // This reference points to the node itself.
        this.references.set(ref, node);
      }
    });

    // Associate attributes/bindings on the node with directives or with the node itself.
    type BoundNode = BoundAttribute|BoundEvent|TextAttribute;
    const setAttributeBinding =
        (attribute: BoundNode, ioType: keyof Pick<DirectiveMeta, 'inputs'|'outputs'>) => {
          const dir = directives.find(dir => dir[ioType].hasBindingPropertyName(attribute.name));
          const binding = dir !== undefined ? dir : node;
          this.bindings.set(attribute, binding);
        };

    // Node inputs (bound attributes) and text attributes can be bound to an
    // input on a directive.
    node.inputs.forEach(input => setAttributeBinding(input, 'inputs'));
    node.attributes.forEach(attr => setAttributeBinding(attr, 'inputs'));
    if (node instanceof Template) {
      node.templateAttrs.forEach(attr => setAttributeBinding(attr, 'inputs'));
    }
    // Node outputs (bound events) can be bound to an output on a directive.
    node.outputs.forEach(output => setAttributeBinding(output, 'outputs'));

    // Recurse into the node's children.
    node.children.forEach(child => child.visit(this));
  }

  // Unused visitors.
  visitContent(content: Content): void {}
  visitVariable(variable: Variable): void {}
  visitReference(reference: Reference): void {}
  visitTextAttribute(attribute: TextAttribute): void {}
  visitBoundAttribute(attribute: BoundAttribute): void {}
  visitBoundEvent(attribute: BoundEvent): void {}
  visitBoundAttributeOrEvent(node: BoundAttribute|BoundEvent) {}
  visitText(text: Text): void {}
  visitBoundText(text: BoundText): void {}
  visitIcu(icu: Icu): void {}
}

/**
 * Processes a template and extract metadata about expressions and symbols within.
 *
 * 处理模板并提取有关其中表达式和符号的元数据。
 *
 * This is a companion to the `DirectiveBinder` that doesn't require knowledge of directives matched
 * within the template in order to operate.
 *
 * 这是 `DirectiveBinder` 的伴侣，它不需要了解模板中匹配的指令即可操作。
 *
 * Expressions are visited by the superclass `RecursiveAstVisitor`, with custom logic provided
 * by overridden methods from that visitor.
 *
 * 超类 `RecursiveAstVisitor` 访问表达式，自定义逻辑由该访问者的覆盖方法提供。
 *
 */
class TemplateBinder extends RecursiveAstVisitor implements Visitor {
  private visitNode: (node: Node) => void;

  private pipesUsed: string[] = [];

  private constructor(
      private bindings: Map<AST, Reference|Variable>,
      private symbols: Map<Reference|Variable, Template>, private usedPipes: Set<string>,
      private nestingLevel: Map<Template, number>, private scope: Scope,
      private template: Template|null, private level: number) {
    super();

    // Save a bit of processing time by constructing this closure in advance.
    this.visitNode = (node: Node) => node.visit(this);
  }

  // This method is defined to reconcile the type of TemplateBinder since both
  // RecursiveAstVisitor and Visitor define the visit() method in their
  // interfaces.
  override visit(node: AST|Node, context?: any) {
    if (node instanceof AST) {
      node.visit(this, context);
    } else {
      node.visit(this);
    }
  }

  /**
   * Process a template and extract metadata about expressions and symbols within.
   *
   * 处理模板并提取有关其中表达式和符号的元数据。
   *
   * @param template the nodes of the template to process
   *
   * 要处理的模板的节点
   *
   * @param scope the `Scope` of the template being processed.
   *
   * 正在处理的模板的 `Scope` 。
   *
   * @returns
   *
   * three maps which contain metadata about the template: `expressions` which interprets
   * special `AST` nodes in expressions as pointing to references or variables declared within the
   * template, `symbols` which maps those variables and references to the nested `Template` which
   * declares them, if any, and `nestingLevel` which associates each `Template` with a integer
   * nesting level (how many levels deep within the template structure the `Template` is), starting
   * at 1.
   *
   * 三个包含有关模板的 `symbols` 数据的映射： `expressions` ，将表达式中的特殊 `AST`
   * 节点解释为指向模板中声明的引用或变量，将这些变量和引用映射到声明它们的嵌套 `Template`
   *（如果有）和 `nestingLevel` 每个 `Template` 都有一个整数嵌套级别（模板在 `Template`
   * 结构中的深度是多少），从 1 开始。
   *
   */
  static applyWithScope(template: Node[], scope: Scope): {
    expressions: Map<AST, Reference|Variable>,
    symbols: Map<Variable|Reference, Template>,
    nestingLevel: Map<Template, number>,
    usedPipes: Set<string>,
  } {
    const expressions = new Map<AST, Reference|Variable>();
    const symbols = new Map<Variable|Reference, Template>();
    const nestingLevel = new Map<Template, number>();
    const usedPipes = new Set<string>();
    // The top-level template has nesting level 0.
    const binder = new TemplateBinder(
        expressions, symbols, usedPipes, nestingLevel, scope,
        template instanceof Template ? template : null, 0);
    binder.ingest(template);
    return {expressions, symbols, nestingLevel, usedPipes};
  }

  private ingest(template: Template|Node[]): void {
    if (template instanceof Template) {
      // For <ng-template>s, process only variables and child nodes. Inputs, outputs, templateAttrs,
      // and references were all processed in the scope of the containing template.
      template.variables.forEach(this.visitNode);
      template.children.forEach(this.visitNode);

      // Set the nesting level.
      this.nestingLevel.set(template, this.level);
    } else {
      // Visit each node from the top-level template.
      template.forEach(this.visitNode);
    }
  }

  visitElement(element: Element) {
    // Visit the inputs, outputs, and children of the element.
    element.inputs.forEach(this.visitNode);
    element.outputs.forEach(this.visitNode);
    element.children.forEach(this.visitNode);
  }

  visitTemplate(template: Template) {
    // First, visit inputs, outputs and template attributes of the template node.
    template.inputs.forEach(this.visitNode);
    template.outputs.forEach(this.visitNode);
    template.templateAttrs.forEach(this.visitNode);

    // References are also evaluated in the outer context.
    template.references.forEach(this.visitNode);

    // Next, recurse into the template using its scope, and bumping the nesting level up by one.
    const childScope = this.scope.getChildScope(template);
    const binder = new TemplateBinder(
        this.bindings, this.symbols, this.usedPipes, this.nestingLevel, childScope, template,
        this.level + 1);
    binder.ingest(template);
  }

  visitVariable(variable: Variable) {
    // Register the `Variable` as a symbol in the current `Template`.
    if (this.template !== null) {
      this.symbols.set(variable, this.template);
    }
  }

  visitReference(reference: Reference) {
    // Register the `Reference` as a symbol in the current `Template`.
    if (this.template !== null) {
      this.symbols.set(reference, this.template);
    }
  }

  // Unused template visitors

  visitText(text: Text) {}
  visitContent(content: Content) {}
  visitTextAttribute(attribute: TextAttribute) {}
  visitIcu(icu: Icu): void {
    Object.keys(icu.vars).forEach(key => icu.vars[key].visit(this));
    Object.keys(icu.placeholders).forEach(key => icu.placeholders[key].visit(this));
  }

  // The remaining visitors are concerned with processing AST expressions within template bindings

  visitBoundAttribute(attribute: BoundAttribute) {
    attribute.value.visit(this);
  }

  visitBoundEvent(event: BoundEvent) {
    event.handler.visit(this);
  }

  visitBoundText(text: BoundText) {
    text.value.visit(this);
  }
  override visitPipe(ast: BindingPipe, context: any): any {
    this.usedPipes.add(ast.name);
    return super.visitPipe(ast, context);
  }

  // These five types of AST expressions can refer to expression roots, which could be variables
  // or references in the current scope.

  override visitPropertyRead(ast: PropertyRead, context: any): any {
    this.maybeMap(context, ast, ast.name);
    return super.visitPropertyRead(ast, context);
  }

  override visitSafePropertyRead(ast: SafePropertyRead, context: any): any {
    this.maybeMap(context, ast, ast.name);
    return super.visitSafePropertyRead(ast, context);
  }

  override visitPropertyWrite(ast: PropertyWrite, context: any): any {
    this.maybeMap(context, ast, ast.name);
    return super.visitPropertyWrite(ast, context);
  }

  private maybeMap(scope: Scope, ast: PropertyRead|SafePropertyRead|PropertyWrite, name: string):
      void {
    // If the receiver of the expression isn't the `ImplicitReceiver`, this isn't the root of an
    // `AST` expression that maps to a `Variable` or `Reference`.
    if (!(ast.receiver instanceof ImplicitReceiver)) {
      return;
    }

    // Check whether the name exists in the current scope. If so, map it. Otherwise, the name is
    // probably a property on the top-level component context.
    let target = this.scope.lookup(name);
    if (target !== null) {
      this.bindings.set(ast, target);
    }
  }
}

/**
 * Metadata container for a `Target` that allows queries for specific bits of metadata.
 *
 * 允许查询特定元数据位的 `Target` 的元数据容器。
 *
 * See `BoundTarget` for documentation on the individual methods.
 *
 * 有关各个方法的文档，请参阅 `BoundTarget` 。
 *
 */
export class R3BoundTarget<DirectiveT extends DirectiveMeta> implements BoundTarget<DirectiveT> {
  constructor(
      readonly target: Target, private directives: Map<Element|Template, DirectiveT[]>,
      private bindings: Map<BoundAttribute|BoundEvent|TextAttribute, DirectiveT|Element|Template>,
      private references:
          Map<BoundAttribute|BoundEvent|Reference|TextAttribute,
              {directive: DirectiveT, node: Element|Template}|Element|Template>,
      private exprTargets: Map<AST, Reference|Variable>,
      private symbols: Map<Reference|Variable, Template>,
      private nestingLevel: Map<Template, number>,
      private templateEntities: Map<Template|null, ReadonlySet<Reference|Variable>>,
      private usedPipes: Set<string>) {}

  getEntitiesInTemplateScope(template: Template|null): ReadonlySet<Reference|Variable> {
    return this.templateEntities.get(template) ?? new Set();
  }

  getDirectivesOfNode(node: Element|Template): DirectiveT[]|null {
    return this.directives.get(node) || null;
  }

  getReferenceTarget(ref: Reference): {directive: DirectiveT, node: Element|Template}|Element
      |Template|null {
    return this.references.get(ref) || null;
  }

  getConsumerOfBinding(binding: BoundAttribute|BoundEvent|TextAttribute): DirectiveT|Element
      |Template|null {
    return this.bindings.get(binding) || null;
  }

  getExpressionTarget(expr: AST): Reference|Variable|null {
    return this.exprTargets.get(expr) || null;
  }

  getTemplateOfSymbol(symbol: Reference|Variable): Template|null {
    return this.symbols.get(symbol) || null;
  }

  getNestingLevel(template: Template): number {
    return this.nestingLevel.get(template) || 0;
  }

  getUsedDirectives(): DirectiveT[] {
    const set = new Set<DirectiveT>();
    this.directives.forEach(dirs => dirs.forEach(dir => set.add(dir)));
    return Array.from(set.values());
  }

  getUsedPipes(): string[] {
    return Array.from(this.usedPipes);
  }
}

function extractTemplateEntities(rootScope: Scope): Map<Template|null, Set<Reference|Variable>> {
  const entityMap = new Map<Template|null, Map<string, Reference|Variable>>();

  function extractScopeEntities(scope: Scope): Map<string, Reference|Variable> {
    if (entityMap.has(scope.template)) {
      return entityMap.get(scope.template)!;
    }

    const currentEntities = scope.namedEntities;

    let templateEntities: Map<string, Reference|Variable>;
    if (scope.parentScope !== null) {
      templateEntities = new Map([...extractScopeEntities(scope.parentScope), ...currentEntities]);
    } else {
      templateEntities = new Map(currentEntities);
    }

    entityMap.set(scope.template, templateEntities);
    return templateEntities;
  }

  const scopesToProcess: Scope[] = [rootScope];
  while (scopesToProcess.length > 0) {
    const scope = scopesToProcess.pop()!;
    for (const childScope of scope.childScopes.values()) {
      scopesToProcess.push(childScope);
    }
    extractScopeEntities(scope);
  }

  const templateEntities = new Map<Template|null, Set<Reference|Variable>>();
  for (const [template, entities] of entityMap) {
    templateEntities.set(template, new Set(entities.values()));
  }
  return templateEntities;
}
