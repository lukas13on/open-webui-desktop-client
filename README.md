# Open Web UI Desktop

Camada desktop Windows nativa para o fork do servidor [open-webui-desktop-server](https://github.com/lukas13on/open-webui-desktop-server). O cliente usa Electron, Vue 3, TypeScript, Vite e Pinia; o servidor original fica em `backend/`. O aplicativo exige Windows 10/11 x64 e elevação de administrador.

## Requisitos

- Windows x64 para executar o aplicativo desktop.
- Node.js 22.12+ e npm para desenvolvimento/build do cliente.
- Python embeddable x64 e dependências do servidor dentro de `lib/python` para iniciar o backend empacotado.
- Internet durante a preparação/instalação das dependências e para consultar atualizações do servidor.

## Preparar ambiente

```powershell
npm install
./scripts/prepare-python.ps1
```

O script prepara Python 3.11 embeddable x64 e instala os requisitos fixados pelo fork; ao final, valida os imports do servidor. Use wheels binários para as dependências nativas. Execute-o novamente após atualizar o código/requisitos do backend.

O frontend do servidor (interface de chat) não é versionado no fork. Os comandos `package:*` executam `scripts/prepare-backend.ps1`, que instala as dependências do frontend (`npm ci`, sem o binário do Cypress) e roda `vite build` em `backend/build`. O primeiro build leva alguns minutos, exige internet e usa heap maior do Node (`--max-old-space-size=8192`); builds seguintes são ignorados enquanto `backend/build/index.html` existir. Use `./scripts/prepare-backend.ps1 -Force` para recompilar. O hook `prebuild` do fork valida artefatos vendorizados com caminhos POSIX e falha em checkouts Windows com CRLF, por isso apenas o build do Vite é executado.

Para desenvolvimento, é possível usar um Python instalado localmente definindo `DESKTOP_PYTHON` para o executável. Instale `backend/backend/requirements.txt` nesse ambiente antes de iniciar. Em seguida execute `npm run dev`. O cliente inicia o Vite e o Electron; o processo backend é iniciado pelo Electron e servido localmente na porta 3301. O navegador da aplicação carrega o servidor após o health check.

## Scripts

| Comando | Ação |
| --- | --- |
| `npm run dev` | Executa o Vite e o aplicativo Electron. |
| `npm test` | Executa os testes unitários Vitest. |
| `npm run build` | Compila a SPA e o processo principal/preload Electron. |
| `npm run package:dev` | Compila SPA e Electron, prepara o frontend do servidor, cria `release/win-unpacked`, espelha `lib` para os recursos, valida o runtime Python empacotado, cria a pasta/arquivo de dados se necessário e inicia o executável de teste. |
| `npm run package:win` | Remove o atributo Read-only dos metadados Git e produz instalador NSIS. |
| `npm run package:win:clean` | Remove a saída anterior (inclusive o atributo Read-only) e gera um novo instalador. |
| `npm run package:msix` | Produz pacote AppX/MSIX (configurar publisher e certificado reais para distribuição). |
| `./scripts/prepare-backend.ps1` | Compila o frontend do Open Web UI em `backend/build` quando ainda não existir (`-Force` recompila). |
| `./scripts/build-installer.ps1 -Target nsis` | Verifica o Python embarcado e empacota o instalador. |

`package:win` e `package:msix` invocam electron-builder. `package:dev` empacota o aplicativo em `release/win-unpacked` sem criar instalador, espelha o Python preparado de `lib` para `resources/lib` com `robocopy /MIR`, executa um teste de importação do servidor usando o runtime já empacotado e só então inicia o app com `OPENWEBUI_DESKTOP_PATH` definido apenas para esse processo. Para uma distribuição MSIX assinada, substitua os metadados de publicador de exemplo pelos valores provisionados pela Microsoft Store e assine conforme as exigências da loja. O runtime embeddable e o backend são empacotados localmente; a consulta/atualização explícita do fork NSIS usa Git for Windows instalado. A Store distribui atualizações pelo próprio MSIX e não substitui código empacotado em runtime.

## Arquitetura

- `electron/`: ciclo de vida do backend, escolha de porta, configuração criptografada, sincronização de atualizações e API IPC com preload isolado. A janela do servidor é `frame: false` e usa duas `WebContentsView`: a barra de título (`webui-titlebar.html` + `preload-webui.ts`, 52 px) e a aplicação Open Web UI logo abaixo. Como o app roda em uma view própria, ele recebe um viewport já descontado da barra — sem CSS injetado, preservando `100vh`, elementos `fixed`/`sticky` e popovers. O menu fica oculto e os atalhos de recarregar/DevTools são registrados em `before-input-event` na view do app. `languages.ts` concentra os códigos suportados e o mapeamento de locale; `i18n.ts` guarda as mensagens de bandeja, diálogos e barra do servidor. `paths.ts` resolve os diretórios de instalação/recursos e os caminhos de `.env`, `.env.example`, banco e Python; `env-file.ts` lê, valida e serializa o `.env`; `environment-service.ts` semeia o arquivo a partir do exemplo, grava alterações e aplica o reset de configurações persistidas.
- `ui/`: SPA Vue com navegação, configurações, bandeja, estados de carregamento e visão dos commits pendentes. `ui/i18n/` contém os dicionários (pt-BR, en-US, es-ES), o runtime `t()` e os ícones de bandeira; os ícones usam Font Awesome via `@fortawesome/vue-fontawesome`. `ui/providers.ts` mantém o catálogo de provedores compatíveis com a API OpenAI usado pelo Assistente de configuração.
- `backend/`: clone do fork do servidor Open Web UI.
- `lib/python/`: runtime embeddable e dependências preparadas localmente (ignorados pelo Git).
- `scripts/`: automação de preparação e empacotamento.

Configuração pública e dados ficam em `%APPDATA%\openwebui-desktop`; o arquivo de segredos internos do servidor é binário e protegido por `safeStorage`/DPAPI no Windows. As credenciais de provedores podem ser configuradas dentro do próprio Open Web UI ou no arquivo `.env` do servidor, editado pelo cliente ou pelo Assistente de configuração. O processo Python é iniciado oculto, escuta somente em loopback e é encerrado com a árvore de processos ao sair.

### Variáveis de ambiente do servidor

O cliente lê e grava `backend\.env` (na raiz do checkout do fork, ao lado de `backend\backend`), criando-o a partir de `backend\.env.example` quando ausente. `env-file.ts` concentra o parser (`KEY='valor'`, comentários e linhas vazias preservados), a serialização e a validação; `applyEnvEntries` substitui a lista inteira (a lista da UI é autoritativa) e `mergeEnvEntries` mescla, usado ao semear a partir do exemplo e ao restaurar padrões. A edição bruta passa por `validateRawEnv`, que lança `EnvValidationError` com o número da linha inválida.

O `childEnv` do `backend-manager.ts` injeta apenas `WEBUI_SECRET_KEY`, `WEBUI_JWT_SECRET_KEY`, `DATA_DIR`, `USE_SLIM_DOCKER`, `HOST` e `PORT`. Overrides de provedores (`OPENAI_API_BASE_URL`, `OPENAI_API_KEY` e equivalentes) foram removidos: o `dotenv` do fork não sobrescreve variáveis já presentes no ambiente, então qualquer valor forçado pelo cliente anularia o `.env`.

O fork persiste algumas configurações no SQLite (`data\webui.db`) e as semeia apenas quando ausentes. Para que uma variável alterada tenha efeito, `environment-service.ts` mantém um conjunto de chaves pendentes por variável alterada (`PERSISTED_CONFIG_KEYS`) e, com o backend parado dentro de `restart()`, executa um script Python com o `sqlite3` embutido para apagar essas linhas antes do novo start — por exemplo `openai.api_base_urls`/`openai.api_configs` para `OPENAI_API_BASE_URL` e `openai.api_keys` para `OPENAI_API_KEY`.

Preferências persistidas em `config.json`: `backendPort`, `windowMaximized`, `hideDesktopOnOpen` (padrão `true`), `launchAtLogin` (padrão `false`) e `language` (padrão `auto`). `hideDesktopOnOpen` e `launchAtLogin` são aplicadas por IPC dedicado (`config:hide-desktop-on-open` e `config:launch-at-login`) sem reiniciar o backend; “Iniciar com o Windows” usa `app.setLoginItemSettings` e só tem efeito em builds empacotados. `language` é aplicada por `config:language`, que salva a preferência e reinicia o Electron e o servidor (`app.relaunch()`), pois o idioma afeta também a bandeja e os diálogos nativos.

### Idioma

`auto` resolve o idioma por `app.getPreferredSystemLanguages()` (com `app.getLocale()` como reserva) e cai em inglês quando o locale do sistema não é suportado. A detecção do renderer usa `navigator.languages` apenas como valor inicial, antes da configuração carregar. O idioma resolvido é enviado ao renderer como `resolvedLanguage` em `config:get`.

### Ícones

Os ícones vêm de `@fortawesome/free-solid-svg-icons` e `@fortawesome/free-brands-svg-icons`, registrados uma única vez em `ui/main.ts` e renderizados com `<FontAwesomeIcon :icon="['fas', 'nome']" />`. O CSS do Font Awesome é importado ali e `config.autoAddCss = false` evita injeção duplicada. A barra da janela do servidor é HTML estático com CSP restritiva, então usa os mesmos caminhos SVG embutidos diretamente em `webui-titlebar.html` (sem carregar a fonte). Bandeiras vêm de `flag-icons`, mas apenas os três SVG suportados são importados por `ui/i18n/flags.ts` — importar o CSS da biblioteca empacotaria todos os países.

## Testes

`npm test` cobre a resolução de portas, o parser/serializador do `.env`, os dicionários de idioma, as preferências de idioma e o catálogo de provedores (`ui/providers.test.ts`). Execute `npm run build` para validar os bundles UI e Electron. Consulte o [guia do usuário](docs/index.md) para instalação, idioma, comportamento da janela, variáveis de ambiente, provedores e solução de problemas.
