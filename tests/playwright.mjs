// Carga Playwright: el del proyecto (npm install en tests/) o el indicado en PLAYWRIGHT_PATH
export async function loadPlaywright() {
  try { return await import('playwright'); }
  catch {
    if (process.env.PLAYWRIGHT_PATH) return import(process.env.PLAYWRIGHT_PATH);
    throw new Error('Instala Playwright con "npm install" dentro de tests/ o define PLAYWRIGHT_PATH');
  }
}
