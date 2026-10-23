import { app } from 'electron';
import { LANGUAGE_LABELS, normalizeLanguagePreference, pickSystemLanguage, type Language, type LanguagePreference } from './languages';

export { LANGUAGE_LABELS };

const messages = {
  'pt-BR': {
    'tray.tooltip': 'Open Web UI Desktop',
    'tray.open': 'Abrir Open Web UI',
    'tray.focus': 'Focar Open Web UI',
    'tray.show': 'Mostrar janela',
    'tray.restart': 'Reiniciar',
    'tray.updates': 'Procurar Atualizações',
    'tray.settings': 'Configurações',
    'tray.help': 'Ajuda',
    'tray.quit': 'Sair',
    'balloon.title': 'Open Web UI Desktop continua em execução',
    'balloon.content': 'Use o ícone na bandeja do sistema para reabrir a janela ou sair do aplicativo.',
    'restart.updateRunning': 'Aguarde a atualização em andamento terminar antes de reiniciar.',
    'restart.alreadyRunning': 'O servidor já está sendo reiniciado.',
    'quit.title': 'Atualização em andamento',
    'quit.message': 'Sair agora pode deixar os arquivos do servidor inconsistentes.',
    'quit.detail': 'Se continuar, será solicitada uma atualização limpa na próxima inicialização.',
    'quit.confirm': 'Sair e marcar atualização incompleta',
    'quit.cancel': 'Cancelar',
    'port.invalidRange': 'A porta deve estar entre 1 e 65535.',
    'port.title': 'Porta ocupada',
    'port.message': 'A porta {port} já está em uso.',
    'port.detail': 'Você pode procurar outra porta ou fechar o aplicativo.',
    'port.search': 'Buscar porta alternativa',
    'port.quit': 'Sair',
    'port.cancelled': 'Inicialização cancelada porque a porta está ocupada.',
    'port.none': 'Nenhuma porta disponível nos intervalos 3100–3999 e 4100–4999.',
    'backend.pythonMissing': 'Interpretador Python não encontrado em lib/python/python.exe.',
    'backend.sourceMissing': 'Código do servidor ausente na pasta backend.',
    'backend.notReady': 'O servidor ainda não está pronto.',
    'backend.exited': 'O servidor Python encerrou antes de iniciar.',
    'backend.exitedWithCode': 'O servidor Python encerrou antes de iniciar. Processo finalizado com código {code}.',
    'backend.healthTimeout': 'O servidor não respondeu ao health check em 120 segundos.',
    'webui.openFailed': 'Não foi possível abrir a interface do Open Web UI em {url}. {reason}',
    'startup.title': 'Não foi possível iniciar o servidor',
    'startup.detail': 'Verifique se o Python embeddable e as dependências estão em lib. Autor: {author}',
    'loginItem.failed': 'Não foi possível atualizar a inicialização com o Windows.',
    'titlebar.preview': 'Não foi possível aplicar a barra de título no Open Web UI.',
    'untrusted': 'Janela não autorizada.',
    'config.invalid': 'Configuração inválida.',
    'config.invalidWindowPreference': 'Valor inválido para a preferência da janela.',
    'config.invalidLoginPreference': 'Valor inválido para a preferência de inicialização.',
    'config.invalidLanguage': 'Idioma inválido.',
    'update.alreadyRunning': 'A atualização já está em andamento.',
    'update.confirmTitle': 'Confirmar atualização',
    'update.confirmMessage': '{count} commit(s) do servidor serão instalados.',
    'update.confirmDetail': '{commits}\n… e mais {remaining}',
    'update.confirmButton': 'Atualizar servidor',
    'update.cancelButton': 'Cancelar',
    'update.storeBlocked': 'A Microsoft Store não permite substituir código empacotado durante a execução. Atualize o aplicativo pela Store.',
    'update.interruptedTitle': 'Atualização interrompida',
    'update.interruptedMessage': 'Uma atualização foi interrompida e os arquivos podem estar inconsistentes.',
    'update.interruptedDetail': 'A atualização limpa remove e clona novamente a pasta backend. Faça backup dos dados personalizados antes de continuar.',
    'update.interruptedClean': 'Atualização limpa',
    'update.cancelExit': 'Sair',
    'update.recoveryCancelled': 'A recuperação foi cancelada. O backend não será iniciado até reparar a instalação.',
    'update.storeRepairMessage': 'A Microsoft Store não permite reparar os arquivos empacotados no local.',
    'update.storeRepairDetail': 'Reinstale uma versão atualizada do aplicativo Desktop para restaurar o servidor.',
    'update.storeExit': 'Reinicie o aplicativo pela Microsoft Store após instalar uma versão atualizada.',
    'update.continueWithoutUpdating': 'Continuar sem atualizar',
    'git.exitCode': 'Git terminou com código {code}.',
    'admin.required': 'Execute o Open Web UI Desktop como administrador para continuar.',
    'platform.unsupported': 'Este aplicativo requer Windows 10/11 x64.',
    'webui.serverName': 'Servidor',
    'webui.serverActive': 'Servidor ativo',
    'webui.minimize': 'Minimizar',
    'webui.maximize': 'Maximizar',
    'webui.restore': 'Restaurar',
    'webui.close': 'Fechar',
    'env.invalidKey': 'Nome de variável inválido: {key}',
    'env.duplicateKey': 'Variável duplicada: {key}',
    'env.invalidValue': 'Valor inválido para {key}.',
    'env.invalidLine': 'Linha {line} inválida no arquivo .env.',
    'env.tooMany': 'O arquivo .env excede o limite de variáveis.'
  },
  'en-US': {
    'tray.tooltip': 'Open Web UI Desktop',
    'tray.open': 'Open Open Web UI',
    'tray.focus': 'Focus Open Web UI',
    'tray.show': 'Show window',
    'tray.restart': 'Restart',
    'tray.updates': 'Check for Updates',
    'tray.settings': 'Settings',
    'tray.help': 'Help',
    'tray.quit': 'Quit',
    'balloon.title': 'Open Web UI Desktop is still running',
    'balloon.content': 'Use the system tray icon to reopen the window or quit the application.',
    'restart.updateRunning': 'Wait for the running update to finish before restarting.',
    'restart.alreadyRunning': 'The server is already restarting.',
    'quit.title': 'Update in progress',
    'quit.message': 'Quitting now may leave the server files inconsistent.',
    'quit.detail': 'If you continue, a clean update will be requested on the next start.',
    'quit.confirm': 'Quit and flag incomplete update',
    'quit.cancel': 'Cancel',
    'port.invalidRange': 'The port must be between 1 and 65535.',
    'port.title': 'Port in use',
    'port.message': 'Port {port} is already in use.',
    'port.detail': 'You can look for another port or close the application.',
    'port.search': 'Find another port',
    'port.quit': 'Quit',
    'port.cancelled': 'Startup cancelled because the port is in use.',
    'port.none': 'No available port in the 3100–3999 and 4100–4999 ranges.',
    'backend.pythonMissing': 'Python interpreter not found at lib/python/python.exe.',
    'backend.sourceMissing': 'Server source code is missing from the backend folder.',
    'backend.notReady': 'The server is not ready yet.',
    'backend.exited': 'The Python server exited before starting.',
    'backend.exitedWithCode': 'The Python server exited before starting. Process finished with code {code}.',
    'backend.healthTimeout': 'The server did not respond to the health check within 120 seconds.',
    'webui.openFailed': 'Could not open the Open Web UI interface at {url}. {reason}',
    'startup.title': 'Could not start the server',
    'startup.detail': 'Check that the embeddable Python and dependencies are in lib. Author: {author}',
    'loginItem.failed': 'Could not update starting with Windows.',
    'titlebar.preview': 'Could not apply the title bar to Open Web UI.',
    'untrusted': 'Unauthorized window.',
    'config.invalid': 'Invalid configuration.',
    'config.invalidWindowPreference': 'Invalid value for the window preference.',
    'config.invalidLoginPreference': 'Invalid value for the startup preference.',
    'config.invalidLanguage': 'Invalid language.',
    'update.alreadyRunning': 'The update is already running.',
    'update.confirmTitle': 'Confirm update',
    'update.confirmMessage': '{count} server commit(s) will be installed.',
    'update.confirmDetail': '{commits}\n… and {remaining} more',
    'update.confirmButton': 'Update server',
    'update.cancelButton': 'Cancel',
    'update.storeBlocked': 'The Microsoft Store does not allow replacing packaged code at runtime. Update the application from the Store.',
    'update.interruptedTitle': 'Interrupted update',
    'update.interruptedMessage': 'An update was interrupted and the files may be inconsistent.',
    'update.interruptedDetail': 'The clean update removes and clones the backend folder again. Back up your custom data before continuing.',
    'update.interruptedClean': 'Clean update',
    'update.cancelExit': 'Quit',
    'update.recoveryCancelled': 'Recovery was cancelled. The backend will not start until the installation is repaired.',
    'update.storeRepairMessage': 'The Microsoft Store does not allow repairing packaged files locally.',
    'update.storeRepairDetail': 'Reinstall an updated version of the Desktop application to restore the server.',
    'update.storeExit': 'Restart the application from the Microsoft Store after installing an updated version.',
    'update.continueWithoutUpdating': 'Continue without updating',
    'git.exitCode': 'Git finished with code {code}.',
    'admin.required': 'Run Open Web UI Desktop as administrator to continue.',
    'platform.unsupported': 'This application requires Windows 10/11 x64.',
    'webui.serverName': 'Server',
    'webui.serverActive': 'Server running',
    'webui.minimize': 'Minimize',
    'webui.maximize': 'Maximize',
    'webui.restore': 'Restore',
    'webui.close': 'Close',
    'env.invalidKey': 'Invalid variable name: {key}',
    'env.duplicateKey': 'Duplicate variable: {key}',
    'env.invalidValue': 'Invalid value for {key}.',
    'env.invalidLine': 'Invalid line {line} in the .env file.',
    'env.tooMany': 'The .env file exceeds the variable limit.'
  },
  'es-ES': {
    'tray.tooltip': 'Open Web UI Desktop',
    'tray.open': 'Abrir Open Web UI',
    'tray.focus': 'Enfocar Open Web UI',
    'tray.show': 'Mostrar ventana',
    'tray.restart': 'Reiniciar',
    'tray.updates': 'Buscar actualizaciones',
    'tray.settings': 'Configuración',
    'tray.help': 'Ayuda',
    'tray.quit': 'Salir',
    'balloon.title': 'Open Web UI Desktop sigue en ejecución',
    'balloon.content': 'Usa el icono de la bandeja del sistema para volver a abrir la ventana o salir de la aplicación.',
    'restart.updateRunning': 'Espera a que termine la actualización en curso antes de reiniciar.',
    'restart.alreadyRunning': 'El servidor ya se está reiniciando.',
    'quit.title': 'Actualización en curso',
    'quit.message': 'Salir ahora puede dejar los archivos del servidor inconsistentes.',
    'quit.detail': 'Si continúas, se solicitará una actualización limpia en el próximo inicio.',
    'quit.confirm': 'Salir y marcar actualización incompleta',
    'quit.cancel': 'Cancelar',
    'port.invalidRange': 'El puerto debe estar entre 1 y 65535.',
    'port.title': 'Puerto ocupado',
    'port.message': 'El puerto {port} ya está en uso.',
    'port.detail': 'Puedes buscar otro puerto o cerrar la aplicación.',
    'port.search': 'Buscar otro puerto',
    'port.quit': 'Salir',
    'port.cancelled': 'Inicio cancelado porque el puerto está ocupado.',
    'port.none': 'No hay ningún puerto disponible en los rangos 3100–3999 y 4100–4999.',
    'backend.pythonMissing': 'No se encontró el intérprete de Python en lib/python/python.exe.',
    'backend.sourceMissing': 'Falta el código del servidor en la carpeta backend.',
    'backend.notReady': 'El servidor aún no está listo.',
    'backend.exited': 'El servidor de Python se cerró antes de iniciar.',
    'backend.exitedWithCode': 'El servidor de Python se cerró antes de iniciar. El proceso terminó con el código {code}.',
    'backend.healthTimeout': 'El servidor no respondió al health check en 120 segundos.',
    'webui.openFailed': 'No se pudo abrir la interfaz de Open Web UI en {url}. {reason}',
    'startup.title': 'No se pudo iniciar el servidor',
    'startup.detail': 'Comprueba que el Python embebido y las dependencias estén en lib. Autor: {author}',
    'loginItem.failed': 'No se pudo actualizar el inicio con Windows.',
    'titlebar.preview': 'No se pudo aplicar la barra de título a Open Web UI.',
    'untrusted': 'Ventana no autorizada.',
    'config.invalid': 'Configuración no válida.',
    'config.invalidWindowPreference': 'Valor no válido para la preferencia de la ventana.',
    'config.invalidLoginPreference': 'Valor no válido para la preferencia de inicio.',
    'config.invalidLanguage': 'Idioma no válido.',
    'update.alreadyRunning': 'La actualización ya está en curso.',
    'update.confirmTitle': 'Confirmar actualización',
    'update.confirmMessage': 'Se instalarán {count} commit(s) del servidor.',
    'update.confirmDetail': '{commits}\n… y {remaining} más',
    'update.confirmButton': 'Actualizar servidor',
    'update.cancelButton': 'Cancelar',
    'update.storeBlocked': 'Microsoft Store no permite sustituir código empaquetado en tiempo de ejecución. Actualiza la aplicación desde la Store.',
    'update.interruptedTitle': 'Actualización interrumpida',
    'update.interruptedMessage': 'Una actualización se interrumpió y los archivos pueden estar inconsistentes.',
    'update.interruptedDetail': 'La actualización limpia elimina y vuelve a clonar la carpeta backend. Haz una copia de seguridad de tus datos antes de continuar.',
    'update.interruptedClean': 'Actualización limpia',
    'update.cancelExit': 'Salir',
    'update.recoveryCancelled': 'La recuperación se canceló. El backend no se iniciará hasta reparar la instalación.',
    'update.storeRepairMessage': 'Microsoft Store no permite reparar los archivos empaquetados localmente.',
    'update.storeRepairDetail': 'Reinstala una versión actualizada de la aplicación de escritorio para restaurar el servidor.',
    'update.storeExit': 'Reinicia la aplicación desde Microsoft Store después de instalar una versión actualizada.',
    'update.continueWithoutUpdating': 'Continuar sin actualizar',
    'git.exitCode': 'Git terminó con el código {code}.',
    'admin.required': 'Ejecuta Open Web UI Desktop como administrador para continuar.',
    'platform.unsupported': 'Esta aplicación requiere Windows 10/11 x64.',
    'webui.serverName': 'Servidor',
    'webui.serverActive': 'Servidor activo',
    'webui.minimize': 'Minimizar',
    'webui.maximize': 'Maximizar',
    'webui.restore': 'Restaurar',
    'webui.close': 'Cerrar',
    'env.invalidKey': 'Nombre de variable no válido: {key}',
    'env.duplicateKey': 'Variable duplicada: {key}',
    'env.invalidValue': 'Valor no válido para {key}.',
    'env.invalidLine': 'Línea {line} no válida en el archivo .env.',
    'env.tooMany': 'El archivo .env supera el límite de variables.'
  }
} as const satisfies Record<Language, Record<string, string>>;

export type MainMessageKey = keyof (typeof messages)['pt-BR'];

let currentLanguage: Language | null = null;

function systemLanguages(): string[] {
  const candidates: string[] = [];
  try {
    candidates.push(...app.getPreferredSystemLanguages());
  } catch { /* Not available before the app is ready. */ }
  try {
    candidates.push(app.getLocale());
  } catch { /* Not available before the app is ready. */ }
  return candidates;
}

export function resolveLanguage(preference: LanguagePreference): Language {
  const normalized = normalizeLanguagePreference(preference);
  if (normalized !== 'auto') return normalized;
  return pickSystemLanguage(systemLanguages());
}

export function language(): Language {
  currentLanguage ??= resolveLanguage('auto');
  return currentLanguage;
}

export function setLanguage(languageCode: Language): void {
  currentLanguage = normalizeLanguagePreference(languageCode) === 'auto' ? resolveLanguage('auto') : languageCode;
}

export function t(key: MainMessageKey, params: Record<string, string | number> = {}): string {
  const template: string = messages[language()][key];
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  );
}

export type EnvValidationReason = 'key' | 'duplicate' | 'value' | 'count' | 'line';

export function envValidationMessage(reason: EnvValidationReason, detail: string): string {
  switch (reason) {
    case 'key':
      return t('env.invalidKey', { key: detail });
    case 'duplicate':
      return t('env.duplicateKey', { key: detail });
    case 'value':
      return t('env.invalidValue', { key: detail });
    case 'count':
      return t('env.tooMany');
    default:
      return t('env.invalidLine', { line: detail });
  }
}
