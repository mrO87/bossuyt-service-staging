#!/usr/bin/env node
// scripts/bump-version.js
// - Reads CURRENT_RELEASE_VERSION from lib/releases.ts
// - Increments the minor number
// - Inserts a placeholder entry at the top of RELEASES
// - Updates CURRENT_RELEASE_VERSION to the new version
// - Prints the new version to stdout (for shell capture)

const fs   = require('fs')
const path = require('path')

const releasesPath = path.join(__dirname, '..', 'lib', 'releases.ts')
const content      = fs.readFileSync(releasesPath, 'utf8')

// Read from the authoritative CURRENT_RELEASE_VERSION constant
const match = content.match(/const CURRENT_RELEASE_VERSION\s*=\s*'v(\d+)\.(\d+)'/)
if (!match) {
  process.stderr.write('FOUT: CURRENT_RELEASE_VERSION niet gevonden in lib/releases.ts\n')
  process.exit(1)
}

const major      = parseInt(match[1])
const minor      = parseInt(match[2])
const newVersion = `v${major}.${minor + 1}`

// Dutch date string
const now    = new Date()
const months = ['januari','februari','maart','april','mei','juni','juli',
                'augustus','september','oktober','november','december']
const dateStr = `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`

const placeholder = `  {
    version: '${newVersion}',
    date: '${dateStr}',
    changes: [
      {
        label: 'Nieuw',
        title: 'TODO — invullen na deploy',
        body: 'TODO — beschrijving invullen.',
      },
    ],
  },
`

// Insert new entry at top of RELEASES array
let updated = content.replace(
  /export const RELEASES: ReleaseEntry\[\] = \[/,
  `export const RELEASES: ReleaseEntry[] = [\n${placeholder}`
)

// Update CURRENT_RELEASE_VERSION to point to the new entry
updated = updated.replace(
  /const CURRENT_RELEASE_VERSION\s*=\s*'v\d+\.\d+'/,
  `const CURRENT_RELEASE_VERSION = '${newVersion}'`
)

if (updated === content) {
  process.stderr.write('FOUT: niets aangepast in lib/releases.ts\n')
  process.exit(1)
}

fs.writeFileSync(releasesPath, updated)

process.stderr.write(`✓ Versie v${major}.${minor} → ${newVersion}\n`)
process.stdout.write(newVersion)
