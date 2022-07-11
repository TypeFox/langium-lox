import { ValidationChecks, ValidationRegistry } from 'langium';
import { LoxAstType } from './generated/ast';
import type { LoxServices } from './lox-module';

/**
 * Registry for validation checks.
 */
export class LoxValidationRegistry extends ValidationRegistry {
    constructor(services: LoxServices) {
        super(services);
        const validator = services.validation.LoxValidator;
        const checks: ValidationChecks<LoxAstType> = {
        };
        this.register(checks, validator);
    }
}

/**
 * Implementation of custom validations.
 */
export class LoxValidator {

    // checkPersonStartsWithCapital(person: Person, accept: ValidationAcceptor): void {
    //     if (person.name) {
    //         const firstChar = person.name.substring(0, 1);
    //         if (firstChar.toUpperCase() !== firstChar) {
    //             accept('warning', 'Person name should start with a capital.', { node: person, property: 'name' });
    //         }
    //     }
    // }

}
