# University Permission & Communication Portal 🎓

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![React](https://img.shields.io/badge/React-18-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-green)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-blue)
![Redis](https://img.shields.io/badge/Redis-Pub%2FSub-red)
![RabbitMQ](https://img.shields.io/badge/RabbitMQ-Message_Broker-orange)
![Docker](https://img.shields.io/badge/Docker-Containerized-blue)

## 📖 Overview

The **Student Leave & Permission Management System** is a comprehensive, full-stack web application designed to digitize and automate the entire lifecycle of student permissions and university-wide communications. 

Traditionally, university administrative processes—such as leave approvals, hostel outpasses, and institutional announcements—are handled via paper forms or fragmented email chains, leading to delays and lack of transparency. This portal solves these issues by providing a structured, auditable, and real-time operational platform for Students, Faculty, HODs, Wardens, and Administrators.

## ✨ Key Features

- **Multi-Stage Approval Workflow:** Automated escalation of student requests from Proctor → HOD / Warden.
- **One-Click Email Actions:** Approvers receive actionable emails with magic links to instantly Approve or Reject requests without logging in.
- **Real-Time Announcements:** WebSocket and Redis Pub/Sub powered targeted broadcasts (by department, year, role) with zero polling.
- **Automated Document Generation:** Instant generation of official PDF approval letters upon request approval.
- **Role-Based Dashboards:** Dedicated interfaces and access controls for Students, Faculty, HODs, Wardens, and Admins.
- **Secure Authentication:** JWT-based stateless authentication, bcrypt password hashing, and OTP-secured password changes.
- **Asynchronous Processing:** Celery + RabbitMQ workers handle background tasks like email delivery and attachment processing to ensure high API performance.
- **Comprehensive Admin Console:** Full system oversight, bulk user provisioning (CSV import), role management, and system telemetry.

## 🏗️ Architecture & Tech Stack

The system is containerized with Docker Compose, ensuring reproducibility and easy deployment.

### Backend
- **Framework:** FastAPI (Python 3.11)
- **Database:** PostgreSQL (via Supabase) with SQLAlchemy ORM
- **Real-Time:** WebSockets (FastAPI native), Redis Pub/Sub
- **Background Tasks:** Celery, RabbitMQ
- **Authentication:** JWT (`python-jose`), `bcrypt`
- **PDF Generation:** `fpdf`

### Frontend
- **Framework:** React 18, Vite
- **Styling:** Tailwind CSS

### Infrastructure & External Services
- **File Storage:** Supabase Storage (for announcement attachments)
- **Email:** SMTP (Gmail App Password)
- **Containerization:** Docker, Docker Compose

## 🌍 SDG Mapping

This project aligns with the United Nations Sustainable Development Goals (SDGs):
- **SDG 4 (Quality Education):** Reduces administrative friction, giving faculty more time for teaching and providing students with faster responses.
- **SDG 9 (Industry, Innovation & Infrastructure):** Replaces paper-based processes with a scalable, modern digital infrastructure.
- **SDG 16 (Peace, Justice & Strong Institutions):** Enforces accountability through audit trails and structured multi-stage approval workflows.
- **SDG 17 (Partnerships for the Goals):** Bridges all university stakeholders through a unified collaborative platform.

## 🚀 Getting Started

### Prerequisites
- Docker and Docker Compose installed on your machine.
- Node.js (for local frontend development).
- Python 3.11+ (for local backend development).

### Running the Application via Docker

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd University_project
   ```

2. **Configure Environment Variables:**
   - Create a `.env` file in the `backend/` directory based on the provided sample or required configuration (e.g., Database URL, JWT Secret, SMTP credentials, Redis/RabbitMQ URIs).
   - Create a `.env` file in the `frontend/` directory (if required) for API endpoints.

3. **Start the Services:**
   ```bash
   docker-compose up --build -d
   ```
   This single command will spin up the FastAPI backend, Celery workers, RabbitMQ, Redis, and optionally the frontend (depending on your Docker Compose setup).

4. **Access the Application:**
   - **Frontend:** Typically accessible at `http://localhost:5173` or `http://localhost:3000`
   - **Backend API Docs (Swagger UI):** `http://localhost:8000/docs`

## 📊 Modules & Workflow

### Approval Workflow
1. **Student** submits an application (Leave/Outpass).
2. **Proctor** receives an email with an `Approve / Reject` magic link.
3. If approved, escalates to **HOD** (Day Scholar) or **Warden** (Hosteller).
4. Final approval generates a PDF letter and notifies the student.

### Communication Flow
- **Faculty/HODs** create targeted announcements.
- Live users receive instant updates via **WebSockets**.
- Offline users receive personalized HTML emails with embedded file attachments.



