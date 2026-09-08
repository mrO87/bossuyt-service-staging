import { dirname } from 'path'
import { fileURLToPath } from 'url'
import type { NextConfig } from 'next'

const projectRoot = dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: 'standalone',
  turbopack: {
    root: projectRoot,
  },
}

export default nextConfig
