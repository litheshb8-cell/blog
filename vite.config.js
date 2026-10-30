import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFile, unlink, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

function inlineHtmlAssets() {
  let outputDirectory

  return {
    name: 'inline-html-assets',
    apply: 'build',
    configResolved(config) {
      outputDirectory = resolve(config.root, config.build.outDir)
    },
    async closeBundle() {
      const htmlPath = resolve(outputDirectory, 'index.html')
      let html = await readFile(htmlPath, 'utf8')
      const filesToRemove = []
      const inlineFile = async (filePath, tag) => {
        const fileName = decodeURIComponent(filePath.replace(/^(?:\.\/|\/)+/, ''))
        const assetPath = resolve(outputDirectory, fileName)
        const contents = await readFile(assetPath, 'utf8')
        filesToRemove.push(assetPath)
        return tag(contents)
      }

      const scriptPattern = /<script\b[^>]*\bsrc="([^"]+\.js)"[^>]*><\/script>/g
      const stylesheetPattern =
        /<link\b(?=[^>]*\brel="stylesheet")[^>]*\bhref="([^"]+\.css)"[^>]*>/g
      let scriptsInlined = 0
      let stylesheetsInlined = 0

      html = await replaceAsync(html, scriptPattern, async (_tag, filePath) => {
        scriptsInlined += 1
        return inlineFile(filePath, (code) => `<script type="module">${code}</script>`)
      })
      html = await replaceAsync(html, stylesheetPattern, async (_tag, filePath) => {
        stylesheetsInlined += 1
        return inlineFile(filePath, (css) => `<style>${css}</style>`)
      })

      if (!scriptsInlined || !stylesheetsInlined) {
        throw new Error('Expected the build to emit a JavaScript bundle and stylesheet')
      }

      await writeFile(htmlPath, html)
      await Promise.all(filesToRemove.map((filePath) => unlink(filePath)))
    },
  }
}

async function replaceAsync(value, pattern, replacer) {
  const matches = [...value.matchAll(pattern)]
  const replacements = await Promise.all(
    matches.map((match) => replacer(...match)),
  )

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const match = matches[index]
    value =
      value.slice(0, match.index) +
      replacements[index] +
      value.slice(match.index + match[0].length)
  }

  return value
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), inlineHtmlAssets()],
  build: {
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    copyPublicDir: false,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  }
})
