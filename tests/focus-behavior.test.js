const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const repoRoot = path.resolve(__dirname, "..")
const mainSource = fs.readFileSync(
  path.join(repoRoot, "electron", "main.ts"),
  "utf8"
)
const shortcutsSource = fs.readFileSync(
  path.join(repoRoot, "electron", "shortcuts.ts"),
  "utf8"
)

function extractBlock(source, signature) {
  const start = source.indexOf(signature)
  assert.notEqual(start, -1, `Could not find block: ${signature}`)

  const openingBrace = source.indexOf("{", start)
  assert.notEqual(openingBrace, -1, `Could not find opening brace: ${signature}`)

  let depth = 0
  for (let index = openingBrace; index < source.length; index += 1) {
    const char = source[index]
    if (char === "{") depth += 1
    if (char === "}") depth -= 1
    if (depth === 0) {
      return source.slice(start, index + 1)
    }
  }

  throw new Error(`Could not find closing brace for block: ${signature}`)
}

function extractSecondInstanceHandlers(source) {
  const handlers = []
  const signature = 'app.on("second-instance"'
  let searchStart = 0

  while (searchStart < source.length) {
    const handlerStart = source.indexOf(signature, searchStart)
    if (handlerStart === -1) break

    const openingBrace = source.indexOf("{", handlerStart)
    assert.notEqual(openingBrace, -1, "Malformed second-instance handler")

    let depth = 0
    let handlerEnd = -1
    for (let index = openingBrace; index < source.length; index += 1) {
      const char = source[index]
      if (char === "{") depth += 1
      if (char === "}") depth -= 1
      if (depth === 0) {
        handlerEnd = index
        break
      }
    }

    assert.notEqual(handlerEnd, -1, "Malformed second-instance handler body")
    handlers.push(source.slice(handlerStart, handlerEnd + 1))
    searchStart = handlerEnd + 1
  }

  return handlers
}

test("createWindow keeps existing window path non-focusing", () => {
  const createWindowBlock = extractBlock(
    mainSource,
    "async function createWindow(): Promise<void>"
  )
  const beforeWindowSettings = createWindowBlock.split(
    "const windowSettings: Electron.BrowserWindowConstructorOptions ="
  )[0]

  assert.match(beforeWindowSettings, /\bshowMainWindow\(\)/)
  assert.doesNotMatch(beforeWindowSettings, /\.focus\(/)
})

test("window creation uses non-activating initial show strategy", () => {
  assert.match(
    mainSource,
    /const windowSettings: Electron\.BrowserWindowConstructorOptions =[\s\S]*?\bshow:\s*false,/
  )
})

test("showMainWindow uses showInactive and does not call focus", () => {
  const showMainWindowBlock = extractBlock(mainSource, "function showMainWindow(): void")

  assert.match(showMainWindowBlock, /\.showInactive\(/)
  assert.doesNotMatch(showMainWindowBlock, /\.focus\(/)
})

test("second-instance handlers reveal without explicit focus", () => {
  const handlers = extractSecondInstanceHandlers(mainSource)
  assert.ok(handlers.length >= 1, "Expected at least one second-instance handler")

  for (const handler of handlers) {
    assert.match(handler, /\bshowMainWindow\(\)|\bcreateWindow\(\)/)
    assert.doesNotMatch(handler, /\.focus\(/)
  }
})

test("global shortcuts module does not call focus directly", () => {
  assert.doesNotMatch(shortcutsSource, /\.focus\(/)
})
