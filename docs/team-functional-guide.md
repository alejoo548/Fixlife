# Fixlife Team Functional Guide

Use this guide before demos, evaluations, or code reviews. Every team member should be able to explain the main flows without depending on one person.

## Client Flow

- Register with valid first name, last name, `.com` email, phone number, username, and password.
- Sign in and manage profile data.
- Browse active services only.
- Create a service request with service, description, location, images, budget, and schedule when applicable.
- Track request status until worker assignment, payment, completion, and rating.
- Use request chat and history when a worker is assigned.

## Worker Flow

- Register as a Pro with valid personal data.
- Select 1 to 3 active specialties.
- Verify email with OTP.
- Upload required documents as PDF, JPG, PNG, WEBP, or AVIF.
- Wait for admin approval before receiving client requests.
- Manage availability, profile, portfolio, requests, chat, route, service progress, and earnings.
- Continue working approved services even if a new service request is pending review.

## Admin Flow

- Review dashboard metrics, users, professionals, services, requests, finances, support, and activity.
- Approve or reject pending workers after checking documents.
- Create, edit, activate, and deactivate services.
- Only root can permanently delete a service, and only when it has no workers, requests, homepage cards, or rules attached.
- Deactivated services stop appearing for new client requests, but workers and historical requests remain safe.
- Monitor admin activity and support reports.

## Validation Rules To Know

- First and last names: letters and spaces only, 2 to 16 characters, normalized with first letter uppercase.
- Email: valid `.com` address.
- Phone: exactly 8 digits, displayed as `6074-6649`.
- Worker specialties: minimum 1, maximum 3.
- Service name and description: letters and spaces only.
- Documents: PDF and supported image files are accepted where verification documents are required.

## Demo Checklist

- Register a client and verify profile data appears correctly.
- Register a worker, select no more than 3 services, upload documents, and confirm pending review.
- Approve the worker from admin.
- Create a client request for an active service.
- Confirm the worker can see and manage the request.
- Deactivate a service and confirm it disappears for new client requests without deleting workers or history.
- Try invalid textboxes: numbers in names, non `.com` email, wrong phone length, too many worker services.
