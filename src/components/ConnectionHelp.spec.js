/**
 * ConnectionHelp 组件测试（TDD）
 *
 * 帮助面板从「怎么解决本地存储被禁」改成「怎么把后端服务跑起来」。
 * 步骤必须是照着做就能验证成功的：启动 → 健康检查 → 排查端口/防火墙。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ConnectionHelp from './ConnectionHelp.vue'

const find = (wrapper, testid) => wrapper.find(`[data-testid="${testid}"]`)

let wrapper

afterEach(() => {
  wrapper?.unmount()
})

describe('ConnectionHelp · 面板内容', () => {
  const baseProps = { command: 'npm run dev' }

  it('渲染标题，说明是连接服务端的问题', () => {
    wrapper = mount(ConnectionHelp, { props: baseProps })
    expect(find(wrapper, 'help-title').text()).toContain('服务')
  })

  it('说明里给出无法连接服务端的原因', () => {
    wrapper = mount(ConnectionHelp, { props: baseProps })
    expect(find(wrapper, 'help-reason').text()).toContain('后端')
  })

  it('默认命令是 npm run dev', () => {
    wrapper = mount(ConnectionHelp)
    expect(find(wrapper, 'help-command').text()).toBe('npm run dev')
  })

  it('展示传入的启动命令', () => {
    wrapper = mount(ConnectionHelp, { props: { command: 'pnpm dev' } })
    expect(find(wrapper, 'help-command').text()).toBe('pnpm dev')
  })

  it('给出 npm run dev 与 start:server 两种启动方式', () => {
    wrapper = mount(ConnectionHelp, { props: baseProps })
    const text = wrapper.text()

    expect(text).toContain('npm run dev')
    expect(text).toContain('npm run start:server')
  })

  it('提示默认端口 8787 与健康检查地址', () => {
    wrapper = mount(ConnectionHelp, { props: baseProps })
    const text = wrapper.text()

    expect(text).toContain('8787')
    expect(text).toContain('/api/health')
  })

  it('包含端口占用与防火墙的排查步骤', () => {
    wrapper = mount(ConnectionHelp, { props: baseProps })
    const text = wrapper.text()

    expect(text).toContain('端口')
    expect(text).toContain('防火墙')
  })

  it('步骤序号从 1 开始连续编号，共 4 步', () => {
    wrapper = mount(ConnectionHelp, { props: baseProps })
    const indexes = wrapper.findAll('[data-testid="step-index"]')

    expect(indexes).toHaveLength(4)
    expect(indexes.map((node) => node.text())).toEqual(['1', '2', '3', '4'])
  })
})

describe('ConnectionHelp · 交互', () => {
  const baseProps = { command: 'npm run dev' }

  it('点击关闭 emit close', async () => {
    wrapper = mount(ConnectionHelp, { props: baseProps })
    await find(wrapper, 'help-close-btn').trigger('click')

    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('点击遮罩 emit close', async () => {
    wrapper = mount(ConnectionHelp, { props: baseProps })
    await find(wrapper, 'help-mask').trigger('click')

    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('点击复制命令 emit copy', async () => {
    wrapper = mount(ConnectionHelp, { props: baseProps })
    await find(wrapper, 'copy-btn').trigger('click')

    expect(wrapper.emitted('copy')).toHaveLength(1)
  })

  it('面板带对话框语义', () => {
    wrapper = mount(ConnectionHelp, { props: baseProps })
    const dialog = find(wrapper, 'help-dialog')

    expect(dialog.attributes('role')).toBe('dialog')
    expect(dialog.attributes('aria-modal')).toBe('true')
  })
})
