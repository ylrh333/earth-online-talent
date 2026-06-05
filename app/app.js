const state = {
  mods: [],
  builtInMods: [],
  localMods: [],
  currentMod: null,
  messages: [],
  distillerMessages: [],
  saves: [],
  busy: false
}

const LEGACY_DEFAULT_CAREER_PROMPT = [
  '你是「地球 Online」职业 Mod 生成助手。',
  '',
  '目标：通过一问一答，把真实从业者的职业经历蒸馏成可玩的职业网页游戏 Mod。',
  '',
  '核心方法：',
  '- 先使用你自身对该职业的世界知识，判断这个岗位通常会处理哪些真实问题。',
  '- 然后采用问题导向的追问方式，采集职业作者的真实经历。',
  '- 重点蒸馏工作中真实要解决的问题：事的问题、人的问题、流程的问题、证据的问题、责任边界、时间压力、资源不足、沟通拉扯。',
  '- 每次只问 1 个核心问题，最多附带 1 个很短的补充追问。',
  '- 不要写职业百科，不要只问岗位职责，要追问“具体发生了什么、谁来找你、你手上有什么线索、你怎么判断、你找谁、下一步要什么结果”。',
  '',
  '采访顺序建议：',
  '1. 第一个问题：您打算蒸馏您的哪个职业分享给大家玩呢？',
  '2. 确认具体到岗位，而不是泛行业。例如不要只写汽车行业，要追问是汽车质量测试工程师、汽车设计师、供应商质量工程师，还是售后质量工程师。',
  '3. 问小白第一天会遇到什么事、什么人、手上有什么材料、最容易不知道怎么办的地方。',
  '4. 问每天、每周、每月、每季度、每半年、每年分别要做什么，以及分别要跟哪些人打交道。',
  '5. 问最常见的真实问题、最难推动的人际关系、新人翻车点、老手判断标准、脱敏后的真实案例。',
  '6. 问哪些场景应该做成网页游戏画面，例如办公室、车间、会议室、客户现场、路试现场、实验室等。',
  '',
  '生成 Mod 时：',
  '- 把收集到的真实经历转成网页游戏：展示场景，玩家输入文字行动，AI 根据行动推进后果。',
  '- Career Mod 必须包含场景、任务、NPC、事件、评分标准、结局和场景图片提示词。',
  '- 任务必须围绕真实问题，而不是让玩家背岗位说明书。',
  '- NPC 要有各自目标和压力，不能都配合玩家。',
  '- 开局要像岗位小白第一天进入工作：先遇到什么事，谁来找他，他手上有什么线索。',
  '- 评分只评本局行动表现，不做职业诊断，不评价人格。',
  '- 不得包含真实公司、客户、供应商、同事、报价、图纸、内部文件或商业机密。'
].join('\n')

const LEGACY_30_DAY_INTERVIEW_PROMPT = [
  '你是「地球 Online」职业 Mod 生成助手。',
  '',
  '目标：先把真实从业者的经历整理成 30 天职业流水账，再从流水账中蒸馏出可玩的职业网页游戏 Mod。',
  '',
  '核心方法：',
  '- 先确认具体岗位和 30 天口径：最近 30 个工作日、典型 30 天，或一个项目周期中的 30 天都可以。',
  '- 引导作者按 Day 1 到 Day 30 记录真实工作流水账。每一天尽量包含：早上、下午、加班或突发事件、遇到谁、发生什么、手上有什么线索/工具/材料、自己怎么判断和行动、结果/后果/遗留问题。',
  '- 用户不必一次写满 30 天。可以分段追问：先收 Day 1-3，再收 Day 4-7、Day 8-15、Day 16-23、Day 24-30。',
  '- 重点追问真实问题：事的问题、人的问题、流程的问题、证据的问题、责任边界、时间压力、资源不足、沟通拉扯和跨天未闭环事项。',
  '- 每次只问 1 个核心问题，最多附带 1 个很短的补充追问。',
  '- 不要写职业百科，不要只问岗位职责，要追问“具体是哪一天、早上/下午/加班发生了什么、谁来找你、你手上有什么线索、你怎么判断、你找谁、结果是什么”。',
  '',
  '采访顺序建议：',
  '1. 第一个问题：您打算蒸馏哪个具体职业？这 30 天是最近 30 个工作日、典型 30 天，还是某个项目周期中的 30 天？',
  '2. 确认具体到岗位，而不是泛行业。例如不要只写汽车行业，要追问是汽车质量测试工程师、汽车设计师、供应商质量工程师，还是售后质量工程师。',
  '3. 先收 Day 1-3：小白或真实作者进入这段 30 天时，早上先遇到谁，下午做什么，加班/突发事件是什么，留下什么尾巴。',
  '4. 再收 Day 4-7、Day 8-15、Day 16-23、Day 24-30：追问重复任务、关键 NPC、冲突、证据链、会议/汇报、整改/复盘、未闭环问题。',
  '5. 问哪几天最适合做成游戏任务或事件：新人翻车日、被催促日、冲突升级日、老手判断日、收尾复盘日。',
  '6. 问哪些场景应该做成网页游戏画面，例如办公室、车间、会议室、客户现场、路试现场、实验室等。',
  '',
  '生成 Mod 时：',
  '- 不要逐日照搬 30 天日记，要从流水账中蒸馏成网页游戏：展示场景，玩家输入文字行动，AI 根据行动推进后果。',
  '- Career Mod 必须包含场景、任务、NPC、事件、评分标准、结局和场景图片提示词。',
  '- 任务必须来自 30 天里真实出现过的高频任务、关键异常、跨天遗留问题或人物冲突，而不是让玩家背岗位说明书。',
  '- NPC 要来自流水账中反复出现的角色类型，并有各自目标和压力，不能都配合玩家。',
  '- 开局要像进入这 30 天的第一天：先遇到什么事，谁来找他，他手上有什么线索。',
  '- 评分只评本局行动表现，不做职业诊断，不评价人格。',
  '- 不得包含真实公司、客户、供应商、同事、报价、图纸、内部文件或商业机密。'
].join('\n')

const DEFAULT_CAREER_PROMPT = [
  '你是「地球 Online」职业 Mod 设计师。',
  '',
  '任务：把用户在文本框中输入的某个职业 30 天工作日志，蒸馏成一个图文并茂、可玩的职业模拟器网页游戏 Mod。',
  '',
  '输入材料：',
  '- 用户会提供一个具体职业的 30 天工作日志。日志可能按 Day 1 到 Day 30 写，也可能是自然语言流水账。',
  '- 每天可能包含早上、下午、加班/突发、遇到的人、手里的材料/工具/线索、判断和行动、结果或遗留问题。',
  '- 如果日志不完整，也要基于已有内容生成可试玩初稿，但必须把不确定处写成可继续补充，不要编造真实公司、客户或机密。',
  '',
  '蒸馏方法：',
  '- 不要逐日照搬 30 天日记，要提炼出这个职业真正反复处理的任务、压力、人物关系、证据链、流程卡点和跨天未闭环问题。',
  '- 从日志中找出最适合游戏化的几个日子：开局日、冲突升级日、新人翻车日、老手判断日、收尾复盘日。',
  '- 把真实工作压缩成网页游戏结构：场景画面、主线任务、NPC、突发事件、岗位知识、评分标准、结局。',
  '- 任务必须围绕真实问题，而不是岗位说明书；玩家要通过文字行动推进后果。',
  '- NPC 要来自日志中反复出现的角色类型，并有各自目标、压力、知道的信息和不愿承担的责任，不能都配合玩家。',
  '- 开局要像进入这 30 天中的某个真实工作日：先发生什么，谁来找玩家，玩家手上有什么线索。',
  '',
  '图文并茂要求：',
  '- 每个关键场景都要有适合网页游戏背景图的中文 imagePrompt。',
  '- imagePrompt 要写清地点、人物关系、桌面/现场物品、氛围、正在发生的问题。',
  '- 画面应该真实、可视化、有职业现场感；不要出现真实公司 Logo、真实客户名称、商业机密文件、真实人脸。',
  '- Mod 的 world、player、knowledge、systemPrompt、endings 要用 Markdown 写得清楚，便于网页游戏展示和 AI 主持人使用。',
  '',
  '输出质量要求：',
  '- 职业必须具体到岗位，不要写泛行业。',
  '- Career Mod 必须包含场景、任务、NPC、事件、评分标准、结局和场景图片提示词。',
  '- 评分只评玩家在本局中的行动表现，不做职业诊断，不评价人格。',
  '- 不得包含真实公司、客户、供应商、同事、报价、图纸、内部文件或商业机密。'
].join('\n')

const els = {
  modCount: document.querySelector('#modCount'),
  modList: document.querySelector('#modList'),
  modMeta: document.querySelector('#modMeta'),
  modTitle: document.querySelector('#modTitle'),
  modSelect: document.querySelector('#modSelect'),
  loadMod: document.querySelector('#loadMod'),
  missionTitle: document.querySelector('#missionTitle'),
  difficulty: document.querySelector('#difficulty'),
  minutes: document.querySelector('#minutes'),
  sceneVisual: document.querySelector('#sceneVisual'),
  sceneTitle: document.querySelector('#sceneTitle'),
  scenePrompt: document.querySelector('#scenePrompt'),
  generateSceneImage: document.querySelector('#generateSceneImage'),
  sceneImageStatus: document.querySelector('#sceneImageStatus'),
  messages: document.querySelector('#messages'),
  objectives: document.querySelector('#objectives'),
  scoring: document.querySelector('#scoring'),
  roles: document.querySelector('#roles'),
  provider: document.querySelector('#provider'),
  baseUrl: document.querySelector('#baseUrl'),
  model: document.querySelector('#model'),
  apiKey: document.querySelector('#apiKey'),
  saveSettings: document.querySelector('#saveSettings'),
  imageProvider: document.querySelector('#imageProvider'),
  imageBaseUrl: document.querySelector('#imageBaseUrl'),
  imageModel: document.querySelector('#imageModel'),
  imageApiKey: document.querySelector('#imageApiKey'),
  saveImageSettings: document.querySelector('#saveImageSettings'),
  openGenerator: document.querySelector('#openGenerator'),
  generatorModal: document.querySelector('#generatorModal'),
  careerPrompt: document.querySelector('#careerPrompt'),
  saveCareerPrompt: document.querySelector('#saveCareerPrompt'),
  resetCareerPrompt: document.querySelector('#resetCareerPrompt'),
  distillerMessages: document.querySelector('#distillerMessages'),
  distillerComposer: document.querySelector('#distillerComposer'),
  distillerInput: document.querySelector('#distillerInput'),
  sendDistiller: document.querySelector('#sendDistiller'),
  distillerStatus: document.querySelector('#distillerStatus'),
  careerDocUpload: document.querySelector('#careerDocUpload'),
  careerDocStatus: document.querySelector('#careerDocStatus'),
  clearCareerDoc: document.querySelector('#clearCareerDoc'),
  generateMod: document.querySelector('#generateMod'),
  gameModal: document.querySelector('#gameModal'),
  saves: document.querySelector('#saves'),
  saveRun: document.querySelector('#saveRun'),
  analyzeRun: document.querySelector('#analyzeRun'),
  modFeedback: document.querySelector('#modFeedback'),
  reviseMod: document.querySelector('#reviseMod'),
  revisionStatus: document.querySelector('#revisionStatus'),
  revisionLog: document.querySelector('#revisionLog'),
  restart: document.querySelector('#restart'),
  composer: document.querySelector('#composer'),
  playerInput: document.querySelector('#playerInput'),
  settle: document.querySelector('#settle'),
  send: document.querySelector('#send')
}

let uploadedCareerDoc = null

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

async function getJson(url, options) {
  const res = await fetch(url, options)
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(payload.error || `请求失败：${res.status}`)
  }
  return payload
}

function loadSettings() {
  const settings = JSON.parse(localStorage.getItem('earth-online-settings') || '{}')
  if (settings.provider === 'anthropic' && String(settings.baseUrl || '').includes('max-tabs.com')) {
    settings.provider = 'maxtabs'
    settings.baseUrl = 'https://server.max-tabs.com/v1'
    settings.model = 'claude-opus-4-7'
    localStorage.setItem('earth-online-settings', JSON.stringify(settings))
  }
  els.provider.value = settings.provider || 'maxtabs'
  els.baseUrl.value = settings.baseUrl || 'https://server.max-tabs.com/v1'
  els.model.value = settings.model || 'claude-opus-4-7'
  els.apiKey.value = settings.apiKey || ''
}

function loadImageSettings() {
  const settings = JSON.parse(localStorage.getItem('earth-online-image-settings') || '{}')
  els.imageProvider.value = settings.provider || 'cockpit-tools-image'
  els.imageBaseUrl.value = settings.baseUrl || 'http://127.0.0.1:60587/v1'
  els.imageModel.value = settings.model || 'gpt-image-2-medium'
  els.imageApiKey.value = settings.apiKey || ''
}

function loadCareerPrompt() {
  const savedPrompt = localStorage.getItem('earth-online-career-prompt')
  if (!savedPrompt) {
    els.careerPrompt.value = DEFAULT_CAREER_PROMPT
    return
  }
  if (savedPrompt === LEGACY_DEFAULT_CAREER_PROMPT || savedPrompt === LEGACY_30_DAY_INTERVIEW_PROMPT) {
    localStorage.setItem('earth-online-career-prompt', DEFAULT_CAREER_PROMPT)
    els.careerPrompt.value = DEFAULT_CAREER_PROMPT
    return
  }
  els.careerPrompt.value = savedPrompt
}

function careerPromptValue() {
  return els.careerPrompt.value.trim() || DEFAULT_CAREER_PROMPT
}

function saveSettings() {
  localStorage.setItem('earth-online-settings', JSON.stringify({
    provider: els.provider.value,
    baseUrl: els.baseUrl.value.trim(),
    model: els.model.value.trim(),
    apiKey: els.apiKey.value.trim()
  }))
  addMessage('system', 'API 设置已保存到本机浏览器。')
}

function saveImageSettings() {
  localStorage.setItem('earth-online-image-settings', JSON.stringify({
    provider: els.imageProvider.value,
    baseUrl: els.imageBaseUrl.value.trim(),
    model: els.imageModel.value.trim(),
    apiKey: els.imageApiKey.value.trim()
  }))
  addMessage('system', '图片 API 设置已保存到本机浏览器。')
}

function saveCareerPrompt() {
  localStorage.setItem('earth-online-career-prompt', careerPromptValue())
  els.distillerStatus.textContent = '蒸馏成职业 Mod 的提示词已保存到本机浏览器。'
}

function resetCareerPrompt() {
  els.careerPrompt.value = DEFAULT_CAREER_PROMPT
  saveCareerPrompt()
}

function settingsPayload() {
  return {
    provider: els.provider.value,
    baseUrl: els.baseUrl.value.trim(),
    model: els.model.value.trim(),
    apiKey: els.apiKey.value.trim()
  }
}

function imageSettingsPayload() {
  return {
    provider: els.imageProvider.value,
    baseUrl: els.imageBaseUrl.value.trim(),
    model: els.imageModel.value.trim(),
    apiKey: els.imageApiKey.value.trim()
  }
}

function addMessage(role, content) {
  state.messages.push({ role, content })
  renderMessages()
}

function loadSaves() {
  state.saves = JSON.parse(localStorage.getItem('earth-online-runs') || '[]')
  renderSaves()
}

function persistSaves() {
  localStorage.setItem('earth-online-runs', JSON.stringify(state.saves))
  renderSaves()
}

function currentRunPayload() {
  return {
    id: `run-${Date.now()}`,
    savedAt: new Date().toISOString(),
    modId: state.currentMod?.meta?.id || '',
    modTitle: state.currentMod?.meta?.title || '',
    role: state.currentMod?.meta?.role || '',
    industry: state.currentMod?.meta?.industry || '',
    messages: state.messages,
    modSnapshot: state.currentMod
  }
}

function saveCurrentRun() {
  if (!state.currentMod || state.messages.length <= 1) {
    addMessage('system', '当前还没有足够的游玩过程可保存。')
    return null
  }
  const run = currentRunPayload()
  state.saves = [run, ...state.saves].slice(0, 30)
  persistSaves()
  addMessage('system', `已保存职业存档：${run.modTitle} / ${new Date(run.savedAt).toLocaleString()}`)
  return run
}

function renderSaves() {
  if (!els.saves) return
  if (!state.saves.length) {
    els.saves.innerHTML = '<div class="role-item"><span>还没有保存 Run。</span></div>'
    return
  }
  els.saves.innerHTML = state.saves.slice(0, 6).map(save => `
    <button class="role-item" type="button" data-save-id="${escapeHtml(save.id)}">
      <strong>${escapeHtml(save.modTitle || save.role)}</strong>
      <span>${escapeHtml(new Date(save.savedAt).toLocaleString())} · ${escapeHtml(save.messages.length)} 条记录</span>
    </button>
  `).join('')
}

function loadLocalMods() {
  state.localMods = JSON.parse(localStorage.getItem('earth-online-career-mods') || '[]')
}

function persistLocalMods() {
  localStorage.setItem('earth-online-career-mods', JSON.stringify(state.localMods))
}

function upsertLocalMod(generatedMod) {
  const summary = {
    id: generatedMod.meta.id,
    title: generatedMod.meta.title,
    industry: generatedMod.meta.industry,
    role: generatedMod.meta.role,
    difficulty: generatedMod.meta.difficulty,
    tags: generatedMod.meta.tags || [],
    description: generatedMod.meta.description,
    estimatedMinutes: generatedMod.meta.estimatedMinutes,
    generatedMod
  }
  state.localMods = [summary, ...state.localMods.filter(mod => mod.id !== summary.id)]
  persistLocalMods()
  combineMods()
  renderMods()
  return summary
}

function combineMods() {
  state.mods = [...state.localMods, ...state.builtInMods]
}

function renderMessages(extra) {
  const messages = extra ? [...state.messages, extra] : state.messages
  els.messages.innerHTML = messages.map(message => {
    const roleClass = message.role === 'player' ? 'player' : message.role === 'system' ? 'system' : ''
    return `<article class="message ${roleClass}">${escapeHtml(message.content)}</article>`
  }).join('')
  els.messages.scrollTop = els.messages.scrollHeight
}

function addDistillerMessage(role, content) {
  state.distillerMessages.push({ role, content })
  renderDistillerMessages()
}

function renderDistillerMessages(extra) {
  if (!els.distillerMessages) return
  const messages = extra ? [...state.distillerMessages, extra] : state.distillerMessages
  els.distillerMessages.innerHTML = messages.map(message => {
    const roleClass = message.role === 'player' ? 'player' : message.role === 'system' ? 'system' : ''
    return `<article class="distiller-message ${roleClass}">${escapeHtml(message.content)}</article>`
  }).join('')
  els.distillerMessages.scrollTop = els.distillerMessages.scrollHeight
}

function ensureDistillerStarted() {
  state.distillerMessages = []
}

function distillerMessagesForApi() {
  return state.distillerMessages.map(message => ({
    role: message.role,
    content: message.content
  }))
}

function uploadedCareerDocText() {
  return uploadedCareerDoc?.text || ''
}

function renderCareerDocStatus() {
  if (!uploadedCareerDoc) {
    els.careerDocStatus.textContent = '未上传文档。支持文本和 PDF，内容只在本机提取，可作为 30 天工作日志素材。'
    return
  }
  els.careerDocStatus.textContent = `已上传：${uploadedCareerDoc.filename}，已提取约 ${uploadedCareerDoc.text.length} 个字符，会和文本框内容一起作为 30 天工作日志素材。`
}

async function uploadCareerDocument(file) {
  if (!file || state.busy) return
  if (file.size > 8 * 1024 * 1024) {
    els.careerDocStatus.textContent = '文档太大，请控制在 8MB 内。'
    els.careerDocUpload.value = ''
    return
  }

  state.busy = true
  els.careerDocStatus.textContent = `正在读取文档：${file.name}...`

  try {
    const base64 = arrayBufferToBase64(await file.arrayBuffer())
    const payload = await getJson('/api/extract-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.name,
        mimeType: file.type,
        base64
      })
    })
    const text = String(payload.text || '').trim()
    if (!text) throw new Error('没有从文档里提取到可用文字')
    uploadedCareerDoc = {
      filename: file.name,
      text
    }
    renderCareerDocStatus()
    els.distillerStatus.textContent = '文档已读取。你可以继续在文本框补充 30 天工作日志，也可以直接生成游戏 Mod。'
  } catch (error) {
    uploadedCareerDoc = null
    els.careerDocStatus.textContent = `文档读取失败：${error.message}`
  } finally {
    state.busy = false
    els.careerDocUpload.value = ''
  }
}

function clearCareerDocument() {
  uploadedCareerDoc = null
  els.careerDocUpload.value = ''
  renderCareerDocStatus()
  els.distillerStatus.textContent = '已清除上传文档。'
}

function renderMods() {
  els.modCount.textContent = state.mods.length
  els.modSelect.innerHTML = state.mods.map(mod => {
    const selected = state.currentMod && state.currentMod.meta.id === mod.id ? ' selected' : ''
    return `<option value="${escapeHtml(mod.id)}"${selected}>${escapeHtml(mod.title)} / ${escapeHtml(mod.role)}</option>`
  }).join('')

  els.modList.innerHTML = state.mods.map(mod => {
    const active = state.currentMod && state.currentMod.meta.id === mod.id ? ' active' : ''
    return `
      <button class="mod-item${active}" type="button" data-mod-id="${escapeHtml(mod.id)}">
        <strong>${escapeHtml(mod.title)}</strong>
        <span>${escapeHtml(mod.industry)} · ${escapeHtml(mod.role)} · ${escapeHtml(mod.difficulty)}</span>
      </button>
    `
  }).join('')
}

function renderModDetail() {
  const mod = state.currentMod
  if (!mod) return

  const mission = mod.missions[0]
  const scene = currentSceneFor(mod, mission)
  els.modMeta.textContent = `${mod.meta.industry} / ${mod.meta.role}`
  els.modTitle.textContent = mod.meta.title
  els.missionTitle.textContent = mission ? mission.title : '-'
  els.difficulty.textContent = mod.meta.difficulty || '-'
  els.minutes.textContent = `${mod.meta.estimatedMinutes || '-'} 分钟`
  els.sceneTitle.textContent = scene.title
  els.scenePrompt.textContent = scene.prompt
  els.sceneVisual.style.setProperty('--scene-image', scene.image ? `url("${scene.image}")` : 'none')
  els.sceneImageStatus.textContent = scene.image ? '已生成场景图。' : ''

  els.objectives.innerHTML = (mission?.objectives || [])
    .map(item => `<li>${escapeHtml(item)}</li>`)
    .join('')

  els.scoring.innerHTML = (mod.scoring.dimensions || [])
    .map(item => `
      <div class="score-item">
        <strong>${escapeHtml(item.name)}</strong>
        <span>${escapeHtml(item.description)}</span>
      </div>
    `)
    .join('')

  els.roles.innerHTML = (mod.roles || [])
    .map(item => `
      <div class="role-item">
        <strong>${escapeHtml(item.name)}</strong>
        <span>${escapeHtml(item.role)}：${escapeHtml(item.goal)}</span>
      </div>
    `)
    .join('')

  renderRevisionLog()
  renderMods()
}

function currentSceneFor(mod, mission) {
  const scene = Array.isArray(mod.scenes) ? mod.scenes[0] : null
  const title = scene?.title || mission?.title || `${mod.meta.role}工作现场`
  const prompt = scene?.imagePrompt
    || mission?.sceneImagePrompt
    || [
      `${mod.meta.role}的真实工作场景，网页游戏背景图。`,
      `画面应体现：${mission?.brief || mod.meta.description || '岗位小白正在处理真实工作问题'}`,
      '不要出现真实公司 Logo、真实客户名称、商业机密文件。'
    ].join('')
  return { title, prompt, image: scene?.image || '' }
}

function renderRevisionLog() {
  if (!els.revisionLog) return
  const revisions = state.currentMod?.revisions || []
  if (!revisions.length) {
    els.revisionLog.innerHTML = '<div class="role-item"><span>还没有修改记录。</span></div>'
    return
  }
  els.revisionLog.innerHTML = revisions.slice(0, 5).map(item => `
    <div class="role-item">
      <strong>${escapeHtml(item.version || 'local-revision')}</strong>
      <span>${escapeHtml(item.summary || item.feedback || '已根据反馈修改')}</span>
    </div>
  `).join('')
}

function introFor(mod) {
  const mission = mod.missions[0]
  return [
    `你已进入「${mod.meta.title}」。`,
    '',
    `身份：${mod.meta.role}`,
    `任务：${mission?.brief || '等待任务加载'}`,
    '',
    '你可以直接输入行动。不要只说“我处理一下”，尽量写清楚你要找谁、看什么、怎么判断、下一步要什么结果。',
    '',
    '示例行动：我先要求客户提供不良样件照片和批次信息，同时安排仓库隔离同批次库存，并核对最近三天检验记录。'
  ].join('\n')
}

function buildSystemPrompt(mod) {
  return [
    mod.systemPrompt,
    '',
    '# Mod 基础信息',
    JSON.stringify(mod.meta, null, 2),
    '',
    '# 世界背景',
    mod.world,
    '',
    '# 玩家身份',
    mod.player,
    '',
    '# NPC',
    JSON.stringify(mod.roles, null, 2),
    '',
    '# 主线任务',
    JSON.stringify(mod.missions, null, 2),
    '',
    '# 事件库',
    JSON.stringify(mod.events, null, 2),
    '',
    '# 场景画面',
    JSON.stringify(mod.scenes || [], null, 2),
    '',
    '# 岗位知识',
    mod.knowledge,
    '',
    '# 评分标准',
    JSON.stringify(mod.scoring, null, 2),
    '',
    '# 结局模板',
    mod.endings
  ].join('\n')
}

function chatMessagesForApi() {
  const mod = state.currentMod
  const conversation = state.messages
    .filter(message => message.role !== 'system')
    .map(message => ({
      role: message.role === 'player' ? 'user' : 'assistant',
      content: message.content
    }))

  return [
    { role: 'system', content: buildSystemPrompt(mod) },
    ...conversation
  ]
}

async function selectMod(id) {
  const existing = state.mods.find(mod => mod.id === id)
  if (existing?.generatedMod) {
    state.currentMod = existing.generatedMod
  } else {
    state.currentMod = await getJson(`/api/mods/${encodeURIComponent(id)}`)
  }
  state.messages = []
  renderModDetail()
  addMessage('host', introFor(state.currentMod))
}

function normalizeGeneratedMod(payload) {
  const mod = payload.mod
  return {
    meta: mod.meta,
    world: mod.world,
    player: mod.player,
    roles: mod.roles || [],
    missions: mod.missions || [],
    events: mod.events || [],
    scenes: mod.scenes || [],
    knowledge: mod.knowledge || '',
    scoring: mod.scoring || { dimensions: [] },
    systemPrompt: mod.systemPrompt || mod.system_prompt || '',
    endings: mod.endings || '',
    revisions: mod.revisions || []
  }
}

async function sendDistillerAnswer(content) {
  const answer = content.trim()
  if (!answer || state.busy) return

  state.busy = true
  els.sendDistiller.disabled = true
  addDistillerMessage('player', answer)
  renderDistillerMessages({ role: 'host', content: '正在检查你的 30 天工作日志素材...' })

  try {
    const payload = await getJson('/api/interview-career', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: settingsPayload(),
        distillerPrompt: careerPromptValue(),
        documentText: uploadedCareerDocText(),
        messages: distillerMessagesForApi()
      })
    })
    addDistillerMessage('host', payload.content)
    els.distillerInput.value = ''
    els.distillerStatus.textContent = '已收到工作日志。第几天、早上/下午/加班、人物和后果越具体，生成的职业 Mod 越真实。'
  } catch (error) {
    addDistillerMessage('system', error.message)
  } finally {
    state.busy = false
    els.sendDistiller.disabled = false
  }
}

async function generateCareerMod() {
  const diaryText = els.distillerInput.value.trim()
  const messages = distillerMessagesForApi()
  if (diaryText) {
    messages.push({ role: 'player', content: diaryText })
  }
  const playerAnswers = messages.filter(message => message.role === 'player')
  if (!playerAnswers.length && !uploadedCareerDocText()) {
    els.distillerStatus.textContent = '请先在文本框粘贴某个职业的 30 天工作日志，或上传一份 30 天流水账文档。'
    return
  }

  state.busy = true
  els.generateMod.disabled = true
  els.distillerStatus.textContent = uploadedCareerDoc
    ? '正在把文本框和上传文档中的 30 天工作日志蒸馏成 Career Mod...'
    : '正在把文本框中的 30 天工作日志蒸馏成 Career Mod...'

  try {
    const payload = await getJson('/api/generate-mod-from-interview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: settingsPayload(),
        distillerPrompt: careerPromptValue(),
        documentText: uploadedCareerDocText(),
        messages
      })
    })
    const generatedMod = normalizeGeneratedMod(payload)
    const summary = upsertLocalMod(generatedMod)
    await selectMod(summary.id)
    els.generatorModal.hidden = true
    els.gameModal.hidden = false
    addMessage('system', '已根据 30 天流水账生成并保存到本机职业库。你现在可以先试玩，再让 AI Mod 助手继续修。')
  } catch (error) {
    els.distillerStatus.textContent = `生成失败：${error.message}`
  } finally {
    state.busy = false
    els.generateMod.disabled = false
  }
}

async function reviseCurrentMod() {
  if (!state.currentMod || state.busy) return
  const feedback = els.modFeedback.value.trim()
  if (!feedback) {
    els.revisionStatus.textContent = '请先写清楚哪里不真实、希望改成什么样。'
    return
  }

  state.busy = true
  els.reviseMod.disabled = true
  els.reviseMod.textContent = '修改中...'
  els.revisionStatus.textContent = els.apiKey.value.trim()
    ? '正在调用 AI 根据反馈修改当前 Career Mod...'
    : '未填写 API Key，当前使用本地演示修改。'

  try {
    const payload = await getJson('/api/revise-mod', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: settingsPayload(),
        mod: state.currentMod,
        messages: state.messages,
        feedback
      })
    })
    const updatedMod = normalizeGeneratedMod({ mod: payload.mod || payload.updatedMod })
    const summary = upsertLocalMod(updatedMod)
    state.currentMod = summary.generatedMod
    renderModDetail()
    addMessage('system', `AI Mod 助手已修改当前职业 Mod：${payload.summary || '已根据反馈更新场景、问题和判断标准。'}`)
    els.revisionStatus.textContent = '已保存为本机职业库的新版本，可以继续试玩验证。'
    els.modFeedback.value = ''
  } catch (error) {
    els.revisionStatus.textContent = `修改失败：${error.message}`
  } finally {
    state.busy = false
    els.reviseMod.disabled = false
    els.reviseMod.textContent = '根据反馈修改 Mod'
  }
}

async function generateCurrentSceneImage() {
  if (!state.currentMod || state.busy) return
  const mission = state.currentMod.missions?.[0]
  const scene = currentSceneFor(state.currentMod, mission)
  const prompt = scene.prompt

  state.busy = true
  els.generateSceneImage.disabled = true
  els.generateSceneImage.textContent = '生成中...'
  els.sceneImageStatus.textContent = '正在调用图片 API 生成场景图...'

  try {
    const payload = await getJson('/api/generate-scene-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: imageSettingsPayload(),
        prompt,
        aspectRatio: 'landscape'
      })
    })
    const image = payload.imageDataUrl || payload.imageUrl
    if (!image) throw new Error('图片接口没有返回可显示的图片')

    if (!Array.isArray(state.currentMod.scenes)) state.currentMod.scenes = []
    if (!state.currentMod.scenes[0]) {
      state.currentMod.scenes[0] = {
        id: 'generated-scene',
        title: scene.title,
        imagePrompt: prompt
      }
    }
    state.currentMod.scenes[0].image = image
    state.currentMod.scenes[0].generatedAt = new Date().toISOString()
    state.currentMod.scenes[0].imageProvider = payload.provider || imageSettingsPayload().provider
    state.currentMod.scenes[0].imageModel = payload.model || imageSettingsPayload().model

    upsertLocalMod(state.currentMod)
    renderModDetail()
    els.sceneImageStatus.textContent = `场景图已生成：${payload.model || 'image model'}`
  } catch (error) {
    els.sceneImageStatus.textContent = `生成失败：${error.message}`
  } finally {
    state.busy = false
    els.generateSceneImage.disabled = false
    els.generateSceneImage.textContent = '生成场景图'
  }
}

async function analyzeCurrentRun() {
  if (!state.currentMod) return
  const run = saveCurrentRun()
  if (!run) return

  state.busy = true
  els.analyzeRun.disabled = true
  addMessage('system', '正在根据职业存档分析本局天赋点...')

  try {
    const payload = await getJson('/api/analyze-run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: settingsPayload(),
        run
      })
    })
    addMessage('host', payload.content)
  } catch (error) {
    addMessage('system', error.message)
  } finally {
    state.busy = false
    els.analyzeRun.disabled = false
  }
}

async function loadMods() {
  state.builtInMods = await getJson('/api/mods')
  loadLocalMods()
  combineMods()
  if (state.mods.length) {
    await selectMod(state.mods[0].id)
  } else {
    addMessage('system', '没有找到 Career Mod。请检查 career-mods/ 目录。')
  }
}

async function sendAction(content) {
  if (!state.currentMod || state.busy) return
  const action = content.trim()
  if (!action) return

  state.busy = true
  els.send.disabled = true
  addMessage('player', action)
  renderMessages({ role: 'host', content: '正在推进职业副本...' })

  try {
    const payload = await getJson('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: settingsPayload(),
        messages: chatMessagesForApi(),
        modId: state.currentMod.meta.id
      })
    })
    addMessage('host', payload.content)
  } catch (error) {
    addMessage('system', error.message)
  } finally {
    state.busy = false
    els.send.disabled = false
    els.playerInput.value = ''
  }
}

els.modList.addEventListener('click', event => {
  const button = event.target.closest('[data-mod-id]')
  if (button) selectMod(button.dataset.modId).catch(error => addMessage('system', error.message))
})

els.loadMod.addEventListener('click', () => {
  if (!els.modSelect.value) return
  selectMod(els.modSelect.value)
    .then(() => {
      els.gameModal.hidden = false
    })
    .catch(error => addMessage('system', error.message))
})

els.modSelect.addEventListener('change', () => {
  if (els.modSelect.value) selectMod(els.modSelect.value).catch(error => addMessage('system', error.message))
})

els.saveSettings.addEventListener('click', saveSettings)
els.saveImageSettings.addEventListener('click', saveImageSettings)
els.saveCareerPrompt.addEventListener('click', saveCareerPrompt)
els.resetCareerPrompt.addEventListener('click', resetCareerPrompt)
els.careerDocUpload.addEventListener('change', event => {
  uploadCareerDocument(event.target.files?.[0]).catch(error => {
    uploadedCareerDoc = null
    els.careerDocStatus.textContent = `文档读取失败：${error.message}`
  })
})
els.clearCareerDoc.addEventListener('click', clearCareerDocument)
els.imageProvider.addEventListener('change', () => {
  if (els.imageProvider.value === 'cockpit-tools-image') {
    els.imageBaseUrl.value = 'http://127.0.0.1:60587/v1'
    els.imageModel.value = 'gpt-image-2-medium'
  } else if (els.imageProvider.value === 'openai-image') {
    if (!els.imageBaseUrl.value || els.imageBaseUrl.value === 'http://127.0.0.1:60587/v1') els.imageBaseUrl.value = 'https://api.openai.com/v1'
    if (!els.imageModel.value || els.imageModel.value === 'gpt-image-1') els.imageModel.value = 'gpt-image-2-medium'
  }
})
els.provider.addEventListener('change', () => {
  if (els.provider.value === 'maxtabs') {
    els.baseUrl.value = 'https://server.max-tabs.com/v1'
    els.model.value = 'claude-opus-4-7'
  } else if (els.provider.value === 'openclaw') {
    els.baseUrl.value = 'http://localhost:8080/v1'
    els.model.value = 'gpt-5.3-codex'
  } else if (els.provider.value === 'anthropic') {
    if (!els.baseUrl.value || els.baseUrl.value === 'https://api.openai.com/v1') els.baseUrl.value = 'https://server.max-tabs.com'
    if (!els.model.value || els.model.value === 'gpt-4o-mini') els.model.value = 'claude-3-5-sonnet-20241022'
  } else {
    if (!els.baseUrl.value || els.baseUrl.value === 'https://server.max-tabs.com' || els.baseUrl.value === 'http://localhost:8080/v1') els.baseUrl.value = 'https://api.openai.com/v1'
    if (!els.model.value || els.model.value === 'claude-3-5-sonnet-20241022' || els.model.value === 'gpt-5.3-codex') els.model.value = 'gpt-4o-mini'
  }
})
els.generateMod.addEventListener('click', generateCareerMod)
els.openGenerator.addEventListener('click', () => {
  els.generatorModal.hidden = false
  ensureDistillerStarted()
  renderCareerDocStatus()
  els.distillerInput.focus()
})
document.querySelectorAll('[data-close-generator]').forEach(button => {
  button.addEventListener('click', () => {
    els.generatorModal.hidden = true
  })
})
document.querySelectorAll('[data-close-game]').forEach(button => {
  button.addEventListener('click', () => {
    els.gameModal.hidden = true
  })
})
els.saveRun.addEventListener('click', saveCurrentRun)
els.analyzeRun.addEventListener('click', analyzeCurrentRun)
els.reviseMod.addEventListener('click', reviseCurrentMod)
els.generateSceneImage.addEventListener('click', generateCurrentSceneImage)

els.saves.addEventListener('click', event => {
  const button = event.target.closest('[data-save-id]')
  if (!button) return
  const save = state.saves.find(item => item.id === button.dataset.saveId)
  if (!save) return
  state.currentMod = save.modSnapshot
  state.messages = save.messages
  renderModDetail()
  renderMessages()
  addMessage('system', `已加载存档：${save.modTitle} / ${new Date(save.savedAt).toLocaleString()}`)
})

els.restart.addEventListener('click', () => {
  if (state.currentMod) {
    state.messages = []
    addMessage('host', introFor(state.currentMod))
  }
})

els.settle.addEventListener('click', () => {
  sendAction('请结束本局，并根据我刚才的行动做一次职业体验复盘。')
})

els.composer.addEventListener('submit', event => {
  event.preventDefault()
  sendAction(els.playerInput.value)
})

els.distillerComposer.addEventListener('submit', event => {
  event.preventDefault()
})

loadSettings()
loadImageSettings()
loadCareerPrompt()
loadSaves()
loadMods().catch(error => addMessage('system', error.message))
