# SwiftShip Express

A shipping and logistics web app: customers get instant quotes, create and track
shipments, and manage their account; admins approve/reject shipment requests,
update tracking status, and manage users.

## Stack

- **Backend:** Node.js, Express, MongoDB (Mongoose), JWT auth
- **Frontend:** Static HTML/CSS/vanilla JS, served by the Express app

## Project structure

```
backend/    Express API + static file server
  models/     Mongoose schemas (User, Shipment)
  routes/     API routes (auth, quotes, shipments, dashboard, addresses)
  middleware/ JWT auth middleware
  utils/      Email sending (password reset)
  server.js   App entry point
frontend/   Static site (pages, css, js) served by the backend
```

## Getting started

1. Install dependencies:
   ```
   npm run install-backend
   ```
2. Copy `backend/.env.example` to `backend/.env` and fill in your own values
   (MongoDB URI, JWT secret, email credentials).
3. Start the server:
   ```
   npm run dev
   ```
4. Open http://localhost:5000 in your browser.

## Scripts

- `npm run dev` — start the backend with auto-reload (nodemon)
- `npm start` — start the backend
- `node backend/seed.js` — populate the database with sample shipments
