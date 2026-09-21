/**
 * 英语一答案权威表（**按词记录**）
 *
 * 为什么按词而不是按字母？
 * 同一份卷子在不同来源里选项顺序不同（主源的 readme 里就带一个 random_aws.py
 * 专门打乱选项并重算答案；实测 2014/2016/2017 的 options.tex 相对官方卷面
 * 确实存在重排）。只比字母会把「顺序不同」误报成「答案错」，
 * 更糟的是会让错误的答案键互相"印证"。记词就没有这个歧义。
 *
 * 为什么需要这张表？
 * 主源 pfoocc/201_204_kaoyan 自称「未校对」，实测其 cloze/answer.tex 与
 * read*_answer.tex **在 2012–2017 段大面积错误**（例如 2014 完形 20 空错 14、
 * 阅读 20 题错 13；2016 阅读错 12）。2010、2011、2015、2018、2019 及
 * 2020 以后各年与外部解析一致。
 *
 * 判据来源（三方交叉，冲突时以原文语义为准）
 *   1. TsekaLuk/Kaoyan-English1-Papers 的《考研英语真题答案及解析》PDF
 *      （2010–2020，逐题给【答案】+ 完整解析）
 *   2. 新东方 / 高顿 / 中国教育在线等逐年答案页
 *   3. 逐空人肉对照原文语境复核（2011 与 2014 两年 20 空各逐条核过）
 *
 * 用法：parse-english.mjs 用这张表把答案词反解成选项字母。
 * 反解失败（选项里找不到该词）会直接报错 —— 这同时是对我们选项文本的一道校验。
 */

/** 年份 → 20 个空的正确选项词（按空位 1–20 顺序） */
export const CLOZE_ANSWER_WORDS = {
  2010: ['affected', 'up', 'act', 'perplexing', 'accounts', 'matter', 'so long as', 'awareness', 'enough', 'by', 'subjected', 'contrary to', 'evidence', 'misleading', 'for example', 'duly', 'continued', 'however', 'tended', 'hitting'],
  2011: ['despite', 'produce', 'boosting', 'sustain', 'measurable', 'in fact', 'opposite', 'relaxes', 'moderate', 'physical', 'according to', 'in', 'because', 'precedes', 'from', 'hold', 'disappointed', 'reacted', 'suggesting', 'similarly'],
  2012: ['maintain', 'when', 'weakened', 'accepted', 'bound', 'subject', 'applies', 'raise', 'line', 'as', 'so', 'upset', 'cultivate', 'tied', 'concepts', 'shapes', 'dismissed', 'address', 'accountable', 'as a result'],
  2013: ['grants', 'external', 'picture', 'for example', 'fearful', 'on', 'if', 'test', 'success', 'chosen', 'otherwise', 'conducted', 'rated', 'took', 'then', 'marked', 'before', 'drop', 'undo', 'necessary'],
  2014: ['where', 'fades', 'while', 'damaging', 'wellbeing', 'turns', 'workouts', 'functions', 'process', 'excel', 'however', 'according to', 'further', 'sharpness', 'allows', 'track', 'on', 'constantly', 'build', 'effective'],
  2015: ['what', 'concluded', 'on', 'compared', 'samples', 'insignificant', 'know', 'resemble', 'also', 'perhaps', 'to', 'drive', 'rather than', 'benefits', 'faster', 'understand', 'contributory', 'tendency', 'ethnic', 'see'],
  2016: ['as well as', 'decide on', 'arrange', 'in theory', 'after', 'into', 'but', 'recite', 'tying', 'passing', 'union', 'live', 'until', 'obtain', 'viewed', 'whatever', 'brought', 'divided', 'shows', 'while'],
  2017: ['besides', 'connected', 'host', 'avoid', 'involving', 'on', 'exposed', 'down', 'calculated', 'explained', 'even', 'symptoms', 'increased', 'associated', 'generate', 'in the face of', 'attribute', 'because', 'remains', 'influences'],
  2018: ['for', 'faith', 'price', 'then', 'when', 'produces', 'connect', 'to', 'mood', 'counterparts', 'lucky', 'protect', 'between', 'introduced', 'inside', 'discovered', 'fooled', 'willing', 'in contrast', 'unreliable'],
  2019: ['few', 'run', 'if', 'literally', 'back', 'off', 'unfamiliar', 'way', 'so', 'eventually', 'surprised', 'option', 'for example', 'spot', 'through', 'breaks', 'artificial', 'finally', 'marks', 'lead'],
  2020: ['on', 'match', 'enjoyment', 'guaranteed', 'issued', 'at', 'avoid', 'partially', 'while', 'conclusive', 'likely', 'on the basis of', 'advisable', 'after all', 'connection', 'served', 'to be fair', 'entirely', 'campaign', 'end up'],
  2021: ['peaks', 'generally', 'while', 'accumulation', 'possibility', 'delay', 'included', 'compared', 'with', 'scored', 'went by', 'attributable', 'involved', 'explain', 'treatments', 'meanwhile', 'take', 'well-being', 'level', 'diet'],
  2022: ['coined', 'compared', 'though', 'hinted at', 'differs', 'evidence', 'argued', 'forming', 'analogous', 'even', 'perspective', 'reducing', 'however', 'superficially', 'level', 'added', 'chances', 'danger', 'recognizes', 'poor'],
  2023: ['located', 'privately', 'combination', 'describe', 'such as', 'construction', 'faced', 'subjected', 'so that', 'meeting', 'as a result', 'exchange', 'as well as', 'influencing', 'aided', 'indeed', 'stock up on', 'believed', 'although', 'ruins'],
}

/**
 * 阅读理解 Part A（21–40）的字母级更正表。
 *
 * 为什么阅读只能记字母？因为阅读选项是整句，外部解析（尤其 PDF）只给字母，
 * 而它的选项**顺序可能与官方不同**（2014 就是：解析的 C 才是官方的 A）。
 * 所以这里的每一条都是「拿外部解析给出的**答案选项语义**去对我们的 4 个选项」
 * 反推出的字母 —— 见每条的注释。
 *
 * 前提：我们阅读题的选项经比对与官方卷面**同序**（用 en-tsu 逐年核过
 * 2010–2023 共 13 年、每年 20/20 同序，仅有个别拼写差异），
 * 因此官方字母可直接落在我们的题上。
 *
 * 主源 read*_answer.tex 的错误集中在 2012–2017；2022/2023 各 1 处。
 */
export const READING_ANSWER_FIX = {
  // ---- 2012 ----
  '2012-27': 'C', // 解析：'要求延长商业执照的有效期' = acquire an extension of its business license (C)
  // ---- 2013 ----
  '2013-21': 'A', // '对时尚不敏感' = insensitivity to fashion (A)
  '2013-22': 'B', // '购买衣服更频繁' = shop for their garments more frequently (B)
  '2013-24': 'C', // '定价对于环境友好购买很重要' = Pricing is vital to environment-friendly purchasing (C)
  '2013-28': 'A', // '能够减少垃圾广告的数量' = may cut the number of junk ads (A)
  '2013-34': 'B', // '利用我们过去的经验' = draw on our experience from the past (B)
  // ---- 2014 ----
  '2014-21': 'A', // '鼓励求职者积极找工作' = encourage jobseekers' active engagement (A)
  '2014-25': 'A', // '失业救助不应该是有条件的' = Unemployment benefits should not be made conditional (A)
  '2014-27': 'D', // '攻读其它专业的学士学位' = Pursuing a bachelor's degree in another major (D)
  '2014-28': 'A', // '律师行业监管部门的僵化' = the rigid bodies governing the profession (A)
  '2014-29': 'B', // '禁止外行参与律师行业' = bans outsiders' involvement in the profession (B)
  '2014-30': 'B', // '美国律师行业的问题及应对策略' = a problem in America's legal profession and solutions to it (B)
  '2014-31': 'B', // '对研究者的慷慨奖励' = a handsome reward for researchers (B)
  '2014-32': 'C', // '新奖项的创立者' = the founders of the new awards (C)
  '2014-33': 'C', // '现代研究的共同努力' = the joint effort of modern researchers (C)
  '2014-34': 'B', // '它们的持久性使其得到公正的对待' = Their endurance has done justice to them (B)
  '2014-35': 'D', // '尽管有批评，但还是可接受的' = acceptable despite the criticism (D)
  '2014-37': 'D', // '在自由教育方面保持领先地位' = keep a leading position in liberal education (D)
  '2014-39': 'C', // '对经典自由理念持有偏见' = biased against classical liberal ideas (C)
  // ---- 2016 ----
  '2016-21': 'A', // '人体美将会被重新定义' = Physical beauty would be redefined (A)
  '2016-23': 'D', // '丹麦正在制定新标准' = New standards are being set in Denmark (D)
  '2016-25': 'D', // '对时装业理想身材的质疑' = A Challenge to the Fashion Industry's Body Ideals (D)
  '2016-26': 'A', // '未很好地反映在政治上' = is not well reflected in politics (A)
  '2016-27': 'D', // '被逐渐破坏' = gradually destroyed (D)
  '2016-28': 'C', // '独立党可能会从其对乡村保护的支持中获益' = Ukip may gain from its support for rural conservation (C)
  '2016-29': 'A', // '显示出他对乡村地区特征的忽视' = shows his disregard for the character of rural areas (A)
  '2016-30': 'C', // '英国的城乡规划' = the town-and-country planning in Britain (C)
  '2016-32': 'C', // '赢得消费者的信任' = winning trust from consumers (C)
  '2016-33': 'D', // '不那么严重' = less severe (D)
  '2016-37': 'B', // '进行战略调整' = make strategic adjustments (B)
  '2016-40': 'B', // '让纸质报纸变成奢侈品' = Make Your Print Newspaper a Luxury Good (B)
  // ---- 2017 ----
  '2017-32': 'B', // '英国普遍反对将 GDP 作为衡量成功的标准' = GDP as the measure of success is widely defied in the UK (B)
  '2017-37': 'C', // '为送礼者提供具体的收益作为回报' = concrete returns for gift-givers (C)
  '2017-38': 'A', // '有正当理由满足其选民的需要' = justified in addressing the needs of their constituents (A)
  // ---- 2022 / 2023（新东方、高顿逐题核对） ----
  '2022-40': 'D', // is difficult to put into practice (D)
  '2023-33': 'A', // Their customers remain loyal. (A)
}
