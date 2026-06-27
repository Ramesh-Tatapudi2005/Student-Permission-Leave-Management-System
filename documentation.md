# University Permission & Communication Portal — Project Documentation

---

## 1. Abstract

University administrative processes such as leave approvals, permission requests, and institutional announcements are traditionally paper-based or managed through fragmented email chains, resulting in delays, lack of transparency, and poor traceability. This project proposes and implements a full-stack **University Permission & Communication Portal** that digitises and automates the entire permission lifecycle — from student application to multi-stage faculty approval — while simultaneously providing a real-time announcement broadcasting system. Built with **FastAPI** (Python) on the backend, **React.js + Tailwind CSS** on the frontend, **PostgreSQL** via Supabase for persistence, and **Celery + RabbitMQ** for asynchronous email delivery, the system delivers role-based dashboards for Students, Faculty, HOD, Warden, and Admin. The outcome is a transparent, auditable, and near-real-time university operations platform.

---

## 2. SDG Mapping

| SDG | Goal | Relevance to This Project |
|-----|------|--------------------------|
| ![SDG4](https://via.placeholder.com/20/C5192D/fff?text=4) **SDG 4** | Quality Education | Reduces administrative friction so faculty can focus on teaching; gives students faster, transparent responses to their requests |
| ![SDG9](https://via.placeholder.com/20/F36D25/fff?text=9) **SDG 9** | Industry, Innovation & Infrastructure | Replaces paper-based processes with a scalable, containerised digital infrastructure using modern web technologies |
| ![SDG16](https://via.placeholder.com/20/00689D/fff?text=16) **SDG 16** | Peace, Justice & Strong Institutions | Enforces accountability through role-based access, audit trails, and structured multi-stage approval workflows |
| ![SDG17](https://via.placeholder.com/20/19486A/fff?text=17) **SDG 17** | Partnerships for the Goals | Bridges students, faculty, HODs, wardens, and admins through a unified, collaborative digital platform |

> **Primary Alignment:** SDG 4 – Quality Education and SDG 9 – Industry, Innovation and Infrastructure.

---

## 3. Introduction

University campuses manage hundreds of student leave requests, permission letters, hostel outpasses, and institutional announcements every week. In most institutions, this is handled via physical forms, WhatsApp groups, and manual email threads — making it impossible to track status, enforce deadlines, or maintain an audit trail. Faculty approval often happens over informal channels, and students frequently have no visibility into where their request stands.

This project addresses that gap by building a production-ready web portal that mirrors the real hierarchical structure of a university:

- A **Proctor** (assigned faculty) reviews the student's first application.
- If approved, it escalates to the **HOD** (for day scholars) or **Warden** (for hostellers).
- Each approver receives an actionable email with one-click Approve / Reject magic links.
- The student receives an instant email notification and can download an official PDF approval letter.
- Separately, faculty and HODs can broadcast **announcements** to precisely targeted groups (department, year, role), which are delivered both in real-time through WebSockets and as personalised emails with file attachments.

The system is containerised with Docker Compose, making it reproducible and deployable on any cloud VM without environment-specific configuration.

---

## 4. Objectives

1. **To develop a role-based digital portal** that replaces paper-based university leave and permission management with a structured, auditable online workflow.

2. **To implement a multi-stage approval pipeline** where student requests automatically escalate from Proctor → HOD / Warden, with email-based one-click action links for faculty.

3. **To build a real-time announcement system** using WebSockets and Redis Pub/Sub that delivers targeted broadcasts (by department, year, or role) to connected users with zero polling.

4. **To automate email communications** — including OTP-secured password changes, application status updates, faculty action requests, and announcement notifications with file attachments — via an asynchronous Celery + RabbitMQ worker pipeline.

5. **To provide a master Admin console** for user provisioning, bulk imports, application oversight, and system-wide telemetry, ensuring complete operational control without direct database access.

---

## 5. Methodology

### 5.1 Tools, Platforms & Programming Languages

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Backend** | Python 3.11, FastAPI | REST API, WebSocket server, background task orchestration |
| **ORM** | SQLAlchemy | Database abstraction and model definitions |
| **Database** | PostgreSQL (Supabase cloud) | Persistent storage for users, applications, announcements |
| **Frontend** | React 18, Vite, Tailwind CSS | Single-page application with role-specific dashboards |
| **Authentication** | JWT (python-jose), bcrypt | Stateless token auth, secure password hashing |
| **Real-time** | WebSocket (FastAPI native), Redis Pub/Sub | Live announcement broadcasting |
| **Async Tasks** | Celery, RabbitMQ | Background email delivery, attachment downloading |
| **Email** | SMTP (Gmail App Password) | Leave notifications, OTP emails, announcement emails |
| **File Storage** | Supabase Storage | Announcement attachments (images, PDFs, documents, videos) |
| **PDF Generation** | fpdf (Python) | Official approval letter generation |
| **Containerisation** | Docker, Docker Compose | Service orchestration (API, Celery, RabbitMQ, Redis) |

### 5.2 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      CLIENT (Browser)                        │
│           React SPA  ←→  WebSocket  ←→  REST API            │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP / WS
┌────────────────────────▼────────────────────────────────────┐
│                   FastAPI Application                         │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌─────────────┐   │
│  │  Auth    │ │  Leaves  │ │Announcements│ │   Admin     │   │
│  │  Router  │ │  Router  │ │   Router  │ │   Router    │   │
│  └──────────┘ └──────────┘ └───────────┘ └─────────────┘   │
│                         │                                     │
│              SQLAlchemy ORM / PostgreSQL (Supabase)          │
└────────────────────────┬────────────────────────────────────┘
                         │ .delay() / send_task()
┌────────────────────────▼────────────────────────────────────┐
│              RabbitMQ  →  Celery Workers                     │
│     send_leave_notification  |  send_faculty_action_email    │
│     send_announcement_emails |  (with attachment download)   │
└─────────────────────────────────────────────────────────────┘
                         │
                    Redis (Pub/Sub + Rate Limiter)
```

### 5.3 Approval Workflow Flowchart

```
Student Submits Application
         │
         ▼
  Proctor receives email
  with [Approve] / [Reject] magic link
         │
    ┌────┴────┐
 Approved  Rejected ──► Student notified (email)
    │
    ▼
Is student a Hosteller?
    │
  ┌─┴──┐
 Yes   No
  │     │
Warden  HOD receives email with magic link
  │       │
  └───┬───┘
      │
   Approved ──► PDF Letter generated
                Student notified (email)
      │
   Rejected ──► Student notified (email)
```

---

## 6. Implementation

### 6.1 Modules Developed

| Module | Description |
|--------|-------------|
| **Authentication** | Student & Faculty registration/login via JWT; OTP-secured password change |
| **Leave Management** | Apply, track, update, delete applications; multi-stage approval with audit trail |
| **Email Pipeline** | Celery workers for async delivery: leave notifications, magic-link faculty emails, announcement bulk emails |
| **Announcement System** | Create / publish targeted announcements; real-time delivery via WebSocket + Redis; email delivery with attachments |
| **Admin Console** | User provisioning, bulk CSV import, role management, application override, system telemetry |
| **File Management** | Attachment upload to Supabase Storage; download attachments from cloud and embed in emails |
| **PDF Generation** | Generate official approval letters with fpdf on approval |

### 6.2 Features Implemented

**Student Dashboard**
- Submit Leave / Outpass / Permission requests with date range and description
- Track status (PENDING → APPROVED / REJECTED) with timeline progress bar
- Download official PDF approval letter on approval
- View personalised announcement feed (filtered by dept, year, role)
- Change password with OTP email verification (3-step UI flow)

**Staff / HOD / Warden Dashboard**
- View pending applications filtered by department and leave type
- One-click Approve / Reject from email magic links (passwordless quick-action page)
- Add remarks during approval/rejection
- Create and broadcast announcements to targeted audiences
- View announcement history with read/view analytics

**Admin Dashboard**
- Provision individual users (Student / Faculty / HOD / Warden)
- Bulk provision via CSV upload
- Promote / demote roles, reset passwords, delete users with cascade
- Override any application status
- Deploy / kill system-wide broadcasts
- View system telemetry (active users, applications, department stats)

**Real-time Layer**
- WebSocket connection per user; routes announcements by role, department, year, and proctor ID
- Redis Pub/Sub fan-out from API to all WebSocket connections
- Emergency alert modal with acknowledgement for EMERGENCY-priority announcements
- Exponential backoff reconnection on disconnect

**Email Notifications**
- Leave status change → personalised HTML email to student
- New application → actionable HTML email to proctor with JWT-signed Approve/Reject links
- Escalation → actionable email to HOD/Warden
- Password change → OTP email with 10-minute expiry
- Announcement published → bulk personalised HTML email with file attachments embedded (PDF, image, document, video)

### 6.3 API Endpoints Summary

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/auth/login` | Public | Student login |
| POST | `/auth/login/faculty` | Public | Faculty login |
| GET | `/student/profile` | Student | Fetch profile |
| GET | `/staff/profile` | Staff | Fetch profile |
| POST | `/user/change-password/request-otp` | Auth | Send OTP to registered email |
| POST | `/user/change-password/verify-otp` | Auth | Verify OTP & update password |
| POST | `/leaves/apply` | Student | Submit application |
| PUT | `/leaves/{id}/action` | Staff | Approve / Reject |
| GET | `/leaves/{id}/download` | Student | Download PDF letter |
| POST | `/announcements` | Staff | Create & publish announcement |
| GET | `/announcements/feed/{user_id}` | Auth | Get personalised feed |
| WS | `/ws/announcements/{id}` | Auth | Real-time WebSocket channel |
| POST | `/api/v1/admin/provision` | Admin | Create a user |
| POST | `/admin/provision/bulk` | Admin | Bulk CSV import |

---

## 7. Results / Outcomes

| Metric | Result |
|--------|--------|
| **Approval workflow** | Fully functional end-to-end: Student → Proctor → HOD/Warden → Letter |
| **Email delivery** | Confirmed working for leave notifications, magic-link faculty emails, OTP emails, and bulk announcement emails with attachments |
| **Real-time broadcast** | Announcements appear on all connected dashboards within < 1 second of publication |
| **Bulk announcement email** | 9 recipients, 1 JPEG attachment delivered in 17.9 s via Celery worker |
| **Password OTP flow** | 6-digit OTP delivered to registered email; 10-minute expiry enforced in DB |
| **PDF letter generation** | Approval letters generated and downloadable immediately on approval |
| **Role enforcement** | All 5 roles (STUDENT, FACULTY, HOD, WARDEN, ADMIN) tested with JWT-based access control |
| **Containerisation** | Entire stack (API, Celery worker, RabbitMQ, Redis) runs with a single `docker compose up` |

---

## 8. Key Learnings

- **Asynchronous architecture:** Learned how to decouple long-running tasks (email SMTP, file downloads) from the HTTP request cycle using Celery and RabbitMQ, preventing API timeouts under load.

- **Real-time systems:** Gained hands-on experience designing a Redis Pub/Sub fan-out mechanism that routes WebSocket messages to the correct clients based on role, department, year, and proctor relationship.

- **Security design:** Understood JWT-based authentication, bcrypt password hashing, OTP-secured sensitive operations, and magic-token email actions — and why each is needed for a different threat model.

- **Multi-container orchestration:** Learned Docker Compose service networking, shared volume patterns, and the correct way for separate containers (API vs Celery worker) to communicate via a message broker rather than direct imports.

- **Email protocol (SMTP/MIME):** Understood the difference between `multipart/alternative` (HTML body only) and `multipart/mixed` (HTML + binary attachments), and how to construct RFC-compliant email messages with file attachments sourced from cloud URLs.

- **Role-based system design:** Applied real-world hierarchical access control — a concept directly transferable to enterprise ERP and HR systems — within a university context.

- **Full-stack integration:** Connected a FastAPI backend to a React frontend with real-time WebSocket channels, demonstrating end-to-end product thinking from database schema to UI interaction.

---

## 9. Conclusion

The University Permission & Communication Portal successfully addresses the core inefficiencies in traditional university administration by delivering a unified, role-aware digital platform. Students can submit requests and track approvals in real time; faculty can act on approvals directly from email without logging in; administrators have full visibility and control over the system. The announcement module ensures no critical institutional communication is missed, with targeted delivery through both WebSockets (for online users) and email with attachments (for offline users).

The system is built on a production-grade architecture — containerised with Docker, backed by a managed cloud database, and driven by an asynchronous task queue — making it ready to scale from a single department to a campus-wide deployment.

**Future Scope:**
- Mobile application (React Native) with push notifications for leave status updates
- Integration with the university's academic calendar for automatic leave-day calculations
- AI-powered leave pattern analysis to flag unusual behaviour for admin review
- SMS fallback via Twilio for critical notifications when email is unavailable
- Single Sign-On (SSO) integration with institutional Google Workspace accounts

---

## 10. Outcomes

| Outcome Type | Details |
|-------------|---------|
| **Product Development** | ✅ Fully functional working prototype deployed via Docker Compose, tested end-to-end across all five user roles |
| **Paper Publication** | 🔲 Scope for publication in an IEEE / Springer conference under the tracks: *Smart Education Systems*, *Web Technologies*, or *Campus Automation* |
| **Open Source** | 🔲 Codebase can be open-sourced and adopted by other institutions as a reference implementation |

---

*Documentation prepared for the University Permission & Communication Portal project.*  
*Stack: FastAPI · React · PostgreSQL · Redis · RabbitMQ · Celery · Docker · Supabase*
