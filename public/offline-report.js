const report = document.querySelector('#connection-report');
const button = document.querySelector('#copy-report');
const status = document.querySelector('#copy-status');
report.value = JSON.stringify({
  application: 'SyncLounge',
  event: 'offline-or-service-unavailable',
  capturedAt: new Date().toISOString(),
  online: navigator.onLine,
  browser: navigator.userAgent,
  standalone: Boolean(navigator.standalone || matchMedia('(display-mode: standalone)').matches),
}, null, 2);
button.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(report.value);
    status.textContent = 'Copied. Send this to your host with a description of what happened.';
  } catch {
    report.focus();
    report.select();
    status.textContent = 'Select and copy the report manually, then send it to your host.';
  }
});
