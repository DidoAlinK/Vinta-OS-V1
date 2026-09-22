## Purpose & context
I am building Vinta School OS, a school management SaaS targeting private academies in Algeria (chosen over kindergartens for better budget fit and pain point match). The product lives under the existing Vinta Automation brand at Vintautomation.com to avoid a new domain.

Core MVP scope:
 student management, teacher management, class/room tracking, manual check-in/check-out, week calendar, per-student billing. (Options may be added)

Key product differentiator:
 Per-staff personal PIN on the profile picker — since only that staff member knows their PIN, every logged action (check-in, billing, etc.) is provably attributable to them, turning the activity log into a real accountability guarantee and a core selling point for academy owners.

Design system:
 Glassmorphic iOS-inspired aesthetic — gold + emerald palette, Space Grotesk (headings/numbers) + Inter (body), squircle shapes, light/dark theme toggle, layered CSS/react gloss with panel shadow + diagonal sheen overlay. Source of truth token file: vinta_school_os_dev_reference.html (--gold/--emerald naming convention).
 
 Auth/profile flow:
  Three scenes — auth screen (Log in / Create academy pill toggle), Netflix-style profile picker with squircle avatar tiles + role badges, success screen. Owner/Staff profiles trigger 4-digit PIN modal so no staff are logging as an owner and no staff is logging in the name of other staff.

Notes:
Teacher payout tracking shows totals generated only — app does calculate the teacher's cut based on what the owner profile sets (e.g 30%/student, 1000Da/h, etc)
check-out at scheduled end is automatic. "Is the class done?" Yes/No popup triggers at scheduled class end time.

