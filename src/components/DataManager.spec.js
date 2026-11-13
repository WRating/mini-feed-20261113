/**
 * DataManager 组件测试（TDD）
 * 数据管理：存储占用条 + 导出/导入/清空三个操作。
 * 组件不直接碰 store 与文件系统，全部通过事件上报。
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import DataManager from './DataManager.vue'

const find = (wrapper, testid) => wrapper.find(`[data-testid="${testid}"]`)

const baseProps = {
  meter: { label: '占用 996 B / 约 5 MB', barWidth: '2%', level: 'normal', percent: 2 }
}

let wrapper

afterEach(() => {
  wrapper?.unmount()
})

describe('DataManager · 展示', () => {
  it('显示存储占用文案', () => {
    wrapper = mount(DataManager, { props: baseProps })
    expect(find(wrapper, 'storage-text').text()).toBe('占用 996 B / 约 5 MB')
  })

  it('进度条宽度按传入值渲染', () => {
    wrapper = mount(DataManager, { props: baseProps })
    expect(find(wrapper, 'storage-fill').attributes('style')).toContain('2%')
  })

  it('进度条带有可访问的进度语义', () => {
    wrapper = mount(DataManager, { props: baseProps })
    const bar = find(wrapper, 'storage-bar')
    expect(bar.attributes('role')).toBe('progressbar')
    expect(bar.attributes('aria-valuenow')).toBe('2')
  })

  it('warn 级别带 is-warn 类', () => {
    wrapper = mount(DataManager, {
      props: { meter: { ...baseProps.meter, level: 'warn', percent: 75 } }
    })
    expect(find(wrapper, 'storage-bar').classes()).toContain('is-warn')
  })

  it('danger 级别带 is-full 类', () => {
    wrapper = mount(DataManager, {
      props: { meter: { ...baseProps.meter, level: 'danger', percent: 95 } }
    })
    expect(find(wrapper, 'storage-bar').classes()).toContain('is-full')
  })

  it('渲染三个操作按钮与说明文字', () => {
    wrapper = mount(DataManager, { props: baseProps })
    expect(find(wrapper, 'export-btn').exists()).toBe(true)
    expect(find(wrapper, 'import-btn').exists()).toBe(true)
    expect(find(wrapper, 'clear-btn').exists()).toBe(true)
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
