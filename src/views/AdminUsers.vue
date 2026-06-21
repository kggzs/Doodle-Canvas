<template>
  <AdminShell>
      <section class="mb-4 grid gap-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 md:grid-cols-[1fr_150px_150px_150px_auto]">
        <n-input v-model:value="filters.keyword" placeholder="搜索用户名或邮箱" clearable @keydown.enter="loadUsers" />
        <n-select v-model:value="filters.status" :options="statusOptionsWithAll" placeholder="状态" clearable />
        <n-select v-model:value="filters.role" :options="roleOptionsWithAll" placeholder="角色" clearable />
        <n-select v-model:value="filters.risk_level" :options="riskOptionsWithAll" placeholder="风险" clearable />
        <n-button type="primary" :loading="loading" @click="loadUsers">查询</n-button>
      </section>

      <section class="overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)]">
        <n-data-table
          :columns="columns"
          :data="users"
          :loading="loading"
          :pagination="false"
          :row-key="row => row.id"
          size="small"
          striped
        />
        <div class="flex justify-end border-t border-[var(--border-color)] p-3">
          <n-pagination
            v-model:page="page"
            v-model:page-size="pageSize"
            :item-count="total"
            :page-sizes="[10, 20, 50, 100]"
            show-size-picker
            @update:page="loadUsers"
            @update:page-size="handlePageSizeChange"
          />
        </div>
      </section>

    <n-drawer v-model:show="detailVisible" width="520">
      <n-drawer-content title="用户详情" closable>
        <div v-if="selectedUser" class="space-y-4">
          <n-form :model="editForm" label-placement="top">
            <div class="grid grid-cols-2 gap-3">
              <n-form-item label="用户名">
                <n-input v-model:value="editForm.username" />
              </n-form-item>
              <n-form-item label="邮箱">
                <n-input v-model:value="editForm.email" />
              </n-form-item>
              <n-form-item label="角色">
                <n-select v-model:value="editForm.role" :options="roleOptions" />
              </n-form-item>
              <n-form-item label="状态">
                <n-select v-model:value="editForm.status" :options="statusOptions" />
              </n-form-item>
              <n-form-item label="风险等级">
                <n-select v-model:value="editForm.risk_level" :options="riskOptions" />
              </n-form-item>
              <n-form-item label="邮箱已验证">
                <n-switch v-model:value="editForm.email_verified" />
              </n-form-item>
            </div>
            <n-form-item label="风险标签">
              <n-dynamic-tags v-model:value="editForm.risk_tags" />
            </n-form-item>
            <n-form-item label="封禁原因">
              <n-input v-model:value="banForm.ban_reason" type="textarea" placeholder="封禁时填写" />
            </n-form-item>
          </n-form>

          <div class="flex flex-wrap gap-2">
            <n-button type="primary" :loading="saving" @click="saveUser">保存</n-button>
            <n-button v-if="selectedUser.status !== 'banned'" type="warning" :loading="saving" @click="banSelectedUser">封禁</n-button>
            <n-button v-else type="success" :loading="saving" @click="unbanSelectedUser">解封</n-button>
            <n-button type="error" ghost :loading="saving" @click="deleteSelectedUser">删除</n-button>
          </div>

          <div class="rounded-md border border-[var(--border-color)] p-3">
            <div class="mb-2 flex items-center justify-between">
              <h3 class="font-medium">用户组</h3>
              <span class="text-sm text-[var(--text-secondary)]">当前余额：{{ formatCoins(selectedBalance?.balance) }}</span>
            </div>
            <div class="mb-3 flex flex-wrap gap-2">
              <n-tag
                v-for="item in userGroups"
                :key="item.id"
                size="small"
                :type="selectedUser.userGroupId === item.groupId ? 'success' : 'default'"
                :color="groupTagColor(item.group)"
                closable
                @close="removeGroup(item.groupId)"
              >
                {{ item.group?.name || item.groupId }}
              </n-tag>
              <n-empty v-if="!userGroups.length" size="small" description="暂无用户组" />
            </div>
            <div class="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
              <n-select v-model:value="groupForm.group_id" :options="groupOptions" placeholder="选择用户组" filterable clearable />
              <n-input v-model:value="groupForm.grant_reason" placeholder="分配原因" clearable />
              <n-button :loading="saving" @click="assignGroup">替换</n-button>
            </div>
          </div>

          <div class="rounded-md border border-[var(--border-color)] p-3">
            <h3 class="mb-2 font-medium">修改密码</h3>
            <div class="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
              <n-input v-model:value="passwordForm.newPassword" type="password" show-password-on="click" placeholder="新密码" />
              <n-input v-model:value="passwordForm.confirmPassword" type="password" show-password-on="click" placeholder="再次输入新密码" />
              <n-button type="warning" :loading="passwordSaving" @click="forceChangePassword">强制修改</n-button>
            </div>
          </div>

          <div class="rounded-md border border-[var(--border-color)] p-3">
            <div class="mb-2 flex items-center justify-between">
              <h3 class="font-medium">画布流程</h3>
              <n-button size="small" :loading="projectsLoading" @click="loadUserProjects()">刷新</n-button>
            </div>
            <div class="space-y-2">
              <div
                v-for="project in userProjects"
                :key="project.id"
                class="rounded-md border border-[var(--border-color)] p-2 text-sm"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="truncate font-medium">{{ project.name }}</div>
                    <div class="mt-1 text-xs text-[var(--text-secondary)]">
                      节点 {{ flowNodeCount(project) }} · 连线 {{ flowEdgeCount(project) }} · {{ formatDateTime(project.updatedAt) }}
                    </div>
                  </div>
                  <n-button size="small" @click="openProjectFlow(project)">查看流程</n-button>
                </div>
              </div>
              <n-empty v-if="!userProjects.length && !projectsLoading" size="small" description="暂无画布流程" />
            </div>
          </div>

          <div class="rounded-md border border-[var(--border-color)] p-3">
            <h3 class="mb-2 font-medium">金币操作</h3>
            <div class="grid gap-2 md:grid-cols-[130px_130px_1fr]">
              <n-input-number v-model:value="coinForm.amount" :min="0" :step="1" placeholder="金额" />
              <n-select v-model:value="coinForm.mode" :options="coinModeOptions" />
              <n-input v-model:value="coinForm.reason" placeholder="操作原因" clearable />
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              <n-button type="primary" :loading="saving" @click="rechargeUser">充值</n-button>
              <n-button type="info" :loading="saving" @click="giftUser">赠送</n-button>
              <n-button type="warning" :loading="saving" @click="adjustCoins">调整余额</n-button>
            </div>
          </div>

          <div class="rounded-md border border-[var(--border-color)] p-3">
            <div class="mb-2 flex items-center justify-between">
              <h3 class="font-medium">金币流水</h3>
              <n-button size="small" :loading="coinTransactionsLoading" @click="loadUserCoinTransactions()">刷新</n-button>
            </div>
            <n-data-table
              :columns="coinColumns"
              :data="coinTransactions"
              :loading="coinTransactionsLoading"
              :pagination="false"
              size="small"
              striped
            />
            <div class="mt-2 flex justify-end">
              <n-pagination
                v-model:page="coinPage"
                v-model:page-size="coinPageSize"
                :item-count="coinTotal"
                :page-sizes="[5, 10, 20, 50]"
                size="small"
                show-size-picker
                @update:page="loadUserCoinTransactions"
                @update:page-size="handleCoinPageSizeChange"
              />
            </div>
          </div>

          <div>
            <h3 class="mb-2 font-medium">最近登录</h3>
            <div class="space-y-2">
              <div
                v-for="log in loginLogs"
                :key="log.id"
                class="rounded-md border border-[var(--border-color)] p-2 text-sm"
              >
                <div class="flex justify-between">
                  <span>{{ log.status }}</span>
                  <span class="text-[var(--text-secondary)]">{{ formatDateTime(log.createdAt) }}</span>
                </div>
                <div class="text-[var(--text-secondary)]">{{ log.ip }} · {{ log.uaBrowser || '-' }} / {{ log.uaOs || '-' }}</div>
              </div>
              <n-empty v-if="!loginLogs.length" size="small" description="暂无登录记录" />
            </div>
          </div>
        </div>
      </n-drawer-content>
    </n-drawer>

    <n-drawer v-model:show="projectFlowVisible" width="720">
      <n-drawer-content :title="selectedProject?.name || '画布流程'" closable>
        <div v-if="selectedProject" class="space-y-4">
          <div class="grid gap-3 text-sm sm:grid-cols-3">
            <div class="rounded-md bg-[var(--bg-tertiary)] p-3">
              <div class="text-xs text-[var(--text-secondary)]">节点</div>
              <div class="mt-1 text-lg font-semibold">{{ selectedFlowNodes.length }}</div>
            </div>
            <div class="rounded-md bg-[var(--bg-tertiary)] p-3">
              <div class="text-xs text-[var(--text-secondary)]">连线</div>
              <div class="mt-1 text-lg font-semibold">{{ selectedFlowEdges.length }}</div>
            </div>
            <div class="rounded-md bg-[var(--bg-tertiary)] p-3">
              <div class="text-xs text-[var(--text-secondary)]">更新时间</div>
              <div class="mt-1 text-sm font-medium">{{ formatDateTime(selectedProject.updatedAt) }}</div>
            </div>
          </div>

          <section>
            <h3 class="mb-2 font-medium">节点配置</h3>
            <div class="space-y-2">
              <div
                v-for="node in selectedFlowNodes"
                :key="node.id"
                class="rounded-md border border-[var(--border-color)] p-3 text-sm"
              >
                <div class="flex flex-wrap items-center gap-2">
                  <n-tag size="small">{{ node.type || 'node' }}</n-tag>
                  <span class="font-medium">{{ nodeTitle(node) }}</span>
                  <span class="text-xs text-[var(--text-secondary)]">{{ node.id }}</span>
                </div>
                <div class="mt-2 whitespace-pre-wrap text-[var(--text-secondary)]">{{ nodeSummary(node) }}</div>
              </div>
              <n-empty v-if="!selectedFlowNodes.length" size="small" description="暂无节点" />
            </div>
          </section>

          <section>
            <h3 class="mb-2 font-medium">连接关系</h3>
            <div class="space-y-2">
              <div
                v-for="edge in selectedFlowEdges"
                :key="edge.id"
                class="rounded-md border border-[var(--border-color)] p-2 text-sm"
              >
                {{ edgeTitle(edge.source) }} → {{ edgeTitle(edge.target) }}
              </div>
              <n-empty v-if="!selectedFlowEdges.length" size="small" description="暂无连线" />
            </div>
          </section>
        </div>
      </n-drawer-content>
    </n-drawer>
  </AdminShell>
</template>

<script setup>
import { computed, h, onMounted, reactive, ref } from 'vue'
import {
  NButton,
  NDataTable,
  NDrawer,
  NDrawerContent,
  NDynamicTags,
  NEmpty,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NPagination,
  NPopconfirm,
  NSelect,
  NSwitch,
  NTag
} from 'naive-ui'
import AdminShell from '@/components/AdminShell.vue'
import { adminUserApi, adminUserGroupApi } from '@/api/backend'

const loading = ref(false)
const saving = ref(false)
const passwordSaving = ref(false)
const users = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const detailVisible = ref(false)
const selectedUser = ref(null)
const selectedBalance = ref(null)
const userGroups = ref([])
const userProjects = ref([])
const groupOptions = ref([])
const loginLogs = ref([])
const projectsLoading = ref(false)
const coinTransactionsLoading = ref(false)
const projectFlowVisible = ref(false)
const selectedProject = ref(null)
const coinTransactions = ref([])
const coinTotal = ref(0)
const coinPage = ref(1)
const coinPageSize = ref(5)

const filters = reactive({
  keyword: '',
  status: null,
  role: null,
  risk_level: null
})

const editForm = reactive({
  username: '',
  email: '',
  role: 'user',
  status: 'active',
  risk_level: 'low',
  risk_tags: [],
  email_verified: false
})

const banForm = reactive({
  ban_reason: ''
})

const groupForm = reactive({
  group_id: null,
  grant_reason: ''
})

const coinForm = reactive({
  amount: 0,
  mode: 'increase',
  reason: ''
})

const passwordForm = reactive({
  newPassword: '',
  confirmPassword: ''
})

const statusOptions = [
  { label: '正常', value: 'active' },
  { label: '待验证', value: 'pending_email' },
  { label: '禁用', value: 'disabled' },
  { label: '封禁', value: 'banned' }
]
const roleOptions = [
  { label: '普通用户', value: 'user' },
  { label: '管理员', value: 'admin' }
]
const riskOptions = [
  { label: '低', value: 'low' },
  { label: '中', value: 'medium' },
  { label: '高', value: 'high' }
]
const statusOptionsWithAll = [{ label: '全部状态', value: null }, ...statusOptions]
const roleOptionsWithAll = [{ label: '全部角色', value: null }, ...roleOptions]
const riskOptionsWithAll = [{ label: '全部风险', value: null }, ...riskOptions]
const coinModeOptions = [
  { label: '增加', value: 'increase' },
  { label: '扣减', value: 'decrease' }
]
const txTypeOptions = [
  { label: '充值', value: 'recharge' },
  { label: '充值赠送', value: 'recharge_bonus' },
  { label: '卡密兑换', value: 'redeem' },
  { label: '赠送', value: 'gift' },
  { label: '注册赠送', value: 'register_gift' },
  { label: '消费', value: 'consume' },
  { label: '退款', value: 'refund' },
  { label: '管理员增加', value: 'adjust_add' },
  { label: '管理员扣减', value: 'adjust_deduct' },
  { label: '冻结', value: 'freeze' },
  { label: '解冻', value: 'unfreeze' },
  { label: '没收', value: 'forfeit' },
  { label: '过期', value: 'expire' },
  { label: '转入', value: 'transfer_in' },
  { label: '转出', value: 'transfer_out' },
  { label: '冲正', value: 'rollback' }
]
const directionOptions = [
  { label: '入账', value: 'in' },
  { label: '出账', value: 'out' }
]

function optionLabel(options, value) {
  return options.find(item => item.value === value)?.label || value || '-'
}

function formatDateTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN')
}

function formatCoins(value) {
  return Number(value || 0).toFixed(2)
}

function textColorForBadge(color) {
  const hex = String(color || '').replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return '#ffffff'
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111827' : '#ffffff'
}

function groupTagColor(group = {}) {
  if (!group?.badgeColor) return undefined
  return {
    color: group.badgeColor,
    borderColor: group.badgeColor,
    textColor: textColorForBadge(group.badgeColor)
  }
}

function canvasOf(project = {}) {
  return project.canvasData || project.canvas_data || {}
}

function flowNodes(project = {}) {
  const canvas = canvasOf(project)
  return Array.isArray(canvas.nodes) ? canvas.nodes : []
}

function flowEdges(project = {}) {
  const canvas = canvasOf(project)
  return Array.isArray(canvas.edges) ? canvas.edges : []
}

function flowNodeCount(project) {
  return flowNodes(project).length
}

function flowEdgeCount(project) {
  return flowEdges(project).length
}

const selectedFlowNodes = computed(() => flowNodes(selectedProject.value || {}))
const selectedFlowEdges = computed(() => flowEdges(selectedProject.value || {}))

function nodeTitle(node = {}) {
  return node.data?.label || node.data?.publicProps?.name || node.data?.name || node.type || node.id
}

function nodeSummary(node = {}) {
  const data = node.data || {}
  const parts = [
    data.content,
    data.prompt,
    data.model ? `模型：${data.model}` : '',
    data.size ? `尺寸：${data.size}` : '',
    data.url ? `结果：${data.url}` : ''
  ].filter(Boolean)
  return parts.join('\n') || '-'
}

function edgeTitle(nodeId) {
  const node = selectedFlowNodes.value.find(item => item.id === nodeId)
  return node ? nodeTitle(node) : nodeId || '-'
}

function openProjectFlow(project) {
  selectedProject.value = project
  projectFlowVisible.value = true
}

function renderTag(value, options, type = 'default') {
  return h(NTag, { size: 'small', type }, { default: () => optionLabel(options, value) })
}

const columns = [
  { title: '用户名', key: 'username', minWidth: 130 },
  { title: '邮箱', key: 'email', minWidth: 220 },
  {
    title: '角色',
    key: 'role',
    width: 100,
    render(row) {
      return renderTag(row.role, roleOptions, row.role === 'admin' ? 'warning' : 'default')
    }
  },
  {
    title: '状态',
    key: 'status',
    width: 110,
    render(row) {
      const type = row.status === 'active' ? 'success' : row.status === 'banned' ? 'error' : 'warning'
      return renderTag(row.status, statusOptions, type)
    }
  },
  {
    title: '风险',
    key: 'riskLevel',
    width: 90,
    render(row) {
      const type = row.riskLevel === 'high' ? 'error' : row.riskLevel === 'medium' ? 'warning' : 'success'
      return renderTag(row.riskLevel, riskOptions, type)
    }
  },
  { title: '注册 IP', key: 'registerIp', width: 140 },
  {
    title: '创建时间',
    key: 'createdAt',
    width: 180,
    render(row) {
      return formatDateTime(row.createdAt)
    }
  },
  {
    title: '操作',
    key: 'actions',
    width: 170,
    fixed: 'right',
    render(row) {
      return h('div', { class: 'flex gap-2' }, [
        h(NButton, { size: 'small', onClick: () => openDetail(row) }, { default: () => '详情' }),
        h(NPopconfirm, { onPositiveClick: () => quickToggleStatus(row) }, {
          trigger: () => h(NButton, { size: 'small', type: row.status === 'active' ? 'warning' : 'success' }, { default: () => row.status === 'active' ? '禁用' : '启用' }),
          default: () => row.status === 'active' ? '确定禁用该用户？' : '确定启用该用户？'
        })
      ])
    }
  }
]

const coinColumns = [
  {
    title: '时间',
    key: 'createdAt',
    width: 150,
    render(row) {
      return formatDateTime(row.createdAt)
    }
  },
  {
    title: '类型',
    key: 'type',
    width: 100,
    render(row) {
      return renderTag(row.type, txTypeOptions)
    }
  },
  {
    title: '方向',
    key: 'direction',
    width: 80,
    render(row) {
      return renderTag(row.direction, directionOptions, row.direction === 'in' ? 'success' : 'warning')
    }
  },
  {
    title: '金额',
    key: 'amount',
    width: 90,
    render(row) {
      return `${row.direction === 'in' ? '+' : '-'}${formatCoins(row.amount)}`
    }
  },
  {
    title: '说明',
    key: 'description',
    minWidth: 160,
    ellipsis: { tooltip: true },
    render(row) {
      return row.description || row.reason || '-'
    }
  }
]

async function loadUsers() {
  loading.value = true
  try {
    const data = await adminUserApi.list({
      page: page.value,
      pageSize: pageSize.value,
      keyword: filters.keyword || undefined,
      status: filters.status || undefined,
      role: filters.role || undefined,
      risk_level: filters.risk_level || undefined
    })
    users.value = data.items || []
    total.value = data.total || 0
  } catch (err) {
    window.$message?.error(err?.message || '加载用户失败')
  } finally {
    loading.value = false
  }
}

async function loadGroupOptions() {
  try {
    const data = await adminUserGroupApi.options()
    groupOptions.value = (data || []).map(item => ({
      label: `${item.name} (${item.code})`,
      value: item.id
    }))
  } catch (err) {
    window.$message?.error(err?.message || '加载用户组选项失败')
  }
}

function handlePageSizeChange() {
  page.value = 1
  loadUsers()
}

async function openDetail(row) {
  try {
    const data = await adminUserApi.detail(row.id)
    selectedUser.value = data.user
    selectedBalance.value = data.balance || null
    userGroups.value = data.groups || []
    loginLogs.value = data.recentLoginLogs || []
    Object.assign(editForm, {
      username: data.user.username,
      email: data.user.email,
      role: data.user.role,
      status: data.user.status,
      risk_level: data.user.riskLevel,
      risk_tags: data.user.riskTags || [],
      email_verified: !!data.user.emailVerifiedAt
    })
    banForm.ban_reason = data.user.banReason || ''
    Object.assign(groupForm, { group_id: null, grant_reason: '' })
    Object.assign(coinForm, { amount: 0, mode: 'increase', reason: '' })
    Object.assign(passwordForm, { newPassword: '', confirmPassword: '' })
    userProjects.value = []
    coinTransactions.value = []
    coinTotal.value = 0
    coinPage.value = 1
    selectedProject.value = null
    detailVisible.value = true
    await Promise.all([
      loadUserProjects(data.user.id),
      loadUserCoinTransactions(data.user.id)
    ])
  } catch (err) {
    window.$message?.error(err?.message || '加载用户详情失败')
  }
}

async function loadUserCoinTransactions(userId = selectedUser.value?.id) {
  if (!userId) return
  coinTransactionsLoading.value = true
  try {
    const data = await adminUserApi.coins(userId, {
      page: coinPage.value,
      pageSize: coinPageSize.value
    })
    coinTransactions.value = data.items || []
    coinTotal.value = data.total || 0
  } catch (err) {
    window.$message?.error(err?.message || '加载金币流水失败')
  } finally {
    coinTransactionsLoading.value = false
  }
}

function handleCoinPageSizeChange() {
  coinPage.value = 1
  loadUserCoinTransactions()
}

async function loadUserProjects(userId = selectedUser.value?.id) {
  if (!userId) return
  projectsLoading.value = true
  try {
    const data = await adminUserApi.projects(userId, { pageSize: 100 })
    userProjects.value = data.items || []
  } catch (err) {
    window.$message?.error(err?.message || '加载画布流程失败')
  } finally {
    projectsLoading.value = false
  }
}

async function refreshSelectedUser() {
  if (!selectedUser.value) return
  await loadUsers()
  await openDetail({ id: selectedUser.value.id })
}

async function saveUser() {
  if (!selectedUser.value) return
  saving.value = true
  try {
    await adminUserApi.update(selectedUser.value.id, { ...editForm })
    window.$message?.success('已保存')
    await refreshSelectedUser()
  } catch (err) {
    window.$message?.error(err?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function quickToggleStatus(row) {
  try {
    await adminUserApi.setStatus(row.id, row.status === 'active' ? 'disabled' : 'active')
    window.$message?.success('状态已更新')
    loadUsers()
  } catch (err) {
    window.$message?.error(err?.message || '操作失败')
  }
}

async function banSelectedUser() {
  if (!selectedUser.value) return
  saving.value = true
  try {
    await adminUserApi.ban(selectedUser.value.id, { ban_reason: banForm.ban_reason || '管理员封禁' })
    window.$message?.success('用户已封禁')
    await refreshSelectedUser()
  } catch (err) {
    window.$message?.error(err?.message || '封禁失败')
  } finally {
    saving.value = false
  }
}

async function unbanSelectedUser() {
  if (!selectedUser.value) return
  saving.value = true
  try {
    await adminUserApi.unban(selectedUser.value.id)
    window.$message?.success('用户已解封')
    await refreshSelectedUser()
  } catch (err) {
    window.$message?.error(err?.message || '解封失败')
  } finally {
    saving.value = false
  }
}

async function deleteSelectedUser() {
  if (!selectedUser.value) return
  saving.value = true
  try {
    await adminUserApi.remove(selectedUser.value.id)
    window.$message?.success('用户已删除')
    detailVisible.value = false
    await loadUsers()
  } catch (err) {
    window.$message?.error(err?.message || '删除失败')
  } finally {
    saving.value = false
  }
}

async function assignGroup() {
  if (!selectedUser.value || !groupForm.group_id) return
  saving.value = true
  try {
    await adminUserApi.addGroup(selectedUser.value.id, {
      group_id: groupForm.group_id,
      grant_reason: groupForm.grant_reason || undefined
    })
    window.$message?.success('用户组已替换')
    await refreshSelectedUser()
  } catch (err) {
    window.$message?.error(err?.message || '分配失败')
  } finally {
    saving.value = false
  }
}

async function forceChangePassword() {
  if (!selectedUser.value) return
  if (!passwordForm.newPassword || passwordForm.newPassword.length < 8 || !/[a-zA-Z]/.test(passwordForm.newPassword) || !/[0-9]/.test(passwordForm.newPassword)) {
    window.$message?.warning('新密码至少 8 位，且需同时包含字母和数字')
    return
  }
  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    window.$message?.warning('两次输入的新密码不一致')
    return
  }
  passwordSaving.value = true
  try {
    await adminUserApi.changePassword(selectedUser.value.id, {
      newPassword: passwordForm.newPassword
    })
    Object.assign(passwordForm, { newPassword: '', confirmPassword: '' })
    window.$message?.success('密码已修改，用户需重新登录')
  } catch (err) {
    window.$message?.error(err?.message || '修改密码失败')
  } finally {
    passwordSaving.value = false
  }
}

async function removeGroup(groupId) {
  if (!selectedUser.value || !groupId) return
  saving.value = true
  try {
    await adminUserApi.removeGroup(selectedUser.value.id, groupId)
    window.$message?.success('用户组已移除')
    await refreshSelectedUser()
  } catch (err) {
    window.$message?.error(err?.message || '移除失败')
  } finally {
    saving.value = false
  }
}

async function rechargeUser() {
  if (!selectedUser.value) return
  saving.value = true
  try {
    await adminUserApi.recharge(selectedUser.value.id, {
      amount: coinForm.amount,
      reason: coinForm.reason || undefined
    })
    window.$message?.success('充值成功')
    await loadUserCoinTransactions()
    await refreshSelectedUser()
  } catch (err) {
    window.$message?.error(err?.message || '充值失败')
  } finally {
    saving.value = false
  }
}

async function giftUser() {
  if (!selectedUser.value) return
  saving.value = true
  try {
    await adminUserApi.gift(selectedUser.value.id, {
      amount: coinForm.amount,
      reason: coinForm.reason || undefined
    })
    window.$message?.success('赠送成功')
    await loadUserCoinTransactions()
    await refreshSelectedUser()
  } catch (err) {
    window.$message?.error(err?.message || '赠送失败')
  } finally {
    saving.value = false
  }
}

async function adjustCoins() {
  if (!selectedUser.value) return
  saving.value = true
  try {
    await adminUserApi.adjustCoins(selectedUser.value.id, {
      amount: coinForm.amount,
      mode: coinForm.mode,
      reason: coinForm.reason || undefined
    })
    window.$message?.success('余额已调整')
    await loadUserCoinTransactions()
    await refreshSelectedUser()
  } catch (err) {
    window.$message?.error(err?.message || '调整失败')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadUsers()
  loadGroupOptions()
})
</script>
