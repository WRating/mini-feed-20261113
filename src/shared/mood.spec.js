/**
 * 共享心情模块测试。
 *
 * 放在 src 下（frontend project）是为了顺带验证浏览器端能正常导入 @shared。
 */
import { describe, it, expect } from 'vitest'
import { isValidMood, resolveMood, moodView } from '@shared/mood'
import { MOODS, MOOD_KEYS, DEFAULT_MOOD } from '@shared/constants'

describe('MOODS 白名单', () => {
  it('每项都有 key / emoji / label 三个字段', () => {
    for (const mood of MOODS) {
      expect(typeof mood.key).toBe('string')
      expect(mood.key.length).toBeGreaterThan(0)
      expect(typeof mood.emoji).toBe('string')
      expect(mood.emoji.length).toBeGreaterThan(0)
      expect(typeof mood.label).toBe('string')
      expect(mood.label.length).toBeGreaterThan(0)
    }
  })

  it('key 无重复', () => {
    expect(new Set(MOOD_KEYS).size).toBe(MOOD_KEYS.length)
  })

  it('默认心情在白名单内', () => {
    expect(MOOD_KEYS).toContain(DEFAULT_MOOD)
  })

  it('包含「心情好」这一项（用户明确要的默认展示）', () => {
    const great = MOODS.find((m) => m.key === 'great')
    expect(great).toBeTruthy()
    expect(great.label).toBe('心情好')
    expect(great.emoji).toBe('😄')
  })
})

describe('isValidMood', () => {
  it('接受所有白名单内的 key', () => {
    for (const key of MOOD_KEYS) {
      expect(isValidMood(key)).toBe(true)
    }
  })

  it('拒绝拼错或未知的 key（后端据此报 INVALID_MOOD，不静默生效）', () => {
    expect(isValidMood('happy')).toBe(false)
    expect(isValidMood('GREAT')).toBe(false)
    expect(isValidMood('')).toBe(false)
  })

  it('拒绝非字符串输入', () => {
    expect(isValidMood(null)).toBe(false)
    expect(isValidMood(undefined)).toBe(false)
    expect(isValidMood(1)).toBe(false)
    expect(isValidMood({})).toBe(false)
    expect(isValidMood([])).toBe(false)
  })
})

describe('resolveMood', () => {
  it('合法 key 返回对应心情', () => {
    expect(resolveMood('down')).toEqual({ key: 'down', emoji: '😔', label: '低落' })
  })

  it('非法 key 回落到默认心情（心情是装饰信息，不该让界面空白）', () => {
    expect(resolveMood('nope').key).toBe(DEFAULT_MOOD)
    expect(resolveMood(null).key).toBe(DEFAULT_MOOD)
    expect(resolveMood(undefined).key).toBe(DEFAULT_MOOD)
    expect(resolveMood(123).key).toBe(DEFAULT_MOOD)
  })

  it('返回值始终是白名单里的完整对象', () => {
    const resolved = resolveMood('nope')
    expect(MOODS).toContainEqual(resolved)
  })
})

describe('moodView', () => {
  it('只返回展示所需字段', () => {
    expect(moodView('fired')).toEqual({ key: 'fired', emoji: '🔥', label: '干劲满满' })
  })

  it('非法输入得到默认心情的展示', () => {
    expect(moodView('bogus')).toEqual({ key: 'great', emoji: '😄', label: '心情好' })
  })

  it('返回的是新对象，修改它不影响 MOODS 常量', () => {
    const view = moodView('calm')
    view.emoji = '💥'
    expect(resolveMood('calm').emoji).toBe('🙂')
  })
})
