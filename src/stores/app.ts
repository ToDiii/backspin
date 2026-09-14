import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AppState, Toast } from '@/types'

export const useAppStore = defineStore('app', () => {
  // State
  const state = ref<AppState>({
    error: null
  })

  const toasts = ref<Toast[]>([])

  // Unique toast ids: Date.now() alone collides within the same millisecond
  let toastCounter = 0

  // Getters
  const error = computed(() => state.value.error)

  // Actions
  const setError = (error: string | null) => {
    state.value.error = error
  }

  // Toast management
  const addToast = (toast: Omit<Toast, 'id'>) => {
    toastCounter += 1
    const id = `${Date.now()}-${toastCounter}`
    const newToast: Toast = {
      id,
      duration: 5000,
      ...toast
    }

    toasts.value.push(newToast)

    // Auto remove toast after duration
    if (newToast.duration && newToast.duration > 0) {
      setTimeout(() => {
        removeToast(id)
      }, newToast.duration)
    }

    return id
  }

  const removeToast = (id: string) => {
    const index = toasts.value.findIndex(toast => toast.id === id)
    if (index > -1) {
      toasts.value.splice(index, 1)
    }
  }

  const clearToasts = () => {
    toasts.value = []
  }

  // Utility functions
  const showSuccess = (title: string, message: string) => {
    return addToast({ type: 'success', title, message })
  }

  const showError = (title: string, message: string) => {
    // Errors need more reading time than the other toast types
    return addToast({ type: 'error', title, message, duration: 8000 })
  }

  const showWarning = (title: string, message: string) => {
    return addToast({ type: 'warning', title, message })
  }

  const showInfo = (title: string, message: string) => {
    return addToast({ type: 'info', title, message })
  }

  // Reset store
  const reset = () => {
    state.value = {
      error: null
    }
    toasts.value = []
  }

  return {
    // State
    state,
    toasts,

    // Getters
    error,

    // Actions
    setError,

    // Toast management
    addToast,
    removeToast,
    clearToasts,
    showSuccess,
    showError,
    showWarning,
    showInfo,

    // Utility
    reset
  }
})
