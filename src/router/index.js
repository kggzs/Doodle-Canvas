/**
 * Router configuration | 路由配置
 */
import { createRouter, createWebHistory } from 'vue-router'
import { currentUser, isAdmin, isLoggedIn } from '@/stores/auth'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: () => import('../views/Home.vue')
  },
  {
    path: '/canvas/:id?',
    name: 'Canvas',
    component: () => import('../views/Canvas.vue')
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { guestOnly: true }
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('../views/Register.vue'),
    meta: { guestOnly: true }
  },
  {
    path: '/admin',
    redirect: '/admin/users',
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
    path: '/admin/channels',
    name: 'AdminChannels',
    component: () => import('../views/AdminChannels.vue'),
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/admin/models',
    name: 'AdminModels',
    component: () => import('../views/AdminModels.vue'),
    meta: { requiresAuth: true, requiresAdmin: true }
  }
]

const router = createRouter({
  history: createWebHistory('/huobao-canvas'),
  routes
})

router.beforeEach((to) => {
  if (to.meta.requiresAuth && !isLoggedIn.value) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  if (to.meta.requiresAdmin && !isAdmin.value) {
    window.$message?.warning(currentUser.value ? '需要管理员权限' : '请先登录')
    return currentUser.value ? '/' : { path: '/login', query: { redirect: to.fullPath } }
  }

  if (to.meta.guestOnly && isLoggedIn.value) {
    return isAdmin.value ? '/admin/users' : '/'
  }

  return true
})

export default router
