/**
 * Router configuration | 路由配置
 */
import { createRouter, createWebHistory } from 'vue-router'
import { currentUser, isAdmin, isLoggedIn } from '@/stores/auth'

const routes = [
  {
    path: '/',
    name: 'Landing',
    component: () => import('../views/Landing.vue')
  },
  {
    path: '/projects',
    name: 'Projects',
    component: () => import('../views/Home.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/canvas/:id?',
    name: 'Canvas',
    component: () => import('../views/Canvas.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { guestOnly: true }
  },
  {
    path: '/admin/login',
    name: 'AdminLogin',
    component: () => import('../views/AdminLogin.vue'),
    meta: { guestOnly: true, authSurface: 'admin' }
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('../views/Register.vue'),
    meta: { guestOnly: true }
  },
  {
    path: '/account',
    name: 'Account',
    component: () => import('../views/Account.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/admin',
    redirect: '/admin/dashboard',
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/admin/dashboard',
    name: 'AdminDashboard',
    component: () => import('../views/AdminDashboard.vue'),
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/admin/users',
    name: 'AdminUsers',
    component: () => import('../views/AdminUsers.vue'),
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/admin/user-groups',
    name: 'AdminUserGroups',
    component: () => import('../views/AdminUserGroups.vue'),
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/admin/coins',
    name: 'AdminCoins',
    component: () => import('../views/AdminCoins.vue'),
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/admin/records',
    name: 'AdminRecords',
    component: () => import('../views/AdminRecords.vue'),
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/admin/billing',
    redirect: '/admin/models/chat',
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/admin/files',
    name: 'AdminFiles',
    component: () => import('../views/AdminFiles.vue'),
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/admin/error-logs',
    name: 'AdminErrorLogs',
    component: () => import('../views/AdminErrorLogs.vue'),
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/admin/models/chat',
    name: 'AdminChatModels',
    component: () => import('../views/AdminModelTypePage.vue'),
    props: { modelType: 'chat' },
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/admin/models/image',
    name: 'AdminImageModels',
    component: () => import('../views/AdminModelTypePage.vue'),
    props: { modelType: 'image' },
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/admin/models/video',
    name: 'AdminVideoModels',
    component: () => import('../views/AdminModelTypePage.vue'),
    props: { modelType: 'video' },
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/admin/channels',
    redirect: '/admin/models/chat',
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/admin/models',
    redirect: '/admin/models/chat',
    meta: { requiresAuth: true, requiresAdmin: true }
  }
]

const router = createRouter({
  history: createWebHistory('/'),
  routes
})

router.beforeEach((to) => {
  if (to.meta.requiresAdmin && !isAdmin.value) {
    window.$message?.warning(currentUser.value ? '需要管理员权限' : '请先登录')
    return currentUser.value ? '/projects' : { path: '/admin/login', query: { redirect: to.fullPath } }
  }

  if (to.meta.requiresAuth && !isLoggedIn.value) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  if (to.meta.guestOnly && isLoggedIn.value) {
    if (to.meta.authSurface === 'admin') {
      return isAdmin.value ? '/admin/dashboard' : '/projects'
    }
    return '/projects'
  }

  return true
})

export default router
