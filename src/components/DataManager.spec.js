/**
 * DataManager 组件测试（TDD）
 * 数据管理：服务端数据概览 + 导出/导入/清空三个操作。
 * 组件不直接碰 store 与文件系统，全部通过事件上报。
 *
 * 后端是内存存储，没有 5MB 配额这回事，
 * 因此不再有进度条——展示配额反而会误导用户以为快到上限了。
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import DataManager from './DataManager.vue'

const find = (wrapper, testid) => wrapper.find(`[data-testid="${testid}"]`)

const baseProps = {
  stats: { posts: 3, chars: 42, bytes: 812, formatted: '812 B' }
}

let wrapper

afterEach(() => {
  wrapper?.unmount()
})

describe('DataManager · 展示', () => {
  it('展示服务端数据概览：条数、字数、字节', () => {
    wrapper = mount(DataManager, { props: baseProps })
    const text = find(wrapper, 'storage-text').text()

    expect(text).toContain('服务端数据')
    expect(text).toContain('3 条动态')
    expect(text).toContain('42 字')
    expect(text).toContain('812 B')
  })

  it('字节数使用传入的 formatted 而不是自己换算', () => {
    wrapper = mount(DataManager, {
      props: { stats: { posts: 1, chars: 10, bytes: 2048, formatted: '2.0 KB' } }
    })
    expect(find(wrapper, 'storage-text').text()).toContain('2.0 KB')
  })

  it('没有进度条：内存存储无配额概念', () => {
    wrapper = mount(DataManager, { props: baseProps })
    expect(find(wrapper, 'storage-bar').exists()).toBe(false)
    expect(find(wrapper, 'storage-fill').exists()).toBe(false)
  })

  it('统计缺省时也能渲染，不报错', () => {
    wrapper = mount(DataManager)
    expect(find(wrapper, 'storage-text').exists()).toBe(true)
    expect(find(wrapper, 'storage-text').text()).toContain('服务端数据')
  })

  it('渲染三个操作按钮', () => {
    wrapper = mount(DataManager, { props: baseProps })
    expect(find(wrapper, 'export-btn').exists()).toBe(true)
    expect(find(wrapper, 'import-btn').exists()).toBe(true)
    expect(find(wrapper, 'clear-btn').exists()).toBe(true)
  })

  it('说明文字提醒数据存于服务端内存、重启会清空', () => {
    wrapper = mount(DataManager, { props: baseProps })
    const text = wrapper.text()

    expect(text).toContain('内存')
    expect(text).toContain('重启')
    expect(text).toContain('导出备份')
  })

  it('保留导入合并的说明', () => {
    wrapper = mount(DataManager, { props: baseProps })
    expect(wrapper.text()).toContain('导入采用合并方式')
  })

  it('隐藏的文件输入只接受 json', () => {
    wrapper = mount(DataManager, { props: baseProps })
    const input = find(wrapper, 'import-file')
    expect(input.attributes('accept')).toContain('json')
    expect(input.attributes('hidden')).toBeDefined()
  })
})

describe('DataManager · 交互', () => {
  it('点击导出 emit export', async () => {
    wrapper = mount(DataManager, { props: baseProps })
    await find(wrapper, 'export-btn').trigger('click')
    expect(wrapper.emitted('export')).toHaveLength(1)
  })

  it('点击导入会打开文件选择框', async () => {
    wrapper = mount(DataManager, { props: baseProps })
    const input = find(wrapper, 'import-file').element
    const clickSpy = vi.spyOn(input, 'click')

    await find(wrapper, 'import-btn').trigger('click')
    expect(clickSpy).toHaveBeenCalled()
  })

  it('选择文件后 emit import 并带上文件对象', async () => {
    wrapper = mount(DataManager, { props: baseProps })
    const file = new File(['{"posts":[]}'], 'backup.json', { type: 'application/json' })

    const input = find(wrapper, 'import-file')
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')

    expect(wrapper.emitted('import')).toBeTruthy()
    expect(wrapper.emitted('import')[0][0]).toBe(file)
  })

  it('未选择文件时 change 不 emit', async () => {
    wrapper = mount(DataManager, { props: baseProps })
    const input = find(wrapper, 'import-file')
    Object.defineProperty(input.element, 'files', { value: [], configurable: true })

    await input.trigger('change')
    expect(wrapper.emitted('import')).toBeFalsy()
  })

  it('点击清空先弹出确认，确认后 emit clear', async () => {
    wrapper = mount(DataManager, { props: { ...baseProps, confirmClear: true } })
    await find(wrapper, 'clear-btn').trigger('click')

    expect(find(wrapper, 'clear-confirm').exists()).toBe(true)
    expect(wrapper.emitted('clear')).toBeFalsy()

    await find(wrapper, 'clear-confirm-btn').trigger('click')
    expect(wrapper.emitted('clear')).toHaveLength(1)
  })

  it('取消清空不 emit', async () => {
    wrapper = mount(DataManager, { props: { ...baseProps, confirmClear: true } })
    await find(wrapper, 'clear-btn').trigger('click')
    await find(wrapper, 'clear-cancel-btn').trigger('click')

    expect(wrapper.emitted('clear')).toBeFalsy()
    expect(find(wrapper, 'clear-confirm').exists()).toBe(false)
  })

  it('确认后关闭确认框', async () => {
    wrapper = mount(DataManager, { props: { ...baseProps, confirmClear: true } })
    await find(wrapper, 'clear-btn').trigger('click')
    await find(wrapper, 'clear-confirm-btn').trigger('click')

    expect(find(wrapper, 'clear-confirm').exists()).toBe(false)
  })
})
