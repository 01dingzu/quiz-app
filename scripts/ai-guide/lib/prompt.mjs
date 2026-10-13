/**
 * 提示词构建
 * ============================================================
 * 这一层决定了上游「锚定校验」有没有意义。
 *
 * 校验器只能**事后**剔除不合格条目；如果提示词让模型以为「必须填满四个选项」，
 * 那么模型就会为了填满而编造引用 —— 校验器会把它们全部剔掉，
 * 于是白花一轮钱，产出还是空的。
 *
 * 所以提示词的第一要务不是「要求正确」，而是**明确允许并鼓励留空**。
 * 一句话概括本层的设计立场：
 *   「这道题你答不出来是可以的，但你不能编。」
 */

/**
 * 系统提示。所有请求共用 —— 共用还有一个额外好处：
 * 前缀稳定，可以吃到服务端的 prompt cache（长系统提示几乎零成本）。
 */
export const DIAG_SYSTEM = `你是考研 408「数据结构」选择题的诊断员。

# 你的任务
为这道题的每一个**错误选项**写一条诊断：学生选它的时候，脑子里想错的是哪一步。

# 铁律（每条都机械校验，违反即整条作废）
1. 你给出的诊断必须能被【参考解析】原文中的一句话直接支撑。
   把那句话**逐字**抄进 evidence.quote。
2. 「逐字」= 一字不差。不得改写标点、不得换同义词、不得概括、不得把两处不连续的原文拼起来。
3. 如果你在参考解析里**找不到**能支撑某条诊断的句子，就把该选项的值写成 null。
   **留空是允许的、被期待的；编造是不可接受的。** 悬空比错误好。
4. 不得复述正确答案。禁止出现「故选 X」「正确答案是 X」「所以选 X」这类表述 ——
   诊断只讲错误路径，答案由别处承担。
5. 禁止空话。「概念不清」「粗心」「基础不牢」「需要加强」这类一律作废。
6. 每条诊断不超过 80 字。

# evidence.kind 必须诚实标注
只能取两个值：
- "conclusion"：参考解析里**直接说明**了这个错误选项错在哪。你只是在搬运它的结论。
- "criterion"：参考解析里只给了**定义或判定标准**，是你拿这个标准去比对，才推出该选项不成立的。
  引用是真的，但推理是你做的。

多数解析只论证了正确选项，对三个干扰项并没有直接说明，所以 criterion 会占多数 —— 这很正常。
诚实标注 criterion 不会让条目作废，只会让它进入人工优先复核名单。
把 criterion 虚标成 conclusion 属于学术不诚实，一经比对引用与诊断的语义不匹配即判废，后果比留空严重得多。`

/**
 * 路径 G：有干净且同源的解析 → 必须逐字引用。
 *
 * @param {object} p
 *   @param {object}  p.question      归一化题目（stem / options）
 *   @param {string[]} p.answerKeys
 *   @param {string}  p.explanation   体检通过后的净化解析（锚定源）
 *   @param {object}  p.mother        母题 { id, name, skeleton, traps }
 *   @param {number}  [p.maxLen]
 */
export function buildGroundedPrompt({ question, answerKeys, explanation, mother, maxLen = 80 }) {
  const wrongKeys = ['A', 'B', 'C', 'D'].filter((k) => !answerKeys.includes(k) && question.options?.[k])
  const trapLines = mother?.traps
    ? Object.entries(mother.traps).map(([id, t]) => `- ${id}：${t.label}${t.why ? ` —— ${t.why}` : ''}`).join('\n')
    : '（本题暂无对应陷阱库）'

  const user = `# 题目
${question.stem}

# 选项
${['A', 'B', 'C', 'D'].filter((k) => question.options?.[k]).map((k) => `${k}. ${question.options[k]}`).join('\n')}

# 正确答案
${answerKeys.join('')}

# 参考解析（这是你唯一可信的信息来源，逐字引用必须来自这里）
"""
${explanation}
"""

# 本题所属母题
${mother ? `${mother.id} ${mother.name}` : '（未标注）'}
${mother?.skeleton ? `解题骨架：${mother.skeleton.join(' → ')}` : ''}

# 该母题的陷阱库（可选引用）
${trapLines}

# 任务
为 ${wrongKeys.join('、')} 这几个错误选项各写一条诊断（每条 <= ${maxLen} 字）。
**找不到依据的选项请直接写 null，不要猜。** 三个都写 null 也是合法输出。

# 输出（只输出 JSON，不要任何解释）
{"items":{"${wrongKeys[0]}":{"why":"……","evidence":{"quote":"从上面参考解析逐字抄来的句子","kind":"criterion"},"trap":"陷阱id或省略"}${wrongKeys.slice(1).map((k) => `,"${k}":null`).join('')}}}`

  return [
    { role: 'system', content: DIAG_SYSTEM },
    { role: 'user', content: user },
  ]
}

/**
 * 路径 P：解析不可用 → 只允许提问式引导。
 *
 * 这里有一个容易忽略但很重要的分工：
 *   **题级引导**由模型写（需要理解具体题目），
 *   **母题级陷阱**来自人工编写的陷阱库（可信知识，不走模型）。
 * 所以路径 P 不是「什么都不给」，而是「给可信的母题知识 + 只提问不结论的题级提示」。
 *
 * @param {object} p
 *   @param {string} p.reason  为什么解析不可用（会写进提示，让模型知道自己为什么被限制）
 */
export function buildProbePrompt({ question, answerKeys, mother, reason, maxLen = 80 }) {
  const wrongKeys = ['A', 'B', 'C', 'D'].filter((k) => !answerKeys.includes(k) && question.options?.[k])
  const trapLines = mother?.traps
    ? Object.entries(mother.traps).map(([id, t]) => `- ${id}：${t.label}${t.why ? ` —— ${t.why}` : ''}`).join('\n')
    : '（本题暂无对应陷阱库）'

  const user = `# 题目
${question.stem}

# 选项
${['A', 'B', 'C', 'D'].filter((k) => question.options?.[k]).map((k) => `${k}. ${question.options[k]}`).join('\n')}

# 正确答案
${answerKeys.join('')}

# 为什么本次不给参考解析
${reason}
（这是题库的数据问题，不是你的问题。但结论必须由学生自己得出。）

# 本题所属母题
${mother ? `${mother.id} ${mother.name}` : '（未标注）'}
${mother?.skeleton ? `解题骨架：${mother.skeleton.join(' → ')}` : ''}

# 该母题的陷阱库（可选引用）
${trapLines}

# 任务
为 ${wrongKeys.join('、')} 这几个错误选项各写一条**提问式引导**（每条 <= ${maxLen} 字）。

要求：
- 用一到两个问题，把学生的注意力引到「判断该选项成立与否所必需的那个概念」上。
- **直接点名要检查的定义、性质或边界条件**，让学生自己去比对 —— 这样比给结论有用。
- 严禁任何结论性表述：「因为」「所以」「因此」「错在」「说明」「意味着」「应该是」「正确的是」一个都不能出现。
- 严禁暗示答案。
- 也不要写「概念不清」「粗心」这类空话。

可以引用上面的陷阱库来指路（写进 trap 字段），但陷阱库里的**结论**不能抄进你的 probe。

# 输出（只输出 JSON，不要任何解释）
{"items":{"${wrongKeys[0]}":{"probe":"……"}${wrongKeys.slice(1).map((k) => `,"${k}":null`).join('')}}}`

  return [
    { role: 'system', content: DIAG_SYSTEM },
    { role: 'user', content: user },
  ]
}

/**
 * 按体检结果自动选择路径。
 * 这个函数是「两条互斥路径」这条设计原则的唯一落地点 ——
 * 调用方不应该自己去判断该用哪条路径。
 */
export function buildDiagnosticPrompt({ question, answerKeys, audit, mother, maxLen }) {
  const explanation = audit?.cleanText || ''
  if (audit?.usable) {
    return {
      path: 'G',
      messages: buildGroundedPrompt({ question, answerKeys, explanation, mother, maxLen }),
    }
  }
  const reason = audit?.reasons?.[0] || '本题题库中没有可用的参考解析'
  return {
    path: 'P',
    messages: buildProbePrompt({ question, answerKeys, mother, reason, maxLen }),
  }
}
