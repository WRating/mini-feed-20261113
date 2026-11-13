/**
 * ProfilePanel 组件测试（TDD）
 * 资料展示 + 编辑表单 + 统计；保存通过 emit 上报，组件不直接改 store。
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ProfilePanel from './ProfilePanel.vue'

const find = (wrapper, testid) => wrapper.find(`[data-testid="${testid}"]`)

const baseProps = {
  profile: { name: '小记', bio: '记录生活，也记录代码。', avatar: '🦊', joinedAt: Date.now() },
  stats: { posts: 3, chars: 120, days: 5 },
  avatars: ['🙂', '😀', '🐱', '🐼', '🦊', '🚀', '🌙', '🍀', '🎧', '📚']
}

let wrapper

afterEach(() => {
  wrapper?.unmount()
})

describe('ProfilePanel · 展示', () => {
  it('显示昵称、简介与头像', () => {
    wrapper = mount(ProfilePanel, { props: baseProps })
    expect(find(wrapper, 'profile-name').text()).toBe('小记')
    expect(find(wrapper, 'profile-bio').text()).toBe('记录生活，也记录代码。')
    expect(find(wrapper, 'profile-avatar').text()).toBe('🦊')
  })

  it('显示三项统计', () => {
    wrapper = mount(ProfilePanel, { props: baseProps })
    expect(find(wrapper, 'stat-posts').text()).toBe('3')
    expect(find(wrapper, 'stat-chars').text()).toBe('120')
    expect(find(wrapper, 'stat-days').text()).toBe('5')
  })

  it('显示三项统计的中文标签', () => {
    wrapper = mount(ProfilePanel, { props: baseProps })
    const text = wrapper.text()
    expect(text).toContain('动态')
    expect(text).toContain('累计字数')
    expect(text).toContain('使用天数')
  })

  it('显示加入时间', () => {
    wrapper = mount(ProfilePanel, { props: baseProps })
    expect(find(wrapper, 'profile-since').text()).toContain('加入于')
  })
})

describe('ProfilePanel · 编辑', () => {
  it('初始不显示表单', () => {
    wrapper = mount(ProfilePanel, { props: baseProps })
    expect(find(wrapper, 'profile-form').exists()).toBe(false)
  })

  it('点击「编辑资料」展开表单并带入当前值', async () => {
    wrapper = mount(ProfilePanel, { props: baseProps })
    await find(wrapper, 'edit-btn').trigger('click')

    expect(find(wrapper, 'profile-form').exists()).toBe(true)
    expect(find(wrapper, 'name-input').element.value).toBe('小记')
    expect(find(wrapper, 'bio-input').element.value).toBe('记录生活，也记录代码。')
  })

  it('渲染全部可选头像', async () => {
    wrapper = mount(ProfilePanel, { props: baseProps })
    await find(wrapper, 'edit-btn').trigger('click')

    expect(wrapper.findAll('[data-testid="avatar-option"]')).toHaveLength(10)
  })

  it('当前头像标记为选中', async () => {
    wrapper = mount(ProfilePanel, { props: baseProps })
    await find(wrapper, 'edit-btn').trigger('click')

    const selected = wrapper.findAll('[data-testid="avatar-option"]').filter(
      (el) => el.attributes('aria-pressed') === 'true'
    )
    expect(selected).toHaveLength(1)
    expect(selected[0].text()).toBe('🦊')
  })

  it('点击头像切换选中状态', async () => {
    wrapper = mount(ProfilePanel, { props: baseProps })
    await find(wrapper, 'edit-btn').trigger('click')

    const panda = wrapper.findAll('[data-testid="avatar-option"]').find((el) => el.text() === '🐼')
    await panda.trigger('click')

    expect(panda.attributes('aria-pressed')).toBe('true')
  })

  it('保存时 emit save 并带上三个字段', async () => {
    wrapper = mount(ProfilePanel, { props: baseProps })
    await find(wrapper, 'edit-btn').trigger('click')
    await find(wrapper, 'name-input').setValue('阿铁')
    await find(wrapper, 'bio-input').setValue('新简介')
    await find(wrapper, 'save-btn').trigger('click')

    expect(wrapper.emitted('save')[0][0]).toEqual({
      name: '阿铁',
      bio: '新简介',
      avatar: '🦊'
    })
  })

  it('保存后自动收起表单', async () => {
    wrapper = mount(ProfilePanel, { props: baseProps })
    await find(wrapper, 'edit-btn').trigger('click')
    await find(wrapper, 'save-btn').trigger('click')

    expect(find(wrapper, 'profile-form').exists()).toBe(false)
  })

  it('取消后收起表单且不 emit save', async () => {
    wrapper = mount(ProfilePanel, { props: baseProps })
    await find(wrapper, 'edit-btn').trigger('click')
    await find(wrapper, 'name-input').setValue('不该保存')
    await find(wrapper, 'cancel-btn').trigger('click')

    expect(find(wrapper, 'profile-form').exists()).toBe(false)
    expect(wrapper.emitted('save')).toBeFalsy()
  })

  it('再次展开表单时重置为用户当前值（不残留上次草稿）', async () => {
    wrapper = mount(ProfilePanel, { props: baseProps })
    await find(wrapper, 'edit-btn').trigger('click')
    await find(wrapper, 'name-input').setValue('临时改动')
    await find(wrapper, 'cancel-btn').trigger('click')
    await find(wrapper, 'edit-btn').trigger('click')

    expect(find(wrapper, 'name-input').element.value).toBe('小记')
  })

  it('Esc 收起表单', async () => {
    wrapper = mount(ProfilePanel, { props: baseProps, attachTo: document.body })
    await find(wrapper, 'edit-btn').trigger('click')

    await find(wrapper, 'profile-form').trigger('keydown', { key: 'Escape' })
    expect(find(wrapper, 'profile-form').exists()).toBe(false)
  })

  it('输入框带有长度上限', async () => {
    wrapper = mount(ProfilePanel, { props: baseProps })
    await find(wrapper, 'edit-btn').trigger('click')

    expect(find(wrapper, 'name-input').attributes('maxlength')).toBe('20')
    expect(find(wrapper, 'bio-input').attributes('maxlength')).toBe('60')
  })
})

describe('ProfilePanel · 暴露控制', () => {
  it('可通过 exposed 方法关闭表单（供父级 Esc 使用）', async () => {
    wrapper = mount(ProfilePanel, { props: baseProps })
    await find(wrapper, 'edit-btn').trigger('click')

    wrapper.vm.closeEditor()
    await wrapper.vm.$nextTick()
    expect(find(wrapper, 'profile-form').exists()).toBe(false)
  })

  it('可通过 exposed 属性判断是否正在编辑', async () => {
    wrapper = mount(ProfilePanel, { props: baseProps })
    expect(wrapper.vm.isEditing).toBe(false)

    await find(wrapper, 'edit-btn').trigger('click')
    expect(wrapper.vm.isEditing).toBe(true)
  })
})
