// PDF G · abre la aplicación al pulsar el icono
chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: chrome.runtime.getURL('app.html') }));
// Al instalarla, se abre con el aviso para crear el acceso directo en el escritorio
chrome.runtime.onInstalled.addListener(({ reason }) => { if (reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('app.html#bienvenida') }); });
