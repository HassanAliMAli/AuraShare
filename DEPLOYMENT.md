# Deployment Guide: AuraShare (PeerJS Edition)

AuraShare is now powered by **PeerJS**, which provides 100% reliable, real-time P2P signaling. Deployment is now simpler than ever.

## 1. Connect to Cloudflare Pages
You **do not** need to provide any API tokens, set up KV namespaces, or configure backends.

1. Go to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Navigate to **Workers & Pages** -> **Create application** -> **Pages** -> **Connect to Git**.
3. Select this GitHub repository.
4. Use the following build settings:
   - **Framework preset**: `Vite`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Root directory**: `/`
5. Click **Save and Deploy**.

That's it! Your site is now fully automated, 100% free, and uses industry-standard P2P technology to bridge devices across any network.
