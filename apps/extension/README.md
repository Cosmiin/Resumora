# Resumora extension

From the repository root, build with:

    npm run build -w apps/extension

The apps/extension/.env file holds the public browser values listed in .env.example.
Copy the example to .env and replace the placeholders to configure environments.
A build also works without .env; the popup defaults to Local.

To load in Chrome:

1. Open chrome://extensions.
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select apps/extension/dist.

After each build, click **Reload** on the extension in chrome://extensions.
Open the extension popup to see Resumora and the selected environment badge.
