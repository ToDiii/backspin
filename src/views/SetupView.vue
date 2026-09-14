<template>
  <div class="min-h-screen bg-background">
    <div class="container-custom section-padding">
      <div class="max-w-4xl mx-auto">
        <!-- Header -->
        <div class="text-center mb-12">
          <h1 class="text-3xl sm:text-4xl font-bold text-text mb-4">
            🎯 Setup-Assistent
          </h1>
          <p class="text-xl text-text-secondary">
            Einmal eine eigene Spotify App anlegen – danach läuft das Backup.
          </p>
        </div>

        <!-- Progress Bar -->
        <div class="mb-12">
          <div class="flex items-center justify-between mb-4">
            <span class="text-sm font-medium text-text">{{ stepTitles[currentStep - 1] }}</span>
            <span class="text-sm text-text-secondary">Schritt {{ currentStep }} von {{ totalSteps }}</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: `${progress}%` }" />
          </div>
        </div>

        <!-- Step 1: Spotify App anlegen -->
        <div v-if="currentStep === 1" class="card animate-fade-in">
          <div class="card-header">
            <h2 class="card-title">Schritt 1: Spotify App anlegen</h2>
            <p class="card-description">
              Spotify erlaubt den Zugriff auf deine Daten nur über eine eigene App. Sie ist kostenlos
              und in etwa zwei Minuten angelegt.
            </p>
          </div>

          <div class="space-y-6">
            <!-- Voraussetzungen -->
            <div class="flex items-start gap-3 bg-warning-surface border border-warning-border rounded-lg p-4">
              <span class="text-xl flex-shrink-0">⚠️</span>
              <div class="text-sm min-w-0">
                <p class="font-semibold text-text mb-1">Spotify Premium ist Voraussetzung</p>
                <p class="text-text-secondary">
                  Die Spotify Web API setzt einen aktiven Premium-Account voraus – mit einem Free-Account
                  lässt sich diese App nicht verwenden.
                  <a
                    href="https://developer.spotify.com/documentation/web-api"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-brand hover:text-brand-strong underline ml-1"
                  >Spotify Docs</a>
                </p>
              </div>
            </div>

            <ol class="space-y-4 text-text-secondary">
              <li class="flex items-start">
                <span class="step-number">1</span>
                <span class="min-w-0">
                  Öffne das
                  <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer" class="text-brand hover:text-brand-strong underline">Spotify Developer Dashboard</a>
                  und melde dich mit deinem Spotify-Konto an.
                </span>
              </li>
              <li class="flex items-start">
                <span class="step-number">2</span>
                <span class="min-w-0">Klicke auf <strong>Create app</strong>.</span>
              </li>
              <li class="flex items-start">
                <span class="step-number">3</span>
                <span class="min-w-0">
                  Fülle das Formular aus. Die Feldnamen im Dashboard sind englisch, die Werte kannst du hier
                  direkt kopieren:
                </span>
              </li>
            </ol>

            <!-- Werte zum Kopieren -->
            <div class="bg-surface-muted border border-border rounded-lg p-4 sm:p-6 space-y-4">
              <CopyField label="App name" :value="APP_NAME" />
              <CopyField label="App description" :value="APP_DESCRIPTION" />
              <CopyField label="Website" :value="appUrl" />
              <CopyField label="Redirect URI" :value="redirectUri" />

              <div class="border-t border-border pt-4 space-y-2 text-sm text-text-secondary">
                <p>
                  <strong class="text-text">Which API/SDKs are you planning to use?</strong><br>
                  Nur <strong class="text-text">Web API</strong> ankreuzen. Die übrigen Häkchen bleiben leer.
                </p>
                <p>
                  Zum Schluss den Nutzungsbedingungen zustimmen und auf <strong class="text-text">Save</strong> klicken.
                </p>
              </div>
            </div>

            <div class="status-warning text-sm">
              <p class="text-text-secondary">
                <strong class="text-text">Die Redirect URI muss zeichengenau stimmen.</strong>
                Spotify vergleicht sie exakt – inklusive <code>{{ redirectScheme }}</code>, Portnummer und ohne
                Schrägstrich am Ende. Kopiere sie deshalb lieber, als sie abzutippen.
              </p>
            </div>

            <a
              href="https://developer.spotify.com/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              class="btn-primary w-full flex items-center justify-center"
            >
              <svg class="w-5 h-5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Dashboard in neuem Tab öffnen
            </a>
          </div>

          <div class="flex justify-between mt-8">
            <button class="btn-ghost" @click="$router.push('/')">
              ← Zurück
            </button>
            <button class="btn-primary" @click="nextStep">
              Weiter →
            </button>
          </div>
        </div>

        <!-- Step 2: Sich selbst als Nutzer eintragen -->
        <div v-if="currentStep === 2" class="card animate-fade-in">
          <div class="card-header">
            <h2 class="card-title">Schritt 2: Dich selbst als Nutzer eintragen</h2>
            <p class="card-description">
              Der Schritt, an dem die meisten hängen bleiben. Ohne ihn bricht die Anmeldung später ab –
              und Spotify erklärt nicht, warum.
            </p>
          </div>

          <div class="space-y-6">
            <div class="status-info text-sm">
              <p class="text-text-secondary">
                Deine App startet im <strong class="text-text">Development Mode</strong>. In diesem Modus lässt
                Spotify nur Konten zu, die ausdrücklich in der App eingetragen sind –
                <strong class="text-text">auch dein eigenes</strong>. Maximal fünf Konten sind möglich.
              </p>
            </div>

            <ol class="space-y-4 text-text-secondary">
              <li class="flex items-start">
                <span class="step-number">1</span>
                <span class="min-w-0">Öffne im Dashboard deine gerade angelegte App.</span>
              </li>
              <li class="flex items-start">
                <span class="step-number">2</span>
                <span class="min-w-0">Klicke auf <strong>Settings</strong> und dort auf den Reiter <strong>User Management</strong>.</span>
              </li>
              <li class="flex items-start">
                <span class="step-number">3</span>
                <span class="min-w-0">
                  Trage dich selbst ein: <strong>Name</strong> frei wählbar, <strong>E-Mail</strong> genau die
                  Adresse, mit der du dich bei Spotify anmeldest. Danach <strong>Add user</strong>.
                </span>
              </li>
            </ol>

            <div class="status-warning text-sm">
              <p class="text-text-secondary">
                <strong class="text-text">Es muss die E-Mail-Adresse deines Spotify-Kontos sein.</strong>
                Eine andere Adresse wird zwar angenommen, hilft aber nicht: Spotify gleicht beim Anmelden
                genau diese Adresse ab. Welche es ist, steht in deinem
                <a href="https://www.spotify.com/account/overview/" target="_blank" rel="noopener noreferrer" class="text-brand hover:text-brand-strong underline">Spotify-Konto</a>.
              </p>
            </div>

            <label class="flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition-colors" :class="userAdded ? 'border-brand bg-primary-500/10' : 'border-border hover:border-brand/50'">
              <input v-model="userAdded" type="checkbox" class="form-checkbox mt-0.5 flex-shrink-0" data-testid="user-added">
              <span class="text-sm text-text min-w-0">
                Ich habe mein Spotify-Konto unter „User Management" eingetragen.
              </span>
            </label>
          </div>

          <div class="flex justify-between mt-8">
            <button class="btn-ghost" @click="previousStep">
              ← Zurück
            </button>
            <button class="btn-primary" :disabled="!userAdded" @click="nextStep">
              Weiter →
            </button>
          </div>
        </div>

        <!-- Step 3: Client ID eingeben -->
        <div v-if="currentStep === 3" class="card animate-fade-in">
          <div class="card-header">
            <h2 class="card-title">Schritt 3: Client ID eintragen</h2>
            <p class="card-description">
              Die Client ID verbindet diese Seite mit deiner App. Sie bleibt in deinem Browser.
            </p>
          </div>

          <div class="space-y-6">
            <div class="form-group">
              <label for="clientId" class="form-label">Client ID</label>
              <input
                id="clientId"
                v-model="clientId"
                type="text"
                autocomplete="off"
                spellcheck="false"
                class="form-input font-mono"
                :class="{ 'border-error focus:ring-error focus:border-error': Boolean(clientIdError) }"
                :aria-invalid="Boolean(clientIdError)"
                aria-describedby="clientIdHelp"
                placeholder="0a1b2c3d4e5f60718293a4b5c6d7e8f9"
                @input="validate"
                @blur="reportInvalidClientId"
              >
              <p v-if="clientIdError" id="clientIdHelp" class="form-error" data-testid="client-id-error">
                {{ clientIdError }}
              </p>
              <p v-else-if="isClientIdValid" id="clientIdHelp" class="text-success text-sm mt-1" data-testid="client-id-ok">
                ✅ Sieht gut aus – 32 Zeichen, alle gültig.
              </p>
              <p v-else id="clientIdHelp" class="text-text-secondary text-sm mt-1">
                32 Zeichen aus Ziffern und den Buchstaben a bis f.
              </p>
            </div>

            <div class="status-info text-sm">
              <p class="text-text-secondary">
                <strong class="text-text">Wo steht die Client ID?</strong>
                Im Dashboard in deiner App unter <strong class="text-text">Settings</strong> → Abschnitt
                <strong class="text-text">Basic Information</strong> → <strong class="text-text">Client ID</strong>.
                Das darunterliegende <strong class="text-text">Client Secret</strong> brauchst du nicht – diese App
                nutzt PKCE und kommt ohne Secret aus. Gib es nirgends ein.
              </p>
            </div>
          </div>

          <div class="flex justify-between mt-8">
            <button class="btn-ghost" @click="previousStep">
              ← Zurück
            </button>
            <button
              class="btn-primary"
              :disabled="!isClientIdValid"
              @click="nextStep"
            >
              Weiter →
            </button>
          </div>
        </div>

        <!-- Step 4: Fertig -->
        <div v-if="currentStep === 4" class="card animate-fade-in">
          <div class="card-header text-center">
            <div class="w-16 h-16 bg-success rounded-full flex items-center justify-center mx-auto mb-4">
              <svg class="w-8 h-8 text-on-status" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
              </svg>
            </div>
            <h2 class="card-title">🎉 Setup abgeschlossen</h2>
            <p class="card-description">
              Alles eingerichtet. Beim nächsten Schritt fragt Spotify nach deiner Freigabe.
            </p>
          </div>

          <div class="space-y-6">
            <div class="status-success text-sm">
              <h3 class="font-semibold text-text mb-2">Das ist jetzt hinterlegt</h3>
              <ul class="space-y-1 text-text-secondary">
                <li>• Client ID: <span class="font-mono break-all">{{ clientId }}</span></li>
                <li>• Redirect URI: <span class="font-mono break-all">{{ redirectUri }}</span></li>
                <li>• Lesen: Playlists, gespeicherte Songs und Alben, gefolgte Künstler</li>
                <li>• Schreiben (nur für den Import): Playlists anlegen, Songs und Alben speichern, Künstlern folgen</li>
                <li>• Anmeldung über OAuth 2.0 mit PKCE, ohne Client Secret</li>
              </ul>
            </div>

            <div class="status-info text-sm">
              <p class="text-text-secondary">
                <strong class="text-text">Falls die Anmeldung gleich abbricht:</strong>
                Dann fehlt fast immer der Eintrag unter „User Management" aus Schritt 2 – oder die Redirect URI
                weicht um ein Zeichen ab. Diese Seite sagt dir das dann auch.
              </p>
            </div>
          </div>

          <div class="flex justify-between mt-8">
            <button class="btn-ghost" @click="previousStep">
              ← Zurück
            </button>
            <router-link to="/backup" class="btn-primary">
              Bei Spotify anmelden →
            </router-link>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import CopyField from '@/components/CopyField.vue'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { checkClientId } from '@/services/client-id'

const appStore = useAppStore()
const authStore = useAuthStore()
const route = useRoute()

/** Suggested values for the dashboard form; only the Redirect URI has to match. */
const APP_NAME = 'Mein Spotify-Backup'
const APP_DESCRIPTION = 'Persönliches Backup meiner Playlists und Favoriten'

const stepTitles = [
  'Spotify App anlegen',
  'Als Nutzer eintragen',
  'Client ID eintragen',
  'Fertig',
]

// State
const currentStep = ref(1)
const totalSteps = stepTitles.length
const clientId = ref('')
const clientIdError = ref('')
const isClientIdValid = ref(false)
const userAdded = ref(false)

// Computed
const progress = computed(() => (currentStep.value / totalSteps) * 100)
const appUrl = computed(() => import.meta.env.VITE_APP_URL || window.location.origin)
const redirectUri = computed(() => `${appUrl.value}/callback`)
const redirectScheme = computed(() => (redirectUri.value.startsWith('https://') ? 'https' : 'http'))

// Methods
const nextStep = () => {
  if (currentStep.value < totalSteps) {
    currentStep.value++
  }
}

const previousStep = () => {
  if (currentStep.value > 1) {
    currentStep.value--
  }
}

const validate = () => {
  const check = checkClientId(clientId.value)

  clientIdError.value = check.error ?? ''
  isClientIdValid.value = check.valid

  if (check.valid) {
    // Persisted by the auth store, without the whitespace a paste may carry
    authStore.setClientId(check.value)
  }
}

// Report an invalid entry visibly once the field loses focus
const reportInvalidClientId = () => {
  if (clientIdError.value) {
    appStore.showError('Client ID stimmt nicht', clientIdError.value)
  }
}

onMounted(() => {
  // Load saved client ID if exists
  if (authStore.clientId) {
    clientId.value = authStore.clientId
    validate()
  }

  // `/setup?schritt=2` opens a specific step; the callback error page uses it
  // to send a user straight to the user list instructions.
  const requested = Number(route.query.schritt)
  if (Number.isInteger(requested) && requested >= 1 && requested <= totalSteps) {
    currentStep.value = requested
  }
})
</script>
