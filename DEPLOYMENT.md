# Deployment Guide: AuraShare

To achieve 100% automated deployments to Cloudflare, follow these steps:

## 1. Cloudflare Workers (Signaling API)
The signaling worker is automatically deployed via GitHub Actions whenever you push to the `main` branch.

**Required Secrets:**
Go to your GitHub Repository -> Settings -> Secrets and variables -> Actions and add:
- `CLOUDFLARE_API_TOKEN`: Create a token at [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens) with "Edit Cloudflare Workers" permissions.

## 2. Cloudflare Pages (Frontend)
Cloudflare Pages works best by directly linking your GitHub repository.

1. Go to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Navigate to **Workers & Pages** -> **Create application** -> **Pages** -> **Connect to Git**.
3. Select your GitHub repository.
4. Use the following build settings:
   - **Framework preset**: `Vite`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Root directory**: `/`
5. **Environment Variables**:
   - Add `VITE_API_URL`: Your deployed Worker URL (e.g., `https://aurashare-signaling.<your-subdomain>.workers.dev/api`).

## 3. KV Namespace Setup
After the first worker deployment, you must create a KV namespace in the Cloudflare Dashboard:
1. Go to **Workers & Pages** -> **KV**.
2. Create a namespace named `AURASHARE_ROOMS`.
3. Go to your Worker settings -> **Settings** -> **Bindings**.
4. Add a **KV Namespace Binding**:
   - **Variable name**: `ROOMS`
   - **KV namespace**: `AURASHARE_ROOMS`
