import { spawn } from 'node:child_process'
import process from 'node:process'

const checks = [
  {
    name: 'Firestore rules static contract',
    command: 'npm',
    args: ['run', 'test:rules'],
  },
  {
    name: 'Privacy and credential scan',
    command: 'npm',
    args: ['run', 'privacy:scan'],
  },
  {
    name: 'Unit and integration tests',
    command: 'npm',
    args: ['test', '--', '--reporter=dot'],
  },
  {
    name: 'Production build',
    command: 'npm',
    args: ['run', 'build'],
  },
]

function runCheck({ name, command, args }) {
  return new Promise((resolve) => {
    console.log(`\nrelease:check gate: ${name}`)
    console.log(`$ ${[command, ...args].join(' ')}`)

    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })

    child.on('error', (error) => {
      console.error(`release:check failed to start ${name}: ${error.message}`)
      resolve(1)
    })

    child.on('close', (code, signal) => {
      if (signal) {
        console.error(`release:check ${name} stopped by signal ${signal}`)
        resolve(1)
        return
      }

      resolve(code ?? 1)
    })
  })
}

console.log(`release:check starting ${checks.length} local gates`)

for (const check of checks) {
  const exitCode = await runCheck(check)

  if (exitCode !== 0) {
    console.error(`\nrelease:check failed at gate: ${check.name}`)
    process.exit(exitCode)
  }
}

console.log('\nrelease:check passed: rules, privacy scan, tests, and production build completed')
