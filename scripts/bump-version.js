#!/usr/bin/env node
// scripts/bump-version.js
// Reads the current version from lib/releases.ts, increments the minor number,
// inserts a placeholder release entry at the top, and prints the new version to stdout.

const fs   = require('fs')
const path = require('path')

const releasesPath = path.join(__dirname, '..', 'lib', 'releases.ts')
const content      = fs.readFileSync(releasesPath, 'utf8')

// Find the current version from the first entry in the RELEASES array
const match = content.match(/version:\s*'v(\d+)\.(\d+)'/)
if (!match) {
  process.stderr.write('FOUT: versie niet gevonden in lib/releases.ts\n')
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

const updated = content.replace(
  /export const RELEASES: ReleaseEntry\[\] = \[/,
  `export const RELEASES: ReleaseEntry[] = [\n${placeholder}`
)

if (updated === content) {
  process.stderr.write('FOUT: RELEASES array niet gevonden in lib/releases.ts\n')
  process.exit(1)
}

fs.writeFileSync(releasesPath, updated)

process.stderr.write(`✓ Versie ${major}.${minor} → ${newVersion}\n`)
process.stdout.write(newVersion)
