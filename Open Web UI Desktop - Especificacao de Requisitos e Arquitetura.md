# **Especificação de Requisitos e Arquitetura de Software**

# **Open Web UI Desktop**

**Plataforma Alvo:** Microsoft Windows 10 / 11 (x64)  
**Natureza do Projeto:** Fork do repositório Open Web UI com adição de camada Desktop nativa e independente.

---

## **Meta Informações do Projeto**

| Parâmetro | Especificação |
| :---- | :---- |
| **Nome do Projeto** | Open Web UI Desktop |
| **Autor** | Lucas de Oliveira Neitzke |
| **Arquitetura Base** | Electron.js \+ Vue.js 3 (Frontend) / Python Embeddable \+ FastAPI (Backend) |
| **Padrão de Distribuição** | Inno Setup (`.exe`) / Microsoft Store (`.msix`) |
| **Segurança de Credenciais** | DPAPI via `safeStorage` (Electron) |

---

# **1\. Visão Geral do Sistema**

O **Open Web UI Desktop** é uma solução desktop nativa desenvolvida para empacotar, gerenciar e disponibilizar a interface do Open Web UI no sistema operacional Windows. A aplicação opera de forma autônoma, silenciosa e sem dependência de runtimes ou pacotes instalados globalmente no SO host. O sistema gerencia o ciclo de vida completo do servidor backend em Python (Uvicorn/FastAPI) e disponibiliza uma interface gráfica moderna baseada em Electron.js e Vue.js 3 com carregamento em janela sem bordas nativas.

---

# **2\. Requisitos Arquiteturais e Princípios de Design**

## **2.1. Paradigmas e Padrões de Arquitetura**

* **Domain-Driven Design (DDD):** Separação estrita de responsabilidades entre domínio de negócio (gestão de portas, criptografia, sincronização), infraestrutura (interação com SO, processos, arquivos em disco) e apresentação (UI Vue.js).  
* **SOLID & Clean Code:** Baixo acoplamento e alta coesão em todos os módulos da aplicação.  
* **Design Patterns:**  
  * **Singleton:** Aplicado nos gerenciadores de ciclo de vida e processos (`BackendManager`, `ConfigStore`, `UpdateManager`).  
  * **Observer / EventBus:** Comunicação assíncrona desacoplada por eventos (`publish/subscribe`) entre o processo principal do Electron e a camada de renderização da UI.  
  * **Strategy:** Resolução dinâmica e seleção de portas alternativas em caso de conflitos de rede.

## **2.2. Arquitetura de Pastas e Separação de Responsabilidades**

* **`backend/`:** Repositório fork contendo o código-fonte original do Open Web UI.  
* **`electron/`:** Camada do processo principal Node.js/Electron. Isola scripts de gerenciamento de processo, ponte de contexto IPC (`contextBridge`), manipuladores do sistema de arquivos e configurações.  
* **`ui/`:** Aplicação Single Page Application (SPA) desacoplada construída com Vue.js 3, Vite.js e TypeScript.  
* **`lib/`:** Diretório isolado contendo o ambiente de execução Python Embeddable (x64) e todas as dependências/bibliotecas Python necessárias salvas em `site-packages`.  
* **`scripts/`:** Scripts de automação para orquestração de ambiente de desenvolvimento, limpeza e preparação de builds.  
* **`docs/`:** Documentação técnica de arquitetura e guias de instalação/operação do usuário.

---

# **3\. Requisitos Funcionais**

## **3.1. Gerenciamento do Servidor Backend**

* **Inicialização Silenciosa:** O processo backend deve ser iniciado como um sub-processo omitindo qualquer janela de console do sistema operacional (`windowsHide: true`).  
* **Verificação de Health Check:** O Electron deve aguardar a resposta da porta HTTP via socket antes de exibir a janela principal do aplicativo ao usuário.  
* **Gerenciamento de Porta (Cicada 3301):**  
  * A porta padrão inicial de execução é a **3301**.  
  * Caso a porta 3301 esteja ocupada, o sistema deve detectar o conflito e exibir diálogo permitindo buscar uma porta alternativa ou encerrar a sessão existente.  
  * Em caso de busca alternativa, o sistema deve varrer e alocar uma porta disponível dentro dos intervalos **3100-3999** ou **4100-4999**.  
* **Encerramento Forçado:** Ao fechar a aplicação pelo menu ou bandeja do sistema, todos os processos da árvore do Python/Uvicorn devem ser encerrados sumariamente para evitar processos órfãos.

## **3.2. Menu da Bandeja do Sistema (System Tray)**

O menu de contexto na barra de tarefas do Windows deve dispor das seguintes opções:

1. **Abrir Open Web UI:** Traz a janela do aplicativo para o primeiro plano.  
2. **Reiniciar:** Executa a reinicialização forçada do servidor Python e do processo do Electron. Deve ser desabilitado visualmente durante processos de atualização.  
3. **Procurar Atualizações:** Inicia a verificação e sincronização de alterações com a branch principal (`main`) do repositório upstream da biblioteca/fork do Open Web UI.  
4. **Configurações:** Abre a janela de configurações e preferências.  
5. **Ajuda:** Abre modal ou tela de créditos exibindo a versão e o nome do autor (*Lucas de Oliveira Neitzke*).  
6. **Sair:** Desliga o servidor backend e fecha a aplicação Electron de forma garantida.

## **3.3. Mecanismo de Atualização da Lib/Fork**

* **Foco de Atualização:** Aplica-se exclusivamente ao código e dependências do repositório do servidor Open Web UI (a atualização do cliente desktop está fora deste escopo).  
* **Bloqueio de Interface:** Durante a atualização, a interface deve exibir uma tela de bloqueio com spinner e a mensagem "Carregando", impedindo navegação.  
* **Exibição de Commits Pendentes:** Antes de confirmar a atualização, o sistema deve consultar os commits pendentes via Git e exibir a lista resumida na tela para confirmação do usuário.  
* **Encerramento Prévio do Servidor:** O servidor Python deve ser desativado antes de qualquer alteração de arquivo no disco.  
* **Tratamento de Interrupção Forçada:**  
  * Se o usuário solicitar a opção "Sair" durante uma atualização, um alerta deve informar os riscos. Se o encerramento for confirmado, uma flag de estado corrompido é gravada no disco.  
  * Na inicialização subsequente, ao detectar a flag de interrupção, o sistema deve solicitar permissão ao usuário para executar uma "Atualização Limpa" (exclusão total da pasta da biblioteca e nova clonagem/sincronização).

## **3.4. Gestão de Variáveis de Ambiente e Cofre Criptografado**

* **Interface Dinâmica:** A tela de configurações deve fornecer um formulário de par chave/valor para adição, edição e remoção de variáveis de ambiente arbitrárias (ex: chaves de API da OpenAI, Anthropic, tokens e configurações de rede).  
* **Criptografia em Disco (DPAPI):**  
  * Para mitigar o roubo de credenciais por softwares maliciosos na máquina do usuário, os dados sensíveis não podem ser salvos em texto claro.  
  * O arquivo de variáveis de ambiente deve ser encriptado via **Windows Data Protection API (DPAPI)** através do módulo `safeStorage` do Electron e salvo em formato binário em `%APPDATA%/openwebui-desktop/`.  
  * As variáveis são descriptografadas exclusivamente em memória RAM e injetadas diretamente no ambiente do processo filho (`spawn`) do Python.

---

# **4\. Requisitos Não Funcionais e Especificações Técnicas**

## **4.1. Elevação de Privilégios (Administrador)**

* O aplicativo exige execução sob privilégios de Administrador no Windows.  
* A instalação via setup deve configurar a camada de compatibilidade no Registro do Windows (`~ RUNASADMIN`) para o atalho da Área de Trabalho.  
* O aplicativo Electron deve verificar na inicialização se está rodando como Administrador; caso contrário, deve exibir caixa de diálogo informativa e encerrar a execução.

## **4.2. Persistência de Dados e Configurações**

* O arquivo de configuração principal (`config.json`) e os diretórios de dados dinâmicos, bancos de dados SQLite e caches de modelos devem residir obrigatoriamente no perfil do usuário: `%APPDATA%/openwebui-desktop/`.

## **4.3. Interface Gráfica, Design System e Usabilidade**

* **Framework:** Vue.js 3 (Composition API com `<script setup>`), TypeScript e Vite.js.  
* **Gerenciamento de Estado:** Pinia (com arquitetura de Slices) e EventBus desacoplado.  
* **Estilização:** Tailwind CSS utilizando a paleta de cores baseada em **Indian Red Moderno** (`#D94F55`) combinado com tons de **Cinza Escuro** (`#0F0F11`, `#18181B`).  
* **Janela Frameless:** Ausência de moldura padrão do SO. Implementação de barra de título customizada (`Titlebar`) contendo botões estilizados para Minimizar, Expandir/Restaurar e Fechar.  
* **Feedback de Estado (Loading & Disabled):** Todos os botões de ação assíncrona devem apresentar estado `disabled` visual e indicador gráfico de Spinner acompanhado do texto "Carregando" durante o processamento.

---

# **5\. Estratégias de Empacotamento e Distribuição**

## **5.1. Instalador Clássico (`Setup.exe` via Inno Setup)**

* Compilação dos ativos Electron/Vite e inclusão da pasta `/lib` pré-configurada de forma 100% embarcada e autossuficiente (operação offline no cliente).  
* **Variável de Ambiente do Sistema:** Criação e manutenção da variável de sistema `OPENWEBUI_DESKTOP_PATH` apontando para o diretório de instalação selecionado (padrão: `%ProgramFiles%/Open Web UI Desktop`).  
* **Verificação de Reinstalação:**  
  * O instalador consulta o valor prévio de `OPENWEBUI_DESKTOP_PATH`. Se o novo caminho for diferente, atualiza o valor da variável e exibe mensagem ao final alertando que a instalação anterior não é mais segura e deve ser removida.  
  * O desinstalador oficial (`unins000.exe`) remove a variável de ambiente do sistema operacional na desinstalação.

## **5.2. Distribuição via Microsoft Store (MSIX)**

* Suporte ao empacotamento em formato **MSIX** através do `electron-builder`.  
* Atendimento às diretrizes do **Windows App Certification Kit (WACK)**: Todos os executáveis, interpretador Python e bibliotecas (`/lib`) devem estar rigorosamente contidos e empacotados dentro do pacote MSIX assinado, sem realizar downloads de código ou scripts em tempo de execução.

---

# **6\. Qualidade, Testes e Manutenibilidade**

* **Testes Unitários de Código:** Implementação com **Vitest** para validação das regras de negócio de domínio (resolução de portas, lógica de criptografia e gerenciadores de atualização).  
* **Testes de Componentes e UI:** Cobertura de componentes Vue 3 com `@vue/test-utils` e Vitest.  
* **Testes End-to-End (E2E):** Testes de integração de janela desktop utilizando **Playwright** adaptado para Electron.  
* **Documentação Obrigatória no Repositório:**  
  * `README.md`: Documentação técnica focada em desenvolvedores, comandos de setup de ambiente local e instruções de build.  
  * `docs/index.md`: Guia completo do usuário cobrindo instalação, configuração de portas, uso do cofre de credenciais e procedimentos para conexão de modelos locais (Ollama, Llama.cpp) e externos (OpenAI, Anthropic, Groq).

