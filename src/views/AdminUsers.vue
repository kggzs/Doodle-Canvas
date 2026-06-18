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
              <n-button :loading="saving" @click="assignGroup">分配</n-button>
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
  </AdminShell>
</template>

<script setup>
import { h, onMounted, reactive, ref } from 'vue'
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
const users = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const detailVisible = ref(false)
const selectedUser = ref(null)
const selectedBalance = ref(null)
const userGroups = ref([])
const groupOptions = ref([])
const loginLogs = ref([])

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
    detailVisible.value = true
  } catch (err) {
    window.$message?.error(err?.message || '加载用户详情失败')
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
    window.$message?.success('用户组已分配')
    await refreshSelectedUser()
  } catch (err) {
    window.$message?.error(err?.message || '分配失败')
  } finally {
    saving.value = false
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
