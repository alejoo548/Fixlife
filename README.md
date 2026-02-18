<p align="center">
  <img src="public/Fixlogo.png" alt="Fixlife Logo" width="200" />
</p>

<h1 align="center">Fixlife</h1>

<p align="center">
  A modern home services platform connecting customers with trusted professionals for plumbing, electrical, cleaning, landscaping, and mechanics services.
</p>

---

## About

Fixlife is a web application that makes it easy for users to find and book reliable service professionals in their area. Whether you need a plumber, electrician, or a cleaning service — Fixlife streamlines the process from browsing to booking.

### Features

- 🔍 Browse services by category (Plumbing, Electrical, Cleaning, Landscaping, Mechanics)
- 📋 Step-by-step service request wizard
- 👤 User authentication (Login & Registration)
- 📊 Professional dashboard with earnings, schedule, reviews, and settings
- 💬 Service request management
- 🎨 Modern UI with smooth animations and responsive design

## Tech Stack

- **React 19** — UI framework
- **TypeScript** — Type safety
- **Vite** — Build tool & dev server
- **Tailwind CSS** — Utility-first styling
- **Framer Motion** — Animations
- **Docker** — Containerized development & deployment

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v20+)
- [Docker](https://www.docker.com/) (optional)

### Option 1: Run Locally

```bash
# Clone the repo
git clone https://github.com/alejoo548/Fixlife.git
cd Fixlife

# Install dependencies
npm install

# Start the dev server
npm run dev
```

The app will be available at **http://localhost:3000**

### Option 2: Run with Docker

```bash
# Clone the repo
git clone https://github.com/alejoo548/Fixlife.git
cd Fixlife

# Start with Docker
docker-compose up

# Or rebuild and start
docker-compose up --build
```

The app will be available at **http://localhost:3000**

### Production Build

```bash
# Build for production
npm run build

# Or use Docker for production (serves via Nginx on port 80)
docker-compose -f docker-compose.prod.yml up -d
```

## Project Structure

```
fixlife/
├── public/                    # Static assets
├── src/
│   ├── components/
│   │   ├── common/            # Reusable UI components
│   │   ├── dashboard/         # Professional dashboard views
│   │   ├── effects/           # Visual effects (particles, etc.)
│   │   ├── layout/            # Navbar, Footer
│   │   ├── modals/            # Auth, service modals
│   │   └── sections/          # Landing page sections
│   ├── App.tsx                # Main application
│   ├── types.ts               # TypeScript types
│   └── index.css              # Global styles
├── docker/
│   ├── Dockerfile.dev         # Dev container
│   ├── Dockerfile.prod        # Production container (Nginx)
│   └── README.md              # Docker guide
├── docker-compose.yml         # Dev compose
├── docker-compose.prod.yml    # Prod compose
└── package.json
```

## License

This project is proprietary. All rights reserved.
