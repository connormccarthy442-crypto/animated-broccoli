# Morrow Budget Dashboard

A private, browser-based monthly budget dashboard. It uses local storage, so each browser keeps its own budget data. Sharing the dashboard URL shares the app, not the data.

## Run locally

From the repository root:

```bash
python3 -m http.server 8000 --directory budget-tracker/dashboard
```

Open `http://localhost:8000` in a browser.

## Data and recurring expenses

Budget data stays in the browser's local storage. Use **Export backup** to download a JSON backup, and **Import backup** to restore it in another browser. Anyone with access to an exported backup can read its contents; it is not encrypted.

Recurring expenses are added when the dashboard is opened on or after their due day. A static browser app cannot run while it is closed. Each recurring entry is added at most once per month per browser.

## Share the app

To share the dashboard itself, publish this folder as a static website. Each person who opens it gets separate local data. This version does not sync data between people or devices.