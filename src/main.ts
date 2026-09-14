import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
// Self-hosted Inter (no Google Fonts request, keeps font-src 'self')
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import './style.css'
import { useAuthStore } from './stores/auth'
import { useBackupStore } from './stores/backup'

// Import views
import LandingView from './views/LandingView.vue'
import SetupView from './views/SetupView.vue'
import BackupView from './views/BackupView.vue'
import BackupPreviewView from './views/BackupPreviewView.vue'
import ImportView from './views/ImportView.vue'
import GuideView from './views/GuideView.vue'
import CallbackView from './views/CallbackView.vue'

// Router configuration
const routes = [
  {
    path: '/',
    name: 'landing',
    component: LandingView,
    meta: { title: 'Backspin - Spotify Backup Tool' }
  },
  {
    path: '/setup',
    name: 'setup',
    component: SetupView,
    meta: { title: 'Setup - Backspin' }
  },
  {
    path: '/backup',
    name: 'backup',
    component: BackupView,
    meta: { title: 'Backup erstellen - Backspin', requiresAuth: true }
  },
  {
    path: '/backup/preview',
    name: 'backup-preview',
    component: BackupPreviewView,
    meta: { title: 'Backup-Vorschau - Backspin', requiresAuth: true }
  },
  {
    path: '/import',
    name: 'import',
    component: ImportView,
    meta: { title: 'Backup importieren - Backspin', requiresAuth: true }
  },
  {
    path: '/guide',
    name: 'guide',
    component: GuideView,
    meta: { title: 'Anleitung - Backspin' }
  },
  {
    path: '/callback',
    name: 'callback',
    component: CallbackView,
    meta: { title: 'Anmeldung - Backspin' }
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(_to, _from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    } else {
      return { top: 0 }
    }
  }
})

// Create app
const app = createApp(App)
const pinia = createPinia()

// Pinia must be active before the guard resolves any store
app.use(pinia)

// vue-router 5 deprecates the next() callback: guards return their result instead.
router.beforeEach((to) => {
  // Update document title on route change
  if (to.meta.title) {
    document.title = to.meta.title as string
  }

  if (to.meta.requiresAuth) {
    // Creating the store hydrates the session from localStorage (loadFromStorage)
    const authStore = useAuthStore()

    // Without a client ID no login is possible at all → send the user to the setup.
    // With a client ID the views render their own login screen, so no further redirect.
    if (!authStore.isAuthenticated && !authStore.clientId) {
      return { name: 'setup' }
    }
  }

  // The preview page only makes sense with backup data in memory
  if (to.name === 'backup-preview') {
    const backupStore = useBackupStore()
    if (!backupStore.backupData) {
      return { name: 'backup' }
    }
  }

  return true
})

app.use(router)

app.mount('#app')
