# shoply-be-server

Multi-vendor e-commerce + white-label SaaS backend (Express + MongoDB).

- Storefront/admin/vendor/customer APIs
- Multi-vendor marketplace (vendors, sub-orders, commissions)
- SaaS control plane: tenants, per-tenant Mongo URIs (encrypted), owner console
- Realtime API metrics (Socket.IO) + line-chart analytics
- Per-tenant Android build dispatch (buyer + seller apps) via GitHub Actions

## Run
    npm install
    cp .env.example .env   # fill in secrets
    node src/seed.js && node src/seed-owner.js
    node src/server.js

Deploys to the GCP VM via `.github/workflows/deploy-server.yml`.
