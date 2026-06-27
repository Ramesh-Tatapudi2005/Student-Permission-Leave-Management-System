from fastapi import WebSocket
from typing import Dict, Any

class ConnectionManager:
    def __init__(self):
        # We store connections with their routing metadata
        # Format: {"23A91A0501": {"ws": WebSocket, "role": "STUDENT", "dept": "CSE", "year": 3, "proctor_id": "EMP113"}}
        self.active_connections: Dict[str, Dict[str, Any]] = {}

    async def connect(self, websocket: WebSocket, user_id: str, role: str, dept: str, year: int = None, proctor_id: str = None):
        """Accepts the connection and stores the user's complete routing matrix."""
        await websocket.accept()
        self.active_connections[user_id] = {
            "ws": websocket,
            "role": role.upper() if role else "STUDENT",
            "dept": dept.upper() if dept else "ALL",
            "year": year,
            "proctor_id": proctor_id  # We now track who proctors the student
        }
        print(f"[WS] {user_id} connected. Total active: {len(self.active_connections)}")

    def disconnect(self, user_id: str):
        """Removes the connection when the user closes the app/browser."""
        if user_id in self.active_connections:
            del self.active_connections[user_id]
            print(f"[WS] {user_id} disconnected. Total active: {len(self.active_connections)}")

    async def broadcast_announcement(self, payload: dict):
        """
        The Upgraded RBAC Filter Engine: Checks the incoming announcement's 
        target matrix against the connected users.
        """
        target_role = payload.get("target_role", "ALL")
        target_dept = payload.get("target_dept", "ALL")
        target_year = payload.get("target_year", None)
        posted_by = payload.get("posted_by", "")

        for user_id, connection in list(self.active_connections.items()):
            user_role = connection.get("role", "STUDENT")
            user_dept = connection.get("dept", "ALL")
            user_year = connection.get("year", None)
            user_proctor_id = connection.get("proctor_id", None)

            # --- 1. ROLE-BASED ACCESS CONTROL MATRIX ---
            if target_role == "ALL_STAFF":
                if user_role not in ["FACULTY", "HOD", "WARDEN", "ADMIN"]: continue
            elif target_role == "HOD":
                if user_role not in ["HOD", "ADMIN"]: continue
            elif target_role == "PROCTORED_STUDENTS":
                # Only the specific students assigned to the faculty member who sent it
                if user_role != "STUDENT" or user_proctor_id != posted_by: continue
            elif target_role == "STUDENT":
                if user_role != "STUDENT": continue
            elif target_role == "FACULTY":
                if user_role not in ["FACULTY", "HOD", "ADMIN"]: continue

            # --- 2. DEPARTMENT CHECK ---
            # Proctored students inherently bypass dept check. "ALL" bypasses it.
            if target_dept != "ALL" and target_role != "PROCTORED_STUDENTS":
                if user_dept != target_dept and user_role != "ADMIN":
                    continue
            
            # --- 3. YEAR CHECK ---
            # Faculty/HODs have no year (None). We ONLY filter out users based on year
            # if they are specifically a STUDENT. Staff bypass this check.
            
            # FIX: Added check to ensure it doesn't drop broadcasts meant for "ALL" years!
            if target_year is not None and str(target_year).upper() != "ALL" and target_role == "STUDENT":
                if str(user_year) != str(target_year):
                    continue

            # If all checks pass, push the payload to the user in real-time!
            try:
                await connection["ws"].send_json({
                    "type": "NEW_ANNOUNCEMENT",
                    "data": payload
                })
            except Exception as e:
                print(f"[WS] Failed to send to {user_id}, dropping connection. Error: {e}")
                self.disconnect(user_id)

# Create a global instance to be imported across your app
manager = ConnectionManager()