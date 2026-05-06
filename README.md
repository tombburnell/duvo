# duvo

## Lightweight frontend

1. Copy `.env.example` to `.env` and set `OPENAI_API_KEY` and `OPENAI_MODEL`.
2. Run the local app with Docker:

   ```sh
   docker compose -f docker-compose.local.yml up
   ```

3. Open `http://localhost:3000` and submit one set of instructions.

For local development without Docker:

```sh
cd apps/web
npm run dev
```
