# Guia do usuário — Open Web UI Desktop

O Open Web UI Desktop executa o servidor Open Web UI no seu PC com Windows 10/11 x64 e abre a interface em uma janela própria. A primeira preparação precisa de internet para baixar o Python embeddable e dependências; depois de preparado, o aplicativo e o servidor podem executar localmente sem baixar código em tempo de execução. O backend precisa de um diretório `lib/python` completo; o repositório inclui apenas o código-fonte do servidor.

## Instalação

Use o instalador `OpenWebUIDesktop-<versão>-<arquitetura>.exe` fornecido pelo mantenedor. Ele requer privilégios de administrador e cria o atalho com execução elevada. O instalador define `OPENWEBUI_DESKTOP_PATH` para o diretório escolhido; o desinstalador remove a variável. Para compilar seu próprio instalador, consulte o [README técnico](../README.md). Para testar o executável extraído em desenvolvimento, use `npm run package:dev`; o script prepara `release/win-unpacked`, copia `lib` para `resources/lib`, define `OPENWEBUI_DESKTOP_PATH` só para a execução de teste e inicia o aplicativo. Pacotes Microsoft Store dependem de identidade e certificado do publicador válidos.

## Primeira inicialização

O aplicativo exige Windows x64 e privilégios de administrador, exceto quando instalado pela Microsoft Store. Ele inicia o servidor local, aguarda o health check e só então mostra a interface. O servidor escuta em `127.0.0.1`, acessível apenas localmente. A porta inicial é 3301. Se estiver ocupada, escolha buscar uma porta alternativa (3100–3999 ou 4100–4999) ou sair. A alternativa é selecionada para essa sessão.

O ícone da bandeja oferece abrir Open Web UI em uma janela nativa dedicada, reiniciar, procurar atualizações, configurações, ajuda e sair. Clique com o botão esquerdo no ícone para reabrir a janela de gerenciamento e clique com o botão direito para ver o menu. Fechar a janela de gerenciamento apenas a oculta; use **Sair** no menu para encerrar também a árvore de processos do backend.

A janela do Open Web UI usa o mesmo estilo da janela de gerenciamento: sem bordas nativas e com barra de título própria (marca, nome, indicador “Servidor ativo” e os controles minimizar/maximizar/restaurar/fechar). A barra é arrastável e, ao maximizar, o ícone passa a exibir o estado de restaurar. A interface do Open Web UI é renderizada em uma área separada, já descontada a altura da barra, então menus, popovers e barras laterais mantêm o layout original. O menu do Electron fica oculto, mas os atalhos continuam disponíveis: `F5`/`Ctrl+R` recarregam, `Ctrl+Shift+R` recarrega sem cache e `F12`/`Ctrl+Shift+I` abrem o DevTools em janela separada.

Ações demoradas (abrir o Open Web UI, reiniciar o servidor, salvar configurações e atualizar) mostram um indicador de progresso no próprio botão, que permanece desabilitado até a operação terminar. O indicador de status no topo muda para **Reiniciando…** enquanto o servidor é reiniciado e para **Servidor indisponível** se o backend não estiver pronto.

## Fechar o desktop ao abrir o Open Web UI

Em **Configurações → Comportamento da janela** existe a opção **“Fechar o Open Web UI Desktop automaticamente ao abrir o Open Web UI”**, ativada por padrão. Quando ligada, qualquer atalho que abra o servidor — botão da tela inicial, item da bandeja ou link — oculta a janela do Open Web UI Desktop, deixando apenas a janela do Open Web UI visível. O desktop continua em execução na bandeja do Windows (processo e servidor Python permanecem ativos) e volta ao clicar no ícone da bandeja; use **Sair** no menu para encerrar de fato.

A alteração é aplicada imediatamente, sem reiniciar o servidor, e fica gravada em `config.json`. Se a janela do Open Web UI falhar ao abrir, o desktop permanece visível para exibir o erro. A preferência não interfere em abrir o Open Web UI pela bandeja com o desktop já oculto.

## Provedores e cofre de credenciais

Em **Configurações → Variáveis de ambiente**, adicione chaves como `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `OLLAMA_BASE_URL` ou variáveis documentadas pelo provedor. Salve para criptografar as variáveis com o `safeStorage` do Electron (DPAPI no Windows). Sem suporte a criptografia, valores secretos não são salvos. Remova uma variável quando não for mais necessária. A configuração e os dados do servidor ficam em `%APPDATA%\openwebui-desktop`; as credenciais são descriptografadas apenas em memória para iniciar o servidor. Proteja a conta e o dispositivo Windows: DPAPI protege os arquivos em repouso, não contra processos maliciosos executados na mesma conta.

## Conectar modelos locais ou remotos

- **Ollama:** instale e inicie Ollama separadamente. Configure sua URL em `OLLAMA_BASE_URL` se não usar o endereço padrão aceito pelo servidor, e adicione os modelos pelo painel Open Web UI.
- **Llama.cpp:** execute um servidor compatível com a API OpenAI e configure a URL base no painel de conexões Open Web UI.
- **OpenRouter:** adicione `OPENROUTER_API_KEY` no cofre. O servidor usa `https://openrouter.ai/api/v1` e seleciona `openai/gpt-6-luna-pro` como modelo padrão. A chave também pode ser informada como `OPENAI_API_KEY` quando necessário pela configuração OpenAI-compatível.
- O desktop não substitui por conta própria a configuração de outros provedores; não configure Anthropic/Groq/outros provedores para esta instalação.

Para reduzir o tempo e o tamanho de instalação, a preparação automática usa o conjunto slim de dependências do fork. O desktop não instala nem inicia esses servidores/modelos locais. Salvar alterações nas variáveis reinicia o servidor para aplicá-las. Para modelos remotos, o provedor recebe as solicitações de inferência de acordo com os termos e a política do provedor.

## Atualizar o servidor

Selecione **Procurar Atualizações** na bandeja. Os commits pendentes são listados antes da confirmação. Aplicar atualizações encerra o servidor e sincroniza a branch `main` do fork `lukas13on/open-webui-desktop-server`; os arquivos do cliente Desktop não são alterados por esse mecanismo. No instalador NSIS, o diretório backend Git está incluído no pacote; a atualização requer permissões de administrador e uma instalação gravável. O pacote Microsoft Store não atualiza código em runtime: use a Store para atualizar o aplicativo. Não interrompa o processo durante a sincronização. Se a interrupção for confirmada, a próxima inicialização oferece uma clonagem limpa da pasta backend; faça backup de alterações locais antes de aceitar.

## Dados e solução de problemas

- Configuração e credenciais: `%APPDATA%\openwebui-desktop\config.json` e `environment.dpapi`.
- Dados, bancos e caches: `%APPDATA%\openwebui-desktop\data`.
- Se o servidor não iniciar, execute `lib/python/python.exe -c "import uvicorn, fastapi"` para verificar as dependências; se faltar um módulo, rode `scripts/prepare-python.ps1` novamente e confirme que a instalação termina com `Backend import check passed`. O diálogo de erro inclui agora as últimas linhas da saída do processo Python. Confira também se o antivírus não bloqueou o executável e se há espaço em disco.
- Se o erro citar `No module named uvicorn` ou `No module named pywin32_bootstrap` ao abrir o pacote de teste, o runtime copiado para `resources\lib` ficou incompleto. `npm run package:dev` espelha `lib` com `robocopy /MIR` e valida o runtime já empacotado antes de abrir o aplicativo; repita o comando — se a validação falhar, execute `scripts/prepare-python.ps1` e tente novamente.
- Se a janela do Open Web UI abrir em branco ou exibir apenas JSON, o frontend do servidor não foi compilado. Execute `scripts/prepare-backend.ps1` (ou `npm run package:dev`, que já o executa) e confirme que `backend\build\index.html` existe. Recompilar leva alguns minutos e requer internet.
- Se a porta estiver ocupada, escolha uma alternativa e altere a configuração da porta antes de reiniciar, se desejado.
- A interface **Ajuda** exibe a versão e os créditos do autor, Lucas de Oliveira Neitzke.
