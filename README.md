# 🏠 Fixlife - Home Services Platform
<img width="1024" height="1024" alt="Fixilogo" src="https://github.com/user-attachments/assets/4196b4fb-bc62-4ca1-ac24-3c69a22dce42" />

A web platform to connect users with home service professionals (plumbing, electricity, cleaning, etc.).

## 🚀 Tech Stack

- **Frontend**: React + Vite + Tailwind CSS + TypeScript + Framer Motion
- **Backend**: Node.js + Express + TypeScript
- **Database**: MySQL 8.0
- **Database Management**: phpMyAdmin
- **Containerization**: Docker + Docker Compose

## 📋 Prerequisites

- Docker Desktop installed and running
- Git
- Ports 3000, 8000, 3307, and 8080 must be available.

## 🎯 Quick Start Guide for the Team

If you are cloning this project for the first time, you don't need to install Node, npm, or MySQL locally. **Docker will handle absolutely everything for you.**

### 1. Clone the Repository

```bash
git clone https://github.com/alejoo548/Fixlife.git
cd Fixlife
```

### 2. Configure Environment Variables

Copy the example file to `.env`:

```bash
cp .env.example .env
```
*(The `.env.example` file is already correctly configured with the default database passwords, so you shouldn't need to change anything for local development).*

### 3. Start the Containers

Run the following command to build and start the entire stack:

```bash
docker-compose up --build
```
*(If you want to run it in the background, use `docker-compose up -d --build`).*

### 4. Wait for Initialization

The very first time you run this, Docker will download the images, install npm dependencies, and **automatically create the database and all necessary tables** from the `docker/mysql-init.sql` and `docker/fixlife_db.sql` files. Wait until you see messages indicating the backend is running on `0.0.0.0:8000` and Vite is ready.

### 5. Access the Services

- **Frontend Web App**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **phpMyAdmin (DB Manager)**: http://localhost:8080
- **MySQL Database**: `localhost:3307`

## 🔑 Database Credentials

If you need to log into phpMyAdmin or connect directly to MySQL:
- **Host**: `mysql` (if inside docker) or `localhost` (if connecting from outside via port 3307)
- **User**: `root`
- **Password**: `Info2026/*-`
- **Database**: `fixlife_db`

## 🛠️ Useful Docker Commands

### View Logs
```bash
docker-compose logs -f
```

### Stop Services
```bash
docker-compose down
```

### Completely Reset the Database
If you broke the database and want to start fresh from the schema file:
```bash
docker-compose down -v
docker-compose up --build
```
*(The `-v` flag deletes the Docker volume where the MySQL data is stored, forcing a fresh recreation of tables next time it starts).*

## ⚠️ Notes for Developers
- **File Uploads**: The platform allows file uploads (up to 10MB) for ID documents and Certifications. Files are stored in the `backend/uploads` folder.
- **Auto-Reload**: Both the Frontend (React/Vite) and Backend (Node.js/Nodemon) are configured for hot-reloading. Changes you make to the code will apply instantly inside the containers.
