import { generateEslintConfig } from '@companion-module/tools/eslint/config.mjs'

const config = await generateEslintConfig({ enableTypescript: true })

// the tests run against the build, which is not published from this folder
config.push({ files: ['test/**'], rules: { 'n/no-unpublished-import': 'off' } })

export default config
