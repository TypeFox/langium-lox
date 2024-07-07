module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    env: {
        node: true,
        browser: true,
        es2022: true
    },
    overrides: [
    ],
    parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module'
    },
    plugins: [
        '@typescript-eslint'
    ],
    ignorePatterns: [
        '**/{node_modules,dist,lib,out,bin}',
        '.eslintrc.cjs'
    ],
    rules: {
        // disallow Unused Variables with excpetion of _ prefixed variables
        '@typescript-eslint/no-unused-vars': ['error', {
            'argsIgnorePattern': '^_'
        }]
    }
};
