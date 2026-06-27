import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv

from app.core.celery_app import celery_app

# Load environment variables (Make sure these are set in your .env file)
load_dotenv()

# Fetch Email Settings
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_USER = os.getenv("SMTP_USER", "your-email@gmail.com") # e.g., college.portal.bot@gmail.com
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "your-app-password") # 16-character App Password
EMAILS_FROM_NAME = os.getenv("EMAILS_FROM_NAME", "College Permission Center")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")


@celery_app.task(name="send_leave_notification", bind=True, max_retries=3)
def send_leave_notification(self, student_email: str, student_name: str, status: str, app_id: int):
    """
    Background task to send an HTML email to the student 
    when their application status changes to APPROVED or REJECTED.
    """
    try:
        print(f"[WORKER] Starting notification process for APP-{app_id} to {student_email}...")
        
        # Determine the color and text based on status
        color = "#10b981" if status == "APPROVED" else "#f43f5e"
        
        # 1. Create the email message container
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"Update on Permission Request: APP-{app_id}"
        msg["From"] = f"{EMAILS_FROM_NAME} <{SMTP_USER}>"
        msg["To"] = student_email

        # 2. Design a clean HTML email template
        html_content = f"""
        <html>
          <body style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 20px;">
            <div style="max-w: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
              <div style="background-color: #0f172a; padding: 20px; text-align: center;">
                <h2 style="color: white; margin: 0; font-size: 24px;">Permission Center</h2>
              </div>
              <div style="padding: 30px; color: #334155;">
                <p style="font-size: 16px;">Hello <strong>{student_name}</strong>,</p>
                <p style="font-size: 16px;">Your permission request <strong>(APP-{app_id})</strong> has been processed by the reviewing authority.</p>
                
                <div style="margin: 30px 0; padding: 15px; border-left: 4px solid {color}; background-color: #f1f5f9; border-radius: 4px;">
                  <p style="margin: 0; font-size: 14px; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">Current Status</p>
                  <p style="margin: 5px 0 0 0; font-size: 20px; font-weight: bold; color: {color};">{status}</p>
                </div>
                
                <p style="font-size: 14px; line-height: 1.5;">Please log in to your student portal to view the full details, authority remarks, or to download your official approval letter.</p>
                
                <a href="{FRONTEND_URL}/login" style="display: inline-block; margin-top: 20px; padding: 12px 24px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">Access Student Portal</a>
              </div>
              <div style="background-color: #f1f5f9; padding: 15px; text-align: center; color: #94a3b8; font-size: 12px;">
                This is an automated message from the College Permission Management System. Please do not reply to this email.
              </div>
            </div>
          </body>
        </html>
        """

        part = MIMEText(html_content, "html")
        msg.attach(part)

        # 3. Connect to the SMTP server and send
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_USER, student_email, msg.as_string())
            
        print(f"[WORKER] Email sent successfully to {student_email}")
        return {"status": "success", "processed_app_id": app_id}

    except Exception as exc:
        print(f"[WORKER] Failed to send email to {student_email}: {str(exc)}")
        # If it fails, tell Celery to try again later (up to 3 times, 60 seconds apart)
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(name="send_faculty_action_email", bind=True, max_retries=3)
def send_faculty_action_email(
    self, faculty_email: str, faculty_name: str, student_name: str, app_id: int, 
    approve_token: str, reject_token: str,
    leave_type: str = "Leave", from_date: str = "N/A", to_date: str = "N/A", reason: str = "N/A",
    proctor_remarks: str = ""
):
    """
    Sends the Actionable Email to the Faculty/Proctor with the Magic Deep Links
    and now includes the specific details and Proctor Remarks natively!
    """
    try:
        print(f"[WORKER] Sending Actionable Email to faculty {faculty_email} for APP-{app_id}...")
        
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"Action Required: Permission Request APP-{app_id}"
        msg["From"] = f"{EMAILS_FROM_NAME} <{SMTP_USER}>"
        msg["To"] = faculty_email

        # The URLs that point to our new React QuickAction page with the secure JWT tokens
        approve_url = f"{FRONTEND_URL}/action?token={approve_token}&action=APPROVED"
        reject_url = f"{FRONTEND_URL}/action?token={reject_token}&action=REJECTED"

        # Dynamically build the remarks row ONLY if remarks exist
        remarks_row = ""
        if proctor_remarks:
            remarks_row = f"""
            <tr>
              <td style="font-weight: bold; color: #4f46e5; vertical-align: top; padding-top: 12px; border-top: 1px solid #e2e8f0;">Proctor Notes:</td>
              <td style="line-height: 1.4; padding-top: 12px; border-top: 1px solid #e2e8f0; font-style: italic; color: #334155;">{proctor_remarks}</td>
            </tr>
            """

        html_content = f"""
        <html>
          <body style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 20px;">
            <div style="max-w: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
              <div style="background-color: #4f46e5; padding: 20px; text-align: center;">
                <h2 style="color: white; margin: 0; font-size: 20px;">Action Required</h2>
              </div>
              <div style="padding: 30px; color: #334155;">
                <p style="font-size: 16px; margin-bottom: 20px;">Hello <strong>{faculty_name}</strong>,</p>
                <p style="font-size: 16px;"><strong>{student_name}</strong> has submitted a new permission request (APP-{app_id}) that requires your review.</p>
                
                <!-- NEW DETAILS BOX -->
                <div style="background-color: #f1f5f9; padding: 20px; border-radius: 8px; margin: 25px 0; border: 1px solid #e2e8f0;">
                  <h3 style="margin: 0 0 15px 0; color: #1e293b; font-size: 15px; border-bottom: 1px solid #cbd5e1; padding-bottom: 8px; text-transform: uppercase; letter-spacing: 1px;">Request Details</h3>
                  <table style="width: 100%; font-size: 14px; color: #475569;" cellpadding="6" cellspacing="0">
                    <tr>
                      <td style="width: 25%; font-weight: bold; color: #0f172a;">Type:</td>
                      <td>{leave_type}</td>
                    </tr>
                    <tr>
                      <td style="font-weight: bold; color: #0f172a;">Timeline:</td>
                      <td>{from_date} to {to_date}</td>
                    </tr>
                    <tr>
                      <td style="font-weight: bold; color: #0f172a; vertical-align: top; padding-bottom: 12px;">Reason:</td>
                      <td style="line-height: 1.4; padding-bottom: 12px;">{reason}</td>
                    </tr>
                    {remarks_row}
                  </table>
                </div>
                
                <div style="margin: 30px 0; text-align: center;">
                  <a href="{approve_url}" style="display: inline-block; margin: 5px; padding: 14px 28px; background-color: #10b981; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">✅ Approve Request</a>
                  <a href="{reject_url}" style="display: inline-block; margin: 5px; padding: 14px 28px; background-color: #f43f5e; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">❌ Reject Request</a>
                </div>
                
                <p style="font-size: 13px; color: #64748b; line-height: 1.5; text-align: center;">Clicking a button will securely open a quick-action page where you can leave optional remarks before finalizing.</p>
              </div>
            </div>
          </body>
        </html>
        """
        
        part = MIMEText(html_content, "html")
        msg.attach(part)

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_USER, faculty_email, msg.as_string())
            
        print(f"[WORKER] Actionable Email sent successfully to {faculty_email}")
        return {"status": "success", "processed_app_id": app_id}

    except Exception as exc:
        print(f"[WORKER] Failed to send actionable email to {faculty_email}: {str(exc)}")
        raise self.retry(exc=exc, countdown=60)