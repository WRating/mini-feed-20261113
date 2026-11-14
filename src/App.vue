<script setup>
/**
 * 应用根组件：负责视图编排与跨领域动作的协调。
 *
 * 后端化（Hono RESTful API）带来的核心变化，以及这里必须守住的约定：
 *
 * 1. **写操作现在会失败**。以前 LocalStorage 写入几乎不可能失败，现在网络断了、
 *    后端没启动都会失败。因此「发布成功后清空输入框」不能由 PostComposer 自己做 ——
 *    那样一旦失败，用户刚写的字就没了。改为：PostComposer 只 emit，
 *    由本组件在**确认成功之后**调 `clear()`。
 *
 * 2. **首屏必须先加载再渲染**。以前数据同步存在本地，现在要等 HTTP 回来。
 *    用 `loaded` 区分「还没加载」与「加载完但为空」，否则会闪一下「还没有动态」，
 *    用户会以为数据丢了。
 *
 * 3. **连不上服务要能自救**。展示告警条 + 重试按钮 + 启动指引，
 *    而不是白屏或一直转圈。
 *
 * 分层仍然成立：数据状态在 store，展示状态（当前视图、高亮、面板开关）在本地 ref，
 * 子组件只上报意图。
 */
import { computed, onMounted, ref, useTemplateRef } from 'vue'
import { storeToRefs } from 'pinia'
import { usePostsStore } from '@/stores/posts'
import { useProfileStore } from '@/stores/profile'
import { useDataBackup } from '@/composables/useDataBackup'
import { useServerStats } from '@/composables/useServerStats'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'

import TabBar from '@/components/TabBar.vue'
import MoodCard from '@/components/MoodCard.vue'
import PostComposer from '@/components/PostComposer.vue'
import PostList from '@/components/PostList.vue'
import PostDetail from '@/components/PostDetail.vue'
import ProfilePanel from '@/components/ProfilePanel.vue'
import DataManager from '@/components/DataManager.vue'
import ConnectionWarning from '@/components/ConnectionWarning.vue'
import ConnectionHelp from '@/components/ConnectionHelp.vue'
import AppToast from '@/components/AppToast.vue'

const postsStore = usePostsStore()
const profileStore = useProfileStore()

const { posts, count, lastPublishedId, totalChars, loading, loadError, loaded } =
  storeToRefs(postsStore)

const backup = useDataBackup()
const serverStats = useServerStats()
const toast = useToast()
const confirm = useConfirm()

/* ===== 视图与面板状态 ===== */
const TABS = [
  { key: 'home', label: '首页' },
  { key: 'profile', label: '个人中心' }
]

const activeTab = ref('home')
const detailId = ref(null)
const helpVisible = ref(false)
/** 发布请求进行中：用于禁用按钮与展示「发布中…」 */
const publishing = ref(false)
/** 心情保存中：用于禁用心情选项，避免重复请求 */
const savingMood = ref(false)
const profilePanelRef = useTemplateRef('profilePanel')
const composerRef = useTemplateRef('composer')

const isDetailOpen = computed(() => detailId.value !== null)
const detailPost = computed(() => (detailId.value ? postsStore.getById(detailId.value) : null))
const author = computed(() => ({ name: profileStore.name, avatar: profileStore.avatar }))
const stats = computed(() => ({
  posts: count.value,
  chars: totalChars.value,
  days: profileStore.daysUsed
}))

/**
 * 交给 DataManager 的必须是**已解包**的普通值。
 * 直接把含 ref 的对象当 prop 传下去，模板里 `stats.formatted` 拿到的是 Ref 对象，
 * 对象字面量不会自动解包 —— 上一版已经因此让进度条渲染成满格。
 */
const serverStatsView = computed(() => serverStats.view.value)

/* ===== 连接状态 ===== */
/** 首次加载失败才展示告警条；已有数据时的偶发失败用 toast 提示即可 */
const showConnectionWarning = computed(() => !loaded.value && Boolean(loadError.value))
const connectionMessage = computed(() => loadError.value || '')

/** 启动命令：给用户可直接复制执行的自救方式 */
const START_COMMAND = 'npm run dev'

/* ===== 数据加载 ===== */
async function loadAll() {
  await Promise.allSettled([
    postsStore.load(),
    profileStore.load(),
    serverStats.refresh()
  ])
}

/** 重试：先清掉错误，再重新拉取 */
async function retryLoad() {
  postsStore.clearError?.()
  await loadAll()
  if (!loadError.value) toast.show('已重新连接服务端')
}

/* ===== 动态操作 ===== */
async function handlePublish(text) {
  if (publishing.value) return

  publishing.value = true
  try {
    const result = await postsStore.publish(text)

    if (!result.ok) {
      // 失败时**不清空**输入框：用户的文字还在，可以直接再试
      toast.show(result.error)
      return
    }

    // 只有确认服务端已保存，才清空草稿
    composerRef.value?.clear()
    serverStats.refresh()
  } finally {
    publishing.value = false
  }
}

function openDetail(id) {
  detailId.value = id
}

function closeDetail() {
  detailId.value = null
}

/**
 * 点赞 / 收藏的统一入口。
 *
 * 乐观更新、回滚与并发保护全在 store 里（数据状态的归数据），
 * 这里只做两件事：把失败翻译成用户能看懂的提示，成功后刷新统计。
 *
 * 不 await 后再改 UI —— 状态的即时反馈由 store 的乐观更新负责，
 * 这里若也改一遍就会有两处真相。
 */
async function handleReaction(id, kind) {
  const result = await postsStore.toggleReaction(id, kind)
  if (!result.ok) {
    // 被并发保护挡下（用户点快了）不是错误，静默忽略即可。
    // 判断依据用 store 给出的 ignored 标记，而不是事后看 isReacting ——
    // 那只能反映「现在」的状态，请求可能已经结束，会把并发挡下误报成失败。
    if (result.ignored) return
    toast.show(result.error || '操作失败')
    return
  }
  serverStats.refresh()
}

/** 判断某条动态的互动请求是否在飞（传给列表以禁用按钮） */
function isReacting(id) {
  return postsStore.isReacting(id)
}

async function handleRemove(id) {  // 环境无法弹窗时按「取消」处理，避免误删
  if (!confirm.ask('确定删除这条动态吗？删除后无法恢复。')) return

  const removed = await postsStore.remove(id)
  if (!removed) {
    // 服务端文案（如「服务端错误」）只说发生了什么，没说清是哪个操作失败，
    // 这里补上前缀。loadError 为空时给一句完整的兜底。
    toast.show(loadError.value ? `删除失败：${loadError.value}` : '删除失败，请重试')
    return
  }

  if (detailId.value === id) detailId.value = null
  serverStats.refresh()
  toast.show('已删除')
}

/* ===== 资料操作 ===== */
async function handleSaveProfile(patch) {
  const result = await profileStore.update(patch)
  toast.show(result.ok ? '资料已保存' : result.error || '资料保存失败')
}

/* ===== 心情 ===== */
/**
 * 切换心情。与点赞同为轻量高频操作，store 内部已做乐观更新与失败回滚，
 * 这里只负责禁用按钮与把失败原因提示给用户。
 */
async function handleSelectMood(key) {
  if (savingMood.value) return

  savingMood.value = true
  try {
    const result = await profileStore.setMood(key)
    if (!result.ok) toast.show(result.error)
  } finally {
    savingMood.value = false
  }
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

  reader.onload = async () => {
    const result = await backup.importBackup(String(reader.result || ''))
    if (!result.ok) {
      toast.show(`导入失败：${result.error}`)
      return
    }

    const parts = [`已导入 ${result.added} 条动态`]
    if (result.skipped > 0) parts.push(`跳过 ${result.skipped} 条`)
    if (result.profileRestored) parts.push('资料已恢复')
    toast.show(parts.join('，'))
    serverStats.refresh()
  }

  reader.onerror = () => toast.show('读取文件失败')
  reader.readAsText(file)
}

async function handleClear() {
  await backup.clearAll()
  detailId.value = null
  serverStats.refresh()
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
  const text = START_COMMAND
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

  // 首屏并行拉取动态 / 资料 / 统计
  loadAll()

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

    <ConnectionWarning
      v-if="showConnectionWarning"
      :message="connectionMessage"
      @retry="retryLoad"
      @help="helpVisible = true"
    />

    <main>
      <!-- ===== 详情页 ===== -->
      <section v-if="isDetailOpen" class="view">
        <PostDetail
          :post="detailPost"
          :author="author"
          :reacting="detailPost ? isReacting(detailPost.id) : false"
          @back="closeDetail"
          @remove="handleRemove"
          @like="(id) => handleReaction(id, 'like')"
          @favorite="(id) => handleReaction(id, 'favorite')"
        />
      </section>

      <template v-else>
        <!-- ===== 首页 ===== -->
        <section v-show="activeTab === 'home'" class="view">
          <MoodCard
            :mood="profileStore.mood"
            :moods="profileStore.moods"
            :pending="savingMood"
            @select="handleSelectMood"
          />

          <PostComposer
            ref="composer"
            :pending="publishing"
            @submit="handlePublish"
          />

          <div class="section-title">
            <span>最新动态</span>
            <span data-testid="post-count" class="count-badge">{{ count }} 条</span>
          </div>

          <!-- 首次加载中：给明确反馈，避免误以为「没有动态」 -->
          <p v-if="loading && !loaded" data-testid="loading-state" class="loading-state">
            正在加载动态…
          </p>

          <PostList
            v-else
            data-testid="home-timeline"
            :posts="posts"
            :author="author"
            :highlight-id="lastPublishedId"
            :is-reacting="isReacting"
            @open="openDetail"
            @remove="handleRemove"
            @like="(id) => handleReaction(id, 'like')"
            @favorite="(id) => handleReaction(id, 'favorite')"
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
            :is-reacting="isReacting"
            empty-test-id="my-empty"
            empty-title="你还没有发布过动态"
            empty-hint="回到首页写一条吧 ✍️"
            @open="openDetail"
            @remove="handleRemove"
            @like="(id) => handleReaction(id, 'like')"
            @favorite="(id) => handleReaction(id, 'favorite')"
          />

          <DataManager
            :stats="serverStatsView"
            @export="handleExport"
            @import="handleImport"
            @clear="handleClear"
          />
        </section>
      </template>
    </main>

    <footer class="app-footer">
      <p>数据保存在服务端内存中（重启即清空）</p>
    </footer>

    <ConnectionHelp
      v-if="helpVisible"
      :command="START_COMMAND"
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

.loading-state {
  text-align: center;
  padding: 32px 16px;
  font-size: 0.85rem;
  color: var(--text-secondary);
  background: var(--card-bg);
  border: 1px dashed var(--border);
  border-radius: var(--radius);
}
</style>
