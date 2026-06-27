import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv

load_dotenv()

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
EMAILS_FROM_NAME = os.getenv("EMAILS_FROM_NAME", "University Portal")


def send_otp_email(to_email: str, recipient_name: str, otp_code: str) -> None:
    """Send a password-change OTP email synchronously. Raises on SMTP failure."""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Your Password Change OTP — University Portal"
    msg["From"] = f"{EMAILS_FROM_NAME} <{SMTP_USER}>"
    msg["To"] = to_email

    html_content = f"""
    <html>
      <body style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 20px; margin: 0;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px;
                    overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.07);">

          <div style="background-color: #0f172a; padding: 24px; text-align: center;">
            <h2 style="color: white; margin: 0; font-size: 22px; letter-spacing: 0.5px;">
              University Portal — Security Alert
            </h2>
          </div>

          <div style="padding: 36px 30px; color: #334155;">
            <p style="font-size: 16px; margin-top: 0;">Hello <strong>{recipient_name}</strong>,</p>
            <p style="font-size: 15px; line-height: 1.6;">
              We received a request to change the password on your account.
              Use the OTP below to complete the process. This code is valid for
              <strong>10 minutes</strong>.
            </p>

            <div style="margin: 32px 0; text-align: center;">
              <div style="display: inline-block; background: #f1f5f9; border: 2px dashed #94a3b8;
                          border-radius: 12px; padding: 20px 40px;">
                <p style="margin: 0; font-size: 11px; color: #64748b; text-transform: uppercase;
                           letter-spacing: 2px; font-weight: bold;">Your OTP Code</p>
                <p style="margin: 8px 0 0; font-size: 42px; font-weight: 900; color: #4f46e5;
                           letter-spacing: 10px; font-family: monospace;">{otp_code}</p>
              </div>
            </div>

            <p style="font-size: 14px; color: #64748b; line-height: 1.6;">
              If you did <strong>not</strong> request a password change, please ignore this email.
              Your account password will remain unchanged.
            </p>
          </div>

          <div style="background-color: #f1f5f9; padding: 16px; text-align: center;
                      color: #94a3b8; font-size: 12px;">
            This is an automated security email from the University Permission System.
            Do not reply.
          </div>
        </div>
      </body>
    </html>
    """

    msg.attach(MIMEText(html_content, "html"))

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.sendmail(SMTP_USER, to_email, msg.as_string())
