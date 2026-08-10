import { readdirSync, readFileSync } from 'node:fs'
import { basename, extname, join, relative, sep } from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()
const SELF = 'scripts/privacy-scan.mjs'

const IGNORED_DIRECTORIES = new Set(['.git', '.omx', 'coverage', 'dist', 'node_modules'])
const IGNORED_FILES = new Set([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
])
const KNOWN_EXTENSIONLESS_TEXT_FILES = new Set([
  '.firebaserc',
  '.firebaserc.example',
  '.gitignore',
  'firebase.json',
])
const TEXT_EXTENSIONS = new Set([
  '.cjs',
  '.conf',
  '.csv',
  '.css',
  '.env',
  '.html',
  '.ini',
  '.js',
  '.json',
  '.jsonl',
  '.jsx',
  '.mjs',
  '.md',
  '.mdx',
  '.ts',
  '.tsx',
  '.txt',
  '.toml',
  '.yaml',
  '.yml',
])
const DATA_FILE_EXTENSIONS = new Set(['.csv', '.json', '.jsonl', '.ts', '.tsx', '.js', '.mjs'])

function toRepoPath(filePath) {
  return relative(ROOT, filePath).split(sep).join('/')
}

function shouldScan(filePath) {
  const repoPath = toRepoPath(filePath)
  const fileName = basename(filePath)

  if (repoPath === SELF || IGNORED_FILES.has(fileName)) {
    return false
  }

  return TEXT_EXTENSIONS.has(extname(fileName).toLowerCase())
    || fileName.startsWith('.env')
    || KNOWN_EXTENSIONLESS_TEXT_FILES.has(fileName)
}

function collectFiles(directory) {
  const files = []

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name)

    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) {
        files.push(...collectFiles(entryPath))
      }
      continue
    }

    if (entry.isFile() && shouldScan(entryPath)) {
      files.push(entryPath)
    }
  }

  return files.sort()
}

function lineNumberAt(text, index) {
  return text.slice(0, index).split('\n').length
}

function findMatches(text, filePath) {
  const findings = []
  const fileName = basename(filePath)
  const extension = extname(fileName).toLowerCase()
  const patterns = [
    {
      label: 'Firebase Admin SDK or server Firebase client',
      expression: /(?:firebase-admin|admin\.initializeApp|firebase-admin\/firestore)/gi,
    },
    {
      label: 'server-side Firestore client',
      expression: /(?:@google-cloud\/firestore|new\s+Firestore\s*\()/gi,
    },
    {
      label: 'Google application credentials',
      expression: /(?:\bGOOGLE_APPLICATION_CREDENTIALS(?:_JSON)?\b\s*[:=]|process\.env(?:\.GOOGLE_APPLICATION_CREDENTIALS|\[['"]GOOGLE_APPLICATION_CREDENTIALS(?:_JSON)?['"]\]))/gi,
    },
    {
      label: 'service-account JSON',
      expression: /["']type["']\s*:\s*["']service_account["']/gi,
    },
    {
      label: 'service-account JSON field',
      expression: /["'](?:client_email|private_key_id)["']\s*:/gi,
    },
    {
      label: 'private key material',
      expression: /-----BEGIN(?:\s+(?:RSA|EC|DSA|OPENSSH|PGP))?\s+PRIVATE KEY-----/gi,
    },
    {
      label: 'service-account private key field',
      expression: /["']private_key["']\s*:/gi,
    },
    {
      label: 'credential-like secret assignment',
      expression: /\b(?:SERVICE_ACCOUNT|CLIENT_SECRET|SECRET_KEY|ACCESS_TOKEN|PRIVATE_TOKEN|DB_PASSWORD|PASSWORD)\b\s*[:=]/gi,
    },
    {
      label: 'personal-data field',
      expression: /["']?\b(?:residentRegistrationNumber|residentId|rrn|socialSecurityNumber|ssn|phoneNumber|mobileNumber|dateOfBirth|birthDate|homeAddress|postalAddress|household|realName)\b["']?\s*:/gi,
    },
    {
      label: 'personal-data field assignment',
      expression: /["']?\b(?:email|emailAddress|phone|mobile|address|birthDate|dateOfBirth|firstName|lastName|givenName|familyName|fullName|legalName|memberName|realMember|realMembers|attendanceRecord|attendanceRecords)\b["']?\s*:/gi,
    },
    {
      label: 'Korean resident registration number',
      expression: /\b\d{6}[- ]?[1-4]\d{6}\b/g,
    },
    {
      label: 'Korean mobile phone number',
      expression: /\b01[016789][- ]?\d{3,4}[- ]?\d{4}\b/g,
    },
  ]

  if (/service[-_]?account|serviceaccount/i.test(fileName) && extension === '.json') {
    findings.push({ label: 'service-account JSON filename', line: 1 })
  }

  if (
    DATA_FILE_EXTENSIONS.has(extension)
    && /(?:^|[-_/])(?:real|prod|production)[-_]?(?:members?|attendance)|(?:^|[-_/])(?:members?|attendance)[-_]?(?:real|prod|production)/i.test(toRepoPath(filePath))
  ) {
    findings.push({ label: 'real/prod member or attendance data filename', line: 1 })
  }

  for (const { label, expression } of patterns) {
    for (const match of text.matchAll(expression)) {
      if (match.index !== undefined) {
        findings.push({ label, line: lineNumberAt(text, match.index) })
      }
    }
  }

  return findings
}

const files = collectFiles(ROOT)
const findings = []

for (const filePath of files) {
  let text

  try {
    text = readFileSync(filePath, 'utf8')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`privacy:scan could not read ${toRepoPath(filePath)}: ${message}`)
    process.exitCode = 1
    continue
  }

  if (text.includes('\u0000')) {
    continue
  }

  for (const finding of findMatches(text, filePath)) {
    findings.push({ file: toRepoPath(filePath), ...finding })
  }
}

if (findings.length > 0) {
  console.error('privacy:scan failed; forbidden credential or private-data material found:')
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.label}`)
  }
  process.exitCode = 1
} else {
  console.log(`privacy:scan passed (${files.length} source/input files checked)`)
}
