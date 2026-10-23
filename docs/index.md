# Guia do usuário — Open Web UI Desktop

O Open Web UI Desktop executa o servidor Open Web UI no seu PC com Windows 10/11 x64 e abre a interface em uma janela própria. A primeira preparação precisa de internet para baixar o Python embeddable e dependências; depois de preparado, o aplicativo e o servidor podem executar localmente sem baixar código em tempo de execução. O backend precisa de um diretório `lib/python` completo; o repositório inclui apenas o código-fonte do servidor.

## Instalação

Use o instalador `OpenWebUIDesktop-<versão>-<arquitetura>.exe` fornecido pelo mantenedor. Ele requer privilégios de administrador e cria o atalho com execução elevada. O instalador define `OPENWEBUI_DESKTOP_PATH` para o diretório escolhido; o desinstalador remove a variável. Para compilar seu próprio instalador, consulte o [README técnico](../README.md). Para testar o executável extraído em desenvolvimento, use `npm run package:dev`; o script prepara `release/win-unpacked`, copia `lib` para `resources/lib`, define `OPENWEBUI_DESKTOP_PATH` só para a execução de teste e inicia o aplicativo. Pacotes Microsoft Store dependem de identidade e certificado do publicador válidos.

## Primeira inicialização

O aplicativo exige Windows x64 e privilégios de administrador, exceto quando instalado pela Microsoft Store. Ele inicia o servidor local, aguarda o health check e só então mostra a interface. O servidor escuta em `127.0.0.1`, acessível apenas localmente. A porta inicial é 3301. Se estiver ocupada, escolha buscar uma porta alternativa (3100–3999 ou 4100–4999) ou sair. A alternativa é selecionada para essa sessão.

O ícone da bandeja oferece abrir Open Web UI em uma janela nativa dedicada, reiniciar, procurar atualizações, configurações, ajuda e sair. Clique com o botão esquerdo no ícone para reabrir a janela de gerenciamento e clique com o botão direito para ver o menu. Fechar a janela de gerenciamento apenas a oculta; use **Sair** no menu para encerrar também a árvore de processos do backend.

A janela do Open Web UI usa o mesmo estilo da janela de gerenciamento: sem bordas nativas e com barra de título própria (marca, nome, indicador “Servidor ativo” e os controles minimizar/maximizar/restaurar/fechar). A barra é arrastável e, ao maximizar, o ícone passa a exibir o estado de restaurar. A interface do Open Web UI é renderizada em uma área separada, já descontada a altura da barra, então menus, popovers e barras laterais mantêm o layout original. O menu do Electron fica oculto, mas os atalhos continuam disponíveis: `F5`/`Ctrl+R` recarregam, `Ctrl+Shift+R` recarrega sem cache e `F12`/`Ctrl+Shift+I` abrem o DevTools em janela separada.

Ações demoradas (abrir o Open Web UI, reiniciar o servidor, salvar configurações e atualizar) mostram um indicador de progresso no próprio botão, que permanece desabilitado até a operação terminar. O indicador de status no topo muda para **Reiniciando…** enquanto o servidor é reiniciado e para **Servidor indisponível** se o backend não estiver pronto.

## Comportamento da janela e inicialização

Em **Configurações → Comportamento da janela** há duas opções, ambas aplicadas imediatamente, sem reiniciar o servidor, e gravadas em `config.json`:

- **“Fechar o Open Web UI Desktop automaticamente ao abrir o Open Web UI”** (ativada por padrão): qualquer atalho que abra o servidor — botão da tela inicial, item da bandeja ou link — oculta a janela do Open Web UI Desktop, deixando apenas a janela do Open Web UI visível. O desktop continua em execução na bandeja do Windows (processo e servidor Python permanecem ativos) e volta ao clicar no ícone da bandeja; use **Sair** no menu para encerrar de fato. Se a janela do Open Web UI falhar ao abrir, o desktop permanece visível para exibir o erro.
- **“Iniciar com o Windows”** (desativada por padrão): registra o aplicativo para iniciar junto com o Windows, mantendo o servidor local disponível na bandeja do sistema. O registro é feito pelo próprio Windows (`app.setLoginItemSettings`) e só é aplicado em instalações empacotadas; no modo de desenvolvimento a preferência fica apenas salva. Em instalações que exigem elevação, o Windows pode solicitar confirmação do UAC na inicialização.

## Idioma

O aplicativo está disponível em **Português (Brasil)**, **Inglês (Estados Unidos)** e **Espanhol (Espanha)**. Em **Configurações → Idioma** há um card próprio com as opções, cada uma identificada pela bandeira do país:

- **Detectar automaticamente** (padrão): usa o idioma do Windows obtido pelo Electron (`app.getPreferredSystemLanguages()`, com `app.getLocale()` como reserva). Locales regionais são aproximados — por exemplo, `pt-PT` usa português do Brasil e `es-MX` usa espanhol da Espanha — e idiomas não suportados caem em inglês. A opção mostra qual idioma do sistema foi detectado.
- As três opções fixas permitem escolher o idioma independentemente do Windows.

**Alterar o idioma reinicia o aplicativo e o servidor Open Web UI.** O card exibe esse aviso e, ao confirmar, mostra o estado “Reiniciando…”. A preferência é salva antes do reinício, que também atualiza a bandeja, os diálogos nativos e a barra da janela do servidor.

O idioma atual aparece no rodapé da barra lateral, no formato `Desktop · Windows · Português - Brasil`. O selo verde foi substituído pela bandeira do idioma em uso: clicar nela abre **Configurações** já rolada até o card de idioma, que fica destacado por alguns segundos.

## Provedores e credenciais

As chaves de API e os provedores podem ser configurados de duas formas: dentro do próprio Open Web UI, em **Admin Settings → Connections**, ou pelo arquivo `.env` do servidor (veja **Variáveis de ambiente do servidor** e **Assistente de configuração**). O desktop apenas inicia o servidor e abre a interface; as credenciais ficam no arquivo de ambiente local ou no banco local do servidor e seguem o modelo de permissões do próprio Open Web UI.

O desktop ainda guarda internamente os segredos que ele mesmo gera para o servidor (as chaves `WEBUI_SECRET_KEY` e `WEBUI_JWT_SECRET_KEY`) em `%APPDATA%\openwebui-desktop\environment.dpapi`, protegidos por `safeStorage`/DPAPI, e os injeta apenas em memória ao iniciar o processo Python. Proteja a conta e o dispositivo Windows: DPAPI protege os arquivos em repouso, não contra processos maliciosos executados na mesma conta.

## Conectar modelos locais ou remotos

- **Ollama:** instale e inicie Ollama separadamente. Adicione a URL da conexão e os modelos pelo painel do Open Web UI.
- **Llama.cpp:** execute um servidor compatível com a API OpenAI e configure a URL base em **Admin Settings → Connections** no Open Web UI.
- **OpenRouter:** use o **Assistente de configuração** (o OpenRouter já vem selecionado, com `https://openrouter.ai/api/v1`) ou configure a chave em **Admin Settings → Connections**. O assistente grava `OPENAI_API_BASE_URL` e `OPENAI_API_KEY` no arquivo `.env` do servidor.

Para reduzir o tempo e o tamanho de instalação, a preparação automática usa o conjunto slim de dependências do fork. O desktop não instala nem inicia esses servidores/modelos locais. Para modelos remotos, o provedor recebe as solicitações de inferência de acordo com os termos e a política do provedor.

## Variáveis de ambiente do servidor

Em **Configurações → Servidor local → Variáveis de ambiente** o cliente lê e grava o arquivo `.env` usado pelo servidor (`backend\.env`, ao lado da pasta `backend\backend`). A lista mostra cada variável com nome e valor; valores de chaves de API aparecem ocultos e podem ser revelados pelo botão de olho.

- **Salvar configurações** grava o arquivo com a lista exibida e reinicia o servidor. A lista é autoritativa: variáveis removidas na tela saem do arquivo, e as adicionadas são anexadas ao final.
- **Adicionar**: informe o nome (letras, números e `_`, sem começar por número) e o valor; nomes repetidos são recusados.
- **Editar**: abre um modal com o conteúdo bruto do arquivo em uma área de texto, útil para colar blocos ou manter comentários. **Cancelar** descarta as mudanças; **Salvar configurações e reiniciar** valida o conteúdo, grava e reinicia. Se alguma linha for inválida, o erro indica o número da linha e nada é gravado.
- **Restaurar padrões**: pede confirmação, reescreve o `.env` a partir do `.env.example` do servidor e reinicia. Variáveis que não existem no exemplo são preservadas, e os valores do exemplo substituem os atuais.

O cliente não força mais `OPENAI_API_BASE_URL`, `OPENAI_API_KEY` e equivalentes no processo do servidor — ele injeta apenas o que ele mesmo controla (`DATA_DIR`, host, porta e os segredos internos). Como o `dotenv` do servidor não sobrescreve variáveis já presentes no ambiente, essas chaves precisam vir do arquivo.

O Open Web UI também guarda algumas conexões no banco (`%APPDATA%\openwebui-desktop\data\webui.db`), e valores já gravados têm precedência sobre os padrões lidos do ambiente. Por isso, ao salvar o `.env`, o cliente registra quais variáveis mudaram e, com o servidor parado, remove apenas as linhas correspondentes do banco — por exemplo `openai.api_base_urls`, `openai.api_configs` e `openai.api_keys` para as variáveis `OPENAI_API_*` — para que a próxima inicialização as recrie a partir do arquivo. Conexões criadas manualmente em **Admin Settings → Connections** continuam funcionando normalmente.

## Assistente de configuração

O item **Assistente de configuração** na barra lateral guia a configuração de um provedor compatível com a API OpenAI em três passos: escolher o provedor, informar a chave de API e aplicar. O usuário não precisa conhecer os nomes das variáveis: o assistente escreve `OPENAI_API_BASE_URL` e `OPENAI_API_KEY` no `.env` do servidor.

- **OpenRouter** (padrão, marcado com o selo **Padrão**) usa `https://openrouter.ai/api/v1`.
- **OpenAI** usa `https://api.openai.com/v1`.
- **Groq** usa `https://api.groq.com/openai/v1`.
- **Outro provedor** libera um campo para informar manualmente a URL base; ela precisa começar com `http://` ou `https://`.

O resumo mostra a URL base efetiva e o nome da variável da chave que será gravada. Se o `.env` já tiver uma chave configurada, o assistente avisa que ela será substituída. O botão verde **Aplicar configuração** pede confirmação antes de gravar, informando o provedor escolhido e que o servidor será reiniciado; a partir daí grava as variáveis e reinicia o servidor. Ao concluir, aparece a confirmação “Configuração aplicada e servidor reiniciado.” junto do botão para abrir o Open Web UI. Chaves inválidas ou URLs malformadas são recusadas antes de qualquer gravação.

O assistente não guarda rascunhos: ao sair da página (por qualquer navegação, inclusive pelos atalhos da bandeja), o provedor selecionado volta ao padrão OpenRouter, a URL manual e a chave digitada são descartadas e a confirmação de aplicação desaparece. Assim, ao retornar, a tela sempre reflete apenas o que está gravado no `.env`, e não uma alteração não efetivada.

## Atualizar o servidor

Selecione **Procurar Atualizações** na bandeja. Os commits pendentes são listados antes da confirmação. Quando não há atualizações, a tela mostra **Você está em dia** e, logo abaixo, em cor de destaque, a versão exata do servidor lida de `backend/package.json`. Aplicar atualizações encerra o servidor e sincroniza a branch `main` do fork `lukas13on/open-webui-desktop-server`; os arquivos do cliente Desktop não são alterados por esse mecanismo. No instalador NSIS, o diretório backend Git está incluído no pacote; a atualização requer permissões de administrador e uma instalação gravável. O pacote Microsoft Store não atualiza código em runtime: use a Store para atualizar o aplicativo. Não interrompa o processo durante a sincronização. Se a interrupção for confirmada, a próxima inicialização oferece uma clonagem limpa da pasta backend; faça backup de alterações locais antes de aceitar.

## Dados e solução de problemas

- Configuração do desktop e segredos internos do servidor: `%APPDATA%\openwebui-desktop\config.json` e `environment.dpapi`. O arquivo `config.json` guarda a porta, o estado da janela e as preferências `hideDesktopOnOpen`, `launchAtLogin` e `language`.
- Variáveis de ambiente do servidor: `backend\.env` (na pasta de instalação, ao lado de `backend\backend`). O arquivo é criado a partir de `backend\.env.example` na primeira execução e editado pelo card **Servidor local**.
- Dados, bancos e caches (inclusive credenciais de provedores configuradas no Open Web UI): `%APPDATA%\openwebui-desktop\data`.
- Se o idioma não for o esperado no modo automático, confirme o idioma do Windows em **Configurações → Hora e Idioma** e reinicie o aplicativo; como alternativa, escolha o idioma manualmente no card **Idioma**.
- Se o servidor não iniciar, execute `lib/python/python.exe -c "import uvicorn, fastapi"` para verificar as dependências; se faltar um módulo, rode `scripts/prepare-python.ps1` novamente e confirme que a instalação termina com `Backend import check passed`. O diálogo de erro inclui agora as últimas linhas da saída do processo Python. Confira também se o antivírus não bloqueou o executável e se há espaço em disco.
- Se o erro citar `No module named uvicorn` ou `No module named pywin32_bootstrap` ao abrir o pacote de teste, o runtime copiado para `resources\lib` ficou incompleto. `npm run package:dev` espelha `lib` com `robocopy /MIR` e valida o runtime já empacotado antes de abrir o aplicativo; repita o comando — se a validação falhar, execute `scripts/prepare-python.ps1` e tente novamente.
- Se a janela do Open Web UI abrir em branco ou exibir apenas JSON, o frontend do servidor não foi compilado. Execute `scripts/prepare-backend.ps1` (ou `npm run package:dev`, que já o executa) e confirme que `backend\build\index.html` existe. Recompilar leva alguns minutos e requer internet.
- Se a porta estiver ocupada, escolha uma alternativa e altere a configuração da porta antes de reiniciar, se desejado.
- Se aparecer a mensagem **“An object could not be cloned.”** ao salvar, atualize o aplicativo: a versão atual envia apenas valores simples ao processo principal (o erro vinha de objetos reativos da interface, que não podem ser serializados pelo IPC).
- Se aparecer **“Linha N inválida no arquivo .env.”**, alguma linha do conteúdo manual não segue o formato `NOME=valor` (nem é comentário). Abra **Editar** e corrija a linha indicada; nada é gravado até o conteúdo ser válido.
- Se uma variável alterada não mudar o comportamento do servidor, verifique se ela está na lista do card **Servidor local** e salve novamente: a lista é autoritativa e variáveis ausentes são removidas do arquivo. Conexões de provedores já gravadas no banco do Open Web UI só são recriadas quando a variável correspondente muda.
- A interface **Sobre** exibe a versão, os créditos do autor Lucas de Oliveira Neitzke e um atalho para o perfil `https://github.com/lukas13on`.
