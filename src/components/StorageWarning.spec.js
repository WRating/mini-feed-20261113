/**
 * StorageWarning 与 StorageHelp 组件测试（TDD）
 * 两者一起验证：告警条文案随存储状态变化，帮助面板按场景裁剪步骤。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import StorageWarning from './StorageWarning.vue'
import StorageHelp from './StorageHelp.vue'

const find = (wrapper, testid) => wrapper.find(`[data-testid="${testid}"]`)

let wrapper

afterEach(() => {
  wrapper?.unmount()
})

describe('StorageWarning', () => {
  it('storageKind 为 local 时不渲染', () => {
    wrapper = mount(StorageWarning, { props: { storageKind: 'local' } })
    expect(find(wrapper, 'storage-warning').exists()).toBe(false)
  })

  it('session 降级时给出「刷新不丢、关标签页丢」的准确说明', () => {
    wrapper = mount(StorageWarning, { props: { storageKind: 'session' } })
    const text = find(wrapper, 'storage-warning-text').text()

    expect(text).toContain('本地存储')
    expect(text).toContain('刷新不丢')
  })

  it('tab 降级时同样提示仅当前标签页有效', () => {
    wrapper = mount(StorageWarning, { props: { storageKind: 'tab' } })
    expect(find(wrapper, 'storage-warning-text').text()).toContain('标签页')
  })

  it('memory 模式提示刷新或关闭都会丢失', () => {
    wrapper = mount(StorageWarning, { props: { storageKind: 'memory' } })
    expect(find(wrapper, 'storage-warning-text').text()).toContain('刷新或关闭')
  })

  it('点击「如何解决」emit help', async () => {
    wrapper = mount(StorageWarning, { props: { storageKind: 'session' } })
    await find(wrapper, 'help-btn').trigger('click')

    expect(wrapper.emitted('help')).toHaveLength(1)
  })

  it('告警条带 alert 语义', () => {
    wrapper = mount(StorageWarning, { props: { storageKind: 'session' } })
    expect(find(wrapper, 'storage-warning').attributes('role')).toBe('alert')
  })
})

describe('StorageHelp · 面板内容', () => {
  const baseProps = { storageKind: 'session', isFileProtocol: true, command: 'cd /d "C:\\app"' }

  it('渲染标题与原因说明', () => {
    wrapper = mount(StorageHelp, { props: baseProps })
    expect(find(wrapper, 'help-title').text()).toBe('让数据保存下来')
    expect(find(wrapper, 'help-reason').text()).toContain('Local Storage')
  })

  it('file:// 场景显示启动服务器两步', () => {
    wrapper = mount(StorageHelp, { props: baseProps })
    expect(wrapper.findAll('[data-testid="step-server"]')).toHaveLength(2)
  })

  it('已是 http 但被拦截时隐藏启动服务器步骤，并换标题', () => {
    wrapper = mount(StorageHelp, { props: { ...baseProps, isFileProtocol: false } })

    expect(wrapper.findAll('[data-testid="step-server"]')).toHaveLength(0)
    expect(find(wrapper, 'help-title').text()).toBe('浏览器阻止了数据保存')
    expect(find(wrapper, 'help-reason').text()).toContain('隐私设置')
  })

  it('无论哪种场景都保留「检查浏览器设置」与「先备份数据」两步', () => {
    wrapper = mount(StorageHelp, { props: { ...baseProps, isFileProtocol: false } })
    const text = wrapper.text()
    expect(text).toContain('Cookie')
    expect(text).toContain('导出备份')
  })

  it('展示传入的启动命令', () => {
    wrapper = mount(StorageHelp, { props: baseProps })
    expect(find(wrapper, 'help-command').text()).toBe('cd /d "C:\\app"')
  })

  it('步骤序号自动编号为 1..n', () => {
    wrapper = mount(StorageHelp, { props: baseProps })
    const indexes = wrapper.findAll('[data-testid="step-index"]')
    expect(indexes.length).toBeGreaterThanOrEqual(4)
  })
})

describe('StorageHelp · 交互', () => {
  const baseProps = { storageKind: 'session', isFileProtocol: true, command: 'cmd' }

  it('点击关闭 emit close', async () => {
    wrapper = mount(StorageHelp, { props: baseProps })
    await find(wrapper, 'help-close-btn').trigger('click')

    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('点击遮罩 emit close', async () => {
    wrapper = mount(StorageHelp, { props: baseProps })
    await find(wrapper, 'help-mask').trigger('click')

    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('点击复制命令 emit copy', async () => {
    wrapper = mount(StorageHelp, { props: baseProps })
    await find(wrapper, 'copy-btn').trigger('click')

    expect(wrapper.emitted('copy')).toHaveLength(1)
  })

  it('面板带对话框语义', () => {
    wrapper = mount(StorageHelp, { props: baseProps })
    const dialog = find(wrapper, 'help-dialog')
    expect(dialog.attributes('role')).toBe('dialog')
    expect(dialog.attributes('aria-modal')).toBe('true')
  })
})
