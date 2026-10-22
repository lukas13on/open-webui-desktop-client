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

- `electron/`: ciclo de vida do backend, escolha de porta, configuração criptografada, sincronização de atualizações e API IPC com preload isolado. A janela do servidor é `frame: false` e usa duas `WebContentsView`: a barra de título (`webui-titlebar.html` + `preload-webui.ts`, 52 px) e a aplicação Open Web UI logo abaixo. Como o app roda em uma view própria, ele recebe um viewport já descontado da barra — sem CSS injetado, preservando `100vh`, elementos `fixed`/`sticky` e popovers. O menu fica oculto e os atalhos de recarregar/DevTools são registrados em `before-input-event` na view do app.
- `ui/`: SPA Vue com navegação, configurações, bandeja, estados de carregamento e visão dos commits pendentes.
- `backend/`: clone do fork do servidor Open Web UI.
- `lib/python/`: runtime embeddable e dependências preparadas localmente (ignorados pelo Git).
- `scripts/`: automação de preparação e empacotamento.

Configuração pública e dados ficam em `%APPDATA%\openwebui-desktop`; o arquivo de variáveis de ambiente é binário e protegido por `safeStorage`/DPAPI no Windows. O processo Python é iniciado oculto, escuta somente em loopback e é encerrado com a árvore de processos ao sair.

A preferência `hideDesktopOnOpen` (padrão `true`, exibida como **Fechar o Open Web UI Desktop automaticamente ao abrir o Open Web UI**) faz a janela de gerenciamento ser ocultada para a bandeja em qualquer caminho que abra a janela do servidor; é gravada em `config.json` via IPC `config:hide-desktop-on-open`, sem reiniciar o backend.

## Testes

`npm test` executa os testes Vitest de resolução de portas. Execute `npm run build` para validar os bundles UI e Electron. Consulte o [guia do usuário](docs/index.md) para instalação, cofre, provedores e solução de problemas.
