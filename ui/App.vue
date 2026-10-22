<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useAppStore, type Page } from './stores/app';

const store = useAppStore();
const showKey = ref(false);
const newKey = ref('OPENROUTER_API_KEY');
const newValue = ref('');
const windowAction = ref<'' | 'minimize' | 'maximize' | 'close'>('');
const pages: Array<{ id: Page; title: string; icon: string }> = [
  { id: 'home', title: 'Visão geral', icon: '⌂' },
  { id: 'settings', title: 'Configurações', icon: '⚙' },
  { id: 'updates', title: 'Atualizações', icon: '↻' },
  { id: 'help', title: 'Sobre', icon: 'ⓘ' }
];
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
onUnmounted(() => unsubscribers.forEach((unsubscribe) => unsubscribe()));

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

function addVariable(): void {
  const key = newKey.value.trim();
  if (key !== 'OPENROUTER_API_KEY') { store.error = 'Somente a chave OPENROUTER_API_KEY é permitida.'; return; }
  if (/[\0\r\n]/.test(newValue.value)) { store.error = 'A chave não pode conter quebras de linha.'; return; }
  if (!newValue.value) { store.error = 'Informe o valor da variável.'; return; }
  store.config.environment = { ...store.config.environment, [key]: newValue.value };
  newValue.value = '';
  store.error = '';
}

async function confirmUpdate(): Promise<void> {
  if (store.pending.applyUpdate) return;
  const count = store.commits.length;
  if (!window.confirm(`Instalar ${count} atualização(ões) do servidor? O servidor será reiniciado.`)) return;
  await store.applyUpdate();
}
</script>

<template>
  <div class="app-shell">
    <header class="titlebar">
      <div class="brand-lockup"><span class="brand-mark">W</span><span>Open Web UI <b>Desktop</b></span><span class="status-pill" :class="{ inactive: !store.backendReady }"><i></i> {{ store.pending.restart ? 'Reiniciando…' : store.backendReady ? 'Servidor ativo' : 'Servidor indisponível' }}</span></div>
      <div class="window-actions" aria-label="Controles da janela">
        <button aria-label="Minimizar" title="Minimizar" :disabled="store.pending.window" @click="runWindowAction('minimize')"><span v-if="windowAction === 'minimize'" class="spinner window-spinner"></span><template v-else>—</template></button>
        <button :aria-label="store.windowMaximized ? 'Restaurar' : 'Maximizar'" :title="store.windowMaximized ? 'Restaurar' : 'Maximizar'" :disabled="store.pending.window" @click="runWindowAction('maximize')"><span v-if="windowAction === 'maximize'" class="spinner window-spinner"></span><template v-else>{{ store.windowMaximized ? '❐' : '□' }}</template></button>
        <button class="close-window" aria-label="Ocultar janela" title="Ocultar janela" :disabled="store.pending.window" @click="runWindowAction('close')">×</button>
      </div>
    </header>

    <div class="layout">
      <aside class="sidebar">
        <div class="side-label">WORKSPACE</div>
        <nav aria-label="Navegação principal">
          <button v-for="item in pages" :key="item.id" class="nav-item" :class="{ active: store.page === item.id }" @click="store.page = item.id"><span class="nav-icon">{{ item.icon }}</span>{{ item.title }}<span v-if="item.id === 'updates' && store.commits.length" class="nav-count">{{ store.commits.length }}</span></button>
        </nav>
        <div class="sidebar-bottom"><span class="avatar">OW</span><div class="profile"><strong>Open Web UI</strong><span>Desktop · Windows</span></div><span class="online-dot"></span></div>
      </aside>

      <main class="main-content">
        <div v-if="store.overlayVisible" class="loading-overlay" role="status"><span class="spinner large"></span><strong>Carregando</strong><span>{{ store.updateRunning ? 'Atualizando servidor…' : 'Aguarde um momento' }}</span></div>
        <div v-if="store.error" class="toast-error" role="alert"><span>!</span>{{ store.error }}<button aria-label="Fechar aviso" @click="store.error = ''">×</button></div>

        <template v-if="store.page === 'home'">
          <div class="page-heading"><div><div class="eyebrow">SEU ESPAÇO DE TRABALHO</div><h1>Bem-vindo ao Open Web UI</h1><p>Seu ambiente de IA, local e privado no Windows.</p></div><button class="button button-primary" :disabled="!store.backendReady || store.serverBusy || store.pending.openWebUI" @click="store.openWebUI()"><span v-if="store.pending.openWebUI" class="spinner button-spinner"></span><span v-else>↗</span> {{ store.pending.openWebUI ? 'Abrindo…' : 'Abrir Open Web UI' }}</button></div>
          <section class="welcome-card"><div class="welcome-copy"><span class="welcome-tag"><span class="online-dot"></span> AMBIENTE PRONTO</span><h2>Suas conversas.<br /><span>Seu controle.</span></h2><p>Acesse sua interface de IA hospedada localmente e conecte seus provedores de modelos favoritos em um só lugar.</p><button class="button button-light" :disabled="!store.backendReady || store.serverBusy || store.pending.openWebUI" @click="store.openWebUI()"><template v-if="store.pending.openWebUI"><span class="spinner button-spinner dark-spinner"></span> Abrindo…</template><template v-else>Iniciar conversa <span>→</span></template></button></div><div class="welcome-art" aria-hidden="true"><div class="art-orbit orbit-one"></div><div class="art-orbit orbit-two"></div><div class="art-glow"></div><div class="art-core">✳</div><span class="art-chip chip-one">●&nbsp; Privado por padrão</span><span class="art-chip chip-two">◈&nbsp; Executado localmente</span></div></section>
          <div class="section-heading"><div><h2>Acesso rápido</h2><p>Gerencie seu servidor e ambiente de IA.</p></div></div>
          <div class="quick-grid">
            <button class="quick-card" @click="store.page = 'settings'"><span class="quick-icon">⚙</span><span class="quick-title">Configurar provedores</span><span class="quick-description">Adicione suas chaves de API com segurança.</span><span class="quick-arrow">→</span></button>
            <button class="quick-card" :disabled="store.pending.checkUpdates || store.updateRunning" @click="store.checkUpdates()"><span class="quick-icon"><span v-if="store.pending.checkUpdates" class="spinner icon-spinner"></span><template v-else>↻</template></span><span class="quick-title">{{ store.pending.checkUpdates ? 'Verificando atualizações…' : 'Verificar atualizações' }}</span><span class="quick-description">Confira as novidades do servidor.</span><span class="quick-arrow">→</span></button>
            <button class="quick-card" :disabled="store.serverBusy || store.pending.openWebUI" @click="store.restartServer()"><span class="quick-icon"><span v-if="store.pending.restart" class="spinner icon-spinner"></span><template v-else>⟳</template></span><span class="quick-title">{{ store.pending.restart ? 'Reiniciando servidor…' : 'Reiniciar servidor' }}</span><span class="quick-description">Reinicie seu ambiente local de IA.</span><span class="quick-arrow">→</span></button>
          </div>
          <footer class="page-footer"><span><i class="online-dot"></i> Seu servidor está rodando localmente</span><span>Porta {{ store.config.backendPort }} <span class="footer-separator">·</span> Seus dados permanecem neste dispositivo</span></footer>
        </template>

        <template v-else-if="store.page === 'settings'">
          <div class="page-heading"><div><div class="eyebrow">PREFERÊNCIAS</div><h1>Configurações</h1><p>Configure a porta do servidor e os provedores de IA.</p></div></div>
          <section class="settings-card"><div class="card-heading"><div class="quick-icon">⌘</div><div><h2>Servidor local</h2><p>Preferências do servidor Open Web UI.</p></div></div><label class="field-label" for="port">Porta de execução</label><div class="field-row"><input id="port" v-model.number="store.config.backendPort" class="text-field port-input" type="number" min="1" max="65535" /><span class="field-hint">Padrão: 3301 · aplica ao reiniciar</span></div><p class="field-help">Quando a porta definida estiver ocupada, você poderá escolher uma alternativa disponível. Salvar reinicia o servidor para aplicar as alterações.</p></section>
          <section class="settings-card"><div class="card-heading"><div class="quick-icon">▭</div><div><h2>Comportamento da janela</h2><p>Defina como o Open Web UI Desktop se comporta ao abrir o servidor.</p></div></div><button type="button" class="switch-row" role="switch" :aria-checked="store.config.hideDesktopOnOpen" :disabled="store.pending.preference" @click="store.setHideDesktopOnOpen(!store.config.hideDesktopOnOpen)"><span class="switch-copy"><strong>Fechar o Open Web UI Desktop automaticamente ao abrir o Open Web UI</strong><span>Vale para qualquer atalho que abra o servidor (bandeja ou tela inicial). O desktop continua em execução na bandeja do Windows e volta ao clicar no ícone.</span></span><span class="switch" :class="{ on: store.config.hideDesktopOnOpen, busy: store.pending.preference }" aria-hidden="true"><span v-if="store.pending.preference" class="spinner switch-spinner"></span><span v-else class="switch-knob"></span></span></button></section>
          <section class="settings-card"><div class="card-heading"><div class="quick-icon">◇</div><div><h2>Credenciais OpenRouter</h2><p>Use somente o modelo <code>openai/gpt-6-luna-pro</code>. A chave nunca é lida de volta para a interface.</p></div></div><div v-if="Object.keys(store.config.environment).length" class="variable-list"><div v-for="(value, key) in store.config.environment" :key="key" class="variable-row"><div><strong>{{ key }}</strong><span>Configurada · protegida com DPAPI</span></div><button class="remove-button" :aria-label="`Remover ${key}`" @click="delete store.config.environment[key]">×</button></div></div><div class="field-row variable-form"><input v-model="newKey" class="text-field" placeholder="OPENROUTER_API_KEY" aria-label="Nome da variável" readonly /><input v-model="newValue" class="text-field" type="password" placeholder="Valor secreto" aria-label="Valor da variável" @keydown.enter="addVariable" /><button class="button button-outline" @click="addVariable">Adicionar</button></div><div class="card-actions"><span>Salvar reinicia o servidor; credenciais são injetadas apenas em memória.</span><button class="button button-primary" :disabled="store.pending.save" @click="store.saveConfig()"><span v-if="store.pending.save" class="spinner button-spinner"></span>{{ store.pending.save ? 'Salvando…' : 'Salvar configurações' }}</button></div></section>
        </template>

        <template v-else-if="store.page === 'updates'">
          <div class="page-heading"><div><div class="eyebrow">MANTENHA-SE ATUALIZADO</div><h1>Atualizações</h1><p>Novidades e melhorias para seu servidor Open Web UI.</p></div><button class="button button-outline" :disabled="store.pending.checkUpdates || store.updateRunning" @click="store.checkUpdates()"><span v-if="store.pending.checkUpdates" class="spinner button-spinner"></span><span v-else>↻</span> {{ store.pending.checkUpdates ? 'Verificando…' : 'Verificar novamente' }}</button></div>
          <section class="settings-card updates-card"><template v-if="store.commits.length"><div class="updates-heading"><span class="update-badge">{{ store.commits.length }} disponível{{ store.commits.length === 1 ? '' : 'is' }}</span><h2>O que há de novo</h2><p>Revise as alterações antes de atualizar o servidor.</p></div><div class="commit-list"><div v-for="commit in store.commits" :key="commit.hash" class="commit-row"><span class="commit-mark">✓</span><span class="commit-hash">{{ commit.hash }}</span><span class="commit-subject">{{ commit.subject }}</span></div></div><div class="card-actions"><span>O servidor será encerrado e reiniciado durante a atualização.</span><button class="button button-primary" :disabled="store.pending.applyUpdate || store.updateRunning" @click="confirmUpdate()"><span v-if="store.pending.applyUpdate || store.updateRunning" class="spinner button-spinner"></span>{{ store.pending.applyUpdate || store.updateRunning ? 'Instalando…' : 'Instalar atualizações' }}</button></div></template><div v-else class="empty-state"><span class="empty-icon">✓</span><h2>{{ store.error ? 'Não foi possível verificar' : 'Você está em dia' }}</h2><p>{{ store.error || 'Nenhuma atualização pendente foi encontrada para o servidor.' }}</p><button class="button button-outline" :disabled="store.pending.checkUpdates || store.updateRunning" @click="store.checkUpdates()"><span v-if="store.pending.checkUpdates" class="spinner button-spinner"></span>{{ store.pending.checkUpdates ? 'Verificando…' : 'Verificar novamente' }}</button></div></section>
          <p class="update-note">As atualizações modificam somente os arquivos do servidor. O cliente desktop não é atualizado por este mecanismo.</p>
        </template>

        <template v-else>
          <div class="page-heading"><div><div class="eyebrow">SOBRE O APLICATIVO</div><h1>Open Web UI Desktop</h1><p>Uma experiência nativa para seu ambiente Open Web UI.</p></div></div><section class="settings-card about-card"><div class="about-logo">W</div><h2>Open Web UI Desktop</h2><p>Aplicativo desktop para Windows 10 e 11.</p><div class="about-details"><span>Versão</span><strong>1.0.0</strong><span>Autor</span><strong>Lucas de Oliveira Neitzke</strong><span>Servidor</span><strong>Open Web UI Server</strong></div><p class="about-note">Seus dados e credenciais são armazenados neste dispositivo.</p></section>
        </template>
      </main>
    </div>
  </div>
</template>
