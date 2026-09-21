import fs from 'fs'

const file = process.argv[2]
const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
const out = []
out.push('count = ' + raw.length)

const keys = new Set()
raw.forEach((q) => Object.keys(q).forEach((k) => keys.add(k)))
out.push('all keys = ' + [...keys].join(', '))
out.push('')
out.push('--- sample[0] ---')
out.push(JSON.stringify(raw[0], null, 1).slice(0, 900))

const at = {}
raw.forEach((q) => {
  const t = Array.isArray(q.answer) ? 'array' : typeof q.answer
  at[t] = (at[t] || 0) + 1
})
out.push('')
out.push('answer typeof = ' + JSON.stringify(at))

const ss = {}
raw.forEach((q) => { ss[q.subject] = (ss[q.subject] || 0) + 1 })
out.push('subject dist = ' + JSON.stringify(ss))

const skipN = raw.filter((q) => q.skip).length
out.push('skip=true count = ' + skipN)
const noOpt = raw.filter((q) => !q.options || Object.keys(q.options).length !== 4).length
out.push('options != 4 keys = ' + noOpt)
const latexN = raw.filter((q) => /\$/.test(q.stem || '') || /\$/.test(q.explanation || '')).length
out.push('has $ latex = ' + latexN)
const imgN = raw.filter((q) => q.images || q.img || q.figure || q.image).length
out.push('has image field = ' + imgN)
const noExp = raw.filter((q) => !q.explanation || !q.explanation.trim()).length
out.push('empty explanation = ' + noExp)
out.push('no range = ' + Math.min(...raw.map((q) => q.no)) + '..' + Math.max(...raw.map((q) => q.no)))
const years = [...new Set(raw.map((q) => q.year))].sort()
out.push('years = ' + years.join(','))
const imgInStem = raw.filter((q) => /!\[|\.jpg|\.png|题图|如下图|如下表/.test(q.stem || '')).length
out.push('stem mentions img/table = ' + imgInStem)

fs.writeFileSync(process.argv[3], out.join('\n'), 'utf8')
console.log('OK')
