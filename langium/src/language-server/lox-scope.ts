import { AstUtils, DefaultScopeProvider, EMPTY_SCOPE, ReferenceInfo, Scope } from "langium";
import { Class, isClass, MemberCall } from "./generated/ast.js";
import { isClassType } from "./type-system/descriptions.js";
import { getClassChain, inferType } from "./type-system/infer.js";
import { LangiumServices } from "langium/lsp";

export class LoxScopeProvider extends DefaultScopeProvider {

    constructor(services: LangiumServices) {
        super(services);
    }

    override getScope(context: ReferenceInfo): Scope {
        // target element of member calls
        if (context.property === 'element') {
            // `this` resolves to the container class, `super` to its super class
            if (context.reference.$refText === 'this' || context.reference.$refText === 'super') {
                const classItem = AstUtils.getContainerOfType(context.container, isClass);
                if (classItem) {
                    const target = context.reference.$refText === 'super' ? classItem.superClass?.ref : classItem;
                    if (target) {
                        return this.createScope([this.descriptions.createDescription(target, context.reference.$refText)]);
                    }
                }
                return EMPTY_SCOPE;
            }
            const memberCall = context.container as MemberCall;
            const previous = memberCall.previous;
            if (!previous) {
                return super.getScope(context);
            }
            const previousType = inferType(previous, new Map());
            if (isClassType(previousType)) {
                return this.scopeClassMembers(previousType.literal);
            }
            return EMPTY_SCOPE;
        }
        return super.getScope(context);
    }

    private scopeClassMembers(classItem: Class): Scope {
        const allMembers = getClassChain(classItem).flatMap(e => e.members);
        return this.createScopeForNodes(allMembers);
    }
}
