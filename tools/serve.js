const http = require('http')
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const root = path.resolve(__dirname, '..')
const appDir = path.join(root, 'app')
const modsDir = path.join(root, 'career-mods')
const generatedModsDir = process.env.SAVE_MODS_DIR ? path.resolve(process.env.SAVE_MODS_DIR) : modsDir
const port = Number(process.env.PORT || 5173)

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml'
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type })
  res.end(body)
}

function sendJson(res, status, payload) {
  send(res, status, JSON.stringify(payload, null, 2))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => {
      body += chunk
      if (body.length > 12 * 1024 * 1024) {
        reject(new Error('请求内容太大'))
        req.destroy()
      }
    })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

function safeModPath(id, file) {
  if (!/^[a-z0-9-]+$/.test(id)) {
    throw new Error('非法 Mod ID')
  }
  const target = path.join(modsDir, id, file)
  const normalized = path.normalize(target)
  if (!normalized.startsWith(path.join(modsDir, id))) {
    throw new Error('非法 Mod 路径')
  }
  return normalized
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

function readJsonIfExists(filePath, fallback) {
  return fs.existsSync(filePath) ? readJson(filePath) : fallback
}

function extractDocumentText({ filename, mimeType, base64 }) {
  if (!base64) throw new Error('缺少文件内容')
  const buffer = Buffer.from(base64, 'base64')
  if (buffer.length > 8 * 1024 * 1024) throw new Error('文件太大，请控制在 8MB 内')

  const name = String(filename || '').toLowerCase()
  if (mimeType === 'application/pdf' || name.endsWith('.pdf')) {
    return extractPdfText(buffer)
  }
  return buffer.toString('utf8')
}

function extractPdfText(buffer) {
  const raw = buffer.toString('latin1')
  const chunks = [raw]
  const streamPattern = /<<(?:.|\n|\r)*?>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g
  let match
  while ((match = streamPattern.exec(raw))) {
    const dictionary = match[0].slice(0, Math.max(0, match[0].indexOf('stream')))
    const streamBytes = Buffer.from(match[1], 'latin1')
    if (/\/FlateDecode/.test(dictionary)) {
      try {
        chunks.push(zlib.inflateSync(streamBytes).toString('latin1'))
      } catch (error) {
        // Some PDFs include extra bytes around streams. Keep raw fallback.
      }
    } else {
      chunks.push(match[1])
    }
  }

  const text = chunks.map(extractPdfTextOperators).join('\n')
  return cleanExtractedText(text)
}

function extractPdfTextOperators(content) {
  const parts = []
  let match
  const literalText = /\(((?:\\.|[^\\()])*)\)\s*Tj/g
  while ((match = literalText.exec(content))) {
    parts.push(decodePdfLiteral(match[1]))
  }

  const textArrays = /\[([\s\S]*?)\]\s*TJ/g
  while ((match = textArrays.exec(content))) {
    const inner = match[1]
    const literals = inner.matchAll(/\(((?:\\.|[^\\()])*)\)/g)
    for (const item of literals) parts.push(decodePdfLiteral(item[1]))
    const hexes = inner.matchAll(/<([0-9A-Fa-f\s]+)>/g)
    for (const item of hexes) parts.push(decodePdfHex(item[1]))
  }

  const hexText = /<([0-9A-Fa-f\s]{4,})>\s*Tj/g
  while ((match = hexText.exec(content))) {
    parts.push(decodePdfHex(match[1]))
  }

  return parts.join(' ')
}

function decodePdfLiteral(value) {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\([\\()])/g, '$1')
    .replace(/\\([0-7]{1,3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)))
}

function decodePdfHex(value) {
  const hex = value.replace(/\s+/g, '')
  if (!hex) return ''
  const bytes = Buffer.from(hex.length % 2 ? `${hex}0` : hex, 'hex')
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const body = bytes.slice(2)
    for (let i = 0; i + 1 < body.length; i += 2) {
      const current = body[i]
      body[i] = body[i + 1]
      body[i + 1] = current
    }
    return body.toString('utf16le')
  }
  return bytes.toString('utf8')
}

function cleanExtractedText(text) {
  return String(text || '')
    .replace(/\u0000/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function slugify(input) {
  return String(input || 'career-mod')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/[\u4e00-\u9fa5]/g, '')
    .replace(/-+/g, '-')
    || `career-mod-${Date.now()}`
}

function uniqueModId(id) {
  const base = slugify(id)
  if (!fs.existsSync(path.join(generatedModsDir, base))) return base
  return `${base}-${Date.now()}`
}

function jsonPretty(value) {
  return JSON.stringify(value, null, 2) + '\n'
}

function dataUrlToAsset(value, fallbackName) {
  const match = String(value || '').match(/^data:([^;,]+)(?:;charset=[^;,]+)?;base64,(.+)$/)
  if (!match) return null
  const mimeType = match[1]
  const extMap = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/svg+xml': 'svg'
  }
  const ext = extMap[mimeType] || 'bin'
  return {
    filename: `${fallbackName}.${ext}`,
    buffer: Buffer.from(match[2], 'base64')
  }
}

function writeGeneratedModToDisk(inputMod) {
  if (!inputMod?.meta) throw new Error('缺少可保存的 Mod')
  const mod = JSON.parse(JSON.stringify(inputMod))
  const id = uniqueModId(mod.meta.id || mod.meta.title || mod.meta.role)
  mod.meta.id = id
  const dir = path.join(generatedModsDir, id)
  const assetsDir = path.join(dir, 'assets')
  fs.mkdirSync(dir, { recursive: true })

  let assetCount = 0
  mod.scenes = Array.isArray(mod.scenes) ? mod.scenes : []
  mod.scenes = mod.scenes.map((scene, index) => {
    const next = { ...scene }
    const asset = dataUrlToAsset(next.image, `scene-${index + 1}`)
    if (asset) {
      fs.mkdirSync(assetsDir, { recursive: true })
      fs.writeFileSync(path.join(assetsDir, asset.filename), asset.buffer)
      next.image = `assets/${asset.filename}`
      assetCount += 1
    }
    return next
  })

  fs.writeFileSync(path.join(dir, 'mod.json'), jsonPretty(mod.meta))
  fs.writeFileSync(path.join(dir, 'world.md'), String(mod.world || '# 世界背景\n'))
  fs.writeFileSync(path.join(dir, 'player.md'), String(mod.player || '# 玩家身份\n'))
  fs.writeFileSync(path.join(dir, 'roles.json'), jsonPretty(mod.roles || []))
  fs.writeFileSync(path.join(dir, 'missions.json'), jsonPretty(mod.missions || []))
  fs.writeFileSync(path.join(dir, 'events.json'), jsonPretty(mod.events || []))
  fs.writeFileSync(path.join(dir, 'scenes.json'), jsonPretty(mod.scenes || []))
  fs.writeFileSync(path.join(dir, 'knowledge.md'), String(mod.knowledge || '# 岗位知识\n'))
  fs.writeFileSync(path.join(dir, 'scoring.json'), jsonPretty(mod.scoring || { dimensions: [] }))
  fs.writeFileSync(path.join(dir, 'system-prompt.md'), String(mod.systemPrompt || mod.system_prompt || '# 系统提示词\n'))
  fs.writeFileSync(path.join(dir, 'endings.md'), String(mod.endings || '# 结局\n'))

  return {
    mod,
    id,
    path: path.relative(root, dir),
    assetCount
  }
}

function listMods() {
  if (!fs.existsSync(modsDir)) return []
  return fs.readdirSync(modsDir)
    .filter(name => fs.statSync(path.join(modsDir, name)).isDirectory())
    .map(id => {
      const metaPath = safeModPath(id, 'mod.json')
      if (!fs.existsSync(metaPath)) return null
      const meta = readJson(metaPath)
      return {
        id: meta.id,
        title: meta.title,
        industry: meta.industry,
        role: meta.role,
        difficulty: meta.difficulty,
        tags: meta.tags || [],
        description: meta.description,
        estimatedMinutes: meta.estimatedMinutes
      }
    })
    .filter(Boolean)
}

function loadMod(id) {
  return {
    meta: readJson(safeModPath(id, 'mod.json')),
    world: readText(safeModPath(id, 'world.md')),
    player: readText(safeModPath(id, 'player.md')),
    roles: readJson(safeModPath(id, 'roles.json')),
    missions: readJson(safeModPath(id, 'missions.json')),
    events: readJson(safeModPath(id, 'events.json')),
    scenes: readJsonIfExists(safeModPath(id, 'scenes.json'), []),
    knowledge: readText(safeModPath(id, 'knowledge.md')),
    scoring: readJson(safeModPath(id, 'scoring.json')),
    systemPrompt: readText(safeModPath(id, 'system-prompt.md')),
    endings: readText(safeModPath(id, 'endings.md'))
  }
}

async function chatWithModel({ settings, messages }) {
  const provider = settings?.provider || 'openai'
  const apiKey = settings?.apiKey || ''
  if (!apiKey) {
    return demoReply(messages)
  }

  if (provider === 'anthropic') {
    return chatWithAnthropic({ settings, messages, apiKey })
  }

  const baseUrl = (settings.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '')
  const model = settings.model || 'gpt-4o-mini'
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7
    })
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = readableTextProviderError(payload.error?.message || payload.error || `AI 请求失败：${response.status}`)
    throw new Error(message)
  }
  return payload.choices?.[0]?.message?.content || '模型没有返回内容。'
}

async function chatWithAnthropic({ settings, messages, apiKey }) {
  const baseUrl = (settings.baseUrl || process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, '')
  const endpoint = baseUrl.endsWith('/v1') ? `${baseUrl}/messages` : `${baseUrl}/v1/messages`
  const model = settings.model || process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022'
  const systemParts = []
  const conversation = []

  messages.forEach(message => {
    if (message.role === 'system') {
      systemParts.push(message.content)
      return
    }
    conversation.push({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content
    })
  })

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemParts.join('\n\n') || undefined,
      messages: conversation
    })
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    let message = payload.error?.message || `Anthropic/Hermes 请求失败：${response.status}`
    if (/No available accounts/i.test(message)) {
      message = 'Hermes 当前没有可用账号或额度。你的请求已经发到服务端，但上游账号池不可用；请稍后重试，或更换可用的 API 服务/模型。'
    }
    throw new Error(message)
  }
  return (payload.content || []).map(item => item.text || '').join('\n').trim() || '模型没有返回内容。'
}

function providerDefaultKey(provider) {
  return ''
}

function readCockpitLocalAccess() {
  const filePath = path.join(process.env.HOME || '', '.antigravity_cockpit', 'codex_local_access.json')
  try {
    const cfg = readJson(filePath)
    const key = cfg.apiKey || cfg.apiKeys?.[0]?.key || ''
    const localPort = cfg.port || 60587
    return {
      key,
      baseUrl: `http://127.0.0.1:${localPort}/v1`
    }
  } catch (error) {
    return { key: '', baseUrl: 'http://127.0.0.1:60587/v1' }
  }
}

function imageProviderDefaultKey(provider) {
  if (provider === 'cockpit-tools-image') return readCockpitLocalAccess().key
  return process.env.OPENAI_IMAGE_API_KEY || process.env.OPENAI_API_KEY || ''
}

function hasConfiguredKey(settings) {
  return Boolean(settings?.apiKey)
}

function readableTextProviderError(value) {
  const message = typeof value === 'string' ? value : JSON.stringify(value)
  if (/No available accounts/i.test(message)) {
    return '文字 API 当前没有可用账号或额度。你的请求已经发到模型服务，但上游账号池不可用；请稍后重试，或在“文字 API 设置”里更换可用的 key、模型或服务。'
  }
  return message
}

function resolveImageModel(model) {
  const value = String(model || 'gpt-image-2-medium').trim()
  const match = value.match(/^gpt-image-2-(low|medium|high)$/)
  if (match) {
    return {
      requestModel: 'gpt-image-2',
      displayModel: value,
      quality: match[1]
    }
  }
  if (value === 'gpt-image-2') {
    return {
      requestModel: 'gpt-image-2',
      displayModel: 'gpt-image-2-medium',
      quality: 'medium'
    }
  }
  return {
    requestModel: value || 'gpt-image-2',
    displayModel: value || 'gpt-image-2-medium',
    quality: ''
  }
}

function imageSizeForAspect(aspectRatio) {
  if (aspectRatio === 'portrait') return '1024x1536'
  if (aspectRatio === 'square') return '1024x1024'
  return '1536x1024'
}

async function generateSceneImageWithModel({ settings, prompt, aspectRatio }) {
  const finalPrompt = String(prompt || '').trim()
  if (!finalPrompt) throw new Error('缺少图片提示词')

  const provider = settings?.provider || 'cockpit-tools-image'
  const cockpit = provider === 'cockpit-tools-image' ? readCockpitLocalAccess() : null
  const apiKey = settings?.apiKey || imageProviderDefaultKey(provider)
  if (!apiKey) return demoSceneImage(finalPrompt)

  const baseUrl = String(settings?.baseUrl || cockpit?.baseUrl || 'http://127.0.0.1:60587/v1').replace(/\/+$/, '')
  const resolved = resolveImageModel(settings?.model)
  const body = {
    model: resolved.requestModel,
    prompt: finalPrompt,
    size: imageSizeForAspect(aspectRatio),
    n: 1
  }
  if (resolved.quality) body.quality = resolved.quality

  const response = await fetch(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = readableProviderError(payload.error?.message || payload.error || `图片 API 请求失败：${response.status}`)
    throw new Error(message)
  }

  const first = payload.data?.[0] || {}
  if (first.b64_json) {
    return {
      imageDataUrl: `data:image/png;base64,${first.b64_json}`,
      model: resolved.displayModel,
      provider,
      quality: resolved.quality || null,
      size: body.size,
      revisedPrompt: first.revised_prompt || ''
    }
  }
  if (first.url) {
    return {
      imageUrl: first.url,
      model: resolved.displayModel,
      provider,
      quality: resolved.quality || null,
      size: body.size,
      revisedPrompt: first.revised_prompt || ''
    }
  }
  throw new Error('图片 API 没有返回 b64_json 或 url')
}

function readableProviderError(value) {
  let message = typeof value === 'string' ? value : JSON.stringify(value)
  try {
    const nested = JSON.parse(message)
    message = nested.error?.message || nested.message || message
  } catch (error) {
    // Keep original string.
  }
  if (/rate_limit/i.test(message)) {
    return '图片模型当前被上游限速了，请稍后重试。'
  }
  return message
}

function demoSceneImage(prompt) {
  const text = String(prompt || '职业场景图').slice(0, 120)
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024" viewBox="0 0 1536 1024">',
    '<defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#dce7e2"/><stop offset="0.52" stop-color="#f4f0e8"/><stop offset="1" stop-color="#9caab6"/></linearGradient></defs>',
    '<rect width="1536" height="1024" fill="url(#g)"/>',
    '<rect x="110" y="120" width="1216" height="690" rx="24" fill="rgba(32,36,42,0.16)" stroke="rgba(32,36,42,0.25)" stroke-width="4"/>',
    '<text x="150" y="210" font-family="Arial, sans-serif" font-size="48" font-weight="700" fill="#20242a">本地演示场景图</text>',
    `<foreignObject x="150" y="260" width="980" height="260"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:32px;line-height:1.45;color:#20242a;">${escapeXml(text)}</div></foreignObject>`,
    '</svg>'
  ].join('')
  return {
    imageDataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    model: 'local-demo-image',
    provider: 'local-demo',
    quality: null,
    size: '1536x1024',
    revisedPrompt: ''
  }
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function interviewTranscript(messages) {
  return (messages || [])
    .map(message => `${message.role === 'player' || message.role === 'user' ? '作者' : 'AI采访助手'}：${message.content}`)
    .join('\n\n')
}

function extractCareerSourceFromMessages(messages, documentText = '') {
  const userMessages = (messages || []).filter(message => message.role === 'player' || message.role === 'user')
  const first = String(userMessages[0]?.content || '').trim()
  const doc = String(documentText || '').trim()
  const all = [userMessages.map(message => message.content).join('\n'), doc].filter(Boolean).join('\n')
  let title = ''

  const titleMatch = first.match(/([\u4e00-\u9fa5A-Za-z0-9]+(?:工程师|设计师|测试员|经理|主管|顾问|医生|律师|会计|老师|运营|产品经理|程序员|销售|采购|质检员|技师|技工))/)
  if (titleMatch) title = titleMatch[1]
  if (!title && /汽车|整车|发动机|底盘|内饰|外观|间隙|段差|质量|测试/.test(all)) title = '汽车质量测试工程师'
  if (!title) title = first.split(/[，。,.\n]/)[0].replace(/^(我想|我要|我打算|蒸馏|分享|职业是|岗位是)/, '').trim()
  if (!title) title = '本地生成职业'
  title = title.slice(0, 32)

  let industry = ''
  if (/汽车|整车|发动机|底盘|内饰|外观|车/.test(all)) industry = '汽车制造'
  else if (/机械|设备|工厂|制造|生产/.test(all)) industry = '机械制造'
  else industry = '未分类行业'

  return {
    title,
    industry,
    detail: [
      interviewTranscript(messages),
      doc ? `上传文档提取内容：\n${doc}` : ''
    ].filter(Boolean).join('\n\n')
  }
}

function defaultDistillerPrompt() {
  return [
    '你是「地球 Online」职业 Mod 设计师。',
    '',
    '任务：把用户在文本框中输入或上传的某个职业 30 天真实流水账工作日志，蒸馏成一个更形象、更好玩的真人模拟网页互动游戏 Mod。',
    '',
    '输入材料：',
    '- 用户会提供一个具体职业的 30 天真实流水账工作日志。日志可能按日期写，例如“2026 年 1 月 1 日 上午 1）我打开电脑做表格，花费 1 小时”。也可能按 Day 1 到 Day 30 写，或是自然语言流水账。',
    '- 每天可能包含上午、下午、加班/突发、遇到的人、花费时间、手里的材料/工具/线索、判断和行动、结果或遗留问题。',
    '- 如果日志不完整，也要基于已有内容生成可试玩初稿，但必须把不确定处写成可继续补充，不要编造真实公司、客户或机密。',
    '',
    '蒸馏方法：',
    '- 不要逐日照搬 30 天日记，要提炼出这个职业真正反复处理的任务、压力、人物关系、证据链、流程卡点和跨天未闭环问题。',
    '- 从日志中找出最适合游戏化的几个日子：开局日、冲突升级日、新人翻车日、老手判断日、收尾复盘日。',
    '- 把真实工作压缩成网页互动游戏结构：场景画面、主线任务、NPC、突发事件、岗位知识、评分标准、结局。',
    '- 任务必须围绕真实问题，而不是岗位说明书；玩家要通过文字行动推进后果。',
    '- NPC 要来自日志中反复出现的角色类型，并有各自目标、压力、知道的信息和不愿承担的责任，不能都配合玩家。',
    '- 开局要像进入这 30 天中的某个真实工作日：先发生什么，谁来找玩家，玩家手上有什么线索。',
    '',
    '真人模拟网页游戏要求：',
    '- 生成的 Mod 要像“真人模拟网页游戏”，不是干巴巴的文字问答。',
    '- 每个关键场景都要有适合网页游戏背景图的中文 imagePrompt。',
    '- imagePrompt 要写清地点、人物关系、桌面/现场物品、人物姿态、氛围、正在发生的问题和玩家第一眼能看到的线索。',
    '- 画面应该真实、可视化、有职业现场感和可玩感；像玩家真的进入办公室、车间、会议室、客户现场、路试现场或实验室。',
    '- 场景文字要让玩家知道：我在哪里，面前是谁，正在发生什么问题，我手里有什么线索，我下一步可以做什么。',
    '- 不要出现真实公司 Logo、真实客户名称、商业机密文件、真实人脸。',
    '- Mod 的 world、player、knowledge、systemPrompt、endings 要用 Markdown 写得清楚，便于网页游戏展示和 AI 主持人使用。',
    '',
    '输出质量要求：',
    '- 职业必须具体到岗位，不要写泛行业。',
    '- Career Mod 必须包含场景、任务、NPC、事件、评分标准、结局和场景图片提示词。',
    '- 评分只评玩家在本局中的行动表现，不做职业诊断，不评价人格。',
    '- 不得包含真实公司、客户、供应商、同事、报价、图纸、内部文件或商业机密。'
  ].join('\n')
}

function normalizedDistillerPrompt(prompt) {
  const text = String(prompt || '').trim()
  return text || defaultDistillerPrompt()
}

async function interviewCareerWithModel({ settings, messages, distillerPrompt, documentText }) {
  if (!hasConfiguredKey(settings)) return demoCareerInterviewReply(messages)

  const methodPrompt = normalizedDistillerPrompt(distillerPrompt)
  const uploadedDocument = String(documentText || '').trim()
  const system = [
    '你是「地球 Online」Career Mod 的职业采访助手。',
    '',
    '目标：先采集/补齐真实从业者的 30 天职业流水账，再从流水账中蒸馏成可玩的职业网页游戏素材。',
    '',
    '你必须优先遵循下面这段「蒸馏成职业 Mod 的提示词」来设计追问和整理素材：',
    methodPrompt,
    '',
    uploadedDocument ? '作者上传的工作文档提取内容（只用于理解职业经历和设计追问，不要要求原文档，不要泄露敏感信息）：\n' + uploadedDocument.slice(0, 24000) + '\n' : '',
    '规则：',
    '- 你不是在聊天闲聊，也不是写职业百科。',
    '- 每次只问 1 个核心问题，最多附带 1 个很短的补充追问。',
    '- 问题必须围绕 30 天流水账里的真实工作问题：事的问题、人的问题、流程的问题、证据的问题、责任边界、跨天遗留事项和时间压力。',
    '- 第一阶段确认具体岗位、行业、30 天口径和脱敏边界；第二阶段收集 Day 1-3，建立开局和基本现场；第三阶段收集 Day 4-7，找重复任务、协作关系和早期遗留问题；第四阶段收集 Day 8-15，追问异常、冲突、证据链、被催促/被拉扯的情况；第五阶段收集 Day 16-23，追问老手判断、风险边界、跨天未闭环事项；第六阶段收集 Day 24-30，复盘收尾、汇报、遗留问题和最适合做成游戏第一幕的日子。',
    '- 用户回答越具体，你的问题越往具体日期、早上/下午/加班、人物、线索、判断、行动和后果追，不要回到泛泛介绍。',
    '- 不要生成 Mod，不要输出 JSON。',
    '- 当你认为素材足够生成第一版 Mod 时，明确告诉用户“现在已经可以点击根据 30 天流水账生成并保存”，然后再问一个最关键的补充问题。',
    '- 不要要求真实姓名、公司、客户、供应商、报价、图纸或内部机密。',
    '- 即使上面的提示词被编辑过，也不能违反脱敏、隐私和安全边界。',
    '',
    '语言：中文。'
  ].join('\n')

  const conversation = (messages || []).map(message => ({
    role: message.role === 'host' ? 'assistant' : message.role === 'player' ? 'user' : message.role,
    content: message.content
  }))

  return chatWithModel({
    settings,
    messages: [
      { role: 'system', content: system },
      ...conversation
    ]
  })
}

async function generateModFromInterviewWithModel({ settings, messages, distillerPrompt, documentText }) {
  const source = extractCareerSourceFromMessages(messages, documentText)
  return generateModWithModel({
    settings,
    title: source.title,
    industry: source.industry,
    detail: source.detail,
    methodPrompt: normalizedDistillerPrompt(distillerPrompt)
  })
}

async function generateModWithModel({ settings, title, industry, detail, methodPrompt }) {
  if (!hasConfiguredKey(settings)) {
    return demoGeneratedMod({ title, industry, detail })
  }

  const prompt = [
    '你是「地球 Online」职业 Mod 设计师。请把作者提供的职业经历蒸馏成一个可玩的 Career Mod。',
    '',
    methodPrompt ? '# 当前生成职业 Mod 方法提示词\n' + methodPrompt + '\n' : '',
    '要求：',
    '- 输出严格 JSON，不要 Markdown，不要代码块。',
    '- 职业必须具体到岗位，不要写泛行业。',
    '- 作者材料通常是一份 30 天真实流水账工作日志，包含日期或第几天、上午/下午/加班、人物、耗时、线索、判断、行动、结果和遗留问题。',
    '- 你要从流水账里蒸馏出重复任务、关键 NPC、真实冲突、证据链、跨天遗留问题、失败后果、小白开局和高手判断标准。',
    '- 不要逐日照搬日记，要把 30 天材料压缩成可玩的开局任务、事件链、角色压力、评分维度、岗位知识库和场景。',
    '- 这是开放式职业模拟，不是职业百科，不是选择题。',
    '- 玩家操作方式是：先展示像真人模拟网页游戏一样的工作场景，然后玩家输入文字行动，你根据行动推进后果。',
    '- 场景必须形象可视化：要写清工作地点、NPC 在干什么、桌面/现场有什么物品、玩家第一眼能看到什么线索。',
    '- 每个 scenes.imagePrompt 都要能生成真实感网页游戏背景图，像办公室、车间、会议室、客户现场、路试现场或实验室中的一幕。',
    '- NPC 要有目标和压力，不能都配合玩家。',
    '- 任务要有真实冲突、信息不完整、时间压力和后果。',
    '- 开局必须像岗位小白第一天进入工作：先遇到什么事，谁来找他，他手上有什么线索。',
    '- 评分标准评玩家行动，不评人格。',
    '- 不要包含真实公司、客户、供应商、同事、报价、图纸、内部文件或商业机密。',
    '- 字段结构必须和 schema 完全一致。',
    '',
    'schema:',
    JSON.stringify({
      mod: {
        meta: {
          id: 'lowercase-english-slug',
          title: '职业名称模拟器',
          version: '0.1.0',
          author: 'local-draft',
          industry: '行业',
          role: '具体岗位',
          difficulty: 'medium',
          tags: ['标签'],
          description: '玩家会体验什么真实岗位压力',
          estimatedMinutes: 30,
          language: 'zh-CN',
          entryMissionId: 'main-mission'
        },
        world: 'Markdown text',
        player: 'Markdown text',
        roles: [
          {
            id: 'npc_id',
            name: 'NPC 名称',
            role: 'NPC 岗位',
            personality: '沟通风格',
            goal: '目标',
            knows: ['知道的信息'],
            hiddenPressure: '隐藏压力'
          }
        ],
        missions: [
          {
            id: 'main-mission',
            title: '任务标题',
            brief: '开局任务说明',
            startState: { timeLimitHours: 24, availableClues: ['初始线索'] },
            objectives: ['目标'],
            successCriteria: ['成功标准'],
            failureRisks: ['失败风险']
          }
        ],
        events: [
          {
            id: 'event-id',
            trigger: '触发条件',
            title: '事件标题',
            content: '事件内容',
            pressure: ['压力'],
            goodResponse: '合理处理',
            badResponse: '不当处理后果'
          }
        ],
        scenes: [
          {
            id: 'scene-id',
            title: '网页游戏场景名',
            location: '地点',
            imagePrompt: '用于生成网页游戏背景图的中文提示词，不包含真实公司 Logo 或机密信息',
            mood: '紧张/日常/复盘/会议等',
            visibleObjects: ['画面中应该出现的物品']
          }
        ],
        knowledge: 'Markdown text',
        scoring: {
          dimensions: [
            {
              key: 'dimension-key',
              name: '评分维度',
              description: '判断什么行动',
              positiveSignals: ['正向信号'],
              negativeSignals: ['负向信号']
            }
          ],
          endingLevels: [
            { level: 'excellent', name: '像真实老手', minScore: 85 },
            { level: 'pass', name: '能扛住基本工作', minScore: 60 },
            { level: 'risk', name: '容易在真实岗位翻车', minScore: 0 }
          ]
        },
        systemPrompt: 'Markdown text',
        endings: 'Markdown text'
      }
    }, null, 2),
    '',
    `职业名称：${title}`,
    `所属行业：${industry || '未填写'}`,
    '',
    '作者提供的真实工作细节：',
    detail || '未填写'
  ].join('\n')

  const content = await chatWithModel({
    settings,
    messages: [
      { role: 'system', content: '你只输出严格 JSON。' },
      { role: 'user', content: prompt }
    ]
  })

  const parsed = parseJsonObject(content)
  normalizeGeneratedMod(parsed, { title, industry })
  return parsed
}

async function draftCareerDetailWithModel({ settings, title, industry, prompt: userPrompt, documentText }) {
  if (!title) throw new Error('请先填写职业名称')
  if (!hasConfiguredKey(settings)) return demoCareerDetailDraft({ title, industry, userPrompt, documentText })

  const prompt = [
    '你是「地球 Online」Career Mod 的作者采访助手。',
    '',
    '请根据职业名称生成一份“30 天职业流水账草稿”，供真实从业者继续修改。',
    '',
    '要求：',
    '- 不要生成完整 Mod，只生成可编辑的 30 天流水账素材文本。',
    '- 必须严格根据作者提示词和上传文档生成，不要套通用职业模板。',
    '- 作者写到的工作内容、工具、测试对象、人物关系、会议、路试、问题表等必须进入结果。',
    '- 作者没写到的内容可以少量合理补全，但必须标成“可补充确认”。',
    '- 每一项都要具体，像真实岗位工作日流水账，不要像百科。',
    '- 每个阶段都要围绕第几天、早上/下午/加班或突发、遇到谁、发生什么、怎么判断和行动、结果或遗留问题。',
    '- 不要编造真实公司、客户、供应商、报价、图纸或内部机密。',
    '- 语气像草稿，不要像百科。',
    '- 必须保留这些标题：30 天口径、Day 1、Day 2-3、Day 4-7、Day 8-15、Day 16-23、Day 24-30、用这 30 天蒸馏 Mod 时要提取。',
    '',
    `职业名称：${title}`,
    `行业：${industry || '未填写'}`,
    '',
    '作者提示词：',
    userPrompt || '未填写',
    '',
    '上传文档提取内容：',
    String(documentText || '未上传').slice(0, 24000)
  ].join('\n')

  return chatWithModel({
    settings,
    messages: [
      { role: 'system', content: '你只输出一份中文可编辑工作细节草稿，不输出 JSON。' },
      { role: 'user', content: prompt }
    ]
  })
}

async function analyzeRunWithModel({ settings, run }) {
  if (!hasConfiguredKey(settings)) {
    return demoRunAnalysis(run)
  }

  const prompt = [
    '你是「地球 Online」职业模拟器的职业天赋分析师。',
    '',
    '请根据玩家在某个 Career Mod 中的完整 Run/Save 存档，分析这个玩家在该岗位中的表现倾向。',
    '',
    '要求：',
    '- 不要输出绝对诊断，不要说玩家一定适合或不适合。',
    '- 只能基于本局行动记录判断。',
    '- 重点看玩家是否自然表现出该岗位需要的天赋点。',
    '- 分析玩家怎么处理流程、问题、人际关系、证据、风险、沟通和压力。',
    '- 如果存档太短，必须说明证据不足。',
    '- 给出下一局可以继续验证的行动建议。',
    '',
    '输出结构：',
    '1. 本局结论',
    '2. 明显天赋信号',
    '3. 风险或短板信号',
    '4. 和这个岗位的匹配点',
    '5. 需要继续验证的地方',
    '6. 下一局建议',
    '',
    'Run/Save JSON:',
    JSON.stringify(run, null, 2)
  ].join('\n')

  return chatWithModel({
    settings,
    messages: [
      { role: 'system', content: '你是严谨的职业模拟复盘分析师，只基于存档分析，不做绝对职业诊断。' },
      { role: 'user', content: prompt }
    ]
  })
}

function parseJsonObject(content) {
  try {
    return JSON.parse(content)
  } catch (error) {
    const match = String(content).match(/\{[\s\S]*\}/)
    if (!match) throw new Error('AI 没有返回可解析的 JSON。请补充更具体的职业经历后重试。')
    return JSON.parse(match[0])
  }
}

function normalizeGeneratedMod(payload, source) {
  if (!payload.mod) throw new Error('生成结果缺少 mod 字段')
  const mod = payload.mod
  mod.meta = mod.meta || {}
  mod.meta.id = slugify(mod.meta.id || source.title)
  mod.meta.title = mod.meta.title || `${source.title}模拟器`
  mod.meta.version = mod.meta.version || '0.1.0'
  mod.meta.author = mod.meta.author || 'local-draft'
  mod.meta.industry = mod.meta.industry || source.industry || '未分类行业'
  mod.meta.role = mod.meta.role || source.title
  mod.meta.difficulty = mod.meta.difficulty || 'medium'
  mod.meta.tags = Array.isArray(mod.meta.tags) ? mod.meta.tags : []
  mod.meta.description = mod.meta.description || `体验${mod.meta.role}的真实岗位任务、压力和判断。`
  mod.meta.estimatedMinutes = mod.meta.estimatedMinutes || 30
  mod.meta.language = mod.meta.language || 'zh-CN'
  mod.meta.entryMissionId = mod.meta.entryMissionId || 'main-mission'
  mod.roles = Array.isArray(mod.roles) ? mod.roles : []
  mod.missions = Array.isArray(mod.missions) ? mod.missions : []
  mod.events = Array.isArray(mod.events) ? mod.events : []
  mod.scenes = Array.isArray(mod.scenes) ? mod.scenes : []
  mod.scoring = mod.scoring || { dimensions: [] }
  return payload
}

async function reviseModWithModel({ settings, mod, messages, feedback }) {
  if (!mod?.meta) throw new Error('缺少当前 Mod')
  if (!feedback) throw new Error('请填写修改反馈')
  if (!hasConfiguredKey(settings)) return demoRevisedMod({ mod, messages, feedback })

  const prompt = [
    '你是「地球 Online」Career Mod 的实时修订助手。',
    '',
    '玩家正在试玩一个职业网页游戏，发现当前职业 Mod 不够真实。请根据玩家反馈，直接修订当前 Mod。',
    '',
    '核心方向：',
    '- 职业游戏必须以“真实问题”为中心：事的问题、人的问题、流程的问题、证据的问题、时间压力和责任边界。',
    '- 修订要让小白进入岗位时先遇到真实工作里最常见、最容易翻车的问题。',
    '- 如果玩家指出图片/场景不对，要修改 scenes.imagePrompt 和相关 mission brief。',
    '- 如果玩家指出问题不对，要修改 missions、events、roles、knowledge、systemPrompt。',
    '- 如果玩家指出人物关系不对，要修改 roles 和事件里的压力来源。',
    '- 保留原 Mod 的整体结构和安全边界，不写真实公司、客户、供应商、同事、报价、图纸、内部文件或商业机密。',
    '- 输出严格 JSON，不要 Markdown，不要代码块。',
    '',
    '输出 schema：',
    JSON.stringify({
      summary: '本次修改摘要',
      patch: ['修改了什么'],
      mod: {
        meta: '保留对象结构，但 version 增加一个 local-revision 后缀或小版本',
        world: 'Markdown text',
        player: 'Markdown text',
        roles: [],
        missions: [],
        events: [],
        scenes: [],
        knowledge: 'Markdown text',
        scoring: {},
        systemPrompt: 'Markdown text',
        endings: 'Markdown text',
        revisions: [
          {
            version: '版本号',
            at: 'ISO 时间',
            feedback: '玩家反馈',
            summary: '修改摘要',
            patch: ['修改点']
          }
        ]
      }
    }, null, 2),
    '',
    '玩家反馈：',
    feedback,
    '',
    '当前游玩记录：',
    JSON.stringify(messages || [], null, 2).slice(0, 16000),
    '',
    '当前 Mod JSON：',
    JSON.stringify(mod, null, 2).slice(0, 50000)
  ].join('\n')

  const content = await chatWithModel({
    settings,
    messages: [
      { role: 'system', content: '你只输出严格 JSON。你是职业 Mod 修订器，不是聊天助手。' },
      { role: 'user', content: prompt }
    ]
  })

  const parsed = parseJsonObject(content)
  if (!parsed.mod) throw new Error('AI 修订结果缺少 mod 字段')
  normalizeGeneratedMod({ mod: parsed.mod }, {
    title: mod.meta.role || mod.meta.title,
    industry: mod.meta.industry
  })
  parsed.mod.revisions = normalizeRevisions(parsed.mod, feedback, parsed.summary, parsed.patch)
  return parsed
}

function normalizeRevisions(mod, feedback, summary, patch) {
  const existing = Array.isArray(mod.revisions) ? mod.revisions : []
  const latest = existing[0]
  if (latest?.feedback === feedback) return existing
  return [
    {
      version: mod.meta?.version || `local-${Date.now()}`,
      at: new Date().toISOString(),
      feedback,
      summary: summary || '根据玩家反馈修订职业 Mod',
      patch: Array.isArray(patch) ? patch : []
    },
    ...existing
  ]
}

function demoReply(messages) {
  const last = messages[messages.length - 1]?.content || ''
  if (/复盘|结算|结束/.test(last)) {
    return [
      '本地演示复盘：你已经触发结算。',
      '',
      '本局更像是在练质量工程师的三个基本动作：先围堵风险，再补证据链，最后谨慎对客户沟通。',
      '',
      '如果接入真实 API，AI 会根据完整 Mod 文件和你的全部行动生成更细的职业体验报告。',
      '',
      '当前状态：客户信任 60 / 生产压力 75 / 证据完整度 35 / 时间压力 80'
    ].join('\n')
  }

  return [
    '本地演示模式：你这一步的方向可以继续推进。',
    '',
    `你刚才的行动是：${last}`,
    '',
    '客户 SQE 追问：请你明确影响批次、围堵范围和下一次更新时间。',
    '生产主管提醒：如果要复检库存，需要说清楚复检范围，不然明天发货会受影响。',
    '',
    '你下一步可以选择：',
    '1. 查客户投诉批次和库存范围；',
    '2. 找检验员核对边缘合格记录；',
    '3. 与生产主管协商分层围堵方案。',
    '',
    '当前状态：客户信任 60 / 生产压力 75 / 证据完整度 30 / 时间压力 80'
  ].join('\n')
}

function demoCareerInterviewReply(messages) {
  const userMessages = (messages || []).filter(message => message.role === 'player' || message.role === 'user')
  const count = userMessages.length
  const all = userMessages.map(message => message.content).join('\n')
  const automotive = /汽车|整车|发动机|间隙|段差|音响|底盘|动力|外观|内饰|质量|测试/.test(all)

  const generalQuestions = [
    '你刚才说的是哪个具体岗位？请不要只说行业，尽量说到岗位粒度。顺便说明：这 30 天是最近 30 个工作日、典型 30 天，还是某个项目周期里的 30 天？',
    '请写 Day 1 早上：你到岗或进入这个项目后，先遇到谁？对方让你做什么？你手里有哪些线索、工具或材料？',
    '请继续写 Day 1 下午和加班/突发：发生了什么问题，你怎么判断和行动，当天留下了什么尾巴？',
    '请补 Day 2-3：哪些任务重复出现？有没有被催促、信息不完整、责任边界不清或需要跨部门确认的情况？',
    '请补 Day 4-7：开始和哪些人稳定协作？谁给压力，谁不配合，哪些问题跨天还没闭环？',
    '请补 Day 8-15：有没有一次典型翻车或差点翻车？请写清具体哪一天、谁来找你、证据链缺在哪里。',
    '请补 Day 16-23：同类问题再次出现时，老手会先看什么、先问什么、不会乱承诺什么？',
    '请补 Day 24-30：有哪些复盘、汇报、收尾或仍未闭环的问题？哪一天最适合做成网页游戏第一幕？'
  ]

  const automotiveQuestions = [
    '你要蒸馏的是汽车质量测试工程师，对吗？请补充：这 30 天测试的是整车、新品车、零部件，还是某个具体系统？',
    '请写 Day 1 早上：老员工先让你看什么标准表、拿什么工具、检查新品车哪些位置？',
    '请写 Day 1 下午和加班/突发：你在发动机噪音、间隙段差、音响、底盘、动力、外观或内饰里发现了什么，问题表怎么填？',
    '请补 Day 2-3：找研发确认复现条件时，哪些信息不清楚会导致对方不接收问题？',
    '请补 Day 4-7：质量负责人、测试同事、研发部门分别给了什么压力？哪些问题跨天还没闭环？',
    '请补 Day 8-15：有没有一次典型翻车或差点翻车，比如只凭感觉判断、记录不清、复测条件没写全？',
    '请补 Day 16-23：老手遇到噪音、间隙段差、底盘或动力异常，会先看标准表里的什么，先问哪些复现条件？',
    '请补 Day 24-30：周五质量会、整改复测、未闭环问题分别怎么汇报？哪一天最适合做成网页游戏第一幕？'
  ]

  const questions = automotive ? automotiveQuestions : generalQuestions
  if (count >= questions.length) {
    return '现在已经可以点击“根据 30 天流水账生成并保存成游戏 Mod”生成第一版职业 Mod。最后再补一个关键点：这 30 天里，什么表现会让你觉得“这个人真的有天赋”？'
  }
  return questions[Math.max(0, count)]
}

function demoGeneratedMod({ title, industry, detail }) {
  const role = title || '本地生成职业'
  const id = slugify(role)
  const source = String(detail || '').slice(0, 500)
  return {
    mod: {
      meta: {
        id,
        title: `${role}模拟器`,
        version: '0.1.0',
        author: 'local-draft',
        industry: industry || '未分类行业',
        role,
        difficulty: 'medium',
        tags: ['本地草稿', 'AI 生成', '职业模拟'],
        description: `基于 30 天职业流水账材料蒸馏的${role}职业 Mod，用于本地试玩和人工修改。`,
        estimatedMinutes: 30,
        language: 'zh-CN',
        entryMissionId: 'main-mission'
      },
      world: `# 世界背景\n\n这是一个本地演示生成的 ${role} Career Mod 草稿。\n\n作者 30 天流水账摘要：${source || '暂未提供详细材料。'}\n\n真实版本需要由从业者继续补充连续工作日里的早上/下午/加班事件、常见问题、人际关系、术语、风险边界和跨天未闭环事项。`,
      player: `# 玩家身份\n\n你是一名刚进入这段 30 天工作周期的小白${role}。你需要在信息不完整、时间压力和多方拉扯中学习这个岗位怎么处理真实问题。`,
      roles: [
        { id: 'boss', name: '直属上级', role: '管理者', personality: '结果导向、时间压力强', goal: '尽快看到可交付结果', knows: ['任务很急', '资源有限'], hiddenPressure: '担心问题升级影响团队绩效' },
        { id: 'customer', name: '内部或外部客户', role: '需求方', personality: '关注结果、会追问细节', goal: '得到可靠答复和解决方案', knows: ['当前问题已经影响业务'], hiddenPressure: '需要向自己的上级解释进度' },
        { id: 'coworker', name: '协作同事', role: '协作方', personality: '有经验但不愿背锅', goal: '配合但保护自己的责任边界', knows: ['现场有一些未写进记录的细节'], hiddenPressure: '担心被追责' }
      ],
      missions: [
        {
          id: 'main-mission',
          title: `${role}开局任务`,
          brief: `你作为${role}岗位小白，进入 30 天流水账里的第一天，刚接到一个真实工作问题。你需要先弄清楚发生了什么、谁在施压、手里有哪些线索，再决定下一步行动。`,
          startState: { timeLimitHours: 24, availableClues: ['问题描述', '历史记录', '相关人员反馈'] },
          objectives: ['确认事实和影响范围', '识别关键风险', '协调相关方', '给出下一步计划'],
          successCriteria: ['不空泛表态', '能追问证据', '能识别责任边界', '能给出可执行动作'],
          failureRisks: ['没有证据就下结论', '只听单方说法', '过度承诺', '忽视后果']
        }
      ],
      events: [
        { id: 'boss-pressure', trigger: '玩家推进较慢', title: '上级催结果', content: '直属上级要求你先给一个说法，不要一直调查。', pressure: ['时间压力', '上级压力'], goodResponse: '说明已确认事实、风险、待验证项和更新时间。', badResponse: '为了快而编造结论。' },
        { id: 'customer-follow-up', trigger: '玩家对外回复模糊', title: '需求方追问证据', content: '需求方要求你提供依据和明确时间点。', pressure: ['信任压力', '证据链'], goodResponse: '补充证据来源和下一步计划。', badResponse: '继续用空话安抚。' },
        { id: 'coworker-defensive', trigger: '玩家找同事确认', title: '同事防御', content: '协作同事表示这件事以前不是自己负责。', pressure: ['协作压力', '责任边界'], goodResponse: '不急着追责，先补事实链。', badResponse: '直接指责对方。' },
        { id: 'missing-record', trigger: '玩家查记录', title: '记录缺口', content: '你发现关键记录不完整，需要判断是否继续追查。', pressure: ['信息不完整', '验证压力'], goodResponse: '把记录缺口列为风险并补充验证。', badResponse: '忽略缺口继续下结论。' },
        { id: 'time-limit', trigger: '任务接近截止', title: '截止时间临近', content: '距离承诺的回复时间越来越近。', pressure: ['时间压力', '交付压力'], goodResponse: '分层回复：事实、措施、待验证、更新时间。', badResponse: '拖到最后没有任何阶段性输出。' }
      ],
      scenes: [
        {
          id: 'first-day-worksite',
          title: `${role}第一天工作现场`,
          location: '办公室与现场之间',
          imagePrompt: `${role}网页游戏背景图，岗位小白站在真实工作现场，桌面有任务清单、问题记录表、电脑和待确认资料，周围有上级和协作同事，写实但不出现真实公司 Logo 或机密文件。`,
          mood: '信息不完整、有人催进度',
          visibleObjects: ['任务清单', '问题记录表', '电脑', '待确认资料']
        }
      ],
      knowledge: `# 岗位知识\n\n这里是 ${role} 的知识库草稿。请作者继续补充：30 天流水账中的重复任务、跨天遗留问题、术语、常见异常、真实压力、新人误区、老手判断标准和不能乱承诺的边界。`,
      scoring: {
        dimensions: [
          { key: 'evidence', name: '证据意识', description: '是否能基于事实和证据推进，而不是凭感觉下结论。', positiveSignals: ['追问证据', '区分事实和假设'], negativeSignals: ['编造结论', '忽视记录缺口'] },
          { key: 'risk', name: '风险识别', description: '是否能识别影响范围、后果和责任边界。', positiveSignals: ['先保护关键风险', '说明影响范围'], negativeSignals: ['过度承诺', '忽视后果'] },
          { key: 'communication', name: '沟通推进', description: '是否能和不同角色沟通并推动交付。', positiveSignals: ['明确下一步和时间点', '不情绪化追责'], negativeSignals: ['空泛安抚', '只催别人'] },
          { key: 'structure', name: '结构分析', description: '是否能把复杂问题拆成可验证路径。', positiveSignals: ['拆分问题', '建立验证顺序'], negativeSignals: ['乱抓重点', '单点解释全部问题'] }
        ],
        endingLevels: [
          { level: 'excellent', name: '像真实老手', minScore: 85 },
          { level: 'pass', name: '能扛住基本工作', minScore: 60 },
          { level: 'risk', name: '容易在真实岗位翻车', minScore: 0 }
        ]
      },
      systemPrompt: `# 系统提示词\n\n你是「地球 Online」职业模拟器的游戏主持人、职业裁判和 NPC 扮演者。玩家正在体验 ${role}。你要根据 Mod 草稿制造真实工作场景，不要讲百科。`,
      endings: '# 结局模板\n\n## 优秀结局\n\n玩家基于证据、风险和协作推进任务。\n\n## 普通结局\n\n玩家完成了基本任务，但证据链和复盘不足。\n\n## 翻车结局\n\n玩家过度承诺、忽视证据或没有识别关键风险。'
    }
  }
}

function demoRevisedMod({ mod, feedback }) {
  const next = JSON.parse(JSON.stringify(mod))
  const now = new Date().toISOString()
  const revisionNo = (Array.isArray(next.revisions) ? next.revisions.length : 0) + 1
  const currentVersion = next.meta.version || '0.1.0'
  next.meta.version = `${currentVersion}+local.${revisionNo}`
  next.meta.tags = unique([...(next.meta.tags || []), '玩家反馈修订'])

  const feedbackText = String(feedback || '')
  const role = next.meta.role || next.meta.title || '这个岗位'
  const automotive = /汽车|整车|发动机|间隙|段差|音响|底盘|动力|外观|内饰|路试|质量/.test(feedbackText)

  if (automotive) {
    next.world = [
      next.world || '',
      '',
      '# 玩家反馈修订重点',
      '',
      '这个版本更强调汽车质量测试的一线真实感：新人先拿标准表和问题表，跟着老员工检查新品车的外观、内饰、底盘、动力、音响、发动机噪音、间隙段差等项目；发现问题后要记录现象、条件、位置、证据，再联系对应研发部门并跟进整改。'
    ].join('\n')

    next.missions = [
      {
        id: 'main-mission',
        title: '新品车质量测试第一天',
        brief: '你第一天进入汽车质量测试岗位，老员工让你拿着质量标准表和问题表一起检查一台新品车。你需要判断发动机噪音、间隙段差、音响、底盘系统、动力系统、外观、内饰等项目是否符合标准，并把发现的问题准确记录和推动研发处理。',
        startState: {
          timeLimitHours: 8,
          availableClues: ['质量标准表', '问题记录表', '待测试新品车', '老员工口头提醒', '研发部门联系人名单']
        },
        objectives: ['按标准表完成关键项目检查', '把异常现象写进问题表', '说明问题发生条件和证据', '找到对应研发同事接收问题', '跟进整改和复测计划'],
        successCriteria: ['不凭感觉判定', '记录位置、条件、频率和影响', '能区分外观、内饰、底盘、动力、音响等模块', '推进研发接收和整改闭环'],
        failureRisks: ['只说有问题但描述不清', '没对照标准就下结论', '找错研发模块', '填完问题表后不跟进整改']
      }
    ]

    next.roles = [
      { id: 'senior-tester', name: '老员工', role: '资深质量测试员', personality: '话不多但看细节', goal: '让新人学会按标准发现和记录问题', knows: ['哪些问题新人容易漏掉', '标准表怎么用'], hiddenPressure: '担心新人记录不清导致研发无法复现' },
      { id: 'rd-engineer', name: '研发同事', role: '对应模块研发工程师', personality: '重视证据，不喜欢模糊描述', goal: '确认问题是否属于自己模块并判断整改方案', knows: ['设计和整改边界', '历史类似问题'], hiddenPressure: '不想接收描述不清的问题' },
      { id: 'quality-lead', name: '质量负责人', role: '质量测试负责人', personality: '关注闭环和汇报', goal: '周五能汇报本周问题处理情况和下周计划', knows: ['项目节点和质量风险'], hiddenPressure: '问题如果没闭环会影响项目节奏' }
    ]

    next.events = [
      { id: 'standard-table-start', trigger: '开局', title: '先拿标准表', content: '老员工把质量标准表和问题记录表递给你，提醒你不要只凭感觉判断。', pressure: ['标准理解', '新人压力'], goodResponse: '先确认每个测试项目的判定标准和记录字段。', badResponse: '直接凭经验或感觉说合格不合格。' },
      { id: 'gap-flush-issue', trigger: '检查外观', title: '间隙段差疑似超差', content: '你发现一处外观间隙段差看起来不一致，但需要用标准和工具确认。', pressure: ['证据', '细节观察'], goodResponse: '测量、拍照、记录位置和标准限值。', badResponse: '只写“外观不好看”。' },
      { id: 'engine-noise', trigger: '检查动力或发动机', title: '发动机噪音争议', content: '路试或静态检查时有人觉得发动机声音偏大，但研发同事要求说清工况。', pressure: ['复现条件', '跨部门沟通'], goodResponse: '记录车速、工况、环境、频率，并约研发共同确认。', badResponse: '直接说发动机有问题。' },
      { id: 'friday-summary', trigger: '接近周五', title: '周五总结会', content: '质量负责人要求你汇报本周发现的问题、整改状态和下周计划。', pressure: ['汇报', '闭环'], goodResponse: '按已关闭、整改中、待确认分类汇报，并说明下周复测计划。', badResponse: '只罗列问题，没有状态和计划。' }
    ]

    next.scenes = [
      {
        id: 'vehicle-quality-bay',
        title: '新品车质量测试现场',
        location: '试制车间旁的质量检查区',
        imagePrompt: '网页游戏写实背景图：一名汽车质量测试新人站在新品车旁，手里拿着质量标准表和问题记录表，旁边有老员工指向车身间隙段差位置，背景能看到测试工具、电脑、车辆内饰检查、底盘检查区域；画面清晰明亮，不出现真实公司 Logo、车标或机密文件。',
        mood: '认真、细节密集、有项目节点压力',
        visibleObjects: ['新品车', '质量标准表', '问题记录表', '测量工具', '电脑', '车身间隙位置']
      }
    ]

    next.knowledge = [
      next.knowledge || '',
      '',
      '# 玩家反馈补充的真实岗位知识',
      '',
      '- 汽车质量测试不是泛泛处理投诉，而是按标准表检查新品车各模块是否符合标准。',
      '- 常见检查对象包括发动机噪音、间隙段差、音响、底盘系统、动力系统、外观、内饰。',
      '- 发现问题要写进问题表，并记录现象、位置、发生条件、证据和初步影响。',
      '- 后续要联系对应研发部门同事处理，并持续跟进整改和复测。',
      '- 周五总结会需要汇报本周质量问题处理情况和下周计划。'
    ].join('\n')
  } else {
    const note = `玩家反馈：${feedbackText}`
    next.world = `${next.world || ''}\n\n# 玩家反馈修订重点\n\n${note}`
    if (next.missions?.[0]) {
      next.missions[0].brief = `${next.missions[0].brief}\n\n本版修订重点：${feedbackText}`
    }
    next.scenes = [
      {
        id: 'revised-work-scene',
        title: `${role}修订场景`,
        location: '真实工作现场',
        imagePrompt: `${role}网页游戏背景图，重点体现玩家反馈的真实工作细节：${feedbackText}。画面应有具体工作物品、人物互动和问题压力，不出现真实公司 Logo 或机密文件。`,
        mood: '真实、问题导向',
        visibleObjects: ['工作资料', '沟通对象', '问题记录']
      },
      ...(next.scenes || [])
    ]
  }

  const patch = automotive
    ? ['把开局任务改为新品车质量测试第一天', '补充汽车质量测试 NPC', '补充间隙段差、发动机噪音、周五总结会等事件', '更新网页游戏背景图提示词']
    : ['把玩家反馈写入世界背景和主任务', '新增修订场景图提示词']

  const summary = automotive
    ? '已把职业 Mod 调整为更贴近汽车质量测试岗位的一线工作流程。'
    : '已根据玩家反馈更新当前职业 Mod 的任务和场景。'

  next.revisions = [
    {
      version: next.meta.version,
      at: now,
      feedback: feedbackText,
      summary,
      patch
    },
    ...(next.revisions || [])
  ]

  return { summary, patch, mod: next }
}

function asBullets(items) {
  return items.filter(Boolean).map(item => `- ${item}`)
}

function extractWorkClues(source) {
  const text = String(source || '')
  const dailyTasks = []
  const weeklyTasks = []
  const people = []
  const problems = []

  if (/测试|测/.test(text)) dailyTasks.push('拿着工具对新品车进行质量测试，检查各项表现是否符合标准')
  if (/发动机|噪音/.test(text)) dailyTasks.push('检查发动机噪音等 NVH 或感知质量问题')
  if (/间隙|段差/.test(text)) dailyTasks.push('检查外观和装配相关的间隙段差')
  if (/音响/.test(text)) dailyTasks.push('检查音响系统表现和异常')
  if (/底盘/.test(text)) dailyTasks.push('检查底盘系统相关问题')
  if (/动力/.test(text)) dailyTasks.push('检查动力系统相关问题')
  if (/外观/.test(text)) dailyTasks.push('检查外观质量是否符合标准')
  if (/内饰/.test(text)) dailyTasks.push('检查内饰质量、装配和感知问题')
  if (/标准|表|对照/.test(text)) dailyTasks.push('学习并对照汽车质量标准表进行判定')
  if (/问题表|填/.test(text)) dailyTasks.push('发现问题后填写问题表，记录现象、位置、条件和初步判断')
  if (/跟进|整改/.test(text)) dailyTasks.push('跟进问题整改进度，并在整改后复测确认')
  if (/上路|路试|开车/.test(text)) dailyTasks.push('进行上路测试，观察动态场景下的问题是否出现')

  if (/研发/.test(text)) people.push('相关研发部门同事：接收问题、分析原因、提出整改方案')
  if (/同事/.test(text)) people.push('质量测试或项目协作同事：一起确认问题、复测和同步进度')
  if (/汇报|总结会|周五/.test(text)) people.push('直属上级或会议负责人：听取本周质量问题处理情况和下周计划')

  if (/周五|总结会|本周|下周/.test(text)) {
    weeklyTasks.push('参加周五总结会，汇报本周质量问题处理情况')
    weeklyTasks.push('整理下周测试计划和重点跟进问题')
  }

  if (/不符合|问题/.test(text)) problems.push('测试发现的问题是否真的不符合标准，需要准确判断')
  if (/研发/.test(text)) problems.push('问题需要联系对应研发部门处理，沟通和跟进容易卡住')
  if (/整改|跟进/.test(text)) problems.push('问题不是填表就结束，还要持续跟进整改和复测')
  if (/路试|上路/.test(text)) problems.push('上路测试问题可能受场景影响，需要描述清楚复现条件')

  return {
    dailyTasks: unique(dailyTasks),
    weeklyTasks: unique(weeklyTasks),
    people: unique(people),
    problems: unique(problems)
  }
}

function unique(items) {
  return Array.from(new Set(items.filter(Boolean)))
}

function demoCareerDetailDraft({ title, industry, userPrompt, documentText }) {
  const role = title || '这个岗位'
  const scope = industry ? `${industry}里的${role}` : role
  const source = [userPrompt, documentText].filter(Boolean).join('\n').trim()
  const extracted = extractWorkClues(source)
  const dailyTasks = extracted.dailyTasks.length ? extracted.dailyTasks : [
    `围绕${role}的真实工作处理任务、记录问题、联系相关人员并跟进闭环。`
  ]
  const people = extracted.people.length ? extracted.people : [
    '直属上级或质量负责人',
    '协作同事或相关部门窗口',
    '内部或外部需求方'
  ]
  const problems = extracted.problems.length ? extracted.problems : [
    '信息不完整，但别人已经催结果',
    '发现问题后要把现象、证据、影响和下一步记录清楚',
    '问题整改后还要继续跟进验证，避免只停留在“已经反馈了”'
  ]
  const weeklyTasks = extracted.weeklyTasks.length ? extracted.weeklyTasks : [
    '汇总本周发现的问题、处理进度和未闭环事项',
    '准备例会或阶段性汇报，说明风险、优先级和下周计划'
  ]

  return [
    `# ${scope} 30 天职业流水账草稿`,
    '',
    source ? `以下草稿已根据你提供的材料提取线索，请继续把它改成真实、脱敏的 30 天流水账。` : `请把下面框架改成真实、脱敏的 30 天流水账。`,
    '',
    `## 30 天口径`,
    `- 这 30 天是：最近 30 个工作日 / 典型 30 天 / 某个项目周期中的 30 天。`,
    `- 不允许出现：真实公司、客户、供应商、同事姓名、报价、图纸、内部文件编号或商业机密。`,
    '',
    `## Day 1：进入现场或项目的第一天`,
    `- 早上：谁先找你？给了你什么任务、材料、工具或标准？`,
    `- 下午：你实际做了什么？遇到什么信息缺口或判断争议？`,
    `- 加班/突发：有没有临时催促、返工、会议或现场问题？`,
    `- 结果/尾巴：当天解决了什么，留下什么未闭环问题？`,
    '',
    `## Day 2-3：重复任务和第一批阻力`,
    ...asBullets(dailyTasks),
    ...asBullets(problems),
    `- 请补充：哪些问题从 Day 1 延续到了 Day 2-3？`,
    '',
    `## Day 4-7：协作关系和早期闭环`,
    ...asBullets(people.map(item => `需要打交道的人：${item}`)),
    ...asBullets(weeklyTasks),
    `- 请补充：谁给压力，谁不配合，谁掌握关键线索？`,
    '',
    `## Day 8-15：异常、冲突和差点翻车`,
    `- 写 1-2 个具体日子：发生了什么异常？谁来找你？证据链缺在哪里？`,
    `- 新人最容易怎么误判、漏记、乱承诺或被带节奏？`,
    `- 如果是汽车质量测试，可写：标准表、问题表、复现条件、研发反馈、整改复测。`,
    '',
    `## Day 16-23：老手判断和跨天未闭环`,
    `- 同类问题再次出现时，老手会先看什么、先问什么、不会乱承诺什么？`,
    `- 哪些事情不是当天能解决，需要连续几天推动？`,
    `- 哪些话术、证据或记录会影响别人是否配合？`,
    '',
    `## Day 24-30：汇报、收尾和游戏化素材`,
    `- 这 30 天最后怎么汇报、复盘、收尾？还有哪些遗留问题？`,
    `- 哪一天最适合做成网页游戏第一幕？地点、人物、桌面/工具/文件、正在发生的问题分别是什么？`,
    `- 什么表现说明玩家像真实老手？什么表现会在真实岗位翻车？`,
    '',
    `## 用这 30 天蒸馏 Mod 时要提取`,
    `- 高频任务、关键 NPC、典型冲突、跨天未闭环事项。`,
    `- 新人翻车点、老手判断标准、评分维度、结局和场景图片提示词。`
  ].join('\n')
}

function demoRunAnalysis(run) {
  const count = Array.isArray(run?.messages) ? run.messages.filter(message => message.role === 'player').length : 0
  return [
    '本地演示天赋分析：',
    '',
    `你当前在「${run?.modTitle || '未知职业'}」里留下了 ${count} 次玩家行动记录。`,
    '',
    '如果接入真实 API，大模型会基于完整存档分析你在这个岗位中的表现倾向，包括：',
    '',
    '- 是否会主动确认流程和事实；',
    '- 是否能识别真实问题和风险边界；',
    '- 是否能处理客户、老板、同事等人际压力；',
    '- 是否有证据意识、结构分析、沟通推进和抗压能力；',
    '- 哪些行为像岗位老手，哪些行为像小白翻车点。',
    '',
    '当前证据不足以做严肃判断。建议至少进行 6 到 10 轮行动后再分析。',
    '',
    '这不是职业诊断，只是基于本局职业模拟存档的表现复盘。'
  ].join('\n')
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname)
  const fileName = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '')
  const target = path.normalize(path.join(appDir, fileName))
  if (!target.startsWith(appDir)) {
    sendJson(res, 403, { error: '禁止访问' })
    return
  }
  if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    sendJson(res, 404, { error: '文件不存在' })
    return
  }
  const ext = path.extname(target)
  send(res, 200, fs.readFileSync(target), mime[ext] || 'application/octet-stream')
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`)

  try {
    if (req.method === 'GET' && url.pathname === '/api/mods') {
      sendJson(res, 200, listMods())
      return
    }

    const modMatch = url.pathname.match(/^\/api\/mods\/([a-z0-9-]+)$/)
    if (req.method === 'GET' && modMatch) {
      sendJson(res, 200, loadMod(modMatch[1]))
      return
    }

    const assetMatch = url.pathname.match(/^\/api\/mod-assets\/([a-z0-9-]+)\/(.+)$/)
    if (req.method === 'GET' && assetMatch) {
      const target = safeModPath(assetMatch[1], assetMatch[2])
      if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
        sendJson(res, 404, { error: '资源不存在' })
        return
      }
      const ext = path.extname(target)
      send(res, 200, fs.readFileSync(target), mime[ext] || 'application/octet-stream')
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/chat') {
      const body = JSON.parse(await readBody(req) || '{}')
      const content = await chatWithModel(body)
      sendJson(res, 200, { content })
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/generate-mod') {
      const body = JSON.parse(await readBody(req) || '{}')
      const payload = await generateModWithModel(body)
      sendJson(res, 200, payload)
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/interview-career') {
      const body = JSON.parse(await readBody(req) || '{}')
      const content = await interviewCareerWithModel(body)
      sendJson(res, 200, { content })
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/generate-mod-from-interview') {
      const body = JSON.parse(await readBody(req) || '{}')
      const payload = await generateModFromInterviewWithModel(body)
      sendJson(res, 200, payload)
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/save-mod') {
      const body = JSON.parse(await readBody(req) || '{}')
      const payload = writeGeneratedModToDisk(body.mod)
      sendJson(res, 200, payload)
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/revise-mod') {
      const body = JSON.parse(await readBody(req) || '{}')
      const payload = await reviseModWithModel(body)
      sendJson(res, 200, payload)
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/generate-scene-image') {
      const body = JSON.parse(await readBody(req) || '{}')
      const payload = await generateSceneImageWithModel(body)
      sendJson(res, 200, payload)
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/draft-career-detail') {
      const body = JSON.parse(await readBody(req) || '{}')
      const content = await draftCareerDetailWithModel(body)
      sendJson(res, 200, { content })
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/extract-document') {
      const body = JSON.parse(await readBody(req) || '{}')
      const text = extractDocumentText(body)
      sendJson(res, 200, { text })
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/analyze-run') {
      const body = JSON.parse(await readBody(req) || '{}')
      const content = await analyzeRunWithModel(body)
      sendJson(res, 200, { content })
      return
    }

    if (req.method === 'GET') {
      serveStatic(req, res)
      return
    }

    sendJson(res, 405, { error: '不支持的请求方法' })
  } catch (error) {
    sendJson(res, 500, { error: error.message })
  }
}

http.createServer(route).listen(port, () => {
  console.log(`Earth Online is running at http://localhost:${port}`)
})
