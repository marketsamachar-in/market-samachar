<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/6db0a913-bbd7-4632-8ca3-90f59d32bead

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   ```
   npm install
   ```

2. Copy the example env file and fill in your keys:
   ```
   cp .env.example .env.local
   ```

3. Set up the admin password (first time only):
   ```
   npm run setup-admin yourpassword
   ```
   Copy the printed `ADMIN_PASSWORD="..."` line into `.env.local`.

4. Set `GEMINI_API_KEY` in `.env.local` to your Gemini API key.

5. Run the app:
   ```
   npm run dev
   ```

6. Open the pipeline dashboard at `http://localhost:3000/pipeline`
   (sign in with the password you set in step 3).
