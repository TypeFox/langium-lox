import { AstNode, AstNodeHoverProvider } from "langium";
import { Hover } from "vscode-languageclient";
import { isClass, isNamedElement } from "../generated/ast";
import { isErrorType, typeToString } from "../type-system/descriptions";
import { inferType } from "../type-system/infer";

export class LoxHoverProvider extends AstNodeHoverProvider {
    protected getAstNodeHoverContent(node: AstNode): Hover | undefined {
        if (isClass(node)) {
            return {
                contents: {
                    kind: 'markdown',
                    language: 'lox',
                    value: `class ${node.name}${node.superClass ? ` ${node.superClass.$refText}` : ''}`
                }
            }
        } else if (isNamedElement(node)) {
            const type = inferType(node, new Map());
            if (isErrorType(type)) {
                return undefined;
            }
            return {
                contents: {
                    kind: 'markdown',
                    language: 'lox',
                    value: `var ${node.name}: ${typeToString(type)}`
                }
            }
        }
        return undefined;
    }
}
