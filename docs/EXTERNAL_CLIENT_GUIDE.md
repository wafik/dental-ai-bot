# Dental Clinic Conversational AI — Clinic Owner & Practice Manager Guide

Welcome to the **BrightSmile Dental AI Appointment System**! This guide is designed for clinic owners, dental practice managers, and reception staff. It explains how the AI assistant works, how it grows your practice revenue, and how to connect your existing clinic calendars.

---

## 1. What is the Dental AI Assistant?

The Dental AI Assistant is a web-based appointment assistant with conversational voice and text chat. Availability depends on the application and its configured providers; telephone-line integration is not included.

### Key Business Benefits for Your Clinic:
1. **Online appointment enquiries:** Patients can use chat or browser voice when the service and its providers are available.
2. **Calendar-aware scheduling:** The assistant checks the configured dentist calendars and writes bookings to the selected Google Calendar or Microsoft Outlook provider. It does not update both providers simultaneously. An unconfigured calendar can fall back to a mock provider and does not sync externally; verify configuration before accepting real bookings.
3. **Smart Doctor Assignment:** 
   * Simple checkups and extractions can be assigned to your Junior Dentist.
   * Complex treatments (Root Canals, Crowns, Implants) are automatically reserved exclusively for your Senior Specialists.
4. **Frees Up Your Reception Team:** Routine questions ("Where are you located?", "What are your hours?", "How long does a cleaning take?") are handled automatically, allowing your in-office team to focus on in-person patient care.

---

## 2. Supported Dental Services & Automatic Doctor Matching

Your AI receptionist is pre-programmed with your clinic's service catalog and rules:

| Service Name | Description | Duration | Eligible Dentists |
| :--- | :--- | :--- | :--- |
| **Service A** | General Checkup & Cleaning | 1 Hour | Dr. Junior, Dr. Senior 1, Dr. Senior 2 |
| **Service B** | Simple Tooth Extraction | 1 Hour | Dr. Junior, Dr. Senior 1, Dr. Senior 2 |
| **Service C** | Root Canal Treatment | 2.5 Hours | Dr. Senior 1, Dr. Senior 2 (Specialists only) |
| **Service D** | Dental Crown / Veneer | 2 Hours | Dr. Senior 1, Dr. Senior 2 (Specialists only) |
| **Service E** | Full Mouth Implant Surgery | 6 Hours | Dr. Senior 1, Dr. Senior 2 (Requires 6 continuous hours) |

> **Safety Notice:** If a patient asks Dr. Junior to perform a Root Canal or Implant Surgery, the AI will politely explain clinic policy and book the appointment with Dr. Senior 1 or Dr. Senior 2 instead.

---

## 3. How to Connect Your Clinic Calendars

The system supports both **Google Calendar** (Google Workspace) and **Microsoft Outlook** (Microsoft 365).
All configuration is done from the **Admin Console** at `/admin` — no code changes or redeployment required.

### Option A: Connecting Google Calendar

1. **Create or Open Your Doctor Calendars in Google Calendar:**
   * Make sure each dentist has a dedicated calendar (e.g., `Dr. Junior - Clinic`, `Dr. Senior 1 - Clinic`, `Dr. Senior 2 - Clinic`).
2. **Find Your Calendar IDs:**
   * In Google Calendar, click the 3 dots next to the doctor's calendar → **Settings and sharing**.
   * Scroll down to **Integrate calendar** and copy the **Calendar ID** (looks like `clinic-junior@group.calendar.google.com`).
3. **Grant Access to the AI Assistant:**
   * Under **Share with specific people or groups**, add the AI service account or system email address with **Make changes to events** permission.
4. **Enter the details in the Admin Console:**
   * Sign in at `/admin`, select **Google Calendar** as the active provider.
   * Paste the Calendar ID for each dentist under **Dentist Calendar Mappings**.
   * Under **Credentials**, choose one authentication method:
     * **Service account (recommended for clinics):** enter the **Service Account Email** and **Service Account Private Key** from the downloaded JSON key file (the `client_email` and `private_key` values).
     * **Delegated OAuth:** enter the Google Client ID, Client Secret, and Refresh Token.
   * Save, then click **Test connection**.

> **Important:** a service account can only see calendars that were explicitly shared with it.
> Share every dentist calendar with the service account email using **Make changes to events**.
> If the calendars are not shared, the connection test passes but bookings cannot be written.

---

### Option B: Connecting Microsoft Outlook / Microsoft 365

If your clinic uses Microsoft 365 Outlook:

1. **Verify Dentist Email Addresses:**
   * Note the Microsoft 365 email addresses of your doctors (e.g., `junior@brightsmileclinic.com`, `senior1@brightsmileclinic.com`).
2. **Authorise the Dental AI App in Entra ID:**
   * Your clinic IT administrator grants the application permission to read and write calendar events (`Calendars.ReadWrite`).
3. **Enter the details in the Admin Console:**
   * Sign in at `/admin`, select **Microsoft Outlook** as the active provider.
   * Enter the Tenant ID, Client ID, Client Secret, and Refresh Token, plus each dentist's calendar address, then save.

> **About stored credentials:** Saved secrets are encrypted before they are written to the database
> and are never displayed again. The field only shows whether a secret is already configured;
> the eye icon reveals text you are currently typing, never the stored value. Leaving a credential
> field empty keeps the previously saved secret unchanged.

With a correctly configured provider, bookings are written to the selected calendar. Verify calendar access and synchronization before relying on it for patient appointments.

---

## 4. Using the Clinic Staff Dashboard

Your clinic staff can monitor appointments in real time via the web portal:

1. **Real-Time Dentist Schedule Matrix:**
   * Click the **Dentist Schedules** tab.
   * View today's or any future date's bookings across Dr. Junior, Dr. Senior 1, and Dr. Senior 2.
   * Click **Refresh** at any time to pull the latest calendar updates.
2. **Real-Time Voice Assistant:**
   * Patients or staff can click **Start Voice Call** to test or make appointments using natural conversational speech.
   * Works on any computer, tablet, or smartphone with a microphone.
3. **AI Text Chat:**
   * Patients who prefer typing can use the chat window. They can ask questions, verify open time slots, and receive instant confirmation.
   * New assistant replies are read aloud by default. Use **Auto-read on/off** in the chat header to disable or re-enable speech. Each reply also has a **Read aloud** button for manual playback or retry if automatic playback is blocked.

### Optional Kokoro Text-to-Speech Service

Text-to-speech runs through a separate Kokoro service; it is not bundled into the web app. Configure these server-side environment variables:

```env
KOKORO_TTS_BASE_URL=http://localhost:8880/v1
KOKORO_TTS_VOICE=af_heart
```

The base URL must be reachable from the Next.js server and expose Kokoro-FastAPI's OpenAI-compatible `POST /audio/speech` endpoint (the full path is `/v1/audio/speech`). Set the voice to any voice supported by your Kokoro deployment. HTTPS is required except for loopback development URLs (`localhost`, `127.0.0.1`, or `::1`). Keep this service on a trusted network. If it is unavailable, chat replies remain visible and can be retried when the service is restored. Generated audio is not stored by the application.

---

## 5. Frequently Asked Questions (FAQ)

#### Q1: What happens if a patient asks for medical advice or an antibiotic prescription?
**Answer:** The AI is instructed not to provide diagnoses or prescriptions, but its responses are not guaranteed. A suitable response would be:
> *"I am an automated scheduling assistant and cannot provide medical diagnoses or prescribe medications. Please discuss your symptoms with our dentist during your appointment, or seek emergency medical attention if you are in severe pain."*

#### Q2: Can a patient book an appointment outside clinic hours?
**Answer:** No. Clinic hours are strictly enforced from **09:00 AM to 05:00 PM (09:00 - 17:00)**. The AI will never book an appointment that starts before 09:00 or ends after 17:00.

#### Q3: What happens if a doctor adds an appointment directly into Google or Outlook?
**Answer:** When the selected calendar provider is correctly configured and reachable, its busy intervals are checked before offering slots. The mock fallback cannot see external events, so it must not be relied on for real appointments.

#### Q4: How does the AI handle patient cancellations?
**Answer:** The assistant can cancel a local appointment using its appointment ID. Cancellation does not currently delete the corresponding external calendar event, so clinic staff must update that calendar manually; the slot may remain unavailable until they do.

---

## 6. Support and Emergency Escalation

If your staff needs to modify appointment rules or requires technical support:
* **Practice Support Hotline:** support@brightsmileclinic.com
* **Admin Documentation:** See `docs/INTERNAL_ARCHITECTURE_AND_COST.md` for technical specifications and cloud API configurations.
