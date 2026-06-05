const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const modsDir = path.join(root, 'career-mods')
const requiredFiles = [
  'mod.json',
  'world.md',
  'player.md',
  'roles.json',
  'missions.json',
  'events.json',
  'scenes.json',
  'knowledge.md',
  'scoring.json',
  'system-prompt.md',
  'endings.md'
]

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function validateMod(dirName) {
  const dir = path.join(modsDir, dirName)
  const errors = []

  requiredFiles.forEach(file => {
    if (!fs.existsSync(path.join(dir, file))) {
      errors.push(`缺少 ${file}`)
    }
  })

  if (errors.length) return errors

  const meta = readJson(path.join(dir, 'mod.json'))
  const roles = readJson(path.join(dir, 'roles.json'))
  const missions = readJson(path.join(dir, 'missions.json'))
  const events = readJson(path.join(dir, 'events.json'))
  const scoring = readJson(path.join(dir, 'scoring.json'))

  if (meta.id !== dirName) errors.push(`mod.json id 应等于目录名：${dirName}`)
  if (!meta.title) errors.push('mod.json 缺少 title')
  if (!meta.role) errors.push('mod.json 缺少 role')
  if (!Array.isArray(roles) || roles.length < 3) errors.push('roles.json 至少需要 3 个 NPC')
  if (!Array.isArray(missions) || missions.length < 1) errors.push('missions.json 至少需要 1 个任务')
  if (!Array.isArray(events) || events.length < 5) errors.push('events.json 至少需要 5 个事件')
  if (!Array.isArray(scoring.dimensions) || scoring.dimensions.length < 4) errors.push('scoring.json 至少需要 4 个评分维度')

  return errors
}

function main() {
  if (!fs.existsSync(modsDir)) {
    console.error('career-mods/ 目录不存在')
    process.exit(1)
  }

  const dirs = fs.readdirSync(modsDir).filter(name => fs.statSync(path.join(modsDir, name)).isDirectory())
  const ids = new Set()
  let failed = false

  dirs.forEach(dir => {
    const errors = validateMod(dir)
    const meta = readJson(path.join(modsDir, dir, 'mod.json'))
    if (ids.has(meta.id)) errors.push(`重复 Mod ID：${meta.id}`)
    ids.add(meta.id)

    if (errors.length) {
      failed = true
      console.error(`\n${dir}`)
      errors.forEach(error => console.error(`- ${error}`))
    } else {
      console.log(`OK ${dir}`)
    }
  })

  if (failed) process.exit(1)
}

main()
