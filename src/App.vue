<script setup>
/**
 * 应用根组件：负责视图编排与跨领域动作的协调。
 *
 * 分层约定：
 * - 数据状态在 store，展示状态（当前视图、高亮、面板开关）在本地 ref
 * - 子组件只上报意图，由这里决定调用哪个 store
 * - 天气刷新、备份导入导出这类有副作用的动作在这里落地
 */
import { computed, onMounted, ref, useTemplateRef } from 'vue'
import { storeToRefs } from 'pinia'
import { usePostsStore } from '@/stores/posts'
import { useProfileStore } from '@/stores/profile'
import { useWeatherStore } from '@/stores/weather'
import { useDataBackup } from '@/composables/useDataBackup'
import { useStorageMeter } from '@/composables/useStorageMeter'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { useStorage } from '@/services/storage-context'

import TabBar from '@/components/TabBar.vue'
import TodayCard from '@/components/TodayCard.vue'
import PostComposer from '@/components/PostComposer.vue'
import PostList from '@/components/PostList.vue'
import PostDetail from '@/components/PostDetail.vue'
import ProfilePanel from '@/components/ProfilePanel.vue'
import DataManager from '@/components/DataManager.vue'
import StorageWarning from '@/components/StorageWarning.vue'
import StorageHelp from '@/components/StorageHelp.vue'
import AppToast from '@/components/AppToast.vue'

const storage = useStorage()
const postsStore = usePostsStore()
const profileStore = useProfileStore()
const weatherStore = useWeatherStore()

const { posts, count, lastPublishedId, totalChars } = storeToRefs(postsStore)

const backup = useDataBackup()
const meter = useStorageMeter()
const toast = useToast()
const confirm = useConfirm()

/**
 * 传给 DataManager 的必须是**已解包**的普通值。
 * 直接把含 ref 的对象当 prop 传下去，模板里 `meter.barWidth` 拿到的是 Ref 对象，
 * 对象字面量（:style / :class）不会自动解包，会导致进度条宽度失效、预警色失灵。
 */
const meterView = computed(() => ({
  label: meter.label.value,
  barWidth: meter.barWidth.value,
  level: meter.level.value,
  percent: meter.percent.value
}))

/* ===== 视图与面板状态 ===== */
const TABS = [
  { key: 'home', label: '首页' },
  { key: 'profile', label: '个人中心' }
]

const activeTab = ref('home')
const detailId = ref(null)
const helpVisible = ref(false)
const profilePanelRef = useTemplateRef('profilePanel')

const isDetailOpen = computed(() => detailId.value !== null)
const detailPost = computed(() => (detailId.value ? postsStore.getById(detailId.value) : null))
const author = computed(() => ({ name: profileStore.name, avatar: profileStore.avatar }))
const stats = computed(() => ({
  posts: count.value,
  chars: totalChars.value,
  days: profileStore.daysUsed
}))

/* ===== 存储降级提示 ===== */
const storageKind = computed(() => storage.kind)
const isFileProtocol = computed(() => location.protocol === 'file:')

/** 从当前地址推导出可直接执行的启动命令，省去用户手打路径 */
const startCommand = computed(() => {
  if (!isFileProtocol.value) return 'python -m http.server 8000'
  try {
    let path = decodeURIComponent(location.pathname).replace(/\/[^/]*$/, '')
    if (/^\/[A-Za-z]:/.test(path)) path = path.slice(1).replace(/\//g, '\\')
    if (path) return `cd /d "${path}"\npython -m http.server 8000`
  } catch {
    // 取不到路径时给出通用命令
  }
  return 'cd /d "项目目录"\npython -m http.server 8000'
})

/* ===== 动态操作 ===== */
function handlePublish(text) {
  const result = postsStore.publish(text)
  if (!result.ok) {
    toast.show(result.error)
    return
  }
  meter.refresh()
}

function openDetail(id) {
  detailId.value = id
}

function closeDetail() {
  detailId.value = null
}

function handleRemove(id) {
  // 环境无法弹窗时按「取消」处理，避免误删
  if (!confirm.ask('确定删除这条动态吗？删除后无法恢复。')) return
  postsStore.remove(id)
  if (detailId.value === id) detailId.value = null
  meter.refresh()
  toast.show('已删除')
}

/* ===== 资料操作 ===== */
function handleSaveProfile(patch) {
  profileStore.update(patch)
  toast.show('资料已保存')
}

/* ===== 天气 ===== */
function refreshWeather() {
  weatherStore.refresh().then(() => meter.refresh())
}

/* ===== 备份操作 ===== */
function handleExport() {
  const result = backup.exportBackup()
  if (!result.ok) {
    toast.show(result.error)
    return
  }
  toast.show(`已导出 ${result.count} 条动态`)
}

function handleImport(file) {
  const reader = new FileReader()

  reader.onload = () => {
    const result = backup.importBackup(String(reader.result || ''))
    if (!result.ok) {
      toast.show(`导入失败：${result.error}`)
      return
    }

    const parts = [`已导入 ${result.added} 条动态`]
    if (result.skipped > 0) parts.push(`跳过 ${result.skipped} 条`)
    if (result.profileRestored) parts.push('资料已恢复')
    toast.show(parts.join('，'))
    meter.refresh()
  }

  reader.onerror = () => toast.show('读取文件失败')
  reader.readAsText(file)
}

function handleClear() {
  backup.clearAll()
  detailId.value = null
  meter.refresh()
  toast.show('数据已清空')
}

/* ===== 键盘快捷键 ===== */
function onKeydown(event) {
  if (event.key !== 'Escape') return

  if (helpVisible.value) {
    helpVisible.value = false
    return
  }
  if (profilePanelRef.value?.isEditing) {
    profilePanelRef.value.closeEditor()
    return
  }
  if (isDetailOpen.value) closeDetail()
}

function copyCommand() {
  const text = startCommand.value
  const done = () => toast.show('命令已复制，粘贴到终端执行')

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done, done)
    return
  }
  // 旧浏览器兜底
  const area = document.createElement('textarea')
  area.value = text
  document.body.appendChild(area)
  area.select()
  try {
    document.execCommand('copy')
  } catch {
    // 复制失败时用户仍可手动选中
  }
  document.body.removeChild(area)
  done()
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  if (!weatherStore.isCacheFresh) refreshWeather()
})
</script>

<template>
  <div class="app">
    <header class="app-header">
      <div class="brand">
        <h1 class="logo">Mini Feed</h1>
        <p class="tagline">记录此刻，分享此刻</p>
      </div>
      <TabBar v-model="activeTab" :tabs="TABS" />
    </header>

    <StorageWarning :storage-kind="storageKind" @help="helpVisible = true" />

    <main>
      <!-- ===== 详情页 ===== -->
      <section v-if="isDetailOpen" class="view">
        <PostDetail
          :post="detailPost"
          :author="author"
          @back="closeDetail"
          @remove="handleRemove"
        />
      </section>

      <template v-else>
        <!-- ===== 首页 ===== -->
        <section v-show="activeTab === 'home'" class="view">
          <TodayCard
            :place="weatherStore.place"
            :weather="weatherStore.weather"
            :detail-text="weatherStore.detailText"
            :loading="weatherStore.loading"
            @refresh="refreshWeather"
          />

          <PostComposer @submit="handlePublish" />

          <div class="section-title">
            <span>最新动态</span>
            <span data-testid="post-count" class="count-badge">{{ count }} 条</span>
          </div>

          <PostList
            data-testid="home-timeline"
            :posts="posts"
            :author="author"
            :highlight-id="lastPublishedId"
            @open="openDetail"
            @remove="handleRemove"
          />
        </section>

        <!-- ===== 个人中心 ===== -->
        <section v-show="activeTab === 'profile'" class="view">
          <ProfilePanel
            ref="profilePanel"
            :profile="profileStore.$state"
            :stats="stats"
            :avatars="profileStore.avatars"
            @save="handleSaveProfile"
          />

          <div class="section-title">
            <span>我的动态</span>
            <span data-testid="my-post-count" class="count-badge">{{ count }} 条</span>
          </div>

          <PostList
            data-testid="my-timeline"
            :posts="posts"
            :author="author"
            empty-test-id="my-empty"
            empty-title="你还没有发布过动态"
            empty-hint="回到首页写一条吧 ✍️"
            @open="openDetail"
            @remove="handleRemove"
          />

          <DataManager
            :meter="meterView"
            @export="handleExport"
            @import="handleImport"
            @clear="handleClear"
          />
        </section>
      </template>
    </main>

    <footer class="app-footer">
      <p>数据仅保存在本机浏览器（Local Storage）</p>
    </footer>

    <StorageHelp
      v-if="helpVisible"
      :storage-kind="storageKind"
      :is-file-protocol="isFileProtocol"
      :command="startCommand"
      @close="helpVisible = false"
      @copy="copyCommand"
    />

    <AppToast :message="toast.message.value" />
  </div>
</template>

<style scoped>
.brand {
  margin-bottom: 4px;
}
</style>
