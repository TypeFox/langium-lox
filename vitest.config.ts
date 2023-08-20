import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: ['src'],
            exclude: ['**/generated'],
        },
        deps: {
            interopDefault: true
        },
        include: ['test/*.test.ts']
    }
})