# Changelog

All notable changes to the Project & Task Management System will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-11-19

Initial enterprise release of the Project & Task Management System, fully deployed on Cloudflare Workers, D1, R2, and Durable Objects.

### Authentication & Access Control (RBAC)

- **Email & Password Authentication**: Secure password login with PBKDF2 key derivation (100,000 iterations) and session cookie validation.
- **Single Sign-On (SSO)**: Google and Microsoft Entra OAuth 2.0 / OpenID Connect integration with automatic account linking.
- **System Role Hierarchy**: Granular roles (`ADMIN`, `PM`, `MEMBER`) with last-admin preservation guards preventing lockout.
- **User Invitation Lifecycle**: Admin user invitations with secure tokens, expiration handling, and transactional account acceptance.
- **User Profile Management**: Self-service profile updates, password modification, and avatar image uploads stored in Cloudflare R2.
- **Layout Separation & Route Protection**: Strict isolation between Admin and Member workspace shells, returning explicit 403 Forbidden pages for unauthorized operations and 404 Not Found for non-member resources.

### Project & Membership Management

- **Project Governance**: Project creation, lifecycle states, archiving, and configurable metadata.
- **Access Control & Visibility**: Public and private project visibility models with automatic permission enforcement.
- **Project Roles**: Scoped project-level roles (`PROJECT_MANAGER`, `TECH_LEAD`, `DEVELOPER`) with a last-PM protection rule.
- **Membership Operations**: Member invitation, role reassignment, and removal with transactional notifications.

### Tasks, Sprints & Organization

- **Task Management**: Project-scoped sequential task numbering, title, rich description, priorities, and assignments.
- **Optimistic Concurrency Control**: Atomic version guards on task mutations preventing conflicting updates.
- **Sub-task Checklists**: Creation, completion toggling, and automated completion percentage calculation.
- **Sprint Management**: Sprint planning, date windows, active sprint tracking, and task sprint assignment with archived sprint protection.
- **Work Item Filtering**: URL-persisted multi-attribute task filtering by assignee, status, priority, and date ranges.
- **Cascading Archival**: Atomic archiving of tasks with automatic sub-task cascade.

### Workflows, Approvals & Collaboration

- **Workflow State Engine**: Configurable status definitions and transition rules across task life cycles.
- **Approval & Rejection Workflows**: Formal review workflows requiring mandatory rejection remarks and status updates.
- **Threaded Discussions**: Nested comment threads on tasks with mention support and realtime notification delivery.
- **File Attachments**: Direct attachment uploads and downloads backed by Cloudflare R2 object storage with project boundary validation.
- **Audit Logging**: Comprehensive system and project audit trails recording timestamped operational history.

### Realtime & Notifications

- **Notification Center**: User notification feed with read/unread tracking and quick navigation to referenced items.
- **Real-Time WebSockets**: Instant push notifications via Cloudflare Durable Objects (`UserNotificationHub`) maintaining persistent bidirectional connection state.

### Scheduled Automation & External Integrations

- **Transactional Outbox Engine**: Reliable background job execution using the outbox pattern with exponential backoff and recovery for stuck jobs.
- **Slack Integration**: Automatic notifications to configured project channels for task creation and updates, with threaded Slack discussions.
- **Email Reminders**: Automated deadline alert scan sending email reminders for impending task due dates.
- **System Maintenance Cron**: Periodic cleanup purging orphaned R2 files and expired invitation tokens.

### Dashboards, Reports & Data Export

- **Personal Workspace Dashboard**: Overview of assigned tasks, approaching deadlines, and at-risk project alerts.
- **Overdue Tasks Monitor**: Dedicated widget displaying overdue tickets prioritized by severity.
- **Interactive Calendar**: Responsive calendar views (day, week, month) rendering task spans and due dates.
- **Performance Analytics**: SQL aggregation for member task distributions and project sprint metrics.
- **Data Export**: Structured task exports supporting CSV and spreadsheet data generation.

### Internationalization (i18n)

- **Bilingual Interface**: Comprehensive English (`en`) and Vietnamese (`vi`) localization across all routes, modals, and tables.
- **Zero-Flash SSR**: Language resolution via persistent cookie on server entry, rendering localized HTML without hydration mismatch.
- **Compile-Time Safety**: Strong typing for translation keys via `CustomTypeOptions` and automated CI audits catching missing, duplicate, or unused translation keys.
- **Error Localization**: Domain and validation errors carry localized translation keys alongside canonical error messages.

### Quality Assurance & Reliability

- **Permission Test Suite**: Table-driven matrix tests validating role combinations and strict 404 security checks for non-members.
- **End-to-End Test Suite**: Complete Playwright automated test coverage across critical user journeys (1 through 8).
- **Regression Prevention Map**: Systematic mapping and test coverage for all architecture review lessons.
- **Automated Git Verification**: Pre-commit linting, formatting, spell checking, and pre-push branch protections.
