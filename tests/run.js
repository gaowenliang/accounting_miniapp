/**
 * 测试入口 — 运行所有单元测试
 * 用法: node tests/run.js
 */

const { execSync } = require('child_process')
const path = require('path')

const tests = [
  'tests/unit/test-money.js',
  'tests/unit/test-currencies.js',
  'tests/unit/test-aa.js',
]

let passed = 0
let failed = 0

console.log('╔══════════════════════════════════════╗')
console.log('║     记账小程序 — 单元测试套件        ║')
console.log('╚══════════════════════════════════════╝\n')

for (const test of tests) {
  try {
    console.log(`▶ 运行 ${test}`)
    execSync(`node ${path.join(__dirname, '..', test)}`, {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    })
    passed++
    console.log('')
  } catch (e) {
    failed++
    console.error(`❌ ${test} 失败\n`)
  }
}

console.log('─────────────────────────────────────')
console.log(`结果: ${passed} 通过, ${failed} 失败, 共 ${tests.length} 个测试文件`)
process.exit(failed > 0 ? 1 : 0)
