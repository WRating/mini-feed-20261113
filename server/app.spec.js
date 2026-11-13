/**
 * HTTP 层集成测试。
 *
 * 用 `app.request()` 直接打 Hono 实例，**不监听真实端口**：
 * 端口监听会让测试依赖环境（端口占用、启动耗时），而且并发跑多个测试文件时会互相抢端口。
 * `app.request()` 走的是与真实请求完全相同的路由/中间件链路，集成度足够。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  MAX_LEN,
  NAME_MAX,
  BIO_MAX,
  AVATARS,
  DEFAULT_NAME,
  DEFAULT_BIO,
  DEFAULT_AVATAR,
  EMPTY_REACTIONS
} from '../shared/constants.js'

import { createApp } from './app.js'
import { createStore } from './store.js'

/** 每个用例前重建 store + app，保证完全隔离 */
let store
let app

beforeEach(() => {
  store = createStore()
  app = createApp({ store })
})

/** 发 JSON 请求的小工具，省去每个用例手写 headers */
function json(path, { method = 'GET', body, raw } = {}) {
  const init = { method }
  if (raw !== undefined) {
    init.body = raw
  } else if (body !== undefined) {
    init.body = JSON.stringify(body)
  }
  if (init.body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' }
  }
  return app.request(path, init)
}

/** 断言错误响应结构，并返回解析后的 body */
async function expectError(response, status, code) {
  expect(response.status).toBe(status)
  const data = await response.json()
  expect(data).toEqual({ error: { code, message: expect.any(String) } })
  // message 不能是空串，否则前端无法展示
  expect(data.error.message.length).toBeGreaterThan(0)
  return data
}

describe('createApp 基本形态', () => {
  it('返回一个可用的 Hono 应用（有 request 方法）', () => {
    expect(typeof app.request).toBe('function')
  })

  it('未传 store 时应抛错，避免默默用一个无状态实例', () => {
    expect(() => createApp()).toThrow()
    expect(() => createApp({})).toThrow()
  })

  it('开启了 CORS，允许任意来源', async () => {
    const response = await json('/api/health', {
      // 通过带 Origin 的请求验证 CORS 头
      method: 'GET'
    })

    expect(response.headers.get('access-control-allow-origin')).toBe('*')
  })
})

describe('GET /api/health', () => {
  it('200 且返回契约约定的字段', async () => {
    const response = await json('/api/health')

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.ok).toBe(true)
    expect(data.storage).toBe('memory')
    expect(Number.isFinite(data.uptimeMs)).toBe(true)
    expect(data.uptimeMs).toBeGreaterThanOrEqual(0)
    // startedAt 必须是合法 ISO 字符串
    expect(typeof data.startedAt).toBe('string')
    expect(Number.isNaN(Date.parse(data.startedAt))).toBe(false)
  })

  it('posts 字段反映当前动态数', async () => {
    await json('/api/posts', { method: 'POST', body: { text: 'a' } })
    await json('/api/posts', { method: 'POST', body: { text: 'b' } })

    const data = await (await json('/api/health')).json()

    expect(data.posts).toBe(2)
  })
})

describe('GET /api/stats', () => {
  it('200 且字段类型正确', async () => {
    const response = await json('/api/stats')

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.posts).toBe(0)
    expect(data.chars).toBe(0)
    expect(typeof data.bytes).toBe('number')
    expect(data.bytes).toBeGreaterThan(0)
    expect(data.likes).toBe(0)
    expect(data.favorites).toBe(0)
  })

  it('反映已发布的动态', async () => {
    await json('/api/posts', { method: 'POST', body: { text: 'abc' } })

    const data = await (await json('/api/stats')).json()
    expect(data.posts).toBe(1)
    expect(data.chars).toBe(3)
  })

  it('透传互动数之和', async () => {
    const created = await (
      await json('/api/posts', { method: 'POST', body: { text: '统计互动' } })
    ).json()
    await json(`/api/posts/${created.post.id}/reactions/like`, { method: 'POST' })
    await json(`/api/posts/${created.post.id}/reactions/favorite`, { method: 'POST' })

    const data = await (await json('/api/stats')).json()
    expect(data.likes).toBe(1)
    expect(data.favorites).toBe(1)
  })
})

describe('GET /api/posts', () => {
  it('无数据时返回空数组而不是 404', async () => {
    const response = await json('/api/posts')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ posts: [] })
  })

  it('按 createdAt 倒序返回', async () => {
    store.mergePosts([
      { text: '旧', createdAt: 1000 },
      { text: '新', createdAt: 2000 }
    ])

    const data = await (await json('/api/posts')).json()
    expect(data.posts.map((post) => post.text)).toEqual(['新', '旧'])
  })
})

describe('POST /api/posts', () => {
  it('成功返回 201 与完整 post 结构（含互动字段）', async () => {
    const response = await json('/api/posts', { method: 'POST', body: { text: '  你好  ' } })

    expect(response.status).toBe(201)
    const data = await response.json()
    expect(data.post).toEqual({
      id: expect.any(String),
      text: '你好',
      createdAt: expect.any(Number),
      ...EMPTY_REACTIONS
    })
  })

  it('忽略客户端传入的 id（服务端是唯一权威）', async () => {
    const response = await json('/api/posts', {
      method: 'POST',
      body: { text: '伪造 id', id: 'client-supplied', createdAt: 1 }
    })

    const { post } = await response.json()
    expect(post.id).not.toBe('client-supplied')
    expect(post.createdAt).not.toBe(1)
  })

  it('空白内容返回 400 EMPTY', async () => {
    const response = await json('/api/posts', { method: 'POST', body: { text: '   ' } })

    await expectError(response, 400, 'EMPTY')
  })

  it('超长内容返回 400 TOO_LONG', async () => {
    const response = await json('/api/posts', {
      method: 'POST',
      body: { text: '字'.repeat(MAX_LEN + 1) }
    })

    await expectError(response, 400, 'TOO_LONG')
  })

  it('缺少 text 字段返回 400 EMPTY', async () => {
    const response = await json('/api/posts', { method: 'POST', body: {} })

    await expectError(response, 400, 'EMPTY')
  })

  it('text 类型错误返回 400 INVALID', async () => {
    const response = await json('/api/posts', { method: 'POST', body: { text: 123 } })

    await expectError(response, 400, 'INVALID')
  })

  it('请求体不是对象返回 400 INVALID', async () => {
    const response = await json('/api/posts', { method: 'POST', body: 'just a string' })

    await expectError(response, 400, 'INVALID')
  })

  it('非法 JSON 返回 400 BAD_JSON', async () => {
    const response = await json('/api/posts', { method: 'POST', raw: '{ "text": ' })

    await expectError(response, 400, 'BAD_JSON')
  })

  it('空 body 返回 400 BAD_JSON', async () => {
    const response = await json('/api/posts', { method: 'POST', raw: '' })

    await expectError(response, 400, 'BAD_JSON')
  })

  it('校验失败时不得写入数据', async () => {
    await json('/api/posts', { method: 'POST', body: { text: '  ' } })

    const data = await (await json('/api/posts')).json()
    expect(data.posts).toEqual([])
  })
})

describe('GET /api/posts/:id', () => {
  it('命中返回 200 与 post', async () => {
    const created = await (
      await json('/api/posts', { method: 'POST', body: { text: '可查询' } })
    ).json()

    const response = await json(`/api/posts/${created.post.id}`)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ post: created.post })
  })

  it('未命中返回 404 NOT_FOUND', async () => {
    const response = await json('/api/posts/does-not-exist')

    await expectError(response, 404, 'NOT_FOUND')
  })
})

describe('DELETE /api/posts/:id', () => {
  it('删除成功返回 204 且无响应体', async () => {
    const created = await (
      await json('/api/posts', { method: 'POST', body: { text: '待删除' } })
    ).json()

    const response = await json(`/api/posts/${created.post.id}`, { method: 'DELETE' })

    expect(response.status).toBe(204)
    // 契约明确要求「无响应体」，空字符串是唯一正确答案
    expect(await response.text()).toBe('')
  })

  it('删除后确实查不到', async () => {
    const created = await (
      await json('/api/posts', { method: 'POST', body: { text: '待删除' } })
    ).json()

    await json(`/api/posts/${created.post.id}`, { method: 'DELETE' })

    const response = await json(`/api/posts/${created.post.id}`)
    await expectError(response, 404, 'NOT_FOUND')
  })

  it('删除不存在的 id 返回 404 NOT_FOUND', async () => {
    const response = await json('/api/posts/nope', { method: 'DELETE' })

    await expectError(response, 404, 'NOT_FOUND')
  })
})

describe('DELETE /api/posts', () => {
  it('清空成功返回 204 且无响应体', async () => {
    await json('/api/posts', { method: 'POST', body: { text: 'a' } })
    await json('/api/posts', { method: 'POST', body: { text: 'b' } })

    const response = await json('/api/posts', { method: 'DELETE' })

    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
  })

  it('清空后列表为空但资料保留', async () => {
    await json('/api/posts', { method: 'POST', body: { text: 'a' } })
    await json('/api/profile', { method: 'PUT', body: { name: '阿铁' } })

    await json('/api/posts', { method: 'DELETE' })

    expect(await (await json('/api/posts')).json()).toEqual({ posts: [] })
    const { profile } = await (await json('/api/profile')).json()
    expect(profile.name).toBe('阿铁')
  })

  it('空仓库清空也返回 204（幂等）', async () => {
    const response = await json('/api/posts', { method: 'DELETE' })

    expect(response.status).toBe(204)
  })
})

describe('POST /api/posts/merge', () => {
  it('返回 added / skipped 与合并后的完整倒序列表', async () => {
    const response = await json('/api/posts/merge', {
      method: 'POST',
      body: {
        posts: [
          { id: 'a', text: '旧', createdAt: 1000 },
          { id: 'b', text: '新', createdAt: 2000 },
          { text: '旧', createdAt: 1000 } // 重复
        ]
      }
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.added).toBe(2)
    expect(data.skipped).toBe(1)
    expect(data.posts.map((post) => post.text)).toEqual(['新', '旧'])
  })

  it('非法条目计入 skipped 而不报错', async () => {
    const response = await json('/api/posts/merge', {
      method: 'POST',
      body: { posts: [{ text: '合法', createdAt: 1 }, { text: '', createdAt: 2 }, null] }
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.added).toBe(1)
    expect(data.skipped).toBe(2)
  })

  it('超长文本截断而非丢弃', async () => {
    const response = await json('/api/posts/merge', {
      method: 'POST',
      body: { posts: [{ text: '超'.repeat(MAX_LEN + 20), createdAt: 1 }] }
    })

    const data = await response.json()
    expect(data.added).toBe(1)
    expect(data.posts[0].text).toHaveLength(MAX_LEN)
  })

  it('posts 缺失或非数组返回 400 INVALID', async () => {
    await expectError(
      await json('/api/posts/merge', { method: 'POST', body: {} }),
      400,
      'INVALID'
    )
    await expectError(
      await json('/api/posts/merge', { method: 'POST', body: { posts: 'nope' } }),
      400,
      'INVALID'
    )
  })

  it('非法 JSON 返回 400 BAD_JSON', async () => {
    const response = await json('/api/posts/merge', { method: 'POST', raw: '[[[' })

    await expectError(response, 400, 'BAD_JSON')
  })

  it('空数组是合法空操作', async () => {
    const response = await json('/api/posts/merge', { method: 'POST', body: { posts: [] } })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ added: 0, skipped: 0, posts: [] })
  })

  it('导入的互动字段原样保留（目标状态语义）', async () => {
    const response = await json('/api/posts/merge', {
      method: 'POST',
      body: {
        posts: [
          { text: '带互动', createdAt: 1000, likes: 3, favorites: 2, liked: true, favorited: true }
        ]
      }
    })

    const { posts } = await response.json()
    expect({
      likes: posts[0].likes,
      favorites: posts[0].favorites,
      liked: posts[0].liked,
      favorited: posts[0].favorited
    }).toEqual({ likes: 3, favorites: 2, liked: true, favorited: true })
  })

  it('同一份备份导入两次，计数不翻倍', async () => {
    const body = { posts: [{ text: '备份', createdAt: 1000, likes: 4, liked: true }] }

    await json('/api/posts/merge', { method: 'POST', body })
    const data = await (await json('/api/posts/merge', { method: 'POST', body })).json()

    expect(data.posts[0].likes).toBe(4)
  })
})

describe('POST /api/posts/:id/reactions/:kind', () => {
  /** 测试辅助：发一条动态并返回其 id */
  async function createPost(text = '互动目标') {
    const { post } = await (
      await json('/api/posts', { method: 'POST', body: { text } })
    ).json()
    return post.id
  }

  it('无 body 时按 toggle：未点赞变成已点赞', async () => {
    const id = await createPost()

    const response = await app.request(`/api/posts/${id}/reactions/like`, { method: 'POST' })

    expect(response.status).toBe(200)
    const { post } = await response.json()
    expect(post.liked).toBe(true)
    expect(post.likes).toBe(1)
  })

  it('成功返回完整 Post（可直接覆盖本地副本）', async () => {
    const id = await createPost()

    const { post } = await (
      await json(`/api/posts/${id}/reactions/like`, { method: 'POST' })
    ).json()

    expect(post).toEqual({
      id,
      text: '互动目标',
      createdAt: expect.any(Number),
      likes: 1,
      favorites: 0,
      liked: true,
      favorited: false
    })
  })

  it('action=add 幂等地设为「有」', async () => {
    const id = await createPost()

    await json(`/api/posts/${id}/reactions/like`, { method: 'POST', body: { action: 'add' } })
    const { post } = await (
      await json(`/api/posts/${id}/reactions/like`, { method: 'POST', body: { action: 'add' } })
    ).json()

    expect(post.likes).toBe(1)
    expect(post.liked).toBe(true)
  })

  it('action=remove 幂等地设为「无」', async () => {
    const id = await createPost()
    await json(`/api/posts/${id}/reactions/like`, { method: 'POST', body: { action: 'add' } })

    const { post } = await (
      await json(`/api/posts/${id}/reactions/like`, { method: 'POST', body: { action: 'remove' } })
    ).json()

    expect(post.likes).toBe(0)
    expect(post.liked).toBe(false)
  })

  it('action=toggle 与省略 body 等效', async () => {
    const id = await createPost()

    const { post } = await (
      await json(`/api/posts/${id}/reactions/favorite`, { method: 'POST', body: { action: 'toggle' } })
    ).json()

    expect(post.favorited).toBe(true)
  })

  it('收藏走独立字段，不影响点赞', async () => {
    const id = await createPost()

    const { post } = await (
      await json(`/api/posts/${id}/reactions/favorite`, { method: 'POST' })
    ).json()

    expect(post.favorites).toBe(1)
    expect(post.favorited).toBe(true)
    expect(post.likes).toBe(0)
    expect(post.liked).toBe(false)
  })

  it('id 不存在返回 404 NOT_FOUND', async () => {
    const response = await json('/api/posts/nope/reactions/like', { method: 'POST' })

    await expectError(response, 404, 'NOT_FOUND')
  })

  it('kind 非法返回 400 INVALID', async () => {
    const id = await createPost()

    const response = await json(`/api/posts/${id}/reactions/likes`, { method: 'POST' })

    await expectError(response, 400, 'INVALID')
  })

  it('kind 非法的响应提示「未知的互动类型」', async () => {
    const id = await createPost()

    const data = await (await json(`/api/posts/${id}/reactions/bogus`, { method: 'POST' })).json()

    expect(data.error.message).toContain('未知的互动类型')
  })

  it('action 不在白名单返回 400 INVALID', async () => {
    const id = await createPost()

    const response = await json(`/api/posts/${id}/reactions/like`, {
      method: 'POST',
      body: { action: 'zap' }
    })

    await expectError(response, 400, 'INVALID')
  })

  it('action 为空串时按 toggle 处理', async () => {
    const id = await createPost()

    const { post } = await (
      await json(`/api/posts/${id}/reactions/like`, { method: 'POST', body: { action: '' } })
    ).json()

    expect(post.liked).toBe(true)
  })

  it('action 非字符串返回 400 INVALID', async () => {
    const id = await createPost()

    const response = await json(`/api/posts/${id}/reactions/like`, {
      method: 'POST',
      body: { action: 123 }
    })

    await expectError(response, 400, 'INVALID')
  })

  it('body 非法 JSON 返回 400 BAD_JSON', async () => {
    const id = await createPost()

    const response = await json(`/api/posts/${id}/reactions/like`, { method: 'POST', raw: '{bad}' })

    await expectError(response, 400, 'BAD_JSON')
  })

  it('body 不是对象返回 400 INVALID', async () => {
    const id = await createPost()

    const response = await json(`/api/posts/${id}/reactions/like`, {
      method: 'POST',
      body: 'nope'
    })

    await expectError(response, 400, 'INVALID')
  })

  it('非法 kind 时不产生状态变更', async () => {
    const id = await createPost()

    await json(`/api/posts/${id}/reactions/bogus`, { method: 'POST' })

    const { post } = await (await json(`/api/posts/${id}`)).json()
    expect({
      likes: post.likes,
      favorites: post.favorites,
      liked: post.liked,
      favorited: post.favorited
    }).toEqual(EMPTY_REACTIONS)
  })
})

describe('GET /api/profile', () => {
  it('200 且返回默认资料', async () => {
    const response = await json('/api/profile')

    expect(response.status).toBe(200)
    const { profile } = await response.json()
    expect(profile).toEqual({
      name: DEFAULT_NAME,
      bio: DEFAULT_BIO,
      avatar: DEFAULT_AVATAR,
      joinedAt: expect.any(Number)
    })
  })
})

describe('PUT /api/profile', () => {
  it('局部更新成功返回 200 与完整资料', async () => {
    const response = await json('/api/profile', {
      method: 'PUT',
      body: { name: '阿铁', bio: '简介', avatar: '🦊' }
    })

    expect(response.status).toBe(200)
    const { profile } = await response.json()
    expect(profile.name).toBe('阿铁')
    expect(profile.bio).toBe('简介')
    expect(profile.avatar).toBe('🦊')
    expect(profile.joinedAt).toBeGreaterThan(0)
  })

  it('只传部分字段时其余保持不变', async () => {
    await json('/api/profile', { method: 'PUT', body: { bio: '只改简介' } })

    const { profile } = await (await json('/api/profile')).json()
    expect(profile.name).toBe(DEFAULT_NAME)
    expect(profile.bio).toBe('只改简介')
  })

  it('name 为空回退默认、超长截断', async () => {
    const empty = await (
      await json('/api/profile', { method: 'PUT', body: { name: '   ' } })
    ).json()
    expect(empty.profile.name).toBe(DEFAULT_NAME)

    const long = await (
      await json('/api/profile', { method: 'PUT', body: { name: '名'.repeat(NAME_MAX + 5) } })
    ).json()
    expect(long.profile.name).toHaveLength(NAME_MAX)
  })

  it('bio 超长截断', async () => {
    const { profile } = await (
      await json('/api/profile', { method: 'PUT', body: { bio: '介'.repeat(BIO_MAX + 5) } })
    ).json()

    expect(profile.bio).toHaveLength(BIO_MAX)
  })

  it('joinedAt 不可通过此接口修改', async () => {
    const before = (await (await json('/api/profile')).json()).profile.joinedAt

    const { profile } = await (
      await json('/api/profile', { method: 'PUT', body: { name: '阿铁', joinedAt: 1 } })
    ).json()

    expect(profile.joinedAt).toBe(before)
  })

  it('非法头像返回 400 INVALID_AVATAR', async () => {
    const response = await json('/api/profile', { method: 'PUT', body: { avatar: '💩' } })

    await expectError(response, 400, 'INVALID_AVATAR')
  })

  it('字段类型错误返回 400 INVALID', async () => {
    await expectError(
      await json('/api/profile', { method: 'PUT', body: { name: 123 } }),
      400,
      'INVALID'
    )
    await expectError(
      await json('/api/profile', { method: 'PUT', body: { bio: null } }),
      400,
      'INVALID'
    )
  })

  it('非法头像时不产生半提交（其它字段也不生效）', async () => {
    const before = (await (await json('/api/profile')).json()).profile

    await json('/api/profile', { method: 'PUT', body: { name: '阿铁', avatar: '💩' } })

    const after = (await (await json('/api/profile')).json()).profile
    expect(after).toEqual(before)
  })

  it('请求体不是对象返回 400 INVALID', async () => {
    await expectError(
      await json('/api/profile', { method: 'PUT', body: 'nope' }),
      400,
      'INVALID'
    )
  })

  it('非法 JSON 返回 400 BAD_JSON', async () => {
    const response = await json('/api/profile', { method: 'PUT', raw: '{bad}' })

    await expectError(response, 400, 'BAD_JSON')
  })
})

describe('POST /api/profile/restore', () => {
  it('当前为默认资料时应用备份，返回 applied:true', async () => {
    const response = await json('/api/profile/restore', {
      method: 'POST',
      body: { profile: { name: '备份用户', bio: '来自备份', avatar: '🐼' } }
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.applied).toBe(true)
    expect(data.profile.name).toBe('备份用户')
    expect(data.profile.avatar).toBe('🐼')
  })

  it('当前资料已修改时不覆盖，返回 applied:false', async () => {
    await json('/api/profile', { method: 'PUT', body: { name: '我改了' } })

    const data = await (
      await json('/api/profile/restore', {
        method: 'POST',
        body: { profile: { name: '备份用户', avatar: '🐼' } }
      })
    ).json()

    expect(data.applied).toBe(false)
    expect(data.profile.name).toBe('我改了')
  })

  it('备份头像非法返回 400 INVALID_AVATAR', async () => {
    const response = await json('/api/profile/restore', {
      method: 'POST',
      body: { profile: { name: '备份', avatar: '💩' } }
    })

    await expectError(response, 400, 'INVALID_AVATAR')
  })

  it('缺少 profile 字段返回 400 INVALID', async () => {
    await expectError(
      await json('/api/profile/restore', { method: 'POST', body: {} }),
      400,
      'INVALID'
    )
  })

  it('非法 JSON 返回 400 BAD_JSON', async () => {
    const response = await json('/api/profile/restore', { method: 'POST', raw: 'x' })

    await expectError(response, 400, 'BAD_JSON')
  })
})

describe('POST /api/profile/reset', () => {
  it('重置为默认资料并返回 200', async () => {
    await json('/api/profile', {
      method: 'PUT',
      body: { name: '阿铁', bio: '简介', avatar: '🦊' }
    })

    const response = await json('/api/profile/reset', { method: 'POST' })

    expect(response.status).toBe(200)
    const { profile } = await response.json()
    expect(profile.name).toBe(DEFAULT_NAME)
    expect(profile.bio).toBe(DEFAULT_BIO)
    expect(profile.avatar).toBe(DEFAULT_AVATAR)
  })

  it('重置会刷新 joinedAt', async () => {
    const before = (await (await json('/api/profile')).json()).profile.joinedAt

    const { profile } = await (await json('/api/profile/reset', { method: 'POST' })).json()

    expect(profile.joinedAt).toBeGreaterThanOrEqual(before)
  })

  it('无请求体也能成功（不应因缺 body 报 BAD_JSON）', async () => {
    const response = await app.request('/api/profile/reset', { method: 'POST' })

    expect(response.status).toBe(200)
  })
})

describe('未知路由与通用错误处理', () => {
  it('未定义的路由返回 404 NOT_FOUND 且结构统一', async () => {
    const response = await json('/api/unknown')

    await expectError(response, 404, 'NOT_FOUND')
  })

  it('错误响应全部带 application/json 内容类型', async () => {
    const response = await json('/api/posts/nope')

    expect(response.headers.get('content-type')).toContain('application/json')
  })

  it('store 抛出的未知异常降级为 500 而不是泄露堆栈', async () => {
    // 500 分支会打日志，这里静音以免污染测试输出（断言本身与日志无关）
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // 用一个只会爆炸的假 store，验证兜底错误处理
    const brokenApp = createApp({
      store: {
        listPosts: () => {
          throw new Error('boom: 内部实现细节不应外泄')
        }
      }
    })

    const response = await brokenApp.request('/api/posts')

    expect(response.status).toBe(500)
    const data = await response.json()
    expect(data.error.code).toBeDefined()
    expect(JSON.stringify(data)).not.toContain('boom')
    // 服务端必须留下可排查的日志
    expect(spy).toHaveBeenCalled()

    spy.mockRestore()
  })
})

describe('端到端流程', () => {
  it('发布 → 列表 → 单查 → 删除 → 清空 全链路一致', async () => {
    const created = await (
      await json('/api/posts', { method: 'POST', body: { text: '第一条' } })
    ).json()

    const listed = await (await json('/api/posts')).json()
    expect(listed.posts).toHaveLength(1)

    const fetched = await (await json(`/api/posts/${created.post.id}`)).json()
    expect(fetched.post.id).toBe(created.post.id)

    expect((await json(`/api/posts/${created.post.id}`, { method: 'DELETE' })).status).toBe(204)
    expect(await (await json('/api/posts')).json()).toEqual({ posts: [] })

    await json('/api/posts', { method: 'POST', body: { text: '再发一条' } })
    expect((await json('/api/posts', { method: 'DELETE' })).status).toBe(204)
    expect(await (await json('/api/posts')).json()).toEqual({ posts: [] })
  })

  it('白名单内所有头像都能通过 PUT /api/profile', async () => {
    for (const avatar of AVATARS) {
      const response = await json('/api/profile', { method: 'PUT', body: { avatar } })
      expect(response.status).toBe(200)
      const { profile } = await response.json()
      expect(profile.avatar).toBe(avatar)
    }
  })
})
