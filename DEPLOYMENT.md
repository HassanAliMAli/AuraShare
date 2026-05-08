# Deployment Guide: AuraShare (Zero-Token Edition)

AuraShare is designed for zero-configuration, automated deployment using **Cloudflare Pages**.

## 1. Connect to Cloudflare Pages
You **do not** need to provide any API tokens or set up GitHub Actions.

1. Go to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Navigate to **Workers & Pages** -> **Create application** -> **Pages** -> **Connect to Git**.
3. Select this GitHub repository.
4. Use the following build settings:
   - **Framework preset**: `Vite`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Root directory**: `/`
5. Click **Save and Deploy**.

## 2. Setup KV Namespace (One-time only)
The signaling API uses Cloudflare KV to exchange connection codes.
1. In the Cloudflare Dashboard, go to **Workers & Pages** -> **KV**.
2. Create a namespace named `AURASHARE_ROOMS`.
3. Go to your **AuraShare Pages Project** -> **Settings** -> **Functions**.
4. Scroll down to **KV namespace bindings**.
5. Add a binding for **Production** and **Preview**:
   - **Variable name**: `ROOMS`
   - **KV namespace**: `AURASHARE_ROOMS`
6. Redeploy your project (or push a new commit) for the changes to take effect.

That's it! Your site and its signaling API are now fully automated and 100% free.
