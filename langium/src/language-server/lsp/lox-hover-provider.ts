import { AstNode, MaybePromise } from "langium";
import { isClass, isNamedElement } from "../generated/ast.js";
import { isErrorType, typeToString } from "../type-system/descriptions.js";
import { inferType } from "../type-system/infer.js";
import { AstNodeHoverProvider } from "langium/lsp";

export class LoxHoverProvider extends AstNodeHoverProvider {
    protected getAstNodeHoverContent(node: AstNode): MaybePromise<string | undefined> {
        if (isClass(node)) {
            return `\`\`\`lox\nclass ${node.name}${node.superClass ? ` ${node.superClass.$refText}` : ''}\n\`\`\``;
        } else if (isNamedElement(node)) {
            const type = inferType(node, new Map());
            if (isErrorType(type)) {
                return undefined;
            }
            return `\`\`\`lox\nvar ${node.name}: ${typeToString(type)}\n\`\`\``;
        }
        return undefined;
    }
}
