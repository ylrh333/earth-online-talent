const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const port = 5180
const base = `http://localhost:${port}`
const saveModsDir = path.join(os.tmpdir(), `earth-online-save-mods-${Date.now()}`)

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function waitForServer(child) {
  for (let i = 0; i < 30; i += 1) {
    if (child.exitCode !== null) {
      throw new Error(`服务提前退出，exitCode=${child.exitCode}`)
    }
    try {
      const res = await fetch(`${base}/api/mods`)
      if (res.ok) return
    } catch (error) {
      await wait(200)
    }
  }
  throw new Error('服务启动超时')
}

async function assertOk(name, fn) {
  try {
    await fn()
    console.log(`OK ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

async function main() {
  const child = spawn(process.execPath, ['tools/serve.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      SAVE_MODS_DIR: saveModsDir,
      OPENAI_API_KEY: '',
      ANTHROPIC_API_KEY: '',
      ANTHROPIC_AUTH_TOKEN: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })

  try {
    await waitForServer(child)

    await assertOk('首页可访问', async () => {
      const text = await fetch(base).then(res => res.text())
      if (!text.includes('Career Mod 模拟器')) throw new Error('首页内容不正确')
    })

    await assertOk('Mod 列表可加载', async () => {
      const mods = await fetch(`${base}/api/mods`).then(res => res.json())
      if (!Array.isArray(mods) || mods.length < 1) throw new Error('没有加载到 Mod')
    })

    await assertOk('示例 Mod 可加载', async () => {
      const mods = await fetch(`${base}/api/mods`).then(res => res.json())
      const first = mods[0]
      if (!first?.id) throw new Error('没有可加载的示例 Mod')
      const mod = await fetch(`${base}/api/mods/${first.id}`).then(res => res.json())
      if (mod.meta.id !== first.id) throw new Error('示例 Mod ID 不正确')
    })

    await assertOk('无 API Key 演示聊天可用', async () => {
      const res = await fetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {},
          messages: [{ role: 'user', content: '我先查客户投诉批次和库存范围' }]
        })
      })
      const payload = await res.json()
      if (!payload.content || !payload.content.includes('本地演示模式')) {
        throw new Error('演示聊天返回不正确')
      }
    })

    await assertOk('无 API Key 演示生成 Career Mod 可用', async () => {
      const res = await fetch(`${base}/api/generate-mod`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {},
          title: '汽车质量测试工程师',
          industry: '汽车零部件制造',
          detail: [
            '每天需要做测试、验证、记录异常、推动问题闭环。',
            '每天需要和质量工程师、测试员、客户、项目经理沟通。',
            '每周需要汇总测试问题和风险。',
            '每月需要复盘测试数据和典型异常。',
            '新人容易忽略测试条件和样件状态。',
            '老手会先复核测试条件、样件状态和原始记录。'
          ].join('\n')
        })
      })
      const payload = await res.json()
      if (!payload.mod?.meta?.title || !payload.mod?.missions?.length) {
        throw new Error('生成 Career Mod 返回不正确')
      }
    })

    await assertOk('无 API Key 职业生成采访可用', async () => {
      const res = await fetch(`${base}/api/interview-career`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {},
          messages: [
            { role: 'host', content: '你打算蒸馏哪个职业？' },
            { role: 'player', content: '汽车质量测试工程师' }
          ]
        })
      })
      const payload = await res.json()
      if (!payload.content || !/30 天|Day 1|第 1 天|早上|下午/.test(payload.content)) {
        throw new Error('职业生成采访返回不正确')
      }
    })

    await assertOk('MaxTabs 未填 API Key 时使用本地演示', async () => {
      const res = await fetch(`${base}/api/interview-career`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            provider: 'maxtabs',
            baseUrl: 'https://server.max-tabs.com/v1',
            model: 'claude-opus-4-7',
            apiKey: ''
          },
          messages: [
            { role: 'host', content: '你打算蒸馏哪个职业？' },
            { role: 'player', content: '汽车质量测试工程师' }
          ]
        })
      })
      const payload = await res.json()
      if (!payload.content || !/30 天|Day 1|第 1 天|早上|下午/.test(payload.content)) {
        throw new Error('MaxTabs 空 Key 没有进入本地演示')
      }
    })

    await assertOk('无 API Key 根据采访生成 Career Mod 可用', async () => {
      const res = await fetch(`${base}/api/generate-mod-from-interview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {},
          documentText: '上传文档：Day 5 周五质量例会要汇总本周新品车测试问题，下周继续跟进整改和复测。',
          messages: [
            { role: 'host', content: '你打算蒸馏哪个职业？' },
            { role: 'player', content: '汽车质量测试工程师。这 30 天是新品车测试项目周期。' },
            { role: 'host', content: '请写 Day 1 早上和下午发生了什么。' },
            { role: 'player', content: 'Day 1 早上老员工给我标准表，让我检查新品车发动机噪音、间隙段差、音响、底盘、动力、外观、内饰。Day 1 下午发现外观间隙问题，填写问题表。Day 2 找研发确认复现条件，对方说照片和车辆状态不够清楚。Day 5 周五质量会汇报未闭环问题。' }
          ]
        })
      })
      const payload = await res.json()
      if (!payload.mod?.meta?.title || !payload.mod?.missions?.length) {
        throw new Error('根据采访生成 Career Mod 返回不正确')
      }
    })

    await assertOk('生成 Mod 可保存为本地文件夹和资产', async () => {
      const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="red"/></svg>').toString('base64')
      const res = await fetch(`${base}/api/save-mod`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mod: {
            meta: {
              id: 'smoke-local-save',
              title: '测试保存职业模拟器',
              version: '0.1.0',
              author: 'smoke-test',
              industry: '测试行业',
              role: '测试岗位',
              difficulty: 'easy',
              estimatedMinutes: 10
            },
            world: '# 世界背景\n',
            player: '# 玩家身份\n',
            roles: [],
            missions: [{ id: 'main-mission', title: '测试任务', brief: '测试保存 Mod 文件夹。', objectives: [] }],
            events: [],
            scenes: [{ id: 'scene-1', title: '测试场景', image: `data:image/svg+xml;base64,${svg}`, imagePrompt: '测试图' }],
            knowledge: '# 岗位知识\n',
            scoring: { dimensions: [] },
            systemPrompt: '# 系统提示词\n',
            endings: '# 结局\n'
          }
        })
      })
      const payload = await res.json()
      const savedDir = path.join(process.cwd(), payload.path)
      if (!fs.existsSync(path.join(savedDir, 'mod.json'))) throw new Error('缺少 mod.json')
      if (!fs.existsSync(path.join(savedDir, 'missions.json'))) throw new Error('缺少 missions.json')
      if (!fs.existsSync(path.join(savedDir, 'scenes.json'))) throw new Error('缺少 scenes.json')
      if (!fs.existsSync(path.join(savedDir, 'assets', 'scene-1.svg'))) throw new Error('缺少本地场景图片资产')
    })

    await assertOk('无 API Key 演示修订 Career Mod 可用', async () => {
      const mods = await fetch(`${base}/api/mods`).then(res => res.json())
      const first = mods[0]
      if (!first?.id) throw new Error('没有可修订的示例 Mod')
      const currentMod = await fetch(`${base}/api/mods/${first.id}`).then(res => res.json())
      const res = await fetch(`${base}/api/revise-mod`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {},
          mod: currentMod,
          messages: [{ role: 'player', content: '我觉得第一天不应该直接处理客户投诉。' }],
          feedback: '这个场景不真实。汽车质量测试第一天应该先跟着老员工拿标准表检查间隙段差、发动机噪音、音响、底盘、动力、外观、内饰，然后填写问题表并联系研发。'
        })
      })
      const payload = await res.json()
      const brief = payload.mod?.missions?.[0]?.brief || ''
      const imagePrompt = payload.mod?.scenes?.[0]?.imagePrompt || ''
      if (!brief || !payload.mod?.revisions?.length || !imagePrompt.includes('网页游戏')) {
        throw new Error('修订 Career Mod 返回不正确')
      }
    })

    await assertOk('无 API Key 演示场景图片生成可用', async () => {
      const res = await fetch(`${base}/api/generate-scene-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: { provider: 'openai-image', baseUrl: 'https://api.openai.com/v1', model: 'gpt-image-2-medium', apiKey: '' },
          prompt: '网页游戏背景图：汽车质量测试工程师正在检查新品车。',
          aspectRatio: 'landscape'
        })
      })
      const payload = await res.json()
      if (!payload.imageDataUrl || !payload.imageDataUrl.startsWith('data:image/svg+xml')) {
        throw new Error('演示场景图片返回不正确')
      }
    })

    await assertOk('无 API Key 演示生成填写草稿可用', async () => {
      const res = await fetch(`${base}/api/draft-career-detail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {},
          title: '汽车质量测试工程师',
          industry: '汽车零部件制造',
          prompt: '重点生成客户投诉和测试验证相关细节。',
          documentText: '工作总结：Day 1 早上复核测试条件和样件状态，下午填写问题表；Day 5 汇总未闭环事项。'
        })
      })
      const payload = await res.json()
      if (!payload.content || !/30 天职业流水账|Day 1|第 1 天/.test(payload.content)) {
        throw new Error('填写草稿返回不正确')
      }
    })

    await assertOk('PDF 文档文字提取可用', async () => {
      const pdf = [
        '%PDF-1.4',
        '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
        '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
        '3 0 obj << /Type /Page /Parent 2 0 R /Contents 4 0 R >> endobj',
        '4 0 obj << /Length 55 >> stream',
        'BT /F1 12 Tf 72 720 Td (Hello PDF Career Detail) Tj ET',
        'endstream endobj',
        'trailer << /Root 1 0 R >>',
        '%%EOF'
      ].join('\n')
      const res = await fetch(`${base}/api/extract-document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: 'career.pdf',
          mimeType: 'application/pdf',
          base64: Buffer.from(pdf).toString('base64')
        })
      })
      const payload = await res.json()
      if (!payload.text || !payload.text.includes('Hello PDF Career Detail')) {
        throw new Error('PDF 提取返回不正确')
      }
    })

    await assertOk('无 API Key 演示 Run 分析可用', async () => {
      const res = await fetch(`${base}/api/analyze-run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {},
          run: {
            modTitle: '汽车质量工程师模拟器',
            messages: [
              { role: 'host', content: '客户投诉。' },
              { role: 'player', content: '我先确认投诉批次、样件和库存范围。' }
            ]
          }
        })
      })
      const payload = await res.json()
      if (!payload.content || !payload.content.includes('本地演示天赋分析')) {
        throw new Error('Run 分析返回不正确')
      }
    })
  } finally {
    child.kill()
  }
}

main().catch(error => {
  console.error(error.message)
  process.exit(1)
})
