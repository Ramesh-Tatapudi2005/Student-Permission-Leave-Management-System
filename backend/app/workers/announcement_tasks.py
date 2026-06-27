import os
import smtplib
import urllib.request
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from dotenv import load_dotenv

from app.core.celery_app import celery_app

load_dotenv()

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
EMAILS_FROM_NAME = os.getenv("EMAILS_FROM_NAME", "University Portal")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

_PRIORITY_META = {
    "EMERGENCY": ("#dc2626", "🚨 EMERGENCY"),
    "HIGH":      ("#f97316", "⚠️ HIGH PRIORITY"),
    "STANDARD":  ("#4f46e5", "📢 ANNOUNCEMENT"),
}

# Stay comfortably under Gmail's 25 MB per-message hard limit
MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024  # 10 MB per file

_FALLBACK_NAMES = {
    "PDF": "attachment.pdf",
    "IMAGE": "attachment.jpg",
    "VIDEO": "attachment.mp4",
    "DOCUMENT": "attachment.docx",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _download_attachments(attachments: list) -> list:
    """
    Download every attachment URL exactly once and return a list of
    (filename, bytes, content_type) tuples. Files that fail or exceed the
    size limit are skipped — the rest of the batch is unaffected.
    """
    results = []
    for att in attachments:
        url = att.get("file_url", "")
        file_type = att.get("file_type", "DOCUMENT")
        if not url:
            continue
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "UniversityPortal/1.0"})
            with urllib.request.urlopen(req, timeout=20) as resp:
                # Reject oversized files before reading the body
                raw_size = resp.headers.get("Content-Length")
                if raw_size and int(raw_size) > MAX_ATTACHMENT_BYTES:
                    print(
                        f"[ANNOUNCE] ✗ Skipped {url} — "
                        f"Content-Length {int(raw_size):,} exceeds limit"
                    )
                    continue

                content_type = (
                    resp.headers.get("Content-Type", "application/octet-stream")
                    .split(";")[0]
                    .strip()
                )
                file_bytes = resp.read()

                # Re-check after read (Content-Length can be absent or wrong)
                if len(file_bytes) > MAX_ATTACHMENT_BYTES:
                    print(
                        f"[ANNOUNCE] ✗ Skipped {url} — "
                        f"actual size {len(file_bytes):,} exceeds limit"
                    )
                    continue

                # Use the filename from the URL path; fall back to type-based name
                filename = url.split("/")[-1].split("?")[0]
                if not filename or "." not in filename:
                    filename = _FALLBACK_NAMES.get(file_type, "attachment.bin")

                results.append((filename, file_bytes, content_type))
                print(f"[ANNOUNCE] ✓ Downloaded: {filename} ({len(file_bytes):,} bytes)")

        except Exception as exc:
            print(f"[ANNOUNCE] ✗ Failed to download {url}: {exc}")

    return results


def _build_email_html(
    recipient_name: str,
    title: str,
    description: str,
    posted_by_name: str,
    posted_role: str,
    priority_level: str,
    target_label: str,
    total_attachments: int,
    attached_count: int,
) -> str:
    color, badge = _PRIORITY_META.get(priority_level.upper(), _PRIORITY_META["STANDARD"])

    # Attachment status note — three states
    attachment_note = ""
    if total_attachments > 0:
        if attached_count == total_attachments:
            attachment_note = f"""
            <div style="margin:18px 0 0;padding:12px 16px;background:#f0fdf4;
                        border:1px solid #bbf7d0;border-radius:8px;
                        font-size:13px;color:#166534;">
              📎 {attached_count} file(s) attached to this email.
            </div>"""
        elif attached_count > 0:
            skipped = total_attachments - attached_count
            attachment_note = f"""
            <div style="margin:18px 0 0;padding:12px 16px;background:#fffbeb;
                        border:1px solid #fde68a;border-radius:8px;
                        font-size:13px;color:#92400e;">
              📎 {attached_count} file(s) attached.&nbsp;
              {skipped} file(s) could not be attached —
              <a href="{FRONTEND_URL}" style="color:{color};font-weight:bold;">
                log in to view →
              </a>
            </div>"""
        else:
            attachment_note = f"""
            <div style="margin:18px 0 0;padding:12px 16px;background:#f8fafc;
                        border:1px dashed #cbd5e1;border-radius:8px;
                        font-size:13px;color:#64748b;">
              📎 This announcement includes {total_attachments} attachment(s).
              <a href="{FRONTEND_URL}" style="color:{color};font-weight:bold;">
                Log in to view →
              </a>
            </div>"""

    return f"""
    <html>
      <body style="font-family:Arial,sans-serif;background:#f1f5f9;padding:24px;margin:0;">
        <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:14px;
                    overflow:hidden;box-shadow:0 6px 20px rgba(0,0,0,0.08);">

          <div style="background:{color};padding:22px 28px;">
            <span style="color:#fff;font-size:13px;font-weight:900;
                         letter-spacing:1.5px;text-transform:uppercase;opacity:.85;">
              {badge}
            </span>
          </div>

          <div style="padding:32px 28px;color:#1e293b;">
            <p style="margin:0 0 6px;font-size:15px;color:#64748b;">
              Hello <strong>{recipient_name}</strong>,
            </p>
            <h2 style="margin:8px 0 20px;font-size:22px;font-weight:900;
                       color:#0f172a;line-height:1.3;">{title}</h2>

            <div style="background:#f8fafc;border-left:4px solid {color};
                        border-radius:0 8px 8px 0;padding:18px 20px;
                        color:#334155;font-size:15px;line-height:1.7;
                        white-space:pre-wrap;">{description}</div>

            {attachment_note}

            <table style="width:100%;margin-top:24px;font-size:13px;color:#64748b;
                          border-top:1px solid #e2e8f0;padding-top:18px;"
                   cellpadding="5" cellspacing="0">
              <tr>
                <td style="font-weight:bold;color:#0f172a;width:38%;">Posted by</td>
                <td>{posted_by_name} ({posted_role})</td>
              </tr>
              <tr>
                <td style="font-weight:bold;color:#0f172a;">Audience</td>
                <td>{target_label}</td>
              </tr>
            </table>

            <a href="{FRONTEND_URL}"
               style="display:inline-block;margin-top:28px;padding:13px 28px;
                      background:{color};color:#fff;text-decoration:none;
                      border-radius:8px;font-weight:bold;font-size:14px;">
              Open Portal →
            </a>
          </div>

          <div style="background:#f1f5f9;padding:14px 28px;text-align:center;
                      color:#94a3b8;font-size:11px;">
            This is an automated notification from the University Announcement System.
            Do not reply to this email.
          </div>
        </div>
      </body>
    </html>
    """


# ---------------------------------------------------------------------------
# Celery task
# ---------------------------------------------------------------------------

@celery_app.task(name="send_announcement_emails", bind=True, max_retries=2)
def send_announcement_emails(
    self,
    recipients: list,
    title: str,
    description: str,
    posted_by_name: str,
    posted_role: str,
    priority_level: str,
    target_label: str,
    attachments: list = None,       # [{"file_url": str, "file_type": str}, ...]
    has_attachments: bool = False,  # kept for backward compat; ignored when attachments is set
):
    """
    Bulk announcement email task.

    Strategy:
    - Downloads all attachment files ONCE before the recipient loop.
    - Uses multipart/mixed when files are present so binary attachments
      sit alongside the HTML body inside the same message.
    - Per-address failures and per-file download failures are logged and
      skipped — they never abort the rest of the batch.
    """
    if attachments is None:
        attachments = []

    if not recipients:
        print("[ANNOUNCE] No recipients — nothing to send.")
        return {"status": "skipped", "reason": "empty recipients"}

    total_attachments = len(attachments)

    # --- Step 1: pre-fetch all files once ---
    downloaded_files: list[tuple] = []
    if attachments:
        print(f"[ANNOUNCE] Pre-fetching {total_attachments} attachment(s)...")
        downloaded_files = _download_attachments(attachments)
        print(
            f"[ANNOUNCE] {len(downloaded_files)}/{total_attachments} "
            "attachment(s) ready to embed."
        )

    attached_count = len(downloaded_files)

    print(
        f"[ANNOUNCE] Sending '{title}' to {len(recipients)} recipient(s) "
        f"with {attached_count} attachment(s)..."
    )
    sent, failed = 0, 0

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)

            for r in recipients:
                name = r.get("name", "User")
                email_addr = r.get("email", "")
                if not email_addr:
                    continue

                try:
                    html_body = _build_email_html(
                        recipient_name=name,
                        title=title,
                        description=description,
                        posted_by_name=posted_by_name,
                        posted_role=posted_role,
                        priority_level=priority_level,
                        target_label=target_label,
                        total_attachments=total_attachments,
                        attached_count=attached_count,
                    )

                    if downloaded_files:
                        # multipart/mixed  →  alternative (HTML)  +  binary parts
                        outer = MIMEMultipart("mixed")
                        outer["Subject"] = f"[{priority_level}] {title}"
                        outer["From"] = f"{EMAILS_FROM_NAME} <{SMTP_USER}>"
                        outer["To"] = email_addr

                        body_wrapper = MIMEMultipart("alternative")
                        body_wrapper.attach(MIMEText(html_body, "html"))
                        outer.attach(body_wrapper)

                        for filename, file_bytes, content_type in downloaded_files:
                            main_type, sub_type = (
                                content_type.split("/", 1)
                                if "/" in content_type
                                else ("application", "octet-stream")
                            )
                            file_part = MIMEBase(main_type, sub_type)
                            file_part.set_payload(file_bytes)
                            encoders.encode_base64(file_part)
                            file_part.add_header(
                                "Content-Disposition", "attachment", filename=filename
                            )
                            outer.attach(file_part)

                        msg = outer

                    else:
                        # HTML-only — plain alternative message
                        msg = MIMEMultipart("alternative")
                        msg["Subject"] = f"[{priority_level}] {title}"
                        msg["From"] = f"{EMAILS_FROM_NAME} <{SMTP_USER}>"
                        msg["To"] = email_addr
                        msg.attach(MIMEText(html_body, "html"))

                    server.sendmail(SMTP_USER, email_addr, msg.as_string())
                    sent += 1

                except Exception as addr_err:
                    print(f"[ANNOUNCE] ✗ Failed to send to {email_addr}: {addr_err}")
                    failed += 1

    except Exception as smtp_err:
        print(f"[ANNOUNCE] SMTP session failed: {smtp_err}")
        raise self.retry(exc=smtp_err, countdown=120)

    print(f"[ANNOUNCE] Done — sent={sent}, failed={failed}")
    return {"status": "done", "sent": sent, "failed": failed}
