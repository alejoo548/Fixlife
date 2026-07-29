const VIRTUAL_WALLET_SCRIPT_ID = 'virtual-wallet-widget-script';

// Virtual Wallet's widget expects data-client-id/data-amount-id/data-desc-id
// on the <script> tag itself and scans the DOM for elements with those ids.
// Deliberately no data-secret-key here: their example puts it in client-side
// HTML, but the secret key must never ship in the SPA bundle — see plan.
export const loadVirtualWalletWidget = (opts: {
  scriptUrl: string;
  clientId: string;
  amountElementId: string;
  descElementId: string;
  containerId: string;
}) =>
  new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(VIRTUAL_WALLET_SCRIPT_ID);
    if (existing) existing.remove();

    const script = document.createElement('script');
    script.id = VIRTUAL_WALLET_SCRIPT_ID;
    script.src = opts.scriptUrl;
    script.async = true;
    script.setAttribute('data-vw-widget', 'true');
    script.setAttribute('data-client-id', opts.clientId);
    script.setAttribute('data-amount-id', opts.amountElementId);
    script.setAttribute('data-desc-id', opts.descElementId);
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      reject(new Error('Could not load the Virtual Wallet widget script.'));
    };

    const container = document.getElementById(opts.containerId);
    (container || document.body).appendChild(script);
  });
