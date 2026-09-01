import type { Question } from '../types'

/**
 * 题干中引用图/表的关键词。
 * 刻意排除单独"图"字与"图中"：避免把图论术语题（如"下列关于图的叙述""有向图中"）误报为缺图。
 * 涵盖：如图 / 下图 / 右图 / 左图 / 图所示 / 如题 N 图 / 见图 / 下表 / 如表
 */
export const IMG_REF_RE =
  /(如图|如右图|如左图|下图|右图|左图|图所示|如题\s*\d+\s*图|见图|下表|如表)/

/** 题干中是否引用图/表 */
export function hasImageRef(q: Question): boolean {
  return IMG_REF_RE.test(q.stem)
}

/** 题库条目是否带图片资源字段（目前题库统一无图，预留扩展） */
export function hasImageAsset(q: Question): boolean {
  const anyQ = q as unknown as Record<string, unknown>
  return !!(anyQ.image || anyQ.img || anyQ.figure)
}

/** 是否缺图/表资源：题干引用了图，但题库里没有图片 */
export function isMissingImg(q: Question): boolean {
  return hasImageRef(q) && !hasImageAsset(q)
}

/** 缺图题的提示文案 */
export function missingImgHint(): string {
  return '题目引用了图/表，但题库暂未收录对应图片，可能无法完整作答。'
}
