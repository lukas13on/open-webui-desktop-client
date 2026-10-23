<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useAppStore, type Page } from './stores/app';
import { DEFAULT_PROVIDER_ID, PROVIDERS, detectProvider, isHttpUrl, normalizeBaseUrl, providerById, type ProviderId } from './providers';
import {
  LANGUAGE_FLAGS,
  LANGUAGE_LABELS,
  SUPPORTED_LANGUAGES,
  currentLanguageFlag,
  t,
  type LanguagePreference
} from './i18n';

type NavItem = { id: Page; title: string; icon: [string, string] };

const store = useAppStore();
const windowAction = ref<'' | 'minimize' | 'maximize' | 'close'>('');
const languageCard = ref<HTMLElement | null>(null);
const languageHighlight = ref(false);
let highlightTimer: ReturnType<typeof setTimeout> | undefined;
const notice = ref('');
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
const envNewKey = ref('');
const envNewValue = ref('');
const revealedKeys = ref<string[]>([]);
const envModalOpen = ref(false);
const envDraft = ref('');
const wizardProvider = ref<ProviderId>(DEFAULT_PROVIDER_ID);
const wizardCustomUrl = ref('');
const wizardKey = ref('');
const wizardKeyVisible = ref(false);
const wizardError = ref('');

const pages = computed<NavItem[]>(() => [
  { id: 'home', title: t('nav.home'), icon: ['fas', 'house'] },
  { id: 'wizard', title: t('nav.wizard'), icon: ['fas', 'wand-magic-sparkles'] },
  { id: 'settings', title: t('nav.settings'), icon: ['fas', 'gear'] },
  { id: 'updates', title: t('nav.updates'), icon: ['fas', 'rotate'] },
  { id: 'help', title: t('nav.about'), icon: ['fas', 'circle-info'] }
]);

const languages = SUPPORTED_LANGUAGES.map((code) => ({
  code,
  label: LANGUAGE_LABELS[code],
  flag: LANGUAGE_FLAGS[code]
}));

const providers = PROVIDERS;

const envBaseUrl = computed(() => store.envEntries.find((entry) => entry.key === 'OPENAI_API_BASE_URL')?.value ?? '');
const currentProvider = computed(() => detectProvider(envBaseUrl.value));
const apiKeyConfigured = computed(() => (store.envEntries.find((entry) => entry.key === 'OPENAI_API_KEY')?.value ?? '').length > 0);
const selectedProvider = computed(() => providerById(wizardProvider.value));
const wizardBaseUrl = computed(() => (wizardProvider.value === 'custom' ? wizardCustomUrl.value : selectedProvider.value.baseUrl));

let unsubscribers: Array<() => void> = [];

onMounted(async () => {
  unsubscribers = [
    window.desktop.onUpdateState((running) => { store.updateRunning = running; }),
    window.desktop.onBackendRestarting((restarting) => { store.pending.restart = restarting; }),
    window.desktop.onWindowMaximized((maximized) => { store.windowMaximized = maximized; }),
    window.desktop.onUpdateRequest(() => { void store.checkUpdates(); }),
    window.desktop.onSettingsRequest(() => { store.page = 'settings'; }),
    window.desktop.onHelpRequest(() => { store.page = 'help'; }),
    window.desktop.onBackendRestarted((url) => {
      store.backendUrl = url;
      store.backendReady = Boolean(url);
      store.updateRunning = false;
    })
  ];
  await store.initialize();
});
onUnmounted(() => {
  unsubscribers.forEach((unsubscribe) => unsubscribe());
  if (highlightTimer) clearTimeout(highlightTimer);
  if (noticeTimer) clearTimeout(noticeTimer);
  window.removeEventListener('keydown', onModalKeydown);
});

function showNotice(message: string): void {
  notice.value = message;
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice.value = ''; }, 6000);
}

function isSecretKey(key: string): boolean {
  return /(KEY|TOKEN|SECRET|PASSWORD)/i.test(key);
}

function toggleReveal(key: string): void {
  const index = revealedKeys.value.indexOf(key);
  if (index === -1) revealedKeys.value.push(key);
  else revealedKeys.value.splice(index, 1);
}

function addEnvironmentVariable(): void {
  const key = envNewKey.value.trim();
  const value = envNewValue.value;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || !value) {
    store.error = t('env.addInvalid');
    return;
  }
  if (store.envHasKey(key)) {
    store.error = t('env.addDuplicate', { key });
    return;
  }
  store.addEnvEntry(key, value);
  envNewKey.value = '';
  envNewValue.value = '';
  store.error = '';
}

async function resetEnvironmentFile(): Promise<void> {
  if (store.pending.environment) return;
  if (!window.confirm(t('env.resetConfirm'))) return;
  if (!await store.resetEnvironment()) return;
  await store.restartServer();
  showNotice(t('env.resetDone'));
}

function openEnvEditor(): void {
  envDraft.value = store.envRaw;
  envModalOpen.value = true;
  store.error = '';
  window.addEventListener('keydown', onModalKeydown);
  void nextTick(() => document.querySelector<HTMLTextAreaElement>('.env-textarea')?.focus());
}

function closeEnvEditor(): void {
  envModalOpen.value = false;
  window.removeEventListener('keydown', onModalKeydown);
}

function onModalKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && envModalOpen.value) closeEnvEditor();
}

async function saveEnvEditor(): Promise<void> {
  if (store.pending.environment) return;
  const saved = await store.saveEnvRaw(envDraft.value);
  if (!saved) return;
  closeEnvEditor();
  await store.restartServer();
  showNotice(t('env.editDone'));
}

function selectProvider(id: ProviderId): void {
  wizardProvider.value = id;
  wizardError.value = '';
  if (id !== 'custom') wizardCustomUrl.value = '';
}

function resetWizardDraft(): void {
  wizardProvider.value = DEFAULT_PROVIDER_ID;
  wizardCustomUrl.value = '';
  wizardKey.value = '';
  wizardKeyVisible.value = false;
  wizardError.value = '';
  store.wizardApplied = false;
}

watch(() => store.page, (page, previous) => {
  if (previous !== 'wizard' || page === 'wizard') return;
  resetWizardDraft();
});

async function applyWizard(): Promise<void> {
  if (store.pending.wizard) return;
  wizardError.value = '';
  const baseUrl = normalizeBaseUrl(wizardBaseUrl.value);
  if (!isHttpUrl(baseUrl)) {
    wizardError.value = t('wizard.validationUrl');
    return;
  }
  const apiKey = wizardKey.value.trim();
  if (!apiKey && !apiKeyConfigured.value) {
    wizardError.value = t('wizard.validationKey');
    return;
  }
  const providerLabel = wizardProvider.value === 'custom' ? t('wizard.customName') : selectedProvider.value.name;
  if (!window.confirm(t('wizard.confirmApply', { provider: providerLabel }))) return;
  const applied = await store.applyProviderConfiguration({ baseUrl, apiKey });
  if (applied) {
    wizardKey.value = '';
    wizardKeyVisible.value = false;
  }
}

watch(() => store.languageFocus, async () => {
  await nextTick();
  languageCard.value?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  languageCard.value?.focus({ preventScroll: true });
  languageHighlight.value = true;
  if (highlightTimer) clearTimeout(highlightTimer);
  highlightTimer = setTimeout(() => { languageHighlight.value = false; }, 2400);
});

async function runWindowAction(action: 'minimize' | 'maximize' | 'close'): Promise<void> {
  if (store.pending.window) return;
  windowAction.value = action;
  try {
    if (action === 'minimize') await store.minimizeWindow();
    else if (action === 'maximize') await store.toggleMaximizeWindow();
    else store.closeWindow();
  } finally {
    windowAction.value = '';
  }
}

async function selectLanguage(value: LanguagePreference): Promise<void> {
  if (store.pending.preference || store.config.language === value) return;
  await store.setLanguage(value);
}

async function confirmUpdate(): Promise<void> {
  if (store.pending.applyUpdate) return;
  const count = store.commits.length;
  if (!window.confirm(t('confirm.update', { count }))) return;
  await store.applyUpdate();
}
</script>

<template>
  <div class="app-shell">
    <header class="titlebar">
      <div class="brand-lockup">
        <span class="brand-mark">W</span>
        <span>Open Web UI <b>Desktop</b></span>
        <span class="status-pill" :class="{ inactive: !store.backendReady }">
          <i></i>
          {{ store.pending.restart ? t('status.restarting') : store.backendReady ? t('status.active') : t('status.unavailable') }}
        </span>
      </div>
      <div class="window-actions" :aria-label="t('window.controls')">
        <button type="button" :aria-label="t('window.minimize')" :title="t('window.minimize')" :disabled="store.pending.window" @click="runWindowAction('minimize')">
          <span v-if="windowAction === 'minimize'" class="spinner window-spinner"></span>
          <FontAwesomeIcon v-else :icon="['fas', 'window-minimize']" />
        </button>
        <button type="button" :aria-label="store.windowMaximized ? t('window.restore') : t('window.maximize')" :title="store.windowMaximized ? t('window.restore') : t('window.maximize')" :disabled="store.pending.window" @click="runWindowAction('maximize')">
          <span v-if="windowAction === 'maximize'" class="spinner window-spinner"></span>
          <FontAwesomeIcon v-else :icon="['fas', store.windowMaximized ? 'window-restore' : 'window-maximize']" />
        </button>
        <button type="button" class="close-window" :aria-label="t('window.hide')" :title="t('window.hide')" :disabled="store.pending.window" @click="runWindowAction('close')">
          <FontAwesomeIcon :icon="['fas', 'xmark']" />
        </button>
      </div>
    </header>

    <div class="layout">
      <aside class="sidebar">
        <div class="side-label">{{ t('nav.workspace') }}</div>
        <nav :aria-label="t('nav.primary')">
          <button v-for="item in pages" :key="item.id" type="button" class="nav-item" :class="{ active: store.page === item.id }" @click="store.page = item.id">
            <span class="nav-icon"><FontAwesomeIcon :icon="item.icon" /></span>{{ item.title }}
            <span v-if="item.id === 'updates' && store.commits.length" class="nav-count">{{ store.commits.length }}</span>
          </button>
        </nav>
        <div class="sidebar-bottom">
          <span class="avatar">OW</span>
          <div class="profile">
            <span>{{ t('sidebar.subtitle', { language: store.languageLabel }) }}</span>
          </div>
          <button type="button" class="language-flag" :aria-label="t('sidebar.changeLanguage', { language: store.languageLabel })" :title="t('sidebar.changeLanguage', { language: store.languageLabel })" @click="store.focusLanguage()">
            <img class="flag-img" :src="currentLanguageFlag" alt="" aria-hidden="true" />
          </button>
        </div>
      </aside>

      <main class="main-content">
        <div v-if="store.overlayVisible" class="loading-overlay" role="status">
          <span class="spinner large"></span>
          <strong>{{ t('loading.title') }}</strong>
          <span>{{ store.updateRunning ? t('loading.updating') : t('loading.wait') }}</span>
        </div>
        <div v-if="store.error" class="toast-error" role="alert">
          <span><FontAwesomeIcon :icon="['fas', 'triangle-exclamation']" /></span>{{ store.error }}
          <button type="button" :aria-label="t('common.closeAlert')" @click="store.error = ''"><FontAwesomeIcon :icon="['fas', 'xmark']" /></button>
        </div>
        <div v-if="notice" class="toast-notice" role="status">
          <span><FontAwesomeIcon :icon="['fas', 'circle-check']" /></span>{{ notice }}
          <button type="button" :aria-label="t('common.closeAlert')" @click="notice = ''"><FontAwesomeIcon :icon="['fas', 'xmark']" /></button>
        </div>

        <template v-if="store.page === 'home'">
          <div class="page-heading">
            <div>
              <div class="eyebrow">{{ t('home.eyebrow') }}</div>
              <h1>{{ t('home.title') }}</h1>
              <p>{{ t('home.subtitle') }}</p>
            </div>
            <button type="button" class="button button-primary" :disabled="!store.backendReady || store.serverBusy || store.pending.openWebUI" @click="store.openWebUI()">
              <span v-if="store.pending.openWebUI" class="spinner button-spinner"></span>
              <FontAwesomeIcon v-else :icon="['fas', 'arrow-up-right-from-square']" />
              {{ store.pending.openWebUI ? t('home.opening') : t('home.open') }}
            </button>
          </div>
          <section class="welcome-card">
            <div class="welcome-copy">
              <span class="welcome-tag"><span class="online-dot"></span> {{ t('home.welcomeTag') }}</span>
              <h2>{{ t('home.welcomeTitleA') }}<br /><span>{{ t('home.welcomeTitleB') }}</span></h2>
              <p>{{ t('home.welcomeDescription') }}</p>
              <button type="button" class="button button-light" :disabled="!store.backendReady || store.serverBusy || store.pending.openWebUI" @click="store.openWebUI()">
                <template v-if="store.pending.openWebUI"><span class="spinner button-spinner dark-spinner"></span> {{ t('home.openingChat') }}</template>
                <template v-else>{{ t('home.startChat') }} <FontAwesomeIcon :icon="['fas', 'arrow-right']" /></template>
              </button>
            </div>
            <div class="welcome-art" aria-hidden="true">
              <div class="art-orbit orbit-one"></div>
              <div class="art-orbit orbit-two"></div>
              <div class="art-glow"></div>
              <div class="art-core"><FontAwesomeIcon :icon="['fas', 'asterisk']" /></div>
              <span class="art-chip chip-one"><FontAwesomeIcon :icon="['fas', 'lock']" /> {{ t('home.chipPrivate') }}</span>
              <span class="art-chip chip-two"><FontAwesomeIcon :icon="['fas', 'microchip']" /> {{ t('home.chipLocal') }}</span>
            </div>
          </section>
          <div class="section-heading">
            <div><h2>{{ t('home.quickHeading') }}</h2><p>{{ t('home.quickSubheading') }}</p></div>
          </div>
          <div class="quick-grid">
            <button type="button" class="quick-card" @click="store.page = 'settings'">
              <span class="quick-icon"><FontAwesomeIcon :icon="['fas', 'gear']" /></span>
              <span class="quick-title">{{ t('home.settingsCardTitle') }}</span>
              <span class="quick-description">{{ t('home.settingsCardDescription') }}</span>
              <span class="quick-arrow"><FontAwesomeIcon :icon="['fas', 'arrow-right']" /></span>
            </button>
            <button type="button" class="quick-card" :disabled="store.pending.checkUpdates || store.updateRunning" @click="store.checkUpdates()">
              <span class="quick-icon">
                <span v-if="store.pending.checkUpdates" class="spinner icon-spinner"></span>
                <FontAwesomeIcon v-else :icon="['fas', 'rotate']" />
              </span>
              <span class="quick-title">{{ store.pending.checkUpdates ? t('home.updatesCardBusy') : t('home.updatesCardTitle') }}</span>
              <span class="quick-description">{{ t('home.updatesCardDescription') }}</span>
              <span class="quick-arrow"><FontAwesomeIcon :icon="['fas', 'arrow-right']" /></span>
            </button>
            <button type="button" class="quick-card" :disabled="store.serverBusy || store.pending.openWebUI" @click="store.restartServer()">
              <span class="quick-icon">
                <span v-if="store.pending.restart" class="spinner icon-spinner"></span>
                <FontAwesomeIcon v-else :icon="['fas', 'arrow-rotate-right']" />
              </span>
              <span class="quick-title">{{ store.pending.restart ? t('home.restartCardBusy') : t('home.restartCardTitle') }}</span>
              <span class="quick-description">{{ t('home.restartCardDescription') }}</span>
              <span class="quick-arrow"><FontAwesomeIcon :icon="['fas', 'arrow-right']" /></span>
            </button>
          </div>
          <footer class="page-footer">
            <span><i class="online-dot"></i> {{ t('home.footerLocal') }}</span>
            <span>{{ t('home.footerPort', { port: store.config.backendPort }) }} <span class="footer-separator">·</span> {{ t('home.footerData') }}</span>
          </footer>
        </template>

        <template v-else-if="store.page === 'wizard'">
          <div class="page-heading">
            <div>
              <div class="eyebrow">{{ t('wizard.eyebrow') }}</div>
              <h1>{{ t('wizard.title') }}</h1>
              <p>{{ t('wizard.subtitle') }}</p>
            </div>
          </div>
          <p class="wizard-current">
            <FontAwesomeIcon :icon="['fas', 'plug']" />
            {{ t('wizard.current', { provider: currentProvider.name || t('wizard.customName') }) }}
          </p>

          <section class="settings-card">
            <div class="card-heading">
              <div class="quick-icon"><FontAwesomeIcon :icon="['fas', 'server']" /></div>
              <div><h2>{{ t('wizard.providerTitle') }}</h2><p>{{ t('wizard.providerDescription') }}</p></div>
            </div>
            <div class="wizard-providers" role="radiogroup" :aria-label="t('wizard.providerTitle')">
              <button v-for="provider in providers" :key="provider.id" type="button" class="wizard-provider" role="radio" :aria-checked="wizardProvider === provider.id" @click="selectProvider(provider.id)">
                <span class="wizard-provider-mark"><FontAwesomeIcon :icon="provider.id === 'custom' ? ['fas', 'pen-to-square'] : ['fas', 'server']" /></span>
                <span class="wizard-provider-copy">
                  <strong>{{ provider.id === 'custom' ? t('wizard.customName') : provider.name }}</strong>
                  <span>{{ provider.id === 'custom' ? t('wizard.customDescription') : provider.baseUrl }}</span>
                </span>
                <span v-if="provider.id === DEFAULT_PROVIDER_ID" class="wizard-badge">{{ t('wizard.defaultBadge') }}</span>
                <span class="language-check" aria-hidden="true"><FontAwesomeIcon v-if="wizardProvider === provider.id" :icon="['fas', 'check']" /></span>
              </button>
            </div>
            <template v-if="wizardProvider === 'custom'">
              <label class="field-label" for="wizard-base-url">{{ t('wizard.baseUrlLabel') }}</label>
              <input id="wizard-base-url" v-model="wizardCustomUrl" class="text-field" :placeholder="t('wizard.baseUrlPlaceholder')" spellcheck="false" autocomplete="off" />
              <p class="field-help">{{ t('wizard.baseUrlHint') }}</p>
            </template>
          </section>

          <section class="settings-card">
            <div class="card-heading">
              <div class="quick-icon"><FontAwesomeIcon :icon="['fas', 'key']" /></div>
              <div><h2>{{ t('wizard.keyTitle') }}</h2><p>{{ t('wizard.keyDescription') }}</p></div>
            </div>
            <label class="field-label" for="wizard-key">{{ t('wizard.keyLabel') }}</label>
            <div class="field-row">
              <input id="wizard-key" v-model="wizardKey" class="text-field wizard-key" :type="wizardKeyVisible ? 'text' : 'password'" :placeholder="t('wizard.keyPlaceholder')" spellcheck="false" autocomplete="off" />
              <button type="button" class="icon-button" :aria-label="t('wizard.keyLabel')" :title="t('wizard.keyLabel')" @click="wizardKeyVisible = !wizardKeyVisible">
                <FontAwesomeIcon :icon="['fas', wizardKeyVisible ? 'eye-slash' : 'eye']" />
              </button>
            </div>
            <p class="field-help">{{ t('wizard.keyHint') }}</p>
            <p v-if="apiKeyConfigured" class="wizard-note">{{ t('wizard.keyConfigured') }}</p>

            <dl class="wizard-summary">
              <div>
                <dt>{{ t('wizard.summaryProvider') }}</dt>
                <dd>{{ wizardProvider === 'custom' ? (wizardCustomUrl || t('wizard.customName')) : selectedProvider.name }}</dd>
              </div>
              <div>
                <dt>{{ t('wizard.summaryUrl') }}</dt>
                <dd>{{ wizardBaseUrl || '—' }}</dd>
              </div>
            </dl>

            <p v-if="wizardError" class="wizard-error" role="alert">
              <FontAwesomeIcon :icon="['fas', 'triangle-exclamation']" /> {{ wizardError }}
            </p>

            <div class="wizard-actions">
              <button type="button" class="button button-success" :disabled="store.pending.wizard" @click="applyWizard()">
                <span v-if="store.pending.wizard" class="spinner button-spinner"></span>
                <FontAwesomeIcon v-else :icon="['fas', 'check']" />
                {{ store.pending.wizard ? t('wizard.applying') : t('wizard.apply') }}
              </button>
              <button v-if="store.wizardApplied" type="button" class="button button-outline" :disabled="!store.backendReady || store.serverBusy" @click="store.openWebUI()">
                <FontAwesomeIcon :icon="['fas', 'arrow-up-right-from-square']" /> {{ t('home.open') }}
              </button>
            </div>
            <p v-if="store.wizardApplied" class="wizard-success" role="status">
              <FontAwesomeIcon :icon="['fas', 'circle-check']" /> {{ t('wizard.applied') }}
            </p>
            <p class="wizard-restart" role="note">
              <FontAwesomeIcon :icon="['fas', 'rotate']" /> {{ t('wizard.restartNote') }}
            </p>
          </section>
        </template>

        <template v-else-if="store.page === 'settings'">
          <div class="page-heading">
            <div>
              <div class="eyebrow">{{ t('settings.eyebrow') }}</div>
              <h1>{{ t('settings.title') }}</h1>
              <p>{{ t('settings.subtitle') }}</p>
            </div>
          </div>
          <section class="settings-card">
            <div class="card-heading">
              <div class="quick-icon"><FontAwesomeIcon :icon="['fas', 'server']" /></div>
              <div><h2>{{ t('settings.serverTitle') }}</h2><p>{{ t('settings.serverDescription') }}</p></div>
            </div>
            <label class="field-label" for="port">{{ t('settings.portLabel') }}</label>
            <div class="field-row">
              <input id="port" v-model.number="store.config.backendPort" class="text-field port-input" type="number" min="1" max="65535" />
              <span class="field-hint">{{ t('settings.portHint', { port: 3301 }) }}</span>
            </div>
            <p class="field-help">{{ t('settings.portHelp') }}</p>

            <div class="env-section">
              <div class="env-header">
                <div>
                  <h3>{{ t('env.title') }}</h3>
                  <p>{{ t('env.description') }}</p>
                </div>
                <div class="env-header-actions">
                  <button type="button" class="button button-outline" :disabled="store.pending.environment" @click="openEnvEditor()">
                    <FontAwesomeIcon :icon="['fas', 'pen-to-square']" /> {{ t('env.edit') }}
                  </button>
                  <button type="button" class="button button-outline" :disabled="store.pending.environment || store.serverBusy" @click="resetEnvironmentFile()">
                    <FontAwesomeIcon :icon="['fas', 'rotate-left']" /> {{ t('env.reset') }}
                  </button>
                </div>
              </div>
              <p class="env-path" :title="store.envPath">{{ t('env.file', { path: store.envPath }) }}</p>
              <div class="env-list">
                <p v-if="!store.envEntries.length" class="env-empty">{{ t('env.empty') }}</p>
                <div v-for="entry in store.envEntries" :key="entry.key" class="env-row">
                  <code class="env-key" :title="entry.key">{{ entry.key }}</code>
                  <div class="env-value-cell">
                    <input
                      class="text-field env-value"
                      :type="isSecretKey(entry.key) && !revealedKeys.includes(entry.key) ? 'password' : 'text'"
                      :value="entry.value"
                      :aria-label="entry.key"
                      spellcheck="false"
                      autocomplete="off"
                      @input="store.setEnvValue(entry.key, ($event.target as HTMLInputElement).value)"
                    />
                    <button v-if="isSecretKey(entry.key)" type="button" class="icon-button" :aria-label="revealedKeys.includes(entry.key) ? t('env.hide', { key: entry.key }) : t('env.reveal', { key: entry.key })" :title="revealedKeys.includes(entry.key) ? t('env.hide', { key: entry.key }) : t('env.reveal', { key: entry.key })" @click="toggleReveal(entry.key)">
                      <FontAwesomeIcon :icon="['fas', revealedKeys.includes(entry.key) ? 'eye-slash' : 'eye']" />
                    </button>
                  </div>
                  <button type="button" class="icon-button danger" :aria-label="t('env.remove', { key: entry.key })" :title="t('env.remove', { key: entry.key })" @click="store.removeEnvEntry(entry.key)">
                    <FontAwesomeIcon :icon="['fas', 'trash-can']" />
                  </button>
                </div>
              </div>
              <div class="env-add">
                <input v-model="envNewKey" class="text-field env-key-input" :placeholder="t('env.namePlaceholder')" :aria-label="t('env.name')" spellcheck="false" autocomplete="off" />
                <input v-model="envNewValue" class="text-field env-value" :placeholder="t('env.valuePlaceholder')" :aria-label="t('env.value')" spellcheck="false" autocomplete="off" @keydown.enter="addEnvironmentVariable()" />
                <button type="button" class="button button-outline" @click="addEnvironmentVariable()">
                  <FontAwesomeIcon :icon="['fas', 'plus']" /> {{ t('env.add') }}
                </button>
              </div>
              <p class="env-hint"><FontAwesomeIcon :icon="['fas', 'rotate']" /> {{ t('env.saveHint') }}</p>
            </div>

            <div class="card-actions">
              <span>{{ t('settings.saveNote') }}</span>
              <button type="button" class="button button-primary" :disabled="store.pending.save || store.pending.environment" @click="store.saveConfig()">
                <span v-if="store.pending.save" class="spinner button-spinner"></span>
                {{ store.pending.save ? t('settings.saving') : t('settings.save') }}
              </button>
            </div>
          </section>

          <section class="settings-card">
            <div class="card-heading">
              <div class="quick-icon"><FontAwesomeIcon :icon="['fas', 'window-restore']" /></div>
              <div><h2>{{ t('settings.windowTitle') }}</h2><p>{{ t('settings.windowDescription') }}</p></div>
            </div>
            <button type="button" class="switch-row" role="switch" :aria-checked="store.config.hideDesktopOnOpen" :disabled="store.pending.preference" @click="store.setHideDesktopOnOpen(!store.config.hideDesktopOnOpen)">
              <span class="switch-copy">
                <strong>{{ t('settings.hideLabel') }}</strong>
                <span>{{ t('settings.hideDescription') }}</span>
              </span>
              <span class="switch" :class="{ on: store.config.hideDesktopOnOpen, busy: store.pending.preference }" aria-hidden="true">
                <span v-if="store.pending.preference" class="spinner switch-spinner"></span>
                <span v-else class="switch-knob"></span>
              </span>
            </button>
            <button type="button" class="switch-row" role="switch" :aria-checked="store.config.launchAtLogin" :disabled="store.pending.preference" @click="store.setLaunchAtLogin(!store.config.launchAtLogin)">
              <span class="switch-copy">
                <strong>{{ t('settings.loginLabel') }}</strong>
                <span>{{ t('settings.loginDescription') }}</span>
              </span>
              <span class="switch" :class="{ on: store.config.launchAtLogin, busy: store.pending.preference }" aria-hidden="true">
                <span v-if="store.pending.preference" class="spinner switch-spinner"></span>
                <span v-else class="switch-knob"></span>
              </span>
            </button>
          </section>

          <section ref="languageCard" class="settings-card language-card" :class="{ highlighted: languageHighlight }" tabindex="-1">
            <div class="card-heading">
              <div class="quick-icon"><FontAwesomeIcon :icon="['fas', 'language']" /></div>
              <div><h2>{{ t('settings.languageTitle') }}</h2><p>{{ t('settings.languageDescription') }}</p></div>
            </div>
            <div class="language-options" role="radiogroup" :aria-label="t('settings.languageTitle')">
              <button type="button" class="language-option" role="radio" :aria-checked="store.config.language === 'auto'" :disabled="store.pending.preference" @click="selectLanguage('auto')">
                <span class="language-option-icon"><FontAwesomeIcon :icon="['fas', 'globe']" /></span>
                <span class="language-option-copy">
                  <strong>{{ t('settings.languageAuto') }}</strong>
                  <span>{{ t('settings.languageAutoDescription', { language: store.systemLanguageLabel }) }}</span>
                </span>
                <span class="language-check" aria-hidden="true"><FontAwesomeIcon v-if="store.config.language === 'auto'" :icon="['fas', 'check']" /></span>
              </button>
              <button v-for="language in languages" :key="language.code" type="button" class="language-option" role="radio" :aria-checked="store.config.language === language.code" :disabled="store.pending.preference" @click="selectLanguage(language.code)">
                <span class="language-option-icon"><img class="flag-img" :src="language.flag" alt="" aria-hidden="true" /></span>
                <span class="language-option-copy">
                  <strong>{{ language.label }}</strong>
                </span>
                <span class="language-check" aria-hidden="true"><FontAwesomeIcon v-if="store.config.language === language.code" :icon="['fas', 'check']" /></span>
              </button>
            </div>
            <p class="language-warning" role="note">
              <FontAwesomeIcon :icon="['fas', 'triangle-exclamation']" />
              {{ t('settings.languageWarning') }}
            </p>
            <p v-if="store.languageRestarting" class="language-restarting" role="status">
              <span class="spinner"></span>{{ t('settings.languageApplying') }}
            </p>
          </section>
        </template>

        <template v-else-if="store.page === 'updates'">
          <div class="page-heading">
            <div>
              <div class="eyebrow">{{ t('updates.eyebrow') }}</div>
              <h1>{{ t('updates.title') }}</h1>
              <p>{{ t('updates.subtitle') }}</p>
            </div>
            <button type="button" class="button button-outline" :disabled="store.pending.checkUpdates || store.updateRunning" @click="store.checkUpdates()">
              <span v-if="store.pending.checkUpdates" class="spinner button-spinner"></span>
              <FontAwesomeIcon v-else :icon="['fas', 'rotate']" />
              {{ store.pending.checkUpdates ? t('updates.checking') : t('updates.checkAgain') }}
            </button>
          </div>
          <section class="settings-card updates-card">
            <template v-if="store.commits.length">
              <div class="updates-heading">
                <span class="update-badge">{{ store.commits.length === 1 ? t('updates.available', { count: store.commits.length }) : t('updates.availablePlural', { count: store.commits.length }) }}</span>
                <h2>{{ t('updates.whatsNew') }}</h2>
                <p>{{ t('updates.review') }}</p>
              </div>
              <div class="commit-list">
                <div v-for="commit in store.commits" :key="commit.hash" class="commit-row">
                  <span class="commit-mark"><FontAwesomeIcon :icon="['fas', 'check']" /></span>
                  <span class="commit-hash">{{ commit.hash }}</span>
                  <span class="commit-subject">{{ commit.subject }}</span>
                </div>
              </div>
              <div class="card-actions">
                <span>{{ t('updates.restartNote') }}</span>
                <button type="button" class="button button-primary" :disabled="store.pending.applyUpdate || store.updateRunning" @click="confirmUpdate()">
                  <span v-if="store.pending.applyUpdate || store.updateRunning" class="spinner button-spinner"></span>
                  {{ store.pending.applyUpdate || store.updateRunning ? t('updates.installing') : t('updates.install') }}
                </button>
              </div>
            </template>
            <div v-else class="empty-state">
              <span class="empty-icon"><FontAwesomeIcon :icon="['fas', 'circle-check']" /></span>
              <h2>{{ store.error ? t('updates.errorTitle') : t('updates.upToDate') }}</h2>
              <p>{{ store.error || t('updates.noUpdates') }}</p>
              <p v-if="!store.error && store.backendVersion" class="backend-version">{{ t('updates.serverVersion', { version: store.backendVersion }) }}</p>
              <button type="button" class="button button-outline" :disabled="store.pending.checkUpdates || store.updateRunning" @click="store.checkUpdates()">
                <span v-if="store.pending.checkUpdates" class="spinner button-spinner"></span>
                {{ store.pending.checkUpdates ? t('updates.checking') : t('updates.checkAgain') }}
              </button>
            </div>
          </section>
          <p class="update-note">{{ t('updates.note') }}</p>
        </template>

        <template v-else>
          <div class="page-heading">
            <div>
              <div class="eyebrow">{{ t('about.eyebrow') }}</div>
              <h1>{{ t('about.title') }}</h1>
              <p>{{ t('about.subtitle') }}</p>
            </div>
          </div>
          <section class="settings-card about-card">
            <div class="about-logo">W</div>
            <h2>{{ t('about.appTitle') }}</h2>
            <p>{{ t('about.appDescription') }}</p>
            <div class="about-details">
              <span>{{ t('about.version') }}</span><strong>1.0.0</strong>
              <span>{{ t('about.author') }}</span>
              <strong class="author-value">
                Lucas de Oliveira Neitzke
                <a class="github-link" href="https://github.com/lukas13on" target="_blank" rel="noreferrer noopener" :aria-label="t('about.github', { author: 'Lucas de Oliveira Neitzke' })" :title="t('about.github', { author: 'Lucas de Oliveira Neitzke' })">
                  <FontAwesomeIcon :icon="['fab', 'github']" />
                </a>
              </strong>
              <span>{{ t('about.server') }}</span><strong>{{ t('about.serverValue') }}</strong>
            </div>
            <p class="about-note">{{ t('about.note') }}</p>
          </section>
        </template>
      </main>
    </div>

    <div v-if="envModalOpen" class="modal-backdrop" @click.self="closeEnvEditor()">
      <div class="modal-panel" role="dialog" aria-modal="true" :aria-label="t('modal.envTitle')">
        <header class="modal-header">
          <h2>{{ t('modal.envTitle') }}</h2>
          <button type="button" class="icon-button" :aria-label="t('modal.cancel')" :title="t('modal.cancel')" @click="closeEnvEditor()">
            <FontAwesomeIcon :icon="['fas', 'xmark']" />
          </button>
        </header>
        <p class="modal-description">{{ t('modal.envDescription') }}</p>
        <textarea v-model="envDraft" class="env-textarea" spellcheck="false" autocomplete="off" rows="18"></textarea>
        <footer class="modal-actions">
          <button type="button" class="button button-outline" :disabled="store.pending.environment" @click="closeEnvEditor()">
            {{ t('modal.cancel') }}
          </button>
          <button type="button" class="button button-primary" :disabled="store.pending.environment" @click="saveEnvEditor()">
            <span v-if="store.pending.environment" class="spinner button-spinner"></span>
            {{ store.pending.environment ? t('modal.saving') : t('modal.saveRestart') }}
          </button>
        </footer>
      </div>
    </div>
  </div>
</template>
