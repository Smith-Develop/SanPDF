// PDF G · abre la aplicación al pulsar el icono
chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: chrome.runtime.getURL('app.html') }));
// Al instalarla a mano, se abre con el aviso para crear el acceso directo en el escritorio.
// Con "Instalar extensiones.cmd" no hace falta: el instalador deja instalado.json, crea el acceso directo y abre la app.
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== 'install') return;
  const conInstalador = await fetch(chrome.runtime.getURL('instalado.json')).then((r) => r.ok, () => false);
  if (!conInstalador) chrome.tabs.create({ url: chrome.runtime.getURL('app.html#bienvenida') });
});
