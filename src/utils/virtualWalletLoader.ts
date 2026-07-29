const VIRTUAL_WALLET_SCRIPT_ID = 'virtual-wallet-widget-script';

// Virtual Wallet's widget expects data-client-id/data-secret-key/data-amount-id/
// data-desc-id on the <script> tag itself and scans the DOM for elements with
// those ids. Their own button handler hard-refuses to open (`if (!clientId ||
// !secretKey) alert(...)`) without a secret key on the tag, so it must ship
// here despite being sensitive — acceptable only because this integration is
// scoped to a closed LAN sandbox, never public internet.
export const loadVirtualWalletWidget = (opts: {
  scriptUrl: string;
  clientId: string;
  secretKey: string;
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
    script.setAttribute('data-secret-key', opts.secretKey);
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
