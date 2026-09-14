<template>
  <div>
    <div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
      <span class="text-sm font-medium text-text sm:w-36 sm:flex-shrink-0">{{ label }}</span>
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <input
          ref="input"
          :value="value"
          type="text"
          readonly
          :aria-label="label"
          class="form-input min-w-0 flex-1 font-mono text-sm"
          @focus="selectAll"
        >
        <button
          type="button"
          class="btn-secondary flex-shrink-0 px-3"
          :title="`${label} kopieren`"
          :aria-label="`${label} kopieren`"
          @click="copy"
        >
          <svg v-if="state === 'copied'" class="w-4 h-4 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
          <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </button>
      </div>
    </div>
    <p class="mt-1 text-xs sm:ml-36 sm:pl-3" :class="state === 'failed' ? 'text-error' : 'text-success'" aria-live="polite">
      <span v-if="state === 'copied'">Kopiert</span>
      <span v-else-if="state === 'failed'">Kopieren nicht möglich. Der Wert ist markiert – bitte mit Strg+C kopieren.</span>
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

interface Props {
  label: string
  value: string
}

const props = defineProps<Props>()

const input = ref<HTMLInputElement | null>(null)
const state = ref<'idle' | 'copied' | 'failed'>('idle')
let resetTimer: ReturnType<typeof setTimeout> | undefined

const selectAll = (): void => {
  input.value?.select()
}

/**
 * The clipboard API is unavailable outside a secure context, which a self
 * hosted instance on plain http hits. Selecting the value is the fallback:
 * the user can still copy it by hand.
 */
const copy = async (): Promise<void> => {
  clearTimeout(resetTimer)
  try {
    await navigator.clipboard.writeText(props.value)
    state.value = 'copied'
  } catch {
    selectAll()
    state.value = 'failed'
  }
  resetTimer = setTimeout(() => {
    state.value = 'idle'
  }, 2500)
}
</script>
