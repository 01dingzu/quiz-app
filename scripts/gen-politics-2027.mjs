/**
 * 把 kaoyan-politics 手册的 150 条内容导入 quiz-app：
 *   1) 43 道客观题 + 14 道分析题 → src/data/politics.json（year=2027，进自由练习 / 模拟考 / 错题本）
 *   2) 93 条背诵条款 → src/lessons/politics.ts（12 张考点卡片，进考点页「必背条款」）
 *
 * 幂等：每次运行先删掉 year===2027 的旧题与旧 lesson 文件，再重新生成。
 * 用法：node scripts/gen-politics-2027.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1'))
const ROOT = path.resolve(HERE, '..')
const SRC = 'C:/Users/liusiying/WorkBuddy/2026-10-26-11-49-17/kaoyan-politics/data'

const SUBJECT_MAP = {
  马原: '马原',
  毛中特: '毛中特',
  习思想: '习思想',
  史纲: '史纲',
  思修法治: '思修法纪',
  时政: '时政',
}

// ---------- 读取源数据（浏览器脚本，用 vm 跑一遍拿到 window.KC） ----------
const sandbox = { window: { KC: [] } }
vm.createContext(sandbox)
for (const f of ['1-mayuan.js', '2-maozhongte.js', '3-xishixiang.js', '4-shigang.js', '5-sixiu.js', '6-shizheng.js']) {
  vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), sandbox, { filename: f })
}
const KC = sandbox.window.KC
if (KC.length !== 150) throw new Error('源数据条数异常：' + KC.length)

const stripTags = (s) =>
  String(s)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?b>/g, '')
    .replace(/<span[^>]*>/g, '')
    .replace(/<\/span>/g, '')
const flat = (s) => stripTags(s).replace(/\s*\n\s*/g, '　').replace(/　+/g, '　').trim()
const clean = (s) => stripTags(s).replace(/\n{2,}/g, '\n').trim()

// ---------- 1) 客观题 ----------
const singles = KC.filter((x) => x.t === '单')
const multis = KC.filter((x) => x.t === '多')
const applieds = KC.filter((x) => x.t === '析')

function parseChoice(it) {
  const ansM = it.a.match(/答案：([A-D]+)/)
  if (!ansM) throw new Error('缺答案：' + it.id)
  const body = it.a.replace(/<span class="key">[\s\S]*?<\/span>/, '').replace(/^解析：/, '').trim()
  const options = {}
  it.o.forEach((op, i) => { options['ABCD'[i]] = stripTags(op).trim() })
  return {
    ans: ansM[1],
    options,
    explanation: `【考点】${it.q}\n【答案】${ansM[1]}\n${stripTags(body)}`,
  }
}

const out = []
singles.forEach((it, i) => {
  const { ans, options, explanation } = parseChoice(it)
  out.push({
    id: `zz-2027-${String(i + 1).padStart(2, '0')}`,
    year: 2027, no: i + 1, paper: '政治', subject: SUBJECT_MAP[it.m],
    type: 'single', stem: it.q, options, explanation, score: 1, answer: ans,
  })
})
multis.forEach((it, i) => {
  const { ans, options, explanation } = parseChoice(it)
  out.push({
    id: `zz-2027-${String(singles.length + i + 1).padStart(2, '0')}`,
    year: 2027, no: singles.length + i + 1, paper: '政治', subject: SUBJECT_MAP[it.m],
    type: 'multi', stem: it.q, options, explanation, score: 2, answer: ans.split(''),
  })
})

/** 分析题 → applied：按（1）（2）切成小问，`·` 行成为参考答案，冒号前的短语提炼成踩分点 */
function parseApplied(it, idx) {
  const lines = clean(it.a).split('\n').map((l) => l.trim()).filter(Boolean)
  const notes = []
  const blocks = []
  let cur = null
  for (const line of lines) {
    if (/^（[1-3]）/.test(line)) {
      cur = { head: line.replace(/^（\d）/, ''), bullets: [], text: [] }
      blocks.push(cur)
      continue
    }
    if (/^(答题骨架|失分提醒|答题提示|加分句|易错提醒|注意事项)/.test(line)) { notes.push(line); continue }
    if (!cur) { notes.push(line); continue }
    if (/^[·•]/.test(line)) cur.bullets.push(line.replace(/^[·•]\s*/, ''))
    else cur.text.push(line)
  }

  // 设问优先从题干里取（材料后面那串（1）（2））
  const asks = [...it.q.matchAll(/（(\d)）\s*([^（]*)/g)].map((m) => m[2].trim()).filter(Boolean)

  const totalScore = 10
  const mkParts = (arr) => {
    const each = Math.floor(totalScore / arr.length)
    const rem = totalScore - each * arr.length
    return arr.map((p, i) => ({
      no: i + 1,
      stem: asks.length === arr.length ? asks[i] : p.head,
      answer: [...p.text, ...p.bullets.map((b) => '· ' + b)].join('\n') || p.head,
      points: p.bullets
        .map((b) => (b.includes('：') ? b.split('：')[0] : b.split('。')[0]).trim())
        .filter((s) => s.length >= 2 && s.length <= 26)
        .slice(0, 8),
      score: each + (i === arr.length - 1 ? rem : 0),
    }))
  }

  const parts = blocks.length ? mkParts(blocks) : mkParts([{ head: '综合作答', bullets: [], text: lines }])
  return {
    id: `zz-2027-${51 + idx}`, year: 2027, no: 51 + idx, paper: '政治',
    subject: SUBJECT_MAP[it.m], type: 'applied', stem: it.q,
    explanation: notes.join('\n'),
    totalScore,
    parts,
  }
}
applieds.forEach((it, i) => out.push(parseApplied(it, i)))

// ---------- 写入 politics.json ----------
const polPath = path.join(ROOT, 'src/data/politics.json')
const pol = JSON.parse(fs.readFileSync(polPath, 'utf8'))
const kept = pol.filter((q) => Number(q.year) !== 2027)
const merged = [...kept, ...out]
fs.writeFileSync(polPath, JSON.stringify(merged, null, 1) + '\n', 'utf8')

// ---------- 2) 背诵条款 → 12 张考点卡片 ----------
const byId = Object.fromEntries(KC.map((x) => [x.id, x]))
const clauses = KC.filter((x) => x.t === '背')

const CARDS = [
  {
    id: 'lsn-zz-my-1', subject: '马原', title: '马原 · 唯物论与辩证法', level: '高频选择填空',
    goal: '能默写物质定义、意识能动作用、矛盾同一性与斗争性、量变质变与「度」，并会用矛盾分析法分析材料。',
    ids: ['MY-01', 'MY-02', 'MY-03', 'MY-04', 'MY-05', 'MY-06', 'MY-07', 'MY-08', 'MY-09', 'MY-10', 'MY-11', 'MY-12'],
    intro: [
      '这 12 条是马原选择题的绝对主场：唯物论（物质 / 意识 / 规律）＋辩证法（联系 / 发展 / 三大规律 / 五对范畴中的矛盾体系）。',
      '背法：先记「一句定义 + 一个反例」，再记「方法论落点」。考场上哲学分析题的第一句永远是原理，不写原理后面全白写。',
    ],
    pitfall: '① 量变必须达到「度」才引起质变，看到「量变必然引起质变」直接判错；② 同一性有条件、相对，斗争性无条件、绝对，二者常被互换设错；③ 「新事物」的判断标准是合乎发展必然趋势，不是时间先后或力量强弱。',
  },
  {
    id: 'lsn-zz-my-2', subject: '马原', title: '马原 · 认识论（实践与真理）', level: '高频大题',
    goal: '能说清实践决定认识的四个环节、感性—理性的两次飞跃、真理的绝对性与相对性，并会用它们分析科研攻关类材料。',
    ids: ['MY-13', 'MY-14', 'MY-15', 'MY-16', 'MY-17', 'MY-18', 'MY-19'],
    intro: [
      '认识论是哲学分析题的第二个高频出口，「上千次试验」「理论被实验推翻」这类材料一律从这里取原理。',
      '答题链固定：实践是来源／动力／检验标准／目的 → 感性认识有待上升为理性认识 → 认识运动的总规律（实践—认识—再实践—再认识）。',
    ],
    pitfall: '「实践是检验真理的唯一标准」的理由必须落到两点：真理的本性（主客相符）+ 实践的直接现实性。只写「实践很重要」不得分。逻辑证明是重要补充，不能替代实践。',
  },
  {
    id: 'lsn-zz-my-3', subject: '马原', title: '马原 · 唯物史观与政治经济学', level: '高频选择填空',
    goal: '记住社会存在与社会意识、社会基本矛盾、群众史观，以及商品二因素、劳动二重性、剩余价值率、资本积累的完整链条。',
    ids: ['MY-20', 'MY-21', 'MY-22', 'MY-23', 'MY-24', 'MY-25', 'MY-26', 'MY-27', 'MY-28', 'MY-29', 'MY-30'],
    intro: [
      '前半是唯物史观（社会存在 / 基本矛盾 / 人民群众），后半是政经（商品—货币—剩余价值—积累—垄断），两块的命题方式完全不同：前者靠理解，后者靠算与辨析。',
      '政经计算题只有一个公式要背熟：剩余价值率 m′ = m / v，分母永远是可变资本，不是总资本。',
    ],
    pitfall: '① 剩余价值率与利润率混用（20/40=50% 与 20/100=20%）；② 部门劳动生产率提高→单位商品社会价值下降，个别企业提高→获超额剩余价值，方向别搞反；③ 社会意识相对独立性的四种表现要能对号入座（不同步 / 不平衡 / 继承性 / 反作用）。',
  },
  {
    id: 'lsn-zz-mz-1', subject: '毛中特', title: '毛中特 · 新民主主义革命与社会主义改造', level: '高频选择填空',
    goal: '能默写总路线、三大法宝、农村包围城市道路的依据、一化三改与和平赎买，并区分「没收官僚资本」与「赎买民族资本」。',
    ids: ['MZ-01', 'MZ-02', 'MZ-03', 'MZ-04', 'MZ-05', 'MZ-06'],
    intro: [
      '这一段是史论结合区：理论（总路线 / 三大法宝 / 三大经济纲领）＋历史（1927 上井冈山、1956 改造完成）。',
      '最容易混的三组：三大法宝 vs 工农武装割据三内容 vs 毛泽东思想活的灵魂三方面；没收官僚资本 vs 赎买民族资本；社会主义制度确立（1956） vs 初级阶段结束。',
    ],
    pitfall: '① 新民主主义革命性质是「资产阶级民主革命」，不是社会主义革命；② 对民族资本是和平赎买，对官僚资本是没收；③ 社会主义社会矛盾学说里，基本矛盾仍是对抗性内容但性质非对抗，解决方式是制度自身调整。',
  },
  {
    id: 'lsn-zz-mz-2', subject: '毛中特', title: '毛中特 · 社会主义建设道路与理论体系', level: '高频选择填空',
    goal: '掌握社会主义本质论、初级阶段与基本路线、社会主义市场经济，以及中国特色社会主义理论体系的构成边界。',
    ids: ['MZ-07', 'MZ-08', 'MZ-09', 'MZ-10', 'MZ-11', 'MZ-12'],
    intro: [
      '这一段的考点集中在「边界」上：哪些属于中国特色社会主义理论体系、哪次党代会解决了哪个问题。',
      '社会主义本质论的五句话要能一口气背完：解放生产力、发展生产力、消灭剥削、消除两极分化、最终达到共同富裕。',
    ],
    pitfall: '① 毛泽东思想不属于中国特色社会主义理论体系；② 计划与市场都是手段，不是本质区别；③ 「初级阶段」特指中国，不是所有国家进入社会主义的必经阶段。',
  },
  {
    id: 'lsn-zz-xs-1', subject: '习思想', title: '习思想 · 总论与「十个明确」', level: '高频选择填空',
    goal: '能说出历史地位的三句定位、十个明确的骨架、两个确立与新时代主要矛盾的「变与不变」。',
    ids: ['XS-01', 'XS-02', 'XS-03', 'XS-04', 'XS-05'],
    intro: [
      '分值最高、也最容易被忽略的一块。十个明确不需要逐字背，但要能按「领导—任务—矛盾—布局—改革—法治—经济—强军—外交—党建」十条线回忆出来。',
      '主要矛盾那条一定要带「变与不变」：变的是主要矛盾，不变的是初级阶段基本国情与国际地位。',
    ],
    pitfall: '① 最本质特征 = 中国共产党领导，别写成「共同富裕」（那是本质要求）；② 十四个坚持是基本方略，十个明确是核心内容，两者不能互换；③ 新时代主要矛盾表述里是「不平衡不充分的发展」，不是「落后的社会生产」。',
  },
  {
    id: 'lsn-zz-xs-2', subject: '习思想', title: '习思想 · 中国式现代化与高质量发展', level: '高频大题',
    goal: '能默写五个特征、九条本质要求、五个重大原则，并说清新发展理念、新发展格局与新质生产力的定位。',
    ids: ['XS-06', 'XS-07', 'XS-08', 'XS-09', 'XS-10'],
    intro: [
      '这是分析题最热的一块：凡材料讲产业升级、科技创新、绿色转型，都可以接到「高质量发展是首要任务」上。',
      '答题手感：特征用来说明「我们和别人不一样」，本质要求用来说明「我们到底要什么」，重大原则用来说明「必须怎么做」。',
    ],
    pitfall: '① 五个特征与九条本质要求容易串（特征说的是「人口规模巨大」这类形态，本质要求说的是「创造人类文明新形态」这类目标）；② 新质生产力的三句话必须准确：特点是创新、关键在质优、本质是先进生产力；③ 发展新质生产力要「因地制宜」，不能一哄而上。',
  },
  {
    id: 'lsn-zz-xs-3', subject: '习思想', title: '习思想 · 布局、安全、外交与党建', level: '高频选择填空',
    goal: '掌握五位一体与四个全面、全过程人民民主与根本政治制度、总体国家安全观、三大全球倡议与自我革命。',
    ids: ['XS-11', 'XS-12', 'XS-13', 'XS-14', 'XS-15', 'XS-16', 'XS-17', 'XS-18', 'XS-19', 'XS-20'],
    intro: [
      '这一段是「名词密集区」，考法以多选为主：四个全面的第一项已升级为「全面建设社会主义现代化国家」，这类新表述是命题偏好。',
      '外交与党建两条线常出分析题尾段：自我革命是第二个答案、三大全球倡议、全人类共同价值。',
    ],
    pitfall: '① 根本政治制度只有人民代表大会制度，其余三项是基本政治制度；② 总体国家安全观五要素的「宗旨 / 根本 / 基础 / 保障 / 依托」不能错位；③ 跳出历史周期率有两个答案，第一个是「让人民来监督政府」，第二个是自我革命。',
  },
  {
    id: 'lsn-zz-sg-1', subject: '史纲', title: '史纲 · 近代探索与党的成立', level: '高频选择填空',
    goal: '记住两大历史任务、四个阶级四次探索的失败原因，以及一大到遵义会议的会议—贡献对照。',
    ids: ['SG-01', 'SG-02', 'SG-03', 'SG-04', 'SG-05', 'SG-06'],
    intro: [
      '史纲选择题的核心杀伤力是「时间错位」：会议内容对、时间错，就是错项。所以这一段的背法是做对照表，不是背段落。',
      '一条主线：两大历史任务 → 四个阶级都失败 → 五四运动与马克思主义传播 → 中国共产党成立 → 农村包围城市。',
    ],
    pitfall: '① 辛亥革命「推翻帝制」但没改变半殖民地半封建社会性质；② 遵义会议是「生死攸关的转折点」，八七会议是「由大革命失败到土地革命战争兴起的转折」，两句不能互换；③ 毛泽东思想写入党章是七大（1945），不是遵义会议。',
  },
  {
    id: 'lsn-zz-sg-2', subject: '史纲', title: '史纲 · 从抗战到新时代', level: '高频选择填空',
    goal: '掌握抗战、七届二中全会、十一届三中全会三个转折点，以及十二大至二十大的「届次—贡献」对应。',
    ids: ['SG-07', 'SG-08', 'SG-09', 'SG-10', 'SG-11', 'SG-12'],
    intro: [
      '这一段几乎全靠对照记忆：哪次党代会写进哪个理论、哪个会议作出哪个决策。',
      '三个历史决议与四个历史时期是分析题的开头句，写上去立刻显得有历史纵深感。',
    ],
    pitfall: '① 建立社会主义市场经济体制是十四大（1992），不是十一届三中全会；② 「两个务必」出自七届二中全会（1949），不是七大；③ 邓小平理论入党章是十五大，「三个代表」是十六大，科学发展观是十七大。',
  },
  {
    id: 'lsn-zz-sx-1', subject: '思修法纪', title: '思修 · 人生观、理想与道德', level: '高频选择填空',
    goal: '能默写人生目的的核心地位、人生价值评价标准与四个相统一、中国精神双核心、核心价值观 24 字、四类道德规范。',
    ids: ['SX-01', 'SX-02', 'SX-03', 'SX-04', 'SX-05', 'SX-06', 'SX-07', 'SX-08'],
    intro: [
      '思修分析题常以「人物事迹」做材料，答题三板斧：人生价值（社会价值第一）→ 人生目的（服务人民、奉献社会）→ 四个相统一。',
      '选择题的坑集中在「核心 / 基础 / 本质」这类定位词：人生目的是核心、社会价值是第一位的、个人品德是前三类道德的基础。',
    ],
    pitfall: '① 时代精神的核心是改革创新，不是艰苦奋斗；② 人生价值的衡量尺度是劳动和贡献，不是财富与地位；③ 道德靠社会舆论、传统习俗、内心信念维持，法律靠国家强制力。',
  },
  {
    id: 'lsn-zz-sx-2', subject: '思修法纪', title: '思修 · 法治思维与权利义务', level: '高频大题',
    goal: '掌握习近平法治思想核心要义的五个高频坚持、宪法地位、法治思维五项内容、权利义务四个关系。',
    ids: ['SX-09', 'SX-10', 'SX-11', 'SX-12'],
    intro: [
      '德法结合题是思修分析题的固定套路，四块必须写全：区别（强制力 vs 内心信念）→ 互补（法律是成文的道德，道德是内心的法律）→ 结合材料 → 升华到习近平法治思想。',
      '选择题就记「五个内容」：法律至上、权力制约、公平正义、权利保障、正当程序。',
    ],
    pitfall: '① 法治思维五项里没有「效率优先」这类干扰项；② 权利与义务是相互依存 / 相互贯通 / 互为条件 / 总量等值，不存在「权利高于义务」；③ 宪法是根本法、最高法律效力，不是「基本法」。',
  },
  {
    id: 'lsn-zz-sz-1', subject: '时政', title: '时政 · 当代世界经济与政治框架', level: '高频大题',
    goal: '掌握四条主线（全球化 / 多极化 / 全球治理 / 国际关系民主化）、三大全球倡议、全人类共同价值，以及 38 题的「定性—分析—主张」三段式。',
    ids: ['SZ-01', 'SZ-02', 'SZ-03', 'SZ-04', 'SZ-05', 'SZ-06', 'SZ-07'],
    intro: [
      '时政不背具体事件，背「框架 + 话术」：事件每年换，采分点不变。',
      '38 题万能三段：先定性（是什么性质的议题）→ 再分析（为什么这么主张）→ 后主张（中国方案：共商共建共享、真正的多边主义、三大全球倡议、人类命运共同体）。',
    ],
    pitfall: '① 全人类共同价值（和平发展公平正义民主自由）≠ 普世价值；② 我国外交政策的宗旨是「维护世界和平、促进共同发展」，独立自主是基本立场，别互换；③ 遇到「已经取代」「完全消除」「唯一」这类绝对化表述，多选先排除。',
  },
]

// 把 2027 的选择题/分析题按科目分给该科目的卡片（按 id 顺序均分）
const q27 = out.filter((q) => q.type !== 'applied')
const a27 = out.filter((q) => q.type === 'applied')
const cardIdsBySubject = {}
for (const c of CARDS) (cardIdsBySubject[c.subject] ??= []).push(c.id)

const practiseByCard = {}
for (const [subject, cids] of Object.entries(cardIdsBySubject)) {
  const bank = q27.filter((q) => q.subject === subject)
  const apps = a27.filter((q) => q.subject === subject)
  cids.forEach((cid, i) => { practiseByCard[cid] = [] })
  bank.forEach((q, i) => { practiseByCard[cids[i % cids.length]].push(q.id) })
  apps.forEach((q, i) => { practiseByCard[cids[(i + cids.length - 1) % cids.length]].push(q.id) })
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const cell = (s) => esc(stripTags(String(s))).replace(/\n/g, '　').replace(/　+/g, '　').trim()

const lessonBlocks = CARDS.map((c) => {
  const rows = c.ids.map((id) => {
    const it = byId[id]
    if (!it) throw new Error('条款缺失：' + id)
    return `      <tr><td>${cell(it.q)}</td><td>${cell(it.a)}</td></tr>`
  }).join('\n')
  const table = `    formulaTable: \`<table><caption>必背条款（${c.ids.length} 条 · ★ 越多命题概率越高）</caption><tr><th>条款</th><th>必背要点</th></tr>\n${rows}\n    </table>\`,`
  const intro = c.intro.map((p) => `      ${JSON.stringify(p)},`).join('\n')
  return `  {
    id: ${JSON.stringify(c.id)},
    title: ${JSON.stringify(c.title)},
    paper: '政治',
    subject: ${JSON.stringify(c.subject)},
    level: ${JSON.stringify(c.level)},
    goal: ${JSON.stringify(c.goal)},
    intro: [
${intro}
    ],
${table}
    pitfall: ${JSON.stringify(c.pitfall)},
    examples: [],
    practice: pick(${JSON.stringify(practiseByCard[c.id])}, ${JSON.stringify(c.id)}),
  },`
}).join('\n')

const lessonFile = `// ============================================================
// 考研政治 · 背诵条款考点卡片（自动生成，勿手改）
//
// 由 scripts/gen-politics-2027.mjs 生成：
//   条款内容 ← kaoyan-politics 手册的 93 条背诵条款
//   配套练习 ← src/data/politics.json 里 year===2027 的题目（同批数据，不复制题干）
//
// 练习题通过 lesson 外键并入 BANK，但排除在自由练习抽题池外；
// 它们同时也在 politics.json 里保留一份（不带 lesson），所以自由练习里照样能刷到。
// ============================================================
import type { Question, Subject } from '../types'
import raw from '../data/politics.json'
import { normalizeBank } from '../lib/normalize'
import type { Lesson } from './shared'

const P27 = normalizeBank(raw as unknown[]).filter((q) => q.year === 2027 && q.paper === '政治')

/** 取指定 id 的练习题，并打上 lesson 外键（不复制题干，避免两处维护） */
function pick(ids: string[], lesson: string): Question[] {
  const set = new Set(ids)
  return P27.filter((q) => set.has(q.id)).map((q) => ({ ...q, lesson }) as unknown as Question)
}

export const POLITICS_LESSONS: Lesson[] = [
${lessonBlocks}
]

/** 供外部校验：本文件覆盖的条款学科 */
export const POLITICS_LESSON_SUBJECTS: Subject[] = ['马原', '毛中特', '习思想', '史纲', '思修法纪', '时政']
`

fs.writeFileSync(path.join(ROOT, 'src/lessons/politics.ts'), lessonFile, 'utf8')

// ---------- 汇总 ----------
const stat = {
  questions: out.length,
  single: singles.length,
  multi: multis.length,
  applied: applieds.length,
  clauses: clauses.length,
  lessons: CARDS.length,
  practicePerCard: Object.fromEntries(Object.entries(practiseByCard).map(([k, v]) => [k, v.length])),
}
console.log(JSON.stringify(stat, null, 2))
console.log('politics.json: ' + kept.length + ' -> ' + merged.length + ' 题')
